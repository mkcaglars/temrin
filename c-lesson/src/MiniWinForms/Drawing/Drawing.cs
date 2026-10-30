using System.Globalization;

// System.Drawing.Primitives (Color, Point, Size, Rectangle, SystemColors) .NET'in kendisinden gelir.
// Burada yalnızca System.Drawing.Common'da bulunan ve WinForms derslerinde gereken türler var.
namespace System.Drawing
{
    [Flags]
    public enum FontStyle { Regular = 0, Bold = 1, Italic = 2, Underline = 4, Strikeout = 8 }

    public enum GraphicsUnit { World = 0, Display = 1, Pixel = 2, Point = 3, Inch = 4, Document = 5, Millimeter = 6 }

    public enum ContentAlignment
    {
        TopLeft = 1, TopCenter = 2, TopRight = 4,
        MiddleLeft = 16, MiddleCenter = 32, MiddleRight = 64,
        BottomLeft = 256, BottomCenter = 512, BottomRight = 1024,
    }

    public enum StringAlignment { Near = 0, Center = 1, Far = 2 }

    public sealed class FontFamily
    {
        public FontFamily(string name) { Name = name; }
        public string Name { get; }
        public static FontFamily GenericSansSerif => new FontFamily("Segoe UI");
        public static FontFamily GenericSerif => new FontFamily("Times New Roman");
        public static FontFamily GenericMonospace => new FontFamily("Courier New");
        public override string ToString() => "[FontFamily: Name=" + Name + "]";
    }

    public sealed class Font : IDisposable, ICloneable
    {
        public Font(string familyName, float emSize) : this(familyName, emSize, FontStyle.Regular, GraphicsUnit.Point) { }
        public Font(string familyName, float emSize, FontStyle style) : this(familyName, emSize, style, GraphicsUnit.Point) { }
        public Font(string familyName, float emSize, GraphicsUnit unit) : this(familyName, emSize, FontStyle.Regular, unit) { }
        public Font(string familyName, float emSize, FontStyle style, GraphicsUnit unit) : this(familyName, emSize, style, unit, 1) { }
        public Font(string familyName, float emSize, FontStyle style, GraphicsUnit unit, byte gdiCharSet) : this(familyName, emSize, style, unit, gdiCharSet, false) { }
        public Font(string familyName, float emSize, FontStyle style, GraphicsUnit unit, byte gdiCharSet, bool gdiVerticalFont)
        {
            if (emSize <= 0) throw new ArgumentException("Yazı tipi boyutu sıfırdan büyük olmalıdır.", nameof(emSize));
            Name = string.IsNullOrEmpty(familyName) ? "Segoe UI" : familyName;
            Size = emSize;
            Style = style;
            Unit = unit;
            GdiCharSet = gdiCharSet;
        }
        public Font(FontFamily family, float emSize) : this(family.Name, emSize) { }
        public Font(FontFamily family, float emSize, FontStyle style) : this(family.Name, emSize, style) { }
        public Font(FontFamily family, float emSize, FontStyle style, GraphicsUnit unit) : this(family.Name, emSize, style, unit) { }
        public Font(Font prototype, FontStyle newStyle) : this(prototype.Name, prototype.Size, newStyle, prototype.Unit, prototype.GdiCharSet) { }

        public string Name { get; }
        public FontFamily FontFamily => new FontFamily(Name);
        public float Size { get; }
        public FontStyle Style { get; }
        public GraphicsUnit Unit { get; }
        public byte GdiCharSet { get; }
        public bool GdiVerticalFont => false;
        public bool Bold => (Style & FontStyle.Bold) != 0;
        public bool Italic => (Style & FontStyle.Italic) != 0;
        public bool Underline => (Style & FontStyle.Underline) != 0;
        public bool Strikeout => (Style & FontStyle.Strikeout) != 0;
        public float SizeInPoints => Unit switch
        {
            GraphicsUnit.Pixel => Size * 72f / 96f,
            GraphicsUnit.Inch => Size * 72f,
            GraphicsUnit.Millimeter => Size * 72f / 25.4f,
            GraphicsUnit.Document => Size * 72f / 300f,
            _ => Size,
        };
        public int Height => (int)Math.Ceiling(SizeInPoints * 96f / 72f * 1.2f);
        public float GetHeight() => Height;

