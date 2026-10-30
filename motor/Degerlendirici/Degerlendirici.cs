using System.Globalization;
using System.Text.Json;
using System.Windows.Forms;
using CLesson.Compiler;
using MiniWinForms;

namespace Temrin.Motor
{
    /// <summary>
    /// Öğrenci projesini temrin kontrollerine göre değerlendirir.
    /// Her çalıştırma testi programı baştan başlatır; böylece testler birbirini etkilemez.
    /// Değerlendirme bitince arayüz (Ui.Backend) eski hâline döner, öğrencinin açık programı kapanır.
    /// </summary>
    public static class Degerlendirici
    {
        /// <summary>Çalıştırma testinde tek düğme tıklamasının en uzun süresi (sonsuz döngü koruması).</summary>
        public const int SureSiniriMs = 3000;

        public static string DegerlendirJson(string projeJson, string kontrollerJson)
        {
            var kontroller = JsonSerializer.Deserialize<List<Kontrol>>(kontrollerJson, Json.Ayar) ?? new();
            return JsonSerializer.Serialize(Degerlendir(ProjectInput.Parse(projeJson), kontroller), Json.Ayar);
        }

        public static DegerlendirmeSonucu Degerlendir(ProjectInput proje, IList<Kontrol> kontroller)
        {
            var sure = System.Diagnostics.Stopwatch.StartNew();
            var sonuc = new DegerlendirmeSonucu();
            var yapi = new KodYapisi(proje.SourceFiles.Select(f => (f.Name, f.Content)));

            BuildResult derleme = null;
            try
            {
                derleme = new ProjectCompiler().Build(proje);
            }
            catch (Exception ex)
            {
                sonuc.Hatalar.Add("Derleyici hatası: " + ex.Message);
            }
            sonuc.Derlendi = derleme?.Success == true;
            if (derleme != null && !derleme.Success)
            {
                sonuc.Hatalar.AddRange(derleme.Diagnostics.Where(d => d.Severity == "error").Take(10)
                    .Select(d => $"{d.File} satır {d.Line}: {d.Message}"));
            }

            var oncekiArayuz = Ui.Backend;
            int oncekiSinir = Guard.LimitMs;
            var oncekiKultur = (CultureInfo.CurrentCulture, CultureInfo.CurrentUICulture);
            try
            {
                CultureInfo.CurrentCulture = CultureInfo.CurrentUICulture = new CultureInfo("tr-TR");
                Guard.LimitMs = SureSiniriMs;
                foreach (var k in kontroller)
                {
                    KontrolSonucu s;
                    try
                    {
                        s = Uygula(k, yapi, derleme);
                    }
                    catch (Exception ex)
                    {
                        s = new KontrolSonucu { Gecti = false, Mesaj = "Denetlenemedi: " + ex.Message };
                    }
                    s.No = k.No;
                    sonuc.Sonuclar.Add(s);
                }
            }
            finally
            {
                Ui.Backend = new KayitArayuzu();
                Ui.Reset();
                Ui.Backend = oncekiArayuz;
                Guard.LimitMs = oncekiSinir;
                (CultureInfo.CurrentCulture, CultureInfo.CurrentUICulture) = oncekiKultur;
            }
            sonuc.Ms = sure.ElapsedMilliseconds;
            return sonuc;
        }

        static KontrolSonucu Gecti() => new() { Gecti = true };
        static KontrolSonucu Kaldi(string mesaj) => new() { Gecti = false, Mesaj = mesaj };

