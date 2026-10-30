using System.Collections;
using System.Collections.Generic;
using System.ComponentModel;
using System.Drawing;
using System.Text;
using MiniWinForms;

namespace System.Windows.Forms
{
    public enum TabAlignment { Top = 0, Bottom = 1, Left = 2, Right = 3 }
    public enum TabAppearance { Normal = 0, Buttons = 1, FlatButtons = 2 }
    public enum TabSizeMode { Normal = 0, FillToRight = 1, Fixed = 2 }
    public enum TabDrawMode { Normal = 0, OwnerDrawFixed = 1 }
    public enum TabControlAction { Selecting = 0, Selected = 1, Deselecting = 2, Deselected = 3 }

    public delegate void TabControlCancelEventHandler(object sender, TabControlCancelEventArgs e);
    public delegate void TabControlEventHandler(object sender, TabControlEventArgs e);

    public class TabControlCancelEventArgs : CancelEventArgs
    {
        public TabControlCancelEventArgs(TabPage tabPage, int tabPageIndex, bool cancel, TabControlAction action) : base(cancel)
        { TabPage = tabPage; TabPageIndex = tabPageIndex; Action = action; }
        public TabPage TabPage { get; }
        public int TabPageIndex { get; }
        public TabControlAction Action { get; }
    }

    public class TabControlEventArgs : EventArgs
    {
        public TabControlEventArgs(TabPage tabPage, int tabPageIndex, TabControlAction action) { TabPage = tabPage; TabPageIndex = tabPageIndex; Action = action; }
        public TabPage TabPage { get; }
        public int TabPageIndex { get; }
        public TabControlAction Action { get; }
    }

    /// <summary>Sekme sayfası. TabControl'ün içine eklenir.</summary>
    public class TabPage : Panel
    {
        bool useVisualStyleBackColor;

        public TabPage() { }
        public TabPage(string text) : this() { Text = text; }

        internal override string UiType => "TabPage";
        internal override Color DefaultBack => useVisualStyleBackColor ? SystemColors.Window : SystemColors.Control;

        public override string Text
        {
            get => base.Text;
            set { base.Text = value; (Parent as TabControl)?.SendTabs(); }
        }

        public bool UseVisualStyleBackColor
        {
            get => useVisualStyleBackColor;
            set { useVisualStyleBackColor = value; Ui.Set(Id, "visualback", value); }
        }

        public int ImageIndex { get; set; } = -1;
        public string ImageKey { get; set; } = "";
        public string ToolTipText { get; set; } = "";

        internal override void SendText() { }

        public static TabPage GetTabPageOfComponent(object comp)
        {
            for (var c = comp as Control; c != null; c = c.Parent) if (c is TabPage p) return p;
            return null;
        }
    }

    /// <summary>Sekmeli kapsayıcı.</summary>
    public class TabControl : Control
    {
        static readonly object EvSelectedIndexChanged = new object(), EvSelecting = new object(), EvSelected = new object(),
            EvDeselecting = new object(), EvDeselected = new object();
        int selectedIndex = -1;
        TabAlignment alignment;
        TabAppearance appearance;
        Size itemSize = new Size(0, 21);
        Point padding = new Point(6, 3);

        public TabControl()
        {
            TabPages = new TabPageCollection(this);
        }

        internal override string UiType => "TabControl";
        protected override Size DefaultSize => new Size(200, 100);

        public TabPageCollection TabPages { get; }
        public int TabCount => Controls.Count;
        public TabAlignment Alignment { get => alignment; set { alignment = value; LayoutPages(); } }
        public TabAppearance Appearance { get => appearance; set { appearance = value; Ui.Set(Id, "appearance", value.ToString()); } }
        public TabSizeMode SizeMode { get; set; }
        public TabDrawMode DrawMode { get; set; }
        public bool Multiline { get; set; }
        public bool HotTrack { get; set; }
        public bool ShowToolTips { get; set; }
        public int RowCount => 1;
        public ImageList ImageList { get; set; }
        public Size ItemSize { get => itemSize; set { itemSize = value; LayoutPages(); } }
        public new Point Padding { get => padding; set => padding = value; }