        /// <summary>CSS'e çevrilmiş hali: "aile|boyutPt|kalın|italik|altıçizili|üstüçizili"</summary>
        internal string Css => Name + "|" + SizeInPoints.ToString("0.##", CultureInfo.InvariantCulture) + "|" +
                               (Bold ? 1 : 0) + "|" + (Italic ? 1 : 0) + "|" + (Underline ? 1 : 0) + "|" + (Strikeout ? 1 : 0);

        public object Clone() => new Font(Name, Size, Style, Unit, GdiCharSet);
        public void Dispose() { }
        public override bool Equals(object obj) => obj is Font f && f.Name == Name && f.Size == Size && f.Style == Style && f.Unit == Unit;
        public override int GetHashCode() => HashCode.Combine(Name, Size, Style, Unit);
        public override string ToString() => "[Font: Name=" + Name + ", Size=" + Size.ToString(CultureInfo.InvariantCulture) + ", Units=" + (int)Unit + ", GdiCharSet=" + GdiCharSet + ", GdiVerticalFont=False]";
    }

    /// <summary>Resim. İnternet adresinden ya da OpenFileDialog ile seçilen dosyadan yüklenir.</summary>
    public class Image : IDisposable, ICloneable
    {
        internal Image(string url, int width, int height)
        {
            Url = url;
            Width = width;
            Height = height;
        }

        internal string Url { get; }
        public int Width { get; }
        public int Height { get; }
        public Size Size => new Size(Width, Height);
        public object Tag { get; set; }
        public System.Drawing.Imaging.ImageFormat RawFormat { get; internal set; }
        public float HorizontalResolution => 96f;
        public float VerticalResolution => 96f;

        public static Image FromFile(string filename)
        {
            if (filename == null) throw new ArgumentNullException(nameof(filename));
            if (filename.StartsWith("http://") || filename.StartsWith("https://") || filename.StartsWith("data:"))
                return new Bitmap(filename, 0, 0);
            if (!System.IO.File.Exists(filename))
                throw new System.IO.FileNotFoundException("Dosya bulunamadı: " + filename + "\nWeb ortamında bilgisayarınızdaki dosyalara doğrudan erişilemez. " +
                    "Resmi OpenFileDialog ile seçip ofd.FileName kullanın ya da internet adresi verin (pictureBox1.ImageLocation = \"https://...\").", filename);
            return FromBytes(System.IO.File.ReadAllBytes(filename));
        }

        public static Image FromStream(System.IO.Stream stream)
        {
            if (stream == null) throw new ArgumentNullException(nameof(stream));
            using var ms = new System.IO.MemoryStream();
            stream.CopyTo(ms);
            return FromBytes(ms.ToArray());
        }

        internal static Image FromBytes(byte[] b)
        {
            var (mime, w, h) = Probe(b);
            if (mime == null) throw new ArgumentException("Dosya bir resim değil ya da bu resim biçimi desteklenmiyor (desteklenenler: PNG, JPEG, GIF, BMP, WEBP).");
            return new Bitmap("data:" + mime + ";base64," + Convert.ToBase64String(b), w, h);
        }

