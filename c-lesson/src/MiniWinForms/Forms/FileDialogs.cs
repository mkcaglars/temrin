using System.Collections.Generic;
using System.ComponentModel;
using System.Globalization;
using System.IO;
using System.Text;
using System.Threading.Tasks;
using MiniWinForms;

namespace System.Windows.Forms
{
    /// <summary>
    /// Tarayıcıdaki sanal dosya sistemi. Açılan (bilgisayardan seçilen) ve kaydedilen dosyalar
    /// "C:/Users/Ogrenci/Belgeler/" klasöründe durur; File.ReadAllText, Image.FromFile vb. bu dosyalarla çalışır.
    /// Kaydedilen dosyalar kullanıcıya indirme bağlantısı olarak sunulur.
    /// </summary>
    internal static class VirtualFiles
    {
        public const string Folder = "C:/Users/Ogrenci/Belgeler/";
        static readonly Dictionary<string, DateTime> watched = new Dictionary<string, DateTime>();
        static readonly Dictionary<string, DateTime> watchedData = new Dictionary<string, DateTime>();

        public static void WatchData(string path) => watchedData[path] = File.Exists(path) ? File.GetLastWriteTimeUtc(path) : DateTime.MinValue;

        public static string PathOf(string name) => Folder + name;

        public static void EnsureFolder()
        {
            try { Directory.CreateDirectory(Folder); } catch { /* yok */ }
        }

        public static List<(string name, long size)> List()
        {
            var r = new List<(string, long)>();
            try
            {
                if (!Directory.Exists(Folder)) return r;
                foreach (var f in Directory.GetFiles(Folder))
                {
                    var fi = new FileInfo(f);
                    r.Add((fi.Name, fi.Length));
                }
            }
            catch { /* yok */ }
            r.Sort((a, b) => string.Compare(a.Item1, b.Item1, StringComparison.CurrentCultureIgnoreCase));
            return r;
        }

        /// <summary>Kaydetme iletişim kutusunda seçilen dosya izlenir; program yazınca indirme bağlantısı çıkar.</summary>
        public static void Watch(string path)
        {
            watched[path] = File.Exists(path) ? File.GetLastWriteTimeUtc(path) : DateTime.MinValue;
        }

        /// <summary>Her tur sonunda (Flush) çağrılır: izlenen dosyalar değiştiyse tarayıcıya gönderir.</summary>
        public static void CheckWatched()
        {
            foreach (var path in new List<string>(watchedData.Keys))
            {
                try
                {
                    if (!File.Exists(path)) continue;
                    var t = File.GetLastWriteTimeUtc(path);
                    if (t == watchedData[path]) continue;
                    watchedData[path] = t;
                    Ui.DataFileChanged(Path.GetFileName(path), File.ReadAllText(path));
                }
                catch { /* sonraki turda */ }
            }
            if (watched.Count == 0) return;
            foreach (var path in new List<string>(watched.Keys))
            {
                try
                {
                    if (!File.Exists(path)) continue;
                    var t = File.GetLastWriteTimeUtc(path);
                    if (t == watched[path]) continue;
                    watched[path] = t;
                    var bytes = File.ReadAllBytes(path);
                    Ui.Download(Path.GetFileName(path), Convert.ToBase64String(bytes));
                }
                catch { /* dosya açık olabilir; sonraki turda denenir */ }
            }
        }

        public static void Reset() { watched.Clear(); watchedData.Clear(); }

        /// <summary>Filtre metni ("Resimler|*.jpg;*.png|Tüm Dosyalar|*.*") → [(ad, desenler)].</summary>
        public static List<(string name, string patterns)> ParseFilter(string filter)
        {
            var r = new List<(string, string)>();
            if (string.IsNullOrEmpty(filter)) return r;
            var parts = filter.Split('|');
            if (parts.Length % 2 != 0)
                throw new ArgumentException("Filter (filtre) dizesi geçersiz. Biçim: \"Açıklama|*.uzantı\" — ör. \"Metin Dosyası|*.txt|Tüm Dosyalar|*.*\"");
            for (int i = 0; i + 1 < parts.Length; i += 2) r.Add((parts[i], parts[i + 1]));
            return r;
        }
    }

