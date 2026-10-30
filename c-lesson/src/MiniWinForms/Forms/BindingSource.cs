using System.Collections;
using System.Collections.Generic;
using System.ComponentModel;
using System.Data;
using System.Drawing;
using MiniWinForms;

namespace System.Windows.Forms
{
    public delegate void AddingNewEventHandler(object sender, AddingNewEventArgs e);

    public class AddingNewEventArgs : EventArgs
    {
        public AddingNewEventArgs() { }
        public AddingNewEventArgs(object newObject) { NewObject = newObject; }
        public object NewObject { get; set; }
    }

    /// <summary>
    /// Veri kaynağı ile kontroller arasındaki aracı (veri kümesi sihirbazının ürettiği ...BindingSource nesneleri).
    /// Arkada gerçek DataView kullanılır; Filter ve Sort ifadeleri DataView kurallarıyla çalışır.
    /// </summary>
    public class BindingSource : Component, IBindingListView, ITypedList, ICancelAddNew, ISupportInitialize, ICurrencyManagerProvider
    {
        object dataSource;
        string dataMember = "";
        string filter;
        string sort;
        IList inner;
        CurrencyManager manager;
        bool raise = true;

        public BindingSource() { GC.SuppressFinalize(this); manager = new CurrencyManager(this); }
        public BindingSource(IContainer container) : this() { container?.Add(this); }
        public BindingSource(object dataSource, string dataMember) : this()
        {
            this.dataSource = dataSource;
            this.dataMember = dataMember ?? "";
            Rebind();
        }

        public CurrencyManager CurrencyManager => manager;
        CurrencyManager ICurrencyManagerProvider.CurrencyManager => manager;
        public IList List => inner ?? Array.Empty<object>();

        public object DataSource
        {
            get => dataSource;
            set
            {
                if (ReferenceEquals(dataSource, value)) return;
                dataSource = value;
                if (value is not DataSet && value is not BindingSource) dataMember = dataMember ?? "";
                Rebind();
                DataSourceChanged?.Invoke(this, EventArgs.Empty);
            }
        }

        public string DataMember
        {
            get => dataMember;
            set
            {
                if (dataMember == (value ?? "")) return;
                dataMember = value ?? "";
                Rebind();
                DataMemberChanged?.Invoke(this, EventArgs.Empty);
            }
        }

        public string Filter
        {
            get => filter;
            set
            {
                filter = value;
                ApplyFilter();
            }
        }

        public string Sort
        {
            get => sort;
            set
            {
                sort = value;
                if (inner is DataView dv) dv.Sort = value ?? "";
                else if (inner is IBindingListView && !string.IsNullOrEmpty(value))
                    throw new NotSupportedException("Bu veri kaynağında sıralama desteklenmiyor.");
            }
        }

        void ApplyFilter()
        {
            if (inner is DataView dv) dv.RowFilter = filter ?? "";
            else if (inner is IBindingListView v && v.SupportsFiltering) v.Filter = filter;
            else if (!string.IsNullOrEmpty(filter))
                throw new NotSupportedException("Bu veri kaynağında Filter desteklenmiyor. DataTable ya da DataSet kullanın.");
        }

        void Rebind()
        {
            if (inner is IBindingList oldBl) oldBl.ListChanged -= InnerListChanged;
            inner = dataSource == null ? new List<object>() : ListHelper.Resolve(dataSource, dataMember);
            if (inner is BindingSource && ReferenceEquals(inner, this)) throw new InvalidOperationException("BindingSource kendi kaynağı olamaz.");
            if (inner is IBindingList bl) bl.ListChanged += InnerListChanged;
            if (inner is DataView dv)
            {
                if (filter != null) dv.RowFilter = filter;
                if (sort != null) dv.Sort = sort;
            }
            manager.SetList(this);
            OnListChanged(new ListChangedEventArgs(ListChangedType.Reset, -1));
        }

        void InnerListChanged(object sender, ListChangedEventArgs e) => OnListChanged(e);

        protected virtual void OnListChanged(ListChangedEventArgs e)
        {
            if (raise) ListChanged?.Invoke(this, e);
        }

