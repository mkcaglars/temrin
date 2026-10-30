using System.Windows.Forms;
using CLesson.Compiler;
using MiniWinForms;
using Xunit;

namespace Tests
{
    [Collection("ui")]
    public class CompilerTests
    {
        static ProjectInput Project(string body = "", string extraFile = null)
        {
            var p = new ProjectInput { Name = "Hesap Makinesi", Namespace = "HesapMakinesi" };
            p.Files.Add(new ProjectFile { Name = "Program.cs", Content = Samples.Program });
            p.Files.Add(new ProjectFile { Name = "Form1.cs", Content = Samples.Form1.Replace("BODY", body) });
            p.Files.Add(new ProjectFile { Name = "Form1.Designer.cs", Content = Samples.Designer });
            if (extraFile != null) p.Files.Add(new ProjectFile { Name = "Ek.cs", Content = extraFile });
            return p;
        }

        static NullBackend Backend()
        {
            var b = new NullBackend();
            Ui.Backend = b;
            return b;
        }

        static Form RunAndGetMainForm(ProjectInput p)
        {
            var r = new ProjectCompiler().Build(p);
            Assert.True(r.Success, string.Join("\n", r.Diagnostics.Select(d => d.Line + ": " + d.Message)));
            ProgramRunner.Run(r.Assembly, r.Pdb);
            return Application.OpenForms[0];
        }

        static Control Find(Form f, string name) => f.Controls.Find(name, true).Single();

        [Fact]
        public void VisualStudioProjectCompilesAndRuns()
        {
            var b = Backend();
            var form = RunAndGetMainForm(Project());
            Assert.Equal("Hesap Makinesi", form.Text);
            Assert.Equal(new System.Drawing.Size(284, 161), form.ClientSize);

            var t1 = (TextBox)Find(form, "textBox1");
            var t2 = (TextBox)Find(form, "textBox2");
            var btn = Find(form, "button1");
            Ui.Dispatch(t1.Id(), "input", "3");
            Ui.Dispatch(t2.Id(), "input", "4");
            Ui.Dispatch(btn.Id(), "click", "1,1,0");
            Assert.Equal("Sonuç: 7", Find(form, "label1").Text);
            Assert.Contains(b.Log, l => l.Contains("Sonuç: 7"));
        }

        [Fact]
        public void ErrorsAreTurkishWithLines()
        {
            Backend();
            var p = Project("int x = \"metin\";");
            var r = new ProjectCompiler().Build(p);
            Assert.False(r.Success);
            var d = r.Diagnostics.First(x => x.Severity == "error");
            Assert.Equal("Form1.cs", d.File);
            Assert.Equal(19, d.Line);
            Assert.Equal("CS0029", d.Code);
            Assert.Contains("dönüştürülemez", d.Message);
        }

        [Fact]
        public void RuntimeExceptionReportsLine()
        {
            var b = Backend();
            var form = RunAndGetMainForm(Project());
            Ui.Dispatch(Find(form, "textBox1").Id(), "input", "abc");
            Ui.Dispatch(Find(form, "button1").Id(), "click", "");
            var err = b.Log.Single(l => l.StartsWith("ERR:"));
            Assert.Contains("FormatException", err);
            Assert.Contains("\"line\":16", err);
        }

        [Fact]
        public void InfiniteLoopIsStopped()
        {
            var b = Backend();
            Guard.LimitMs = 300;
            try
            {
                var form = RunAndGetMainForm(Project("while (true) { }"));
                Ui.Dispatch(Find(form, "textBox1").Id(), "input", "1");
                Ui.Dispatch(Find(form, "textBox2").Id(), "input", "1");
                Ui.Dispatch(Find(form, "button1").Id(), "click", "");
                Assert.Contains(b.Log, l => l.StartsWith("END:") && l.Contains("sonsuz döngü"));
                Assert.False(Ui.Running);
            }
            finally { Guard.LimitMs = 5000; }
        }

        [Fact]
        public void InfiniteRecursionIsStopped()
        {
            var b = Backend();
            var form = RunAndGetMainForm(Project("Topla(1);", @"namespace HesapMakinesi { public partial class Form1 { int Topla(int n) => Topla(n + 1); } }"));
            Ui.Dispatch(Find(form, "textBox1").Id(), "input", "1");
            Ui.Dispatch(Find(form, "textBox2").Id(), "input", "1");
            Ui.Dispatch(Find(form, "button1").Id(), "click", "");
            Assert.Contains(b.Log, l => l.StartsWith("ERR:") && l.Contains("özyineleme"));
        }

        [Fact]
        public void ReflectionIsBlocked()
        {
            Backend();
            var r = new ProjectCompiler().Build(Project("var t = Type.GetType(\"System.String\"); var m = typeof(string).GetMethods();"));
            Assert.False(r.Success);
            Assert.Contains(r.Diagnostics, d => d.Code == "DERS001");
        }

