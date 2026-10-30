using System.Collections;
using System.Collections.Generic;
using System.ComponentModel;
using System.Drawing;
using System.Threading.Tasks;
using MiniWinForms;

namespace System.Windows.Forms
{
    public interface IWin32Window
    {
        IntPtr Handle { get; }
    }

    public interface IButtonControl
    {
        DialogResult DialogResult { get; set; }
        void NotifyDefault(bool value);
        void PerformClick();
    }

    public class ScrollableControl : Control
    {
        bool autoScroll;
        public virtual bool AutoScroll { get => autoScroll; set { autoScroll = value; Ui.Set(Id, "autoscroll", value); } }
        public Size AutoScrollMinSize { get; set; }
        public Point AutoScrollPosition { get; set; }
        public void ScrollControlIntoView(Control activeControl) { }
    }

    public class ContainerControl : ScrollableControl
    {
        Control activeControl;
        public SizeF AutoScaleDimensions { get; set; }
        public AutoScaleMode AutoScaleMode { get; set; }
        public Control ActiveControl
        {
            get => activeControl;
            set { activeControl = value; value?.Focus(); }
        }
        internal void SetActiveControlSilently(Control c) => activeControl = c;
        public bool Validate() { PushBindings(); return true; }
        public bool Validate(bool checkAutoValidate) => Validate();
        public bool ValidateChildren() { PushBindings(); return true; }
        public bool ValidateChildren(ValidationConstraints constraints) => ValidateChildren();
    }

    public class Form : ContainerControl, IWin32Window
    {
        static readonly object EvLoad = new object(), EvShown = new object(), EvActivated = new object(), EvDeactivate = new object(),
            EvFormClosing = new object(), EvFormClosed = new object(), EvClosing = new object(), EvClosed = new object();

        FormBorderStyle borderStyle = FormBorderStyle.Sizable;
        FormStartPosition startPosition = FormStartPosition.WindowsDefaultLocation;
        FormWindowState windowState = FormWindowState.Normal;
        bool maximizeBox = true, minimizeBox = true, controlBox = true, topMost, showInTaskbar = true, keyPreview, topLevel = true;
        double opacity = 1.0;
        bool loaded, shownOnce, closing, isModal;
        internal bool ShownOnce => shownOnce;
        DialogResult dialogResult;
        TaskCompletionSource<DialogResult> dialogTcs;
        Form owner;
        readonly List<Form> ownedForms = new List<Form>();

        public Form()
        {
            SetVisibleSilently();
            Application.RegisterForm(this);
        }

        void SetVisibleSilently()
        {
            base.SetVisibleCore(false);
        }

        internal override string UiType => "Form";
        protected override Size DefaultSize => new Size(300, 300);

        bool HasFrame => borderStyle != FormBorderStyle.None;
        internal override Size ClientSizeFromSize(int w, int h) => HasFrame ? new Size(Math.Max(0, w - 16), Math.Max(0, h - 39)) : new Size(w, h);
        internal override Size SizeFromClientSize(int w, int h) => HasFrame ? new Size(w + 16, h + 39) : new Size(w, h);

        internal override void SendBounds()
        {
            var c = ClientSize;
            Ui.Set(Id, "bounds", Left + "," + Top + "," + c.Width + "," + c.Height);
        }

        // ---------------- Özellikler ----------------

        public FormBorderStyle FormBorderStyle
        {
            get => borderStyle;
            set
            {
                var client = ClientSize;
                borderStyle = value;
                Ui.Set(Id, "border", value.ToString());
                ClientSize = client;
            }
        }

        public FormStartPosition StartPosition { get => startPosition; set { startPosition = value; Ui.Set(Id, "startpos", value.ToString()); } }

        public FormWindowState WindowState
        {
            get => windowState;
            set
            {
                if (windowState == value) return;
                windowState = value;
                Ui.Set(Id, "state", value.ToString());
            }
        }