        // ------------------------------------------------------------ gezinme

        public int Position { get => manager.Position; set => manager.Position = value; }
        public object Current => manager.Count > 0 ? manager.Current : null;
        public int Count => inner?.Count ?? 0;

        public void MoveFirst() => Position = 0;
        public void MoveLast() => Position = Count - 1;
        public void MoveNext() => Position = Position + 1;
        public void MovePrevious() => Position = Math.Max(0, Position - 1);

        public object AddNew()
        {
            var e = new AddingNewEventArgs();
            AddingNew?.Invoke(this, e);
            // Önce geçerli kayıttaki düzenleme bitirilir (WinForms'taki gibi).
            manager.EndCurrentEdit();
            object item;
            if (e.NewObject != null)
            {
                if (inner == null) throw new InvalidOperationException("Veri kaynağı yok.");
                inner.Add(e.NewObject);
                item = e.NewObject;
            }
            else if (inner is IBindingList bl && bl.AllowNew) item = bl.AddNew();
            else throw new InvalidOperationException("Bu veri kaynağına yeni kayıt eklenemez.");
            int index = inner.IndexOf(item);
            manager.MoveToNew(index >= 0 ? index : Count - 1);
            return item;
        }

        public void RemoveCurrent()
        {
            if (Count == 0 || Position < 0) throw new InvalidOperationException("Silinecek geçerli kayıt yok.");
            RemoveAt(Position);
        }

        public void RemoveAt(int index)
        {
            if (inner == null) return;
            inner.RemoveAt(index);
        }

        public void Remove(object value)
        {
            int i = IndexOf(value);
            if (i >= 0) RemoveAt(i);
        }

        public void Clear()
        {
            if (inner is DataView dv) { for (int i = dv.Count - 1; i >= 0; i--) dv.Delete(i); }
            else inner?.Clear();
        }

        public void EndEdit() => manager.EndCurrentEdit();
        public void CancelEdit() => manager.CancelCurrentEdit();
        public void RemoveFilter() => Filter = null;
        public void RemoveSort() => Sort = null;
        public void ResetBindings(bool metadataChanged) => OnListChanged(new ListChangedEventArgs(ListChangedType.Reset, -1));
        public void ResetCurrentItem() { if (Position >= 0) OnListChanged(new ListChangedEventArgs(ListChangedType.ItemChanged, Position)); }
        public void ResetItem(int itemIndex) => OnListChanged(new ListChangedEventArgs(ListChangedType.ItemChanged, itemIndex));
        public void SuspendBinding() { }
        public void ResumeBinding() { }
        public bool RaiseListChangedEvents { get => raise; set => raise = value; }
        public bool IsBindingSuspended => false;

        public int Find(string propertyName, object key)
        {
            var pd = ListHelper.Find(inner, propertyName)
                     ?? throw new ArgumentException("'" + propertyName + "' adında bir alan yok.");
            for (int i = 0; i < Count; i++) if (Equals(pd.GetValue(inner[i]), key)) return i;
            return -1;
        }

        public event ListChangedEventHandler ListChanged;
        public event EventHandler PositionChanged { add => manager.PositionChanged += value; remove => manager.PositionChanged -= value; }
        public event EventHandler CurrentChanged { add => manager.CurrentChanged += value; remove => manager.CurrentChanged -= value; }
        public event EventHandler CurrentItemChanged { add => manager.CurrentItemChanged += value; remove => manager.CurrentItemChanged -= value; }
        public event AddingNewEventHandler AddingNew;
        public event EventHandler DataSourceChanged;
        public event EventHandler DataMemberChanged;
        public event EventHandler DataError;
        public event EventHandler BindingComplete;

        public void BeginInit() { }
        public void EndInit() { }

        // ------------------------------------------------------------ IList / IBindingList

