using System.Collections;
using System.Collections.Generic;
using System.ComponentModel;
using System.Drawing;
using System.Globalization;
using MiniWinForms;

namespace System.Windows.Forms
{
    public class Control : Component, IUiTarget
    {
        internal readonly int Id;
        int x, y, width, height;
        string text = "";
        string name = "";
        Color backColor = Color.Empty;
        Color foreColor = Color.Empty;
        Font font;
        bool visible = true;
        bool enabled = true;
        DockStyle dock;
        AnchorStyles anchor = AnchorStyles.Top | AnchorStyles.Left;
        Cursor cursor;
        Control parent;
        ControlCollection controls;
        int layoutSuspend;
        bool autoSize;
        bool disposedFlag;
        Padding padding;
        Padding margin = new Padding(3);
        int tabIndex;
        bool tabStop = true;
        readonly Dictionary<string, int> listening = new Dictionary<string, int>();

        static readonly object EvClick = new object(), EvDoubleClick = new object(), EvMouseClick = new object(), EvMouseDoubleClick = new object(),
            EvMouseDown = new object(), EvMouseUp = new object(), EvMouseMove = new object(), EvMouseEnter = new object(), EvMouseLeave = new object(),
            EvMouseHover = new object(), EvMouseWheel = new object(), EvKeyDown = new object(), EvKeyUp = new object(), EvKeyPress = new object(),
            EvTextChanged = new object(), EvEnter = new object(), EvLeave = new object(), EvGotFocus = new object(), EvLostFocus = new object(),
            EvMove = new object(), EvLocationChanged = new object(), EvResize = new object(), EvSizeChanged = new object(), EvClientSizeChanged = new object(),
            EvVisibleChanged = new object(), EvEnabledChanged = new object(), EvBackColorChanged = new object(), EvForeColorChanged = new object(),
            EvFontChanged = new object(), EvControlAdded = new object(), EvControlRemoved = new object(), EvValidating = new object(),
            EvValidated = new object(), EvLayout = new object(), EvParentChanged = new object(), EvDockChanged = new object(), EvPaint = new object();

        public Control()
        {
            // Sonlandırıcıda (finalizer) kullanıcı kodu çalışmasın.
            GC.SuppressFinalize(this);
            Id = Ui.Register(this);
            Ui.Create(Id, UiType);
            var s = DefaultSize;
            width = s.Width;
            height = s.Height;
            SendBounds();
        }

        public Control(string text) : this() { Text = text; }
        public Control(Control parent, string text) : this() { Text = text; parent?.Controls.Add(this); }

        /// <summary>Tarayıcıdaki çizim türü.</summary>
        internal virtual string UiType => "Control";

        protected virtual Size DefaultSize => Size.Empty;
        public static Font DefaultFont { get; } = new Font("Segoe UI", 9F);
        public static Color DefaultBackColor => SystemColors.Control;
        public static Color DefaultForeColor => SystemColors.ControlText;
        internal virtual Color DefaultBack => Parent?.BackColor ?? DefaultBackColor;
        internal virtual Color DefaultFore => Parent?.ForeColor ?? DefaultForeColor;

        // ---------------- Kimlik ----------------

        public string Name
        {
            get => name;
            set { name = value ?? ""; Ui.Set(Id, "name", name); }
        }

        public object Tag { get; set; }
        public string AccessibleName { get; set; }
        public string AccessibleDescription { get; set; }
        public ImeMode ImeMode { get; set; }
        public RightToLeft RightToLeft { get; set; }
        public bool CausesValidation { get; set; } = true;
        public bool UseWaitCursor { get; set; }
        public bool AllowDrop { get; set; }
        ContextMenuStrip contextMenu;
        public virtual ContextMenuStrip ContextMenuStrip
        {
            get => contextMenu;
            set { contextMenu = value; Ui.Set(Id, "ctxmenu", value?.Id ?? 0); }
        }

        public virtual string Text
        {
            get => text;
            set
            {
                value ??= "";
                if (text == value) return;
                text = value;
                SendText();
                OnTextChanged(EventArgs.Empty);
            }
        }

        internal void SetTextSilently(string value) => text = value ?? "";

        internal virtual void SendText()
        {
            Ui.Set(Id, "text", text);
            if (autoSize) AdjustAutoSize();
        }

        // ---------------- Konum ve boyut ----------------

        public int Left { get => x; set => SetBounds(value, y, width, height); }
        public int Top { get => y; set => SetBounds(x, value, width, height); }
        public int Width { get => width; set => SetBounds(x, y, value, height); }
        public int Height { get => height; set => SetBounds(x, y, width, value); }
        public int Right => x + width;
        public int Bottom => y + height;
        public Point Location { get => new Point(x, y); set => SetBounds(value.X, value.Y, width, height); }
        public Size Size { get => new Size(width, height); set => SetBounds(x, y, value.Width, value.Height); }
        public Rectangle Bounds { get => new Rectangle(x, y, width, height); set => SetBounds(value.X, value.Y, value.Width, value.Height); }
        public virtual Size ClientSize { get => ClientSizeFromSize(width, height); set { var s = SizeFromClientSize(value.Width, value.Height); SetBounds(x, y, s.Width, s.Height); } }
        public Rectangle ClientRectangle { get { var c = ClientSize; return new Rectangle(0, 0, c.Width, c.Height); } }
        public virtual Rectangle DisplayRectangle
        {
            get
            {
                var c = ClientSize;
                return new Rectangle(padding.Left, padding.Top, Math.Max(0, c.Width - padding.Horizontal), Math.Max(0, c.Height - padding.Vertical));
            }
        }
        public Padding Padding { get => padding; set { padding = value; PerformLayout(); } }
        public Padding Margin { get => margin; set => margin = value; }
        public Size MinimumSize { get; set; }
        public Size MaximumSize { get; set; }