        int HeaderHeight => Math.Max(itemSize.Height, (Font?.Height ?? 15) + 6) + 3;

        public override Rectangle DisplayRectangle => new Rectangle(4, HeaderHeight, Math.Max(0, Width - 8), Math.Max(0, Height - HeaderHeight - 4));

        protected override ControlCollection CreateControlsInstance() => new TabControlCollection(this);

        public class TabControlCollection : ControlCollection
        {
            public TabControlCollection(TabControl owner) : base(owner) { }
            TabControl Tabs => (TabControl)Owner;

            public override void Add(Control value)
            {
                if (value is not TabPage page)
                    throw new ArgumentException("TabControl'e yalnızca TabPage eklenebilir. Kontrolü bir sekmeye ekleyin: tabPage1.Controls.Add(...)");
                base.Add(page);
                Tabs.OnPageAdded(page);
            }

            public override void Remove(Control value)
            {
                int index = IndexOf(value);
                base.Remove(value);
                if (index >= 0) Tabs.OnPageRemoved(index);
            }
        }

        internal IEnumerable<TabPage> Pages
        {
            get { foreach (Control c in Controls) yield return (TabPage)c; }
        }

        TabPage PageAt(int i) => i >= 0 && i < Controls.Count ? (TabPage)Controls[i] : null;

        void OnPageAdded(TabPage page)
        {
            Layout(page);
            if (selectedIndex < 0) SelectCore(0, false);
            else page.SetVisibleCoreInternal(Controls.IndexOf(page) == selectedIndex);
            SendTabs();
        }

        void OnPageRemoved(int index)
        {
            if (Controls.Count == 0) { selectedIndex = -1; SendTabs(); OnSelectedIndexChanged(EventArgs.Empty); return; }
            if (index < selectedIndex) selectedIndex--;
            else if (index == selectedIndex) { selectedIndex = -1; SelectCore(Math.Min(index, Controls.Count - 1), true); }
            SendTabs();
        }

        void Layout(TabPage p)
        {
            var r = DisplayRectangle;
            p.SetBoundsCore(r.X, r.Y, r.Width, r.Height);
        }

        void LayoutPages()
        {
            foreach (var p in Pages) Layout(p);
            SendTabs();
        }

        protected override void OnSizeChanged(EventArgs e)
        {
            LayoutPages();
            base.OnSizeChanged(e);
        }

        protected override void OnFontChanged(EventArgs e)
        {
            LayoutPages();
            base.OnFontChanged(e);
        }

        internal void SendTabs()
        {
            var sb = new StringBuilder("{\"t\":[");
            int i = 0;
            foreach (var p in Pages)
            {
                if (i++ > 0) sb.Append(',');
                sb.Append(Ui.J(p.Text));
            }
            sb.Append("],\"s\":").Append(selectedIndex).Append(",\"h\":").Append(HeaderHeight).Append('}');
            Ui.Set(Id, "tabs", sb.ToString());
        }

        public int SelectedIndex
        {
            get => selectedIndex;
            set
            {
                if (value < -1 || value >= Controls.Count) throw new ArgumentOutOfRangeException(nameof(value), "SelectedIndex için geçersiz değer: " + value + ". Sekme sayısı: " + Controls.Count);
                SelectCore(value, true);
            }
        }

        public TabPage SelectedTab
        {
            get => PageAt(selectedIndex);
            set { int i = value == null ? -1 : Controls.IndexOf(value); if (i >= 0) SelectCore(i, true); }
        }

