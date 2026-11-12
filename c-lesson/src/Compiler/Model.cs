using System.Text.Json;
using System.Text.Json.Serialization;

namespace CLesson.Compiler
{
    /// <summary>Projedeki tek bir kaynak dosya.</summary>
    public sealed class ProjectFile
    {
        [JsonPropertyName("name")] public string Name { get; set; } = "";
        [JsonPropertyName("content")] public string Content { get; set; } = "";
    }

    /// <summary>Setup projesi (File System düzenleyicisindeki öğeler ve Properties penceresi)</summary>
    public sealed class SetupInput
    {
        [JsonPropertyName("name")] public string Name { get; set; } = "Setup";
        [JsonPropertyName("props")] public Dictionary<string, JsonElement> Props { get; set; } = new();
        [JsonPropertyName("items")] public List<SetupItem> Items { get; set; } = new();
    }

    public sealed class SetupItem
    {
        [JsonPropertyName("id")] public string Id { get; set; } = "";
        /// <summary>app | desktop | programs</summary>
        [JsonPropertyName("folder")] public string Folder { get; set; } = "app";
        /// <summary>output | file | shortcut</summary>
        [JsonPropertyName("kind")] public string Kind { get; set; } = "file";
        [JsonPropertyName("name")] public string Name { get; set; } = "";
        /// <summary>Dosya içeriği (data: URL)</summary>
        [JsonPropertyName("content")] public string Content { get; set; }
        [JsonPropertyName("target")] public string Target { get; set; }
        [JsonPropertyName("icon")] public string Icon { get; set; }
    }

    /// <summary>Derleyiciye gelen proje (tarayıcıdaki proje JSON'unun ilgili kısmı).</summary>
    public sealed class ProjectInput
    {
        [JsonPropertyName("name")] public string Name { get; set; } = "Proje";
        [JsonPropertyName("namespace")] public string Namespace { get; set; } = "WinFormsApp";
        [JsonPropertyName("files")] public List<ProjectFile> Files { get; set; } = new();
        /// <summary>Program çalışırken uygulama klasöründe bulunacak veri dosyaları (ör. okul.xml).</summary>
        [JsonPropertyName("dataFiles")] public List<ProjectFile> DataFiles { get; set; } = new();
        /// <summary>Projeye eklenen başvurular / NuGet paketleri (ör. MySql.Data).</summary>
        [JsonPropertyName("references")] public List<string> References { get; set; } = new();
        /// <summary>ZIP biçimi: "net8" (SDK projesi) ya da "net48" (.NET Framework 4.8, kitaptaki Visual Studio düzeni).</summary>
        [JsonPropertyName("exportTarget")] public string ExportTarget { get; set; } = "net8";
        /// <summary>Setup Project (Visual Studio Installer Projects) tanımı; net48 ZIP'inde .vdproj olarak üretilir.</summary>
        [JsonPropertyName("setup")] public SetupInput Setup { get; set; }

        static readonly JsonSerializerOptions options = new() { PropertyNameCaseInsensitive = true };

        public static ProjectInput Parse(string json) => JsonSerializer.Deserialize<ProjectInput>(json, options) ?? new ProjectInput();

        public IEnumerable<ProjectFile> SourceFiles => Files.Where(f => f.Name.EndsWith(".cs", StringComparison.OrdinalIgnoreCase));
    }

    /// <summary>Hata listesindeki bir satır.</summary>
    public sealed class DiagnosticInfo
    {
        [JsonPropertyName("severity")] public string Severity { get; set; } = "error";
        [JsonPropertyName("code")] public string Code { get; set; } = "";
        [JsonPropertyName("message")] public string Message { get; set; } = "";
        [JsonPropertyName("file")] public string File { get; set; } = "";
        [JsonPropertyName("line")] public int Line { get; set; }
        [JsonPropertyName("col")] public int Column { get; set; }
        [JsonPropertyName("endLine")] public int EndLine { get; set; }
        [JsonPropertyName("endCol")] public int EndColumn { get; set; }
    }

    public sealed class BuildResult
    {
        [JsonPropertyName("success")] public bool Success { get; set; }
        [JsonPropertyName("diagnostics")] public List<DiagnosticInfo> Diagnostics { get; set; } = new();
        [JsonPropertyName("files")] public List<string> FileNames { get; set; } = new();
        [JsonPropertyName("ms")] public long ElapsedMs { get; set; }
        [JsonIgnore] public byte[] Assembly { get; set; }
        [JsonIgnore] public byte[] Pdb { get; set; }
        [JsonIgnore] public List<ProjectFile> DataFiles { get; set; } = new();

        public string ToJson() => JsonSerializer.Serialize(this);
    }

    public sealed class CompletionItemInfo
    {
        [JsonPropertyName("label")] public string Label { get; set; } = "";
        [JsonPropertyName("kind")] public string Kind { get; set; } = "";
        [JsonPropertyName("detail")] public string Detail { get; set; } = "";
        [JsonPropertyName("sort")] public string SortText { get; set; } = "";
    }
}