        internal virtual Size ClientSizeFromSize(int w, int h) => new Size(w, h);
        internal virtual Size SizeFromClientSize(int w, int h) => new Size(w, h);

        public void SetBounds(int x, int y, int width, int height)
        {
            if (width < 0) width = 0;
            if (height < 0) height = 0;
            if (MinimumSize.Width > 0 && width < MinimumSize.Width) width = MinimumSize.Width;
            if (MinimumSize.Height > 0 && height < MinimumSize.Height) height = MinimumSize.Height;
            if (MaximumSize.Width > 0 && width > MaximumSize.Width) width = MaximumSize.Width;
            if (MaximumSize.Height > 0 && height > MaximumSize.Height) height = MaximumSize.Height;
            SetBoundsCore(x, y, width, height);
        }

        internal void SetBoundsCore(int nx, int ny, int nw, int nh)
        {
            bool moved = nx != x || ny != y;
            int dw = nw - width, dh = nh - height;
            bool resized = dw != 0 || dh != 0;
            if (!moved && !resized) return;
            x = nx; y = ny; width = nw; height = nh;
            SendBounds();
            if (moved)
            {
                OnLocationChanged(EventArgs.Empty);
                OnMove(EventArgs.Empty);
            }
            if (resized)
            {
                // Tasarımcı kodu (InitializeComponent) düzen askıdayken çalışır; o sırada anchor uygulanmaz.
                if (controls != null && layoutSuspend == 0)
                {
                    foreach (Control c in controls) c.ApplyAnchor(dw, dh);
                }
                OnSizeChanged(EventArgs.Empty);
                OnClientSizeChanged(EventArgs.Empty);
                OnResize(EventArgs.Empty);
                PerformLayout();
            }
            if (resized && dock != DockStyle.None) parent?.PerformLayout();
        }

        internal virtual void SendBounds()
        {
            Ui.Set(Id, "bounds", x + "," + y + "," + width + "," + height);
        }

        void ApplyAnchor(int dw, int dh)
        {
            if (dock != DockStyle.None) return;
            int nx = x, ny = y, nw = width, nh = height;
            if ((anchor & AnchorStyles.Right) != 0)
            {
                if ((anchor & AnchorStyles.Left) != 0) nw += dw; else nx += dw;
            }
            else if ((anchor & AnchorStyles.Left) == 0) nx += dw / 2;
            if ((anchor & AnchorStyles.Bottom) != 0)
            {
                if ((anchor & AnchorStyles.Top) != 0) nh += dh; else ny += dh;
            }
            else if ((anchor & AnchorStyles.Top) == 0) ny += dh / 2;
            SetBoundsCore(nx, ny, Math.Max(0, nw), Math.Max(0, nh));
        }

        public virtual DockStyle Dock
        {
            get => dock;
            set
            {
                if (dock == value) return;
                dock = value;
                parent?.PerformLayout();
                Ev.Fire(Events[EvDockChanged], this, EventArgs.Empty);
            }
        }

        public virtual AnchorStyles Anchor { get => anchor; set { anchor = value; if (value != (AnchorStyles.Top | AnchorStyles.Left)) dock = DockStyle.None; } }

        public virtual bool AutoSize
        {
            get => autoSize;
            set
            {
                autoSize = value;
                Ui.Set(Id, "autosize", value);
                if (value) AdjustAutoSize();
            }
        }

        public AutoSizeMode AutoSizeMode { get; set; }

        internal virtual void AdjustAutoSize() { }

        internal Size MeasureText(string s)
        {
            var r = Ui.Backend.Measure(string.IsNullOrEmpty(s) ? " " : s, Font.Css);
            var parts = (r ?? "0,0").Split(',');
            double w = double.Parse(parts[0], CultureInfo.InvariantCulture);
            double h = double.Parse(parts.Length > 1 ? parts[1] : "0", CultureInfo.InvariantCulture);
            return new Size((int)Math.Ceiling(w), (int)Math.Ceiling(h));
        }

        public void SuspendLayout() => layoutSuspend++;
        public void ResumeLayout() => ResumeLayout(true);
        public void ResumeLayout(bool performLayout)
        {
            if (layoutSuspend > 0) layoutSuspend--;
            if (layoutSuspend == 0 && performLayout) PerformLayout();
        }

