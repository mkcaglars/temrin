using System.Drawing;
using System.Windows.Forms;
using CLesson.Compiler;
using MiniWinForms;
using Xunit;

namespace Tests
{
    [Collection("ui")]
    public class DataGridTests
    {
        static Form Run(string program, string form1, string designer)
        {
            Ui.Backend = new NullBackend();
            System.Globalization.CultureInfo.CurrentCulture = System.Globalization.CultureInfo.CurrentUICulture = new System.Globalization.CultureInfo("tr-TR");
            var p = new ProjectInput { Name = "Deneme", Namespace = "Deneme" };
            p.Files.Add(new ProjectFile { Name = "Program.cs", Content = program });
            p.Files.Add(new ProjectFile { Name = "Form1.cs", Content = form1 });
            p.Files.Add(new ProjectFile { Name = "Form1.Designer.cs", Content = designer });
            var r = new ProjectCompiler().Build(p);
            Assert.True(r.Success, string.Join("\n", r.Diagnostics.Select(d => d.File + ":" + d.Line + ": " + d.Message)));
            ProgramRunner.Run(r.Assembly, r.Pdb);
            Assert.True(Application.OpenForms.Count > 0, "Form açılmadı");
            return Application.OpenForms[0];
        }

        static T Find<T>(Form f, string name) where T : Control => (T)f.Controls.Find(name, true).Single();
        static void Click(Control c) => Ui.Dispatch(c.Id(), "click", "1,1,0");
        static void Type(TextBox t, string s) => Ui.Dispatch(t.Id(), "input", s);
        static void ClickCell(DataGridView g, int r, int c) => Ui.Dispatch(g.Id(), "cell", r + "," + c + ",0,0,0,5,5,1");

        [Fact]
        public void KursTakipRunsUnchanged()
        {
            var form = Run(KursTakip.Program, KursTakip.Form1, KursTakip.Designer);
            var g = Find<DataGridView>(form, "dataGridView1");
            var txtAd = Find<TextBox>(form, "txtAd");
            var txtKurs = Find<TextBox>(form, "txtKurs");
            var txtNot = Find<TextBox>(form, "txtNot");
            var lbl = Find<Label>(form, "lblOrtalama");

            // Adım 1: 3 satır + en alttaki yeni satır; ilk satır seçili
            Assert.Equal(4, g.Columns.Count);
            Assert.Equal(4, g.Rows.Count);
            Assert.True(g.Rows[3].IsNewRow);
            Assert.Equal("Öğrenci Adı", g.Columns["colAd"].HeaderText);
            Assert.Single(g.SelectedRows);
            Assert.Equal(0, g.SelectedRows[0].Index);
            Assert.Equal(0, g.CurrentCell.RowIndex);

            // Adım 2: Ekle (ID = Rows.Count + 1 → VS'deki gibi 5)
            Type(txtAd, "Can Yılmaz"); Type(txtKurs, "Python"); Type(txtNot, "70");
            Click(Find<Button>(form, "btnEkle"));
            Assert.Equal(5, g.Rows.Count);
            Assert.Equal("5", g.Rows[3].Cells["colID"].Value);
            Assert.Equal("Can Yılmaz", g.Rows[3].Cells["colAd"].Value);
            Assert.Equal("", txtAd.Text);
            Assert.Equal("Ortalama: 81,75", lbl.Text);

            // Boş alanla ekleme uyarı verir, satır eklenmez
            Click(Find<Button>(form, "btnEkle"));
            Assert.Equal(5, g.Rows.Count);

            // Adım 3: satıra tıklayınca TextBox'lar dolar
            ClickCell(g, 1, 2);
            Assert.Equal("Murat Çelik", txtAd.Text);
            Assert.Equal("Java", txtKurs.Text);
            Assert.Equal("74", txtNot.Text);
            Assert.Equal(1, g.SelectedRows[0].Index);

            // Adım 4: Güncelle
            Type(txtNot, "80");
            Click(Find<Button>(form, "btnGuncelle"));
            Assert.Equal("80", g.Rows[1].Cells["colNot"].Value);

            // Adım 5: Sil
            ClickCell(g, 0, 0);
            Click(Find<Button>(form, "btnSil"));
            Assert.Equal(4, g.Rows.Count);
            Assert.Equal("Murat Çelik", g.Rows[0].Cells["colAd"].Value);
            Assert.Equal(0, g.SelectedRows[0].Index); // silinen satırın yerine geçen satır seçili

            // Adım 6: Arama
            var arama = Find<TextBox>(form, "txtArama");
            Type(arama, "php");
            Assert.Equal(Color.LightYellow, g.Rows[1].DefaultCellStyle.BackColor);
            Assert.Equal(Color.LightGray, g.Rows[0].DefaultCellStyle.BackColor);
            Click(Find<Button>(form, "btnTemizle"));
            Assert.Equal("", arama.Text);
            Assert.DoesNotContain(((NullBackend)Ui.Backend).Log, l => l.StartsWith("ERR"));
            Assert.Equal(Color.LightYellow, g.Rows[0].DefaultCellStyle.BackColor);
        }

        [Fact]
        public void NewRowCannotBeDeleted()
        {
            var form = Run(KursTakip.Program, KursTakip.Form1, KursTakip.Designer);
            var g = Find<DataGridView>(form, "dataGridView1");
            ClickCell(g, 3, 0);
            Assert.True(g.SelectedRows[0].IsNewRow);
            var ex = Assert.Throws<InvalidOperationException>(() => g.Rows.RemoveAt(3));
            Assert.Contains("yeni satır", ex.Message);
        }

        [Fact]
        public void UserEditsNewRowAndCells()
        {
            var form = Run(KursTakip.Program, KursTakip.Form1, KursTakip.Designer);
            var g = Find<DataGridView>(form, "dataGridView1");
            Assert.Equal("ok", Ui.Dispatch(g.Id(), "beginedit", "3,1\nZ"));
            Ui.Dispatch(g.Id(), "commit", "3,1\nZeynep");
            Assert.Equal(5, g.Rows.Count);
            Assert.Equal("Zeynep", g.Rows[3].Cells[1].Value);
            Assert.False(g.Rows[3].IsNewRow);
            Assert.True(g.Rows[4].IsNewRow);
            // Sıralama: başlığa tıklama
            ClickCell(g, -1, 1);
            Assert.Equal("Ayşe Kılıç", g.Rows[0].Cells[1].Value);
            Assert.Equal("Zeynep", g.Rows[3].Cells[1].Value);
            ClickCell(g, -1, 1);
            Assert.Equal("Zeynep", g.Rows[0].Cells[1].Value);
            Assert.True(g.Rows[4].IsNewRow);
        }

        [Fact]
        public void GridJsonIsProduced()
        {
            var form = Run(KursTakip.Program, KursTakip.Form1, KursTakip.Designer);
            var b = (NullBackend)Ui.Backend;
            Assert.Contains(b.Log, l => l.Contains("\"grid\"") && l.Contains("Ayşe Kılıç"));
        }
    }
}
