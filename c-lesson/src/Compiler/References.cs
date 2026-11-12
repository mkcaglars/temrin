using System.Reflection;
using Microsoft.CodeAnalysis;

namespace CLesson.Compiler
{
    /// <summary>Öğrenci kodunun derlendiği referans derlemeler (bu derlemeye gömülüdür).</summary>
    public static class References
    {
        static List<MetadataReference> all;
        static readonly Dictionary<string, MetadataReference> optional = new(StringComparer.OrdinalIgnoreCase);

        /// <summary>Yalnızca projeye eklenince (Add Reference / NuGet) kullanılabilen derlemeler.</summary>
        public static readonly string[] OptionalNames = { "MySql.Data", "EntityFramework" };

        /// <summary>Projenin başvurularına göre derleme referansları.</summary>
        public static IReadOnlyList<MetadataReference> For(IEnumerable<string> projectRefs)
        {
            var baseRefs = All;
            var extra = (projectRefs ?? Enumerable.Empty<string>()).Where(r => optional.ContainsKey(r)).Select(r => optional[r]).Distinct().ToList();
            return extra.Count == 0 ? baseRefs : baseRefs.Concat(extra).ToList();
        }

        public static string Key(IEnumerable<string> projectRefs) =>
            string.Join(";", (projectRefs ?? Enumerable.Empty<string>()).Where(r => OptionalNames.Contains(r, StringComparer.OrdinalIgnoreCase)).Select(r => r.ToLowerInvariant()).OrderBy(r => r));

        public static IReadOnlyList<MetadataReference> All
        {
            get
            {
                if (all != null) return all;
                var asm = typeof(References).Assembly;
                var list = new List<MetadataReference>();
                foreach (var name in asm.GetManifestResourceNames())
                {
                    if (!name.StartsWith("refs/", StringComparison.Ordinal)) continue;
                    using var s = asm.GetManifestResourceStream(name);
                    using var ms = new MemoryStream();
                    s.CopyTo(ms);
                    var reference = MetadataReference.CreateFromImage(ms.ToArray(), filePath: name.Substring(5));
                    string asmName = Path.GetFileNameWithoutExtension(name.Substring(5));
                    if (OptionalNames.Contains(asmName, StringComparer.OrdinalIgnoreCase)) optional[asmName] = reference;
                    else list.Add(reference);
                }
                all = list;
                return all;
            }
        }
    }
}
