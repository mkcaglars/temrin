using System.Windows.Forms;
using CLesson.Compiler;
using MiniWinForms;
using Xunit;

namespace Tests
{
    [Collection("ui")]
    public class ControlTests
    {
        const string Program = @"using System;
using System.Windows.Forms;
namespace Deneme
{
    internal static class Program
    {
        [STAThread]
        static void Main() { Application.Run(new Form1()); }
    }
}";

        static (Form form, NullBackend backend) Run(string fields, string ctor, string methods = "")
        {
            var b = new NullBackend();
            Ui.Backend = b;
            System.Globalization.CultureInfo.CurrentCulture = System.Globalization.CultureInfo.CurrentUICulture = new System.Globalization.CultureInfo("tr-TR");
            var code = @"using System;
using System.Drawing;
using System.IO;
using System.Windows.Forms;
namespace Deneme
{
    public partial class Form1 : Form
    {
        " + fields + @"
        public Form1()
        {
            " + ctor + @"
        }
        " + methods + @"
    }
}";
            var p = new ProjectInput { Name = "Deneme", Namespace = "Deneme" };
            p.Files.Add(new ProjectFile { Name = "Program.cs", Content = Program });
            p.Files.Add(new ProjectFile { Name = "Form1.cs", Content = code });
            var r = new ProjectCompiler().Build(p);
            Assert.True(r.Success, string.Join("\n", r.Diagnostics.Select(d => d.Line + ": " + d.Message)));
            ProgramRunner.Run(r.Assembly, r.Pdb);
            return (Application.OpenForms[0], b);
        }

        static T Find<T>(Form f, string name) where T : Control => (T)f.Controls.Find(name, true).Single();

