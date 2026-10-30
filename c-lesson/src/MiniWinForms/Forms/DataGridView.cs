using System.Collections;
using System.Collections.Generic;
using System.ComponentModel;
using System.Data;
using System.Drawing;
using System.Globalization;
using System.Text;
using MiniWinForms;

namespace System.Windows.Forms
{
    // ============================================================ sıralamalar (enum)

    public enum DataGridViewSelectionMode { CellSelect = 0, FullRowSelect = 1, FullColumnSelect = 2, RowHeaderSelect = 3, ColumnHeaderSelect = 4 }
    public enum DataGridViewAutoSizeColumnsMode { None = 1, ColumnHeader = 2, AllCellsExceptHeader = 4, AllCells = 6, DisplayedCellsExceptHeader = 8, DisplayedCells = 10, Fill = 16 }
    public enum DataGridViewAutoSizeColumnMode { NotSet = 0, None = 1, ColumnHeader = 2, AllCellsExceptHeader = 4, AllCells = 6, DisplayedCellsExceptHeader = 8, DisplayedCells = 10, Fill = 16 }
    public enum DataGridViewAutoSizeRowsMode { None = 0, AllHeaders = 5, AllCellsExceptHeaders = 6, AllCells = 7, DisplayedHeaders = 9, DisplayedCellsExceptHeaders = 10, DisplayedCells = 11 }
    public enum DataGridViewColumnHeadersHeightSizeMode { EnableResizing = 0, DisableResizing = 1, AutoSize = 2 }
    public enum DataGridViewRowHeadersWidthSizeMode { EnableResizing = 0, DisableResizing = 1, AutoSizeToAllHeaders = 2, AutoSizeToDisplayedHeaders = 3, AutoSizeToFirstHeader = 4 }
    public enum DataGridViewEditMode { EditOnEnter = 0, EditOnKeystroke = 1, EditOnKeystrokeOrF2 = 2, EditOnF2 = 3, EditProgrammatically = 4 }
    public enum DataGridViewColumnSortMode { NotSortable = 0, Automatic = 1, Programmatic = 2 }
    public enum DataGridViewContentAlignment { NotSet = 0, TopLeft = 1, TopCenter = 2, TopRight = 4, MiddleLeft = 16, MiddleCenter = 32, MiddleRight = 64, BottomLeft = 256, BottomCenter = 512, BottomRight = 1024 }
    public enum DataGridViewTriState { NotSet = 0, True = 1, False = 2 }
    public enum DataGridViewCellBorderStyle { Custom = 0, Single = 1, Raised = 2, Sunken = 3, None = 4, SingleVertical = 5, RaisedVertical = 6, SunkenVertical = 7, SingleHorizontal = 8, RaisedHorizontal = 9, SunkenHorizontal = 10 }
    public enum DataGridViewHeaderBorderStyle { Custom = 0, Single = 1, Raised = 2, Sunken = 3, None = 4 }
    public enum DataGridViewClipboardCopyMode { Disable = 0, EnableWithAutoHeaderText = 1, EnableWithoutHeaderText = 2, EnableAlwaysIncludeHeaderText = 3 }
    public enum SortOrder { None = 0, Ascending = 1, Descending = 2 }
    [Flags] public enum DataGridViewElementStates { None = 0, Displayed = 1, Frozen = 2, ReadOnly = 4, Resizable = 8, ResizableSet = 16, Selected = 32, Visible = 64 }
    [Flags] public enum DataGridViewDataErrorContexts { Formatting = 1, Display = 2, PreferredSize = 4, RowDeletion = 8, Parsing = 256, Commit = 512, InitialValueRestoration = 1024, LeaveControl = 2048, CurrentCellChange = 4096, Scroll = 8192, ClipboardContent = 16384 }
    public enum DataGridViewImageCellLayout { NotSet = 0, Normal = 1, Stretch = 2, Zoom = 3 }

    // ============================================================ olay argümanları

    public delegate void DataGridViewCellEventHandler(object sender, DataGridViewCellEventArgs e);
    public delegate void DataGridViewCellMouseEventHandler(object sender, DataGridViewCellMouseEventArgs e);
    public delegate void DataGridViewCellCancelEventHandler(object sender, DataGridViewCellCancelEventArgs e);
    public delegate void DataGridViewRowEventHandler(object sender, DataGridViewRowEventArgs e);
    public delegate void DataGridViewRowCancelEventHandler(object sender, DataGridViewRowCancelEventArgs e);
    public delegate void DataGridViewRowsAddedEventHandler(object sender, DataGridViewRowsAddedEventArgs e);
    public delegate void DataGridViewRowsRemovedEventHandler(object sender, DataGridViewRowsRemovedEventArgs e);
    public delegate void DataGridViewCellFormattingEventHandler(object sender, DataGridViewCellFormattingEventArgs e);
    public delegate void DataGridViewCellValidatingEventHandler(object sender, DataGridViewCellValidatingEventArgs e);
    public delegate void DataGridViewDataErrorEventHandler(object sender, DataGridViewDataErrorEventArgs e);
    public delegate void DataGridViewBindingCompleteEventHandler(object sender, DataGridViewBindingCompleteEventArgs e);
    public delegate void DataGridViewColumnEventHandler(object sender, DataGridViewColumnEventArgs e);

    public class DataGridViewCellEventArgs : EventArgs
    {
        public DataGridViewCellEventArgs(int columnIndex, int rowIndex) { ColumnIndex = columnIndex; RowIndex = rowIndex; }
        public int ColumnIndex { get; }
        public int RowIndex { get; }
    }

