using System.IO.Compression;
using System.Xml.Linq;
using CLesson.Compiler;
using Xunit;

namespace Tests
{
    public class ExportTests
    {
        static Dictionary<string, string> Unzip(byte[] bytes)
        {
            using var zip = new ZipArchive(new MemoryStream(bytes));
            return zip.Entries.ToDictionary(e => e.FullName.Substring(e.FullName.IndexOf('/') + 1), e => new StreamReader(e.Open()).ReadToEnd());
        }

        static ProjectInput Project(string target)
        {
            var p = new ProjectInput { Name = "Kütüphane Projesi", Namespace = "KutuphaneProjesi", ExportTarget = target };
            p.Files.Add(new ProjectFile { Name = "Program.cs", Content = "namespace KutuphaneProjesi { static class Program { [System.STAThread] static void Main() { System.Windows.Forms.Application.Run(new Form1()); } } }" });
            p.Files.Add(new ProjectFile { Name = "Form1.cs", Content = "namespace KutuphaneProjesi { public partial class Form1 : Form { public Form1() { InitializeComponent(); } } }" });
            p.Files.Add(new ProjectFile { Name = "Form1.Designer.cs", Content = "namespace KutuphaneProjesi { partial class Form1 { void InitializeComponent() { } } }" });
            p.Files.Add(new ProjectFile { Name = "VeriTabaniIslemleri.cs", Content = "namespace KutuphaneProjesi { class VeriTabaniIslemleri { } }" });
            p.Files.Add(new ProjectFile { Name = "SirketModel.edmx", Content = "<?xml version=\"1.0\"?><edmx:Edmx Version=\"3.0\" xmlns:edmx=\"http://schemas.microsoft.com/ado/2009/11/edmx\" />" });
            p.Files.Add(new ProjectFile { Name = "App.config", Content = "<?xml version=\"1.0\" encoding=\"utf-8\" ?>\n<configuration>\n  <connectionStrings>\n    <add name=\"baglanti\" connectionString=\"Server=localhost;Database=kutuphane;Uid=root;Pwd=1234;\" />\n  </connectionStrings>\n</configuration>\n" });
            p.References.AddRange(new[] { "MySql.Data", "EntityFramework" });
            return p;
        }

        [Fact]
        public void Net48ProjectHasClassicLayout()
        {
            var files = Unzip(CodeTools.ExportZip(Project("net48")));
            Assert.Contains("KutuphaneProjesi.sln", files.Keys);
            Assert.Contains("Properties/AssemblyInfo.cs", files.Keys);
            Assert.Contains("GlobalUsings.cs", files.Keys);
            var csproj = XDocument.Parse(files["KutuphaneProjesi.csproj"]);
            XNamespace ms = "http://schemas.microsoft.com/developer/msbuild/2003";
            Assert.Equal("v4.8", csproj.Descendants(ms + "TargetFrameworkVersion").Single().Value);
            var compiles = csproj.Descendants(ms + "Compile").Select(e => e.Attribute("Include").Value).ToList();
            Assert.Contains("Form1.cs", compiles);
            Assert.Contains("VeriTabaniIslemleri.cs", compiles);
            Assert.Equal("Form", csproj.Descendants(ms + "Compile").Single(e => e.Attribute("Include").Value == "Form1.cs").Element(ms + "SubType").Value);
            Assert.Equal("Form1.cs", csproj.Descendants(ms + "Compile").Single(e => e.Attribute("Include").Value == "Form1.Designer.cs").Element(ms + "DependentUpon").Value);
            var packages = csproj.Descendants(ms + "PackageReference").Select(e => e.Attribute("Include").Value).ToList();
            Assert.Equal(new[] { "MySql.Data", "EntityFramework", "MySql.Data.EntityFramework" }, packages);
            Assert.Single(csproj.Descendants(ms + "EntityDeploy"));
            Assert.Contains(csproj.Descendants(ms + "Reference"), e => e.Attribute("Include").Value == "System.Configuration");
            var config = XDocument.Parse(files["App.config"]);
            Assert.Equal(".NETFramework,Version=v4.8", config.Descendants("supportedRuntime").Single().Attribute("sku").Value);
            Assert.NotNull(config.Descendants("connectionStrings").SingleOrDefault());
            Assert.Contains("SirketModel.edmx", files.Keys);
        }

