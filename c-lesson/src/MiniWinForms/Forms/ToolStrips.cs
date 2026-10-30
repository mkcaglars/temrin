using System.Collections;
using System.Collections.Generic;
using System.ComponentModel;
using System.Drawing;
using System.Globalization;
using MiniWinForms;

namespace System.Windows.Forms
{
    public enum ToolStripItemDisplayStyle { None = 0, Text = 1, Image = 2, ImageAndText = 3 }
    public enum ToolStripItemAlignment { Left = 0, Right = 1 }
    public enum ToolStripGripStyle { Hidden = 0, Visible = 1 }
    public enum ToolStripLayoutStyle { StackWithOverflow = 0, HorizontalStackWithOverflow = 1, VerticalStackWithOverflow = 2, Flow = 3, Table = 4 }
    public enum ToolStripRenderMode { Custom = 0, System = 1, Professional = 2, ManagerRenderMode = 3 }
    public enum ToolStripStatusLabelBorderSides { None = 0, Left = 1, Top = 2, Right = 4, Bottom = 8, All = 15 }
    public enum ToolStripTextDirection { Inherit = 0, Horizontal = 1, Vertical90 = 2, Vertical270 = 3 }
    public enum ToolStripItemImageScaling { None = 0, SizeToFit = 1 }

    public delegate void ToolStripItemClickedEventHandler(object sender, ToolStripItemClickedEventArgs e);

    public class ToolStripItemClickedEventArgs : EventArgs
    {
        public ToolStripItemClickedEventArgs(ToolStripItem clickedItem) { ClickedItem = clickedItem; }
        public ToolStripItem ClickedItem { get; }
    }

    // ============================================================ öğeler

    public abstract class ToolStripItem : Component, IUiTarget
    {
        internal readonly int Id;
        string text = "", name = "", toolTip;
        bool enabled = true, visible = true;
        Image image;
        ToolStripItemDisplayStyle displayStyle = ToolStripItemDisplayStyle.ImageAndText;
        ToolStripItemAlignment alignment;
        Color foreColor = Color.Empty, backColor = Color.Empty;
        Font font;
        ContentAlignment textAlign = ContentAlignment.MiddleCenter;

        static readonly object EvClick = new object(), EvDoubleClick = new object(), EvTextChanged = new object(),
            EvMouseEnter = new object(), EvMouseLeave = new object(), EvVisibleChanged = new object(), EvEnabledChanged = new object();

        protected ToolStripItem()
        {
            GC.SuppressFinalize(this);
            Id = Ui.Register(this);
            Ui.Create(Id, UiType);
        }

        protected ToolStripItem(string text, Image image, EventHandler onClick) : this()
        {
            Text = text;
            Image = image;
            if (onClick != null) Click += onClick;
        }

        protected ToolStripItem(string text, Image image, EventHandler onClick, string name) : this(text, image, onClick) { Name = name; }

        internal abstract string UiType { get; }

        public string Name { get => name; set { name = value ?? ""; Ui.Set(Id, "name", name); } }
        public object Tag { get; set; }
        public string AccessibleName { get; set; }

        public virtual string Text
        {
            get => text;
            set
            {
                value ??= "";
                if (text == value) return;
                text = value;
                Ui.Set(Id, "text", text);
                Ev.Fire(Events[EvTextChanged], this, EventArgs.Empty);
            }
        }

        public virtual bool Enabled
        {
            get => enabled && (Owner == null || Owner.Enabled);
            set { if (enabled == value) return; enabled = value; Ui.Set(Id, "enabled", value); Ev.Fire(Events[EvEnabledChanged], this, EventArgs.Empty); }
        }

        public bool Visible
        {
            get => visible;
            set { if (visible == value) return; visible = value; Ui.Set(Id, "visible", value); Ev.Fire(Events[EvVisibleChanged], this, EventArgs.Empty); }
        }

        public bool Available { get => Visible; set => Visible = value; }
        public bool Selected => false;
        public bool Pressed => false;

        public string ToolTipText { get => toolTip ?? (AutoToolTip ? text : null); set { toolTip = value; Ui.Set(Id, "tooltip", value ?? ""); } }
        public bool AutoToolTip { get; set; }