        public bool MaximizeBox { get => maximizeBox; set { maximizeBox = value; SendBox(); } }
        public bool MinimizeBox { get => minimizeBox; set { minimizeBox = value; SendBox(); } }
        public bool ControlBox { get => controlBox; set { controlBox = value; SendBox(); } }
        void SendBox() => Ui.Set(Id, "box", (controlBox ? "1" : "0") + (minimizeBox ? "1" : "0") + (maximizeBox ? "1" : "0"));
        public bool TopMost { get => topMost; set { topMost = value; Ui.Set(Id, "topmost", value); } }
        public bool ShowInTaskbar { get => showInTaskbar; set { showInTaskbar = value; Ui.Set(Id, "taskbar", value); } }
        public bool ShowIcon { get; set; } = true;
        public bool HelpButton { get; set; }
        public bool KeyPreview { get => keyPreview; set { keyPreview = value; Ui.Set(Id, "keypreview", value); } }
        public object Icon { get; set; }
        public bool IsMdiContainer { get; set; }
        public Form MdiParent { get; set; }
        public MenuStrip MainMenuStrip { get; set; }
        public SizeGripStyle SizeGripStyle { get; set; }
        public double Opacity
        {
            get => opacity;
            set { opacity = Math.Max(0, Math.Min(1, value)); Ui.Set(Id, "opacity", Ui.Num(opacity)); }
        }

        public bool TopLevel
        {
            get => topLevel;
            set { topLevel = value; Ui.Set(Id, "toplevel", value); if (!value) base.SetVisibleCore(true); }
        }

        public IButtonControl AcceptButton { get; set; }
        public IButtonControl CancelButton { get; set; }
        public bool Modal => isModal;
        public bool IsMdiChild => false;

        public Form Owner
        {
            get => owner;
            set
            {
                owner?.ownedForms.Remove(this);
                owner = value;
                value?.ownedForms.Add(this);
            }
        }

        public Form[] OwnedForms => ownedForms.ToArray();
        public static Form ActiveForm { get; internal set; }
        public Rectangle DesktopBounds { get => Bounds; set => Bounds = value; }
        public Point DesktopLocation { get => Location; set => Location = value; }
        public Rectangle RestoreBounds => Bounds;

        public DialogResult DialogResult
        {
            get => dialogResult;
            set
            {
                dialogResult = value;
                if (isModal && value != DialogResult.None) CloseCore(CloseReason.None);
            }
        }

        internal override void SendText() => Ui.Set(Id, "text", Text);

        // ---------------- Gösterme / kapatma ----------------

        public new void Show()
        {
            Visible = true;
            Activate();
        }

        public void Show(IWin32Window owner)
        {
            if (owner is Form f && f != this) Owner = f;
            Show();
        }

        protected override void SetVisibleCore(bool value)
        {
            if (IsDisposed) throw new ObjectDisposedException(GetType().Name, "Kapatılmış (Close) bir form tekrar gösterilemez. Yeni bir form oluşturun: new " + GetType().Name + "()");
            if (value && !loaded)
            {
                loaded = true;
                Ui.Running = true;
                OnLoad(EventArgs.Empty);
                if (IsDisposed || closing) return;
            }
            base.SetVisibleCore(value);
            if (value && !shownOnce)
            {
                shownOnce = true;
                OnFormShownInternal();
                OnShown(EventArgs.Empty);
            }
        }

        public void Activate()
        {
            if (!VisibleFlag) return;
            Ui.Call(Id, "activate");
            SetActive();
        }

        void SetActive()
        {
            if (ActiveForm == this) return;
            var old = ActiveForm;
            ActiveForm = this;
            old?.OnDeactivate(EventArgs.Empty);
            OnActivated(EventArgs.Empty);
        }

        /// <summary>
        /// Formu iletişim kutusu olarak gösterir. Web ortamında program burada bekleyemez;
        /// derleyici bu çağrıyı otomatik olarak "await ShowDialogAsync()" biçimine çevirir.
        /// </summary>
        public DialogResult ShowDialog()
        {
            ShowDialogAsync();
            return DialogResult.None;
        }

        public DialogResult ShowDialog(IWin32Window owner)
        {
            if (owner is Form f && f != this) Owner = f;
            return ShowDialog();
        }