    public class DataGridViewCellMouseEventArgs : MouseEventArgs
    {
        public DataGridViewCellMouseEventArgs(int columnIndex, int rowIndex, int localX, int localY, MouseEventArgs e)
            : base(e.Button, e.Clicks, localX, localY, e.Delta) { ColumnIndex = columnIndex; RowIndex = rowIndex; }
        public int ColumnIndex { get; }
        public int RowIndex { get; }
    }

    public class DataGridViewCellCancelEventArgs : CancelEventArgs
    {
        public DataGridViewCellCancelEventArgs(int columnIndex, int rowIndex) { ColumnIndex = columnIndex; RowIndex = rowIndex; }
        public int ColumnIndex { get; }
        public int RowIndex { get; }
    }

    public class DataGridViewRowEventArgs : EventArgs
    {
        public DataGridViewRowEventArgs(DataGridViewRow row) { Row = row; }
        public DataGridViewRow Row { get; }
    }

    public class DataGridViewRowCancelEventArgs : CancelEventArgs
    {
        public DataGridViewRowCancelEventArgs(DataGridViewRow row) { Row = row; }
        public DataGridViewRow Row { get; }
    }

    public class DataGridViewRowsAddedEventArgs : EventArgs
    {
        public DataGridViewRowsAddedEventArgs(int rowIndex, int rowCount) { RowIndex = rowIndex; RowCount = rowCount; }
        public int RowIndex { get; }
        public int RowCount { get; }
    }

    public class DataGridViewRowsRemovedEventArgs : EventArgs
    {
        public DataGridViewRowsRemovedEventArgs(int rowIndex, int rowCount) { RowIndex = rowIndex; RowCount = rowCount; }
        public int RowIndex { get; }
        public int RowCount { get; }
    }

    public class DataGridViewCellFormattingEventArgs : ConvertEventArgs
    {
        public DataGridViewCellFormattingEventArgs(int columnIndex, int rowIndex, object value, Type desiredType, DataGridViewCellStyle cellStyle)
            : base(value, desiredType) { ColumnIndex = columnIndex; RowIndex = rowIndex; CellStyle = cellStyle; }
        public int ColumnIndex { get; }
        public int RowIndex { get; }
        public DataGridViewCellStyle CellStyle { get; set; }
        public bool FormattingApplied { get; set; }
    }

    public class DataGridViewCellValidatingEventArgs : CancelEventArgs
    {
        public DataGridViewCellValidatingEventArgs(int columnIndex, int rowIndex, object formattedValue) { ColumnIndex = columnIndex; RowIndex = rowIndex; FormattedValue = formattedValue; }
        public int ColumnIndex { get; }
        public int RowIndex { get; }
        public object FormattedValue { get; }
    }

    public class DataGridViewDataErrorEventArgs : DataGridViewCellCancelEventArgs
    {
        public DataGridViewDataErrorEventArgs(Exception exception, int columnIndex, int rowIndex, DataGridViewDataErrorContexts context)
            : base(columnIndex, rowIndex) { Exception = exception; Context = context; }
        public Exception Exception { get; }
        public DataGridViewDataErrorContexts Context { get; }
        public bool ThrowException { get; set; }
    }

    public class DataGridViewBindingCompleteEventArgs : EventArgs
    {
        public DataGridViewBindingCompleteEventArgs(ListChangedType listChangedType) { ListChangedType = listChangedType; }
        public ListChangedType ListChangedType { get; }
    }

    public class DataGridViewColumnEventArgs : EventArgs
    {
        public DataGridViewColumnEventArgs(DataGridViewColumn column) { Column = column; }
        public DataGridViewColumn Column { get; }
    }

    // ============================================================ stil

    public class DataGridViewCellStyle : ICloneable
    {
        internal event Action Changed;
        Color backColor = Color.Empty, foreColor = Color.Empty, selBack = Color.Empty, selFore = Color.Empty;
        Font font;
        DataGridViewContentAlignment alignment;
        string format = "";
        DataGridViewTriState wrap;

        public DataGridViewCellStyle() { }
        public DataGridViewCellStyle(DataGridViewCellStyle s)
        {
            if (s == null) return;
            backColor = s.backColor; foreColor = s.foreColor; selBack = s.selBack; selFore = s.selFore;
            font = s.font; alignment = s.alignment; format = s.format; wrap = s.wrap; NullValue = s.NullValue; FormatProvider = s.FormatProvider; Padding = s.Padding;
        }

        void Notify() => Changed?.Invoke();

        public Color BackColor { get => backColor; set { backColor = value; Notify(); } }
        public Color ForeColor { get => foreColor; set { foreColor = value; Notify(); } }
        public Color SelectionBackColor { get => selBack; set { selBack = value; Notify(); } }
        public Color SelectionForeColor { get => selFore; set { selFore = value; Notify(); } }
        public Font Font { get => font; set { font = value; Notify(); } }
        public DataGridViewContentAlignment Alignment { get => alignment; set { alignment = value; Notify(); } }
        public string Format { get => format; set { format = value ?? ""; Notify(); } }
        public DataGridViewTriState WrapMode { get => wrap; set { wrap = value; Notify(); } }
        public object NullValue { get; set; } = "";
        public object DataSourceNullValue { get; set; } = DBNull.Value;
        public IFormatProvider FormatProvider { get; set; }
        public Padding Padding { get; set; }
        public object Tag { get; set; }
        public bool IsNullValueDefault => NullValue is string s && s.Length == 0;
        public bool IsDataSourceNullValueDefault => DataSourceNullValue is DBNull;