        public void PerformLayout()
        {
            if (layoutSuspend > 0 || controls == null || controls.Count == 0) return;
            var r = DisplayRectangle;
            for (int i = controls.Count - 1; i >= 0; i--)
            {
                var c = controls[i];
                if (!c.visible || c.dock == DockStyle.None) continue;
                switch (c.dock)
                {
                    case DockStyle.Top:
                        c.SetBoundsCore(r.X, r.Y, r.Width, c.height);
                        r.Y += c.height; r.Height -= c.height;
                        break;
                    case DockStyle.Bottom:
                        c.SetBoundsCore(r.X, r.Bottom - c.height, r.Width, c.height);
                        r.Height -= c.height;
                        break;
                    case DockStyle.Left:
                        c.SetBoundsCore(r.X, r.Y, c.width, r.Height);
                        r.X += c.width; r.Width -= c.width;
                        break;
                    case DockStyle.Right:
                        c.SetBoundsCore(r.Right - c.width, r.Y, c.width, r.Height);
                        r.Width -= c.width;
                        break;
                    case DockStyle.Fill:
                        c.SetBoundsCore(r.X, r.Y, Math.Max(0, r.Width), Math.Max(0, r.Height));
                        break;
                }
            }
            Ev.Fire(Events[EvLayout], this, new LayoutEventArgs(this, ""));
        }

        public void PerformLayout(Control affectedControl, string affectedProperty) => PerformLayout();

        public Point PointToScreen(Point p)
        {
            for (Control c = this; c != null; c = c.parent) { p.X += c.x; p.Y += c.y; }
            return p;
        }

        public Point PointToClient(Point p)
        {
            for (Control c = this; c != null; c = c.parent) { p.X -= c.x; p.Y -= c.y; }
            return p;
        }

        public Rectangle RectangleToScreen(Rectangle r) => new Rectangle(PointToScreen(r.Location), r.Size);
        public Rectangle RectangleToClient(Rectangle r) => new Rectangle(PointToClient(r.Location), r.Size);

        // ---------------- Görünüm ----------------

        public virtual Color BackColor
        {
            get => backColor.IsEmpty ? DefaultBack : backColor;
            set
            {
                if (backColor == value) return;
                backColor = value;
                Ui.Set(Id, "back", Ui.Color(value));
                OnBackColorChanged(EventArgs.Empty);
            }
        }

        public virtual Color ForeColor
        {
            get => foreColor.IsEmpty ? DefaultFore : foreColor;
            set
            {
                if (foreColor == value) return;
                foreColor = value;
                Ui.Set(Id, "fore", Ui.Color(value));
                OnForeColorChanged(EventArgs.Empty);
            }
        }

        public virtual Font Font
        {
            get => font ?? parent?.Font ?? DefaultFont;
            set
            {
                font = value;
                Ui.Set(Id, "font", value == null ? "" : value.Css);
                if (autoSize) AdjustAutoSize();
                OnFontChanged(EventArgs.Empty);
            }
        }

        public int FontHeight => Font.Height;

        public virtual Image BackgroundImage
        {
            get => bgImage;
            set { bgImage = value; Ui.Set(Id, "bgimage", value?.Url ?? ""); }
        }
        Image bgImage;

        public virtual ImageLayout BackgroundImageLayout
        {
            get => bgLayout;
            set { bgLayout = value; Ui.Set(Id, "bglayout", value.ToString()); }
        }
        ImageLayout bgLayout = ImageLayout.Tile;

        public virtual Cursor Cursor
        {
            get => cursor ?? parent?.Cursor ?? Cursors.Default;
            set { cursor = value; Ui.Set(Id, "cursor", value?.Css ?? ""); }
        }

        public bool Visible
        {
            get => visible;
            set => SetVisibleCore(value);
        }

        protected virtual void SetVisibleCore(bool value)
        {
            if (visible == value) return;
            visible = value;
            Ui.Set(Id, "visible", value);
            if (dock != DockStyle.None) parent?.PerformLayout();
            OnVisibleChanged(EventArgs.Empty);
        }

        internal bool VisibleFlag => visible;

        /// <summary>Form ilk kez gösterildiğinde (WinForms'ta tutamaç oluştuğunda) tüm alt kontroller için çağrılır.</summary>
        internal virtual void OnFormShownInternal()
        {
            if (controls != null) foreach (Control c in new List<Control>(controls.Cast())) c.OnFormShownInternal();
        }

        internal void SetVisibleCoreInternal(bool value)
        {
            visible = value;
            Ui.Set(Id, "visible", value);
        }

        public bool Enabled
        {
            get => enabled && (parent == null || parent.Enabled);
            set
            {
                if (enabled == value) return;
                enabled = value;
                Ui.Set(Id, "enabled", value);
                OnEnabledChanged(EventArgs.Empty);
            }
        }

        public int TabIndex { get => tabIndex; set { tabIndex = value; Ui.Set(Id, "tabindex", value); } }
        public bool TabStop { get => tabStop; set { tabStop = value; Ui.Set(Id, "tabstop", value); } }

        public void Show() => Visible = true;
        public void Hide() => Visible = false;

        public void BringToFront() => parent?.Controls.SetChildIndex(this, 0);
        public void SendToBack() { if (parent != null) parent.Controls.SetChildIndex(this, parent.Controls.Count - 1); }