        public Task<DialogResult> ShowDialogAsync()
        {
            if (VisibleFlag) throw new InvalidOperationException("Zaten görünür olan bir form iletişim kutusu olarak açılamaz.");
            isModal = true;
            dialogResult = DialogResult.None;
            dialogTcs = new TaskCompletionSource<DialogResult>();
            Ui.Set(Id, "modal", true);
            if (startPosition == FormStartPosition.WindowsDefaultLocation) StartPosition = FormStartPosition.CenterParent;
            Show();
            return dialogTcs.Task;
        }

        public Task<DialogResult> ShowDialogAsync(IWin32Window owner)
        {
            if (owner is Form f && f != this) Owner = f;
            return ShowDialogAsync();
        }

        public void Close() => CloseCore(CloseReason.UserClosing);

        internal bool CloseCore(CloseReason reason, bool cancellable = true)
        {
            if (closing || IsDisposed) return true;
            closing = true;
            try
            {
                if (loaded)
                {
                    var e = new FormClosingEventArgs(reason, false);
                    OnFormClosing(e);
                    if (e.Cancel && cancellable)
                    {
                        if (isModal) dialogResult = DialogResult.None;
                        return false;
                    }
                }
                foreach (var f in ownedForms.ToArray()) f.CloseCore(CloseReason.FormOwnerClosing, false);
                if (loaded) OnFormClosed(new FormClosedEventArgs(reason));
                if (ActiveForm == this) ActiveForm = null;
                if (isModal)
                {
                    // İletişim kutuları kapatılınca yok edilmez, gizlenir (WinForms ile aynı).
                    isModal = false;
                    Ui.Set(Id, "modal", false);
                    base.SetVisibleCore(false);
                    loaded = false;
                    shownOnce = false;
                    if (dialogResult == DialogResult.None) dialogResult = DialogResult.Cancel;
                    var tcs = dialogTcs;
                    dialogTcs = null;
                    tcs?.TrySetResult(dialogResult);
                }
                else
                {
                    Dispose();
                }
                Application.FormClosed(this);
                return true;
            }
            finally
            {
                closing = false;
            }
        }

        protected override void Dispose(bool disposing)
        {
            Application.UnregisterForm(this);
            Owner = null;
            base.Dispose(disposing);
        }

        // ---------------- Olaylar ----------------

        public event EventHandler Load { add => Events.AddHandler(EvLoad, value); remove => Events.RemoveHandler(EvLoad, value); }
        public event EventHandler Shown { add => Events.AddHandler(EvShown, value); remove => Events.RemoveHandler(EvShown, value); }
        public event EventHandler Activated { add => Events.AddHandler(EvActivated, value); remove => Events.RemoveHandler(EvActivated, value); }
        public event EventHandler Deactivate { add => Events.AddHandler(EvDeactivate, value); remove => Events.RemoveHandler(EvDeactivate, value); }
        public event FormClosingEventHandler FormClosing { add => Events.AddHandler(EvFormClosing, value); remove => Events.RemoveHandler(EvFormClosing, value); }
        public event FormClosedEventHandler FormClosed { add => Events.AddHandler(EvFormClosed, value); remove => Events.RemoveHandler(EvFormClosed, value); }
        public event CancelEventHandler Closing { add => Events.AddHandler(EvClosing, value); remove => Events.RemoveHandler(EvClosing, value); }
        public event EventHandler Closed { add => Events.AddHandler(EvClosed, value); remove => Events.RemoveHandler(EvClosed, value); }
        public event EventHandler ResizeBegin;
        public event EventHandler ResizeEnd;

        protected virtual void OnLoad(EventArgs e) => Ev.Fire(Events[EvLoad], this, e);
        protected virtual void OnShown(EventArgs e) => Ev.Fire(Events[EvShown], this, e);
        protected virtual void OnActivated(EventArgs e) => Ev.Fire(Events[EvActivated], this, e);
        protected virtual void OnDeactivate(EventArgs e) => Ev.Fire(Events[EvDeactivate], this, e);
        protected virtual void OnFormClosing(FormClosingEventArgs e)
        {
            Ev.Fire(Events[EvClosing], this, e);
            Ev.Fire(Events[EvFormClosing], this, e);
        }
        protected virtual void OnFormClosed(FormClosedEventArgs e)
        {
            Ev.Fire(Events[EvClosed], this, EventArgs.Empty);
            Ev.Fire(Events[EvFormClosed], this, e);
        }