        public object this[int index] { get => inner[index]; set => inner[index] = value; }
        public bool IsReadOnly => inner?.IsReadOnly ?? false;
        public bool IsFixedSize => inner?.IsFixedSize ?? false;
        public bool IsSynchronized => false;
        public object SyncRoot => this;
        public int Add(object value) { int i = inner.Add(value); return i; }
        public bool Contains(object value) => inner?.Contains(value) ?? false;
        public int IndexOf(object value) => inner?.IndexOf(value) ?? -1;
        public void Insert(int index, object value) => inner.Insert(index, value);
        public void CopyTo(Array array, int index) => inner?.CopyTo(array, index);
        public IEnumerator GetEnumerator() => (inner ?? Array.Empty<object>()).GetEnumerator();

        public bool AllowEdit => (inner as IBindingList)?.AllowEdit ?? !IsReadOnly;
        public bool AllowNew { get => (inner as IBindingList)?.AllowNew ?? !IsFixedSize; set { } }
        public bool AllowRemove => (inner as IBindingList)?.AllowRemove ?? !IsFixedSize;
        public bool IsSorted => (inner as IBindingList)?.IsSorted ?? false;
        public ListSortDirection SortDirection => (inner as IBindingList)?.SortDirection ?? ListSortDirection.Ascending;
        public PropertyDescriptor SortProperty => (inner as IBindingList)?.SortProperty;
        public bool SupportsChangeNotification => true;
        public bool SupportsSearching => (inner as IBindingList)?.SupportsSearching ?? false;
        public bool SupportsSorting => (inner as IBindingList)?.SupportsSorting ?? false;
        public bool SupportsFiltering => inner is IBindingListView v && v.SupportsFiltering;
        public bool SupportsAdvancedSorting => inner is IBindingListView v && v.SupportsAdvancedSorting;
        public ListSortDescriptionCollection SortDescriptions => (inner as IBindingListView)?.SortDescriptions;
        object IBindingList.AddNew() => AddNew();
        public void AddIndex(PropertyDescriptor property) => (inner as IBindingList)?.AddIndex(property);
        public void ApplySort(PropertyDescriptor property, ListSortDirection sort) => (inner as IBindingList)?.ApplySort(property, sort);
        public void ApplySort(ListSortDescriptionCollection sorts) => (inner as IBindingListView)?.ApplySort(sorts);
        public int Find(PropertyDescriptor prop, object key) => (inner as IBindingList)?.Find(prop, key) ?? -1;
        public void RemoveIndex(PropertyDescriptor property) => (inner as IBindingList)?.RemoveIndex(property);
        string IBindingListView.Filter { get => Filter; set => Filter = value; }

        public PropertyDescriptorCollection GetItemProperties(PropertyDescriptor[] listAccessors) => ListHelper.GetProperties(inner);
        public string GetListName(PropertyDescriptor[] listAccessors) => dataMember ?? "";

        public void CancelNew(int itemIndex) => (inner as ICancelAddNew)?.CancelNew(itemIndex);
        public void EndNew(int itemIndex) => (inner as ICancelAddNew)?.EndNew(itemIndex);

        public override string ToString() => "BindingSource" + (string.IsNullOrEmpty(dataMember) ? "" : " (" + dataMember + ")");
    }

    public interface ICurrencyManagerProvider
    {
        CurrencyManager CurrencyManager { get; }
    }

    // ============================================================ BindingNavigator

    /// <summary>Kayıtlar arasında gezinme, ekleme ve silme araç çubuğu.</summary>
    public class BindingNavigator : ToolStrip, ISupportInitialize
    {
        BindingSource source;
        ToolStripItem addNew, delete, moveFirst, movePrevious, moveNext, moveLast;
        ToolStripItem countItem, positionItem;
        string countFormat = "/{0}";

        public BindingNavigator() : this(true) { }
        public BindingNavigator(IContainer container) : this(false) { container?.Add(this); }
        public BindingNavigator(BindingSource bindingSource) : this(true) { BindingSource = bindingSource; }

        public BindingNavigator(bool addStandardItems)
        {
            if (addStandardItems) AddStandardItems();
        }

        internal override string UiType => "ToolStrip";