        public object Clone() => new DataGridViewCellStyle(this);
        public void ApplyStyle(DataGridViewCellStyle s)
        {
            if (s == null) return;
            if (!s.backColor.IsEmpty) backColor = s.backColor;
            if (!s.foreColor.IsEmpty) foreColor = s.foreColor;
            if (!s.selBack.IsEmpty) selBack = s.selBack;
            if (!s.selFore.IsEmpty) selFore = s.selFore;
            if (s.font != null) font = s.font;
            if (s.alignment != DataGridViewContentAlignment.NotSet) alignment = s.alignment;
            if (s.format.Length > 0) format = s.format;
            Notify();
        }

        internal string Json()
        {
            var sb = new StringBuilder("{");
            void Add(string k, string v) { if (string.IsNullOrEmpty(v)) return; if (sb.Length > 1) sb.Append(','); sb.Append('"').Append(k).Append("\":").Append(Ui.J(v)); }
            Add("b", Ui.Color(backColor));
            Add("f", Ui.Color(foreColor));
            Add("sb", Ui.Color(selBack));
            Add("sf", Ui.Color(selFore));
            Add("font", font?.Css);
            if (alignment != DataGridViewContentAlignment.NotSet) Add("a", alignment.ToString());
            if (wrap == DataGridViewTriState.True) Add("w", "1");
            return sb.Append('}').ToString();
        }

        internal bool IsEmpty => backColor.IsEmpty && foreColor.IsEmpty && selBack.IsEmpty && selFore.IsEmpty && font == null && alignment == DataGridViewContentAlignment.NotSet && wrap != DataGridViewTriState.True;
    }

    // ============================================================ sütunlar

    public class DataGridViewColumn : Component, ICloneable
    {
        string name = "", header;
        int width = 100;
        bool visible = true, readOnly;
        DataGridViewAutoSizeColumnMode autoSize = DataGridViewAutoSizeColumnMode.NotSet;
        float fillWeight = 100;
        DataGridViewCellStyle style;

        public DataGridViewColumn() { GC.SuppressFinalize(this); }
        public DataGridViewColumn(DataGridViewCell cellTemplate) : this() { CellTemplate = cellTemplate; }

        public DataGridView DataGridView { get; internal set; }
        public int Index => DataGridView?.Columns.IndexOf(this) ?? -1;
        public int DisplayIndex { get => Index; set { } }

        public string Name { get => name; set { name = value ?? ""; Changed(); } }
        /// <summary>Başlık. Ayarlanmamışsa sütunun adı (Name) görünür (WinForms'taki gibi).</summary>
        public string HeaderText { get => header ?? name; set { header = value; Changed(); } }
        public int Width { get => width; set { if (value < 2) value = 2; width = value; Changed(); } }
        public int MinimumWidth { get; set; } = 5;
        public float FillWeight { get => fillWeight; set { fillWeight = value <= 0 ? 1 : value; Changed(); } }
        public bool Visible { get => visible; set { visible = value; Changed(); } }
        public virtual bool ReadOnly { get => readOnly || (DataGridView?.ReadOnly ?? false); set { readOnly = value; Changed(); } }
        internal bool OwnReadOnly => readOnly;
        internal bool AutoGenerated;
        public bool Frozen { get; set; }
        public DataGridViewTriState Resizable { get; set; }
        public string DataPropertyName { get; set; } = "";
        public Type ValueType { get; set; }
        public object Tag { get; set; }
        public string ToolTipText { get; set; } = "";
        public bool IsDataBound => !string.IsNullOrEmpty(DataPropertyName) && DataGridView?.IsBound == true;
        public DataGridViewColumnSortMode SortMode { get; set; } = DataGridViewColumnSortMode.Automatic;
        public DataGridViewCell CellTemplate { get; set; }
        public DataGridViewColumnHeaderCell HeaderCell { get; } = new DataGridViewColumnHeaderCell();
        public DataGridViewAutoSizeColumnMode AutoSizeMode { get => autoSize; set { autoSize = value; Changed(); } }
        public DataGridViewAutoSizeColumnMode InheritedAutoSizeMode =>
            autoSize != DataGridViewAutoSizeColumnMode.NotSet ? autoSize : (DataGridViewAutoSizeColumnMode)(int)(DataGridView?.AutoSizeColumnsMode ?? DataGridViewAutoSizeColumnsMode.None);
        public DataGridViewCellStyle DefaultCellStyle
        {
            get
            {
                if (style == null) { style = new DataGridViewCellStyle(); style.Changed += Changed; }
                return style;
            }
            set { style = value; if (style != null) style.Changed += Changed; Changed(); }
        }
        internal DataGridViewCellStyle StyleOrNull => style;
        public bool Displayed => visible;
        public bool Selected { get; set; }

        internal virtual string Kind => "text";
        void Changed() => DataGridView?.Invalidate(true);

        public virtual object Clone()
        {
            var c = (DataGridViewColumn)MemberwiseClone();
            c.DataGridView = null;
            return c;
        }

        public override string ToString() => "DataGridViewColumn { Name=" + name + ", Index=" + Index + " }";
    }

    public class DataGridViewTextBoxColumn : DataGridViewColumn
    {
        public DataGridViewTextBoxColumn() : base(new DataGridViewTextBoxCell()) { }
        public int MaxInputLength { get; set; } = 32767;
    }

    public class DataGridViewCheckBoxColumn : DataGridViewColumn
    {
        public DataGridViewCheckBoxColumn() : this(false) { }
        public DataGridViewCheckBoxColumn(bool threeState) : base(new DataGridViewCheckBoxCell()) { ThreeState = threeState; SortMode = DataGridViewColumnSortMode.NotSortable; }
        public bool ThreeState { get; set; }
        public object TrueValue { get; set; }
        public object FalseValue { get; set; }
        public object IndeterminateValue { get; set; }
        public FlatStyle FlatStyle { get; set; } = FlatStyle.Standard;
        internal override string Kind => "check";
    }

