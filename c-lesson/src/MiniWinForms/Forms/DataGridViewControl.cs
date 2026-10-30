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
    /// <summary>
    /// Tablo kontrolü. Bağsız (Rows.Add) ve veriye bağlı (DataSource) kullanımı destekler.
    /// Visual Studio'daki davranışlar korunur: Rows.Count en alttaki "yeni satır"ı da sayar,
    /// form açılınca ilk hücre geçerli hücre olur, yeni satır silinemez vb.
    /// </summary>
    public class DataGridView : Control, ISupportInitialize
    {
        internal readonly List<DataGridViewRow> rowList = new List<DataGridViewRow>();
        internal DataGridViewCell editingCell;
        string editText;
        readonly DataGridViewColumnCollection columns;
        readonly DataGridViewRowCollection rows;
        DataGridViewRow newRow;
        bool allowAdd = true, allowDelete = true, readOnly, multiSelect = true, rowHeadersVisible = true, colHeadersVisible = true;
        bool autoGenerate = true, shown, settingCurrent, rebinding;
        int initDepth;
        DataGridViewSelectionMode selectionMode = DataGridViewSelectionMode.RowHeaderSelect;
        DataGridViewAutoSizeColumnsMode autoSizeColumns = DataGridViewAutoSizeColumnsMode.None;
        DataGridViewEditMode editMode = DataGridViewEditMode.EditOnKeystrokeOrF2;
        BorderStyle borderStyle = BorderStyle.FixedSingle;
        int curRow = -1, curCol = -1;
        readonly List<DataGridViewCell> selCells = new List<DataGridViewCell>();
        int columnHeadersHeight = 23, rowHeadersWidth = 41;
        Color backgroundColor = Color.FromArgb(171, 171, 171), gridColor = Color.FromArgb(160, 160, 160);
        DataGridViewColumn sortedColumn;
        SortOrder sortOrder;

        object dataSource;
        string dataMember = "";
        CurrencyManager manager;
        IList boundList;
        PropertyDescriptorCollection props;

        DataGridViewCellStyle defaultStyle, rowsDefaultStyle, altStyle, colHeaderStyle, rowHeaderStyle;

        public DataGridView()
        {
            columns = new DataGridViewColumnCollection(this);
            rows = new DataGridViewRowCollection(this);
            Ui.Set(Id, "borderstyle", borderStyle.ToString());
            Invalidate(true);
        }

        internal override string UiType => "DataGridView";
        protected override Size DefaultSize => new Size(240, 150);

        // ================================================================ ISupportInitialize

        public void BeginInit() => initDepth++;
        public void EndInit() { if (initDepth > 0) initDepth--; Invalidate(true); }

        // ================================================================ temel özellikler

        public DataGridViewColumnCollection Columns => columns;
        public DataGridViewRowCollection Rows => rows;

        public int ColumnCount
        {
            get => columns.Count;
            set
            {
                if (value < 0) throw new ArgumentOutOfRangeException(nameof(value), "ColumnCount negatif olamaz.");
                if (IsBound) throw new InvalidOperationException("Veriye bağlı (DataSource) bir tabloda ColumnCount değiştirilemez.");
                while (columns.Count < value) columns.Add(new DataGridViewTextBoxColumn());
                while (columns.Count > value) columns.RemoveAt(columns.Count - 1);
            }
        }

        public int RowCount
        {
            get => rowList.Count;
            set
            {
                if (value < 0) throw new ArgumentOutOfRangeException(nameof(value), "RowCount negatif olamaz.");
                if (IsBound) throw new InvalidOperationException("Veriye bağlı (DataSource) bir tabloda RowCount değiştirilemez.");
                if (columns.Count == 0) columns.Add(new DataGridViewTextBoxColumn());
                if (newRow != null && value < 1) throw new ArgumentException("AllowUserToAddRows açıkken RowCount en az 1 olmalıdır (yeni satır).");
                while (rowList.Count < value) rows.Add();
                while (rowList.Count > value) RemoveRowCore(rowList[NewRowIndexOrCount - 1]);
            }
        }

        public DataGridViewCell this[int columnIndex, int rowIndex] => rows[rowIndex].Cells[columnIndex];
        public DataGridViewCell this[string columnName, int rowIndex] => rows[rowIndex].Cells[columnName];

        public bool ReadOnly { get => readOnly; set { readOnly = value; Invalidate(true); } }
        public bool MultiSelect { get => multiSelect; set { multiSelect = value; if (!value) KeepOneSelection(); Invalidate(false); } }

        public bool AllowUserToAddRows
        {
            get => allowAdd;
            set
            {
                if (allowAdd == value) return;
                allowAdd = value;
                SyncNewRow();
            }
        }

        public bool AllowUserToDeleteRows { get => allowDelete; set => allowDelete = value; }
        public bool AllowUserToResizeColumns { get; set; } = true;
        public bool AllowUserToResizeRows { get; set; } = true;
        public bool AllowUserToOrderColumns { get; set; }
        public bool RowHeadersVisible { get => rowHeadersVisible; set { rowHeadersVisible = value; Invalidate(true); } }
        public bool ColumnHeadersVisible { get => colHeadersVisible; set { colHeadersVisible = value; Invalidate(true); } }
        public int ColumnHeadersHeight { get => columnHeadersHeight; set { columnHeadersHeight = Math.Max(4, value); Invalidate(true); } }
        public int RowHeadersWidth { get => rowHeadersWidth; set { rowHeadersWidth = Math.Max(4, value); Invalidate(true); } }
        public DataGridViewColumnHeadersHeightSizeMode ColumnHeadersHeightSizeMode { get; set; } = DataGridViewColumnHeadersHeightSizeMode.EnableResizing;
        public DataGridViewRowHeadersWidthSizeMode RowHeadersWidthSizeMode { get; set; } = DataGridViewRowHeadersWidthSizeMode.EnableResizing;
        public DataGridViewAutoSizeRowsMode AutoSizeRowsMode { get; set; }
        public DataGridViewCellBorderStyle CellBorderStyle { get; set; } = DataGridViewCellBorderStyle.Single;
        public DataGridViewHeaderBorderStyle ColumnHeadersBorderStyle { get; set; } = DataGridViewHeaderBorderStyle.Raised;
        public DataGridViewHeaderBorderStyle RowHeadersBorderStyle { get; set; } = DataGridViewHeaderBorderStyle.Raised;
        public DataGridViewClipboardCopyMode ClipboardCopyMode { get; set; } = DataGridViewClipboardCopyMode.EnableWithAutoHeaderText;
        public ScrollBars ScrollBars { get; set; } = ScrollBars.Both;
        public bool EnableHeadersVisualStyles { get; set; } = true;
        public bool ShowCellToolTips { get; set; } = true;
        public bool ShowCellErrors { get; set; } = true;
        public bool ShowRowErrors { get; set; } = true;
        public bool ShowEditingIcon { get; set; } = true;
        public bool StandardTab { get; set; }
        public bool VirtualMode { get; set; }
        public DataGridViewRow RowTemplate { get; set; } = new DataGridViewRow();
        public Control EditingControl => null;
        public Panel EditingPanel => null;

        public DataGridViewEditMode EditMode { get => editMode; set { editMode = value; Invalidate(false); } }

        public BorderStyle BorderStyle { get => borderStyle; set { borderStyle = value; Ui.Set(Id, "borderstyle", value.ToString()); } }
        public Color BackgroundColor { get => backgroundColor; set { backgroundColor = value; Invalidate(true); } }
        public Color GridColor { get => gridColor; set { gridColor = value; Invalidate(true); } }

        public DataGridViewSelectionMode SelectionMode
        {
            get => selectionMode;
            set
            {
                if (selectionMode == value) return;
                selectionMode = value;
                // Seçim biçimi değişince seçim sıfırlanır; geçerli hücre (varsa) seçilir.
                ClearSelectionCore();
                SelectCurrent();
                Invalidate(false);
            }
        }

        public DataGridViewAutoSizeColumnsMode AutoSizeColumnsMode
        {
            get => autoSizeColumns;
            set { autoSizeColumns = value; Invalidate(true); }
        }

        DataGridViewCellStyle Style(ref DataGridViewCellStyle field, bool structural)
        {
            if (field == null)
            {
                field = new DataGridViewCellStyle();
                field.Changed += () => Invalidate(structural);
            }
            return field;
        }

        DataGridViewCellStyle SetStyle(ref DataGridViewCellStyle field, DataGridViewCellStyle value)
        {
            field = value ?? new DataGridViewCellStyle();
            field.Changed += () => Invalidate(true);
            Invalidate(true);
            return field;
        }

        public DataGridViewCellStyle DefaultCellStyle { get => Style(ref defaultStyle, true); set => SetStyle(ref defaultStyle, value); }
        public DataGridViewCellStyle RowsDefaultCellStyle { get => Style(ref rowsDefaultStyle, false); set => SetStyle(ref rowsDefaultStyle, value); }
        public DataGridViewCellStyle AlternatingRowsDefaultCellStyle { get => Style(ref altStyle, false); set => SetStyle(ref altStyle, value); }
        public DataGridViewCellStyle ColumnHeadersDefaultCellStyle { get => Style(ref colHeaderStyle, true); set => SetStyle(ref colHeaderStyle, value); }
        public DataGridViewCellStyle RowHeadersDefaultCellStyle { get => Style(ref rowHeaderStyle, true); set => SetStyle(ref rowHeaderStyle, value); }

        public int NewRowIndex => newRow?.index ?? -1;
        internal int NewRowIndexOrCount => newRow != null ? newRow.index : rowList.Count;
        public DataGridViewColumn SortedColumn => sortedColumn;
        public SortOrder SortOrder => sortOrder;
        public bool IsCurrentCellInEditMode => editingCell != null;
        public bool IsCurrentCellDirty => false;
        public bool IsCurrentRowDirty => false;

        public int FirstDisplayedScrollingRowIndex
        {
            get => rowList.Count > 0 ? 0 : -1;
            set { if (value >= 0 && value < rowList.Count) Ui.Call(Id, "scrollto", value.ToString(CultureInfo.InvariantCulture)); }
        }

        public DataGridViewCell FirstDisplayedCell
        {
            get => rowList.Count > 0 && FirstVisibleColumn() >= 0 ? rowList[0].Cells[FirstVisibleColumn()] : null;
            set { if (value != null) FirstDisplayedScrollingRowIndex = value.RowIndex; }
        }

        public override Font Font { get => base.Font; set { base.Font = value; Invalidate(true); } }

        // ================================================================ geçerli hücre

        public DataGridViewCell CurrentCell
        {
            get => curRow >= 0 && curCol >= 0 && curRow < rowList.Count && curCol < columns.Count ? rowList[curRow].cellList[curCol] : null;
            set
            {
                if (value == null)
                {
                    SetCurrentCellCore(-1, -1, true);
                    return;
                }
                if (value.DataGridView != this) throw new ArgumentException("Hücre bu tabloya ait değil.");
                if (!columns[value.ColumnIndex].Visible) throw new InvalidOperationException("Görünmeyen (Visible = false) bir sütundaki hücre geçerli hücre yapılamaz.");
                SetCurrentCellCore(value.ColumnIndex, value.RowIndex, true);
            }
        }

        public DataGridViewRow CurrentRow => curRow >= 0 && curRow < rowList.Count ? rowList[curRow] : null;
        public Point CurrentCellAddress => new Point(curCol, curRow);

        int FirstVisibleColumn()
        {
            for (int i = 0; i < columns.Count; i++) if (columns[i].Visible) return i;
            return -1;
        }

        int LastVisibleColumn()
        {
            for (int i = columns.Count - 1; i >= 0; i--) if (columns[i].Visible) return i;
            return -1;
        }

        /// <summary>Geçerli hücreyi değiştirir; Leave/Enter olaylarını sırasıyla çalıştırır. select: seçimi yeni hücreye taşı.</summary>
        internal bool SetCurrentCellCore(int col, int row, bool select)
        {
            if (row >= rowList.Count) row = rowList.Count - 1;
            if (row < 0 || col < 0) { row = -1; col = -1; }
            if (col == curCol && row == curRow)
            {
                if (select) { ClearSelectionCore(); SelectCurrent(); RaiseSelectionChanged(); }
                return true;
            }
            if (settingCurrent) return false;
            settingCurrent = true;
            try
            {
                if (editingCell != null) EndEdit();
                int oldRow = curRow, oldCol = curCol;
                bool rowChanged = row != oldRow;
                if (oldRow >= 0 && oldCol >= 0 && oldRow < rowList.Count)
                {
                    OnCellLeave(new DataGridViewCellEventArgs(oldCol, oldRow));
                    if (rowChanged) OnRowLeave(new DataGridViewCellEventArgs(oldCol, oldRow));
                    if (rowChanged) OnRowValidating(new DataGridViewCellCancelEventArgs(oldCol, oldRow));
                    if (rowChanged) OnRowValidated(new DataGridViewCellEventArgs(oldCol, oldRow));
                }
                curRow = row;
                curCol = col;
                if (rowChanged && manager != null && row >= 0 && !rowList[row].IsNewRow && manager.Position != row)
                {
                    rebinding = true;
                    try { manager.Position = row; }
                    finally { rebinding = false; }
                }
                if (select) { ClearSelectionCore(); SelectCurrent(); }
                if (row >= 0)
                {
                    if (rowChanged) OnRowEnter(new DataGridViewCellEventArgs(col, row));
                    OnCellEnter(new DataGridViewCellEventArgs(col, row));
                }
                OnCurrentCellChanged(EventArgs.Empty);
                if (select) RaiseSelectionChanged();
                Invalidate(false);
                if (row >= 0) Ui.Call(Id, "scrollto", row.ToString(CultureInfo.InvariantCulture));
                return true;
            }
            finally { settingCurrent = false; }
        }

        /// <summary>Form açıldığında (WinForms'ta tutamaç oluşunca) ilk hücre geçerli hücre olur.</summary>
        internal override void OnFormShownInternal()
        {
            base.OnFormShownInternal();
            shown = true;
            MakeFirstCellCurrent();
        }

        void MakeFirstCellCurrent()
        {
            if (!shown || curRow >= 0 || rowList.Count == 0) return;
            int c = FirstVisibleColumn();
            if (c < 0) return;
            int r = manager != null && manager.Position >= 0 && manager.Position < rowList.Count ? manager.Position : 0;
            SetCurrentCellCore(c, r, true);
        }

        // ================================================================ seçim

        bool pendingSelectionChanged;

        void RaiseSelectionChanged()
        {
            pendingSelectionChanged = false;
            OnSelectionChanged(EventArgs.Empty);
        }

        bool RowMode => selectionMode == DataGridViewSelectionMode.FullRowSelect;

        void SelectCurrent()
        {
            if (curRow < 0 || curCol < 0) return;
            var row = rowList[curRow];
            if (RowMode) row.SetSelectedFlag(true);
            else AddCell(row.cellList[curCol]);
        }

        void AddCell(DataGridViewCell c)
        {
            if (!selCells.Contains(c)) selCells.Add(c);
            c.selected = true;
        }

        void ClearSelectionCore()
        {
            foreach (var r in rowList) r.SetSelectedFlag(false);
            foreach (var c in selCells) c.selected = false;
            selCells.Clear();
        }

        void KeepOneSelection()
        {
            var keep = CurrentCell;
            ClearSelectionCore();
            if (keep != null) SelectCurrent();
        }

        public void ClearSelection()
        {
            bool any = selCells.Count > 0 || rowList.Exists(r => r.Selected);
            ClearSelectionCore();
            Invalidate(false);
            if (any) RaiseSelectionChanged();
        }

        public void ClearSelection(int columnIndexException, int rowIndexException, bool selectExceptionElement)
        {
            ClearSelectionCore();
            if (selectExceptionElement && rowIndexException >= 0 && rowIndexException < rowList.Count)
            {
                if (RowMode || columnIndexException < 0) rowList[rowIndexException].SetSelectedFlag(true);
                else AddCell(rowList[rowIndexException].cellList[columnIndexException]);
            }
            Invalidate(false);
            RaiseSelectionChanged();
        }

        public void SelectAll()
        {
            if (!multiSelect) return;
            if (RowMode || selectionMode == DataGridViewSelectionMode.RowHeaderSelect && RowMode)
                foreach (var r in rowList) r.SetSelectedFlag(true);
            else
                foreach (var r in rowList) foreach (var c in r.cellList) AddCell(c);
            Invalidate(false);
            RaiseSelectionChanged();
        }

        internal void SetRowSelected(DataGridViewRow row, bool value, bool raise)
        {
            if (row.Selected == value) return;
            if (value && !multiSelect) ClearSelectionCore();
            row.SetSelectedFlag(value);
            if (!value) foreach (var c in row.cellList) { c.selected = false; selCells.Remove(c); }
            Invalidate(false);
            if (raise) RaiseSelectionChanged();
        }

        internal void SetCellSelected(DataGridViewCell cell, bool value)
        {
            if (RowMode)
            {
                SetRowSelected(cell.OwningRow, value, true);
                return;
            }
            if (cell.selected == value) return;
            if (value && !multiSelect) ClearSelectionCore();
            if (value) AddCell(cell);
            else { cell.selected = false; selCells.Remove(cell); }
            Invalidate(false);
            RaiseSelectionChanged();
        }

        /// <summary>Seçili satırlar (en son seçilen önce).</summary>
        public DataGridViewSelectedRowCollection SelectedRows
        {
            get
            {
                var list = new List<DataGridViewRow>();
                for (int i = rowList.Count - 1; i >= 0; i--) if (rowList[i].Selected) list.Add(rowList[i]);
                return new DataGridViewSelectedRowCollection(list);
            }
        }

        public DataGridViewSelectedCellCollection SelectedCells
        {
            get
            {
                var list = new List<DataGridViewCell>();
                for (int i = rowList.Count - 1; i >= 0; i--)
                {
                    var r = rowList[i];
                    for (int c = r.cellList.Count - 1; c >= 0; c--)
                    {
                        var cell = r.cellList[c];
                        if ((r.Selected && columns[c].Visible) || cell.selected) list.Add(cell);
                    }
                }
                return new DataGridViewSelectedCellCollection(list);
            }
        }

        public DataGridViewSelectedColumnCollection SelectedColumns => new DataGridViewSelectedColumnCollection();

        public bool AreAllCellsSelected(bool includeInvisibleCells)
        {
            foreach (var r in rowList) foreach (var c in r.cellList) if (!c.Selected) return false;
            return rowList.Count > 0;
        }

        public int GetCellCount(DataGridViewElementStates includeFilter) =>
            includeFilter == DataGridViewElementStates.Selected ? SelectedCells.Count : rowList.Count * columns.Count;

        // ================================================================ sütun / satır işlemleri (koleksiyonlardan)

        internal void OnColumnInserted(DataGridViewColumn column, int index)
        {
            foreach (var r in rowList) r.AddCellFor(column, index);
            if (curCol >= index && curCol >= 0) curCol++;
            SyncNewRow();
            Invalidate(true);
            OnColumnAdded(new DataGridViewColumnEventArgs(column));
            MakeFirstCellCurrent();
        }

        internal void OnColumnRemoved(DataGridViewColumn column, int index)
        {
            if (editingCell != null && editingCell.Col == index) CancelEditCore();
            foreach (var r in rowList) r.RemoveCellAt(index);
            foreach (var c in selCells.ToArray()) if (c.OwningRow == null || !c.OwningRow.cellList.Contains(c)) selCells.Remove(c);
            if (sortedColumn == column) { sortedColumn = null; sortOrder = SortOrder.None; }
            if (columns.Count == 0)
            {
                // Son sütun silinince tüm satırlar da silinir.
                foreach (var r in rowList) { r.DataGridView = null; r.index = -1; }
                rowList.Clear();
                newRow = null;
                curRow = curCol = -1;
                selCells.Clear();
            }
            else if (curCol == index)
            {
                curCol = Math.Min(index, columns.Count - 1);
            }
            else if (curCol > index) curCol--;
            Invalidate(true);
            OnColumnRemoved(new DataGridViewColumnEventArgs(column));
        }

        internal void CheckCanAddRows()
        {
            if (IsBound) throw new InvalidOperationException("Veriye bağlı (DataSource ayarlı) bir DataGridView'e Rows.Add ile satır eklenemez. Kaydı veri kaynağına (ör. tabloya ya da BindingSource'a) ekleyin.");
            if (columns.Count == 0) throw new InvalidOperationException("Sütun olmadan satır eklenemez. Önce ColumnCount veya Columns.Add ile sütunları oluşturun.");
        }

        internal void NormalizeCells(DataGridViewRow row)
        {
            if (row.cellList.Count == 0) row.CreateCells(this);
            for (int i = row.cellList.Count; i < columns.Count; i++) row.AddCellFor(columns[i], i);
            for (int i = 0; i < row.cellList.Count; i++) { row.cellList[i].OwningRow = row; row.cellList[i].Col = i; }
        }

        void Reindex(int from)
        {
            for (int i = Math.Max(0, from); i < rowList.Count; i++) rowList[i].index = i;
        }

        internal int InsertRowCore(int index, DataGridViewRow row)
        {
            index = Math.Max(0, Math.Min(index, NewRowIndexOrCount));
            row.DataGridView = this;
            row.IsNewRow = false;
            foreach (var c in row.cellList) c.OwningRow = row;
            rowList.Insert(index, row);
            Reindex(index);
            if (curRow >= index) curRow++;
            Invalidate(false);
            OnRowsAdded(new DataGridViewRowsAddedEventArgs(index, 1));
            MakeFirstCellCurrent();
            return index;
        }

        internal void RemoveRowCore(DataGridViewRow row)
        {
            if (row.IsNewRow) throw new InvalidOperationException("Kaydedilmemiş yeni satır silinemez.");
            int index = row.index;
            if (editingCell != null && editingCell.OwningRow == row) CancelEditCore();
            if (IsBound)
            {
                // Veriye bağlı tabloda kayıt veri kaynağından silinir; satırlar listeden yeniden oluşur.
                manager.RemoveAt(index);
                return;
            }
            bool wasCurrent = curRow == index;
            bool wasSelected = row.Selected || row.cellList.Exists(c => c.selected);
            rowList.RemoveAt(index);
            foreach (var c in row.cellList) { c.selected = false; selCells.Remove(c); }
            row.SetSelectedFlag(false);
            row.DataGridView = null;
            row.index = -1;
            Reindex(index);
            OnRowsRemoved(new DataGridViewRowsRemovedEventArgs(index, 1));
            if (curRow > index) curRow--;
            else if (wasCurrent)
            {
                // Geçerli satır silinince bir alttaki satır (yoksa üstteki) geçerli ve seçili olur.
                curRow = -1;
                int col = curCol;
                curCol = -1;
                if (rowList.Count > 0) SetCurrentCellCore(col >= 0 && col < columns.Count ? col : FirstVisibleColumn(), Math.Min(index, rowList.Count - 1), true);
                else { OnCurrentCellChanged(EventArgs.Empty); RaiseSelectionChanged(); }
                wasSelected = false;
            }
            if (wasSelected) RaiseSelectionChanged();
            Invalidate(false);
        }

        internal void ClearRowsCore()
        {
            if (editingCell != null) CancelEditCore();
            int count = NewRowIndexOrCount;
            if (count == 0) return;
            bool hadCurrent = curRow >= 0;
            foreach (var r in rowList.ToArray())
            {
                if (r == newRow) continue;
                r.DataGridView = null;
                r.index = -1;
                r.SetSelectedFlag(false);
            }
            rowList.RemoveAll(r => r != newRow);
            selCells.Clear();
            Reindex(0);
            curRow = curCol = -1;
            Invalidate(false);
            OnRowsRemoved(new DataGridViewRowsRemovedEventArgs(0, count));
            if (hadCurrent)
            {
                OnCurrentCellChanged(EventArgs.Empty);
                MakeFirstCellCurrent();
                if (curRow < 0) RaiseSelectionChanged();
            }
        }

        /// <summary>AllowUserToAddRows ve sütun durumuna göre en alttaki yeni satırı ekler/kaldırır.</summary>
        void SyncNewRow()
        {
            bool want = allowAdd && columns.Count > 0 && (!IsBound || (boundList is IBindingList bl && bl.AllowNew));
            if (want && newRow == null)
            {
                var r = new DataGridViewRow();
                r.CreateCells(this);
                r.DataGridView = this;
                r.IsNewRow = true;
                r.index = rowList.Count;
                rowList.Add(r);
                newRow = r;
                Invalidate(false);
                MakeFirstCellCurrent();
            }
            else if (!want && newRow != null)
            {
                if (curRow == newRow.index)
                {
                    curRow = -1;
                    int col = curCol;
                    curCol = -1;
                    if (rowList.Count > 1) SetCurrentCellCore(col, rowList.Count - 2, true);
                }
                rowList.Remove(newRow);
                newRow.DataGridView = null;
                newRow = null;
                Invalidate(false);
            }
        }

        /// <summary>Yeni satıra veri girilince satır gerçek satıra dönüşür, altına yeni bir boş satır eklenir.</summary>
        DataGridViewRow CommitNewRow()
        {
            var row = newRow;
            if (IsBound)
            {
                manager.AddNew();
                int pos = manager.Position;
                return pos >= 0 && pos < rowList.Count ? rowList[pos] : null;
            }
            row.IsNewRow = false;
            newRow = null;
            SyncNewRow();
            OnRowsAdded(new DataGridViewRowsAddedEventArgs(row.index, 1));
            OnUserAddedRow(new DataGridViewRowEventArgs(newRow ?? row));
            return row;
        }

        // ================================================================ değerler

        PropertyDescriptor PropFor(int col)
        {
            if (props == null || col < 0 || col >= columns.Count) return null;
            string name = columns[col].DataPropertyName;
            if (string.IsNullOrEmpty(name)) return null;
            return props.Find(name, true);
        }

        internal object GetCellValue(DataGridViewRow row, int col)
        {
            if (row == null || col < 0 || col >= row.cellList.Count) return null;
            if (row.BoundItem != null)
            {
                var pd = PropFor(col);
                if (pd != null) return pd.GetValue(row.BoundItem);
            }
            return row.cellList[col].LocalValue;
        }

        internal void SetCellValue(DataGridViewRow row, int col, object value, bool raise)
        {
            if (row == null || col < 0 || col >= row.cellList.Count) return;
            if (row.BoundItem != null && PropFor(col) is PropertyDescriptor pd)
            {
                object v = value == null || value is string s && s.Length == 0 && pd.PropertyType != typeof(string)
                    ? (row.BoundItem is DataRowView ? DBNull.Value : null)
                    : ListHelper.Convert(value, pd.PropertyType);
                pd.SetValue(row.BoundItem, v);
                if (row.BoundItem is DataRowView drv && drv.IsEdit && !drv.IsNew && row.index != curRow) drv.EndEdit();
            }
            else row.cellList[col].LocalValue = value;
            Invalidate(false);
            if (raise) OnCellValueChanged(new DataGridViewCellEventArgs(col, row.index));
        }

        public void UpdateCellValue(int columnIndex, int rowIndex) => Invalidate(false);
        public void InvalidateCell(int columnIndex, int rowIndex) => Invalidate(false);
        public void InvalidateCell(DataGridViewCell cell) => Invalidate(false);
        public void InvalidateRow(int rowIndex) => Invalidate(false);
        public void InvalidateColumn(int columnIndex) => Invalidate(false);
        public void NotifyCurrentCellDirty(bool dirty) { }
        public bool CommitEdit(DataGridViewDataErrorContexts context) { EndEdit(); return true; }
        public void AutoResizeColumns() => Invalidate(true);
        public void AutoResizeColumns(DataGridViewAutoSizeColumnsMode mode) => Invalidate(true);
        public void AutoResizeColumn(int columnIndex) => Invalidate(true);
        public void AutoResizeColumn(int columnIndex, DataGridViewAutoSizeColumnMode mode) => Invalidate(true);
        public void AutoResizeRows() { }
        public void AutoResizeRows(DataGridViewAutoSizeRowsMode mode) { }
        public void AutoResizeRow(int rowIndex) { }
        public void AutoResizeColumnHeadersHeight() { }

        /// <summary>Hücrenin ekranda görünen metni (Format, CellFormatting dahil).</summary>
        internal string FormatCell(DataGridViewRow row, int col, out DataGridViewCellStyle style)
        {
            style = null;
            object value = GetCellValue(row, col);
            var column = columns[col];
            if (Events[EvCellFormatting] != null && row.index >= 0)
            {
                var st = new DataGridViewCellStyle(InheritedStyle(row, col));
                var e = new DataGridViewCellFormattingEventArgs(col, row.index, value, typeof(string), st);
                OnCellFormatting(e);
                style = e.CellStyle;
                value = e.Value;
            }
            if (column is DataGridViewCheckBoxColumn)
            {
                if (value is bool b) return b ? "1" : "0";
                if (value is CheckState cs) return cs == CheckState.Checked ? "1" : cs == CheckState.Indeterminate ? "2" : "0";
                if (value == null || value is DBNull) return "";
                return string.Equals(Convert.ToString(value, CultureInfo.InvariantCulture), "true", StringComparison.OrdinalIgnoreCase) || Convert.ToString(value) == "1" ? "1" : "0";
            }
            if (column is DataGridViewButtonColumn bc && bc.UseColumnTextForButtonValue) return bc.Text ?? "";
            if (column is DataGridViewLinkColumn lc && lc.UseColumnTextForLinkValue) return lc.Text ?? "";
            if (value is Image) return "";
            if (value == null || value is DBNull)
            {
                var nv = (style ?? column.StyleOrNull)?.NullValue;
                return nv is string ns ? ns : Convert.ToString(nv, CultureInfo.CurrentCulture) ?? "";
            }
            string fmt = style?.Format;
            if (string.IsNullOrEmpty(fmt)) fmt = InheritedFormat(row, col);
            if (!string.IsNullOrEmpty(fmt) && value is IFormattable f) return f.ToString(fmt, CultureInfo.CurrentCulture);
            if (value is DateTime dt) return dt.TimeOfDay == TimeSpan.Zero ? dt.ToString("d", CultureInfo.CurrentCulture) : dt.ToString(CultureInfo.CurrentCulture);
            if (value is bool bv) return bv ? "True" : "False";
            return Convert.ToString(value, CultureInfo.CurrentCulture) ?? "";
        }

        string InheritedFormat(DataGridViewRow row, int col)
        {
            string f = row.cellList[col].StyleOrNull?.Format;
            if (!string.IsNullOrEmpty(f)) return f;
            f = row.StyleOrNull?.Format;
            if (!string.IsNullOrEmpty(f)) return f;
            f = columns[col].StyleOrNull?.Format;
            if (!string.IsNullOrEmpty(f)) return f;
            return defaultStyle?.Format;
        }

        /// <summary>Hücrenin sonuçta geçerli olan stili (hücre &gt; satır &gt; alternatif &gt; satırlar &gt; sütun &gt; tablo).</summary>
        internal DataGridViewCellStyle InheritedStyle(DataGridViewRow row, int col)
        {
            var s = new DataGridViewCellStyle
            {
                BackColor = SystemColors.Window,
                ForeColor = SystemColors.ControlText,
                SelectionBackColor = SystemColors.Highlight,
                SelectionForeColor = SystemColors.HighlightText,
                Font = Font,
                Alignment = DataGridViewContentAlignment.MiddleLeft,
            };
            s.ApplyStyle(defaultStyle);
            if (col >= 0 && col < columns.Count) s.ApplyStyle(columns[col].StyleOrNull);
            s.ApplyStyle(rowsDefaultStyle);
            if (row != null && row.index % 2 == 1) s.ApplyStyle(altStyle);
            if (row != null) s.ApplyStyle(row.StyleOrNull);
            if (row != null && col >= 0 && col < row.cellList.Count) s.ApplyStyle(row.cellList[col].StyleOrNull);
            return s;
        }

        // ================================================================ düzenleme

        public bool BeginEdit(bool selectAll)
        {
            var cell = CurrentCell;
            if (cell == null || cell.ReadOnly || editingCell != null) return editingCell != null;
            return StartEdit(cell, null);
        }

        bool StartEdit(DataGridViewCell cell, string initial)
        {
            if (cell.ReadOnly || columns[cell.Col] is DataGridViewButtonColumn || columns[cell.Col] is DataGridViewLinkColumn || columns[cell.Col] is DataGridViewImageColumn) return false;
            var e = new DataGridViewCellCancelEventArgs(cell.Col, cell.RowIndex);
            OnCellBeginEdit(e);
            if (e.Cancel) return false;
            editingCell = cell;
            string text = initial ?? FormatCell(cell.OwningRow, cell.Col, out _);
            editText = text;
            Ui.Call(Id, "edit", cell.RowIndex.ToString(CultureInfo.InvariantCulture) + "," + cell.Col.ToString(CultureInfo.InvariantCulture) + "," + (initial != null ? "1" : "0") + "\n" + text);
            return true;
        }

        public bool EndEdit() => EndEdit(DataGridViewDataErrorContexts.Commit);

        /// <summary>Düzenlenen hücredeki metni (tarayıcı her tuşta bildirir) hücreye yazar ve düzenleyiciyi kapatır.</summary>
        public bool EndEdit(DataGridViewDataErrorContexts context)
        {
            var cell = editingCell;
            if (cell == null) return true;
            Ui.Call(Id, "closeeditor");
            if (cell.OwningRow == null || cell.RowIndex < 0) { editingCell = null; return true; }
            return CommitFromUi(cell.RowIndex, cell.Col, editText ?? "");
        }

        public bool CancelEdit()
        {
            if (editingCell == null) return true;
            CancelEditCore();
            return true;
        }

        void CancelEditCore()
        {
            var cell = editingCell;
            editingCell = null;
            Ui.Call(Id, "closeeditor");
            if (cell?.OwningRow != null && cell.RowIndex >= 0) OnCellEndEdit(new DataGridViewCellEventArgs(cell.Col, cell.RowIndex));
        }

        /// <summary>Tarayıcıdaki düzenleyiciden gelen değeri hücreye yazar.</summary>
        bool CommitFromUi(int r, int c, string text)
        {
            var cell = editingCell;
            editingCell = null;
            if (r < 0 || r >= rowList.Count || c < 0 || c >= columns.Count) return true;
            var row = rowList[r];
            var column = columns[c];
            string old = FormatCell(row, c, out _);
            if (text == old && !row.IsNewRow)
            {
                OnCellEndEdit(new DataGridViewCellEventArgs(c, r));
                return true;
            }
            if (row.IsNewRow && text.Length == 0)
            {
                OnCellEndEdit(new DataGridViewCellEventArgs(c, r));
                return true;
            }
            var ve = new DataGridViewCellValidatingEventArgs(c, r, text);
            OnCellValidating(ve);
            if (ve.Cancel)
            {
                editingCell = cell;
                editText = text;
                Ui.Call(Id, "edit", r.ToString(CultureInfo.InvariantCulture) + "," + c.ToString(CultureInfo.InvariantCulture) + ",1\n" + text);
                return false;
            }
            object value = text;
            Type target = column.ValueType ?? PropFor(c)?.PropertyType;
            if (target != null && target != typeof(string) && target != typeof(object))
            {
                try { value = text.Length == 0 ? null : ListHelper.Convert(text, target); }
                catch (Exception ex)
                {
                    var de = new DataGridViewDataErrorEventArgs(ex, c, r, DataGridViewDataErrorContexts.Parsing | DataGridViewDataErrorContexts.Commit);
                    if (Events[EvDataError] != null) OnDataError(de);
                    else MessageBox.Show("Hücreye girilen değer geçersiz: \"" + text + "\"\n" + ex.Message, "DataGridView", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    OnCellEndEdit(new DataGridViewCellEventArgs(c, r));
                    return false;
                }
            }
            if (row.IsNewRow)
            {
                if (IsBound)
                {
                    var nr = CommitNewRow();
                    if (nr == null) return true;
                    SetCellValue(nr, c, value, true);
                    if (nr.BoundItem is IEditableObject eo) eo.EndEdit();
                    OnCellValidated(new DataGridViewCellEventArgs(c, nr.index));
                    OnCellEndEdit(new DataGridViewCellEventArgs(c, nr.index));
                    OnUserAddedRow(new DataGridViewRowEventArgs(newRow ?? nr));
                    return true;
                }
                row = CommitNewRow();
            }
            SetCellValue(row, c, value, true);
            OnCellValidated(new DataGridViewCellEventArgs(c, row.index));
            OnCellEndEdit(new DataGridViewCellEventArgs(c, row.index));
            return true;
        }

        // ================================================================ sıralama

        public void Sort(DataGridViewColumn dataGridViewColumn, ListSortDirection direction)
        {
            if (dataGridViewColumn == null) throw new ArgumentNullException(nameof(dataGridViewColumn));
            if (editingCell != null) EndEdit();
            int col = dataGridViewColumn.Index;
            if (IsBound)
            {
                var pd = PropFor(col);
                if (pd == null) throw new InvalidOperationException("Bu sütun bir veri alanına bağlı olmadığı için sıralanamaz.");
                if (dataSource is BindingSource bs) bs.Sort = pd.Name + (direction == ListSortDirection.Descending ? " DESC" : " ASC");
                else if (boundList is IBindingList bl && bl.SupportsSorting) bl.ApplySort(pd, direction);
                else throw new InvalidOperationException("Veri kaynağı sıralamayı desteklemiyor.");
            }
            else
            {
                var current = CurrentRow;
                var data = rowList.FindAll(r => !r.IsNewRow);
                var keyed = new List<(DataGridViewRow row, int pos)>();
                for (int i = 0; i < data.Count; i++) keyed.Add((data[i], i));
                int sign = direction == ListSortDirection.Descending ? -1 : 1;
                keyed.Sort((a, b) =>
                {
                    int r = CompareValues(a.row.cellList[col].LocalValue, b.row.cellList[col].LocalValue);
                    return r != 0 ? sign * r : a.pos.CompareTo(b.pos);
                });
                for (int i = 0; i < keyed.Count; i++) rowList[i] = keyed[i].row;
                Reindex(0);
                if (current != null) curRow = current.index;
            }
            if (sortedColumn != null) sortedColumn.HeaderCell.SortGlyphDirection = SortOrder.None;
            sortedColumn = dataGridViewColumn;
            sortOrder = direction == ListSortDirection.Descending ? SortOrder.Descending : SortOrder.Ascending;
            dataGridViewColumn.HeaderCell.SortGlyphDirection = sortOrder;
            Invalidate(true);
            OnSorted(EventArgs.Empty);
        }

        public void Sort(IComparer comparer)
        {
            if (IsBound) throw new InvalidOperationException("Veriye bağlı tabloda Sort(IComparer) kullanılamaz.");
            var data = rowList.FindAll(r => !r.IsNewRow);
            var current = CurrentRow;
            data.Sort((a, b) => comparer.Compare(a, b));
            for (int i = 0; i < data.Count; i++) rowList[i] = data[i];
            Reindex(0);
            if (current != null) curRow = current.index;
            Invalidate(false);
            OnSorted(EventArgs.Empty);
        }

        static int CompareValues(object a, object b)
        {
            if (a is DBNull) a = null;
            if (b is DBNull) b = null;
            if (a == null) return b == null ? 0 : -1;
            if (b == null) return 1;
            if (a.GetType() == b.GetType() && a is IComparable ca) return ca.CompareTo(b);
            return string.Compare(Convert.ToString(a, CultureInfo.CurrentCulture), Convert.ToString(b, CultureInfo.CurrentCulture), CultureInfo.CurrentCulture, CompareOptions.None);
        }

        // ================================================================ veri bağlama

        internal bool IsBound => dataSource != null && boundList != null;

        public object DataSource
        {
            get => dataSource;
            set
            {
                if (ReferenceEquals(dataSource, value)) return;
                if (value != null && value is not IList && value is not IListSource && value is not IBindingList && value is not BindingSource)
                    throw new ArgumentException("DataSource için geçersiz değer. Bir tablo (DataTable), DataSet, BindingSource ya da liste verin.", nameof(value));
                dataSource = value;
                Rebind();
                OnDataSourceChanged(EventArgs.Empty);
            }
        }

        public string DataMember
        {
            get => dataMember;
            set
            {
                value ??= "";
                if (dataMember == value) return;
                dataMember = value;
                Rebind();
                OnDataMemberChanged(EventArgs.Empty);
            }
        }

        public bool AutoGenerateColumns { get => autoGenerate; set => autoGenerate = value; }

        void Rebind()
        {
            if (manager != null)
            {
                manager.ListChanged -= OnManagerListChanged;
                manager.PositionChanged -= OnManagerPositionChanged;
            }
            if (editingCell != null) CancelEditCore();
            manager = null;
            boundList = null;
            props = null;
            // Önceki bağlı satırlar kaldırılır.
            foreach (var r in rowList) { r.DataGridView = null; r.index = -1; }
            rowList.Clear();
            newRow = null;
            selCells.Clear();
            curRow = curCol = -1;
            if (dataSource != null)
            {
                manager = BindingContext.Get(dataSource, dataMember);
                if (manager != null)
                {
                    boundList = manager.List ?? new List<object>();
                    manager.ListChanged += OnManagerListChanged;
                    manager.PositionChanged += OnManagerPositionChanged;
                }
            }
            else
            {
                // Bağlantı kalkınca otomatik oluşturulmuş sütunlar silinir.
                for (int i = columns.Count - 1; i >= 0; i--) if (columns[i].AutoGenerated) columns.RemoveAt(i);
            }
            RefreshColumns();
            RebuildRows();
            SyncNewRow();
            Invalidate(true);
            OnDataBindingComplete(new DataGridViewBindingCompleteEventArgs(ListChangedType.Reset));
            MakeFirstCellCurrent();
        }

        void RefreshColumns()
        {
            if (boundList == null) return;
            props = ListHelper.GetProperties(boundList);
            if (!autoGenerate) return;
            for (int i = columns.Count - 1; i >= 0; i--)
                if (columns[i].AutoGenerated && props.Find(columns[i].DataPropertyName, true) == null) columns.RemoveAt(i);
            foreach (PropertyDescriptor pd in props)
            {
                bool exists = false;
                foreach (DataGridViewColumn c in columns.All)
                    if (string.Equals(c.DataPropertyName, pd.Name, StringComparison.OrdinalIgnoreCase)) { exists = true; break; }
                if (exists) continue;
                if (typeof(IList).IsAssignableFrom(pd.PropertyType) && pd.PropertyType != typeof(byte[])) continue;
                var t = Nullable.GetUnderlyingType(pd.PropertyType) ?? pd.PropertyType;
                DataGridViewColumn col = t == typeof(bool) ? new DataGridViewCheckBoxColumn()
                    : t == typeof(byte[]) || typeof(Image).IsAssignableFrom(t) ? new DataGridViewImageColumn()
                    : new DataGridViewTextBoxColumn();
                col.Name = pd.Name;
                col.HeaderText = pd.DisplayName;
                col.DataPropertyName = pd.Name;
                col.ValueType = pd.PropertyType;
                col.AutoGenerated = true;
                if (pd.IsReadOnly) col.ReadOnly = true;
                columns.Add(col);
            }
        }

        void RebuildRows()
        {
            var old = new Dictionary<object, DataGridViewRow>(ReferenceEqualityComparer.Instance);
            foreach (var r in rowList) if (r.BoundItem != null) old[r.BoundItem] = r;
            var currentItem = CurrentRow?.BoundItem;
            rowList.Clear();
            newRow = null;
            if (boundList != null)
            {
                for (int i = 0; i < boundList.Count; i++)
                {
                    var item = boundList[i];
                    if (item == null || !old.TryGetValue(item, out var row))
                    {
                        row = new DataGridViewRow();
                        row.CreateCells(this);
                        row.BoundItem = item;
                    }
                    else NormalizeCells(row);
                    row.DataGridView = this;
                    row.IsNewRow = false;
                    row.index = i;
                    rowList.Add(row);
                }
            }
            foreach (var r in old.Values) if (r.index >= rowList.Count || r.index < 0 || rowList[r.index] != r) { r.DataGridView = null; r.SetSelectedFlag(false); }
            selCells.RemoveAll(c => c.OwningRow?.DataGridView != this);
        }

        void OnManagerListChanged(object sender, ListChangedEventArgs e)
        {
            if (e.ListChangedType == ListChangedType.ItemChanged)
            {
                Invalidate(false);
                return;
            }
            if (editingCell != null) { editingCell = null; Ui.Call(Id, "closeeditor"); }
            int oldCount = rowList.Count;
            if (e.ListChangedType is ListChangedType.PropertyDescriptorAdded or ListChangedType.PropertyDescriptorDeleted or ListChangedType.PropertyDescriptorChanged)
                RefreshColumns();
            else if (e.ListChangedType == ListChangedType.Reset)
                RefreshColumns();
            boundList = manager.List;
            RebuildRows();
            SyncNewRow();
            int pos = manager.Position;
            // Geçerli satırı veri kaynağının konumuyla eşitle
            if (shown && rowList.Count > 0)
            {
                int target = pos >= 0 && pos < rowList.Count ? pos : Math.Min(Math.Max(curRow, 0), rowList.Count - 1);
                int col = curCol >= 0 && curCol < columns.Count ? curCol : FirstVisibleColumn();
                curRow = -1; curCol = -1;
                rebinding = true;
                try { SetCurrentCellCore(col, target, true); }
                finally { rebinding = false; }
            }
            else if (rowList.Count == 0 || !shown) { curRow = curCol = -1; }
            Invalidate(true);
            if (e.ListChangedType == ListChangedType.ItemAdded) OnRowsAdded(new DataGridViewRowsAddedEventArgs(Math.Max(0, e.NewIndex), 1));
            else if (e.ListChangedType == ListChangedType.ItemDeleted) OnRowsRemoved(new DataGridViewRowsRemovedEventArgs(Math.Max(0, e.NewIndex), 1));
            OnDataBindingComplete(new DataGridViewBindingCompleteEventArgs(e.ListChangedType));
        }

        void OnManagerPositionChanged(object sender, EventArgs e)
        {
            if (rebinding || settingCurrent) return;
            int pos = manager.Position;
            if (pos < 0 || pos >= rowList.Count || pos == curRow) return;
            int col = curCol >= 0 ? curCol : FirstVisibleColumn();
            if (col < 0) return;
            rebinding = true;
            try { SetCurrentCellCore(col, pos, true); }
            finally { rebinding = false; }
        }

        // ================================================================ silme (kullanıcı Delete tuşu)

        void UserDelete()
        {
            if (!allowDelete || readOnly || editingCell != null) return;
            var targets = new List<DataGridViewRow>();
            foreach (DataGridViewRow r in SelectedRows) if (!r.IsNewRow) targets.Add(r);
            if (targets.Count == 0) return;
            foreach (var r in targets)
            {
                if (r.DataGridView != this) continue;
                var e = new DataGridViewRowCancelEventArgs(r);
                OnUserDeletingRow(e);
                if (e.Cancel) continue;
                if (r.DataGridView != this) continue;
                RemoveRowCore(r);
                OnUserDeletedRow(new DataGridViewRowEventArgs(r));
            }
        }

        // ================================================================ çizim verisi

        internal void Invalidate(bool structure)
        {
            if (initDepth > 0) return;
            Ui.SetLazy(Id, "grid", BuildJson);
        }

        string BuildJson()
        {
            var sb = new StringBuilder(256 + rowList.Count * 64);
            sb.Append("{\"cols\":[");
            for (int i = 0; i < columns.Count; i++)
            {
                var c = columns[i];
                if (i > 0) sb.Append(',');
                var mode = c.InheritedAutoSizeMode;
                string m = mode == DataGridViewAutoSizeColumnMode.Fill ? "fill"
                    : mode is DataGridViewAutoSizeColumnMode.AllCells or DataGridViewAutoSizeColumnMode.AllCellsExceptHeader or DataGridViewAutoSizeColumnMode.DisplayedCells or DataGridViewAutoSizeColumnMode.DisplayedCellsExceptHeader or DataGridViewAutoSizeColumnMode.ColumnHeader ? "auto" : "";
                sb.Append("{\"h\":").Append(Ui.J(c.HeaderText))
                  .Append(",\"w\":").Append(c.Width)
                  .Append(",\"fw\":").Append(Ui.Num(c.FillWeight))
                  .Append(",\"m\":\"").Append(m).Append('"')
                  .Append(",\"k\":\"").Append(c.Kind).Append('"');
                if (!c.Visible) sb.Append(",\"hid\":1");
                if (c.ReadOnly) sb.Append(",\"ro\":1");
                if (c.SortMode != DataGridViewColumnSortMode.NotSortable) sb.Append(",\"so\":1");
                if (c.HeaderCell.SortGlyphDirection != SortOrder.None) sb.Append(",\"sg\":").Append(c.HeaderCell.SortGlyphDirection == SortOrder.Ascending ? 1 : 2);
                if (c.StyleOrNull != null && !c.StyleOrNull.IsEmpty) sb.Append(",\"st\":").Append(c.StyleOrNull.Json());
                if (c is DataGridViewComboBoxColumn cc) sb.Append(",\"items\":").Append(Ui.JArray(cc.ItemTexts()));
                sb.Append('}');
            }
            sb.Append("],\"rows\":[");
            DataGridViewCellStyle baseStyle = new DataGridViewCellStyle();
            baseStyle.ApplyStyle(rowsDefaultStyle);
            for (int r = 0; r < rowList.Count; r++)
            {
                var row = rowList[r];
                if (r > 0) sb.Append(',');
                sb.Append("{\"v\":[");
                string[] cellStyles = null;
                for (int c = 0; c < row.cellList.Count; c++)
                {
                    if (c > 0) sb.Append(',');
                    string text;
                    DataGridViewCellStyle fs = null;
                    if (row.IsNewRow) text = "";
                    else
                    {
                        try { text = FormatCell(row, c, out fs); }
                        catch (Exception ex) { Ui.ReportException(ex); text = ""; }
                    }
                    sb.Append(Ui.J(text));
                    var cs = row.cellList[c].StyleOrNull;
                    if (fs != null || cs != null && !cs.IsEmpty)
                    {
                        cellStyles ??= new string[row.cellList.Count];
                        var merged = new DataGridViewCellStyle();
                        merged.ApplyStyle(cs);
                        if (fs != null)
                        {
                            // CellFormatting içinde değiştirilen stil (yalnızca farklı olan alanlar)
                            var inh = InheritedStyle(row, c);
                            if (fs.BackColor != inh.BackColor) merged.BackColor = fs.BackColor;
                            if (fs.ForeColor != inh.ForeColor) merged.ForeColor = fs.ForeColor;
                            if (fs.SelectionBackColor != inh.SelectionBackColor) merged.SelectionBackColor = fs.SelectionBackColor;
                            if (fs.SelectionForeColor != inh.SelectionForeColor) merged.SelectionForeColor = fs.SelectionForeColor;
                            if (fs.Font != inh.Font) merged.Font = fs.Font;
                            if (fs.Alignment != inh.Alignment) merged.Alignment = fs.Alignment;
                        }
                        if (!merged.IsEmpty) cellStyles[c] = merged.Json();
                    }
                }
                sb.Append(']');
                var rs = new DataGridViewCellStyle(baseStyle);
                if (r % 2 == 1) rs.ApplyStyle(altStyle);
                rs.ApplyStyle(row.StyleOrNull);
                if (!rs.IsEmpty) sb.Append(",\"st\":").Append(rs.Json());
                if (cellStyles != null)
                {
                    sb.Append(",\"cs\":[");
                    for (int c = 0; c < cellStyles.Length; c++) { if (c > 0) sb.Append(','); sb.Append(cellStyles[c] ?? "null"); }
                    sb.Append(']');
                }
                if (row.Selected) sb.Append(",\"sel\":1");
                else
                {
                    bool any = false;
                    for (int c = 0; c < row.cellList.Count; c++)
                        if (row.cellList[c].selected) { sb.Append(any ? "," : ",\"sc\":[").Append(c); any = true; }
                    if (any) sb.Append(']');
                }
                if (row.IsNewRow) sb.Append(",\"n\":1");
                if (!row.Visible) sb.Append(",\"hid\":1");
                if (row.ReadOnly && !readOnly) sb.Append(",\"ro\":1");
                if (row.Height != 22) sb.Append(",\"ht\":").Append(row.Height);
                if (!string.IsNullOrEmpty(row.HeaderCell.LocalValue as string)) sb.Append(",\"hd\":").Append(Ui.J((string)row.HeaderCell.LocalValue));
                sb.Append('}');
            }
            sb.Append("],\"cur\":[").Append(curRow).Append(',').Append(curCol).Append(']');
            sb.Append(",\"rh\":").Append(rowHeadersVisible ? rowHeadersWidth : 0);
            sb.Append(",\"ch\":").Append(colHeadersVisible ? columnHeadersHeight : 0);
            if (readOnly) sb.Append(",\"ro\":1");
            sb.Append(",\"bg\":").Append(Ui.J(Ui.Color(backgroundColor)));
            sb.Append(",\"gc\":").Append(Ui.J(Ui.Color(gridColor)));
            var dsJson = new DataGridViewCellStyle();
            dsJson.ApplyStyle(defaultStyle);
            if (!dsJson.IsEmpty) sb.Append(",\"ds\":").Append(dsJson.Json());
            if (colHeaderStyle != null && !colHeaderStyle.IsEmpty) sb.Append(",\"hs\":").Append(colHeaderStyle.Json());
            if (rowHeaderStyle != null && !rowHeaderStyle.IsEmpty) sb.Append(",\"rs\":").Append(rowHeaderStyle.Json());
            if (selectionMode == DataGridViewSelectionMode.FullRowSelect) sb.Append(",\"full\":1");
            if (editMode == DataGridViewEditMode.EditProgrammatically) sb.Append(",\"noedit\":1");
            else if (editMode == DataGridViewEditMode.EditOnEnter) sb.Append(",\"editenter\":1");
            if (!EnableHeadersVisualStyles) sb.Append(",\"flat\":1");
            return sb.Append('}').ToString();
        }

        // ================================================================ tarayıcı olayları

        internal override string HandleUiEvent(string evt, string data)
        {
            switch (evt)
            {
                case "cell": HandleCellMouse(data, false); return "";
                case "celldbl": HandleCellMouse(data, true); return "";
                case "beginedit":
                {
                    // veri: r,c\nilk karakter (varsa)
                    int nl = data.IndexOf('\n');
                    string head = nl >= 0 ? data.Substring(0, nl) : data;
                    string initial = nl >= 0 ? data.Substring(nl + 1) : null;
                    var p = head.Split(',');
                    int r = Int(p, 0), c = Int(p, 1);
                    if (r < 0 || r >= rowList.Count || c < 0 || c >= columns.Count || readOnly) return "";
                    if (r != curRow || c != curCol) SetCurrentCellCore(c, r, true);
                    var cell = CurrentCell;
                    if (cell == null || editingCell != null) return "";
                    return StartEdit(cell, initial) ? "ok" : "";
                }
                case "edittext": editText = data; return "";
                case "commit":
                {
                    // Tarayıcı düzenleyiciyi kendisi kapattı (Enter, Tab, odak kaybı)
                    int nl = data.IndexOf('\n');
                    var p = (nl >= 0 ? data.Substring(0, nl) : data).Split(',');
                    int r = Int(p, 0), c = Int(p, 1);
                    if (editingCell == null || editingCell.RowIndex != r || editingCell.Col != c) return "";
                    return CommitFromUi(r, c, nl >= 0 ? data.Substring(nl + 1) : "") ? "" : "reopen";
                }
                case "canceledit":
                {
                    var cell = editingCell;
                    editingCell = null;
                    if (cell?.OwningRow != null && cell.RowIndex >= 0) OnCellEndEdit(new DataGridViewCellEventArgs(cell.Col, cell.RowIndex));
                    return "";
                }
                case "check":
                {
                    var p = data.Split(',');
                    ToggleCheck(Int(p, 0), Int(p, 1));
                    return "";
                }
                case "gridkey": return HandleGridKey(data);
            }
            return base.HandleUiEvent(evt, data);
        }

        static int Int(string[] p, int i) => i < p.Length && int.TryParse(p[i], NumberStyles.Integer, CultureInfo.InvariantCulture, out int v) ? v : -1;

        void HandleCellMouse(string data, bool dbl)
        {
            // veri: r,c,ctrl,shift,düğme,x,y,içerik
            var p = data.Split(',');
            int r = Int(p, 0), c = Int(p, 1);
            bool ctrl = Int(p, 2) == 1, shift = Int(p, 3) == 1, content = Int(p, 7) == 1;
            int btn = Math.Max(0, Int(p, 4));
            var buttons = btn == 2 ? MouseButtons.Right : btn == 1 ? MouseButtons.Middle : MouseButtons.Left;
            var m = new MouseEventArgs(buttons, dbl ? 2 : 1, Math.Max(0, Int(p, 5)), Math.Max(0, Int(p, 6)), 0);
            if (r >= rowList.Count || c >= columns.Count) return;
            var cm = new DataGridViewCellMouseEventArgs(c, r, m.X, m.Y, m);

            if (dbl)
            {
                if (r == -1 && c >= 0) OnColumnHeaderMouseDoubleClick(cm);
                if (c == -1 && r >= 0) OnRowHeaderMouseDoubleClick(cm);
                OnCellDoubleClick(new DataGridViewCellEventArgs(c, r));
                if (content) OnCellContentDoubleClick(new DataGridViewCellEventArgs(c, r));
                OnCellMouseDoubleClick(cm);
                if (r >= 0 && c >= 0 && editingCell == null && editMode != DataGridViewEditMode.EditProgrammatically && !readOnly)
                {
                    var cell = rowList[r].cellList[c];
                    if (!(columns[c] is DataGridViewCheckBoxColumn)) StartEdit(cell, null);
                }
                return;
            }

            OnCellMouseDown(cm);
            if (r >= 0)
            {
                if (buttons == MouseButtons.Left || CurrentRow == null || !rowList[r].Selected)
                    ClickSelect(r, c, ctrl, shift);
            }
            else if (c >= 0)
            {
                if (editingCell != null) EndEdit();
            }
            else if (multiSelect) SelectAll();

            OnCellMouseUp(cm);
            if (r == -1 && c >= 0)
            {
                OnColumnHeaderMouseClick(cm);
                var col = columns[c];
                if (buttons == MouseButtons.Left && col.SortMode == DataGridViewColumnSortMode.Automatic && (!IsBound || PropFor(c) != null))
                {
                    var dir = sortedColumn == col && sortOrder == SortOrder.Ascending ? ListSortDirection.Descending : ListSortDirection.Ascending;
                    Sort(col, dir);
                }
            }
            if (c == -1 && r >= 0) OnRowHeaderMouseClick(cm);
            OnCellClick(new DataGridViewCellEventArgs(c, r));
            if (content && r >= 0 && c >= 0) OnCellContentClick(new DataGridViewCellEventArgs(c, r));
            OnCellMouseClick(cm);
        }

        void ClickSelect(int r, int c, bool ctrl, bool shift)
        {
            int col = c >= 0 ? c : (curCol >= 0 ? curCol : FirstVisibleColumn());
            if (col < 0) return;
            bool rowSel = RowMode || (c == -1 && selectionMode == DataGridViewSelectionMode.RowHeaderSelect);
            int anchor = curRow;
            int anchorCol = curCol;
            if (!SetCurrentCellCore(col, r, false)) return;
            if (curRow != r) return;
            var row = rowList[r];
            if (multiSelect && shift && anchor >= 0)
            {
                ClearSelectionCore();
                int a = Math.Min(anchor, r), b = Math.Max(anchor, r);
                if (rowSel) for (int i = a; i <= b; i++) rowList[i].SetSelectedFlag(true);
                else
                {
                    int ca = Math.Min(anchorCol, col), cb = Math.Max(anchorCol, col);
                    for (int i = a; i <= b; i++) for (int k = Math.Max(0, ca); k <= cb; k++) AddCell(rowList[i].cellList[k]);
                }
            }
            else if (multiSelect && ctrl)
            {
                if (rowSel) row.SetSelectedFlag(!row.Selected);
                else
                {
                    var cell = row.cellList[col];
                    if (cell.selected) { cell.selected = false; selCells.Remove(cell); } else AddCell(cell);
                }
            }
            else
            {
                ClearSelectionCore();
                if (rowSel) row.SetSelectedFlag(true);
                else AddCell(row.cellList[col]);
            }
            Invalidate(false);
            RaiseSelectionChanged();
        }

        void ToggleCheck(int r, int c)
        {
            if (r < 0 || r >= rowList.Count || c < 0 || c >= columns.Count) return;
            if (columns[c] is not DataGridViewCheckBoxColumn cbc) return;
            var row = rowList[r];
            var cell = row.cellList[c];
            if (cell.ReadOnly || readOnly) return;
            var cur = GetCellValue(row, c);
            bool on = cur is bool b ? b : cur is CheckState cs ? cs == CheckState.Checked : cbc.TrueValue != null && Equals(cur, cbc.TrueValue);
            object next = !on;
            if (cbc.TrueValue != null && cbc.FalseValue != null) next = on ? cbc.FalseValue : cbc.TrueValue;
            var be = new DataGridViewCellCancelEventArgs(c, r);
            OnCellBeginEdit(be);
            if (be.Cancel) return;
            if (row.IsNewRow) row = CommitNewRow();
            if (row == null) return;
            SetCellValue(row, c, next, true);
            if (row.BoundItem is DataRowView drv && drv.IsNew) drv.EndEdit();
            OnCellEndEdit(new DataGridViewCellEventArgs(c, row.index));
        }

        string HandleGridKey(string data)
        {
            var keys = ParseKeys(data);
            var e = new KeyEventArgs(keys);
            var form = FindForm();
            if (form != null && form.KeyPreview) form.RaiseKeyDown(e);
            if (!e.Handled) OnKeyDown(e);
            if (e.Handled || e.SuppressKeyPress) return "handled";
            var code = keys & Keys.KeyCode;
            bool shift = (keys & Keys.Shift) != 0, ctrl = (keys & Keys.Control) != 0;
            int r = curRow, c = curCol;
            if (rowList.Count == 0) return "";
            if (r < 0) r = 0;
            if (c < 0) c = FirstVisibleColumn();
            switch (code)
            {
                case Keys.Up: r = ctrl ? 0 : r - 1; break;
                case Keys.Down: r = ctrl ? rowList.Count - 1 : r + 1; break;
                case Keys.PageUp: r -= 10; break;
                case Keys.PageDown: r += 10; break;
                case Keys.Left: c = PrevVisible(c); break;
                case Keys.Right: c = NextVisible(c); break;
                case Keys.Home: c = FirstVisibleColumn(); if (ctrl) r = 0; break;
                case Keys.End: c = LastVisibleColumn(); if (ctrl) r = rowList.Count - 1; break;
                case Keys.Enter: r = r + 1; if (r >= rowList.Count) return "handled"; break;
                case Keys.Tab:
                    if (StandardTab) return "";
                    if (shift) { int p = PrevVisible(c); if (p == c) { if (r == 0) return ""; r--; c = LastVisibleColumn(); } else c = p; }
                    else { int n = NextVisible(c); if (n == c) { if (r >= rowList.Count - 1) return ""; r++; c = FirstVisibleColumn(); } else c = n; }
                    break;
                case Keys.Delete: UserDelete(); return "handled";
                case Keys.F2:
                    if (editMode != DataGridViewEditMode.EditProgrammatically && editMode != DataGridViewEditMode.EditOnKeystroke && CurrentCell != null && !readOnly) StartEdit(CurrentCell, null);
                    return "handled";
                case Keys.Space:
                    if (CurrentCell != null && columns[curCol] is DataGridViewCheckBoxColumn) { ToggleCheck(curRow, curCol); return "handled"; }
                    if (shift && RowMode == false && selectionMode == DataGridViewSelectionMode.RowHeaderSelect && CurrentRow != null) { SetRowSelected(CurrentRow, true, true); return "handled"; }
                    return "";
                case Keys.A:
                    if (ctrl) { SelectAll(); return "handled"; }
                    return "";
                default: return "";
            }
            r = Math.Max(0, Math.Min(rowList.Count - 1, r));
            if (c < 0) return "handled";
            int anchor = curRow;
            SetCurrentCellCore(c, r, !(shift && multiSelect && code is Keys.Up or Keys.Down));
            if (shift && multiSelect && code is Keys.Up or Keys.Down && anchor >= 0)
            {
                if (RowMode) rowList[r].SetSelectedFlag(true);
                else AddCell(rowList[r].cellList[c]);
                Invalidate(false);
                RaiseSelectionChanged();
            }
            return "handled";
        }

        int NextVisible(int c)
        {
            for (int i = c + 1; i < columns.Count; i++) if (columns[i].Visible) return i;
            return c;
        }

        int PrevVisible(int c)
        {
            for (int i = c - 1; i >= 0; i--) if (columns[i].Visible) return i;
            return c;
        }

        // ================================================================ olaylar

        static readonly object EvCellClick = new object(), EvCellContentClick = new object(), EvCellDoubleClick = new object(), EvCellContentDoubleClick = new object(),
            EvCellMouseClick = new object(), EvCellMouseDoubleClick = new object(), EvCellMouseDown = new object(), EvCellMouseUp = new object(),
            EvCellValueChanged = new object(), EvCellBeginEdit = new object(), EvCellEndEdit = new object(), EvCellEnter = new object(), EvCellLeave = new object(),
            EvCellFormatting = new object(), EvCellValidating = new object(), EvCellValidated = new object(), EvSelectionChanged = new object(),
            EvCurrentCellChanged = new object(), EvRowEnter = new object(), EvRowLeave = new object(), EvRowValidating = new object(), EvRowValidated = new object(),
            EvRowsAdded = new object(), EvRowsRemoved = new object(), EvUserAddedRow = new object(), EvUserDeletingRow = new object(), EvUserDeletedRow = new object(),
            EvColumnHeaderMouseClick = new object(), EvColumnHeaderMouseDoubleClick = new object(), EvRowHeaderMouseClick = new object(), EvRowHeaderMouseDoubleClick = new object(),
            EvDataBindingComplete = new object(), EvDataError = new object(), EvSorted = new object(), EvColumnAdded = new object(), EvColumnRemoved = new object(),
            EvDataSourceChanged = new object(), EvDataMemberChanged = new object();

        void On<T>(object key, T e) where T : EventArgs => Ev.Fire(Events[key], this, e);

        public event DataGridViewCellEventHandler CellClick { add => Events.AddHandler(EvCellClick, value); remove => Events.RemoveHandler(EvCellClick, value); }
        public event DataGridViewCellEventHandler CellContentClick { add => Events.AddHandler(EvCellContentClick, value); remove => Events.RemoveHandler(EvCellContentClick, value); }
        public event DataGridViewCellEventHandler CellDoubleClick { add => Events.AddHandler(EvCellDoubleClick, value); remove => Events.RemoveHandler(EvCellDoubleClick, value); }
        public event DataGridViewCellEventHandler CellContentDoubleClick { add => Events.AddHandler(EvCellContentDoubleClick, value); remove => Events.RemoveHandler(EvCellContentDoubleClick, value); }
        public event DataGridViewCellMouseEventHandler CellMouseClick { add => Events.AddHandler(EvCellMouseClick, value); remove => Events.RemoveHandler(EvCellMouseClick, value); }
        public event DataGridViewCellMouseEventHandler CellMouseDoubleClick { add => Events.AddHandler(EvCellMouseDoubleClick, value); remove => Events.RemoveHandler(EvCellMouseDoubleClick, value); }
        public event DataGridViewCellMouseEventHandler CellMouseDown { add => Events.AddHandler(EvCellMouseDown, value); remove => Events.RemoveHandler(EvCellMouseDown, value); }
        public event DataGridViewCellMouseEventHandler CellMouseUp { add => Events.AddHandler(EvCellMouseUp, value); remove => Events.RemoveHandler(EvCellMouseUp, value); }
        public event DataGridViewCellEventHandler CellValueChanged { add => Events.AddHandler(EvCellValueChanged, value); remove => Events.RemoveHandler(EvCellValueChanged, value); }
        public event DataGridViewCellCancelEventHandler CellBeginEdit { add => Events.AddHandler(EvCellBeginEdit, value); remove => Events.RemoveHandler(EvCellBeginEdit, value); }
        public event DataGridViewCellEventHandler CellEndEdit { add => Events.AddHandler(EvCellEndEdit, value); remove => Events.RemoveHandler(EvCellEndEdit, value); }
        public event DataGridViewCellEventHandler CellEnter { add => Events.AddHandler(EvCellEnter, value); remove => Events.RemoveHandler(EvCellEnter, value); }
        public event DataGridViewCellEventHandler CellLeave { add => Events.AddHandler(EvCellLeave, value); remove => Events.RemoveHandler(EvCellLeave, value); }
        public event DataGridViewCellFormattingEventHandler CellFormatting { add { Events.AddHandler(EvCellFormatting, value); Invalidate(false); } remove => Events.RemoveHandler(EvCellFormatting, value); }
        public event DataGridViewCellValidatingEventHandler CellValidating { add => Events.AddHandler(EvCellValidating, value); remove => Events.RemoveHandler(EvCellValidating, value); }
        public event DataGridViewCellEventHandler CellValidated { add => Events.AddHandler(EvCellValidated, value); remove => Events.RemoveHandler(EvCellValidated, value); }
        public event EventHandler SelectionChanged { add => Events.AddHandler(EvSelectionChanged, value); remove => Events.RemoveHandler(EvSelectionChanged, value); }
        public event EventHandler CurrentCellChanged { add => Events.AddHandler(EvCurrentCellChanged, value); remove => Events.RemoveHandler(EvCurrentCellChanged, value); }
        public event DataGridViewCellEventHandler RowEnter { add => Events.AddHandler(EvRowEnter, value); remove => Events.RemoveHandler(EvRowEnter, value); }
        public event DataGridViewCellEventHandler RowLeave { add => Events.AddHandler(EvRowLeave, value); remove => Events.RemoveHandler(EvRowLeave, value); }
        public event DataGridViewCellCancelEventHandler RowValidating { add => Events.AddHandler(EvRowValidating, value); remove => Events.RemoveHandler(EvRowValidating, value); }
        public event DataGridViewCellEventHandler RowValidated { add => Events.AddHandler(EvRowValidated, value); remove => Events.RemoveHandler(EvRowValidated, value); }
        public event DataGridViewRowsAddedEventHandler RowsAdded { add => Events.AddHandler(EvRowsAdded, value); remove => Events.RemoveHandler(EvRowsAdded, value); }
        public event DataGridViewRowsRemovedEventHandler RowsRemoved { add => Events.AddHandler(EvRowsRemoved, value); remove => Events.RemoveHandler(EvRowsRemoved, value); }
        public event DataGridViewRowEventHandler UserAddedRow { add => Events.AddHandler(EvUserAddedRow, value); remove => Events.RemoveHandler(EvUserAddedRow, value); }
        public event DataGridViewRowCancelEventHandler UserDeletingRow { add => Events.AddHandler(EvUserDeletingRow, value); remove => Events.RemoveHandler(EvUserDeletingRow, value); }
        public event DataGridViewRowEventHandler UserDeletedRow { add => Events.AddHandler(EvUserDeletedRow, value); remove => Events.RemoveHandler(EvUserDeletedRow, value); }
        public event DataGridViewCellMouseEventHandler ColumnHeaderMouseClick { add => Events.AddHandler(EvColumnHeaderMouseClick, value); remove => Events.RemoveHandler(EvColumnHeaderMouseClick, value); }
        public event DataGridViewCellMouseEventHandler ColumnHeaderMouseDoubleClick { add => Events.AddHandler(EvColumnHeaderMouseDoubleClick, value); remove => Events.RemoveHandler(EvColumnHeaderMouseDoubleClick, value); }
        public event DataGridViewCellMouseEventHandler RowHeaderMouseClick { add => Events.AddHandler(EvRowHeaderMouseClick, value); remove => Events.RemoveHandler(EvRowHeaderMouseClick, value); }
        public event DataGridViewCellMouseEventHandler RowHeaderMouseDoubleClick { add => Events.AddHandler(EvRowHeaderMouseDoubleClick, value); remove => Events.RemoveHandler(EvRowHeaderMouseDoubleClick, value); }
        public event DataGridViewBindingCompleteEventHandler DataBindingComplete { add => Events.AddHandler(EvDataBindingComplete, value); remove => Events.RemoveHandler(EvDataBindingComplete, value); }
        public event DataGridViewDataErrorEventHandler DataError { add => Events.AddHandler(EvDataError, value); remove => Events.RemoveHandler(EvDataError, value); }
        public event EventHandler Sorted { add => Events.AddHandler(EvSorted, value); remove => Events.RemoveHandler(EvSorted, value); }
        public event DataGridViewColumnEventHandler ColumnAdded { add => Events.AddHandler(EvColumnAdded, value); remove => Events.RemoveHandler(EvColumnAdded, value); }
        public event DataGridViewColumnEventHandler ColumnRemoved { add => Events.AddHandler(EvColumnRemoved, value); remove => Events.RemoveHandler(EvColumnRemoved, value); }
        public event EventHandler DataSourceChanged { add => Events.AddHandler(EvDataSourceChanged, value); remove => Events.RemoveHandler(EvDataSourceChanged, value); }
        public event EventHandler DataMemberChanged { add => Events.AddHandler(EvDataMemberChanged, value); remove => Events.RemoveHandler(EvDataMemberChanged, value); }

        protected virtual void OnCellClick(DataGridViewCellEventArgs e) => On(EvCellClick, e);
        protected virtual void OnCellContentClick(DataGridViewCellEventArgs e) => On(EvCellContentClick, e);
        protected virtual void OnCellDoubleClick(DataGridViewCellEventArgs e) => On(EvCellDoubleClick, e);
        protected virtual void OnCellContentDoubleClick(DataGridViewCellEventArgs e) => On(EvCellContentDoubleClick, e);
        protected virtual void OnCellMouseClick(DataGridViewCellMouseEventArgs e) => On(EvCellMouseClick, e);
        protected virtual void OnCellMouseDoubleClick(DataGridViewCellMouseEventArgs e) => On(EvCellMouseDoubleClick, e);
        protected virtual void OnCellMouseDown(DataGridViewCellMouseEventArgs e) => On(EvCellMouseDown, e);
        protected virtual void OnCellMouseUp(DataGridViewCellMouseEventArgs e) => On(EvCellMouseUp, e);
        protected virtual void OnCellValueChanged(DataGridViewCellEventArgs e) => On(EvCellValueChanged, e);
        protected virtual void OnCellBeginEdit(DataGridViewCellCancelEventArgs e) => On(EvCellBeginEdit, e);
        protected virtual void OnCellEndEdit(DataGridViewCellEventArgs e) => On(EvCellEndEdit, e);
        protected virtual void OnCellEnter(DataGridViewCellEventArgs e) => On(EvCellEnter, e);
        protected virtual void OnCellLeave(DataGridViewCellEventArgs e) => On(EvCellLeave, e);
        protected virtual void OnCellFormatting(DataGridViewCellFormattingEventArgs e) => On(EvCellFormatting, e);
        protected virtual void OnCellValidating(DataGridViewCellValidatingEventArgs e) => On(EvCellValidating, e);
        protected virtual void OnCellValidated(DataGridViewCellEventArgs e) => On(EvCellValidated, e);
        protected virtual void OnSelectionChanged(EventArgs e) => On(EvSelectionChanged, e);
        protected virtual void OnCurrentCellChanged(EventArgs e) => On(EvCurrentCellChanged, e);
        protected virtual void OnRowEnter(DataGridViewCellEventArgs e) => On(EvRowEnter, e);
        protected virtual void OnRowLeave(DataGridViewCellEventArgs e) => On(EvRowLeave, e);
        protected virtual void OnRowValidating(DataGridViewCellCancelEventArgs e) => On(EvRowValidating, e);
        protected virtual void OnRowValidated(DataGridViewCellEventArgs e) => On(EvRowValidated, e);
        protected virtual void OnRowsAdded(DataGridViewRowsAddedEventArgs e) => On(EvRowsAdded, e);
        protected virtual void OnRowsRemoved(DataGridViewRowsRemovedEventArgs e) => On(EvRowsRemoved, e);
        protected virtual void OnUserAddedRow(DataGridViewRowEventArgs e) => On(EvUserAddedRow, e);
        protected virtual void OnUserDeletingRow(DataGridViewRowCancelEventArgs e) => On(EvUserDeletingRow, e);
        protected virtual void OnUserDeletedRow(DataGridViewRowEventArgs e) => On(EvUserDeletedRow, e);
        protected virtual void OnColumnHeaderMouseClick(DataGridViewCellMouseEventArgs e) => On(EvColumnHeaderMouseClick, e);
        protected virtual void OnColumnHeaderMouseDoubleClick(DataGridViewCellMouseEventArgs e) => On(EvColumnHeaderMouseDoubleClick, e);
        protected virtual void OnRowHeaderMouseClick(DataGridViewCellMouseEventArgs e) => On(EvRowHeaderMouseClick, e);
        protected virtual void OnRowHeaderMouseDoubleClick(DataGridViewCellMouseEventArgs e) => On(EvRowHeaderMouseDoubleClick, e);
        protected virtual void OnDataBindingComplete(DataGridViewBindingCompleteEventArgs e) => On(EvDataBindingComplete, e);
        protected virtual void OnDataError(DataGridViewDataErrorEventArgs e) => On(EvDataError, e);
        protected virtual void OnSorted(EventArgs e) => On(EvSorted, e);
        protected virtual void OnColumnAdded(DataGridViewColumnEventArgs e) => On(EvColumnAdded, e);
        protected virtual void OnColumnRemoved(DataGridViewColumnEventArgs e) => On(EvColumnRemoved, e);
        protected virtual void OnDataSourceChanged(EventArgs e) => On(EvDataSourceChanged, e);
        protected virtual void OnDataMemberChanged(EventArgs e) => On(EvDataMemberChanged, e);
    }
}