        static KontrolSonucu Uygula(Kontrol k, KodYapisi yapi, BuildResult derleme)
        {
            string derlenmedi = "Proje derlenmediği için denetlenemedi.";
            switch (k.Tip.Trim())
            {
                case "derleme":
                    return derleme?.Success == true ? Gecti() : Kaldi("Proje derlenmiyor: " +
                        (derleme?.Diagnostics.FirstOrDefault(d => d.Severity == "error") is { } d ? $"{d.File} satır {d.Line}: {d.Message}" : "derleyici hatası"));

                case "kod_yapisi":
                {
                    var dugumler = yapi.Hedef(k.Hedef, out string neden);
                    if (dugumler == null) return Kaldi(neden);
                    var eksik = KodYapisi.EksikYapilar(dugumler, k.Beklenen);
                    return eksik.Count == 0 ? Gecti() : Kaldi($"{HedefAdi(k.Hedef)} içinde {string.Join(", ", eksik)} yok.");
                }

                case "kod_icerir":
                {
                    var dugumler = yapi.Hedef(k.Hedef, out string neden);
                    if (dugumler == null) return Kaldi(neden);
                    return KodYapisi.Iceriyor(dugumler, k.Beklenen) ? Gecti() : Kaldi($"{HedefAdi(k.Hedef)} içinde \"{k.Beklenen}\" yok.");
                }

                case "kontrol_var":
                {
                    if (derleme?.Success != true) return Kaldi(derlenmedi);
                    var (form, arayuz) = Baslat(derleme);
                    if (form == null) return Kaldi(BaslamaHatasi(arayuz));
                    var eksik = new List<string>();
                    foreach (string ad in Liste(k.Hedef))
                    {
                        var c = Bul(form, ad);
                        if (c == null) eksik.Add($"{ad} adlı kontrol yok");
                        else if (k.Beklenen.Trim() != "" && !TurUyar(c, k.Beklenen.Trim())) eksik.Add($"{ad} bir {k.Beklenen.Trim()} değil ({c.GetType().Name})");
                    }
                    return eksik.Count == 0 ? Gecti() : Kaldi(string.Join("; ", eksik) + ".");
                }

                case "calistir":
                {
                    if (derleme?.Success != true) return Kaldi(derlenmedi);
                    return Calistir(k, derleme);
                }

                default:
                    return Kaldi($"Bilinmeyen kontrol tipi: {k.Tip}");
            }
        }

        static string HedefAdi(string hedef) => string.IsNullOrWhiteSpace(hedef) || hedef.Trim() == "*" ? "Proje" : hedef.Trim();

        static IEnumerable<string> Liste(string s) => (s ?? "").Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

        static bool TurUyar(object nesne, string tur)
        {
            for (var t = nesne.GetType(); t != null; t = t.BaseType)
                if (string.Equals(t.Name, tur, StringComparison.OrdinalIgnoreCase)) return true;
            return false;
        }

        static Control Bul(Form form, string ad) =>
            string.Equals(ad, "this", StringComparison.Ordinal) || string.Equals(ad, form.Name, StringComparison.Ordinal)
                ? form
                : form.Controls.Find(ad, true).FirstOrDefault();

        /// <summary>Programı baştan başlatır, ilk açılan formu döndürür.</summary>
        static (Form form, KayitArayuzu arayuz) Baslat(BuildResult derleme)
        {
            var arayuz = new KayitArayuzu();
            Ui.Backend = arayuz;
            ProgramRunner.Run(derleme.Assembly, derleme.Pdb, derleme.DataFiles);
            arayuz.DiyaloglariKapat();
            var form = Application.OpenForms.Count > 0 ? Application.OpenForms[0] : null;
            return (form, arayuz);
        }

        static string BaslamaHatasi(KayitArayuzu a) =>
            a.Hatalar.Count > 0 ? "Program açılırken hata verdi: " + a.Hatalar[0]
            : !string.IsNullOrEmpty(a.Bitis) && a.Bitis != "Program tamamlandı." ? "Program açılamadı: " + a.Bitis
            : "Program bir form açmadı.";