        public virtual void AddStandardItems()
        {
            MoveFirstItem = new ToolStripButton { Name = "bindingNavigatorMoveFirstItem", Text = "İlke taşı", DisplayStyle = ToolStripItemDisplayStyle.Image };
            MovePreviousItem = new ToolStripButton { Name = "bindingNavigatorMovePreviousItem", Text = "Öncekine taşı", DisplayStyle = ToolStripItemDisplayStyle.Image };
            var sep1 = new ToolStripSeparator { Name = "bindingNavigatorSeparator" };
            PositionItem = new ToolStripTextBox { Name = "bindingNavigatorPositionItem", Text = "0", AutoSize = false, Size = new Size(50, 23) };
            CountItem = new ToolStripLabel { Name = "bindingNavigatorCountItem", Text = "/{0}" };
            var sep2 = new ToolStripSeparator { Name = "bindingNavigatorSeparator1" };
            MoveNextItem = new ToolStripButton { Name = "bindingNavigatorMoveNextItem", Text = "Sonrakine taşı", DisplayStyle = ToolStripItemDisplayStyle.Image };
            MoveLastItem = new ToolStripButton { Name = "bindingNavigatorMoveLastItem", Text = "Sona taşı", DisplayStyle = ToolStripItemDisplayStyle.Image };
            var sep3 = new ToolStripSeparator { Name = "bindingNavigatorSeparator2" };
            AddNewItem = new ToolStripButton { Name = "bindingNavigatorAddNewItem", Text = "Yeni ekle", DisplayStyle = ToolStripItemDisplayStyle.Image };
            DeleteItem = new ToolStripButton { Name = "bindingNavigatorDeleteItem", Text = "Sil", DisplayStyle = ToolStripItemDisplayStyle.Image };
            Items.AddRange(new ToolStripItem[] { MoveFirstItem, MovePreviousItem, sep1, PositionItem, CountItem, sep2, MoveNextItem, MoveLastItem, sep3, AddNewItem, DeleteItem });
        }

        public BindingSource BindingSource
        {
            get => source;
            set
            {
                if (source == value) return;
                if (source != null)
                {
                    source.ListChanged -= SourceChanged;
                    source.PositionChanged -= SourceChanged;
                }
                source = value;
                if (source != null)
                {
                    source.ListChanged += SourceChanged;
                    source.PositionChanged += SourceChanged;
                }
                RefreshItemsCore();
            }
        }

        void SourceChanged(object sender, EventArgs e) => RefreshItemsCore();

        static void Swap(ref ToolStripItem field, ToolStripItem value, EventHandler handler)
        {
            if (field != null) field.Click -= handler;
            field = value;
            if (field != null) field.Click += handler;
        }

        // Not: bir öğe bu özelliklere atanınca tıklama işlemi gezgin tarafından yapılır.
        // Silmeden önce onay sormak için DeleteItem = null yapılıp öğenin Click olayı yazılır.
        public ToolStripItem AddNewItem { get => addNew; set { Swap(ref addNew, value, OnAddNew); SetGlyph(value, "✚"); RefreshItemsCore(); } }
        public ToolStripItem DeleteItem { get => delete; set { Swap(ref delete, value, OnDelete); SetGlyph(value, "✖"); RefreshItemsCore(); } }
        public ToolStripItem MoveFirstItem { get => moveFirst; set { Swap(ref moveFirst, value, OnMoveFirst); SetGlyph(value, "⏮"); RefreshItemsCore(); } }
        public ToolStripItem MovePreviousItem { get => movePrevious; set { Swap(ref movePrevious, value, OnMovePrevious); SetGlyph(value, "◀"); RefreshItemsCore(); } }
        public ToolStripItem MoveNextItem { get => moveNext; set { Swap(ref moveNext, value, OnMoveNext); SetGlyph(value, "▶"); RefreshItemsCore(); } }
        public ToolStripItem MoveLastItem { get => moveLast; set { Swap(ref moveLast, value, OnMoveLast); SetGlyph(value, "⏭"); RefreshItemsCore(); } }