    public abstract class CommonDialog : Component
    {
        protected CommonDialog() { GC.SuppressFinalize(this); }

        public object Tag { get; set; }
        public event EventHandler HelpRequest;

        /// <summary>Bu çağrı beklenemeyen bir yerde (ör. Main) kullanılırsa iletişim kutusu açılamaz.</summary>
        public DialogResult ShowDialog()
        {
            throw new InvalidOperationException(GetType().Name + ".ShowDialog() burada kullanılamaz. Bu çağrıyı bir olay metodunun (ör. button1_Click) içine taşıyın.");
        }

        public DialogResult ShowDialog(IWin32Window owner) => ShowDialog();

        public Task<DialogResult> ShowDialogAsync() => RunDialogAsync();
        public Task<DialogResult> ShowDialogAsync(IWin32Window owner) => RunDialogAsync();

        internal abstract Task<DialogResult> RunDialogAsync();
        public virtual void Reset() { }
        protected virtual void OnHelpRequest(EventArgs e) => HelpRequest?.Invoke(this, e);
    }

    public abstract class FileDialog : CommonDialog
    {
        string fileName = "";
        string[] fileNames = new string[0];
        string filter = "";

        public string FileName
        {
            get => fileName;
            set { fileName = value ?? ""; fileNames = fileName.Length > 0 ? new[] { fileName } : new string[0]; }
        }

        public string[] FileNames => (string[])fileNames.Clone();
        public string Filter
        {
            get => filter;
            set { VirtualFiles.ParseFilter(value); filter = value ?? ""; }
        }
        public int FilterIndex { get; set; } = 1;
        public string InitialDirectory { get; set; } = "";
        public string Title { get; set; } = "";
        public string DefaultExt { get; set; } = "";
        public bool AddExtension { get; set; } = true;
        public bool CheckFileExists { get; set; }
        public bool CheckPathExists { get; set; } = true;
        public bool RestoreDirectory { get; set; }
        public bool ShowHelp { get; set; }
        public bool ValidateNames { get; set; } = true;
        public bool DereferenceLinks { get; set; } = true;
        public bool SupportMultiDottedExtensions { get; set; }
        public bool AutoUpgradeEnabled { get; set; } = true;
        public event CancelEventHandler FileOk;

        internal void SetFiles(string[] names)
        {
            fileNames = names;
            fileName = names.Length > 0 ? names[0] : "";
        }

        internal abstract string Kind { get; }
        internal virtual void ExtraJson(StringBuilder sb) { }

        internal string BuildJson()
        {
            var sb = new StringBuilder("{");
            sb.Append("\"title\":").Append(Ui.J(Title));
            sb.Append(",\"filters\":[");
            var f = VirtualFiles.ParseFilter(filter);
            for (int i = 0; i < f.Count; i++)
            {
                if (i > 0) sb.Append(',');
                sb.Append("{\"n\":").Append(Ui.J(f[i].name)).Append(",\"p\":").Append(Ui.J(f[i].patterns)).Append('}');
            }
            sb.Append("],\"index\":").Append(Math.Max(1, FilterIndex));
            sb.Append(",\"folder\":").Append(Ui.J(VirtualFiles.Folder));
            sb.Append(",\"fileName\":").Append(Ui.J(Path.GetFileName(fileName)));
            sb.Append(",\"ext\":").Append(Ui.J(DefaultExt));
            sb.Append(",\"files\":[");
            var list = VirtualFiles.List();
            for (int i = 0; i < list.Count; i++)
            {
                if (i > 0) sb.Append(',');
                sb.Append("{\"n\":").Append(Ui.J(list[i].name)).Append(",\"s\":").Append(list[i].size).Append('}');
            }
            sb.Append(']');
            ExtraJson(sb);
            return sb.Append('}').ToString();
        }

