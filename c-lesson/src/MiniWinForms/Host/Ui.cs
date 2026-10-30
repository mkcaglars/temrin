using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;
using System.Windows.Forms;

namespace MiniWinForms
{
    /// <summary>
    /// Kütüphanenin dış dünyayla (tarayıcıdaki JavaScript) konuştuğu arayüz.
    /// Engine projesi bunu JSImport ile uygular; testlerde sahte bir uygulama kullanılır.
    /// </summary>
    public interface IUiBackend
    {
        /// <summary>Biriken arayüz işlemlerini (JSON dizi) uygular.</summary>
        void ApplyOps(string opsJson);
        /// <summary>Mevcut JS turu bittiğinde Ui.Flush çağrılmasını ister.</summary>
        void ScheduleFlush();
        /// <summary>Metnin piksel ölçüsünü "genişlik,yükseklik" olarak döndürür.</summary>
        string Measure(string text, string font);
        string MessageBox(string text, string caption, string buttons, string icon);
        /// <summary>Beklemeyen (async) iletişim kutusu açar; sonuç Ui.CompleteDialog ile gelir.</summary>
        void ShowDialog(int requestId, string kind, string json);
        /// <summary>null dönerse kullanıcı İptal'e basmıştır.</summary>
        string InputBox(string prompt, string title, string defaultResponse);
        /// <summary>Tarayıcıdan anlık bilgi okur (ör. imleç konumu).</summary>
        string Query(int id, string what);
        void Output(string text);
        void Error(string json);
        void ProgramEnded(string reason);
    }

    internal interface IUiTarget
    {
        string HandleUiEvent(string evt, string data);
    }

    public sealed class NullBackend : IUiBackend
    {
        public readonly List<string> Log = new List<string>();
        public void ApplyOps(string opsJson) => Log.Add(opsJson);
        public void ScheduleFlush() { }
        public string Measure(string text, string font) => ((text ?? "").Length * 7 + 2) + ",15";
        public string MessageBox(string text, string caption, string buttons, string icon) { Log.Add("MSG:" + text); return buttons == "YesNo" || buttons == "YesNoCancel" ? "Yes" : "OK"; }
        public string InputBox(string prompt, string title, string defaultResponse) => defaultResponse;
        public readonly List<(int id, string kind, string json)> Dialogs = new List<(int, string, string)>();
        public void ShowDialog(int requestId, string kind, string json) { Log.Add("DLG:" + kind + ":" + json); Dialogs.Add((requestId, kind, json)); }
        public string Query(int id, string what) => "";
        public void Output(string text) => Log.Add("OUT:" + text);
        public void Error(string json) => Log.Add("ERR:" + json);
        public void ProgramEnded(string reason) => Log.Add("END:" + reason);
    }

    /// <summary>.NET tarafındaki nesneler ile tarayıcıdaki DOM öğeleri arasındaki köprü.</summary>
    public static class Ui
    {
        public static IUiBackend Backend { get; set; } = new NullBackend();

        static readonly List<string> ops = new List<string>();
        static readonly Dictionary<(int, string), int> setIndex = new Dictionary<(int, string), int>();
        static readonly Dictionary<(int, string), Func<string>> lazySets = new Dictionary<(int, string), Func<string>>();
        static readonly Dictionary<int, object> objects = new Dictionary<int, object>();
        static int nextId = 1;
        static int depth;
        static bool flushScheduled;

        static readonly Queue<(int gen, System.Threading.SendOrPostCallback d, object state)> posted = new Queue<(int, System.Threading.SendOrPostCallback, object)>();
        static readonly Dictionary<int, System.Threading.Tasks.TaskCompletionSource<string>> dialogs = new Dictionary<int, System.Threading.Tasks.TaskCompletionSource<string>>();
        static bool draining;
        static int nextDialog = 1;

        /// <summary>Her çalıştırmada artar; eski programdan kalan geri çağrılar yok sayılır.</summary>
        public static int Generation { get; private set; } = 1;

        internal static void Post(int gen, System.Threading.SendOrPostCallback d, object state)
        {
            posted.Enqueue((gen, d, state));
            if (!flushScheduled)
            {
                flushScheduled = true;
                Backend.ScheduleFlush();
            }
        }