        public virtual Image Image { get => image; set { image = value; Ui.Set(Id, "image", value?.Url ?? ""); } }
        public ContentAlignment ImageAlign { get; set; } = ContentAlignment.MiddleCenter;
        public ToolStripItemImageScaling ImageScaling { get; set; } = ToolStripItemImageScaling.SizeToFit;
        public Color ImageTransparentColor { get; set; }
        public TextImageRelation TextImageRelation { get; set; } = TextImageRelation.ImageBeforeText;
        public ContentAlignment TextAlign { get => textAlign; set => textAlign = value; }

        public virtual ToolStripItemDisplayStyle DisplayStyle
        {
            get => displayStyle;
            set { displayStyle = value; Ui.Set(Id, "displaystyle", value.ToString()); }
        }

        public ToolStripItemAlignment Alignment { get => alignment; set { alignment = value; Ui.Set(Id, "alignment", value.ToString()); } }

        public virtual Color ForeColor
        {
            get => foreColor.IsEmpty ? (Owner?.ForeColor ?? SystemColors.ControlText) : foreColor;
            set { foreColor = value; Ui.Set(Id, "fore", Ui.Color(value)); }
        }

        public virtual Color BackColor
        {
            get => backColor.IsEmpty ? (Owner?.BackColor ?? SystemColors.Control) : backColor;
            set { backColor = value; Ui.Set(Id, "back", Ui.Color(value)); }
        }

        public virtual Font Font
        {
            get => font ?? Owner?.Font ?? Control.DefaultFont;
            set { font = value; Ui.Set(Id, "font", value?.Css ?? ""); }
        }

        Size size = new Size(23, 22);
        bool autoSize = true;
        public Size Size { get => size; set { size = value; SendWidth(); } }
        public int Width { get => Size.Width; set => Size = new Size(value, Size.Height); }
        public int Height { get => Size.Height; set => Size = new Size(Size.Width, value); }
        public bool AutoSize { get => autoSize; set { autoSize = value; SendWidth(); } }
        void SendWidth() => Ui.Set(Id, "width", autoSize ? 0 : size.Width);
        public Padding Padding { get; set; }
        public Padding Margin { get; set; }
        public RightToLeft RightToLeft { get; set; }
        public ToolStripItemOverflow Overflow { get; set; }
        public MergeAction MergeAction { get; set; }
        public int MergeIndex { get; set; } = -1;

        /// <summary>Öğenin bulunduğu araç çubuğu (açılır menüdeyse en üstteki çubuk).</summary>
        public ToolStrip Owner { get; internal set; }
        public ToolStripItem OwnerItem { get; internal set; }
        public ToolStrip GetCurrentParent() => Owner;

        internal void SetOwner(ToolStrip owner, ToolStripItem ownerItem, int parentUiId)
        {
            Owner = owner;
            OwnerItem = ownerItem;
            Ui.Parent(Id, parentUiId);
            OnOwnerChanged(owner);
        }

        internal virtual void OnOwnerChanged(ToolStrip owner) { }

        public event EventHandler Click { add => Events.AddHandler(EvClick, value); remove => Events.RemoveHandler(EvClick, value); }
        public event EventHandler DoubleClick { add => Events.AddHandler(EvDoubleClick, value); remove => Events.RemoveHandler(EvDoubleClick, value); }
        public event EventHandler TextChanged { add => Events.AddHandler(EvTextChanged, value); remove => Events.RemoveHandler(EvTextChanged, value); }
        public event EventHandler MouseEnter { add => Events.AddHandler(EvMouseEnter, value); remove => Events.RemoveHandler(EvMouseEnter, value); }
        public event EventHandler MouseLeave { add => Events.AddHandler(EvMouseLeave, value); remove => Events.RemoveHandler(EvMouseLeave, value); }
        public event EventHandler VisibleChanged { add => Events.AddHandler(EvVisibleChanged, value); remove => Events.RemoveHandler(EvVisibleChanged, value); }
        public event EventHandler EnabledChanged { add => Events.AddHandler(EvEnabledChanged, value); remove => Events.RemoveHandler(EvEnabledChanged, value); }

        protected virtual void OnClick(EventArgs e) => Ev.Fire(Events[EvClick], this, e);
        protected virtual void OnDoubleClick(EventArgs e) => Ev.Fire(Events[EvDoubleClick], this, e);