        internal override string HandleUiEvent(string evt, string data)
        {
            switch (evt)
            {
                case "close":
                    Close();
                    return "";
                case "resize":
                {
                    var p = data.Split(',');
                    if (p.Length == 2 && int.TryParse(p[0], out int w) && int.TryParse(p[1], out int h))
                    {
                        ResizeBegin?.Invoke(this, EventArgs.Empty);
                        ClientSize = new Size(w, h);
                        ResizeEnd?.Invoke(this, EventArgs.Empty);
                    }
                    return "";
                }
                case "move":
                {
                    var p = data.Split(',');
                    if (p.Length == 2 && int.TryParse(p[0], out int nx) && int.TryParse(p[1], out int ny)) Location = new Point(nx, ny);
                    return "";
                }
                case "state":
                    if (Enum.TryParse<FormWindowState>(data, out var st)) windowState = st;
                    return "";
                case "activate":
                    SetActive();
                    return "";
                case "accept":
                    if (AcceptButton == null) return "";
                    AcceptButton.PerformClick();
                    return "handled";
                case "cancel":
                    if (CancelButton == null) return "";
                    CancelButton.PerformClick();
                    return "handled";
            }
            return base.HandleUiEvent(evt, data);
        }
    }

    [Flags] public enum ValidationConstraints { None = 0, Selectable = 1, Enabled = 2, Visible = 4, TabStop = 8, ImmediateChildren = 16 }

    public enum SizeGripStyle { Auto = 0, Show = 1, Hide = 2 }

    public class FormCollection : ReadOnlyCollectionBase
    {
        internal FormCollection(List<Form> forms) { foreach (var f in forms) InnerList.Add(f); }
        public virtual Form this[int index] => (Form)InnerList[index];
        public virtual Form this[string name]
        {
            get
            {
                foreach (Form f in InnerList) if (string.Equals(f.Name, name, StringComparison.OrdinalIgnoreCase)) return f;
                return null;
            }
        }
    }

    public class ApplicationContext
    {
        public ApplicationContext() { }
        public ApplicationContext(Form mainForm) { MainForm = mainForm; }
        public Form MainForm { get; set; }
        public object Tag { get; set; }
        public void ExitThread() => Application.Exit();
    }

    public static class Application
    {
        static readonly List<Form> forms = new List<Form>();
        static Form mainForm;
        static bool exiting;

        public static FormCollection OpenForms
        {
            get
            {
                var visible = new List<Form>();
                foreach (var f in forms) if (f.VisibleFlag && !f.IsDisposed) visible.Add(f);
                return new FormCollection(visible);
            }
        }

        public static string StartupPath => "/uygulama";
        public static string ExecutablePath => "/uygulama/Uygulama.exe";
        public static string ProductName { get; set; } = "WinFormsUygulamasi";
        public static string ProductVersion => "1.0.0.0";
        public static string CompanyName => "Okul";
        public static string CommonAppDataPath => "/uygulama/veri";
        public static string UserAppDataPath => "/uygulama/veri";
        public static bool MessageLoop => Ui.Running;

        public static event EventHandler ApplicationExit;
        public static event EventHandler Idle;
        public static event System.Threading.ThreadExceptionEventHandler ThreadException;

        public static void EnableVisualStyles() { }
        public static void SetCompatibleTextRenderingDefault(bool defaultValue) { }
        public static bool SetHighDpiMode(HighDpiMode highDpiMode) => true;
        public static void SetUnhandledExceptionMode(UnhandledExceptionMode mode) { }
        public static void SetDefaultFont(Font font) { }
        public static void SetColorMode(int mode) { }
        public static void DoEvents() => Ui.Flush();
        public static void Restart() => throw new NotSupportedException("Application.Restart web ortamında desteklenmiyor.");