        public void Refresh() { }
        public void Invalidate() { }
        public void Invalidate(bool invalidateChildren) { }
        public void Invalidate(Rectangle rc) { }
        public void Update() { }
        public void CreateControl() { }
        public bool IsHandleCreated => true;
        public IntPtr Handle => new IntPtr(Id);
        public bool InvokeRequired => false;
        public bool Created => true;

        public object Invoke(Delegate method) => method.DynamicInvoke();
        public object Invoke(Delegate method, params object[] args) => method.DynamicInvoke(args);
        public void Invoke(Action method) => method();
        public T Invoke<T>(Func<T> method) => method();
        public IAsyncResult BeginInvoke(Delegate method) { method.DynamicInvoke(); return null; }
        public IAsyncResult BeginInvoke(Delegate method, params object[] args) { method.DynamicInvoke(args); return null; }
        public IAsyncResult BeginInvoke(Action method) { method(); return null; }

        // ---------------- Veri bağlama ----------------

        ControlBindingsCollection dataBindings;
        public ControlBindingsCollection DataBindings => dataBindings ??= new ControlBindingsCollection(this);
        public virtual BindingContext BindingContext { get; set; } = new BindingContext();

        /// <summary>Bağlı özelliğin değişikliklerini veri kaynağına aktaracak olayları dinler.</summary>
        internal void HookBindingUpdates(Binding b)
        {
            var ev = GetType().GetEvent(b.PropertyName + "Changed");
            if (ev != null && ev.EventHandlerType == typeof(EventHandler))
                ev.AddEventHandler(this, new EventHandler((s, e) => b.ControlChanged(false)));
            Leave += (s, e) => b.ControlChanged(true);
            ((CurrencyManager)b.BindingManagerBase)?.Bindings.Add(b);
        }

        /// <summary>Bu kontrol ve alt kontrollerindeki bağlı değerleri veri kaynağına yazar (Validate).</summary>
        internal void PushBindings()
        {
            if (dataBindings != null) foreach (var b in dataBindings.All) b.WriteValue();
            if (controls != null) foreach (Control c in controls) c.PushBindings();
        }

        // ---------------- Odak ----------------

        internal static Control FocusedControl;

        public bool Focused => FocusedControl == this;
        public bool ContainsFocus { get { for (var c = FocusedControl; c != null; c = c.parent) if (c == this) return true; return false; } }
        public virtual bool CanFocus => visible && Enabled;
        public bool CanSelect => CanFocus;

        public bool Focus()
        {
            if (!CanFocus) return false;
            Ui.Call(Id, "focus");
            SetFocused();
            return true;
        }

        public void Select() => Focus();

        internal void SetFocused()
        {
            if (FocusedControl == this) return;
            var old = FocusedControl;
            FocusedControl = this;
            if (old != null && !old.IsDisposed)
            {
                old.OnLeave(EventArgs.Empty);
                old.OnLostFocus(EventArgs.Empty);
            }
            var form = FindForm();
            if (form != null && this != form) form.SetActiveControlSilently(this);
            OnEnter(EventArgs.Empty);
            OnGotFocus(EventArgs.Empty);
        }

        // ---------------- Hiyerarşi ----------------

        public Control Parent
        {
            get => parent;
            set
            {
                if (parent == value) return;
                parent?.Controls.Remove(this);
                value?.Controls.Add(this);
            }
        }

        internal void SetParentInternal(Control p)
        {
            parent = p;
            Ui.Parent(Id, p?.Id ?? 0);
            if (autoSize) AdjustAutoSize();
            Ev.Fire(Events[EvParentChanged], this, EventArgs.Empty);
        }

        public Control TopLevelControl { get { Control c = this; while (c.parent != null) c = c.parent; return c; } }

        public ControlCollection Controls => controls ??= CreateControlsInstance();
        protected virtual ControlCollection CreateControlsInstance() => new ControlCollection(this);
        public bool HasChildren => controls != null && controls.Count > 0;

        public Form FindForm()
        {
            for (Control c = this; c != null; c = c.parent) if (c is Form f) return f;
            return null;
        }

        public bool Contains(Control ctl)
        {
            for (var c = ctl?.parent; c != null; c = c.parent) if (c == this) return true;
            return false;
        }

        public Control GetChildAtPoint(Point pt)
        {
            if (controls == null) return null;
            foreach (Control c in controls) if (c.visible && c.Bounds.Contains(pt)) return c;
            return null;
        }

        public Control GetNextControl(Control ctl, bool forward)
        {
            if (controls == null || controls.Count == 0) return null;
            var list = new List<Control>();
            foreach (Control c in controls) list.Add(c);
            list.Sort((a, b) => a.TabIndex.CompareTo(b.TabIndex));
            int i = ctl == null ? -1 : list.IndexOf(ctl);
            i += forward ? 1 : -1;
            return i >= 0 && i < list.Count ? list[i] : null;
        }

        public bool IsDisposed => disposedFlag;
        public bool Disposing { get; private set; }

