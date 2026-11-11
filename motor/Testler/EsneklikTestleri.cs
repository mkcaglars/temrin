using System.Text.Json;
using CLesson.Compiler;
using Temrin.Motor;
using Xunit;

namespace Temrin.Testler
{
    /// <summary>
    /// "Önemli olan mantık" kuralı: aynı doğru çözümün biçim varyasyonları tam puan almalı,
    /// yanlış mantıklı çözümler puan almamalı. Ayrıca çoklu durum, kısmi puan ve ad farkı.
    /// </summary>
    [Collection("ui")]
    public class EsneklikTestleri
    {
        // ------------------------------------------------------------------ karşılaştırma kuralları (PHP ile ortak vektörler)

        public static IEnumerable<object[]> Vektorler()
        {
            using var d = JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "esneklik_vektorleri.json")));
            foreach (var v in d.RootElement.GetProperty("vektorler").EnumerateArray())
                yield return new object[] { v.GetProperty("beklenen").GetString(), v.GetProperty("alinan").GetString(), v.GetProperty("mod").GetString(), v.GetProperty("sonuc").GetString() };
        }

        [Theory]
        [MemberData(nameof(Vektorler))]
        public void KarsilastirmaKurallari(string beklenen, string alinan, string mod, string sonuc)
        {
            var m = mod switch { "kati" => Mod.Kati, "icerir" => Mod.Icerir, _ => Mod.Esnek };
            var beklenenUyum = sonuc switch { "tam" => Uyum.Tam, "bicim" => Uyum.Bicim, _ => Uyum.Kaldi };
            Assert.Equal(beklenenUyum, Esneklik.Karsilastir(beklenen, alinan, m));
        }

        [Fact]
        public void KosulIsleclerAyrilir()
        {
            Assert.True(Esneklik.KosulAyir("lblSonuc=Ortalama: 72,5", out var ad, out var mod, out var deger));
            Assert.Equal(("lblSonuc", Mod.Esnek, "Ortalama: 72,5"), (ad, mod, deger));
            Assert.True(Esneklik.KosulAyir("lblSonuc==Geçti", out ad, out mod, out deger));
            Assert.Equal(("lblSonuc", Mod.Kati, "Geçti"), (ad, mod, deger));
            Assert.True(Esneklik.KosulAyir("MessageBox~=72,5", out ad, out mod, out deger));
            Assert.Equal(("MessageBox", Mod.Icerir, "72,5"), (ad, mod, deger));
            Assert.True(Esneklik.KosulAyir("lstSonuc=", out ad, out mod, out deger));
            Assert.Equal(("lstSonuc", Mod.Esnek, ""), (ad, mod, deger));
        }

        // ------------------------------------------------------------------ "Not ortalaması" temrini

        static readonly List<Kontrol> Kontroller = new()
        {
            new() { No = "K1", Tip = "kontrol_var", Hedef = "txtNotlar;lblSonuc;btnHesapla" },
            new() { No = "K2", Tip = "kod_yapisi", Hedef = "btnHesapla.Click", Beklenen = "for|foreach|while" },
            new() { No = "K3", Tip = "calistir", Hedef = "btnHesapla", Girdi = "txtNotlar=40 90 85 75 || txtNotlar=50 60", Beklenen = "lblSonuc=Ortalama: 72,5 || lblSonuc=Ortalama: 55" },
            new() { No = "K4", Tip = "kod_icerir", Hedef = "btnHesapla.Click", Beklenen = "*.Split( veya Split(" },
        };

        /// <summary>C# Form Stüdyosu'nun ürettiği tasarımcı kodu biçimi: alan adı = Name, Click += new EventHandler(metot).</summary>
        static string Tasarimci((string tur, string ad, string metin, string tikla)[] kontroller)
        {
            var sb = new System.Text.StringBuilder("namespace NotTemrin\n{\n    partial class Form1\n    {\n        private void InitializeComponent()\n        {\n");
            foreach (var (tur, ad, _, _) in kontroller) sb.Append($"            this.{ad} = new System.Windows.Forms.{tur}();\n");
            foreach (var (_, ad, metin, tikla) in kontroller)
            {
                sb.Append($"            this.{ad}.Name = \"{ad}\";\n");
                if (metin != null) sb.Append($"            this.{ad}.Text = \"{metin}\";\n");
                if (tikla != null) sb.Append($"            this.{ad}.Click += new System.EventHandler(this.{tikla});\n");
                sb.Append($"            this.Controls.Add(this.{ad});\n");
            }
            sb.Append("            this.Name = \"Form1\";\n        }\n");
            foreach (var (tur, ad, _, _) in kontroller) sb.Append($"        private System.Windows.Forms.{tur} {ad};\n");
            sb.Append("    }\n}\n");
            return sb.ToString();
        }

        static readonly (string, string, string, string)[] Standart =
        {
            ("TextBox", "txtNotlar", null, null), ("Label", "lblSonuc", null, null), ("Button", "btnHesapla", "Hesapla", "btnHesapla_Click"),
        };

        const string DogruGovde = @"
            string[] parca = txtNotlar.Text.Split(' ', StringSplitOptions.RemoveEmptyEntries);
            double toplam = 0;
            for (int i = 0; i < parca.Length; i++) toplam += double.Parse(parca[i]);
            double ort = toplam / parca.Length;
            lblSonuc.Text = ""Ortalama: "" + ort;";

        static Dictionary<string, KontrolSonucu> Degerlendir(string govde, (string, string, string, string)[] kontroller = null, string metot = "btnHesapla_Click")
        {
            var p = new ProjectInput { Name = "NotTemrin", Namespace = "NotTemrin" };
            p.Files.Add(new ProjectFile { Name = "Program.cs", Content = "using System.Windows.Forms; namespace NotTemrin { static class Program { static void Main() { Application.Run(new Form1()); } } }" });
            p.Files.Add(new ProjectFile
            {
                Name = "Form1.cs",
                Content = "using System;\nusing System.Windows.Forms;\nnamespace NotTemrin\n{\n    public partial class Form1 : Form\n    {\n        public Form1() { InitializeComponent(); }\n" +
                          $"        private void {metot}(object sender, EventArgs e)\n        {{{govde}\n        }}\n    }}\n}}\n",
            });
            p.Files.Add(new ProjectFile { Name = "Form1.Designer.cs", Content = Tasarimci(kontroller ?? Standart) });
            var r = Degerlendirici.Degerlendir(p, Kontroller);
            Assert.True(r.Derlendi, string.Join("\n", r.Hatalar));
            return r.Sonuclar.ToDictionary(s => s.No);
        }

        static void TamPuan(Dictionary<string, KontrolSonucu> s)
        {
            foreach (var k in s.Values) Assert.True(k.Gecti && k.Oran == 1, $"{k.No}: oran {k.Oran} — {k.Mesaj}");
        }

        [Fact]
        public void DogruCozumTamPuanBicimNotuYok()
        {
            var s = Degerlendir(DogruGovde);
            TamPuan(s);
            Assert.All(s.Values, k => Assert.False(k.BicimFarki || k.AdFarki));
            Assert.Equal(2, s["K3"].Durum);
            Assert.Equal(2, s["K3"].Gecen);
        }

        [Fact]
        public void Varyasyon1_Bosluklar()
        {
            var s = Degerlendir(DogruGovde.Replace(@"""Ortalama: "" + ort", @"""  Ortalama :   "" + ort + ""  """));
            TamPuan(s);
            Assert.True(s["K3"].BicimFarki);
            Assert.Contains(s["K3"].Notlar, n => n.StartsWith("Çıktı biçimi farklı: beklenen \"Ortalama: 72,5\""));
        }

        [Fact]
        public void Varyasyon2_BuyukKucukHarf()
        {
            var s = Degerlendir(DogruGovde.Replace(@"""Ortalama: """, @"""ORTALAMA: """));
            TamPuan(s);
            Assert.True(s["K3"].BicimFarki);
        }

        [Fact]
        public void Varyasyon3_AyracVeOndalikNokta()
        {
            var s = Degerlendir(DogruGovde.Replace(@"""Ortalama: "" + ort", @"""ortalama="" + ort.ToString(System.Globalization.CultureInfo.InvariantCulture)"));
            TamPuan(s);
            Assert.Contains("Çıktı biçimi farklı: beklenen \"Ortalama: 72,5\", alınan \"ortalama=72.5\"", s["K3"].Notlar);
        }

        [Fact]
        public void Varyasyon4_EkMetin()
        {
            var s = Degerlendir(DogruGovde.Replace(@"""Ortalama: "" + ort", @"""Sınıfın not ortalaması: "" + ort + "" puan"""));
            TamPuan(s);
            Assert.True(s["K3"].BicimFarki);
        }

        [Fact]
        public void Varyasyon5_ForYerineForeach()
        {
            var s = Degerlendir(DogruGovde.Replace("for (int i = 0; i < parca.Length; i++) toplam += double.Parse(parca[i]);",
                                                   "foreach (string p in parca)\n            {\n                toplam += double.Parse(p);\n            }"));
            TamPuan(s);
            Assert.False(s["K3"].BicimFarki);
        }

        [Fact]
        public void WhileIleDeEsdegerKabulEdilir()
        {
            var s = Degerlendir(DogruGovde.Replace("for (int i = 0; i < parca.Length; i++) toplam += double.Parse(parca[i]);",
                                                   "int j = 0; while (j < parca.Length) { toplam += double.Parse(parca[j]); j++; }"));
            TamPuan(s);
        }

        [Fact]
        public void YanlisSonucPuanAlmaz()
        {
            // Bölen yanlış (eleman sayısı + 1): iki durumda da sonuç yanlış.
            var s = Degerlendir(DogruGovde.Replace("toplam / parca.Length", "toplam / (parca.Length + 1)"));
            Assert.Equal(0, s["K3"].Oran);
            Assert.Contains("lblSonuc: beklenen \"Ortalama: 72,5\", bulunan \"Ortalama: 58\" (txtNotlar=40 90 85 75).", s["K3"].Mesaj);
            Assert.False(s["K3"].BicimFarki);
        }

        [Fact]
        public void EksikAdimPuanAlmaz()
        {
            // Döngü yok, yalnızca ilk not alınıyor: yapı da sonuç da yanlış.
            var s = Degerlendir(@"
            string[] parca = txtNotlar.Text.Split(' ');
            double ort = double.Parse(parca[0]);
            lblSonuc.Text = ""Ortalama: "" + ort;");
            Assert.Equal(0, s["K2"].Oran);
            Assert.Equal("btnHesapla.Click içinde for döngüsü / foreach döngüsü / while döngüsü yok.", s["K2"].Mesaj);
            Assert.Equal(0, s["K3"].Oran);
        }

        [Fact]
        public void SabitCiktiYalnizcaBirDurumdanGecer()
        {
            // Hesaplamadan "Ortalama: 72,5" yazan çözüm: ikinci girdi bunu yakalar, kısmi puan (1/2).
            var s = Degerlendir(@"
            foreach (var p in txtNotlar.Text.Split(' ')) { }
            lblSonuc.Text = ""Ortalama: 72,5"";");
            Assert.Equal(0.5, s["K3"].Oran);
            Assert.Equal(1, s["K3"].Gecen);
            Assert.False(s["K3"].Gecti);
            Assert.Contains("txtNotlar=50 60", s["K3"].Mesaj);
        }

        [Fact]
        public void FazladanSayiYazanCiktiKabulEdilmez()
        {
            // "Ek metin" yalnızca sayılar aynıysa kabul: toplamı da yazan çıktıyı esnek mod geçirmez (içerir modu geçirir).
            var s = Degerlendir(DogruGovde.Replace(@"""Ortalama: "" + ort", @"""Toplam: "" + toplam + "" Ortalama: "" + ort"));
            Assert.Equal(0, s["K3"].Oran);
        }

        [Fact]
        public void AdFarkiTurVeMetinleBulunurKismiKesinti()
        {
            // Öğrenci düğmeye btnHesapla yerine button1 adını vermiş (Text "Hesapla"): çalıştırma testi düğmeyi bulur,
            // ad farkı notu düşülür; kontrol adları kontrolünde yalnızca o ad yarım puan.
            var kontroller = new[] { ("TextBox", "txtNotlar", (string)null, (string)null), ("Label", "lblSonuc", null, null), ("Button", "button1", "Hesapla", "button1_Click") };
            var s = Degerlendir(DogruGovde, kontroller, "button1_Click");
            Assert.True(s["K3"].Gecti, s["K3"].Mesaj);
            Assert.True(s["K3"].AdFarki);
            Assert.Contains("Ad farkı: \"btnHesapla\" bulunamadı, aynı işi gören \"button1\" kullanıldı", s["K3"].Notlar);
            Assert.True(s["K2"].Gecti, s["K2"].Mesaj);
            Assert.Contains("Ad farkı: \"btnHesapla\" yerine \"button1\" kullanılmış", s["K2"].Notlar);
            Assert.Equal(Math.Round(2.5 / 3, 4), s["K1"].Oran);
            Assert.Contains("btnHesapla adı kullanılmamış", s["K1"].Mesaj);
        }

        [Fact]
        public void AdYazimiFarkiTamPuanNotlu()
        {
            var kontroller = new[] { ("TextBox", "TxtNotlar", (string)null, (string)null), ("Label", "lbl_sonuc", null, null), ("Button", "btnHesapla", "Hesapla", "btnHesapla_Click") };
            var s = Degerlendir(DogruGovde.Replace("txtNotlar.", "TxtNotlar.").Replace("lblSonuc.", "lbl_sonuc."), kontroller);
            TamPuan(s);
            // Büyük-küçük harf farkını WinForms'un Controls.Find'ı zaten yok sayar (not düşülmez); alt çizgi farkı yazım farkı notudur.
            Assert.DoesNotContain(s["K1"].Notlar, n => n.Contains("TxtNotlar"));
            Assert.Contains("Ad yazımı farklı: \"lblSonuc\" yerine \"lbl_sonuc\"", s["K1"].Notlar);
            Assert.True(s["K3"].AdFarki);
        }

        [Fact]
        public void BirAdBelirsizseTahminEdilmez()
        {
            // İki düğme var, hiçbiri adla/metinle/olayla eşleşmiyor: rastgele seçilmez, test kalır.
            var kontroller = new[] { ("TextBox", "txtNotlar", (string)null, (string)null), ("Label", "lblSonuc", null, null),
                                     ("Button", "button1", "Tamam", "button1_Click"), ("Button", "button2", "Sil", null) };
            var s = Degerlendir(DogruGovde, kontroller, "button1_Click");
            Assert.Equal(0, s["K3"].Oran);
            Assert.Contains("btnHesapla adlı düğme yok", s["K3"].Mesaj);
        }

        [Fact]
        public void KodIcerirThisVeJokerYokSayar()
        {
            var s = Degerlendir(DogruGovde.Replace("txtNotlar.Text.Split(", "this.txtNotlar.Text.Split("));
            Assert.True(s["K4"].Gecti, s["K4"].Mesaj);
        }

        [Fact]
        public void KodYapisiGruplariAyriPuanlanir()
        {
            var p = new ProjectInput { Name = "D", Namespace = "D" };
            p.Files.Add(new ProjectFile { Name = "Program.cs", Content = "namespace D { static class Program { static void Main() { int t = 0; for (int i = 0; i < 3; i++) { t += i; } System.Console.WriteLine(t); } } }" });
            var r = Degerlendirici.Degerlendir(p, new List<Kontrol>
            {
                new() { No = "A", Tip = "kod_yapisi", Hedef = "*", Beklenen = "for veya foreach; if; break" },
            }).Sonuclar[0];
            Assert.Equal(Math.Round(1.0 / 3, 4), r.Oran);
            Assert.Equal("Proje içinde if karar yapısı, break yok.", r.Mesaj);
        }
    }
}