        internal override async Task<DialogResult> RunDialogAsync()
        {
            VirtualFiles.EnsureFolder();
            string r = await Ui.OpenDialog(Kind, BuildJson());
            if (string.IsNullOrEmpty(r) || !r.StartsWith("OK", StringComparison.Ordinal)) return DialogResult.Cancel;
            var lines = r.Split('\n');
            var names = new List<string>();
            for (int i = 1; i < lines.Length; i++)
            {
                if (lines[i].Length == 0) continue;
                int tab = lines[i].IndexOf('\t');
                string name = tab >= 0 ? lines[i].Substring(0, tab) : lines[i];
                string data = tab >= 0 ? lines[i].Substring(tab + 1) : "";
                name = Path.GetFileName(name.Replace('\\', '/'));
                if (name.Length == 0) continue;
                string path = VirtualFiles.PathOf(name);
                if (data.Length > 0) File.WriteAllBytes(path, Convert.FromBase64String(data));
                names.Add(path);
            }
            if (names.Count == 0) return DialogResult.Cancel;
            if (lines[0].Length > 3 && int.TryParse(lines[0].Substring(3), NumberStyles.Integer, CultureInfo.InvariantCulture, out int fi)) FilterIndex = fi;
            SetFiles(names.ToArray());
            var e = new CancelEventArgs();
            FileOk?.Invoke(this, e);
            if (e.Cancel) return DialogResult.Cancel;
            AfterOk();
            return DialogResult.OK;
        }

        internal virtual void AfterOk() { }

        public override void Reset()
        {
            FileName = "";
            filter = "";
            FilterIndex = 1;
            Title = "";
            DefaultExt = "";
            InitialDirectory = "";
        }

        public override string ToString() => base.ToString() + ": Title: " + Title + ", FileName: " + FileName;
    }

    public sealed class OpenFileDialog : FileDialog
    {
        public OpenFileDialog() { CheckFileExists = true; }
        public bool Multiselect { get; set; }
        public bool ReadOnlyChecked { get; set; }
        public bool ShowReadOnly { get; set; }
        public string SafeFileName => Path.GetFileName(FileName);
        public string[] SafeFileNames => Array.ConvertAll(FileNames, Path.GetFileName);
        internal override string Kind => "openfile";
        internal override void ExtraJson(StringBuilder sb) { if (Multiselect) sb.Append(",\"multi\":1"); }

        public Stream OpenFile()
        {
            if (string.IsNullOrEmpty(FileName)) throw new ArgumentNullException("FileName", "Önce bir dosya seçilmelidir.");
            return new FileStream(FileName, FileMode.Open, FileAccess.Read);
        }
    }

    public sealed class SaveFileDialog : FileDialog
    {
        public bool OverwritePrompt { get; set; } = true;
        public bool CreatePrompt { get; set; }
        internal override string Kind => "savefile";
        internal override void ExtraJson(StringBuilder sb) { if (OverwritePrompt) sb.Append(",\"overwrite\":1"); }
        internal override void AfterOk()
        {
            foreach (var f in FileNames) VirtualFiles.Watch(f);
        }

        public Stream OpenFile()
        {
            if (string.IsNullOrEmpty(FileName)) throw new ArgumentNullException("FileName", "Önce bir dosya adı seçilmelidir.");
            return new FileStream(FileName, FileMode.Create, FileAccess.ReadWrite);
        }
    }

    public sealed class FolderBrowserDialog : CommonDialog
    {
        public string SelectedPath { get; set; } = "";
        public string Description { get; set; } = "";
        public bool ShowNewFolderButton { get; set; } = true;
        public bool UseDescriptionForTitle { get; set; }
        internal override async Task<DialogResult> RunDialogAsync()
        {
            VirtualFiles.EnsureFolder();
            var r = await MessageBox.ShowAsync("Web ortamında yalnızca \"Belgeler\" klasörü kullanılabilir:\n" + VirtualFiles.Folder, string.IsNullOrEmpty(Description) ? "Klasör seç" : Description, MessageBoxButtons.OKCancel, MessageBoxIcon.Information);
            if (r != DialogResult.OK) return DialogResult.Cancel;
            SelectedPath = VirtualFiles.Folder.TrimEnd('/');
            return DialogResult.OK;
        }
    }
}