        protected override void Dispose(bool disposing)
        {
            if (disposedFlag) return;
            Disposing = true;
            if (disposing)
            {
                if (controls != null)
                {
                    foreach (var c in new List<Control>(controls.Cast())) c.Dispose();
                }
                parent?.Controls.Remove(this);
            }
            disposedFlag = true;
            if (FocusedControl == this) FocusedControl = null;
            Ui.Destroy(Id);
            Ui.Unregister(Id);
            base.Dispose(disposing);
            Disposing = false;
        }

        // ---------------- Olay altyapısı ----------------

        void AddH(object key, Delegate d, string dom)
        {
            Events.AddHandler(key, d);
            if (dom == null) return;
            listening.TryGetValue(dom, out int n);
            listening[dom] = n + 1;
            if (n == 0) SendListening();
        }

        void RemoveH(object key, Delegate d, string dom)
        {
            Events.RemoveHandler(key, d);
            if (dom == null || !listening.TryGetValue(dom, out int n)) return;
            if (n <= 1) listening.Remove(dom); else listening[dom] = n - 1;
            if (n <= 1) SendListening();
        }

        void SendListening() => Ui.Set(Id, "listen", string.Join(",", listening.Keys));

        internal void Listen(string dom)
        {
            listening.TryGetValue(dom, out int n);
            listening[dom] = n + 1;
            if (n == 0) SendListening();
        }

        void Raise(object key, EventArgs e) => Ev.Fire(Events[key], this, e);

        public event EventHandler Click { add => AddH(EvClick, value, "click"); remove => RemoveH(EvClick, value, "click"); }
        public event EventHandler DoubleClick { add => AddH(EvDoubleClick, value, "dblclick"); remove => RemoveH(EvDoubleClick, value, "dblclick"); }
        public event MouseEventHandler MouseClick { add => AddH(EvMouseClick, value, "click"); remove => RemoveH(EvMouseClick, value, "click"); }
        public event MouseEventHandler MouseDoubleClick { add => AddH(EvMouseDoubleClick, value, "dblclick"); remove => RemoveH(EvMouseDoubleClick, value, "dblclick"); }
        public event MouseEventHandler MouseDown { add => AddH(EvMouseDown, value, "mousedown"); remove => RemoveH(EvMouseDown, value, "mousedown"); }
        public event MouseEventHandler MouseUp { add => AddH(EvMouseUp, value, "mouseup"); remove => RemoveH(EvMouseUp, value, "mouseup"); }
        public event MouseEventHandler MouseMove { add => AddH(EvMouseMove, value, "mousemove"); remove => RemoveH(EvMouseMove, value, "mousemove"); }
        public event MouseEventHandler MouseWheel { add => AddH(EvMouseWheel, value, "wheel"); remove => RemoveH(EvMouseWheel, value, "wheel"); }
        public event EventHandler MouseEnter { add => AddH(EvMouseEnter, value, "mouseenter"); remove => RemoveH(EvMouseEnter, value, "mouseenter"); }
        public event EventHandler MouseLeave { add => AddH(EvMouseLeave, value, "mouseleave"); remove => RemoveH(EvMouseLeave, value, "mouseleave"); }
        public event EventHandler MouseHover { add => AddH(EvMouseHover, value, "mouseenter"); remove => RemoveH(EvMouseHover, value, "mouseenter"); }
        public event KeyEventHandler KeyDown { add => AddH(EvKeyDown, value, "keydown"); remove => RemoveH(EvKeyDown, value, "keydown"); }
        public event KeyEventHandler KeyUp { add => AddH(EvKeyUp, value, "keyup"); remove => RemoveH(EvKeyUp, value, "keyup"); }
        public event KeyPressEventHandler KeyPress { add => AddH(EvKeyPress, value, "keypress"); remove => RemoveH(EvKeyPress, value, "keypress"); }
        public event EventHandler TextChanged { add => AddH(EvTextChanged, value, null); remove => RemoveH(EvTextChanged, value, null); }
        public event EventHandler Enter { add => AddH(EvEnter, value, null); remove => RemoveH(EvEnter, value, null); }
        public event EventHandler Leave { add => AddH(EvLeave, value, null); remove => RemoveH(EvLeave, value, null); }
        public event EventHandler GotFocus { add => AddH(EvGotFocus, value, null); remove => RemoveH(EvGotFocus, value, null); }
        public event EventHandler LostFocus { add => AddH(EvLostFocus, value, null); remove => RemoveH(EvLostFocus, value, null); }
        public event CancelEventHandler Validating { add => AddH(EvValidating, value, null); remove => RemoveH(EvValidating, value, null); }
        public event EventHandler Validated { add => AddH(EvValidated, value, null); remove => RemoveH(EvValidated, value, null); }
        public event EventHandler Move { add => AddH(EvMove, value, null); remove => RemoveH(EvMove, value, null); }
        public event EventHandler LocationChanged { add => AddH(EvLocationChanged, value, null); remove => RemoveH(EvLocationChanged, value, null); }
        public event EventHandler Resize { add => AddH(EvResize, value, null); remove => RemoveH(EvResize, value, null); }
        public event EventHandler SizeChanged { add => AddH(EvSizeChanged, value, null); remove => RemoveH(EvSizeChanged, value, null); }
        public event EventHandler ClientSizeChanged { add => AddH(EvClientSizeChanged, value, null); remove => RemoveH(EvClientSizeChanged, value, null); }
        public event EventHandler VisibleChanged { add => AddH(EvVisibleChanged, value, null); remove => RemoveH(EvVisibleChanged, value, null); }
        public event EventHandler EnabledChanged { add => AddH(EvEnabledChanged, value, null); remove => RemoveH(EvEnabledChanged, value, null); }
        public event EventHandler BackColorChanged { add => AddH(EvBackColorChanged, value, null); remove => RemoveH(EvBackColorChanged, value, null); }
        public event EventHandler ForeColorChanged { add => AddH(EvForeColorChanged, value, null); remove => RemoveH(EvForeColorChanged, value, null); }
        public event EventHandler FontChanged { add => AddH(EvFontChanged, value, null); remove => RemoveH(EvFontChanged, value, null); }
        public event EventHandler ParentChanged { add => AddH(EvParentChanged, value, null); remove => RemoveH(EvParentChanged, value, null); }
        public event EventHandler DockChanged { add => AddH(EvDockChanged, value, null); remove => RemoveH(EvDockChanged, value, null); }
        public event ControlEventHandler ControlAdded { add => AddH(EvControlAdded, value, null); remove => RemoveH(EvControlAdded, value, null); }
        public event ControlEventHandler ControlRemoved { add => AddH(EvControlRemoved, value, null); remove => RemoveH(EvControlRemoved, value, null); }
        public event LayoutEventHandler Layout { add => AddH(EvLayout, value, null); remove => RemoveH(EvLayout, value, null); }
        public event PaintEventHandler Paint { add => AddH(EvPaint, value, null); remove => RemoveH(EvPaint, value, null); }