        public void PerformClick()
        {
            if (!Enabled || !Visible) return;
            HandleClick();
        }

        internal virtual void HandleClick()
        {
            OnClick(EventArgs.Empty);
            Owner?.RaiseItemClicked(this);
        }

        internal virtual string HandleUiEvent(string evt, string data)
        {
            switch (evt)
            {
                case "click":
                    if (Enabled) HandleClick();
                    return "";
                case "dblclick":
                    if (Enabled) OnDoubleClick(EventArgs.Empty);
                    return "";
            }
            return "";
        }

        string IUiTarget.HandleUiEvent(string evt, string data) => HandleUiEvent(evt, data);

        public override string ToString() => string.IsNullOrEmpty(text) ? GetType().Name : text;

        protected override void Dispose(bool disposing)
        {
            Ui.Destroy(Id);
            Ui.Unregister(Id);
            base.Dispose(disposing);
        }
    }

    public enum ToolStripItemOverflow { Never = 0, Always = 1, AsNeeded = 2 }
    public enum MergeAction { Append = 0, Insert = 1, Replace = 2, Remove = 3, MatchOnly = 4 }

    public class ToolStripButton : ToolStripItem
    {
        static readonly object EvCheckedChanged = new object();
        CheckState checkState;

        public ToolStripButton() { }
        public ToolStripButton(string text) { Text = text; }
        public ToolStripButton(Image image) { Image = image; }
        public ToolStripButton(string text, Image image) { Text = text; Image = image; }
        public ToolStripButton(string text, Image image, EventHandler onClick) : base(text, image, onClick) { }
        public ToolStripButton(string text, Image image, EventHandler onClick, string name) : base(text, image, onClick, name) { }

        internal override string UiType => "TSButton";

        public bool CheckOnClick { get; set; }
        public bool Checked { get => checkState != CheckState.Unchecked; set => CheckState = value ? CheckState.Checked : CheckState.Unchecked; }
        public CheckState CheckState
        {
            get => checkState;
            set
            {
                if (checkState == value) return;
                checkState = value;
                Ui.Set(Id, "checked", value != CheckState.Unchecked);
                Ev.Fire(Events[EvCheckedChanged], this, EventArgs.Empty);
            }
        }

        public event EventHandler CheckedChanged { add => Events.AddHandler(EvCheckedChanged, value); remove => Events.RemoveHandler(EvCheckedChanged, value); }

        internal override void HandleClick()
        {
            if (CheckOnClick) Checked = !Checked;
            base.HandleClick();
        }
    }

    public class ToolStripLabel : ToolStripItem
    {
        public ToolStripLabel() { }
        public ToolStripLabel(string text) { Text = text; }
        public ToolStripLabel(string text, Image image) { Text = text; Image = image; }
        public ToolStripLabel(string text, Image image, bool isLink) { Text = text; Image = image; IsLink = isLink; }
        internal override string UiType => "TSLabel";
        bool isLink;
        public bool IsLink { get => isLink; set { isLink = value; Ui.Set(Id, "islink", value); } }
        public Color LinkColor { get; set; }
        public bool LinkVisited { get; set; }
        public LinkBehavior LinkBehavior { get; set; }
    }

    public class ToolStripStatusLabel : ToolStripLabel
    {
        bool spring;
        public ToolStripStatusLabel() { }
        public ToolStripStatusLabel(string text) { Text = text; }
        internal override string UiType => "TSStatusLabel";
        public bool Spring { get => spring; set { spring = value; Ui.Set(Id, "spring", value); } }
        public ToolStripStatusLabelBorderSides BorderSides { get; set; }
        public Border3DStyle BorderStyle { get; set; }
    }

    public enum Border3DStyle { Adjust = 8192, Bump = 9, Etched = 6, Flat = 16394, Raised = 5, RaisedInner = 4, RaisedOuter = 1, Sunken = 10, SunkenInner = 8, SunkenOuter = 2 }

    public class ToolStripSeparator : ToolStripItem
    {
        internal override string UiType => "TSSeparator";
    }

