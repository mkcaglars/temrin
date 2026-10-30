using System.Diagnostics;
using System.Windows.Forms;
using CLesson.Compiler;
using MiniWinForms;
using Xunit;

namespace Tests
{
    /// <summary>JavaScript kod üreticisinin (codegen.js) ürettiği Designer.cs kodunun derlenip çalıştığını doğrular.</summary>
    [Collection("ui")]
    public class CodegenTests
    {
        static string RepoRoot()
        {
            var dir = AppContext.BaseDirectory;
            while (dir != null && !File.Exists(Path.Combine(dir, "build.sh"))) dir = Path.GetDirectoryName(dir);
            return dir ?? throw new InvalidOperationException("Depo kökü bulunamadı");
        }

        static string GenerateProjectJson()
        {
            var psi = new ProcessStartInfo("node", "tests/js/gen-designer.mjs")
            {
                WorkingDirectory = RepoRoot(),
                RedirectStandardOutput = true,
                RedirectStandardError = true,
            };
            using var p = Process.Start(psi)!;
            string output = p.StandardOutput.ReadToEnd();
            string err = p.StandardError.ReadToEnd();
            p.WaitForExit();
            Assert.True(p.ExitCode == 0, err);
            return output;
        }

        [Fact]
        public void GeneratedDesignerCompilesAndRuns()
        {
            var backend = new NullBackend();
            Ui.Backend = backend;
            var project = ProjectInput.Parse(GenerateProjectJson());
            var r = new ProjectCompiler().Build(project);
            Assert.True(r.Success, string.Join("\n", r.Diagnostics.Select(d => $"{d.File}({d.Line}): {d.Code} {d.Message}")));
            Assert.DoesNotContain(r.Diagnostics, d => d.Severity == "warning");

            ProgramRunner.Run(r.Assembly, r.Pdb);
            var form = Application.OpenForms[0];
            Assert.Equal("Tüm \"kontroller\"", form.Text);
            Assert.Equal(FormStartPosition.CenterScreen, form.StartPosition);
            Assert.Equal(0.95, form.Opacity, 3);
            Assert.True(form.Font.Bold && form.Font.Italic);

            var tb = (TextBox)form.Controls.Find("textBox1", true).Single();
            Assert.Equal("A\\B\n\"C\"", tb.Text); // CharacterCasing.Upper
            var combo = (ComboBox)form.Controls.Find("comboBox1", true).Single();
            Assert.Equal(new object[] { "Bir", "İki", "Üç" }, combo.Items.Cast<object>().ToArray());
            var num = (NumericUpDown)form.Controls.Find("numericUpDown1", true).Single();
            Assert.Equal(-10m, num.Minimum);
            Assert.Equal(2.5m, num.Value);
            var grid = (DataGridView)form.Controls.Find("dataGridView1", true).Single();
            Assert.Equal(3, grid.Columns.Count);
            Assert.Equal("Öğrenci Adı", grid.Columns["colAd"].HeaderText);
            Assert.IsType<DataGridViewCheckBoxColumn>(grid.Columns[1]);
            Assert.Equal(DataGridViewSelectionMode.FullRowSelect, grid.SelectionMode);
            Assert.Equal(0, grid.Rows.Count);
            var tabs = (TabControl)form.Controls.Find("tabControl1", true).Single();
            Assert.Equal(2, tabs.TabCount);
            Assert.Equal(1, tabs.SelectedIndex);
            Assert.Equal("Ayrıntı", tabs.SelectedTab.Text);
            var menu = (MenuStrip)form.Controls.Find("menuStrip1", true).Single();
            Assert.Same(menu, form.MainMenuStrip);
            var dosya = (ToolStripMenuItem)menu.Items[0];
            Assert.Equal(3, dosya.DropDownItems.Count);
            Assert.Equal(Keys.Control | Keys.O, ((ToolStripMenuItem)dosya.DropDownItems[0]).ShortcutKeys);
            ((ToolStripMenuItem)dosya.DropDownItems[0]).PerformClick();
            var mask = (MaskedTextBox)form.Controls.Find("maskedTextBox1", true).Single();
            Assert.Equal("(   )    -", mask.Text);
            Assert.NotNull(mask.ContextMenuStrip);
            var deep = form.Controls.Find("button2", true).Single();
            Assert.Equal("panel2", deep.Parent.Name);
            var panel2 = form.Controls.Find("panel2", true).Single();
            Assert.Equal(DockStyle.Fill, panel2.Dock);
            Assert.False(form.Controls.Find("label1", true).Single().Visible);

            // Olaylar bağlı mı?
            Ui.Dispatch((int)form.Controls.Find("checkBox1", true).Single().Handle, "change", "0");
            Ui.Dispatch((int)deep.Handle, "mousemove", "1,1,0,0");
            var olaylar = (List<string>)form.GetType().GetField("Olaylar").GetValue(null);
            Assert.Contains("Form1_Load", olaylar);
            Assert.Contains("checkBox1_CheckedChanged", olaylar);
            Assert.Contains("button2_MouseMove", olaylar);
            Assert.Contains("aç_Click", olaylar);
        }
    }
}
