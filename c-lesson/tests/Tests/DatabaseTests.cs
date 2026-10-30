using System.Diagnostics;
using System.Windows.Forms;
using CLesson.Compiler;
using MiniWinForms;
using Xunit;

namespace Tests
{
    /// <summary>
    /// Veritabanı şablonu (okul.mdf + OkulDataSet) ve "Veritabanı 2025-2026 - 2" belgesindeki dört ek görev.
    /// </summary>
    [Collection("ui")]
    public class DatabaseTests
    {
        static string RepoRoot()
        {
            var dir = AppContext.BaseDirectory;
            while (dir != null && !File.Exists(Path.Combine(dir, "build.sh"))) dir = Path.GetDirectoryName(dir);
            return dir ?? throw new InvalidOperationException("Depo kökü bulunamadı");
        }

        static ProjectInput Project()
        {
            var psi = new ProcessStartInfo("node", "tests/js/gen-db.mjs") { WorkingDirectory = RepoRoot(), RedirectStandardOutput = true, RedirectStandardError = true };
            using var p = Process.Start(psi)!;
            string output = p.StandardOutput.ReadToEnd();
            string err = p.StandardError.ReadToEnd();
            p.WaitForExit();
            Assert.True(p.ExitCode == 0, err);
            return ProjectInput.Parse(output);
        }

        /// <summary>Öğretmenin çözümü: Form1.cs'ye eklenen kod (dört görev).</summary>
        const string Cozum = @"
        StatusStrip durum = new StatusStrip();
        ToolStripStatusLabel lblSayi = new ToolStripStatusLabel();
        TextBox txtAraAd = new TextBox { Name = ""txtAraAd"" };
        TextBox txtAraSoyad = new TextBox { Name = ""txtAraSoyad"" };
        TextBox txtAraTel = new TextBox { Name = ""txtAraTel"" };

        void Kur()
        {
            durum.Items.Add(lblSayi);
            Controls.Add(durum);
            Controls.Add(txtAraAd); Controls.Add(txtAraSoyad); Controls.Add(txtAraTel);
            // 1. Silme onayı: tasarımda gezginin DeleteItem özelliği (yok) yapıldı; Click olayı bizde
            bindingNavigatorDeleteItem.Click += bindingNavigatorDeleteItem_Click;
            // 2. Kayıt sayısı
            ogrenciBindingSource.ListChanged += (s, e) => SayiGoster();
            // 4. Arama
            txtAraAd.TextChanged += Ara; txtAraSoyad.TextChanged += Ara; txtAraTel.TextChanged += Ara;
        }

        void SayiGoster() { lblSayi.Text = ""Kayıt sayısı: "" + ogrenciBindingSource.Count; }

        private void bindingNavigatorDeleteItem_Click(object sender, EventArgs e)
        {
            if (ogrenciBindingSource.Current == null) return;
            DialogResult cevap = MessageBox.Show(""Kaydı silmek istediğinize emin misiniz?"", ""Silme onayı"", MessageBoxButtons.YesNo, MessageBoxIcon.Question);
            if (cevap == DialogResult.Yes)
            {
                ogrenciBindingSource.RemoveCurrent();
                tableAdapterManager.UpdateAll(okulDataSet);
            }
        }

