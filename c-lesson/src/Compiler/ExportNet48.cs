using System.IO.Compression;
using System.Text;

namespace CLesson.Compiler
{
    public static partial class CodeTools
    {
        /// <summary>
        /// Projeyi Visual Studio 2019/2022'de açılan klasik ".NET Framework 4.8" Windows Forms projesi olarak paketler
        /// (kitaptaki düzen: App.config, References, NuGet paketleri, Entity Framework .edmx).
        /// </summary>
        public static byte[] ExportZipNet48(ProjectInput project)
        {
            string ns = project.Namespace;
            string safeName = SafeFileName(string.IsNullOrWhiteSpace(project.Name) ? "Proje" : project.Name);
            var sources = project.SourceFiles.Where(f => f.Name != ProjectCompiler.HiddenFileName).ToList();
            var refs = project.References ?? new();
            bool mysql = refs.Any(r => r.Equals("MySql.Data", StringComparison.OrdinalIgnoreCase));
            bool ef = refs.Any(r => r.Equals("EntityFramework", StringComparison.OrdinalIgnoreCase));
            var edmx = project.Files.Where(f => f.Name.EndsWith(".edmx", StringComparison.OrdinalIgnoreCase)).ToList();
            var appConfig = project.Files.FirstOrDefault(f => f.Name.Equals("App.config", StringComparison.OrdinalIgnoreCase))?.Content
                ?? project.DataFiles?.FirstOrDefault(f => f.Name.Equals("App.config", StringComparison.OrdinalIgnoreCase))?.Content;
            appConfig = EnsureStartup(appConfig);
            var dataFiles = (project.DataFiles ?? new()).Where(f => !f.Name.EndsWith(".sql", StringComparison.OrdinalIgnoreCase) && !f.Name.Equals("App.config", StringComparison.OrdinalIgnoreCase)).ToList();
            string projGuid = StableGuid("proje:" + ns).ToUpperInvariant();
            string slnGuid = StableGuid("cozum:" + ns).ToUpperInvariant();

            var x = new StringBuilder();
            x.AppendLine("<?xml version=\"1.0\" encoding=\"utf-8\"?>");
            x.AppendLine("<Project ToolsVersion=\"15.0\" xmlns=\"http://schemas.microsoft.com/developer/msbuild/2003\">");
            x.AppendLine("  <Import Project=\"$(MSBuildExtensionsPath)\\$(MSBuildToolsVersion)\\Microsoft.Common.props\" Condition=\"Exists('$(MSBuildExtensionsPath)\\$(MSBuildToolsVersion)\\Microsoft.Common.props')\" />");
            x.AppendLine("  <PropertyGroup>");
            x.AppendLine("    <Configuration Condition=\" '$(Configuration)' == '' \">Debug</Configuration>");
            x.AppendLine("    <Platform Condition=\" '$(Platform)' == '' \">AnyCPU</Platform>");
            x.AppendLine("    <ProjectGuid>{" + projGuid + "}</ProjectGuid>");
            x.AppendLine("    <OutputType>WinExe</OutputType>");
            x.AppendLine("    <RootNamespace>" + ns + "</RootNamespace>");
            x.AppendLine("    <AssemblyName>" + ns + "</AssemblyName>");
            x.AppendLine("    <TargetFrameworkVersion>v4.8</TargetFrameworkVersion>");
            x.AppendLine("    <FileAlignment>512</FileAlignment>");
            x.AppendLine("    <AutoGenerateBindingRedirects>true</AutoGenerateBindingRedirects>");
            x.AppendLine("    <Deterministic>true</Deterministic>");
            x.AppendLine("    <!-- Web ortamındaki gibi yeni C# özellikleri (global using vb.) -->");
            x.AppendLine("    <LangVersion>latest</LangVersion>");
            x.AppendLine("    <RestoreProjectStyle>PackageReference</RestoreProjectStyle>");
            x.AppendLine("  </PropertyGroup>");
            foreach (var (cfg, debug) in new[] { ("Debug", true), ("Release", false) })
            {
                x.AppendLine("  <PropertyGroup Condition=\" '$(Configuration)|$(Platform)' == '" + cfg + "|AnyCPU' \">");
                x.AppendLine("    <PlatformTarget>AnyCPU</PlatformTarget>");
                if (debug) x.AppendLine("    <DebugSymbols>true</DebugSymbols>");
                x.AppendLine("    <DebugType>" + (debug ? "full" : "pdbonly") + "</DebugType>");
                x.AppendLine("    <Optimize>" + (debug ? "false" : "true") + "</Optimize>");
                x.AppendLine("    <OutputPath>bin\\" + cfg + "\\</OutputPath>");
                x.AppendLine("    <DefineConstants>" + (debug ? "DEBUG;TRACE" : "TRACE") + "</DefineConstants>");
                x.AppendLine("    <ErrorReport>prompt</ErrorReport>");
                x.AppendLine("    <WarningLevel>4</WarningLevel>");
                x.AppendLine("  </PropertyGroup>");
            }
            x.AppendLine("  <ItemGroup>");
            foreach (var r in new[] { "System", "System.Configuration", "System.Core", "System.Xml.Linq", "System.Data.DataSetExtensions", "Microsoft.CSharp", "System.Data", "System.Deployment", "System.Drawing", "System.Net.Http", "System.Windows.Forms", "System.Xml" })
                x.AppendLine("    <Reference Include=\"" + r + "\" />");
            if (ef) { x.AppendLine("    <Reference Include=\"System.ComponentModel.DataAnnotations\" />"); x.AppendLine("    <Reference Include=\"System.Runtime.Serialization\" />"); x.AppendLine("    <Reference Include=\"System.Security\" />"); }
            x.AppendLine("  </ItemGroup>");
            x.AppendLine("  <ItemGroup>");
            foreach (var f in sources.OrderBy(f => f.Name, StringComparer.OrdinalIgnoreCase))
            {
                string path = f.Name.Replace('/', '\\');
                string baseName = Path.GetFileNameWithoutExtension(f.Name);
                bool isDesigner = f.Name.EndsWith(".Designer.cs", StringComparison.OrdinalIgnoreCase);
                bool isForm = !isDesigner && sources.Any(d => d.Name.Equals(baseName + ".Designer.cs", StringComparison.OrdinalIgnoreCase)) && (f.Content ?? "").Contains(": Form");
                if (isForm) { x.AppendLine("    <Compile Include=\"" + path + "\">"); x.AppendLine("      <SubType>Form</SubType>"); x.AppendLine("    </Compile>"); }
                else if (isDesigner && sources.Any(d => d.Name.Equals(f.Name.Substring(0, f.Name.Length - ".Designer.cs".Length) + ".cs", StringComparison.OrdinalIgnoreCase)))
                {
                    x.AppendLine("    <Compile Include=\"" + path + "\">");
                    x.AppendLine("      <DependentUpon>" + f.Name.Substring(0, f.Name.Length - ".Designer.cs".Length) + ".cs</DependentUpon>");
                    x.AppendLine("    </Compile>");
                }
                else x.AppendLine("    <Compile Include=\"" + path + "\" />");
            }
            x.AppendLine("    <Compile Include=\"GlobalUsings.cs\" />");
            x.AppendLine("    <Compile Include=\"Properties\\AssemblyInfo.cs\" />");
            x.AppendLine("  </ItemGroup>");
            x.AppendLine("  <ItemGroup>");
            x.AppendLine("    <None Include=\"App.config\" />");
            foreach (var f in dataFiles)
            {
                x.AppendLine("    <None Include=\"" + f.Name + "\">");
                x.AppendLine("      <CopyToOutputDirectory>PreserveNewest</CopyToOutputDirectory>");
                x.AppendLine("    </None>");
            }
            x.AppendLine("  </ItemGroup>");
            if (edmx.Count > 0)
            {
                x.AppendLine("  <ItemGroup>");
                foreach (var e in edmx)
                {
                    x.AppendLine("    <EntityDeploy Include=\"" + e.Name + "\">");
                    x.AppendLine("      <Generator>EntityModelCodeGenerator</Generator>");
                    x.AppendLine("    </EntityDeploy>");
                }
                x.AppendLine("  </ItemGroup>");
            }
            if (mysql || ef)
            {
                x.AppendLine("  <ItemGroup>");
                if (mysql) PackageRef(x, "MySql.Data", "8.0.33");
                if (ef) { PackageRef(x, "EntityFramework", "6.4.4"); PackageRef(x, "MySql.Data.EntityFramework", "8.0.33"); }
                x.AppendLine("  </ItemGroup>");
            }
            x.AppendLine("  <Import Project=\"$(MSBuildToolsPath)\\Microsoft.CSharp.targets\" />");
            x.AppendLine("</Project>");

            using var ms = new MemoryStream();
            using (var zip = new ZipArchive(ms, ZipArchiveMode.Create, leaveOpen: true))
            {
                void Add(string path, string content)
                {
                    var entry = zip.CreateEntry(safeName + "/" + path, CompressionLevel.Optimal);
                    using var w = new StreamWriter(entry.Open(), new UTF8Encoding(true));
                    w.Write((content ?? "").Replace("\r\n", "\n").Replace("\n", "\r\n"));
                }
                Add(ns + ".csproj", x.ToString());
                var setup = project.Setup;
                string setupName = setup != null ? SafeFileName(string.IsNullOrWhiteSpace(setup.Name) ? ns + "Setup" : setup.Name) : null;
                string setupGuid = setup != null ? StableGuid("setup:" + setupName).ToUpperInvariant() : null;
                Add(ns + ".sln",
                    "\nMicrosoft Visual Studio Solution File, Format Version 12.00\n" +
                    "# Visual Studio Version 16\n" +
                    "VisualStudioVersion = 16.0.30114.105\n" +
                    "MinimumVisualStudioVersion = 10.0.40219.1\n" +
                    "Project(\"{FAE04EC0-301F-11D3-BF4B-00C04F79EFBC}\") = \"" + ns + "\", \"" + ns + ".csproj\", \"{" + projGuid + "}\"\n" +
                    "EndProject\n" +
                    (setup != null ? "Project(\"{54435603-DBB4-11D2-8724-00A0C9A8B90C}\") = \"" + setupName + "\", \"" + setupName + "\\" + setupName + ".vdproj\", \"{" + setupGuid + "}\"\n" + "EndProject\n" : "") +
                    "Global\n" +
                    "\tGlobalSection(SolutionConfigurationPlatforms) = preSolution\n" +
                    "\t\tDebug|Any CPU = Debug|Any CPU\n" +
                    "\t\tRelease|Any CPU = Release|Any CPU\n" +
                    "\tEndGlobalSection\n" +
                    "\tGlobalSection(ProjectConfigurationPlatforms) = postSolution\n" +
                    "\t\t{" + projGuid + "}.Debug|Any CPU.ActiveCfg = Debug|Any CPU\n" +
                    "\t\t{" + projGuid + "}.Debug|Any CPU.Build.0 = Debug|Any CPU\n" +
                    "\t\t{" + projGuid + "}.Release|Any CPU.ActiveCfg = Release|Any CPU\n" +
                    "\t\t{" + projGuid + "}.Release|Any CPU.Build.0 = Release|Any CPU\n" +
                    (setup != null ? "\t\t{" + setupGuid + "}.Debug|Any CPU.ActiveCfg = Debug\n" + "\t\t{" + setupGuid + "}.Release|Any CPU.ActiveCfg = Release\n" : "") +
                    "\tEndGlobalSection\n" +
                    "\tGlobalSection(SolutionProperties) = preSolution\n" +
                    "\t\tHideSolutionNode = FALSE\n" +
                    "\tEndGlobalSection\n" +
                    "\tGlobalSection(ExtensibilityGlobals) = postSolution\n" +
                    "\t\tSolutionGuid = {" + slnGuid + "}\n" +
                    "\tEndGlobalSection\n" +
                    "EndGlobal\n");
                if (setup != null)
                {
                    // Setup projesi: .vdproj + File System düzenleyicisine eklenen dosyalar (ikon vb.)
                    Add(setupName + "/" + setupName + ".vdproj", Vdproj(setup, ns, projGuid));
                    foreach (var it in (setup.Items ?? new()).Where(i => i.Kind == "file" && !string.IsNullOrEmpty(i.Content)))
                    {
                        var entry = zip.CreateEntry(safeName + "/" + setupName + "/" + SafeFileName(it.Name), CompressionLevel.Optimal);
                        using var st = entry.Open();
                        var bytes = DataUrlBytes(it.Content);
                        st.Write(bytes, 0, bytes.Length);
                    }
                }
                foreach (var f in sources) Add(f.Name, f.Content);
                foreach (var e in edmx) Add(e.Name, e.Content);
                Add("App.config", appConfig);
                foreach (var f in dataFiles) Add(f.Name, f.Content);
                Add("GlobalUsings.cs", ProjectCompiler.HiddenSource(ns).Replace("// <auto-generated/>", "// Web ortamında her dosyada geçerli olan using'ler (C# 10 global using)"));
                Add("Properties/AssemblyInfo.cs",
                    "using System.Reflection;\nusing System.Runtime.InteropServices;\n\n" +
                    "[assembly: AssemblyTitle(\"" + ns + "\")]\n[assembly: AssemblyDescription(\"\")]\n[assembly: AssemblyConfiguration(\"\")]\n[assembly: AssemblyCompany(\"\")]\n" +
                    "[assembly: AssemblyProduct(\"" + ns + "\")]\n[assembly: AssemblyCopyright(\"Copyright © " + DateTime.Now.Year + "\")]\n[assembly: AssemblyTrademark(\"\")]\n[assembly: AssemblyCulture(\"\")]\n\n" +
                    "[assembly: ComVisible(false)]\n[assembly: Guid(\"" + projGuid.ToLowerInvariant() + "\")]\n\n[assembly: AssemblyVersion(\"1.0.0.0\")]\n[assembly: AssemblyFileVersion(\"1.0.0.0\")]\n");
                var notes = new StringBuilder();
                notes.Append("Bu proje C# Form Stüdyosu'ndan \".NET Framework 4.8\" biçiminde indirildi (kitaptaki Visual Studio 2019/2022 düzeni).\r\n\r\n");
                notes.Append("Açmak için: " + ns + ".sln dosyasına çift tıklayın.\r\n");
                notes.Append("Gerekli: Visual Studio'da \".NET masaüstü geliştirme\" iş yükü ve .NET Framework 4.8 geliştirme paketi.\r\n");
                notes.Append("NuGet paketleri (MySql.Data, EntityFramework) ilk derlemede otomatik indirilir (internet gerekir).\r\n");
                if (mysql || ef) notes.Append("\r\nMySQL: Program bilgisayarınızda çalışan MySQL sunucusuna bağlanır. Veritabanını laboratuvardaki gibi oluşturun\r\n(ya da laboratuvarda Data Export ile aldığınız yedeği Data Import ile yükleyin) ve App.config'teki şifreyi kendi sunucunuza göre düzenleyin.\r\n");
                if (edmx.Count > 0) notes.Append("\r\nEntity Framework: .edmx dosyası Entity Data Model tasarımcısında açılır. Sınıflar hazır olarak eklenmiştir;\r\n\"Update Model from Database\" yaparsanız Visual Studio kod üretim şablonlarını (.tt) ekleyebilir.\r\n");
                if (setup != null)
                    notes.Append("\r\nSetup projesi (" + setupName + "): Çözümde kurulum projesi olarak yer alır. Açabilmek için Visual Studio'da\r\nExtensions > Manage Extensions ile \"Microsoft Visual Studio Installer Projects 2022\" eklentisini kurun.\r\nFile System düzenleyicisindeki öğeler (Primary output, dosyalar, kısayollar) ve Properties değerleri aktarılmıştır.\r\nKurulum iletişim kutuları için gerekirse: Setup projesine sağ tık > View > User Interface. Derlemek için Setup projesine\r\nsağ tıklayıp Build deyin; .msi ve setup.exe " + setupName + "\\Debug klasöründe oluşur.\r\nProje açılmazsa kitaptaki gibi File > Add > New Project > Setup Project ile yeniden oluşturun.\r\n");
                else
                    notes.Append("\r\nSetup projesi: Visual Studio'da Extensions > Manage Extensions ile \"Microsoft Visual Studio Installer Projects\" eklentisini kurup\r\nkitaptaki gibi File > Add > New Project > Setup Project ile oluşturun.\r\n");
                Add("BENIOKU.txt", notes.ToString());
            }
            return ms.ToArray();
        }

        static void PackageRef(StringBuilder x, string id, string version)
        {
            x.AppendLine("    <PackageReference Include=\"" + id + "\">");
            x.AppendLine("      <Version>" + version + "</Version>");
            x.AppendLine("    </PackageReference>");
        }

        /// <summary>App.config'te .NET Framework 4.8 başlangıç bölümü olsun</summary>
        static string EnsureStartup(string config)
        {
            const string startup = "  <startup>\n    <supportedRuntime version=\"v4.0\" sku=\".NETFramework,Version=v4.8\" />\n  </startup>\n";
            if (string.IsNullOrWhiteSpace(config)) return "<?xml version=\"1.0\" encoding=\"utf-8\" ?>\n<configuration>\n" + startup + "</configuration>\n";
            if (config.Contains("<startup")) return config;
            int i = config.LastIndexOf("</configuration>", StringComparison.Ordinal);
            return i < 0 ? config : config.Substring(0, i) + startup + config.Substring(i);
        }
    }
}
