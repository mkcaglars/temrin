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

        static KontrolSonucu Gecti() => new() { Gecti = true, Oran = 1 };
        static KontrolSonucu Kaldi(string mesaj) => new() { Gecti = false, Oran = 0, Mesaj = mesaj };

        /// <summary>Kısmi sonuç. Oran 1 ise geçti; değilse mesaj eksiği anlatır. Notlar kabul edilen farklardır.</summary>
        static KontrolSonucu Oranli(double oran, string mesaj, List<string> notlar, bool bicim = false, bool ad = false)
        {
            oran = Math.Clamp(oran, 0, 1);
            return new KontrolSonucu
            {
                Oran = Math.Round(oran, 4), Gecti = oran >= 1, Mesaj = oran >= 1 ? "" : mesaj,
                Notlar = notlar.Distinct().ToList(), BicimFarki = bicim, AdFarki = ad,
            };
        }

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
                    var notlar = new List<string>();
                    var dugumler = HedefDugumleri(k.Hedef, yapi, derleme, notlar, out string neden);
                    if (dugumler == null) return Kaldi(neden);
                    var (grup, eksik) = KodYapisi.YapiDenetle(dugumler, k.Beklenen);
                    double oran = grup == 0 ? 1 : (double)(grup - eksik.Count) / grup;
                    return Oranli(oran, $"{HedefAdi(k.Hedef)} içinde {string.Join(", ", eksik)} yok.", notlar, ad: notlar.Count > 0);
                }

                case "kod_icerir":
                {
                    var notlar = new List<string>();
                    var dugumler = HedefDugumleri(k.Hedef, yapi, derleme, notlar, out string neden);
                    if (dugumler == null) return Kaldi(neden);
                    return KodYapisi.Iceriyor(dugumler, k.Beklenen)
                        ? Oranli(1, "", notlar, ad: notlar.Count > 0)
                        : Kaldi($"{HedefAdi(k.Hedef)} içinde \"{k.Beklenen.Trim()}\" yok.");
                }

                case "kontrol_var":
                {
                    if (derleme?.Success != true) return Kaldi(derlenmedi);
                    var (form, arayuz) = Baslat(derleme);
                    if (form == null) return Kaldi(BaslamaHatasi(arayuz));
                    var adlar = Liste(k.Hedef).ToList();
                    if (adlar.Count == 0) return Gecti();
                    string tur = k.Beklenen.Trim();
                    var eksik = new List<string>();
                    var notlar = new List<string>();
                    double puan = 0;
                    foreach (string ad in adlar)
                    {
                        var c = Coz(form, ad, tur, adlar, out var nasil, yapi);
                        if (c == null) eksik.Add($"{ad} adlı kontrol yok");
                        else if (tur != "" && !TurUyar(c, tur)) eksik.Add($"{ad} bir {tur} değil ({c.GetType().Name})");
                        else if (nasil == AdEslesme.Tam) puan += 1;
                        else if (nasil == AdEslesme.Yazim) { puan += 1; notlar.Add($"Ad yazımı farklı: \"{ad}\" yerine \"{c.Name}\""); }
                        else { puan += 0.5; eksik.Add($"{ad} adı kullanılmamış (aynı işi gören \"{c.Name}\" kabul edildi, yarım puan)"); }
                    }
                    // Kontrol adı bu kontrolün kendi konusu: ad farkı kesintisi oranla verilir, ayrıca kesilmez.
                    return Oranli(puan / adlar.Count, string.Join("; ", eksik) + ".", notlar);
                }

                case "calistir":
                {
                    if (derleme?.Success != true) return Kaldi(derlenmedi);
                    return Calistir(k, derleme, yapi);
                }

                default:
                    return Kaldi($"Bilinmeyen kontrol tipi: {k.Tip}");
            }
        }

        static string HedefAdi(string hedef) => string.IsNullOrWhiteSpace(hedef) || hedef.Trim() == "*" ? "Proje" : hedef.Trim();

        static IEnumerable<string> Liste(string s) => (s ?? "").Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

        /// <summary>"girdi1 || girdi2" → durumlar. Boşsa tek boş durum.</summary>
        static List<string> Durumlar(string s) =>
            string.IsNullOrWhiteSpace(s) ? new List<string> { "" } : s.Split("||").Select(x => x.Trim()).ToList();

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

        enum AdEslesme { Tam, Yazim, Tur }

        /// <summary>Formun bu adlı alanındaki kontrol (tasarımcının ürettiği "private Button btnFor;" alanı).</summary>
        static Control Alan(Form form, string ad) =>
            form.GetType().GetField(ad, System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Public)
                ?.GetValue(form) as Control;

        static IEnumerable<Control> Tumu(Control kok)
        {
            foreach (Control c in kok.Controls)
            {
                yield return c;
                foreach (var alt in Tumu(c)) yield return alt;
            }
        }

        /// <summary>Kontrol adı öneklerinden beklenen tür (btnHesapla → Button).</summary>
        static readonly Dictionary<string, Type> OnekTurleri = new(StringComparer.Ordinal)
        {
            ["txt"] = typeof(TextBoxBase), ["tb"] = typeof(TextBoxBase), ["msk"] = typeof(TextBoxBase), ["rtb"] = typeof(TextBoxBase),
            ["lbl"] = typeof(Label), ["btn"] = typeof(Button), ["lst"] = typeof(ListBox), ["lb"] = typeof(ListBox),
            ["cmb"] = typeof(ComboBox), ["cb"] = typeof(ComboBox), ["chk"] = typeof(CheckBox), ["rdb"] = typeof(RadioButton),
            ["rb"] = typeof(RadioButton), ["nud"] = typeof(NumericUpDown), ["dgv"] = typeof(DataGridView), ["grp"] = typeof(GroupBox),
            ["gb"] = typeof(GroupBox), ["pnl"] = typeof(Panel), ["dtp"] = typeof(DateTimePicker), ["pb"] = typeof(PictureBox),
        };

        static Type TurBul(string ad, string tur)
        {
            if (!string.IsNullOrWhiteSpace(tur))
            {
                var t = typeof(Control).Assembly.GetTypes().FirstOrDefault(x => typeof(Control).IsAssignableFrom(x) && string.Equals(x.Name, tur.Trim(), StringComparison.OrdinalIgnoreCase));
                if (t != null) return t;
            }
            var (onek, _) = Esneklik.AdParcala(ad);
            return OnekTurleri.TryGetValue(onek, out var o) ? o : null;
        }

        /// <summary>
        /// Kontrolü bulur. Sıra: tam ad → yalnızca yazımı farklı ad (büyük-küçük harf, _, Türkçe harf) →
        /// adın önekinden anlaşılan türde, metni ya da adı adın köküyle uyan tek kontrol → formda o türden tek kontrol.
        /// Aynı kontrolde adı geçen diğer kontroller (digerAdlar) yedek olarak seçilmez.
        /// </summary>
        static Control Coz(Form form, string ad, string tur, IEnumerable<string> digerAdlar, out AdEslesme nasil, KodYapisi yapi = null)
        {
            nasil = AdEslesme.Tam;
            var c = Bul(form, ad);
            if (c != null) return c;
            // Koddaki alan adı istenen ad ama Name özelliği farklı (btnBreak alanı, Name = "btnKes").
            c = Alan(form, ad);
            if (c != null) { nasil = AdEslesme.Yazim; return c; }

            var dolu = new HashSet<string>(digerAdlar.Where(x => x != ad && Bul(form, x) != null), StringComparer.Ordinal);
            var hepsi = Tumu(form).Where(x => !dolu.Contains(x.Name)).ToList();
            string n = Esneklik.AdNormal(ad);
            var yazim = hepsi.Where(x => Esneklik.AdNormal(x.Name) == n).ToList();
            if (yazim.Count == 1) { nasil = AdEslesme.Yazim; return yazim[0]; }

            var t = TurBul(ad, tur);
            if (t == null) return null;
            var ayniTur = hepsi.Where(t.IsInstanceOfType).ToList();
            string kok = Esneklik.AdNormal(Esneklik.AdParcala(ad).kok);
            if (kok.Length >= 2)
            {
                var uyan = ayniTur.Where(x => Esneklik.AdNormal(x.Text) == kok || Esneklik.AdNormal(x.Name).Contains(kok, StringComparison.Ordinal)).ToList();
                if (uyan.Count == 1) { nasil = AdEslesme.Tur; return uyan[0]; }
                // Olay işlevine göre: adı farklı düğme hâlâ btnBreak_Click gibi adın kökünü taşıyan metoda bağlıysa.
                if (yapi != null)
                {
                    var metotla = yapi.OlayMetotlari("Click").Where(b => Esneklik.AdNormal(b.metot).Contains(kok, StringComparison.Ordinal))
                        .Select(b => b.nesne).Distinct().ToList();
                    var olayla = ayniTur.Where(x => metotla.Any(m => m == x.Name || ReferenceEquals(Alan(form, m), x))).ToList();
                    if (olayla.Count == 1) { nasil = AdEslesme.Tur; return olayla[0]; }
                }
            }
            if (ayniTur.Count == 1) { nasil = AdEslesme.Tur; return ayniTur[0]; }
            return null;
        }

        /// <summary>
        /// kod_yapisi / kod_icerir hedefinin kod düğümleri. Olay bağlantısı adla bulunamazsa, önce yazımı farklı ada,
        /// proje derleniyorsa formdaki aynı türden kontrole bakılır; bulunursa "ad farkı" notu düşülür.
        /// </summary>
        static List<Microsoft.CodeAnalysis.SyntaxNode> HedefDugumleri(string hedef, KodYapisi yapi, BuildResult derleme, List<string> notlar, out string neden)
        {
            var d = yapi.Hedef(hedef, out neden);
            if (d != null) return d;
            hedef = (hedef ?? "").Trim();
            int nokta = hedef.LastIndexOf('.');
            if (nokta <= 0) return null;
            string ad = hedef[..nokta], olay = hedef[(nokta + 1)..];

            var adaylar = yapi.OlayBaglantiAdlari(olay).Where(x => Esneklik.AdNormal(x) == Esneklik.AdNormal(ad)).Distinct().ToList();
            string bulunan = adaylar.Count == 1 ? adaylar[0] : null;
            if (bulunan == null && derleme?.Success == true)
            {
                var (form, _) = Baslat(derleme);
                var c = form == null ? null : Coz(form, ad, null, Array.Empty<string>(), out _, yapi);
                if (c != null && c.Name != ad) bulunan = c.Name;
            }
            if (bulunan == null) return null;
            d = yapi.Hedef($"{bulunan}.{olay}", out _);
            if (d == null) return null;
            notlar.Add($"Ad farkı: \"{ad}\" yerine \"{bulunan}\" kullanılmış");
            return d;
        }

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

        /// <summary>
        /// Çalıştırma testi. Girdi ve beklenen "||" ile birden çok duruma ayrılabilir (girdi1 || girdi2 → beklenen1 || beklenen2);
        /// her durum programı baştan başlatır ve ayrı değerlendirilir. Oran = geçen durum / durum sayısı.
        /// </summary>
        static KontrolSonucu Calistir(Kontrol k, BuildResult derleme, KodYapisi yapi)
        {
            var girdiler = Durumlar(k.Girdi);
            var beklenenler = Durumlar(k.Beklenen);
            if (girdiler.Count > 1 && beklenenler.Count > 1 && girdiler.Count != beklenenler.Count)
                return Kaldi($"Girdi ({girdiler.Count}) ve beklenen ({beklenenler.Count}) durum sayıları farklı.");
            int n = Math.Max(girdiler.Count, beklenenler.Count);
            var notlar = new List<string>();
            var hatalar = new List<string>();
            bool bicim = false, ad = false;
            int gecen = 0;
            for (int i = 0; i < n; i++)
            {
                var d = Durum(k.Hedef, girdiler.Count == 1 ? girdiler[0] : girdiler[i], beklenenler.Count == 1 ? beklenenler[0] : beklenenler[i], derleme, yapi);
                if (d.uyum == Uyum.Kaldi) hatalar.Add(d.mesaj); else gecen++;
                bicim |= d.uyum == Uyum.Bicim;
                ad |= d.adFarki;
                notlar.AddRange(d.notlar);
            }
            var s = Oranli((double)gecen / n, string.Join(" ", hatalar.Distinct()), notlar, bicim, ad);
            s.Durum = n;
            s.Gecen = gecen;
            return s;
        }

        static (Uyum uyum, string mesaj, List<string> notlar, bool adFarki) Durum(string hedef, string girdi, string beklenen, BuildResult derleme, KodYapisi yapi)
        {
            var notlar = new List<string>();
            bool adFarki = false;
            var (form, a) = Baslat(derleme);
            if (form == null) return (Uyum.Kaldi, BaslamaHatasi(a), notlar, false);
            int hataBaslangic = a.Hatalar.Count;
            string girdiBilgi = string.IsNullOrWhiteSpace(girdi) ? "" : $" ({girdi.Trim()})";

            // Bu durumda adı geçen bütün kontroller: yedek eşleştirmede birbirinin yerine seçilmesinler.
            var adlar = Liste(hedef).Concat(Liste(girdi).Select(x => x.Split('=')[0].Trim()))
                .Concat(Liste(beklenen).Select(x => Esneklik.KosulAyir(x, out var ad, out _, out _) ? ad : "")).Where(x => x != "").ToList();

            Control Kontrol(string ad, string tur)
            {
                var c = Coz(form, ad, tur, adlar, out var nasil, yapi);
                if (c != null && nasil != AdEslesme.Tam)
                {
                    adFarki = true;
                    notlar.Add(nasil == AdEslesme.Yazim
                        ? $"Ad yazımı farklı: \"{ad}\" yerine \"{c.Name}\""
                        : $"Ad farkı: \"{ad}\" bulunamadı, aynı işi gören \"{c.Name}\" kullanıldı");
                }
                return c;
            }

            // Girdiler: "txtN=5; txtM=2"
            foreach (string atama in Liste(girdi))
            {
                int esit = atama.IndexOf('=');
                if (esit <= 0) return (Uyum.Kaldi, $"Girdi biçimi hatalı: {atama}", notlar, adFarki);
                string ad = atama[..esit].Trim(), deger = atama[(esit + 1)..].Trim();
                var c = Kontrol(ad, null);
                if (c == null) return (Uyum.Kaldi, $"{ad} adlı kontrol yok.", notlar, adFarki);
                Ui.Execute(() => DegerAta(c, deger));
                a.DiyaloglariKapat();
            }

            // Düğmeler sırayla: "btnFor;btnFor"
            foreach (string ad in Liste(hedef))
            {
                var c = Kontrol(ad, null);
                if (c == null) return (Uyum.Kaldi, $"{ad} adlı düğme yok.", notlar, adFarki);
                Ui.Execute(() => Tikla(c));
                a.DiyaloglariKapat();
                if (Durdu(a, out string neden)) return (Uyum.Kaldi, $"{ad} tıklanınca program durdu: {neden}", notlar, adFarki);
                if (a.Hatalar.Count > hataBaslangic) return (Uyum.Kaldi, $"{ad} tıklanınca hata oluştu: {a.Hatalar[hataBaslangic]}{girdiBilgi}.", notlar, adFarki);
            }

            // Beklenen: "lstSonuc=1|2|3; lblSonuc=Pozitif; MessageBox~=72,5; lblAd==Ali; hatasiz"
            var farklar = new List<string>();
            bool bicim = false;
            foreach (string kosul in Liste(beklenen))
            {
                if (string.Equals(kosul, "hatasiz", StringComparison.OrdinalIgnoreCase)) continue; // hatalar yukarıda yakalandı
                if (!Esneklik.KosulAyir(kosul, out string ad, out var mod, out string bekl)) return (Uyum.Kaldi, $"Beklenen biçimi hatalı: {kosul}", notlar, adFarki);
                if (string.Equals(ad, "MessageBox", StringComparison.OrdinalIgnoreCase))
                {
                    string son = a.Mesajlar.LastOrDefault();
                    var u = son == null ? Uyum.Kaldi : Esneklik.Karsilastir(bekl, son, mod);
                    if (son == null) farklar.Add($"mesaj kutusu gösterilmedi (beklenen \"{bekl}\")");
                    else if (u == Uyum.Kaldi) farklar.Add($"mesaj kutusu: beklenen \"{bekl}\", gösterilen \"{son.Trim()}\"");
                    else if (u == Uyum.Bicim) { bicim = true; notlar.Add($"Mesaj biçimi farklı: beklenen \"{bekl}\", alınan \"{son.Trim()}\""); }
                    continue;
                }
                var c = Kontrol(ad, null);
                if (c == null) { farklar.Add($"{ad} adlı kontrol yok"); continue; }
                var ogeler = Ogeler(c);
                if (ogeler != null)
                {
                    var beklenenOgeler = bekl == "" ? new List<string>() : bekl.Split('|').Select(x => x.Trim()).ToList();
                    var u = Esneklik.ListeKarsilastir(beklenenOgeler, ogeler, mod);
                    if (u == Uyum.Kaldi) farklar.Add($"{ad}: beklenen [{string.Join(", ", beklenenOgeler)}], bulunan [{string.Join(", ", ogeler)}]");
                    else if (u == Uyum.Bicim) { bicim = true; notlar.Add($"Liste biçimi farklı: beklenen [{string.Join(", ", beklenenOgeler)}], alınan [{string.Join(", ", ogeler)}]"); }
                }
                else
                {
                    string metin = (c.Text ?? "").Trim();
                    var u = Esneklik.Karsilastir(bekl, metin, mod);
                    if (u == Uyum.Kaldi) farklar.Add($"{ad}: beklenen \"{bekl}\", bulunan \"{metin}\"");
                    else if (u == Uyum.Bicim) { bicim = true; notlar.Add($"Çıktı biçimi farklı: beklenen \"{bekl}\", alınan \"{metin}\""); }
                }
            }
            if (farklar.Count > 0) return (Uyum.Kaldi, string.Join("; ", farklar) + girdiBilgi + ".", notlar.Where(x => x.StartsWith("Ad")).ToList(), adFarki);
            return (bicim ? Uyum.Bicim : Uyum.Tam, "", notlar, adFarki);
        }

        static bool Durdu(KayitArayuzu a, out string neden)
        {
            neden = a.Bitis;
            return !string.IsNullOrEmpty(a.Bitis) && a.Bitis != "Program tamamlandı.";
        }

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
