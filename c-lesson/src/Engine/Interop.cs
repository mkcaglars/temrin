using System.Runtime.InteropServices.JavaScript;
using System.Runtime.Versioning;
using System.Text.Json;
using CLesson.Compiler;
using MiniWinForms;

namespace CLesson.Engine
{
    /// <summary>JavaScript'in çağırdığı motor fonksiyonları.</summary>
    [SupportedOSPlatform("browser")]
    public static partial class Interop
    {
        static readonly ProjectCompiler compiler = new();
        static BuildResult lastBuild;

        [JSExport]
        public static string Build(string projectJson)
        {
            lastBuild = compiler.Build(ProjectInput.Parse(projectJson));
            return lastBuild.ToJson();
        }

        [JSExport]
        public static string Check(string projectJson)
        {
            var sw = System.Diagnostics.Stopwatch.StartNew();
            var list = compiler.Check(ProjectInput.Parse(projectJson));
            return JsonSerializer.Serialize(new { diagnostics = list, ms = sw.ElapsedMilliseconds });
        }

        [JSExport]
        public static string Run()
        {
            if (lastBuild == null || !lastBuild.Success) return "Önce projeyi hatasız derleyin.";
            try
            {
                ProgramRunner.Run(lastBuild.Assembly, lastBuild.Pdb, lastBuild.DataFiles);
                return "";
            }
            catch (Exception ex)
            {
                return ex.Message;
            }
        }

        [JSExport]
        public static void Stop() => ProgramRunner.Stop();

        [JSExport]
        public static string Dispatch(int id, string evt, string data) => Ui.Dispatch(id, evt, data);

        [JSExport]
        public static void Flush() => Ui.Flush();

        [JSExport]
        public static void CompleteDialog(int requestId, string result) => Ui.CompleteDialog(requestId, result);

        [JSExport]
        public static string Complete(string projectJson, string fileName, int position)
        {
            try
            {
                var items = Completion.GetItems(compiler, ProjectInput.Parse(projectJson), fileName, position);
                return JsonSerializer.Serialize(items);
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine("Tamamlama hatası: " + ex);
                return "[]";
            }
        }

        [JSExport]
        public static string AddEventHandler(string code, string className, string methodName, string argsType) =>
            CodeTools.AddEventHandler(code, className, methodName, argsType);

        [JSExport]
        public static int FindMethodLine(string code, string methodName) => CodeTools.FindMethodLine(code, methodName);

        [JSExport]
        public static string RenameMethod(string code, string oldName, string newName) => CodeTools.RenameMethod(code, oldName, newName);

        [JSExport]
        public static string RenameIdentifier(string code, string oldName, string newName) => CodeTools.RenameIdentifier(code, oldName, newName);

        [JSExport]
        public static byte[] ExportZip(string projectJson) => CodeTools.ExportZip(ProjectInput.Parse(projectJson));

        /// <summary>İlk derlemeyi hızlandırmak için derleyiciyi önceden ısıtır.</summary>
        [JSExport]
        public static string Warmup()
        {
            var sw = System.Diagnostics.Stopwatch.StartNew();
            var p = new ProjectInput { Name = "Isinma", Namespace = "Isinma" };
            p.Files.Add(new ProjectFile
            {
                Name = "Program.cs",
                Content = "namespace Isinma { static class Program { static void Main() { var f = new Form(); f.Text = \"a\" + 1; MessageBox.Show(f.Text); } } }",
            });
            try
            {
                var r = new ProjectCompiler().Build(p);
                return sw.ElapsedMilliseconds + " " + r.Success;
            }
            catch (Exception ex)
            {
                return "HATA " + ex;
            }
        }
    }

    [SupportedOSPlatform("browser")]
    internal static partial class Js
    {
        [JSImport("applyOps", "ui")] internal static partial void ApplyOps(string json);
        [JSImport("scheduleFlush", "ui")] internal static partial void ScheduleFlush();
        [JSImport("measure", "ui")] internal static partial string Measure(string text, string font);
        [JSImport("messageBox", "ui")] internal static partial string MessageBox(string text, string caption, string buttons, string icon);
        [JSImport("inputBox", "ui")] internal static partial string InputBox(string prompt, string title, string defaultResponse);
        [JSImport("showDialog", "ui")] internal static partial void ShowDialog(int requestId, string kind, string json);
        [JSImport("query", "ui")] internal static partial string Query(int id, string what);
        [JSImport("output", "ui")] internal static partial void Output(string text);
        [JSImport("error", "ui")] internal static partial void Error(string json);
        [JSImport("programEnded", "ui")] internal static partial void ProgramEnded(string reason);
    }

    [SupportedOSPlatform("browser")]
    internal sealed class JsBackend : IUiBackend
    {
        public void ApplyOps(string opsJson) => Js.ApplyOps(opsJson);
        public void ScheduleFlush() => Js.ScheduleFlush();
        public string Measure(string text, string font) => Js.Measure(text, font);
        public string MessageBox(string text, string caption, string buttons, string icon) => Js.MessageBox(text, caption, buttons, icon);
        public string InputBox(string prompt, string title, string defaultResponse) => Js.InputBox(prompt, title, defaultResponse);
        public void ShowDialog(int requestId, string kind, string json) => Js.ShowDialog(requestId, kind, json);
        public string Query(int id, string what) => Js.Query(id, what);
        public void Output(string text) => Js.Output(text);
        public void Error(string json) => Js.Error(json);
        public void ProgramEnded(string reason) => Js.ProgramEnded(reason);
    }
}