        public static void Run() { Ui.Running = true; }

        public static void Run(Form mainForm)
        {
            if (mainForm == null) throw new ArgumentNullException(nameof(mainForm));
            Application.mainForm = mainForm;
            Ui.Running = true;
            mainForm.Show();
        }

        public static void Run(ApplicationContext context)
        {
            if (context?.MainForm != null) Run(context.MainForm);
            else Ui.Running = true;
        }

        public static void Exit()
        {
            if (exiting) return;
            exiting = true;
            try
            {
                foreach (var f in forms.ToArray()) f.CloseCore(CloseReason.ApplicationExitCall, false);
            }
            finally
            {
                exiting = false;
            }
            Terminate("Program kapatıldı.");
        }

        public static void ExitThread() => Exit();

        internal static void RegisterForm(Form f) => forms.Add(f);
        internal static void UnregisterForm(Form f) => forms.Remove(f);

        internal static void FormClosed(Form f)
        {
            if (exiting) return;
            if (f == mainForm)
            {
                Exit();
                return;
            }
            if (mainForm == null && OpenForms.Count == 0 && Ui.Running) Terminate("Program kapatıldı.");
        }

        /// <summary>Programı sonlandırır: zamanlayıcılar durur, pencereler kapanır.</summary>
        internal static void Terminate(string reason)
        {
            ApplicationExit?.Invoke(null, EventArgs.Empty);
            foreach (var o in Ui.AllObjects)
            {
                if (o is Timer t) t.Enabled = false;
            }
            foreach (var f in forms.ToArray())
            {
                try { if (!f.IsDisposed) f.Dispose(); } catch { }
            }
            forms.Clear();
            mainForm = null;
            Ui.Running = false;
            Ui.Flush();
            Ui.Backend.ProgramEnded(reason);
        }

        internal static void ResetState()
        {
            forms.Clear();
            mainForm = null;
            exiting = false;
            Form.ActiveForm = null;
            Control.FocusedControl = null;
        }
    }

    public enum UnhandledExceptionMode { Automatic = 0, ThrowException = 1, CatchException = 2 }

