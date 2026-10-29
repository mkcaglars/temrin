using CLesson.Compiler;
using Microsoft.VisualBasic.FileIO;
using Temrin.Motor;
using Xunit;

namespace Temrin.Testler
{
    [Collection("ui")]
    public class DegerlendiriciTestleri
    {
        const string ProgramCs = @"using System;
using System.Windows.Forms;
namespace DonguTemrin
{
    internal static class Program
    {
        [STAThread]
        static void Main() { Application.Run(new Form1()); }
    }
}";

        const string Designer = @"namespace DonguTemrin
{
    partial class Form1
    {
        private void InitializeComponent()
        {
            this.txtN = new System.Windows.Forms.TextBox();
            this.lstSonuc = new System.Windows.Forms.ListBox();
            this.btnFor = new System.Windows.Forms.Button();
            this.btnWhile = new System.Windows.Forms.Button();
            this.btnDoWhile = new System.Windows.Forms.Button();
            this.btnBreak = new System.Windows.Forms.Button();
            this.txtN.Name = ""txtN"";
            this.lstSonuc.Name = ""lstSonuc"";
            this.btnFor.Name = ""btnFor"";
            this.btnFor.Click += new System.EventHandler(this.btnFor_Click);
            this.btnWhile.Name = ""btnWhile"";
            this.btnWhile.Click += new System.EventHandler(this.btnWhile_Click);
            this.btnDoWhile.Name = ""btnDoWhile"";
            this.btnDoWhile.Click += new System.EventHandler(this.btnDoWhile_Click);
            this.btnBreak.Name = ""btnBreak"";
            this.btnBreak.Click += new System.EventHandler(this.btnBreak_Click);
            this.Controls.Add(this.txtN);
            this.Controls.Add(this.lstSonuc);
            this.Controls.Add(this.btnFor);
            this.Controls.Add(this.btnWhile);
            this.Controls.Add(this.btnDoWhile);
            this.Controls.Add(this.btnBreak);
            this.Name = ""Form1"";
        }
        private System.Windows.Forms.TextBox txtN;
        private System.Windows.Forms.ListBox lstSonuc;
        private System.Windows.Forms.Button btnFor;
        private System.Windows.Forms.Button btnWhile;
        private System.Windows.Forms.Button btnDoWhile;
        private System.Windows.Forms.Button btnBreak;
    }
}";

        const string DogruForm = @"using System;
using System.Windows.Forms;
namespace DonguTemrin
{
    public partial class Form1 : Form
    {
        public Form1() { InitializeComponent(); }

        private void btnFor_Click(object sender, EventArgs e)
        {
            lstSonuc.Items.Clear();
            int n = int.Parse(txtN.Text);
            for (int i = 1; i <= n; i++) lstSonuc.Items.Add(i);
        }

        private void btnWhile_Click(object sender, EventArgs e)
        {
            lstSonuc.Items.Clear();
            int n = int.Parse(txtN.Text);
            while (n >= 1) { lstSonuc.Items.Add(n); n--; }
        }

        private void btnDoWhile_Click(object sender, EventArgs e)
        {
            lstSonuc.Items.Clear();
            int n = int.Parse(txtN.Text);
            do { lstSonuc.Items.Add(n); n--; } while (n >= 1);
        }

        private void btnBreak_Click(object sender, EventArgs e)
        {
            lstSonuc.Items.Clear();
            Yaz(int.Parse(txtN.Text));
        }

        // Döngü yardımcı metotta: olay metodundan çağrıldığı için kontrol yine bulur.
        void Yaz(int n)
        {
            for (int i = 1; i <= n; i++)
            {
                if (i % 3 == 0) break;
                lstSonuc.Items.Add(i);
            }
        }
    }
}";

        static ProjectInput Proje(string form, string designer = Designer)
        {
            var p = new ProjectInput { Name = "DonguTemrin", Namespace = "DonguTemrin" };
            p.Files.Add(new ProjectFile { Name = "Program.cs", Content = ProgramCs });
            p.Files.Add(new ProjectFile { Name = "Form1.cs", Content = form });
            p.Files.Add(new ProjectFile { Name = "Form1.Designer.cs", Content = designer });
            return p;
        }

        /// <summary>sablon/temrin-3-donguler.csv içindeki kontrol satırları.</summary>
        static List<Kontrol> Temrin3()
        {
            var liste = new List<Kontrol>();
            using var p = new TextFieldParser(Path.Combine(AppContext.BaseDirectory, "temrin-3-donguler.csv"), System.Text.Encoding.UTF8)
            { TextFieldType = FieldType.Delimited, HasFieldsEnclosedInQuotes = true, TrimWhiteSpace = false };
            p.SetDelimiters(";");
            var baslik = p.ReadFields();
            int Sutun(string ad) => Array.IndexOf(baslik, ad);
            while (!p.EndOfData)
            {
                var s = p.ReadFields();
                if (s[Sutun("tur")] != "kontrol") continue;
                liste.Add(new Kontrol { No = s[Sutun("no")], Tip = s[Sutun("tip")], Hedef = s[Sutun("hedef")], Girdi = s[Sutun("girdi")], Beklenen = s[Sutun("beklenen")] });
            }
            return liste;
        }