        static KontrolSonucu Calistir(Kontrol k, BuildResult derleme)
        {
            var (form, a) = Baslat(derleme);
            if (form == null) return Kaldi(BaslamaHatasi(a));
            int hataBaslangic = a.Hatalar.Count;

            // Girdiler: "txtN=5; txtM=2"
            foreach (string atama in Liste(k.Girdi))
            {
                int esit = atama.IndexOf('=');
                if (esit <= 0) return Kaldi($"Girdi biçimi hatalı: {atama}");
                string ad = atama[..esit].Trim(), deger = atama[(esit + 1)..].Trim();
                var c = Bul(form, ad);
                if (c == null) return Kaldi($"{ad} adlı kontrol yok.");
                Ui.Execute(() => DegerAta(c, deger));
                a.DiyaloglariKapat();
            }

            // Düğmeler sırayla: "btnFor;btnFor"
            foreach (string ad in Liste(k.Hedef))
            {
                var c = Bul(form, ad);
                if (c == null) return Kaldi($"{ad} adlı düğme yok.");
                Ui.Execute(() => Tikla(c));
                a.DiyaloglariKapat();
                if (Durdu(a, out string neden)) return Kaldi($"{ad} tıklanınca program durdu: {neden}");
                if (a.Hatalar.Count > hataBaslangic) return Kaldi($"{ad} tıklanınca hata oluştu: {a.Hatalar[hataBaslangic]}");
            }

            // Beklenen: "lstSonuc=1|2|3; lblSonuc=Pozitif; MessageBox=Merhaba; hatasiz"
            var farklar = new List<string>();
            foreach (string kosul in Liste(k.Beklenen))
            {
                if (string.Equals(kosul, "hatasiz", StringComparison.OrdinalIgnoreCase)) continue; // hatalar yukarıda yakalandı
                int esit = kosul.IndexOf('=');
                if (esit <= 0) return Kaldi($"Beklenen biçimi hatalı: {kosul}");
                string ad = kosul[..esit].Trim(), beklenen = kosul[(esit + 1)..].Trim();
                if (string.Equals(ad, "MessageBox", StringComparison.OrdinalIgnoreCase))
                {
                    string son = a.Mesajlar.LastOrDefault();
                    if (son == null) farklar.Add($"mesaj kutusu gösterilmedi (beklenen \"{beklenen}\")");
                    else if (!Esit(son, beklenen)) farklar.Add($"mesaj kutusu: beklenen \"{beklenen}\", gösterilen \"{son.Trim()}\"");
                    continue;
                }
                var c = Bul(form, ad);
                if (c == null) { farklar.Add($"{ad} adlı kontrol yok"); continue; }
                var ogeler = Ogeler(c);
                if (ogeler != null)
                {
                    var beklenenOgeler = beklenen == "" ? new List<string>() : beklenen.Split('|').Select(x => x.Trim()).ToList();
                    if (!ogeler.SequenceEqual(beklenenOgeler, StringComparer.Ordinal))
                        farklar.Add($"{ad}: beklenen [{string.Join(", ", beklenenOgeler)}], bulunan [{string.Join(", ", ogeler)}]");
                }
                else if (!Esit(c.Text, beklenen))
                {
                    farklar.Add($"{ad}: beklenen \"{beklenen}\", bulunan \"{(c.Text ?? "").Trim()}\"");
                }
            }
            string girdi = string.IsNullOrWhiteSpace(k.Girdi) ? "" : $" ({k.Girdi.Trim()})";
            return farklar.Count == 0 ? Gecti() : Kaldi(string.Join("; ", farklar) + girdi + ".");
        }

        static bool Durdu(KayitArayuzu a, out string neden)
        {
            neden = a.Bitis;
            return !string.IsNullOrEmpty(a.Bitis) && a.Bitis != "Program tamamlandı.";
        }

        static bool Esit(string a, string b) => string.Equals((a ?? "").Trim(), (b ?? "").Trim(), StringComparison.Ordinal);