        /// <summary>Tarayıcıda async iletişim kutusu açar.</summary>
        internal static System.Threading.Tasks.Task<string> OpenDialog(string kind, string json)
        {
            int id = nextDialog++;
            var tcs = new System.Threading.Tasks.TaskCompletionSource<string>();
            dialogs[id] = tcs;
            Flush();
            Backend.ShowDialog(id, kind, json);
            return tcs.Task;
        }

        /// <summary>Tarayıcıdaki iletişim kutusu kapanınca çağrılır.</summary>
        public static void CompleteDialog(int requestId, string result)
        {
            if (!dialogs.TryGetValue(requestId, out var tcs)) return;
            dialogs.Remove(requestId);
            Execute(() => tcs.TrySetResult(result));
        }

        /// <summary>Program çalışıyor mu (Application.Run / ilk form gösterildi).</summary>
        public static bool Running { get; internal set; }

        internal static int Register(object o)
        {
            int id = nextId++;
            objects[id] = o;
            return id;
        }

        internal static void Unregister(int id) => objects.Remove(id);

        internal static object Find(int id) => objects.TryGetValue(id, out var o) ? o : null;

        internal static IEnumerable<object> AllObjects => new List<object>(objects.Values);

        static void Add(string op)
        {
            ops.Add(op);
            if (depth == 0 && !flushScheduled)
            {
                flushScheduled = true;
                Backend.ScheduleFlush();
            }
        }

        internal static void Create(int id, string type) => Add("[\"c\"," + id + "," + J(type) + "]");
        internal static void Destroy(int id) => Add("[\"d\"," + id + "]");
        internal static void Parent(int id, int parentId) => Add("[\"p\"," + id + "," + parentId + "]");
        /// <summary>Veri dosyasını (ör. okul.xml) uygulama klasörüne yazar; program değiştirince tarayıcıya bildirilir.</summary>
        public static void WriteDataFile(string name, string content)
        {
            string path = System.IO.Path.Combine(System.Windows.Forms.Application.StartupPath, System.IO.Path.GetFileName(name));
            System.IO.Directory.CreateDirectory(System.Windows.Forms.Application.StartupPath);
            System.IO.File.WriteAllText(path, content ?? "", new UTF8Encoding(false));
            System.Windows.Forms.VirtualFiles.WatchData(path);
        }

        /// <summary>Program veri dosyasını değiştirdi: proje verisi güncellensin.</summary>
        internal static void DataFileChanged(string name, string content) => Add("[\"dbfile\"," + J(name) + "," + J(content) + "]");

        /// <summary>Programın kaydettiği dosyayı kullanıcıya indirme bağlantısı olarak sunar.</summary>
        internal static void Download(string name, string base64) => Add("[\"dl\"," + J(name) + "," + J(base64) + "]");

        internal static void Call(int id, string method, string arg = "") => Add("[\"m\"," + id + "," + J(method) + "," + J(arg) + "]");

        internal static void Set(int id, string prop, string value)
        {
            string op = "[\"s\"," + id + "," + J(prop) + "," + J(value) + "]";
            if (setIndex.TryGetValue((id, prop), out int i))
            {
                ops[i] = op;
                return;
            }
            setIndex[(id, prop)] = ops.Count;
            Add(op);
        }

        /// <summary>Değeri gönderim anında hesaplanan özellik (ör. büyük öğe listeleri).</summary>
        internal static void SetLazy(int id, string prop, Func<string> value)
        {
            bool had = lazySets.ContainsKey((id, prop));
            lazySets[(id, prop)] = value;
            if (!had && depth == 0 && !flushScheduled)
            {
                flushScheduled = true;
                Backend.ScheduleFlush();
            }
        }

        internal static void Set(int id, string prop, bool value) => Set(id, prop, value ? "1" : "0");
        internal static void Set(int id, string prop, int value) => Set(id, prop, value.ToString(CultureInfo.InvariantCulture));