    public class DataGridViewButtonColumn : DataGridViewColumn
    {
        public DataGridViewButtonColumn() : base(new DataGridViewButtonCell()) { SortMode = DataGridViewColumnSortMode.NotSortable; }
        public string Text { get; set; }
        public bool UseColumnTextForButtonValue { get; set; }
        public FlatStyle FlatStyle { get; set; } = FlatStyle.Standard;
        internal override string Kind => "button";
    }

    public class DataGridViewLinkColumn : DataGridViewColumn
    {
        public DataGridViewLinkColumn() : base(new DataGridViewLinkCell()) { SortMode = DataGridViewColumnSortMode.NotSortable; }
        public string Text { get; set; }
        public bool UseColumnTextForLinkValue { get; set; }
        internal override string Kind => "link";
    }

    public class DataGridViewComboBoxColumn : DataGridViewColumn
    {
        public DataGridViewComboBoxColumn() : base(new DataGridViewComboBoxCell()) { SortMode = DataGridViewColumnSortMode.NotSortable; }
        public List<object> ItemsList { get; } = new List<object>();
        public ObjectCollectionSimple Items => new ObjectCollectionSimple(ItemsList, () => DataGridView?.Invalidate(true));
        public object DataSource { get; set; }
        public string DisplayMember { get; set; } = "";
        public string ValueMember { get; set; } = "";
        public ComboBoxStyle DisplayStyle { get; set; }
        public FlatStyle FlatStyle { get; set; } = FlatStyle.Standard;
        internal override string Kind => "combo";

        internal List<string> ItemTexts()
        {
            var r = new List<string>();
            if (DataSource != null)
            {
                var list = ListHelper.Resolve(DataSource, "");
                var pd = ListHelper.Find(list, DisplayMember);
                if (list != null) foreach (var o in list) r.Add(Convert.ToString(pd != null ? pd.GetValue(o) : o, CultureInfo.CurrentCulture));
            }
            foreach (var o in ItemsList) r.Add(Convert.ToString(o, CultureInfo.CurrentCulture));
            return r;
        }
    }

    public class DataGridViewImageColumn : DataGridViewColumn
    {
        public DataGridViewImageColumn() : base(new DataGridViewImageCell()) { SortMode = DataGridViewColumnSortMode.NotSortable; }
        public Image Image { get; set; }
        public DataGridViewImageCellLayout ImageLayout { get; set; }
        public string Description { get; set; } = "";
        internal override string Kind => "image";
    }

    public class ObjectCollectionSimple : IEnumerable
    {
        readonly List<object> list;
        readonly Action changed;
        internal ObjectCollectionSimple(List<object> list, Action changed) { this.list = list; this.changed = changed; }
        public int Count => list.Count;
        public object this[int i] { get => list[i]; set { list[i] = value; changed(); } }
        public int Add(object o) { list.Add(o); changed(); return list.Count - 1; }
        public void AddRange(params object[] items) { list.AddRange(items); changed(); }
        public void Remove(object o) { list.Remove(o); changed(); }
        public void RemoveAt(int i) { list.RemoveAt(i); changed(); }
        public void Clear() { list.Clear(); changed(); }
        public bool Contains(object o) => list.Contains(o);
        public int IndexOf(object o) => list.IndexOf(o);
        public IEnumerator GetEnumerator() => list.ToArray().GetEnumerator();
    }

    // ============================================================ hücreler

    public class DataGridViewCell : ICloneable
    {
        DataGridViewCellStyle style;
        internal object LocalValue;
        internal bool selected;

        public DataGridViewRow OwningRow { get; internal set; }
        internal int Col;
        public int ColumnIndex => Col;
        public int RowIndex => OwningRow?.Index ?? -1;
        public DataGridView DataGridView => OwningRow?.DataGridView;
        public DataGridViewColumn OwningColumn => DataGridView != null && Col >= 0 && Col < DataGridView.Columns.Count ? DataGridView.Columns[Col] : null;

        public object Value
        {
            get => DataGridView != null ? DataGridView.GetCellValue(OwningRow, Col) : LocalValue;
            set
            {
                if (DataGridView != null) DataGridView.SetCellValue(OwningRow, Col, value, true);
                else LocalValue = value;
            }
        }

        public object FormattedValue => DataGridView != null ? DataGridView.FormatCell(OwningRow, Col, out _) : Convert.ToString(LocalValue, CultureInfo.CurrentCulture);
        public object EditedFormattedValue => FormattedValue;
        public Type ValueType { get => OwningColumn?.ValueType ?? (Value?.GetType() ?? typeof(object)); set { } }
        public Type FormattedValueType => typeof(string);
        public object Tag { get; set; }
        public string ToolTipText { get; set; } = "";
        public string ErrorText { get; set; } = "";
        public bool Displayed => true;
        public bool Frozen => false;
        public bool Visible => OwningColumn?.Visible ?? true;
        public bool IsInEditMode => DataGridView != null && DataGridView.editingCell == this;
        public bool HasStyle => style != null;
        public bool ReadOnly
        {
            get => readOnly || (OwningRow?.ReadOnly ?? false) || (OwningColumn?.ReadOnly ?? false);
            set => readOnly = value;
        }
        bool readOnly;