        [Fact]
        public void MaskedTextBoxFormatsLikeWinForms()
        {
            var (form, _) = Run("MaskedTextBox m = new MaskedTextBox(); Label l = new Label();",
                @"m.Name = ""m""; l.Name = ""l""; m.Mask = ""(999) 000-0000""; Controls.Add(m); Controls.Add(l);
                  m.TextChanged += (s, e) => l.Text = m.MaskCompleted ? ""tamam"" : ""eksik"";");
            var m = Find<MaskedTextBox>(form, "m");
            Assert.Equal("(   )    -", m.Text);
            Assert.False(m.MaskCompleted);
            m.Text = "5321234567";
            Assert.Equal("(532) 123-4567", m.Text);
            Assert.True(m.MaskCompleted);
            Assert.Equal("tamam", Find<Label>(form, "l").Text);
            // Tarayıcıdan gelen ekran metni
            Ui.Dispatch(m.Id(), "input", "(532) 12_-____");
            Assert.Equal("(532) 12 -", m.Text);
            Assert.Equal("eksik", Find<Label>(form, "l").Text);
            m.TextMaskFormat = MaskFormat.ExcludePromptAndLiterals;
            Assert.Equal("53212", m.Text);
            // Tarih maskesi Türkçe kültürde nokta ile
            m.Mask = "00/00/0000";
            m.TextMaskFormat = MaskFormat.IncludeLiterals;
            m.Text = "01022024";
            Assert.Equal("01.02.2024", m.Text);
        }

        [Fact]
        public void TabControlSelectsPages()
        {
            var (form, _) = Run("TabControl t = new TabControl(); TabPage p1 = new TabPage(\"Bir\"); TabPage p2 = new TabPage(\"İki\"); Label l = new Label(); int n;",
                @"t.Name = ""t""; l.Name = ""l""; t.Size = new Size(300, 200); t.TabPages.Add(p1); t.TabPages.Add(p2); p2.Controls.Add(new Button { Name = ""b"" });
                  Controls.Add(t); Controls.Add(l);
                  t.SelectedIndexChanged += (s, e) => l.Text = t.SelectedTab.Text + "" "" + (++n);");
            var t = Find<TabControl>(form, "t");
            Assert.Equal(2, t.TabCount);
            Assert.Equal(0, t.SelectedIndex);
            Assert.True(t.TabPages[0].Visible);
            Assert.False(t.TabPages[1].Visible);
            Ui.Dispatch(t.Id(), "select", "1");
            Assert.Equal("İki 1", Find<Label>(form, "l").Text);
            Assert.Equal(new System.Drawing.Rectangle(4, t.TabPages[1].Top, 292, t.TabPages[1].Height), t.TabPages[1].Bounds);
            Assert.Throws<ArgumentException>(() => t.Controls.Add(new Button()));
        }

        [Fact]
        public void OpenAndSaveFileDialogsUseVirtualFolder()
        {
            var (form, b) = Run("Button ac = new Button(); Button kaydet = new Button(); PictureBox pb = new PictureBox(); Label l = new Label();",
                @"ac.Name = ""ac""; kaydet.Name = ""kaydet""; pb.Name = ""pb""; l.Name = ""l""; Controls.Add(ac); Controls.Add(kaydet); Controls.Add(pb); Controls.Add(l);
                  ac.Click += Ac_Click; kaydet.Click += Kaydet_Click;",
                @"void Ac_Click(object sender, EventArgs e)
                  {
                      OpenFileDialog ofd = new OpenFileDialog();
                      ofd.Filter = ""Resim Dosyaları|*.jpg;*.jpeg;*.png;*.gif"";
                      if (ofd.ShowDialog() == DialogResult.OK)
                      {
                          pictureBoxYukle(ofd.FileName);
                          l.Text = Path.GetFileName(ofd.FileName) + "" "" + pb.Image.Width + ""x"" + pb.Image.Height;
                      }
                  }
                  void pictureBoxYukle(string f) { pb.Image = Image.FromFile(f); }
                  void Kaydet_Click(object sender, EventArgs e)
                  {
                      SaveFileDialog sfd = new SaveFileDialog();
                      sfd.Filter = ""Metin Dosyası|*.txt"";
                      if (sfd.ShowDialog() == DialogResult.OK)
                      {
                          File.WriteAllText(sfd.FileName, ""Merhaba"");
                          MessageBox.Show(""Dosya Kaydedildi: "" + sfd.FileName);
                      }
                  }");
            // 1x1 PNG
            var png = Convert.FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==");
            Ui.Dispatch(Find<Button>(form, "ac").Id(), "click", "");
            var dlg = b.Dialogs.Last();
            Assert.Equal("openfile", dlg.kind);
            Assert.Contains("Resim Dosyaları", dlg.json);
            Ui.CompleteDialog(dlg.id, "OK1\nkedi.png\t" + Convert.ToBase64String(png));
            Assert.Equal("kedi.png 1x1", Find<Label>(form, "l").Text);
            Assert.Contains(b.Log, l => l.Contains("data:image/png;base64,"));

            Ui.Dispatch(Find<Button>(form, "kaydet").Id(), "click", "");
            dlg = b.Dialogs.Last();
            Assert.Equal("savefile", dlg.kind);
            Assert.Contains("kedi.png", dlg.json); // klasördeki dosyalar listelenir
            Ui.CompleteDialog(dlg.id, "OK1\nnotlar.txt");
            Assert.Contains(b.Log, l => l.Contains("[\"dl\",\"notlar.txt\",\"" + Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes("Merhaba")) + "\"]"));
        }

        [Fact]
        public void ImageFromMissingFileHasTurkishMessage()
        {
            var ex = Assert.Throws<System.IO.FileNotFoundException>(() => System.Drawing.Image.FromFile("C:\\resim.jpg"));
            Assert.Contains("OpenFileDialog", ex.Message);
        }

        [Fact]
        public void ColumnHeaderFollowsName()
        {
            var g = new DataGridView();
            g.ColumnCount = 2;
            g.Columns[0].Name = "Ad";
            Assert.Equal("Ad", g.Columns[0].HeaderText);
            g.Columns[1].HeaderText = "Soyadı";
            g.Columns[1].Name = "colSoyad";
            Assert.Equal("Soyadı", g.Columns[1].HeaderText);
        }
    }
}