        [Fact]
        public void Net8IsStillTheDefault()
        {
            var files = Unzip(CodeTools.ExportZip(Project("net8")));
            Assert.Contains("net8.0-windows", files["KutuphaneProjesi.csproj"]);
            Assert.Contains("KutuphaneProjesi.slnx", files.Keys);
        }
    
        [Fact]
        public void Net48ZipContainsSetupProject()
        {
            var p = Project("net48");
            p.Setup = new SetupInput { Name = "KutuphaneSetup" };
            p.Setup.Props["Manufacturer"] = System.Text.Json.JsonDocument.Parse("\"MEB Okulu\"").RootElement.Clone();
            p.Setup.Props["TargetPlatform"] = System.Text.Json.JsonDocument.Parse("\"x64\"").RootElement.Clone();
            p.Setup.Items.Add(new SetupItem { Id = "o1", Folder = "app", Kind = "output", Name = "Primary output" });
            p.Setup.Items.Add(new SetupItem { Id = "f1", Folder = "app", Kind = "file", Name = "kitap.ico", Content = "data:image/x-icon;base64,AAABAAEAEBA=" });
            p.Setup.Items.Add(new SetupItem { Id = "s1", Folder = "desktop", Kind = "shortcut", Name = "Kütüphane", Target = "o1", Icon = "f1" });
            var files = Unzip(CodeTools.ExportZip(p));
            Assert.Contains("{54435603-DBB4-11D2-8724-00A0C9A8B90C}", files["KutuphaneProjesi.sln"]);
            Assert.Contains("KutuphaneSetup\\KutuphaneSetup.vdproj", files["KutuphaneProjesi.sln"]);
            Assert.Contains("KutuphaneSetup/kitap.ico", files.Keys);
            var v = files["KutuphaneSetup/KutuphaneSetup.vdproj"].TrimStart('﻿');
            Assert.StartsWith("\"DeployProject\"", v);
            Assert.Equal(v.Count(c => c == '{') , v.Count(c => c == '}'));
            Assert.Contains("\"Manufacturer\" = \"8:MEB Okulu\"", v);
            Assert.Contains("\"TargetPlatform\" = \"3:1\"", v);
            Assert.Contains("[ProgramFiles64Folder][Manufacturer]\\\\[ProductName]", v);
            Assert.Contains("\"OutputProjectGuid\" = \"8:{", v);
            // kısayol: hedef Primary output, simge kitap.ico, klasör masaüstü
            var lines = v.Split("\r\n");
            int sc = Array.FindIndex(lines, l => l.Contains("{970C0BB2-C7D0-45D7-ABFA-7EC378858BC0}:"));
            Assert.True(sc > 0);
            string KeyOf(string marker) => lines.First(l => l.Contains(marker)).Split(':').Last().TrimEnd('"');
            string outKey = KeyOf("{5259A561-127C-4D43-A0A1-72F10C7B3BF8}:");
            string icoKey = KeyOf("{1FB2D0AE-D3B9-43D4-B9DD-F88EC61E35DE}:");
            string deskKey = lines.First(l => l.Contains("{1525181F-901A-416C-8A58-119130FE478E}:")).Split(':').Last().TrimEnd('"');
            Assert.Contains(lines.Skip(sc).Take(14), l => l.Contains("\"Target\" = \"8:" + outKey + "\""));
            Assert.Contains(lines.Skip(sc).Take(14), l => l.Contains("\"Icon\" = \"8:" + icoKey + "\""));
            Assert.Contains(lines.Skip(sc).Take(14), l => l.Contains("\"Folder\" = \"8:" + deskKey + "\""));
        }
    }
}
