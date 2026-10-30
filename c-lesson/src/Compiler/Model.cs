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

    /// <summary>Derleyiciye gelen proje (tarayıcıdaki proje JSON'unun ilgili kısmı).</summary>
    public sealed class ProjectInput
    {
        [JsonPropertyName("name")] public string Name { get; set; } = "Proje";
        [JsonPropertyName("namespace")] public string Namespace { get; set; } = "WinFormsApp";
        [JsonPropertyName("files")] public List<ProjectFile> Files { get; set; } = new();
        /// <summary>Program çalışırken uygulama klasöründe bulunacak veri dosyaları (ör. okul.xml).</summary>
        [JsonPropertyName("dataFiles")] public List<ProjectFile> DataFiles { get; set; } = new();

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