        /// <summary>Biriken işlemleri tarayıcıya gönderir.</summary>
        public static void Flush()
        {
            flushScheduled = false;
            if (depth == 0 && !draining && posted.Count > 0)
            {
                draining = true;
                try
                {
                    int n = posted.Count;
                    for (int i = 0; i < n && posted.Count > 0; i++)
                    {
                        var (gen, d, state) = posted.Dequeue();
                        if (gen == Generation) Execute(() => d(state));
                    }
                }
                finally
                {
                    draining = false;
                }
            }
            if (depth == 0) Guard.EndTurn();
            if (depth == 0) System.Windows.Forms.VirtualFiles.CheckWatched();
            if (lazySets.Count > 0)
            {
                var pending = new List<KeyValuePair<(int, string), Func<string>>>(lazySets);
                lazySets.Clear();
                foreach (var kv in pending)
                {
                    if (objects.ContainsKey(kv.Key.Item1)) Set(kv.Key.Item1, kv.Key.Item2, kv.Value());
                }
            }
            if (ops.Count == 0) return;
            var sb = new StringBuilder("[");
            for (int i = 0; i < ops.Count; i++)
            {
                if (i > 0) sb.Append(',');
                sb.Append(ops[i]);
            }
            sb.Append(']');
            ops.Clear();
            setIndex.Clear();
            Backend.ApplyOps(sb.ToString());
        }

        /// <summary>Kullanıcı kodunu (ör. Main) olay işleyici gibi korumalı biçimde çalıştırır.</summary>
        public static void Execute(Action action)
        {
            if (depth == 0) Guard.BeginTurn(true);
            depth++;
            try
            {
                action();
            }
            catch (Exception ex)
            {
                ReportException(ex);
            }
            finally
            {
                depth--;
                if (depth == 0) Flush();
            }
        }

        /// <summary>Tarayıcıdan gelen olayı ilgili nesneye iletir.</summary>
        public static string Dispatch(int id, string evt, string data)
        {
            if (!objects.TryGetValue(id, out var o) || o is not IUiTarget target) return "";
            string result = "";
            if (depth == 0) Guard.BeginTurn(true);
            depth++;
            try
            {
                result = target.HandleUiEvent(evt, data ?? "") ?? "";
            }
            catch (Exception ex)
            {
                ReportException(ex);
            }
            finally
            {
                depth--;
                if (depth == 0) Flush();
            }
            return result;
        }

        /// <summary>Kullanıcı kodunda yakalanmamış bir hatayı ekrana bildirir.</summary>
        public static void ReportException(Exception ex)
        {
            while (ex is System.Reflection.TargetInvocationException && ex.InnerException != null) ex = ex.InnerException;
            if (ex is ProgramAbortedException)
            {
                Application.Terminate(ex.Message);
                return;
            }
            var sb = new StringBuilder("{");
            sb.Append("\"type\":").Append(J(ex.GetType().FullName)).Append(',');
            sb.Append("\"message\":").Append(J(ex.Message)).Append(',');
            sb.Append("\"file\":").Append(Guard.LastFile).Append(',');
            sb.Append("\"line\":").Append(Guard.LastLine).Append(',');
            sb.Append("\"stack\":").Append(J(ex.StackTrace ?? "")).Append('}');
            Flush();
            Backend.Error(sb.ToString());
        }

        /// <summary>Çalışan programı tamamen temizler (Durdur düğmesi / yeni çalıştırma).</summary>
        public static void Reset()
        {
            foreach (var o in AllObjects)
            {
                if (o is Timer t) t.Enabled = false;
            }
            Application.ResetState();
            System.Windows.Forms.VirtualFiles.Reset();
            System.Windows.Forms.BindingContext.Reset();
            objects.Clear();
            lazySets.Clear();
            posted.Clear();
            dialogs.Clear();
            Generation++;
            ops.Clear();
            setIndex.Clear();
            depth = 0;
            flushScheduled = false;
            Running = false;
            Guard.Reset();
            ops.Add("[\"reset\"]");
            Flush();
        }

        internal static string Color(System.Drawing.Color c)
        {
            if (c.IsEmpty) return "";
            if (c.A == 255) return "#" + c.R.ToString("x2") + c.G.ToString("x2") + c.B.ToString("x2");
            return "rgba(" + c.R + "," + c.G + "," + c.B + "," + (c.A / 255.0).ToString("0.###", CultureInfo.InvariantCulture) + ")";
        }

        internal static string Num(double d) => d.ToString(CultureInfo.InvariantCulture);

