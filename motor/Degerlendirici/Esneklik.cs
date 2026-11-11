using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;

namespace Temrin.Motor
{
    /// <summary>Bir çıktının beklenenle uyumu.</summary>
    public enum Uyum
    {
        /// <summary>Birebir aynı (baştaki/sondaki boşluklar hariç).</summary>
        Tam,
        /// <summary>Mantık aynı, yalnızca biçim farklı (boşluk, büyük-küçük harf, ayraç, ondalık ayırıcı, ek metin).</summary>
        Bicim,
        /// <summary>Sonuç farklı.</summary>
        Kaldi,
    }

    /// <summary>Beklenen sütunundaki karşılaştırma işleci.</summary>
    public enum Mod
    {
        /// <summary><c>ad=değer</c>: biçim farkları kabul edilir, not düşülür (varsayılan).</summary>
        Esnek,
        /// <summary><c>ad==değer</c>: birebir eşleşme gerekir (eski davranış).</summary>
        Kati,
        /// <summary><c>ad~=değer</c>: beklenen değer çıktının içinde geçiyorsa yeterli; ek metin not sayılmaz.</summary>
        Icerir,
    }

    /// <summary>
    /// Öğrenci çıktısını beklenenle "mantık" düzeyinde karşılaştırır. Metin belirteçlere ayrılır: sayılar ve sözcükler.
    /// Boşluk, büyük-küçük harf (Türkçe), noktalama ve ayraçlar yok sayılır; 72,5 ile 72.5 aynı sayıdır.
    /// Sayılar her zaman birebir karşılaştırılır: mantık hatası sayıları değiştirir, biçim farkı değiştirmez.
    /// web/lib/puanla.php'deki cikti_belirtecleri / cikti_uyumu ile aynı kurallar.
    /// </summary>
    public static class Esneklik
    {
        static readonly CultureInfo Tr = new("tr-TR");

        // Sayı: isteğe bağlı eksi işareti (önünde harf/rakam yoksa), rakam grupları "," ya da "." ile ayrılmış olabilir.
        // Sözcük: harf ve rakamlardan oluşan dizi (rakamla başlamaz).
        static readonly Regex Parca = new(@"(?<![\p{L}\p{N}])-?\d+(?:[.,]\d+)*|[\p{L}_][\p{L}\p{N}_]*", RegexOptions.Compiled);

        static readonly HashSet<string> Olumsuz = new(StringComparer.Ordinal) { "degil" };

        /// <summary>Metnin belirteçleri: sayılar kanonik biçimde ("72.5", "-3"), sözcükler küçük harfle.</summary>
        public static List<string> Belirtecler(string metin)
        {
            var liste = new List<string>();
            foreach (Match m in Parca.Matches((metin ?? "").Normalize(NormalizationForm.FormC)))
            {
                string p = m.Value;
                if (p[0] == '-' || char.IsDigit(p[0])) liste.AddRange(Sayilar(p));
                else liste.Add(Sadelestir(p.ToLower(Tr)));
            }
            return liste;
        }

        /// <summary>
        /// "72,5" → 72.5; "1.000" ya da "1,2,3" gibi birden çok ayraçlı grup → ayrı tam sayılar (liste).
        /// Tek ayraç ondalık kabul edilir; virgül ve nokta eşdeğerdir.
        /// </summary>
        static IEnumerable<string> Sayilar(string p)
        {
            bool eksi = p[0] == '-';
            if (eksi) p = p[1..];
            var gruplar = p.Split(',', '.');
            if (gruplar.Length == 2)
            {
                yield return Kanonik((eksi ? "-" : "") + gruplar[0] + "." + gruplar[1]);
                yield break;
            }
            for (int i = 0; i < gruplar.Length; i++) yield return Kanonik((eksi && i == 0 ? "-" : "") + gruplar[i]);
        }

        static string Kanonik(string s) =>
            decimal.TryParse(s, NumberStyles.AllowLeadingSign | NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture, out var d)
                ? d.ToString("0.############################", CultureInfo.InvariantCulture)
                : s;

        /// <summary>Türkçe harfleri sadeleştirir: "GEÇTİ", "Gecti", "GECTI" aynı sözcük olur.</summary>
        static string Sadelestir(string s)
        {
            var sb = new StringBuilder(s.Length);
            foreach (char ch in s)
                sb.Append(ch switch { 'ç' => 'c', 'ğ' => 'g', 'ı' => 'i', 'ö' => 'o', 'ş' => 's', 'ü' => 'u', 'â' => 'a', 'î' => 'i', 'û' => 'u', _ => ch });
            return sb.ToString();
        }

        static bool SayiMi(string b) => b.Length > 0 && (char.IsDigit(b[0]) || (b[0] == '-' && b.Length > 1));

        /// <summary>Tek bir değeri karşılaştırır (Label/TextBox metni, mesaj kutusu, liste öğesi, çıktı tahmini).</summary>
        public static Uyum Karsilastir(string beklenen, string alinan, Mod mod)
        {
            beklenen = (beklenen ?? "").Trim();
            alinan = (alinan ?? "").Trim();
            if (string.Equals(beklenen, alinan, StringComparison.Ordinal)) return Uyum.Tam;
            if (mod == Mod.Kati) return Uyum.Kaldi;

            var b = Belirtecler(beklenen);
            var a = Belirtecler(alinan);
            if (b.SequenceEqual(a, StringComparer.Ordinal)) return mod == Mod.Icerir ? Uyum.Tam : Uyum.Bicim;
            if (EkMetinle(b, a, mod == Mod.Icerir)) return mod == Mod.Icerir ? Uyum.Tam : Uyum.Bicim;
            return Uyum.Kaldi;
        }