        public ToolStripItem CountItem { get => countItem; set { countItem = value; RefreshItemsCore(); } }
        public string CountItemFormat { get => countFormat; set { countFormat = value ?? "{0}"; RefreshItemsCore(); } }

        public ToolStripItem PositionItem
        {
            get => positionItem;
            set
            {
                if (positionItem is ToolStripTextBox oldTb) oldTb.KeyDown -= PositionKeyDown;
                positionItem = value;
                if (positionItem is ToolStripTextBox tb) tb.KeyDown += PositionKeyDown;
                RefreshItemsCore();
            }
        }

        static void SetGlyph(ToolStripItem item, string glyph)
        {
            // Visual Studio'daki simgelerin yerine basit karakterler (resim dosyası olmadan da anlaşılsın).
            if (item != null) Ui.Set(item.Id, "glyph", glyph);
        }

        void PositionKeyDown(object sender, KeyEventArgs e)
        {
            if (e.KeyCode != Keys.Enter || source == null) return;
            if (int.TryParse(positionItem.Text, out int p)) source.Position = p - 1;
            RefreshItemsCore();
            e.Handled = true;
        }

        void OnAddNew(object sender, EventArgs e) { if (Validate()) source?.AddNew(); RefreshItemsCore(); }
        void OnDelete(object sender, EventArgs e) { if (Validate() && source != null && source.Count > 0) source.RemoveCurrent(); RefreshItemsCore(); }
        void OnMoveFirst(object sender, EventArgs e) { if (Validate()) source?.MoveFirst(); }
        void OnMovePrevious(object sender, EventArgs e) { if (Validate()) source?.MovePrevious(); }
        void OnMoveNext(object sender, EventArgs e) { if (Validate()) source?.MoveNext(); }
        void OnMoveLast(object sender, EventArgs e) { if (Validate()) source?.MoveLast(); }

        public bool Validate()
        {
            FindForm()?.Validate();
            return true;
        }

        public event EventHandler RefreshItems;

        void RefreshItemsCore()
        {
            int count = source?.Count ?? 0;
            int pos = source == null || count == 0 ? 0 : source.Position + 1;
            if (positionItem != null) positionItem.Text = pos.ToString();
            if (countItem != null) countItem.Text = string.Format(countFormat, count);
            bool hasSource = source != null;
            if (moveFirst != null) moveFirst.Enabled = hasSource && pos > 1;
            if (movePrevious != null) movePrevious.Enabled = hasSource && pos > 1;
            if (moveNext != null) moveNext.Enabled = hasSource && pos < count;
            if (moveLast != null) moveLast.Enabled = hasSource && pos < count;
            if (addNew != null) addNew.Enabled = hasSource && source.AllowNew;
            if (delete != null) delete.Enabled = hasSource && source.AllowRemove && count > 0;
            if (positionItem != null) positionItem.Enabled = hasSource && count > 0;
            RefreshItems?.Invoke(this, EventArgs.Empty);
        }

        public void BeginInit() { }

        public void EndInit()
        {
            // Veri Kaynakları'ndan gelen "Verileri Kaydet" düğmesinin simgesi
            // ve gezgin özelliklerinden ayrılmış standart düğmelerin simgeleri (VS'de simge resmi kalır)
            foreach (ToolStripItem item in Items)
            {
                if (item is not ToolStripButton b || b.Image != null) continue;
                string n = b.Name ?? "";
                string g = n.EndsWith("SaveItem", StringComparison.Ordinal) ? "💾" : n.EndsWith("DeleteItem", StringComparison.Ordinal) ? "✖"
                    : n.EndsWith("AddNewItem", StringComparison.Ordinal) ? "✚" : n.EndsWith("MoveFirstItem", StringComparison.Ordinal) ? "⏮"
                    : n.EndsWith("MovePreviousItem", StringComparison.Ordinal) ? "◀" : n.EndsWith("MoveNextItem", StringComparison.Ordinal) ? "▶"
                    : n.EndsWith("MoveLastItem", StringComparison.Ordinal) ? "⏭" : null;
                if (g != null) SetGlyph(b, g);
            }
            RefreshItemsCore();
        }
    }
}