        public void SelectTab(int index) => SelectedIndex = index;
        public void SelectTab(string tabPageName) { int i = Controls.IndexOfKey(tabPageName); if (i < 0) throw new ArgumentException("'" + tabPageName + "' adlı sekme yok."); SelectedIndex = i; }
        public void SelectTab(TabPage tabPage) => SelectedTab = tabPage;
        public void DeselectTab(int index) { if (index == selectedIndex && Controls.Count > 1) SelectedIndex = (index + 1) % Controls.Count; }
        public void DeselectTab(TabPage tabPage) => DeselectTab(Controls.IndexOf(tabPage));
        public void DeselectTab(string tabPageName) => DeselectTab(Controls.IndexOfKey(tabPageName));
        public Rectangle GetTabRect(int index) => new Rectangle(2 + index * 70, 2, 70, HeaderHeight - 3);
        public Control GetControl(int index) => PageAt(index);

        /// <summary>Sekmeyi değiştirir; Deselecting/Selecting olayları iptal edebilir.</summary>
        bool SelectCore(int index, bool raise)
        {
            if (index == selectedIndex) return true;
            var oldPage = PageAt(selectedIndex);
            var newPage = PageAt(index);
            if (raise && Ui.Running)
            {
                if (oldPage != null)
                {
                    var de = new TabControlCancelEventArgs(oldPage, selectedIndex, false, TabControlAction.Deselecting);
                    Fire(EvDeselecting, de);
                    if (de.Cancel) { SendTabs(); return false; }
                }
                if (newPage != null)
                {
                    var se = new TabControlCancelEventArgs(newPage, index, false, TabControlAction.Selecting);
                    Fire(EvSelecting, se);
                    if (se.Cancel) { SendTabs(); return false; }
                }
            }
            int old = selectedIndex;
            selectedIndex = index;
            int i = 0;
            foreach (var p in Pages) p.SetVisibleCoreInternal(i++ == index);
            SendTabs();
            if (raise)
            {
                if (oldPage != null && Ui.Running) Fire(EvDeselected, new TabControlEventArgs(oldPage, old, TabControlAction.Deselected));
                if (newPage != null && Ui.Running) Fire(EvSelected, new TabControlEventArgs(newPage, index, TabControlAction.Selected));
                OnSelectedIndexChanged(EventArgs.Empty);
            }
            return true;
        }

        void Fire(object key, EventArgs e)
        {
            switch (Events[key])
            {
                case TabControlCancelEventHandler h: h(this, (TabControlCancelEventArgs)e); break;
                case TabControlEventHandler h: h(this, (TabControlEventArgs)e); break;
            }
        }

        public event EventHandler SelectedIndexChanged { add => Events.AddHandler(EvSelectedIndexChanged, value); remove => Events.RemoveHandler(EvSelectedIndexChanged, value); }
        public event TabControlCancelEventHandler Selecting { add => Events.AddHandler(EvSelecting, value); remove => Events.RemoveHandler(EvSelecting, value); }
        public event TabControlEventHandler Selected { add => Events.AddHandler(EvSelected, value); remove => Events.RemoveHandler(EvSelected, value); }
        public event TabControlCancelEventHandler Deselecting { add => Events.AddHandler(EvDeselecting, value); remove => Events.RemoveHandler(EvDeselecting, value); }
        public event TabControlEventHandler Deselected { add => Events.AddHandler(EvDeselected, value); remove => Events.RemoveHandler(EvDeselected, value); }

        protected virtual void OnSelectedIndexChanged(EventArgs e) => Ev.Fire(Events[EvSelectedIndexChanged], this, e);

        internal override string HandleUiEvent(string evt, string data)
        {
            if (evt == "select" && int.TryParse(data, out int i))
            {
                if (i >= 0 && i < Controls.Count) SelectCore(i, true);
                return "";
            }
            return base.HandleUiEvent(evt, data);
        }