        public static string J(string s)
        {
            if (s == null) return "null";
            var sb = new StringBuilder(s.Length + 2);
            sb.Append('"');
            foreach (char ch in s)
            {
                switch (ch)
                {
                    case '"': sb.Append("\\\""); break;
                    case '\\': sb.Append("\\\\"); break;
                    case '\n': sb.Append("\\n"); break;
                    case '\r': sb.Append("\\r"); break;
                    case '\t': sb.Append("\\t"); break;
                    default:
                        if (ch < 0x20 || ch == '\u2028' || ch == '\u2029') sb.Append("\\u").Append(((int)ch).ToString("x4"));
                        else sb.Append(ch);
                        break;
                }
            }
            sb.Append('"');
            return sb.ToString();
        }

        internal static string JArray(IEnumerable<string> items)
        {
            var sb = new StringBuilder("[");
            bool first = true;
            foreach (var s in items)
            {
                if (!first) sb.Append(',');
                first = false;
                sb.Append(J(s));
            }
            return sb.Append(']').ToString();
        }
    }

    /// <summary>async/await devamlarını arayüz iş parçacığında, korumalı biçimde çalıştırır.</summary>
    public sealed class UiSynchronizationContext : System.Threading.SynchronizationContext
    {
        readonly int generation;
        public UiSynchronizationContext() { generation = Ui.Generation; }
        public override void Post(System.Threading.SendOrPostCallback d, object state) => Ui.Post(generation, d, state);
        public override void Send(System.Threading.SendOrPostCallback d, object state) => d(state);
        public override System.Threading.SynchronizationContext CreateCopy() => this;
    }

    /// <summary>Sonsuz döngü koruması ve satır takibi. Derleyici her ifadenin önüne Guard.S çağrısı ekler.</summary>
    public static class Guard
    {
        static readonly System.Diagnostics.Stopwatch clock = System.Diagnostics.Stopwatch.StartNew();
        static long turnStart;
        static bool inTurn;
        static int counter;
        static bool aborted;

        public static int LimitMs = 5000;
        public static int LastFile;
        public static int LastLine;

        public static void S(int file, int line)
        {
            LastFile = file;
            LastLine = line;
            if (aborted) throw new ProgramAbortedException(null);
            if (++counter < 512) return;
            counter = 0;
            if (!inTurn)
            {
                BeginTurn();
                Ui.Backend.ScheduleFlush();
                return;
            }
            if (clock.ElapsedMilliseconds - turnStart > LimitMs)
            {
                aborted = true;
                throw new ProgramAbortedException(
                    "Program " + (LimitMs / 1000) + " saniyeden uzun süre yanıt vermedi ve durduruldu. " +
                    "Satır " + line + " civarında sonsuz döngü olabilir.");
            }
        }

        static int callDepth;
        public static int MaxDepth = 1500;

        /// <summary>Her kullanıcı metodunun başında çağrılır (sonsuz özyineleme koruması).</summary>
        public static void Enter()
        {
            if (++callDepth > MaxDepth)
            {
                callDepth--;
                throw new InvalidOperationException(
                    "Metotlar iç içe çok fazla çağrıldı (" + MaxDepth + " kez). Bir metot kendini durmadan çağırıyor olabilir (sonsuz özyineleme). Satır " + LastLine + " civarına bakın.");
            }
        }

        public static void Exit()
        {
            if (callDepth > 0) callDepth--;
        }

        internal static void BeginTurn(bool resetDepth = false)
        {
            if (resetDepth) callDepth = 0;
            inTurn = true;
            turnStart = clock.ElapsedMilliseconds;
            counter = 0;
        }

        internal static void EndTurn() => inTurn = false;

        public static void RestartClockPublic() => RestartClock();

        /// <summary>Mesaj kutusu gibi kullanıcıyı bekleyen işlemlerden sonra süre sayacını sıfırlar.</summary>
        internal static void RestartClock()
        {
            turnStart = clock.ElapsedMilliseconds;
            counter = 0;
        }

        internal static void Reset()
        {
            aborted = false;
            inTurn = false;
            callDepth = 0;
            counter = 0;
            LastFile = 0;
            LastLine = 0;
        }
    }

    public sealed class ProgramAbortedException : Exception
    {
        public ProgramAbortedException(string message) : base(message ?? "Program durduruldu.") { }
    }
}