    public class ToolStripTextBox : ToolStripItem
    {
        static readonly object EvKeyPress = new object(), EvKeyDown = new object();
        public ToolStripTextBox() { }
        public ToolStripTextBox(string name) { Name = name; }
        internal override string UiType => "TSTextBox";
        public int MaxLength { get; set; } = 32767;
        public bool ReadOnly { get; set; }
        public void Clear() => Text = "";
        public void SelectAll() => Ui.Call(Id, "selectall");
        public void Focus() => Ui.Call(Id, "focus");

        public event KeyPressEventHandler KeyPress { add => Events.AddHandler(EvKeyPress, value); remove => Events.RemoveHandler(EvKeyPress, value); }
        public event KeyEventHandler KeyDown { add => Events.AddHandler(EvKeyDown, value); remove => Events.RemoveHandler(EvKeyDown, value); }

        internal override string HandleUiEvent(string evt, string data)
        {
            if (evt == "input")
            {
                if (data != Text) base.Text = data;
                return "";
            }
            if (evt == "keypress")
            {
                var e = new KeyPressEventArgs(string.IsNullOrEmpty(data) ? '\0' : data[0]);
                Ev.Fire(Events[EvKeyPress], this, e);
                return e.Handled ? "handled" : "";
            }
            if (evt == "keydown")
            {
                var e = new KeyEventArgs(Control.ParseKeys(data));
                Ev.Fire(Events[EvKeyDown], this, e);
                return e.Handled ? "handled" : "";
            }
            return base.HandleUiEvent(evt, data);
        }
    }

    public class ToolStripComboBox : ToolStripItem
    {
        static readonly object EvSelectedIndexChanged = new object();
        int selectedIndex = -1;

        public ToolStripComboBox()
        {
            Items = new ItemList(this);
        }

        internal override string UiType => "TSComboBox";

        public class ItemList : IEnumerable
        {
            readonly ToolStripComboBox owner;
            readonly List<object> list = new List<object>();
            internal ItemList(ToolStripComboBox owner) { this.owner = owner; }
            public int Count => list.Count;
            public object this[int i] => list[i];
            public int Add(object o) { list.Add(o); owner.SendItems(); return list.Count - 1; }
            public void AddRange(object[] items) { list.AddRange(items); owner.SendItems(); }
            public void Remove(object o) { list.Remove(o); owner.SendItems(); }
            public void RemoveAt(int i) { list.RemoveAt(i); owner.SendItems(); }
            public void Clear() { list.Clear(); owner.SelectedIndex = -1; owner.SendItems(); }
            public bool Contains(object o) => list.Contains(o);
            public int IndexOf(object o) => list.IndexOf(o);
            public IEnumerator GetEnumerator() => list.ToArray().GetEnumerator();
            internal IEnumerable<object> All => list;
        }

        public ItemList Items { get; }
        public ComboBoxStyle DropDownStyle { get; set; } = ComboBoxStyle.DropDown;

        void SendItems()
        {
            var texts = new List<string>();
            foreach (var o in Items.All) texts.Add(Convert.ToString(o, CultureInfo.CurrentCulture) ?? "");
            Ui.Set(Id, "items", Ui.JArray(texts));
        }

        public int SelectedIndex
        {
            get => selectedIndex;
            set
            {
                if (value < -1 || value >= Items.Count) throw new ArgumentOutOfRangeException(nameof(value));
                if (selectedIndex == value) return;
                selectedIndex = value;
                Ui.Set(Id, "sel", value);
                if (value >= 0) base.Text = Convert.ToString(Items[value], CultureInfo.CurrentCulture);
                Ev.Fire(Events[EvSelectedIndexChanged], this, EventArgs.Empty);
            }
        }

        public object SelectedItem { get => selectedIndex >= 0 ? Items[selectedIndex] : null; set => SelectedIndex = Items.IndexOf(value); }
        public event EventHandler SelectedIndexChanged { add => Events.AddHandler(EvSelectedIndexChanged, value); remove => Events.RemoveHandler(EvSelectedIndexChanged, value); }

        internal override string HandleUiEvent(string evt, string data)
        {
            if (evt == "select" && int.TryParse(data, out int i)) { SelectedIndex = i; return ""; }
            if (evt == "input") { base.Text = data; return ""; }
            return base.HandleUiEvent(evt, data);
        }
    }