        public DataGridViewCellStyle Style
        {
            get
            {
                if (style == null) { style = new DataGridViewCellStyle(); style.Changed += () => DataGridView?.Invalidate(false); }
                return style;
            }
            set { style = value; if (style != null) style.Changed += () => DataGridView?.Invalidate(false); DataGridView?.Invalidate(false); }
        }
        internal DataGridViewCellStyle StyleOrNull => style;
        public DataGridViewCellStyle InheritedStyle => DataGridView?.InheritedStyle(OwningRow, Col) ?? new DataGridViewCellStyle();

        public virtual bool Selected
        {
            get
            {
                var g = DataGridView;
                if (g == null) return selected;
                if (OwningRow.Selected) return true;
                return selected;
            }
            set
            {
                if (DataGridView == null) { selected = value; return; }
                DataGridView.SetCellSelected(this, value);
            }
        }

        public virtual object Clone()
        {
            var c = (DataGridViewCell)MemberwiseClone();
            c.OwningRow = null;
            return c;
        }

        public override string ToString() => GetType().Name + " { ColumnIndex=" + ColumnIndex + ", RowIndex=" + RowIndex + " }";
    }

    public class DataGridViewTextBoxCell : DataGridViewCell { public int MaxInputLength { get; set; } = 32767; }
    public class DataGridViewCheckBoxCell : DataGridViewCell
    {
        public DataGridViewCheckBoxCell() { }
        public DataGridViewCheckBoxCell(bool threeState) { ThreeState = threeState; }
        public bool ThreeState { get; set; }
        public object TrueValue { get; set; }
        public object FalseValue { get; set; }
    }
    public class DataGridViewButtonCell : DataGridViewCell { public bool UseColumnTextForButtonValue { get; set; } }
    public class DataGridViewLinkCell : DataGridViewCell { }
    public class DataGridViewComboBoxCell : DataGridViewCell
    {
        public List<object> ItemsList { get; } = new List<object>();
        public ObjectCollectionSimple Items => new ObjectCollectionSimple(ItemsList, () => DataGridView?.Invalidate(false));
        public object DataSource { get; set; }
        public string DisplayMember { get; set; } = "";
        public string ValueMember { get; set; } = "";
    }
    public class DataGridViewImageCell : DataGridViewCell { }
    public class DataGridViewHeaderCell : DataGridViewCell { }
    public class DataGridViewColumnHeaderCell : DataGridViewHeaderCell
    {
        public SortOrder SortGlyphDirection { get; set; }
    }
    public class DataGridViewRowHeaderCell : DataGridViewHeaderCell { }

    // ============================================================ satırlar

    public class DataGridViewRow : ICloneable
    {
        internal readonly List<DataGridViewCell> cellList = new List<DataGridViewCell>();
        DataGridViewCellStyle style;
        bool selected, visible = true, readOnly;
        int height = 22;

        public DataGridViewRow() { Cells = new DataGridViewCellCollection(this); }

        public DataGridView DataGridView { get; internal set; }
        internal int index = -1;
        public int Index => DataGridView == null ? -1 : index;
        public bool IsNewRow { get; internal set; }
        internal object BoundItem;
        public object DataBoundItem => BoundItem;
        public DataGridViewCellCollection Cells { get; }
        public object Tag { get; set; }
        public string ErrorText { get; set; } = "";
        public bool Frozen { get; set; }
        public DataGridViewTriState Resizable { get; set; }
        public int MinimumHeight { get; set; } = 3;
        public int Height { get => height; set { height = Math.Max(MinimumHeight, value); DataGridView?.Invalidate(false); } }
        public bool Visible { get => visible; set { visible = value; DataGridView?.Invalidate(false); } }
        public bool ReadOnly { get => readOnly || (DataGridView?.ReadOnly ?? false); set { readOnly = value; DataGridView?.Invalidate(false); } }
        public bool Displayed => visible;
        public DataGridViewRowHeaderCell HeaderCell { get; } = new DataGridViewRowHeaderCell();
        public DataGridViewElementStates State => (Selected ? DataGridViewElementStates.Selected : 0) | (Visible ? DataGridViewElementStates.Visible : 0);

        public bool Selected
        {
            get => selected;
            set
            {
                if (DataGridView == null) { selected = value; return; }
                if (IsNewRow && value) { }
                DataGridView.SetRowSelected(this, value, true);
            }
        }

        internal void SetSelectedFlag(bool v) => selected = v;

        public DataGridViewCellStyle DefaultCellStyle
        {
            get
            {
                if (style == null) { style = new DataGridViewCellStyle(); style.Changed += () => DataGridView?.Invalidate(false); }
                return style;
            }
            set { style = value; if (style != null) style.Changed += () => DataGridView?.Invalidate(false); DataGridView?.Invalidate(false); }
        }
        internal DataGridViewCellStyle StyleOrNull => style;
        public DataGridViewCellStyle InheritedStyle => DataGridView?.InheritedStyle(this, -1) ?? new DataGridViewCellStyle();

        /// <summary>Satır için verilen tablonun sütunlarına uygun hücreler oluşturur.</summary>
        public void CreateCells(DataGridView dataGridView)
        {
            if (dataGridView == null) throw new ArgumentNullException(nameof(dataGridView));
            cellList.Clear();
            for (int i = 0; i < dataGridView.Columns.Count; i++) AddCellFor(dataGridView.Columns[i], i);
        }

        public void CreateCells(DataGridView dataGridView, params object[] values)
        {
            CreateCells(dataGridView);
            SetValues(values);
        }