        /// <summary>
        /// Çıktıda beklenenden fazla metin var ama mantık aynı mı?
        /// Esnek: çıktıdaki sayılar beklenen sayılarla aynı sırada birebir aynı olmalı (fazla ya da eksik sayı yok).
        /// İçerir: beklenen sayılar çıktıda sırayla geçmeli (başka sayılar da olabilir).
        /// İkisinde de beklenen sözcükler çıktıda sırayla geçmeli (Türkçe ekler için başı eşleşmesi yeterli)
        /// ve çıktıda beklenmeyen bir "değil" olmamalı.
        /// </summary>
        static bool EkMetinle(List<string> b, List<string> a, bool icerir)
        {
            if (b.Count == 0) return false;
            var bSayi = b.Where(SayiMi).ToList();
            var aSayi = a.Where(SayiMi).ToList();
            bool sayilarUyar = icerir ? AltDizi(bSayi, aSayi, (x, y) => x == y) : bSayi.SequenceEqual(aSayi, StringComparer.Ordinal);
            if (!sayilarUyar) return false;

            var bSoz = b.Where(x => !SayiMi(x)).ToList();
            var aSoz = a.Where(x => !SayiMi(x)).ToList();
            if (aSoz.Any(Olumsuz.Contains) && !bSoz.Any(Olumsuz.Contains)) return false;
            return AltDizi(bSoz, aSoz, SozcukUyar);
        }

        static bool SozcukUyar(string beklenen, string alinan) =>
            beklenen == alinan || (beklenen.Length >= 3 && alinan.StartsWith(beklenen, StringComparison.Ordinal));

        /// <summary>parca'nın öğeleri butun içinde aynı sırayla (arada başka öğeler olabilir) geçiyor mu?</summary>
        static bool AltDizi(List<string> parca, List<string> butun, Func<string, string, bool> uyar)
        {
            int j = 0;
            foreach (var p in parca)
            {
                while (j < butun.Count && !uyar(p, butun[j])) j++;
                if (j == butun.Count) return false;
                j++;
            }
            return true;
        }

        /// <summary>
        /// Liste (ListBox/ComboBox) karşılaştırması. Esnek/Katı: öğe sayısı aynı, öğeler sırayla uyumlu.
        /// İçerir: beklenen öğeler listede sırayla geçiyor.
        /// </summary>
        public static Uyum ListeKarsilastir(IReadOnlyList<string> beklenen, IReadOnlyList<string> alinan, Mod mod)
        {
            if (beklenen.SequenceEqual(alinan, StringComparer.Ordinal)) return Uyum.Tam;
            if (mod == Mod.Kati) return Uyum.Kaldi;
            if (mod == Mod.Icerir)
            {
                int j = 0;
                foreach (var b in beklenen)
                {
                    while (j < alinan.Count && Karsilastir(b, alinan[j], Mod.Icerir) == Uyum.Kaldi) j++;
                    if (j == alinan.Count) return Uyum.Kaldi;
                    j++;
                }
                return Uyum.Tam;
            }
            if (beklenen.Count != alinan.Count) return Uyum.Kaldi;
            var sonuc = Uyum.Tam;
            for (int i = 0; i < beklenen.Count; i++)
            {
                var u = Karsilastir(beklenen[i], alinan[i], Mod.Esnek);
                if (u == Uyum.Kaldi) return Uyum.Kaldi;
                if (u == Uyum.Bicim) sonuc = Uyum.Bicim;
            }
            return sonuc;
        }

        /// <summary>
        /// "ad=değer", "ad==değer", "ad~=değer" koşulunu ayırır. Adın kendisinde '=' ya da '~' yoktur.
        /// </summary>
        public static bool KosulAyir(string kosul, out string ad, out Mod mod, out string deger)
        {
            ad = deger = "";
            mod = Mod.Esnek;
            int esit = kosul.IndexOf('=');
            if (esit <= 0) return false;
            int adSonu = esit;
            int degerBasi = esit + 1;
            if (kosul[esit - 1] == '~') { mod = Mod.Icerir; adSonu = esit - 1; }
            else if (esit + 1 < kosul.Length && kosul[esit + 1] == '=') { mod = Mod.Kati; degerBasi = esit + 2; }
            ad = kosul[..adSonu].Trim();
            deger = kosul[degerBasi..].Trim();
            return ad != "";
        }

        // ------------------------------------------------------------------ kontrol adları

        /// <summary>Ad karşılaştırması için: küçük harf, Türkçe harfler sadeleşmiş, harf/rakam dışı yok.</summary>
        public static string AdNormal(string ad)
        {
            var sb = new StringBuilder();
            foreach (char ch in (ad ?? "").ToLower(Tr))
            {
                char c = ch switch { 'ı' => 'i', 'ş' => 's', 'ğ' => 'g', 'ü' => 'u', 'ö' => 'o', 'ç' => 'c', _ => ch };
                if (char.IsLetterOrDigit(c)) sb.Append(c);
            }
            return sb.ToString().Normalize(NormalizationForm.FormD).Where(c => CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark)
                .Aggregate(new StringBuilder(), (s, c) => s.Append(c)).ToString();
        }

        /// <summary>"btnHesapla" → ("btn", "Hesapla"); önek küçük harflerle başlayan kısımdır.</summary>
        public static (string onek, string kok) AdParcala(string ad)
        {
            ad ??= "";
            int i = 0;
            while (i < ad.Length && char.IsLower(ad[i])) i++;
            return i == 0 || i == ad.Length ? ("", ad) : (ad[..i], ad[i..]);
        }
    }
}