        static void DegerAta(Control c, string deger)
        {
            switch (c)
            {
                case NumericUpDown n when decimal.TryParse(deger, NumberStyles.Number, CultureInfo.CurrentCulture, out var d):
                    n.Value = d;
                    break;
                case CheckBox cb when bool.TryParse(deger, out var b):
                    cb.Checked = b;
                    break;
                case RadioButton rb when bool.TryParse(deger, out var b):
                    rb.Checked = b;
                    break;
                default:
                    c.Text = deger;
                    break;
            }
        }

        static void Tikla(Control c)
        {
            if (c is Button b) { b.PerformClick(); return; }
            if (c is RadioButton rb) { rb.PerformClick(); return; }
            var m = c.GetType().GetMethod("OnClick", System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Public);
            m?.Invoke(c, new object[] { EventArgs.Empty });
        }

        /// <summary>ListBox/ComboBox/CheckedListBox öğeleri metin olarak; liste olmayan kontrolde null.</summary>
        static List<string> Ogeler(Control c)
        {
            object items = c.GetType().GetProperty("Items")?.GetValue(c);
            if (items is not System.Collections.IEnumerable e || items is string) return null;
            if (c is TabControl) return null;
            var liste = new List<string>();
            foreach (var o in e) liste.Add((Convert.ToString(o, CultureInfo.CurrentCulture) ?? "").Trim());
            return liste;
        }

        // ------------------------------------------------------------------ çıktı tahmini soruları

        /// <summary>
        /// Soru kodunu çalıştırıp konsol çıktısını döndürür (öğretmen beklenen çıktıyı boş bıraktığında).
        /// Kodda Main yoksa Main içine yerleştirilir.
        /// </summary>
        public static string CiktiHesaplaJson(string kod) => JsonSerializer.Serialize(CiktiHesapla(kod), Json.Ayar);

        public static CiktiSonucu CiktiHesapla(string kod)
        {
            kod ??= "";
            string program = kod.Contains("static void Main") || kod.Contains("static async Task Main")
                ? kod
                : "using System;\nusing System.Collections.Generic;\nusing System.Linq;\nusing System.Text;\n" +
                  "namespace Soru\n{\n    static class Program\n    {\n        static void Main()\n        {\n" + kod + "\n        }\n    }\n}\n";
            var proje = new ProjectInput { Name = "Soru", Namespace = "Soru" };
            proje.Files.Add(new ProjectFile { Name = "Program.cs", Content = program });

            var oncekiArayuz = Ui.Backend;
            int oncekiSinir = Guard.LimitMs;
            var oncekiKultur = (CultureInfo.CurrentCulture, CultureInfo.CurrentUICulture);
            try
            {
                CultureInfo.CurrentCulture = CultureInfo.CurrentUICulture = new CultureInfo("tr-TR");
                var r = new ProjectCompiler().Build(proje);
                if (!r.Success)
                {
                    var d = r.Diagnostics.FirstOrDefault(x => x.Severity == "error");
                    return new CiktiSonucu { Hata = d == null ? "Derlenemedi." : $"Satır {d.Line}: {d.Message}" };
                }
                var a = new KayitArayuzu();
                Ui.Backend = a;
                Guard.LimitMs = SureSiniriMs;
                ProgramRunner.Run(r.Assembly, r.Pdb);
                a.DiyaloglariKapat();
                Console.Out.Flush();
                if (a.Hatalar.Count > 0) return new CiktiSonucu { Hata = a.Hatalar[0], Cikti = a.Cikti.ToString() };
                if (Durdu(a, out string neden)) return new CiktiSonucu { Hata = neden, Cikti = a.Cikti.ToString() };
                return new CiktiSonucu { Basarili = true, Cikti = a.Cikti.ToString() };
            }
            finally
            {
                Ui.Backend = new KayitArayuzu();
                Ui.Reset();
                Ui.Backend = oncekiArayuz;
                Guard.LimitMs = oncekiSinir;
                (CultureInfo.CurrentCulture, CultureInfo.CurrentUICulture) = oncekiKultur;
            }
        }
    }
}