        internal void AddCellFor(DataGridViewColumn column, int index)
        {
            DataGridViewCell cell = column.CellTemplate != null ? (DataGridViewCell)column.CellTemplate.Clone() : new DataGridViewTextBoxCell();
            cell.LocalValue = null;
            cell.OwningRow = this;
            cell.Col = index;
            cellList.Insert(Math.Min(index, cellList.Count), cell);
            for (int i = 0; i < cellList.Count; i++) cellList[i].Col = i;
        }

        internal void RemoveCellAt(int index)
        {
            if (index < cellList.Count) cellList.RemoveAt(index);
            for (int i = 0; i < cellList.Count; i++) cellList[i].Col = i;
        }

        public bool SetValues(params object[] values)
        {
            if (values == null) return false;
            if (DataGridView != null && DataGridView.IsBound) throw new InvalidOperationException("Veriye bağlı (DataSource) satırlarda SetValues kullanılamaz.");
            for (int i = 0; i < values.Length && i < cellList.Count; i++)
            {
                if (DataGridView != null) cellList[i].Value = values[i];
                else cellList[i].LocalValue = values[i];
            }
            return values.Length <= cellList.Count;
        }

        public object Clone()
        {
            var r = new DataGridViewRow { Tag = Tag, height = height, visible = visible, readOnly = readOnly };
            if (style != null) r.DefaultCellStyle = new DataGridViewCellStyle(style);
            foreach (var c in cellList)
            {
                var nc = (DataGridViewCell)c.Clone();
                nc.OwningRow = r;
                nc.LocalValue = c.Value;
                r.cellList.Add(nc);
            }
            return r;
        }

        public override string ToString() => "DataGridViewRow { Index=" + Index + " }";
    }

    public class DataGridViewCellCollection : IEnumerable
    {
        readonly DataGridViewRow row;
        internal DataGridViewCellCollection(DataGridViewRow row) { this.row = row; }

        public int Count => row.cellList.Count;

        public DataGridViewCell this[int index]
        {
            get
            {
                if (index < 0 || index >= row.cellList.Count)
                    throw new ArgumentOutOfRangeException(nameof(index), "Geçersiz sütun numarası: " + index + ". Tabloda " + row.cellList.Count + " sütun var (0 ile " + (row.cellList.Count - 1) + " arası).");
                return row.cellList[index];
            }
            set
            {
                value.OwningRow = row;
                value.Col = index;
                row.cellList[index] = value;
            }
        }

        public DataGridViewCell this[string columnName]
        {
            get
            {
                var g = row.DataGridView;
                if (g != null)
                {
                    int i = g.Columns.IndexOfName(columnName);
                    if (i < 0) throw new ArgumentException("'" + columnName + "' adında bir sütun bulunamadı. Sütunun Name özelliğini kontrol edin (HeaderText değil).", nameof(columnName));
                    return this[i];
                }
                throw new ArgumentException("Satır bir DataGridView'e eklenmeden sütun adıyla hücreye erişilemez.", nameof(columnName));
            }
        }

        public void Add(DataGridViewCell cell) { cell.OwningRow = row; cell.Col = row.cellList.Count; row.cellList.Add(cell); }
        public void AddRange(params DataGridViewCell[] cells) { foreach (var c in cells) Add(c); }
        public bool Contains(DataGridViewCell cell) => row.cellList.Contains(cell);
        public int IndexOf(DataGridViewCell cell) => row.cellList.IndexOf(cell);
        public IEnumerator GetEnumerator() => row.cellList.ToArray().GetEnumerator();
    }

    // ============================================================ koleksiyonlar

    public class DataGridViewColumnCollection : IList
    {
        readonly DataGridView owner;
        readonly List<DataGridViewColumn> list = new List<DataGridViewColumn>();
        internal DataGridViewColumnCollection(DataGridView owner) { this.owner = owner; }

        public int Count => list.Count;
        public bool IsReadOnly => false;
        bool IList.IsFixedSize => false;
        bool ICollection.IsSynchronized => false;
        object ICollection.SyncRoot => this;

        public DataGridViewColumn this[int index]
        {
            get
            {
                if (index < 0 || index >= list.Count)
                    throw new ArgumentOutOfRangeException(nameof(index), "Geçersiz sütun numarası: " + index + ". Tabloda " + list.Count + " sütun var.");
                return list[index];
            }
        }

        public DataGridViewColumn this[string columnName]
        {
            get { int i = IndexOfName(columnName); return i >= 0 ? list[i] : null; }
        }

        object IList.this[int index] { get => list[index]; set => throw new NotSupportedException(); }

        internal int IndexOfName(string name)
        {
            for (int i = 0; i < list.Count; i++) if (string.Equals(list[i].Name, name, StringComparison.OrdinalIgnoreCase)) return i;
            return -1;
        }

        public int Add(string columnName, string headerText)
        {
            return Add(new DataGridViewTextBoxColumn { Name = columnName, HeaderText = headerText });
        }

        public int Add(DataGridViewColumn column)
        {
            Insert(list.Count, column);
            return list.Count - 1;
        }

        public void AddRange(params DataGridViewColumn[] columns)
        {
            foreach (var c in columns) Add(c);
        }

        public void Insert(int columnIndex, DataGridViewColumn column)
        {
            if (column == null) throw new ArgumentNullException(nameof(column));
            if (column.DataGridView != null) throw new InvalidOperationException("Bu sütun zaten bir DataGridView'e eklenmiş.");
            columnIndex = Math.Max(0, Math.Min(columnIndex, list.Count));
            list.Insert(columnIndex, column);
            column.DataGridView = owner;
            owner.OnColumnInserted(column, columnIndex);
        }

        public void Remove(DataGridViewColumn column)
        {
            int i = list.IndexOf(column);
            if (i >= 0) RemoveAt(i);
        }