        [Fact]
        public void ShowDialogWaitsForResult()
        {
            var b = Backend();
            var form2 = @"namespace HesapMakinesi {
    public class Form2 : Form {
        public Button ok = new Button();
        public Form2() { ok.Name = ""ok""; ok.DialogResult = DialogResult.OK; Controls.Add(ok); }
    }
}";
            var form = RunAndGetMainForm(Project(@"Form2 f = new Form2();
            if (f.ShowDialog() == DialogResult.OK) label1.Text = ""tamam"";
            else label1.Text = ""iptal"";", form2));
            Ui.Dispatch(Find(form, "textBox1").Id(), "input", "1");
            Ui.Dispatch(Find(form, "textBox2").Id(), "input", "1");
            Ui.Dispatch(Find(form, "button1").Id(), "click", "");
            Assert.Equal("Sonuç: 2", Find(form, "label1").Text);
            var dialog = Application.OpenForms.Cast<Form>().Single(f => f != form);
            Ui.Dispatch(Find(dialog, "ok").Id(), "click", "");
            Assert.Equal("tamam", Find(form, "label1").Text);
        }

        [Fact]
        public void MessageBoxBecomesAsyncDialog()
        {
            var b = Backend();
            var form = RunAndGetMainForm(Project(@"MessageBox.Show(""Merhaba"");
            if (MessageBox.Show(""Emin misin?"", ""Soru"", MessageBoxButtons.YesNo) == DialogResult.Yes) label1.Text = ""evet""; else label1.Text = ""hayır"";
            string s = MessageBox.Show(""x"").ToString();"));
            Ui.Dispatch(Find(form, "textBox1").Id(), "input", "1");
            Ui.Dispatch(Find(form, "textBox2").Id(), "input", "1");
            Ui.Dispatch(Find(form, "button1").Id(), "click", "");
            var first = Assert.Single(b.Dialogs);
            Assert.Contains("Merhaba", first.json);
            Ui.CompleteDialog(first.id, "OK");
            var dlg = b.Dialogs[1];
            Assert.Equal("messagebox", dlg.kind);
            Assert.Contains("Emin misin?", dlg.json);
            Assert.Equal("Sonuç: 2", Find(form, "label1").Text);
            Ui.CompleteDialog(dlg.id, "No");
            Assert.Equal("hayır", Find(form, "label1").Text);
            Assert.Equal(3, b.Dialogs.Count);
        }

        [Fact]
        public void FormClosingMessageBoxStaysSynchronous()
        {
            var b = Backend();
            var extra = @"namespace HesapMakinesi { public partial class Form1 {
                protected override void OnLoad(EventArgs e) { base.OnLoad(e); FormClosing += Kapaniyor; }
                void Kapaniyor(object sender, FormClosingEventArgs e) { if (MessageBox.Show(""Çık?"", """", MessageBoxButtons.YesNo) == DialogResult.No) e.Cancel = true; }
            } }";
            var form = RunAndGetMainForm(Project("", extra));
            Ui.Dispatch(form.Id(), "close", "");
            Assert.Empty(b.Dialogs);
            Assert.Contains(b.Log, l => l == "MSG:Çık?");
            Assert.True(form.IsDisposed); // NullBackend "Yes" döndürür
        }

        [Fact]
        public void AwaitTaskDelayContinuesOnUi()
        {
            var b = Backend();
            var form = RunAndGetMainForm(Project("", @"namespace HesapMakinesi { public partial class Form1 {
                protected override async void OnShown(EventArgs e) { base.OnShown(e); label1.Text = ""önce""; await Task.Yield(); label1.Text = ""sonra""; }
            } }"));
            // Devam kısmı aynı tur sonunda arayüz iş parçacığında çalışır.
            Assert.Equal("sonra", Find(form, "label1").Text);
        }

        [Fact]
        public void TimerIsNotAmbiguous()
        {
            Backend();
            var r = new ProjectCompiler().Build(Project("Timer t = new Timer(); t.Interval = 10;"));
            Assert.True(r.Success, string.Join("\n", r.Diagnostics.Select(d => d.Message)));
        }

        [Fact]
        public void CompletionListsMembers()
        {
            var compiler = new ProjectCompiler();
            var p = Project("textBox1.");
            var code = p.Files[1].Content;
            int pos = code.IndexOf("textBox1.") + "textBox1.".Length;
            var items = Completion.GetItems(compiler, p, "Form1.cs", pos);
            Assert.Contains(items, i => i.Label == "Text" && i.Kind == "Property");
            Assert.Contains(items, i => i.Label == "Clear" && i.Kind == "Method");
            Assert.DoesNotContain(items, i => i.Label == "Id");
        }

        [Fact]
        public void AddEventHandlerInsertsMethod()
        {
            var json = CodeTools.AddEventHandler(Samples.Form1.Replace("BODY", ""), "Form1", "button2_Click", "EventArgs");
            var doc = System.Text.Json.JsonDocument.Parse(json).RootElement;
            string code = doc.GetProperty("code").GetString();
            int line = doc.GetProperty("line").GetInt32();
            Assert.Contains("private void button2_Click(object sender, EventArgs e)", code);
            Assert.Equal("", code.Split('\n')[line - 1].Trim());
            var r = new ProjectCompiler().Build(new ProjectInput
            {
                Files = { new() { Name = "Program.cs", Content = Samples.Program }, new() { Name = "Form1.cs", Content = code }, new() { Name = "Form1.Designer.cs", Content = Samples.Designer } }
            });
            Assert.True(r.Success);
        }

        [Fact]
        public void ZipContainsProject()
        {
            var bytes = CodeTools.ExportZip(Project());
            using var zip = new System.IO.Compression.ZipArchive(new MemoryStream(bytes));
            var names = zip.Entries.Select(e => e.FullName).ToList();
            Assert.Contains("Hesap Makinesi/HesapMakinesi.csproj", names);
            Assert.Contains("Hesap Makinesi/Form1.Designer.cs", names);
            Assert.Contains("Hesap Makinesi/HesapMakinesi.slnx", names);
            Assert.Contains("Hesap Makinesi/HesapMakinesi.sln", names);
            using var r = new StreamReader(zip.GetEntry("Hesap Makinesi/HesapMakinesi.slnx").Open());
            Assert.Contains("<Project Path=\"HesapMakinesi.csproj\" />", r.ReadToEnd());
        }
    }

    static class Ext
    {
        public static int Id(this Control c) => (int)c.Handle;
    }
}