        protected virtual void OnClick(EventArgs e) => Raise(EvClick, e);
        protected virtual void OnDoubleClick(EventArgs e) => Raise(EvDoubleClick, e);
        protected virtual void OnMouseClick(MouseEventArgs e) => Raise(EvMouseClick, e);
        protected virtual void OnMouseDoubleClick(MouseEventArgs e) => Raise(EvMouseDoubleClick, e);
        protected virtual void OnMouseDown(MouseEventArgs e) => Raise(EvMouseDown, e);
        protected virtual void OnMouseUp(MouseEventArgs e) => Raise(EvMouseUp, e);
        protected virtual void OnMouseMove(MouseEventArgs e) => Raise(EvMouseMove, e);
        protected virtual void OnMouseWheel(MouseEventArgs e) => Raise(EvMouseWheel, e);
        protected virtual void OnMouseEnter(EventArgs e) => Raise(EvMouseEnter, e);
        protected virtual void OnMouseLeave(EventArgs e) => Raise(EvMouseLeave, e);
        protected virtual void OnMouseHover(EventArgs e) => Raise(EvMouseHover, e);
        protected virtual void OnKeyDown(KeyEventArgs e) => Raise(EvKeyDown, e);
        protected virtual void OnKeyUp(KeyEventArgs e) => Raise(EvKeyUp, e);
        protected virtual void OnKeyPress(KeyPressEventArgs e) => Raise(EvKeyPress, e);
        protected virtual void OnTextChanged(EventArgs e) => Raise(EvTextChanged, e);
        protected virtual void OnEnter(EventArgs e) => Raise(EvEnter, e);
        protected virtual void OnLeave(EventArgs e) => Raise(EvLeave, e);
        protected virtual void OnGotFocus(EventArgs e) => Raise(EvGotFocus, e);
        protected virtual void OnLostFocus(EventArgs e) => Raise(EvLostFocus, e);
        protected virtual void OnValidating(CancelEventArgs e) => Raise(EvValidating, e);
        protected virtual void OnValidated(EventArgs e) => Raise(EvValidated, e);
        protected virtual void OnMove(EventArgs e) => Raise(EvMove, e);
        protected virtual void OnLocationChanged(EventArgs e) => Raise(EvLocationChanged, e);
        protected virtual void OnResize(EventArgs e) => Raise(EvResize, e);
        protected virtual void OnSizeChanged(EventArgs e) => Raise(EvSizeChanged, e);
        protected virtual void OnClientSizeChanged(EventArgs e) => Raise(EvClientSizeChanged, e);
        protected virtual void OnVisibleChanged(EventArgs e) => Raise(EvVisibleChanged, e);
        protected virtual void OnEnabledChanged(EventArgs e) => Raise(EvEnabledChanged, e);
        protected virtual void OnBackColorChanged(EventArgs e) => Raise(EvBackColorChanged, e);
        protected virtual void OnForeColorChanged(EventArgs e) => Raise(EvForeColorChanged, e);
        protected virtual void OnFontChanged(EventArgs e) => Raise(EvFontChanged, e);
        protected virtual void OnControlAdded(ControlEventArgs e) => Raise(EvControlAdded, e);
        protected virtual void OnControlRemoved(ControlEventArgs e) => Raise(EvControlRemoved, e);
        protected virtual void OnPaint(PaintEventArgs e) => Raise(EvPaint, e);