    /// <summary>.NET 6+ şablonlarındaki ApplicationConfiguration.Initialize() çağrısı için.</summary>
    public static class ApplicationConfiguration
    {
        public static void Initialize()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
        }
    }

    public static class MessageBox
    {
        public static DialogResult Show(string text) => Show(text, "", MessageBoxButtons.OK, MessageBoxIcon.None);
        public static DialogResult Show(string text, string caption) => Show(text, caption, MessageBoxButtons.OK, MessageBoxIcon.None);
        public static DialogResult Show(string text, string caption, MessageBoxButtons buttons) => Show(text, caption, buttons, MessageBoxIcon.None);
        public static DialogResult Show(string text, string caption, MessageBoxButtons buttons, MessageBoxIcon icon, MessageBoxDefaultButton defaultButton) => Show(text, caption, buttons, icon);
        public static DialogResult Show(string text, string caption, MessageBoxButtons buttons, MessageBoxIcon icon, MessageBoxDefaultButton defaultButton, MessageBoxOptions options) => Show(text, caption, buttons, icon);
        public static DialogResult Show(IWin32Window owner, string text) => Show(text);
        public static DialogResult Show(IWin32Window owner, string text, string caption) => Show(text, caption);
        public static DialogResult Show(IWin32Window owner, string text, string caption, MessageBoxButtons buttons) => Show(text, caption, buttons);
        public static DialogResult Show(IWin32Window owner, string text, string caption, MessageBoxButtons buttons, MessageBoxIcon icon) => Show(text, caption, buttons, icon);
        public static DialogResult Show(IWin32Window owner, string text, string caption, MessageBoxButtons buttons, MessageBoxIcon icon, MessageBoxDefaultButton defaultButton) => Show(text, caption, buttons, icon);

        // Derleyici, beklenebilen yerlerdeki MessageBox.Show çağrılarını "await MessageBox.ShowAsync" yapar;
        // böylece tarayıcının alert() penceresi yerine Windows benzeri bir iletişim kutusu gösterilir.
        public static Task<DialogResult> ShowAsync(string text) => ShowAsync(text, "", MessageBoxButtons.OK, MessageBoxIcon.None);
        public static Task<DialogResult> ShowAsync(string text, string caption) => ShowAsync(text, caption, MessageBoxButtons.OK, MessageBoxIcon.None);
        public static Task<DialogResult> ShowAsync(string text, string caption, MessageBoxButtons buttons) => ShowAsync(text, caption, buttons, MessageBoxIcon.None);
        public static Task<DialogResult> ShowAsync(string text, string caption, MessageBoxButtons buttons, MessageBoxIcon icon, MessageBoxDefaultButton defaultButton) => ShowAsync(text, caption, buttons, icon, (int)defaultButton / 256);
        public static Task<DialogResult> ShowAsync(string text, string caption, MessageBoxButtons buttons, MessageBoxIcon icon, MessageBoxDefaultButton defaultButton, MessageBoxOptions options) => ShowAsync(text, caption, buttons, icon, (int)defaultButton / 256);
        public static Task<DialogResult> ShowAsync(IWin32Window owner, string text) => ShowAsync(text);
        public static Task<DialogResult> ShowAsync(IWin32Window owner, string text, string caption) => ShowAsync(text, caption);
        public static Task<DialogResult> ShowAsync(IWin32Window owner, string text, string caption, MessageBoxButtons buttons) => ShowAsync(text, caption, buttons);
        public static Task<DialogResult> ShowAsync(IWin32Window owner, string text, string caption, MessageBoxButtons buttons, MessageBoxIcon icon) => ShowAsync(text, caption, buttons, icon);
        public static Task<DialogResult> ShowAsync(IWin32Window owner, string text, string caption, MessageBoxButtons buttons, MessageBoxIcon icon, MessageBoxDefaultButton defaultButton) => ShowAsync(text, caption, buttons, icon, (int)defaultButton / 256);

        public static async Task<DialogResult> ShowAsync(string text, string caption, MessageBoxButtons buttons, MessageBoxIcon icon, int defaultButton = 0)
        {
            string json = "{\"text\":" + Ui.J(text ?? "") + ",\"caption\":" + Ui.J(caption ?? "") + ",\"buttons\":" + Ui.J(buttons.ToString()) +
                          ",\"icon\":" + Ui.J(icon.ToString()) + ",\"default\":" + defaultButton + "}";
            string r = await Ui.OpenDialog("messagebox", json);
            return Enum.TryParse<DialogResult>(r, out var dr) ? dr : DialogResult.Cancel;
        }

        public static DialogResult Show(string text, string caption, MessageBoxButtons buttons, MessageBoxIcon icon)
        {
            Ui.Flush();
            string r = Ui.Backend.MessageBox(text ?? "", caption ?? "", buttons.ToString(), icon.ToString());
            Guard.RestartClock();
            return Enum.TryParse<DialogResult>(r, out var dr) ? dr : DialogResult.OK;
        }
    }
}

namespace Microsoft.VisualBasic
{
    using MiniWinForms;

    /// <summary>VB'den gelen ve derslerde sık kullanılan Interaction.InputBox.</summary>
    public static class Interaction
    {
        public static string InputBox(string Prompt, string Title = "", string DefaultResponse = "", int XPos = -1, int YPos = -1)
        {
            Ui.Flush();
            string r = Ui.Backend.InputBox(Prompt ?? "", Title ?? "", DefaultResponse ?? "");
            Guard.RestartClock();
            return r ?? "";
        }

        public static async System.Threading.Tasks.Task<string> InputBoxAsync(string Prompt, string Title = "", string DefaultResponse = "", int XPos = -1, int YPos = -1)
        {
            string json = "{\"prompt\":" + Ui.J(Prompt ?? "") + ",\"title\":" + Ui.J(Title ?? "") + ",\"value\":" + Ui.J(DefaultResponse ?? "") + "}";
            string r = await Ui.OpenDialog("inputbox", json);
            return r ?? "";
        }

        public static void Beep() { }
    }
}