        static Dictionary<string, KontrolSonucu> Degerlendir(string form, string designer = Designer)
        {
            var r = Degerlendirici.Degerlendir(Proje(form, designer), Temrin3());
            return r.Sonuclar.ToDictionary(s => s.No);
        }

        [Fact]
        public void DogruCozumTumKontrollerdenGecer()
        {
            var s = Degerlendir(DogruForm);
            Assert.Equal(17, s.Count);
            Assert.All(s.Values, x => Assert.True(x.Gecti, x.No + ": " + x.Mesaj));
        }

        [Fact]
        public void ClearUnutulursaIkiKezBasmaTestiKalir()
        {
            var s = Degerlendir(DogruForm.Replace("lstSonuc.Items.Clear();\n            int n = int.Parse(txtN.Text);\n            for", "int n = int.Parse(txtN.Text);\n            for"));
            Assert.False(s["K5"].Gecti);
            Assert.Contains("beklenen [1, 2, 3], bulunan [1, 2, 3, 1, 2, 3]", s["K5"].Mesaj);
            Assert.True(s["K7"].Gecti);
        }

        [Fact]
        public void ForYerineWhileKullanilirsaYapiKalirDavranisGecer()
        {
            var form = DogruForm.Replace("for (int i = 1; i <= n; i++) lstSonuc.Items.Add(i);", "int i = 1; while (i <= n) { lstSonuc.Items.Add(i); i++; }");
            var s = Degerlendir(form);
            Assert.False(s["K6"].Gecti);
            Assert.Equal("btnFor.Click içinde for döngüsü yok.", s["K6"].Mesaj);
            Assert.True(s["K7"].Gecti);
        }

        [Fact]
        public void DoWhileYerineWhileSifirFarkiniYakalar()
        {
            var form = DogruForm.Replace("do { lstSonuc.Items.Add(n); n--; } while (n >= 1);", "while (n >= 1) { lstSonuc.Items.Add(n); n--; }");
            var s = Degerlendir(form);
            Assert.False(s["K12"].Gecti);
            Assert.True(s["K13"].Gecti);
            Assert.False(s["K14"].Gecti);
            Assert.Contains("beklenen [0], bulunan []", s["K14"].Mesaj);
        }

        [Fact]
        public void SonsuzDonguProgramiDurdururVeTespitYazilir()
        {
            var form = DogruForm.Replace("while (n >= 1) { lstSonuc.Items.Add(n); n--; }", "while (n >= 1) { lstSonuc.Items.Add(n); }");
            var s = Degerlendir(form);
            Assert.False(s["K10"].Gecti);
            Assert.Contains("program durdu", s["K10"].Mesaj);
            Assert.True(s["K7"].Gecti); // diğer testler etkilenmez
        }

        [Fact]
        public void CalismaHatasiYakalanir()
        {
            var form = DogruForm.Replace("int n = int.Parse(txtN.Text);\n            for", "int n = int.Parse(txtN.Text + \"x\");\n            for");
            var s = Degerlendir(form);
            Assert.False(s["K7"].Gecti);
            Assert.Contains("FormatException", s["K7"].Mesaj);
            Assert.False(s["K17"].Gecti);
        }

        [Fact]
        public void EksikKontrolVeYanlisTurBildirilir()
        {
            var designer = Designer.Replace("private System.Windows.Forms.ListBox lstSonuc;", "private System.Windows.Forms.ComboBox lstSonuc;")
                .Replace("new System.Windows.Forms.ListBox()", "new System.Windows.Forms.ComboBox()")
                .Replace("this.btnBreak.Name = \"\"btnBreak\"\";".Replace("\"\"", "\""), "this.btnBreak.Name = \"btnKes\";");
            var s = Degerlendir(DogruForm, designer);
            Assert.False(s["K3"].Gecti);
            Assert.Contains("lstSonuc bir ListBox değil (ComboBox)", s["K3"].Mesaj);
            Assert.False(s["K4"].Gecti);
            Assert.Contains("btnBreak adlı kontrol yok", s["K4"].Mesaj);
        }

        [Fact]
        public void DerlenmeyenProjedeYapiKontrolleriYineCalisir()
        {
            var s = Degerlendir(DogruForm.Replace("lstSonuc.Items.Add(i);\n            }", "lstSonuc.Items.Add(i)\n            }"));
            Assert.False(s["K1"].Gecti);
            Assert.Contains("Proje derlenmiyor", s["K1"].Mesaj);
            Assert.False(s["K7"].Gecti);
            Assert.Equal("Proje derlenmediği için denetlenemedi.", s["K7"].Mesaj);
            Assert.True(s["K6"].Gecti);
            Assert.True(s["K15"].Gecti);
        }