        internal void RaiseControlAdded(Control c) => OnControlAdded(new ControlEventArgs(c));
        internal void RaiseControlRemoved(Control c) => OnControlRemoved(new ControlEventArgs(c));

        /// <summary>Tarayıcıdan gelen olayları işler. Dönüş değeri "handled" ise tarayıcı varsayılan davranışı engeller.</summary>
        internal virtual string HandleUiEvent(string evt, string data)
        {
            switch (evt)
            {
                case "click":
                {
                    var m = ParseMouse(data, 1);
                    OnClick(m);
                    OnMouseClick(m);
                    return "";
                }
                case "dblclick":
                {
                    var m = ParseMouse(data, 2);
                    OnDoubleClick(m);
                    OnMouseDoubleClick(m);
                    return "";
                }
                case "mousedown": OnMouseDown(ParseMouse(data, 1)); return "";
                case "mouseup": OnMouseUp(ParseMouse(data, 1)); return "";
                case "mousemove": OnMouseMove(ParseMouse(data, 0)); return "";
                case "wheel": OnMouseWheel(ParseMouse(data, 0)); return "";
                case "mouseenter": OnMouseEnter(EventArgs.Empty); OnMouseHover(EventArgs.Empty); return "";
                case "mouseleave": OnMouseLeave(EventArgs.Empty); return "";
                case "keydown": return HandleKeyDown(ParseKeys(data));
                case "keyup":
                {
                    var e = new KeyEventArgs(ParseKeys(data));
                    var form = FindForm();
                    if (form != null && form != this && form.KeyPreview) form.RaiseKeyUp(e);
                    if (!e.Handled) OnKeyUp(e);
                    return e.Handled ? "handled" : "";
                }
                case "keypress": return HandleKeyPress(data);
                case "focus": SetFocused(); return "";
                case "blur": return "";
            }
            return "";
        }

        string IUiTarget.HandleUiEvent(string evt, string data) => HandleUiEvent(evt, data);

        internal string HandleKeyDown(Keys keys)
        {
            var e = new KeyEventArgs(keys);
            var form = FindForm();
            if (form != null && form != this && form.KeyPreview) form.RaiseKeyDown(e);
            if (!e.Handled) OnKeyDown(e);
            if (e.SuppressKeyPress) return "suppress";
            return e.Handled ? "handled" : "";
        }

        internal string HandleKeyPress(string data)
        {
            char ch = string.IsNullOrEmpty(data) ? '\0' : data[0];
            var e = new KeyPressEventArgs(ch);
            var form = FindForm();
            if (form != null && form != this && form.KeyPreview) form.RaiseKeyPress(e);
            if (!e.Handled) OnKeyPress(e);
            if (e.Handled) return "handled";
            if (e.KeyChar != ch) return "replace:" + e.KeyChar;
            return "";
        }

        internal void RaiseKeyDown(KeyEventArgs e) => OnKeyDown(e);
        internal void RaiseKeyUp(KeyEventArgs e) => OnKeyUp(e);
        internal void RaiseKeyPress(KeyPressEventArgs e) => OnKeyPress(e);

        internal static MouseEventArgs ParseMouse(string data, int clicks)
        {
            // "x,y,tuş,delta"
            var p = (data ?? "").Split(',');
            int px = p.Length > 0 && int.TryParse(p[0], out var a) ? a : 0;
            int py = p.Length > 1 && int.TryParse(p[1], out var b) ? b : 0;
            int btn = p.Length > 2 && int.TryParse(p[2], out var c) ? c : 0;
            int delta = p.Length > 3 && int.TryParse(p[3], out var d) ? d : 0;
            var mb = btn == 2 ? MouseButtons.Right : btn == 1 ? MouseButtons.Middle : MouseButtons.Left;
            MouseButtonsState = mb;
            MousePositionState = new Point(px, py);
            return new MouseEventArgs(mb, clicks, px, py, delta);
        }

        internal static Keys ParseKeys(string data)
        {
            // "tuşKodu,shift,ctrl,alt"
            var p = (data ?? "").Split(',');
            int code = p.Length > 0 && int.TryParse(p[0], out var a) ? a : 0;
            Keys k = (Keys)code;
            if (p.Length > 1 && p[1] == "1") k |= Keys.Shift;
            if (p.Length > 2 && p[2] == "1") k |= Keys.Control;
            if (p.Length > 3 && p[3] == "1") k |= Keys.Alt;
            ModifierKeysState = k & Keys.Modifiers;
            return k;
        }

        internal static MouseButtons MouseButtonsState;
        internal static Point MousePositionState;
        internal static Keys ModifierKeysState;
        public static MouseButtons MouseButtons => MouseButtonsState;
        public static Point MousePosition => MousePositionState;
        public static Keys ModifierKeys => ModifierKeysState;

        public Graphics CreateGraphics() => throw new NotSupportedException("Çizim (Graphics) bu web sürümünde henüz desteklenmiyor.");

        public override string ToString() => GetType().FullName + (string.IsNullOrEmpty(text) ? "" : ", Text: " + text);