    public class ToolStripProgressBar : ToolStripItem
    {
        int value, minimum, maximum = 100, step = 10;
        internal override string UiType => "TSProgressBar";
        public int Value { get => value; set { if (value < minimum || value > maximum) throw new ArgumentOutOfRangeException(nameof(value)); this.value = value; Send(); } }
        public int Minimum { get => minimum; set { minimum = value; Send(); } }
        public int Maximum { get => maximum; set { maximum = value; Send(); } }
        public int Step { get => step; set => step = value; }
        public ProgressBarStyle Style { get; set; }
        public void PerformStep() => Increment(step);
        public void Increment(int v) { value = Math.Max(minimum, Math.Min(maximum, value + v)); Send(); }
        void Send() => Ui.Set(Id, "progress", minimum + "," + maximum + "," + value + ",Blocks");
    }

    public abstract class ToolStripDropDownItem : ToolStripItem
    {
        static readonly object EvDropDownOpening = new object(), EvDropDownOpened = new object(), EvDropDownClosed = new object(),
            EvDropDownItemClicked = new object();

        protected ToolStripDropDownItem()
        {
            DropDownItems = new ToolStripItemCollection(null, this);
        }

        protected ToolStripDropDownItem(string text, Image image, EventHandler onClick) : this()
        {
            Text = text;
            Image = image;
            if (onClick != null) Click += onClick;
        }

        public ToolStripItemCollection DropDownItems { get; }
        public bool HasDropDownItems => DropDownItems.Count > 0;
        public ToolStripDropDown DropDown => null;

        public void ShowDropDown() => Ui.Call(Id, "open");
        public void HideDropDown() => Ui.Call(Id, "close");

        internal override void OnOwnerChanged(ToolStrip owner)
        {
            foreach (ToolStripItem i in DropDownItems) i.SetOwner(owner, this, Id);
        }

        public event EventHandler DropDownOpening { add => Events.AddHandler(EvDropDownOpening, value); remove => Events.RemoveHandler(EvDropDownOpening, value); }
        public event EventHandler DropDownOpened { add => Events.AddHandler(EvDropDownOpened, value); remove => Events.RemoveHandler(EvDropDownOpened, value); }
        public event EventHandler DropDownClosed { add => Events.AddHandler(EvDropDownClosed, value); remove => Events.RemoveHandler(EvDropDownClosed, value); }
        public event ToolStripItemClickedEventHandler DropDownItemClicked { add => Events.AddHandler(EvDropDownItemClicked, value); remove => Events.RemoveHandler(EvDropDownItemClicked, value); }

        internal void RaiseDropDownItemClicked(ToolStripItem item) => Ev.Fire(Events[EvDropDownItemClicked], this, new ToolStripItemClickedEventArgs(item));

        internal override string HandleUiEvent(string evt, string data)
        {
            if (evt == "opening") { Ev.Fire(Events[EvDropDownOpening], this, EventArgs.Empty); Ev.Fire(Events[EvDropDownOpened], this, EventArgs.Empty); return ""; }
            if (evt == "closed") { Ev.Fire(Events[EvDropDownClosed], this, EventArgs.Empty); return ""; }
            return base.HandleUiEvent(evt, data);
        }
    }

    /// <summary>Yalnızca derleme uyumluluğu için.</summary>
    public class ToolStripDropDown : Component { }

    public class ToolStripMenuItem : ToolStripDropDownItem
    {
        static readonly object EvCheckedChanged = new object();
        CheckState checkState;
        Keys shortcut;

        public ToolStripMenuItem() { }
        public ToolStripMenuItem(string text) { Text = text; }
        public ToolStripMenuItem(Image image) { Image = image; }
        public ToolStripMenuItem(string text, Image image) { Text = text; Image = image; }
        public ToolStripMenuItem(string text, Image image, EventHandler onClick) : base(text, image, onClick) { }
        public ToolStripMenuItem(string text, Image image, EventHandler onClick, string name) : base(text, image, onClick) { Name = name; }
        public ToolStripMenuItem(string text, Image image, EventHandler onClick, Keys shortcutKeys) : base(text, image, onClick) { ShortcutKeys = shortcutKeys; }
        public ToolStripMenuItem(string text, Image image, params ToolStripItem[] dropDownItems) : this(text, image) { DropDownItems.AddRange(dropDownItems); }

