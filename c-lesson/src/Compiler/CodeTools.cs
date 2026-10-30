using System.IO.Compression;
using System.Text;
using System.Text.Json;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;

namespace CLesson.Compiler
{
    public static class CodeTools
    {
        /// <summary>
        /// Form kod dosyasına (Form1.cs) olay metodu ekler. Metot zaten varsa dokunmaz.
        /// Dönüş: { code, line } — line, imlecin konacağı satır (1 tabanlı).
        /// </summary>
        public static string AddEventHandler(string code, string className, string methodName, string argsType)
        {
            var tree = CSharpSyntaxTree.ParseText(code ?? "");
            var root = tree.GetRoot();
            var cls = root.DescendantNodes().OfType<ClassDeclarationSyntax>().FirstOrDefault(c => c.Identifier.Text == className)
                      ?? root.DescendantNodes().OfType<ClassDeclarationSyntax>().FirstOrDefault();
            if (cls == null) return Result(code, 1);

            var existing = cls.Members.OfType<MethodDeclarationSyntax>().FirstOrDefault(m => m.Identifier.Text == methodName);
            if (existing != null)
            {
                int line = existing.Body != null
                    ? existing.Body.OpenBraceToken.GetLocation().GetLineSpan().StartLinePosition.Line + 2
                    : existing.GetLocation().GetLineSpan().StartLinePosition.Line + 1;
                return Result(code, line);
            }

            // Sınıfın kapanış parantezinin hemen önüne ekle.
            var close = cls.CloseBraceToken;
            var text = code;
            int insertAt = close.SpanStart;
            // Kapanış parantezinin bulunduğu satırın başına git.
            int lineStart = text.LastIndexOf('\n', Math.Max(0, insertAt - 1)) + 1;
            string classIndent = text.Substring(lineStart, insertAt - lineStart);
            if (classIndent.Trim().Length != 0) { lineStart = insertAt; classIndent = ""; }
            string indent = classIndent + "    ";
            string nl = text.Contains("\r\n") ? "\r\n" : "\n";

            bool needsBlank = cls.Members.Count > 0;
            var sb = new StringBuilder();
            if (needsBlank) sb.Append(nl);
            sb.Append(indent).Append("private void ").Append(methodName).Append("(object sender, ").Append(argsType ?? "EventArgs").Append(" e)").Append(nl);
            sb.Append(indent).Append('{').Append(nl);
            sb.Append(indent).Append("    ").Append(nl);
            sb.Append(indent).Append('}').Append(nl);

            // Önceki üyenin sonundaki boş satırları sadeleştir.
            string before = text.Substring(0, lineStart).TrimEnd(' ', '\t', '\r', '\n') + nl;
            string after = text.Substring(lineStart);
            string result = before + sb + after;
            int bodyLine = before.Split('\n').Length - 1 + (needsBlank ? 1 : 0) + 3;
            return Result(result, bodyLine);
        }

        /// <summary>Bir metodun gövdesinin bulunduğu satırı döndürür (yoksa 0).</summary>
        public static int FindMethodLine(string code, string methodName)
        {
            var root = CSharpSyntaxTree.ParseText(code ?? "").GetRoot();
            var m = root.DescendantNodes().OfType<MethodDeclarationSyntax>().FirstOrDefault(x => x.Identifier.Text == methodName);
            if (m == null) return 0;
            return m.GetLocation().GetLineSpan().StartLinePosition.Line + 1;
        }

        /// <summary>Olay metodunun adını değiştirir (kontrol yeniden adlandırılınca).</summary>
        public static string RenameMethod(string code, string oldName, string newName)
        {
            var root = CSharpSyntaxTree.ParseText(code ?? "").GetRoot();
            var m = root.DescendantNodes().OfType<MethodDeclarationSyntax>().FirstOrDefault(x => x.Identifier.Text == oldName);
            if (m == null || root.DescendantNodes().OfType<MethodDeclarationSyntax>().Any(x => x.Identifier.Text == newName)) return code;
            var span = m.Identifier.Span;
            return code.Substring(0, span.Start) + newName + code.Substring(span.End);
        }