        void Ara(object sender, EventArgs e)
        {
            List<string> kosullar = new List<string>();
            if (txtAraAd.Text != """") kosullar.Add(""Ad LIKE '"" + txtAraAd.Text + ""%'"");
            if (txtAraSoyad.Text != """") kosullar.Add(""Soyad LIKE '"" + txtAraSoyad.Text + ""%'"");
            if (txtAraTel.Text != """") kosullar.Add(""Telefon LIKE '%"" + txtAraTel.Text + ""%'"");
            ogrenciBindingSource.Filter = string.Join("" AND "", kosullar);
        }
";

        const string Kaydet = @"
            this.Validate();
            // 3. Tekrarlı kayıt kontrolü (Ad + Soyad + Telefon)
            DataRowView satir = (DataRowView)ogrenciBindingSource.Current;
            if (satir != null)
            {
                string filtre = ""Ad = '"" + adTextBox.Text + ""' AND Soyad = '"" + soyadTextBox.Text + ""' AND Telefon = '"" + telefonMaskedTextBox.Text + ""'"";
                int benzer = okulDataSet.ogrenci.Select(filtre).Length;
                if (satir.IsNew && benzer > 0 || !satir.IsNew && benzer > 1)
                {
                    if (MessageBox.Show(""Bu bilgilere benzer bir kayıt zaten mevcut. Devam etmek istiyor musunuz?"", ""Uyarı"", MessageBoxButtons.YesNo, MessageBoxIcon.Warning) == DialogResult.No)
                    {
                        ogrenciBindingSource.CancelEdit();
                        return;
                    }
                }
            }
            this.ogrenciBindingSource.EndEdit();
            this.tableAdapterManager.UpdateAll(this.okulDataSet);
";

        static (Form form, NullBackend b) Run(bool cozum)
        {
            var b = new NullBackend();
            Ui.Backend = b;
            System.Globalization.CultureInfo.CurrentCulture = System.Globalization.CultureInfo.CurrentUICulture = new System.Globalization.CultureInfo("tr-TR");
            var p = Project();
            if (cozum)
            {
                var f = p.Files.Single(x => x.Name == "Form1.cs");
                f.Content = f.Content
                    .Replace("            InitializeComponent();\n        }", "            InitializeComponent();\n            Kur();\n        }\n" + Cozum)
                    .Replace("            this.Validate();\n            this.ogrenciBindingSource.EndEdit();\n            this.tableAdapterManager.UpdateAll(this.okulDataSet);\n", Kaydet);
            }
            if (cozum)
            {
                var d = p.Files.Single(x => x.Name == "Form1.Designer.cs");
                Assert.Contains("this.ogrenciBindingNavigator.DeleteItem = this.bindingNavigatorDeleteItem;", d.Content);
                d.Content = d.Content.Replace("this.ogrenciBindingNavigator.DeleteItem = this.bindingNavigatorDeleteItem;", "");
            }
            var r = new ProjectCompiler().Build(p);
            Assert.True(r.Success, string.Join("\n", r.Diagnostics.Select(d => d.File + "(" + d.Line + "): " + d.Message)));
            Assert.DoesNotContain(r.Diagnostics, d => d.Severity == "warning");
            ProgramRunner.Run(r.Assembly, r.Pdb, r.DataFiles);
            return (Application.OpenForms[0], b);
        }

        static T Find<T>(Form f, string name) where T : Control => (T)f.Controls.Find(name, true).Single();
        static ToolStripItem Item(Form f, string name) => Find<BindingNavigator>(f, "ogrenciBindingNavigator").Items[name];
        static void Click(ToolStripItem item) => Ui.Execute(() => item.PerformClick());
        static void Type(Control c, string s) => Ui.Dispatch(c.Id(), "input", s);
        static string LastXml(NullBackend b) => b.Log.LastOrDefault(l => l.Contains("\"dbfile\"")) ?? "";

        [Fact]
        public void ZipContainsDatabaseFiles()
        {
            var p = Project();
            p.DataFiles.Add(new ProjectFile { Name = "okul.sql", Content = "CREATE TABLE x" });
            var bytes = CodeTools.ExportZip(p);
            var dir = Environment.GetEnvironmentVariable("ZIP_OUT");
            if (!string.IsNullOrEmpty(dir)) File.WriteAllBytes(Path.Combine(dir, "okul.zip"), bytes);
            using var zip = new System.IO.Compression.ZipArchive(new MemoryStream(bytes));
            var names = zip.Entries.Select(e => e.FullName).ToList();
            Assert.Contains("Okul Uygulaması/okul.xml", names);
            Assert.Contains("Okul Uygulaması/okul.sql", names);
            Assert.Contains("Okul Uygulaması/OkulDataSet.Designer.cs", names);
            using var r = new StreamReader(zip.GetEntry("Okul Uygulaması/OkulUygulamasi.csproj")!.Open());
            var csproj = r.ReadToEnd();
            Assert.Contains("<None Update=\"okul.xml\">", csproj);
            Assert.DoesNotContain("okul.sql", csproj);
        }

        [Fact]
        public void TemplateLoadsAndNavigates()
        {
            var (form, _) = Run(false);
            var grid = Find<DataGridView>(form, "ogrenciDataGridView");
            Assert.Equal(21, grid.Rows.Count); // 20 kayıt + yeni satır
            Assert.Equal("Ayşe", Find<TextBox>(form, "adTextBox").Text);
            Assert.Equal("/20", Item(form, "bindingNavigatorCountItem").Text);
            Assert.Equal("1", Item(form, "bindingNavigatorPositionItem").Text);
            Assert.False(Item(form, "bindingNavigatorMovePreviousItem").Enabled);
            Click(Item(form, "bindingNavigatorMoveNextItem"));
            Assert.Equal("Mehmet", Find<TextBox>(form, "adTextBox").Text);
            Assert.Equal(1, grid.CurrentCell.RowIndex);
            Assert.Equal(CheckState.Checked, Find<CheckBox>(form, "cinsiyetCheckBox").CheckState);
            // Tabloya tıklayınca kutular o kayda geçer
            Ui.Dispatch(grid.Id(), "cell", "4,1,0,0,0,5,5,1");
            Assert.Equal("Zeynep", Find<TextBox>(form, "adTextBox").Text);
            Assert.Equal("5", Item(form, "bindingNavigatorPositionItem").Text);
        }

        [Fact]
        public void AddEditSaveWritesDatabase()
        {
            var (form, b) = Run(false);
            Click(Item(form, "bindingNavigatorAddNewItem"));
            Assert.Equal("21", Item(form, "bindingNavigatorPositionItem").Text);
            Assert.Equal("21", Find<TextBox>(form, "ogrenciIDTextBox").Text); // AutoIncrementSeed = 1
            Assert.Equal("", Find<TextBox>(form, "adTextBox").Text);
            Type(Find<TextBox>(form, "adTextBox"), "Deniz");
            Type(Find<TextBox>(form, "soyadTextBox"), "Akın");
            Type(Find<MaskedTextBox>(form, "telefonMaskedTextBox"), "(555) 123-4567");
            Click(Item(form, "ogrenciBindingNavigatorSaveItem"));
            Assert.True(LastXml(b) != "", string.Join("\n", b.Log.Where(l => l.StartsWith("ERR") || l.StartsWith("DLG"))));
            var xml = LastXml(b);
            Assert.Contains("<OgrenciID>21</OgrenciID>", xml);
            Assert.Contains("<Ad>Deniz</Ad>", xml);
            // Var olan kaydı değiştir
            Click(Item(form, "bindingNavigatorMoveFirstItem"));
            Type(Find<TextBox>(form, "soyadTextBox"), "Yılmaz-Kaya");
            Click(Item(form, "ogrenciBindingNavigatorSaveItem"));
            Assert.Contains("<Soyad>Yılmaz-Kaya</Soyad>", LastXml(b));
            Assert.DoesNotContain(b.Log, l => l.StartsWith("ERR"));
        }

        [Fact]
        public void FourTasksFromHandout()
        {
            var (form, b) = Run(true);
            var lbl = ((StatusStrip)form.Controls.OfType<StatusStrip>().Single()).Items[0];
            var bs = form.GetType().GetField("ogrenciBindingSource", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance)!.GetValue(form) as BindingSource;
            Assert.Equal(20, bs!.Count);

            // 1. Silme onayı: Hayır → silinmez, Evet → silinir
            Click(Item(form, "bindingNavigatorDeleteItem"));
            Assert.True(b.Dialogs.Count > 0, string.Join("\n", b.Log.Where(l => l.StartsWith("ERR") || l.StartsWith("MSG"))));
            var dlg = b.Dialogs.Last();
            Assert.Contains("emin misiniz", dlg.json);
            Ui.CompleteDialog(dlg.id, "No");
            Assert.Equal(20, bs.Count);
            Click(Item(form, "bindingNavigatorDeleteItem"));
            Ui.CompleteDialog(b.Dialogs.Last().id, "Yes");
            Assert.Equal(19, bs.Count);
            Assert.DoesNotContain("<Ad>Ayşe</Ad>", LastXml(b));

            // 2. Kayıt sayısı silmeden sonra güncellendi
            Assert.Equal("Kayıt sayısı: 19", lbl.Text);

            // 3. Tekrarlı kayıt: Mehmet Kaya'nın aynısı eklenmeye çalışılır
            var ad = Find<TextBox>(form, "adTextBox");
            var soyad = Find<TextBox>(form, "soyadTextBox");
            var tel = Find<MaskedTextBox>(form, "telefonMaskedTextBox");
            string mehmetTel = tel.Text;
            Assert.Equal("Mehmet", ad.Text);
            Click(Item(form, "bindingNavigatorAddNewItem"));
            Assert.Equal("Kayıt sayısı: 20", lbl.Text);
            Type(ad, "Mehmet"); Type(soyad, "Kaya"); Type(tel, mehmetTel);
            Click(Item(form, "ogrenciBindingNavigatorSaveItem"));
            dlg = b.Dialogs.Last();
            Assert.Contains("benzer bir kayıt", dlg.json);
            Ui.CompleteDialog(dlg.id, "No");
            Assert.Equal(19, bs.Count); // iptal edildi
            Click(Item(form, "bindingNavigatorAddNewItem"));
            Type(ad, "Mehmet"); Type(soyad, "Kaya"); Type(tel, mehmetTel);
            Click(Item(form, "ogrenciBindingNavigatorSaveItem"));
            Ui.CompleteDialog(b.Dialogs.Last().id, "Yes");
            Assert.Equal(20, bs.Count);
            Assert.Equal(2, System.Text.RegularExpressions.Regex.Matches(LastXml(b), "<Ad>Mehmet</Ad>").Count);

            // 4. Çoklu alanla arama (Türkçe İ/ı dahil)
            Type(Find<TextBox>(form, "txtAraAd"), "i");
            Assert.Equal("Kayıt sayısı: 2", lbl.Text); // İrem, İsmail (tr-TR: i ↔ İ)
            Type(Find<TextBox>(form, "txtAraAd"), "Me");
            Assert.Equal(3, bs.Count); // Mehmet x2, Merve
            Type(Find<TextBox>(form, "txtAraSoyad"), "Ka");
            Assert.Equal(2, bs.Count);
            Type(Find<TextBox>(form, "txtAraAd"), "");
            Type(Find<TextBox>(form, "txtAraSoyad"), "");
            Assert.Equal(20, bs.Count);
            Assert.DoesNotContain(b.Log, l => l.StartsWith("ERR"));
        }
    }
}