        public class TabPageCollection : IList
        {
            readonly TabControl owner;
            internal TabPageCollection(TabControl owner) { this.owner = owner; }
            public int Count => owner.Controls.Count;
            public bool IsReadOnly => false;
            bool IList.IsFixedSize => false;
            bool ICollection.IsSynchronized => false;
            object ICollection.SyncRoot => this;
            public TabPage this[int index]
            {
                get
                {
                    if (index < 0 || index >= Count) throw new ArgumentOutOfRangeException(nameof(index), "Geçersiz sekme numarası: " + index + ". Sekme sayısı: " + Count);
                    return (TabPage)owner.Controls[index];
                }
            }
            public TabPage this[string key] => owner.Controls[key] as TabPage;
            object IList.this[int index] { get => this[index]; set => throw new NotSupportedException(); }
            public void Add(TabPage value) => owner.Controls.Add(value);
            public void Add(string text) => Add(new TabPage(text));
            public void Add(string key, string text) => Add(new TabPage(text) { Name = key });
            public void AddRange(TabPage[] pages) { foreach (var p in pages) Add(p); }
            public void Insert(int index, TabPage tabPage) { Add(tabPage); owner.Controls.SetChildIndex(tabPage, index); owner.SendTabs(); }
            public void Insert(int index, string text) => Insert(index, new TabPage(text));
            public void Remove(TabPage value) => owner.Controls.Remove(value);
            public void RemoveAt(int index) => owner.Controls.RemoveAt(index);
            public void RemoveByKey(string key) => owner.Controls.RemoveByKey(key);
            public void Clear() => owner.Controls.Clear();
            public bool Contains(TabPage page) => owner.Controls.Contains(page);
            public bool ContainsKey(string key) => owner.Controls.ContainsKey(key);
            public int IndexOf(TabPage page) => owner.Controls.IndexOf(page);
            public int IndexOfKey(string key) => owner.Controls.IndexOfKey(key);
            public IEnumerator GetEnumerator() => new List<TabPage>(owner.Pages).GetEnumerator();
            void ICollection.CopyTo(Array array, int index) { int i = index; foreach (var p in owner.Pages) array.SetValue(p, i++); }
            int IList.Add(object value) { Add((TabPage)value); return Count - 1; }
            bool IList.Contains(object value) => value is TabPage p && Contains(p);
            int IList.IndexOf(object value) => value is TabPage p ? IndexOf(p) : -1;
            void IList.Insert(int index, object value) => Insert(index, (TabPage)value);
            void IList.Remove(object value) { if (value is TabPage p) Remove(p); }
        }
    }

    /// <summary>Resim listesi (yalnızca derleme uyumluluğu için; resimler ImageList üzerinden kullanılmaz).</summary>
    public sealed class ImageList : Component
    {
        public ImageList() { GC.SuppressFinalize(this); }
        public ImageList(IContainer container) : this() { container?.Add(this); }
        public ImageCollection Images { get; } = new ImageCollection();
        public Size ImageSize { get; set; } = new Size(16, 16);
        public ColorDepth ColorDepth { get; set; } = ColorDepth.Depth32Bit;
        public Color TransparentColor { get; set; }
        public object Tag { get; set; }

        public sealed class ImageCollection : List<Image>
        {
            readonly Dictionary<string, Image> keyed = new Dictionary<string, Image>();
            public void Add(string key, Image image) { keyed[key] = image; Add(image); }
            public Image this[string key] => keyed.TryGetValue(key, out var i) ? i : null;
            public bool ContainsKey(string key) => keyed.ContainsKey(key);
            public void SetKeyName(int index, string name) { if (index >= 0 && index < Count) keyed[name] = this[index]; }
        }
    }

    public enum ColorDepth { Depth4Bit = 4, Depth8Bit = 8, Depth16Bit = 16, Depth24Bit = 24, Depth32Bit = 32 }