        /// <summary>Resim türünü ve boyutunu dosyanın başlığından okur.</summary>
        static (string mime, int w, int h) Probe(byte[] b)
        {
            int U16BE(int i) => (b[i] << 8) | b[i + 1];
            int U32BE(int i) => (b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3];
            int I32LE(int i) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24);
            if (b.Length > 24 && b[0] == 0x89 && b[1] == 'P' && b[2] == 'N' && b[3] == 'G') return ("image/png", U32BE(16), U32BE(20));
            if (b.Length > 10 && b[0] == 'G' && b[1] == 'I' && b[2] == 'F') return ("image/gif", b[6] | (b[7] << 8), b[8] | (b[9] << 8));
            if (b.Length > 26 && b[0] == 'B' && b[1] == 'M') return ("image/bmp", I32LE(18), Math.Abs(I32LE(22)));
            if (b.Length > 30 && b[0] == 'R' && b[1] == 'I' && b[2] == 'F' && b[3] == 'F' && b[8] == 'W' && b[9] == 'E' && b[10] == 'B' && b[11] == 'P')
            {
                if (b[12] == 'V' && b[13] == 'P' && b[14] == '8' && b[15] == 'X') return ("image/webp", 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), 1 + (b[27] | (b[28] << 8) | (b[29] << 16)));
                if (b[12] == 'V' && b[13] == 'P' && b[14] == '8' && b[15] == ' ') return ("image/webp", (b[26] | (b[27] << 8)) & 0x3fff, (b[28] | (b[29] << 8)) & 0x3fff);
                if (b[12] == 'V' && b[13] == 'P' && b[14] == '8' && b[15] == 'L') { int v = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24); return ("image/webp", (v & 0x3fff) + 1, ((v >> 14) & 0x3fff) + 1); }
                return ("image/webp", 0, 0);
            }
            if (b.Length > 4 && b[0] == 0xFF && b[1] == 0xD8)
            {
                int i = 2;
                while (i + 9 < b.Length)
                {
                    if (b[i] != 0xFF) { i++; continue; }
                    int marker = b[i + 1];
                    if (marker == 0xD8 || marker == 0x01 || (marker >= 0xD0 && marker <= 0xD7)) { i += 2; continue; }
                    int len = U16BE(i + 2);
                    if (marker >= 0xC0 && marker <= 0xCF && marker != 0xC4 && marker != 0xC8 && marker != 0xCC)
                        return ("image/jpeg", U16BE(i + 7), U16BE(i + 5));
                    i += 2 + len;
                }
                return ("image/jpeg", 0, 0);
            }
            return (null, 0, 0);
        }

        public void Save(string filename)
        {
            int comma = Url.IndexOf(',');
            if (!Url.StartsWith("data:") || comma < 0) throw new NotSupportedException("Yalnızca dosyadan yüklenen resimler kaydedilebilir.");
            System.IO.File.WriteAllBytes(filename, Convert.FromBase64String(Url.Substring(comma + 1)));
        }

        public void Save(string filename, System.Drawing.Imaging.ImageFormat format) => Save(filename);

        public object Clone() => new Image(Url, Width, Height);
        public void Dispose() { }
    }

    public class Bitmap : Image
    {
        public Bitmap(string filename) : this(Resolve(filename)) { }
        Bitmap((string url, int w, int h) r) : base(r.url, r.w, r.h) { }
        static (string, int, int) Resolve(string filename)
        {
            if (filename != null && !filename.StartsWith("http://") && !filename.StartsWith("https://") && !filename.StartsWith("data:"))
            {
                var img = FromFile(filename);
                return (img.Url, img.Width, img.Height);
            }
            return (filename ?? "", 0, 0);
        }
        internal Bitmap(string url, int width, int height) : base(url, width, height) { }
        public Bitmap(int width, int height) : base("", width, height) { }
        public Bitmap(Image original) : base(original?.Url ?? "", original?.Width ?? 0, original?.Height ?? 0) { }
        public Bitmap(Image original, int width, int height) : base(original?.Url ?? "", width, height) { }
        public Bitmap(Image original, Size newSize) : base(original?.Url ?? "", newSize.Width, newSize.Height) { }
        public Bitmap(System.IO.Stream stream) : this(FromStream(stream)) { }
    }
}

namespace System.Drawing.Imaging
{
    public sealed class ImageFormat
    {
        readonly string name;
        ImageFormat(string name) { this.name = name; }
        public static ImageFormat Png { get; } = new ImageFormat("Png");
        public static ImageFormat Jpeg { get; } = new ImageFormat("Jpeg");
        public static ImageFormat Gif { get; } = new ImageFormat("Gif");
        public static ImageFormat Bmp { get; } = new ImageFormat("Bmp");
        public static ImageFormat Icon { get; } = new ImageFormat("Icon");
        public override string ToString() => name;
    }
}

namespace System.Drawing
{
    /// <summary>Çizim yüzeyi — bu sürümde desteklenmiyor, yalnızca derleme uyumluluğu için var.</summary>
    public sealed class Graphics : IDisposable
    {
        private Graphics() { }
        public void Dispose() { }
    }
}