        /// <summary>Kontrol yeniden adlandırılınca koddaki kullanımlarını (this.eskiAd, eskiAd.Text ...) günceller.</summary>
        public static string RenameIdentifier(string code, string oldName, string newName)
        {
            var root = CSharpSyntaxTree.ParseText(code ?? "").GetRoot();
            var spans = root.DescendantNodes().OfType<IdentifierNameSyntax>()
                .Where(n => n.Identifier.Text == oldName)
                .Where(n => n.Parent is not MemberAccessExpressionSyntax ma || ma.Expression == n || ma.Expression is ThisExpressionSyntax)
                .Select(n => n.Identifier.Span)
                .OrderByDescending(s => s.Start)
                .ToList();
            var sb = new StringBuilder(code);
            foreach (var span in spans) sb.Remove(span.Start, span.Length).Insert(span.Start, newName);
            return sb.ToString();
        }

        static string Result(string code, int line) => JsonSerializer.Serialize(new { code, line });

        /// <summary>Projeyi Visual Studio'da açılabilecek bir .zip dosyasına dönüştürür.</summary>
        public static byte[] ExportZip(ProjectInput project)
        {
            string safeName = SafeFileName(string.IsNullOrWhiteSpace(project.Name) ? "Proje" : project.Name);
            var sources = project.SourceFiles.ToList();
            var formFiles = sources.Where(f => sources.Any(d => d.Name == Path.GetFileNameWithoutExtension(f.Name) + ".Designer.cs")).ToList();

            var csproj = new StringBuilder();
            csproj.AppendLine("<Project Sdk=\"Microsoft.NET.Sdk\">");
            csproj.AppendLine();
            csproj.AppendLine("  <PropertyGroup>");
            csproj.AppendLine("    <OutputType>WinExe</OutputType>");
            csproj.AppendLine("    <TargetFramework>net8.0-windows</TargetFramework>");
            csproj.AppendLine("    <Nullable>disable</Nullable>");
            csproj.AppendLine("    <UseWindowsForms>true</UseWindowsForms>");
            csproj.AppendLine("    <ImplicitUsings>enable</ImplicitUsings>");
            csproj.AppendLine("    <RootNamespace>" + project.Namespace + "</RootNamespace>");
            csproj.AppendLine("    <AssemblyName>" + project.Namespace + "</AssemblyName>");
            csproj.AppendLine("  </PropertyGroup>");
            csproj.AppendLine();
            csproj.AppendLine("  <!-- Web ortamıyla aynı örtük using listesi (Timer adı çakışmasın diye System.Threading yok) -->");
            csproj.AppendLine("  <ItemGroup>");
            csproj.AppendLine("    <Using Remove=\"System.Threading\" />");
            csproj.AppendLine("    <Using Remove=\"System.Net.Http\" />");
            csproj.AppendLine("  </ItemGroup>");
            if (formFiles.Count > 0)
            {
                csproj.AppendLine();
                csproj.AppendLine("  <ItemGroup>");
                foreach (var f in formFiles)
                {
                    csproj.AppendLine("    <Compile Update=\"" + f.Name + "\">");
                    csproj.AppendLine("      <SubType>Form</SubType>");
                    csproj.AppendLine("    </Compile>");
                }
                csproj.AppendLine("  </ItemGroup>");
            }
            var copied = (project.DataFiles ?? new()).Where(f => !f.Name.EndsWith(".sql", StringComparison.OrdinalIgnoreCase)).ToList();
            if (copied.Count > 0)
            {
                csproj.AppendLine();
                csproj.AppendLine("  <!-- Veritabanı kayıtları: program bu dosyayı okur ve kaydeder (çıkış klasörüne bir kez kopyalanır) -->");
                csproj.AppendLine("  <ItemGroup>");
                foreach (var f in copied)
                {
                    csproj.AppendLine("    <None Update=\"" + f.Name + "\">");
                    csproj.AppendLine("      <CopyToOutputDirectory>PreserveNewest</CopyToOutputDirectory>");
                    csproj.AppendLine("    </None>");
                }
                csproj.AppendLine("  </ItemGroup>");
            }
            csproj.AppendLine();
            csproj.AppendLine("</Project>");

            using var ms = new MemoryStream();
            using (var zip = new ZipArchive(ms, ZipArchiveMode.Create, leaveOpen: true))
            {
                void Add(string path, string content)
                {
                    var entry = zip.CreateEntry(safeName + "/" + path, CompressionLevel.Optimal);
                    using var w = new StreamWriter(entry.Open(), new UTF8Encoding(true));
                    w.Write((content ?? "").Replace("\r\n", "\n").Replace("\n", "\r\n"));
                }
                string csprojName = project.Namespace + ".csproj";
                Add(csprojName, csproj.ToString());

                // Çözüm dosyaları: .slnx (VS 2022 17.13+ / VS 2026) ve eski VS sürümleri için .sln
                Add(project.Namespace + ".slnx",
                    "<Solution>\n  <Project Path=\"" + csprojName + "\" />\n</Solution>\n");
                string projGuid = StableGuid("proje:" + project.Namespace);
                string slnGuid = StableGuid("cozum:" + project.Namespace);
                Add(project.Namespace + ".sln",
                    "\nMicrosoft Visual Studio Solution File, Format Version 12.00\n" +
                    "# Visual Studio Version 17\n" +
                    "VisualStudioVersion = 17.0.31903.59\n" +
                    "MinimumVisualStudioVersion = 10.0.40219.1\n" +
                    "Project(\"{9A19103F-16F7-4668-BE54-9A1E7A4F7556}\") = \"" + project.Namespace + "\", \"" + csprojName + "\", \"{" + projGuid + "}\"\n" +
                    "EndProject\n" +
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
                    "\tEndGlobalSection\n" +
                    "\tGlobalSection(SolutionProperties) = preSolution\n" +
                    "\t\tHideSolutionNode = FALSE\n" +
                    "\tEndGlobalSection\n" +
                    "\tGlobalSection(ExtensibilityGlobals) = postSolution\n" +
                    "\t\tSolutionGuid = {" + slnGuid + "}\n" +
                    "\tEndGlobalSection\n" +
                    "EndGlobal\n");
                foreach (var f in project.Files)
                {
                    if (f.Name == ProjectCompiler.HiddenFileName) continue;
                    Add(f.Name, f.Content);
                }
                foreach (var f in project.DataFiles ?? new()) Add(f.Name, f.Content);
                string db = (project.DataFiles ?? new()).Any() ?
                    "\r\nVeritabanı: Bu projede okul.mdf yerine kayıtlar " + string.Join(", ", copied.Select(f => f.Name)) + " dosyasında tutulur;\r\n" +
                    "veri kümesi (DataSet) sınıfları ...DataSet.Designer.cs dosyasındadır ve bu dosyayı okuyup yazar.\r\n" +
                    "Gerçek SQL Server veritabanı oluşturmak isterseniz .sql dosyasındaki komutları kullanabilirsiniz.\r\n" : "";
                Add("BENIOKU.txt",
                    "Bu proje C# WinForms Ders Ortamından indirildi.\r\n\r\n" +
                    "Açmak için: " + project.Namespace + ".slnx dosyasına çift tıklayın (Visual Studio 2022 17.13+ veya VS 2026).\r\n" +
                    "Daha eski Visual Studio 2022 sürümlerinde " + project.Namespace + ".sln dosyasını açın.\r\n" +
                    "Gerekli: .NET 8 SDK ve Visual Studio'da \".NET masaüstü geliştirme\" iş yükü.\r\n" + db);
            }
            return ms.ToArray();
        }

        /// <summary>Aynı proje için her indirmede aynı GUID (VS çözüm dosyası için).</summary>
        static string StableGuid(string text)
        {
            // Tarayıcıda (WebAssembly) MD5 yok; basit FNV-1a özetinden 16 bayt üretilir.
            var bytes = new byte[16];
            ulong h1 = 14695981039346656037UL, h2 = 1099511628211UL ^ 0x9E3779B97F4A7C15UL;
            foreach (byte b in Encoding.UTF8.GetBytes(text))
            {
                h1 = (h1 ^ b) * 1099511628211UL;
                h2 = (h2 ^ b) * 1099511628211UL + 0x632BE59BD9B4E019UL;
            }
            BitConverter.GetBytes(h1).CopyTo(bytes, 0);
            BitConverter.GetBytes(h2).CopyTo(bytes, 8);
            return new Guid(bytes).ToString().ToUpperInvariant();
        }

        static string SafeFileName(string name)
        {
            var invalid = Path.GetInvalidFileNameChars();
            var sb = new StringBuilder();
            foreach (var c in name) sb.Append(invalid.Contains(c) || c == '/' || c == '\\' ? '_' : c);
            return sb.ToString().Trim();
        }
    }
}