        public void Remove(string columnName)
        {
            int i = IndexOfName(columnName);
            if (i < 0) throw new ArgumentException("'" + columnName + "' adında bir sütun bulunamadı.", nameof(columnName));
            RemoveAt(i);
        }

        public void RemoveAt(int index)
        {
            var c = this[index];
            list.RemoveAt(index);
            c.DataGridView = null;
            owner.OnColumnRemoved(c, index);
        }

        public void Clear()
        {
            for (int i = list.Count - 1; i >= 0; i--) RemoveAt(i);
        }

        public bool Contains(DataGridViewColumn column) => list.Contains(column);
        public bool Contains(string columnName) => IndexOfName(columnName) >= 0;
        public int IndexOf(DataGridViewColumn column) => list.IndexOf(column);
        public int GetColumnCount(DataGridViewElementStates includeFilter) => list.Count;
        public DataGridViewColumn GetFirstColumn(DataGridViewElementStates includeFilter) => list.Find(c => c.Visible);
        public DataGridViewColumn GetLastColumn(DataGridViewElementStates includeFilter, DataGridViewElementStates excludeFilter) => list.FindLast(c => c.Visible);
        internal IEnumerable<DataGridViewColumn> All => list;

        public IEnumerator GetEnumerator() => list.ToArray().GetEnumerator();
        public void CopyTo(DataGridViewColumn[] array, int index) => list.CopyTo(array, index);
        void ICollection.CopyTo(Array array, int index) => ((ICollection)list).CopyTo(array, index);
        int IList.Add(object value) => Add((DataGridViewColumn)value);
        bool IList.Contains(object value) => value is DataGridViewColumn c && Contains(c);
        int IList.IndexOf(object value) => value is DataGridViewColumn c ? IndexOf(c) : -1;
        void IList.Insert(int index, object value) => Insert(index, (DataGridViewColumn)value);
        void IList.Remove(object value) => Remove(value as DataGridViewColumn);
    }

    public class DataGridViewRowCollection : IList
    {
        readonly DataGridView owner;
        internal DataGridViewRowCollection(DataGridView owner) { this.owner = owner; }

        List<DataGridViewRow> L => owner.rowList;

        /// <summary>Satır sayısı. AllowUserToAddRows açıksa en alttaki boş "yeni satır" da sayılır (Visual Studio'daki gibi).</summary>
        public int Count => L.Count;
        public bool IsReadOnly => false;
        bool IList.IsFixedSize => false;
        bool ICollection.IsSynchronized => false;
        object ICollection.SyncRoot => this;

        public DataGridViewRow this[int index]
        {
            get
            {
                if (index < 0 || index >= L.Count)
                    throw new ArgumentOutOfRangeException(nameof(index), "Geçersiz satır numarası: " + index + ". Tabloda " + L.Count + " satır var (0 ile " + (L.Count - 1) + " arası).");
                return L[index];
            }
        }

        object IList.this[int index] { get => this[index]; set => throw new NotSupportedException(); }

        public DataGridViewRow SharedRow(int rowIndex) => this[rowIndex];

        public int Add() => Add(new object[0]);
        public int Add(int count)
        {
            if (count <= 0) throw new ArgumentOutOfRangeException(nameof(count), "Eklenecek satır sayısı 0'dan büyük olmalıdır.");
            int first = -1;
            for (int i = 0; i < count; i++) { int r = Add(); if (first < 0) first = r; }
            return first + count - 1;
        }

        public int Add(params object[] values)
        {
            owner.CheckCanAddRows();
            values ??= new object[0];
            if (values.Length > owner.Columns.Count)
                throw new ArgumentException("Satıra " + values.Length + " değer verildi ama tabloda " + owner.Columns.Count + " sütun var.", nameof(values));
            var row = new DataGridViewRow();
            row.CreateCells(owner);
            for (int i = 0; i < values.Length; i++) row.cellList[i].LocalValue = values[i];
            return owner.InsertRowCore(owner.NewRowIndexOrCount, row);
        }

        public int Add(DataGridViewRow dataGridViewRow)
        {
            owner.CheckCanAddRows();
            if (dataGridViewRow == null) throw new ArgumentNullException(nameof(dataGridViewRow));
            if (dataGridViewRow.DataGridView != null) throw new InvalidOperationException("Bu satır zaten bir DataGridView'e eklenmiş.");
            owner.NormalizeCells(dataGridViewRow);
            return owner.InsertRowCore(owner.NewRowIndexOrCount, dataGridViewRow);
        }

        public void AddRange(params DataGridViewRow[] rows) { foreach (var r in rows) Add(r); }

        public void Insert(int rowIndex, params object[] values)
        {
            owner.CheckCanAddRows();
            if (rowIndex < 0 || rowIndex > owner.NewRowIndexOrCount) throw new ArgumentOutOfRangeException(nameof(rowIndex), "Satır bu konuma eklenemez: " + rowIndex);
            var row = new DataGridViewRow();
            row.CreateCells(owner);
            for (int i = 0; i < values.Length && i < row.cellList.Count; i++) row.cellList[i].LocalValue = values[i];
            owner.InsertRowCore(rowIndex, row);
        }

        public void Insert(int rowIndex, DataGridViewRow row)
        {
            owner.CheckCanAddRows();
            owner.NormalizeCells(row);
            owner.InsertRowCore(rowIndex, row);
        }

        public void Remove(DataGridViewRow dataGridViewRow)
        {
            if (dataGridViewRow == null || dataGridViewRow.DataGridView != owner) throw new ArgumentException("Satır bu tabloya ait değil.");
            RemoveAt(dataGridViewRow.Index);
        }