        [Fact]
        public void OlayBagliDegilseBildirilir()
        {
            var s = Degerlendir(DogruForm, Designer.Replace("this.btnFor.Click += new System.EventHandler(this.btnFor_Click);", ""));
            Assert.False(s["K6"].Gecti);
            Assert.Equal("btnFor düğmesinin Click olayına bağlı bir metot yok.", s["K6"].Mesaj);
            Assert.False(s["K7"].Gecti);
        }

        [Fact]
        public void LabelVeMesajKutusuKarsilastirilir()
        {
            var designer = @"namespace D { partial class Form1 { private void InitializeComponent() {
                this.txt = new System.Windows.Forms.TextBox(); this.txt.Name = ""txt"";
                this.lbl = new System.Windows.Forms.Label(); this.lbl.Name = ""lbl"";
                this.btn = new System.Windows.Forms.Button(); this.btn.Name = ""btn"";
                this.btn.Click += (s, e) => Kontrol();
                this.Controls.Add(this.txt); this.Controls.Add(this.lbl); this.Controls.Add(this.btn); }
                System.Windows.Forms.TextBox txt; System.Windows.Forms.Label lbl; System.Windows.Forms.Button btn; } }";
            var form = @"using System; using System.Windows.Forms; namespace D { public partial class Form1 : Form {
                public Form1() { InitializeComponent(); }
                void Kontrol() { int s = int.Parse(txt.Text);
                    if (s > 0) lbl.Text = ""Pozitif""; else if (s < 0) lbl.Text = ""Negatif""; else { lbl.Text = ""Sıfır""; MessageBox.Show(""Sıfır girdiniz""); } } } }";
            var p = new ProjectInput { Name = "D", Namespace = "D" };
            p.Files.Add(new ProjectFile { Name = "Program.cs", Content = "using System.Windows.Forms; namespace D { static class Program { static void Main() { Application.Run(new Form1()); } } }" });
            p.Files.Add(new ProjectFile { Name = "Form1.cs", Content = form });
            p.Files.Add(new ProjectFile { Name = "Form1.Designer.cs", Content = designer });
            var r = Degerlendirici.Degerlendir(p, new List<Kontrol>
            {
                new() { No = "A", Tip = "calistir", Hedef = "btn", Girdi = "txt=-4", Beklenen = "lbl=Negatif" },
                new() { No = "B", Tip = "calistir", Hedef = "btn", Girdi = "txt=0", Beklenen = "lbl=Sıfır; MessageBox=Sıfır girdiniz" },
                new() { No = "C", Tip = "calistir", Hedef = "btn", Girdi = "txt=7", Beklenen = "lbl=Negatif" },
                new() { No = "D", Tip = "kod_yapisi", Hedef = "btn.Click", Beklenen = "if;else if;else" },
                new() { No = "E", Tip = "kod_icerir", Hedef = "*", Beklenen = "int.Parse( txt.Text )" },
                new() { No = "F", Tip = "kod_yapisi", Hedef = "btn.Click", Beklenen = "switch" },
            }).Sonuclar.ToDictionary(x => x.No);
            Assert.True(r["A"].Gecti, r["A"].Mesaj);
            Assert.True(r["B"].Gecti, r["B"].Mesaj);
            Assert.False(r["C"].Gecti);
            Assert.Equal("lbl: beklenen \"Negatif\", bulunan \"Pozitif\" (txt=7).", r["C"].Mesaj);
            Assert.True(r["D"].Gecti, r["D"].Mesaj);
            Assert.True(r["E"].Gecti, r["E"].Mesaj);
            Assert.False(r["F"].Gecti);
        }

        [Fact]
        public void CiktiTahminiSorusuHesaplanir()
        {
            var r = Degerlendirici.CiktiHesapla("for (int i = 1; i <= 10; i++)\n{\n    if (i % 4 == 0) break;\n    Console.WriteLine(i);\n}");
            Assert.True(r.Basarili, r.Hata);
            Assert.Equal("1\n2\n3\n", r.Cikti.Replace("\r\n", "\n"));
            var hata = Degerlendirici.CiktiHesapla("Console.WriteLine(x);");
            Assert.False(hata.Basarili);
            Assert.Contains("Satır", hata.Hata);
        }

        [Fact]
        public void DegerlendirmeSonrasiArayuzGeriDoner()
        {
            var once = new MiniWinForms.NullBackend();
            MiniWinForms.Ui.Backend = once;
            Degerlendir(DogruForm);
            Assert.Same(once, MiniWinForms.Ui.Backend);
        }
    }
}
