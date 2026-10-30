using System.Reflection;
using Microsoft.CodeAnalysis;

namespace CLesson.Compiler
{
    /// <summary>Öğrenci kodunun derlendiği referans derlemeler (bu derlemeye gömülüdür).</summary>
    public static class References
    {
        static List<MetadataReference> all;

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
                    list.Add(MetadataReference.CreateFromImage(ms.ToArray(), filePath: name.Substring(5)));
                }
                all = list;
                return all;
            }
        }
    }
}