        public void RemoveAt(int index)
        {
            var row = this[index];
            if (row.IsNewRow) throw new InvalidOperationException("Kaydedilmemiş yeni satır silinemez. (En alttaki boş satır silinemez; silmeden önce satırın IsNewRow olmadığını kontrol edin.)");
            owner.RemoveRowCore(row);
        }

        public void Clear()
        {
            if (owner.IsBound) throw new InvalidOperationException("Veriye bağlı (DataSource) bir tablonun satırları Rows.Clear() ile silinemez.");
            owner.ClearRowsCore();
        }

        public bool Contains(DataGridViewRow row) => L.Contains(row);
        public int IndexOf(DataGridViewRow row) => L.IndexOf(row);
        public int GetRowCount(DataGridViewElementStates includeFilter)
        {
            if (includeFilter == DataGridViewElementStates.Selected) return L.FindAll(r => r.Selected).Count;
            if (includeFilter == DataGridViewElementStates.Visible) return L.FindAll(r => r.Visible).Count;
            return L.Count;
        }
        public int GetFirstRow(DataGridViewElementStates includeFilter) => L.FindIndex(r => includeFilter != DataGridViewElementStates.Selected || r.Selected);
        public int GetLastRow(DataGridViewElementStates includeFilter) => L.FindLastIndex(r => includeFilter != DataGridViewElementStates.Selected || r.Selected);
        public int GetRowsHeight(DataGridViewElementStates includeFilter) { int h = 0; foreach (var r in L) h += r.Height; return h; }

        public IEnumerator GetEnumerator() => L.ToArray().GetEnumerator();
        public void CopyTo(DataGridViewRow[] array, int index) => L.CopyTo(array, index);
        void ICollection.CopyTo(Array array, int index) => ((ICollection)L).CopyTo(array, index);
        int IList.Add(object value) => Add((DataGridViewRow)value);
        bool IList.Contains(object value) => value is DataGridViewRow r && Contains(r);
        int IList.IndexOf(object value) => value is DataGridViewRow r ? IndexOf(r) : -1;
        void IList.Insert(int index, object value) => Insert(index, (DataGridViewRow)value);
        void IList.Remove(object value) => Remove(value as DataGridViewRow);
    }

    /// <summary>SelectedRows / SelectedCells: alındığı andaki durumun kopyasıdır (döngüde satır silinebilir).</summary>
    public class DataGridViewSelectedRowCollection : IList
    {
        readonly List<DataGridViewRow> list;
        internal DataGridViewSelectedRowCollection(List<DataGridViewRow> list) { this.list = list; }
        public int Count => list.Count;
        public DataGridViewRow this[int index]
        {
            get
            {
                if (index < 0 || index >= list.Count)
                    throw new ArgumentOutOfRangeException(nameof(index), list.Count == 0 ? "Seçili satır yok (SelectedRows boş). Önce SelectedRows.Count > 0 olduğunu kontrol edin." : "Geçersiz numara: " + index);
                return list[index];
            }
        }
        object IList.this[int index] { get => this[index]; set => throw new NotSupportedException(); }
        public bool Contains(DataGridViewRow row) => list.Contains(row);
        public void Insert(int index, DataGridViewRow row) => throw new NotSupportedException();
        public IEnumerator GetEnumerator() => list.ToArray().GetEnumerator();
        public void CopyTo(DataGridViewRow[] array, int index) => list.CopyTo(array, index);
        void ICollection.CopyTo(Array array, int index) => ((ICollection)list).CopyTo(array, index);
        public bool IsReadOnly => true;
        bool IList.IsFixedSize => true;
        bool ICollection.IsSynchronized => false;
        object ICollection.SyncRoot => this;
        int IList.Add(object value) => throw new NotSupportedException();
        void IList.Clear() => throw new NotSupportedException();
        bool IList.Contains(object value) => value is DataGridViewRow r && Contains(r);
        int IList.IndexOf(object value) => value is DataGridViewRow r ? list.IndexOf(r) : -1;
        void IList.Insert(int index, object value) => throw new NotSupportedException();
        void IList.Remove(object value) => throw new NotSupportedException();
        void IList.RemoveAt(int index) => throw new NotSupportedException();
    }

    public class DataGridViewSelectedCellCollection : IList
    {
        readonly List<DataGridViewCell> list;
        internal DataGridViewSelectedCellCollection(List<DataGridViewCell> list) { this.list = list; }
        public int Count => list.Count;
        public DataGridViewCell this[int index] => list[index];
        object IList.this[int index] { get => list[index]; set => throw new NotSupportedException(); }
        public bool Contains(DataGridViewCell cell) => list.Contains(cell);
        public IEnumerator GetEnumerator() => list.ToArray().GetEnumerator();
        void ICollection.CopyTo(Array array, int index) => ((ICollection)list).CopyTo(array, index);
        public bool IsReadOnly => true;
        bool IList.IsFixedSize => true;
        bool ICollection.IsSynchronized => false;
        object ICollection.SyncRoot => this;
        int IList.Add(object value) => throw new NotSupportedException();
        void IList.Clear() => throw new NotSupportedException();
        bool IList.Contains(object value) => value is DataGridViewCell c && Contains(c);
        int IList.IndexOf(object value) => value is DataGridViewCell c ? list.IndexOf(c) : -1;
        void IList.Insert(int index, object value) => throw new NotSupportedException();
        void IList.Remove(object value) => throw new NotSupportedException();
        void IList.RemoveAt(int index) => throw new NotSupportedException();
    }

    public class DataGridViewSelectedColumnCollection : List<DataGridViewColumn> { }
}