        internal override string UiType => "TSMenuItem";

        public bool CheckOnClick { get; set; }
        public bool Checked { get => checkState != CheckState.Unchecked; set => CheckState = value ? CheckState.Checked : CheckState.Unchecked; }
        public CheckState CheckState
        {
            get => checkState;
            set
            {
                if (checkState == value) return;
                checkState = value;
                Ui.Set(Id, "checked", value != CheckState.Unchecked);
                Ev.Fire(Events[EvCheckedChanged], this, EventArgs.Empty);
            }
        }

        public Keys ShortcutKeys
        {
            get => shortcut;
            set { shortcut = value; SendShortcut(); }
        }

        bool showShortcut = true;
        string shortcutDisplay;
        public bool ShowShortcutKeys { get => showShortcut; set { showShortcut = value; SendShortcut(); } }
        public string ShortcutKeyDisplayString { get => shortcutDisplay; set { shortcutDisplay = value; SendShortcut(); } }

        void SendShortcut()
        {
            Ui.Set(Id, "shortcut", (int)shortcut);
            Ui.Set(Id, "shortcuttext", showShortcut ? (shortcutDisplay ?? KeysText(shortcut)) : "");
        }

        static string KeysText(Keys k)
        {
            if (k == Keys.None) return "";
            var parts = new List<string>();
            if ((k & Keys.Control) != 0) parts.Add("Ctrl");
            if ((k & Keys.Shift) != 0) parts.Add("Shift");
            if ((k & Keys.Alt) != 0) parts.Add("Alt");
            var code = k & Keys.KeyCode;
            string name = code.ToString();
            if (code >= Keys.D0 && code <= Keys.D9) name = name.Substring(1);
            parts.Add(name);
            return string.Join("+", parts);
        }

        public event EventHandler CheckedChanged { add => Events.AddHandler(EvCheckedChanged, value); remove => Events.RemoveHandler(EvCheckedChanged, value); }

        internal override void HandleClick()
        {
            if (CheckOnClick && !HasDropDownItems) Checked = !Checked;
            base.HandleClick();
            (OwnerItem as ToolStripDropDownItem)?.RaiseDropDownItemClicked(this);
        }
    }

    public class ToolStripDropDownButton : ToolStripDropDownItem
    {
        public ToolStripDropDownButton() { }
        public ToolStripDropDownButton(string text) { Text = text; }
        public ToolStripDropDownButton(string text, Image image, params ToolStripItem[] dropDownItems) { Text = text; Image = image; DropDownItems.AddRange(dropDownItems); }
        internal override string UiType => "TSDropDownButton";
        public bool ShowDropDownArrow { get; set; } = true;
    }

    public class ToolStripSplitButton : ToolStripDropDownButton
    {
        public ToolStripSplitButton() { }
        public ToolStripSplitButton(string text) { Text = text; }
        public event EventHandler ButtonClick;
        internal override void HandleClick()
        {
            ButtonClick?.Invoke(this, EventArgs.Empty);
            base.HandleClick();
        }
    }

    // ============================================================ koleksiyon

    public class ToolStripItemCollection : IList
    {
        readonly List<ToolStripItem> list = new List<ToolStripItem>();
        readonly ToolStrip ownerStrip;
        readonly ToolStripDropDownItem ownerItem;

        internal ToolStripItemCollection(ToolStrip strip, ToolStripDropDownItem item)
        {
            ownerStrip = strip;
            ownerItem = item;
        }

        public ToolStripItemCollection(ToolStrip owner, ToolStripItem[] value) : this(owner, (ToolStripDropDownItem)null) { AddRange(value); }

        int ParentUiId => ownerStrip?.Id ?? ownerItem.Id;
        ToolStrip OwnerStrip => ownerStrip ?? ownerItem.Owner;

        public int Count => list.Count;
        public bool IsReadOnly => false;
        bool IList.IsFixedSize => false;
        bool ICollection.IsSynchronized => false;
        object ICollection.SyncRoot => this;

        public virtual ToolStripItem this[int index] => list[index];
        public virtual ToolStripItem this[string key]
        {
            get
            {
                foreach (var i in list) if (string.Equals(i.Name, key, StringComparison.OrdinalIgnoreCase)) return i;
                return null;
            }
        }