        // ---------------- Kontrol koleksiyonu ----------------

        public class ControlCollection : IList, ICollection, IEnumerable
        {
            readonly List<Control> list = new List<Control>();

            public ControlCollection(Control owner) { Owner = owner; }

            public Control Owner { get; }
            public int Count => list.Count;
            public bool IsReadOnly => false;
            bool IList.IsFixedSize => false;
            bool ICollection.IsSynchronized => false;
            object ICollection.SyncRoot => this;

            public virtual Control this[int index] => list[index];

            public virtual Control this[string key]
            {
                get
                {
                    foreach (var c in list) if (string.Equals(c.Name, key, StringComparison.OrdinalIgnoreCase)) return c;
                    return null;
                }
            }

            object IList.this[int index] { get => list[index]; set => throw new NotSupportedException(); }

            internal IEnumerable<Control> Cast() => list;

            public virtual void Add(Control value)
            {
                if (value == null) return;
                if (value == Owner || value.Contains(Owner)) throw new ArgumentException("Bir kontrol kendi içine eklenemez.");
                if (value is Form f && f.TopLevel)
                    throw new ArgumentException("Form başka bir kontrolün içine eklenemez. (TopLevel = false yapın)");
                if (value.parent == Owner) return;
                value.parent?.Controls.Remove(value);
                list.Add(value);
                value.SetParentInternal(Owner);
                SendZ();
                Owner.PerformLayout();
                Owner.RaiseControlAdded(value);
                if (Owner.FindForm() is Form form && form.ShownOnce) value.OnFormShownInternal();
            }

            public virtual void AddRange(Control[] controls)
            {
                if (controls == null) return;
                Owner.SuspendLayout();
                foreach (var c in controls) Add(c);
                Owner.ResumeLayout(true);
            }

            public virtual void Remove(Control value)
            {
                if (value == null || !list.Remove(value)) return;
                value.SetParentInternal(null);
                SendZ();
                Owner.PerformLayout();
                Owner.RaiseControlRemoved(value);
            }

            public void RemoveAt(int index) => Remove(list[index]);
            public void RemoveByKey(string key) => Remove(this[key]);

            public virtual void Clear()
            {
                foreach (var c in list.ToArray()) Remove(c);
            }

            public bool Contains(Control control) => list.Contains(control);
            public bool ContainsKey(string key) => this[key] != null;
            public int IndexOf(Control control) => list.IndexOf(control);
            public int IndexOfKey(string key) { for (int i = 0; i < list.Count; i++) if (string.Equals(list[i].Name, key, StringComparison.OrdinalIgnoreCase)) return i; return -1; }
            public int GetChildIndex(Control child) => list.IndexOf(child);

            public void SetChildIndex(Control child, int newIndex)
            {
                if (!list.Remove(child)) return;
                newIndex = Math.Max(0, Math.Min(newIndex, list.Count));
                list.Insert(newIndex, child);
                SendZ();
                Owner.PerformLayout();
            }

            public Control[] Find(string key, bool searchAllChildren)
            {
                var found = new List<Control>();
                FindInternal(key, searchAllChildren, this, found);
                return found.ToArray();
            }

            static void FindInternal(string key, bool deep, ControlCollection col, List<Control> found)
            {
                foreach (var c in col.list)
                {
                    if (string.Equals(c.Name, key, StringComparison.OrdinalIgnoreCase)) found.Add(c);
                    if (deep && c.controls != null) FindInternal(key, true, c.controls, found);
                }
            }

            void SendZ()
            {
                // WinForms'ta 0. sıradaki kontrol en üsttedir.
                for (int i = 0; i < list.Count; i++) Ui.Set(list[i].Id, "z", list.Count - i);
            }

            public IEnumerator GetEnumerator() => list.ToArray().GetEnumerator();
            public void CopyTo(Array array, int index) => ((ICollection)list).CopyTo(array, index);
            int IList.Add(object value) { Add((Control)value); return list.Count - 1; }
            bool IList.Contains(object value) => value is Control c && Contains(c);
            int IList.IndexOf(object value) => value is Control c ? IndexOf(c) : -1;
            void IList.Insert(int index, object value) => throw new NotSupportedException();
            void IList.Remove(object value) => Remove(value as Control);
        }
    }

    public delegate void LayoutEventHandler(object sender, LayoutEventArgs e);
    public delegate void PaintEventHandler(object sender, PaintEventArgs e);

    public class LayoutEventArgs : EventArgs
    {
        public LayoutEventArgs(Control affectedControl, string affectedProperty) { AffectedControl = affectedControl; AffectedProperty = affectedProperty; }
        public Control AffectedControl { get; }
        public string AffectedProperty { get; }
    }

    public class PaintEventArgs : EventArgs
    {
        public PaintEventArgs(Graphics graphics, Rectangle clipRect) { Graphics = graphics; ClipRectangle = clipRect; }
        public Graphics Graphics { get; }
        public Rectangle ClipRectangle { get; }
    }

    public enum AutoSizeMode { GrowAndShrink = 0, GrowOnly = 1 }

}