    public enum ErrorBlinkStyle { BlinkIfDifferentError = 0, AlwaysBlink = 1, NeverBlink = 2 }
    public enum ErrorIconAlignment { TopLeft = 0, TopRight = 1, MiddleLeft = 2, MiddleRight = 3, BottomLeft = 4, BottomRight = 5 }

    /// <summary>Hatalı girişlerin yanında kırmızı ünlem simgesi gösterir.</summary>
    public class ErrorProvider : Component
    {
        readonly Dictionary<Control, string> errors = new Dictionary<Control, string>();
        readonly Dictionary<Control, ErrorIconAlignment> align = new Dictionary<Control, ErrorIconAlignment>();
        readonly Dictionary<Control, int> padding = new Dictionary<Control, int>();

        public ErrorProvider() { GC.SuppressFinalize(this); }
        public ErrorProvider(IContainer container) : this() { container?.Add(this); }
        public ErrorProvider(ContainerControl parentControl) : this() { ContainerControl = parentControl; }

        public ContainerControl ContainerControl { get; set; }
        public ErrorBlinkStyle BlinkStyle { get; set; } = ErrorBlinkStyle.BlinkIfDifferentError;
        public int BlinkRate { get; set; } = 250;
        public Icon Icon { get; set; }
        public bool HasErrors { get { foreach (var v in errors.Values) if (!string.IsNullOrEmpty(v)) return true; return false; } }
        public object DataSource { get; set; }
        public string DataMember { get; set; } = "";
        public bool RightToLeft { get; set; }
        public object Tag { get; set; }

        public void SetError(Control control, string value)
        {
            if (control == null) throw new ArgumentNullException(nameof(control));
            value ??= "";
            string old = errors.TryGetValue(control, out var o) ? o : "";
            errors[control] = value;
            bool blink = BlinkStyle == ErrorBlinkStyle.AlwaysBlink || (BlinkStyle == ErrorBlinkStyle.BlinkIfDifferentError && value.Length > 0 && value != old);
            Send(control, blink);
        }

        void Send(Control control, bool blink)
        {
            string v = errors.TryGetValue(control, out var e) ? e : "";
            var a = align.TryGetValue(control, out var al) ? al : ErrorIconAlignment.MiddleRight;
            int p = padding.TryGetValue(control, out var pd) ? pd : 0;
            Ui.Set(control.Id, "error", v.Length == 0 ? "" : a + "|" + p + "|" + (blink ? 1 : 0) + "|" + v);
        }

        public string GetError(Control control) => control != null && errors.TryGetValue(control, out var v) ? v : "";
        public void SetIconAlignment(Control control, ErrorIconAlignment value) { align[control] = value; if (errors.ContainsKey(control)) Send(control, false); }
        public ErrorIconAlignment GetIconAlignment(Control control) => align.TryGetValue(control, out var a) ? a : ErrorIconAlignment.MiddleRight;
        public void SetIconPadding(Control control, int value) { padding[control] = value; if (errors.ContainsKey(control)) Send(control, false); }
        public int GetIconPadding(Control control) => padding.TryGetValue(control, out var p) ? p : 0;

        public void Clear()
        {
            foreach (var c in new List<Control>(errors.Keys)) { errors[c] = ""; Send(c, false); }
        }

        public void BindToDataAndErrors(object newDataSource, string newDataMember) { DataSource = newDataSource; DataMember = newDataMember; }
        public void UpdateBinding() { }
        public bool CanExtend(object extendee) => extendee is Control && extendee is not Form;
    }
}

namespace System.Drawing
{
    /// <summary>Simge (yalnızca derleme uyumluluğu için).</summary>
    public sealed class Icon : IDisposable, ICloneable
    {
        public Icon(string fileName) { }
        public Icon(Icon original, Size size) { }
        public int Width => 16;
        public int Height => 16;
        public Size Size => new Size(16, 16);
        public object Clone() => this;
        public void Dispose() { }
        public Bitmap ToBitmap() => new Bitmap(16, 16);
    }
}