        object IList.this[int index] { get => list[index]; set => throw new NotSupportedException(); }

        public ToolStripItem Add(string text) => Add(text, null, null);
        public ToolStripItem Add(Image image) => Add(null, image, null);
        public ToolStripItem Add(string text, Image image) => Add(text, image, null);

        public ToolStripItem Add(string text, Image image, EventHandler onClick)
        {
            ToolStripItem item = ownerItem != null || ownerStrip is MenuStrip || ownerStrip is ContextMenuStripBase
                ? new ToolStripMenuItem(text, image, onClick)
                : ownerStrip is StatusStrip ? new ToolStripStatusLabel(text) : new ToolStripButton(text, image, onClick);
            Add(item);
            return item;
        }

        public int Add(ToolStripItem value)
        {
            Insert(list.Count, value);
            return list.Count - 1;
        }

        public void AddRange(ToolStripItem[] toolStripItems)
        {
            if (toolStripItems == null) return;
            foreach (var i in toolStripItems) Add(i);
        }

        public void AddRange(ToolStripItemCollection toolStripItems)
        {
            foreach (var i in toolStripItems.list.ToArray()) Add(i);
        }

        public void Insert(int index, ToolStripItem value)
        {
            if (value == null) throw new ArgumentNullException(nameof(value));
            list.Remove(value);
            list.Insert(Math.Min(index, list.Count), value);
            value.SetOwner(OwnerStrip, ownerItem, ParentUiId);
            SendOrder();
        }

        public void Remove(ToolStripItem value)
        {
            if (!list.Remove(value)) return;
            value.SetOwner(null, null, 0);
            SendOrder();
        }

        public void RemoveAt(int index) => Remove(list[index]);
        public void RemoveByKey(string key) { var i = this[key]; if (i != null) Remove(i); }

        public void Clear()
        {
            foreach (var i in list.ToArray()) Remove(i);
        }

        public bool Contains(ToolStripItem value) => list.Contains(value);
        public bool ContainsKey(string key) => this[key] != null;
        public int IndexOf(ToolStripItem value) => list.IndexOf(value);
        public int IndexOfKey(string key) { for (int i = 0; i < list.Count; i++) if (string.Equals(list[i].Name, key, StringComparison.OrdinalIgnoreCase)) return i; return -1; }

        public ToolStripItem[] Find(string key, bool searchAllChildren)
        {
            var found = new List<ToolStripItem>();
            void Walk(ToolStripItemCollection c)
            {
                foreach (var i in c.list)
                {
                    if (string.Equals(i.Name, key, StringComparison.OrdinalIgnoreCase)) found.Add(i);
                    if (searchAllChildren && i is ToolStripDropDownItem d) Walk(d.DropDownItems);
                }
            }
            Walk(this);
            return found.ToArray();
        }

        void SendOrder()
        {
            var ids = new List<string>();
            foreach (var i in list) ids.Add(i.Id.ToString(CultureInfo.InvariantCulture));
            Ui.Set(ParentUiId, "itemorder", string.Join(",", ids));
        }

        internal IEnumerable<ToolStripItem> All => list;

        public IEnumerator GetEnumerator() => list.ToArray().GetEnumerator();
        public void CopyTo(ToolStripItem[] array, int index) => list.CopyTo(array, index);
        void ICollection.CopyTo(Array array, int index) => ((ICollection)list).CopyTo(array, index);
        int IList.Add(object value) => Add((ToolStripItem)value);
        bool IList.Contains(object value) => value is ToolStripItem i && Contains(i);
        int IList.IndexOf(object value) => value is ToolStripItem i ? IndexOf(i) : -1;
        void IList.Insert(int index, object value) => Insert(index, (ToolStripItem)value);
        void IList.Remove(object value) => Remove(value as ToolStripItem);
    }

    /// <summary>ContextMenuStrip'in Add(string) davranışı için işaret sınıfı.</summary>
    public abstract class ContextMenuStripBase : ToolStrip
    {
        internal ContextMenuStripBase() { }
    }

    // ============================================================ çubuklar

    public class ToolStrip : ScrollableControl
    {
        static readonly object EvItemClicked = new object();
        ToolStripGripStyle grip = ToolStripGripStyle.Visible;

        public ToolStrip()
        {
            Items = new ToolStripItemCollection(this, (ToolStripDropDownItem)null);
            Dock = DefaultDockStyle;
            TabStop = false;
        }

        public ToolStrip(params ToolStripItem[] items) : this() { Items.AddRange(items); }

        internal override string UiType => "ToolStrip";
        protected override Size DefaultSize => new Size(100, 25);
        protected virtual DockStyle DefaultDockStyle => DockStyle.Top;

        public ToolStripItemCollection Items { get; }
        public virtual ToolStripItemCollection DisplayedItems => Items;

        public ToolStripGripStyle GripStyle { get => grip; set { grip = value; Ui.Set(Id, "grip", value == ToolStripGripStyle.Visible); } }
        public ToolStripLayoutStyle LayoutStyle { get; set; }
        public ToolStripRenderMode RenderMode { get; set; } = ToolStripRenderMode.ManagerRenderMode;
        public Size ImageScalingSize { get; set; } = new Size(16, 16);
        public bool ShowItemToolTips { get; set; } = true;
        public bool CanOverflow { get; set; } = true;
        public bool Stretch { get; set; }
        public ToolStripTextDirection TextDirection { get; set; }
        public Orientation Orientation => Orientation.Horizontal;
        public bool AllowMerge { get; set; } = true;
        public bool AllowItemReorder { get; set; }
        public override bool AutoSize { get => base.AutoSize; set => base.AutoSize = value; }
        public override bool CanFocus => false;

        public ToolStripItem GetItemAt(int x, int y) => null;

        public event ToolStripItemClickedEventHandler ItemClicked { add => Events.AddHandler(EvItemClicked, value); remove => Events.RemoveHandler(EvItemClicked, value); }
        protected virtual void OnItemClicked(ToolStripItemClickedEventArgs e) => Ev.Fire(Events[EvItemClicked], this, e);
        internal void RaiseItemClicked(ToolStripItem item) => OnItemClicked(new ToolStripItemClickedEventArgs(item));

        protected override void Dispose(bool disposing)
        {
            if (disposing)
            {
                foreach (ToolStripItem i in Items) i.Dispose();
            }
            base.Dispose(disposing);
        }
    }

    public class MenuStrip : ToolStrip
    {
        public MenuStrip() { GripStyle = ToolStripGripStyle.Hidden; }
        internal override string UiType => "MenuStrip";
        protected override Size DefaultSize => new Size(200, 24);
        public ToolStripMenuItem MdiWindowListItem { get; set; }
        public event EventHandler MenuActivate;
        public event EventHandler MenuDeactivate;
    }

    public class StatusStrip : ToolStrip
    {
        public StatusStrip() { GripStyle = ToolStripGripStyle.Hidden; }
        internal override string UiType => "StatusStrip";
        protected override Size DefaultSize => new Size(200, 22);
        protected override DockStyle DefaultDockStyle => DockStyle.Bottom;
        public bool SizingGrip { get; set; } = true;
    }

    /// <summary>Sağ tık menüsü. Bir kontrolün ContextMenuStrip özelliğine atanır.</summary>
    public class ContextMenuStrip : ContextMenuStripBase
    {
        public ContextMenuStrip() { Dock = DockStyle.None; base.SetVisibleCoreInternal(false); }
        public ContextMenuStrip(IContainer container) : this() { container?.Add(this); }
        internal override string UiType => "ContextMenuStrip";
        protected override DockStyle DefaultDockStyle => DockStyle.None;
        public Control SourceControl { get; internal set; }
        public void Show(Control control, Point position) { SourceControl = control; Ui.Call(Id, "showat", control.Id + "," + position.X + "," + position.Y); }
        public void Show(Point position) => Ui.Call(Id, "showat", "0," + position.X + "," + position.Y);
        public void Close() => Ui.Call(Id, "close");
        public event CancelEventHandler Opening;
        internal override string HandleUiEvent(string evt, string data)
        {
            if (evt == "opening")
            {
                if (int.TryParse(data, out int cid) && Ui.Find(cid) is Control c) SourceControl = c;
                var e = new CancelEventArgs();
                Opening?.Invoke(this, e);
                return e.Cancel ? "handled" : "";
            }
            return base.HandleUiEvent(evt, data);
        }
    }
}
