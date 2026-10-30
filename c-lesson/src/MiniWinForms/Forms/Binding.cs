using System.Collections;
using System.Collections.Generic;
using System.ComponentModel;
using System.Data;
using MiniWinForms;

namespace System.Windows.Forms
{
    /// <summary>Veri kaynağından liste ve özellik bilgisini çıkaran yardımcı (WinForms ListBindingHelper benzeri).</summary>
    internal static class ListHelper
    {
        /// <summary>DataTable, DataSet+üye, DataView, BindingSource, IList kaynaklarını listeye çevirir.</summary>
        public static IList Resolve(object dataSource, string dataMember)
        {
            if (dataSource == null) return null;
            if (dataSource is BindingSource bs) return bs;
            if (dataSource is DataSet ds)
            {
                if (string.IsNullOrEmpty(dataMember)) return ds.Tables.Count > 0 ? ds.Tables[0].DefaultView : null;
                string table = dataMember.Split('.')[0];
                return ds.Tables.Contains(table) ? ds.Tables[table].DefaultView : null;
            }
            if (dataSource is DataTable dt) return dt.DefaultView;
            if (dataSource is IListSource ls) return ls.GetList();
            if (dataSource is IList list) return list;
            if (dataSource is IEnumerable en && dataSource is not string)
            {
                var copy = new List<object>();
                foreach (var o in en) copy.Add(o);
                return copy;
            }
            return new List<object> { dataSource };
        }

        public static PropertyDescriptorCollection GetProperties(IList list)
        {
            if (list == null) return PropertyDescriptorCollection.Empty;
            if (list is ITypedList typed) return typed.GetItemProperties(null);
            var type = ItemType(list);
            if (type == null || type == typeof(object))
            {
                if (list.Count > 0 && list[0] != null) return TypeDescriptor.GetProperties(list[0]);
                return PropertyDescriptorCollection.Empty;
            }
            if (type == typeof(string) || type.IsPrimitive || type == typeof(decimal)) return PropertyDescriptorCollection.Empty;
            return TypeDescriptor.GetProperties(type);
        }

        static Type ItemType(IList list)
        {
            var t = list.GetType();
            if (t.IsArray) return t.GetElementType();
            foreach (var i in t.GetInterfaces())
                if (i.IsGenericType && i.GetGenericTypeDefinition() == typeof(IList<>)) return i.GetGenericArguments()[0];
            return null;
        }

        public static PropertyDescriptor Find(IList list, string name)
        {
            if (string.IsNullOrEmpty(name)) return null;
            return GetProperties(list).Find(name, true);
        }

        /// <summary>Değeri sütun türüne çevirir (Türkçe kültürle).</summary>
        public static object Convert(object value, Type target)
        {
            if (target == null) return value;
            var t = Nullable.GetUnderlyingType(target) ?? target;
            if (value == null || value is DBNull) return target == typeof(string) ? value : DBNull.Value;
            if (t.IsInstanceOfType(value)) return value;
            if (value is string s)
            {
                if (s.Length == 0 && t != typeof(string)) return DBNull.Value;
                if (t == typeof(bool))
                {
                    if (bool.TryParse(s, out var b)) return b;
                    if (s == "1" || s.Equals("evet", StringComparison.CurrentCultureIgnoreCase)) return true;
                    if (s == "0" || s.Equals("hayır", StringComparison.CurrentCultureIgnoreCase)) return false;
                }
            }
            try
            {
                return System.Convert.ChangeType(value, t, Globalization.CultureInfo.CurrentCulture);
            }
            catch (Exception ex) when (ex is FormatException or InvalidCastException or OverflowException)
            {
                throw new FormatException("'" + value + "' değeri " + TypeName(t) + " türüne dönüştürülemedi.", ex);
            }
        }

        public static string TypeName(Type t) => t == typeof(int) ? "sayı (int)" : t == typeof(decimal) ? "ondalık sayı (decimal)" :
            t == typeof(double) ? "ondalık sayı (double)" : t == typeof(bool) ? "evet/hayır (bool)" : t == typeof(DateTime) ? "tarih (DateTime)" : t.Name;
    }

    // ============================================================ CurrencyManager / BindingContext

    public abstract class BindingManagerBase
    {
        public abstract int Position { get; set; }
        public abstract object Current { get; }
        public abstract int Count { get; }
        public abstract void AddNew();
        public abstract void RemoveAt(int index);
        public abstract void EndCurrentEdit();
        public abstract void CancelCurrentEdit();
        public event EventHandler PositionChanged;
        public event EventHandler CurrentChanged;
        public event EventHandler CurrentItemChanged;
        protected void OnPositionChanged() => PositionChanged?.Invoke(this, EventArgs.Empty);
        protected void OnCurrentChanged()
        {
            CurrentChanged?.Invoke(this, EventArgs.Empty);
            CurrentItemChanged?.Invoke(this, EventArgs.Empty);
        }
        protected void OnCurrentItemChanged() => CurrentItemChanged?.Invoke(this, EventArgs.Empty);
        public BindingsCollection Bindings { get; } = new BindingsCollection();
        public void SuspendBinding() { }
        public void ResumeBinding() { }
    }

    public class BindingsCollection : List<Binding> { }

    /// <summary>Bir listedeki "geçerli kayıt" konumunu tutar; aynı kaynağa bağlı tüm kontroller bunu paylaşır.</summary>
    public class CurrencyManager : BindingManagerBase
    {
        IList list;
        int position = -1;
        bool inEvent;

        internal CurrencyManager(IList list) { SetList(list); }

        public IList List => list;
        internal event ListChangedEventHandler ListChanged;

        internal void SetList(IList newList)
        {
            if (list is IBindingList old) old.ListChanged -= OnListChanged;
            list = newList;
            if (list is IBindingList bl) bl.ListChanged += OnListChanged;
            position = list != null && list.Count > 0 ? 0 : -1;
            Changed(ListChangedType.Reset, -1);
        }

        void OnListChanged(object sender, ListChangedEventArgs e)
        {
            int count = list?.Count ?? 0;
            int old = position;
            if (count == 0) position = -1;
            else if (position < 0) position = 0;
            else if (position >= count) position = count - 1;
            if (e.ListChangedType == ListChangedType.ItemAdded && list is IBindingList && addingNew)
                position = e.NewIndex;
            ListChanged?.Invoke(this, e);
            if (old != position) { OnPositionChanged(); OnCurrentChanged(); }
            else if (e.ListChangedType is ListChangedType.Reset or ListChangedType.ItemDeleted) OnCurrentChanged();
            else if (e.ListChangedType == ListChangedType.ItemChanged && e.NewIndex == position) OnCurrentItemChanged();
        }

        void Changed(ListChangedType type, int index) => ListChanged?.Invoke(this, new ListChangedEventArgs(type, index));

        public override int Count => list?.Count ?? 0;

        public override int Position
        {
            get => position;
            set
            {
                if (list == null || list.Count == 0) return;
                value = Math.Max(0, Math.Min(list.Count - 1, value));
                if (value == position || inEvent) return;
                EndCurrentEdit();
                position = Math.Max(0, Math.Min(list.Count - 1, value));
                inEvent = true;
                try
                {
                    OnPositionChanged();
                    OnCurrentChanged();
                }
                finally { inEvent = false; }
            }
        }

        public override object Current
        {
            get
            {
                if (list == null || position < 0 || position >= list.Count)
                    throw new IndexOutOfRangeException("Geçerli kayıt yok (liste boş).");
                return list[position];
            }
        }

        internal object CurrentOrNull => list != null && position >= 0 && position < list.Count ? list[position] : null;

        bool addingNew;

        public override void AddNew()
        {
            if (list is BindingSource bs)
            {
                bs.AddNew();
                return;
            }
            if (list is IBindingList bl)
            {
                EndCurrentEdit();
                addingNew = true;
                object item;
                try { item = bl.AddNew(); }
                finally { addingNew = false; }
                int index = list.IndexOf(item);
                MoveToNew(index >= 0 ? index : list.Count - 1);
            }
            else throw new NotSupportedException("Bu listeye yeni kayıt eklenemez.");
        }

        /// <summary>Yeni eklenen (henüz kaydedilmemiş) kayda geçer; düzenleme bitirilmez.</summary>
        internal void MoveToNew(int index)
        {
            if (list == null || index < 0 || index >= list.Count) return;
            position = index;
            OnPositionChanged();
            OnCurrentChanged();
        }

        public override void RemoveAt(int index)
        {
            if (list == null || index < 0 || index >= list.Count) throw new IndexOutOfRangeException("Silinecek kayıt bulunamadı.");
            list.RemoveAt(index);
        }

        public override void EndCurrentEdit()
        {
            // Kontrollerdeki değişiklikler önce kayda yazılır (WinForms'taki PullData).
            foreach (var b in Bindings.ToArray()) if (b.Control != null) b.WriteValue();
            if (CurrentOrNull is IEditableObject e) e.EndEdit();
        }

        public override void CancelCurrentEdit()
        {
            if (CurrentOrNull is IEditableObject e) e.CancelEdit();
        }

        public void Refresh() => Changed(ListChangedType.Reset, -1);
    }

    /// <summary>Kaynak + üye çiftine karşılık gelen CurrencyManager'ları tutar.</summary>
    public class BindingContext
    {
        static readonly List<(WeakReference src, string member, CurrencyManager cm)> managers = new List<(WeakReference, string, CurrencyManager)>();

        public BindingManagerBase this[object dataSource] => Get(dataSource, "");
        public BindingManagerBase this[object dataSource, string dataMember] => Get(dataSource, dataMember);

        internal static CurrencyManager Get(object dataSource, string dataMember)
        {
            if (dataSource == null) return null;
            if (dataSource is BindingSource bs) return bs.CurrencyManager;
            dataMember ??= "";
            // DataTable ile DataSet.Tables[x] aynı listeyi kullanır
            if (dataSource is DataSet ds && dataMember.Length > 0 && ds.Tables.Contains(dataMember.Split('.')[0]))
            {
                dataSource = ds.Tables[dataMember.Split('.')[0]];
                dataMember = "";
            }
            foreach (var (src, member, cm) in managers)
                if (ReferenceEquals(src.Target, dataSource) && member == dataMember) return cm;
            var created = new CurrencyManager(ListHelper.Resolve(dataSource, dataMember));
            managers.Add((new WeakReference(dataSource), dataMember, created));
            return created;
        }

        internal static void Reset() => managers.Clear();
    }

    // ============================================================ Binding (kontrol ↔ alan)

    public enum DataSourceUpdateMode { OnValidation = 0, OnPropertyChanged = 1, Never = 2 }
    public enum ControlUpdateMode { OnPropertyChanged = 0, Never = 1 }

    public class Binding
    {
        Control control;
        CurrencyManager manager;
        bool pushing;

        public Binding(string propertyName, object dataSource, string dataMember)
            : this(propertyName, dataSource, dataMember, false) { }
        public Binding(string propertyName, object dataSource, string dataMember, bool formattingEnabled)
            : this(propertyName, dataSource, dataMember, formattingEnabled, DataSourceUpdateMode.OnValidation) { }
        public Binding(string propertyName, object dataSource, string dataMember, bool formattingEnabled, DataSourceUpdateMode dataSourceUpdateMode)
            : this(propertyName, dataSource, dataMember, formattingEnabled, dataSourceUpdateMode, null) { }
        public Binding(string propertyName, object dataSource, string dataMember, bool formattingEnabled, DataSourceUpdateMode dataSourceUpdateMode, object nullValue)
            : this(propertyName, dataSource, dataMember, formattingEnabled, dataSourceUpdateMode, nullValue, "") { }
        public Binding(string propertyName, object dataSource, string dataMember, bool formattingEnabled, DataSourceUpdateMode dataSourceUpdateMode, object nullValue, string formatString)
        {
            PropertyName = propertyName;
            DataSource = dataSource;
            FormattingEnabled = formattingEnabled;
            DataSourceUpdateMode = dataSourceUpdateMode;
            NullValue = nullValue;
            FormatString = formatString ?? "";
            // "ogrenci.Ad" biçimi: tablo + alan
            var parts = (dataMember ?? "").Split('.');
            BindingMemberInfo = new BindingMemberInfo(dataMember ?? "");
            fieldName = parts[parts.Length - 1];
            listMember = parts.Length > 1 ? string.Join(".", parts, 0, parts.Length - 1) : "";
        }

        readonly string fieldName;
        readonly string listMember;

        public string PropertyName { get; }
        public object DataSource { get; }
        public BindingMemberInfo BindingMemberInfo { get; }
        public bool FormattingEnabled { get; set; }
        public DataSourceUpdateMode DataSourceUpdateMode { get; set; }
        public ControlUpdateMode ControlUpdateMode { get; set; }
        public object NullValue { get; set; }
        public object DataSourceNullValue { get; set; } = DBNull.Value;
        public string FormatString { get; set; }
        public IFormatProvider FormatInfo { get; set; }
        public Control Control => control;
        public BindingManagerBase BindingManagerBase => manager;
        public bool IsBinding => manager != null;

        public event ConvertEventHandler Format;
        public event ConvertEventHandler Parse;

        internal void Attach(Control c)
        {
            control = c;
            manager = BindingContext.Get(DataSource, listMember);
            manager.CurrentChanged += (s, e) => ReadValue();
            manager.CurrentItemChanged += (s, e) => ReadValue();
            manager.ListChanged += (s, e) => { if (e.ListChangedType != ListChangedType.ItemChanged) ReadValue(); };
            c.HookBindingUpdates(this);
            ReadValue();
        }

        internal void Detach() => control = null;

        PropertyDescriptor FieldDescriptor => ListHelper.Find(manager?.List, fieldName);

        /// <summary>Veri kaynağındaki değeri kontrole yazar.</summary>
        public void ReadValue()
        {
            if (control == null || manager == null || pushing) return;
            var item = manager.CurrentOrNull;
            object value = null;
            var pd = FieldDescriptor;
            if (item != null && pd != null)
            {
                try { value = pd.GetValue(item); } catch (Exception) { value = null; }
            }
            var prop = control.GetType().GetProperty(PropertyName);
            if (prop == null) return;
            object formatted = FormatValue(value, prop.PropertyType);
            var args = new ConvertEventArgs(formatted, prop.PropertyType);
            Format?.Invoke(this, args);
            pushing = true;
            try { prop.SetValue(control, args.Value); }
            catch (Exception) { /* uyumsuz değer: atla */ }
            finally { pushing = false; }
        }

        object FormatValue(object value, Type target)
        {
            bool isNull = value == null || value is DBNull;
            if (target == typeof(string))
            {
                if (isNull) return NullValue as string ?? "";
                if (!string.IsNullOrEmpty(FormatString) && value is IFormattable f) return f.ToString(FormatString, FormatInfo ?? Globalization.CultureInfo.CurrentCulture);
                return System.Convert.ToString(value, Globalization.CultureInfo.CurrentCulture);
            }
            if (target == typeof(CheckState))
            {
                if (isNull) return CheckState.Indeterminate;
                return System.Convert.ToBoolean(value) ? CheckState.Checked : CheckState.Unchecked;
            }
            if (target == typeof(bool)) return !isNull && System.Convert.ToBoolean(value);
            if (isNull)
            {
                if (NullValue != null) return NullValue;
                return target.IsValueType ? Activator.CreateInstance(target) : null;
            }
            try { return System.Convert.ChangeType(value, target, Globalization.CultureInfo.CurrentCulture); }
            catch { return value; }
        }

        /// <summary>Kontroldeki değeri veri kaynağına yazar.</summary>
        public void WriteValue()
        {
            if (control == null || manager == null || pushing || DataSourceUpdateMode == DataSourceUpdateMode.Never) return;
            var item = manager.CurrentOrNull;
            var pd = FieldDescriptor;
            if (item == null || pd == null || pd.IsReadOnly) return;
            var prop = control.GetType().GetProperty(PropertyName);
            if (prop == null) return;
            object raw = prop.GetValue(control);
            var args = new ConvertEventArgs(raw, pd.PropertyType);
            Parse?.Invoke(this, args);
            object value = args.Value;
            if (value is CheckState cs) value = cs == CheckState.Indeterminate ? DBNull.Value : (object)(cs == CheckState.Checked);
            if (value is string s && s.Length == 0 && pd.PropertyType != typeof(string)) value = DataSourceNullValue;
            try
            {
                value = ListHelper.Convert(value, pd.PropertyType);
                object current = pd.GetValue(item);
                if (Equals(current, value)) return;
                pushing = true;
                pd.SetValue(item, value);
            }
            catch (FormatException)
            {
                // WinForms'taki gibi: geçersiz değer kabul edilmez, kontrol eski değere döner.
                pushing = false;
                ReadValue();
            }
            finally { pushing = false; }
        }

        internal void ControlChanged(bool validated)
        {
            if (DataSourceUpdateMode == DataSourceUpdateMode.OnPropertyChanged || validated) WriteValue();
        }
    }

    public struct BindingMemberInfo
    {
        public BindingMemberInfo(string dataMember)
        {
            BindingMember = dataMember ?? "";
            int i = BindingMember.LastIndexOf('.');
            BindingField = i >= 0 ? BindingMember.Substring(i + 1) : BindingMember;
            BindingPath = i >= 0 ? BindingMember.Substring(0, i) : "";
        }
        public string BindingMember { get; }
        public string BindingField { get; }
        public string BindingPath { get; }
    }

    public delegate void ConvertEventHandler(object sender, ConvertEventArgs e);

    public class ConvertEventArgs : EventArgs
    {
        public ConvertEventArgs(object value, Type desiredType) { Value = value; DesiredType = desiredType; }
        public object Value { get; set; }
        public Type DesiredType { get; }
    }

    public class ControlBindingsCollection : IEnumerable
    {
        readonly Control owner;
        readonly List<Binding> list = new List<Binding>();
        internal ControlBindingsCollection(Control owner) { this.owner = owner; }

        public int Count => list.Count;
        public Binding this[int index] => list[index];
        public Binding this[string propertyName]
        {
            get
            {
                foreach (var b in list) if (string.Equals(b.PropertyName, propertyName, StringComparison.OrdinalIgnoreCase)) return b;
                return null;
            }
        }

        public void Add(Binding binding)
        {
            if (this[binding.PropertyName] != null)
                throw new ArgumentException("'" + binding.PropertyName + "' özelliği zaten bir alana bağlı. Önce DataBindings.Clear() ile eski bağlantıyı kaldırın.");
            list.Add(binding);
            binding.Attach(owner);
        }

        public Binding Add(string propertyName, object dataSource, string dataMember) => Add(propertyName, dataSource, dataMember, false);
        public Binding Add(string propertyName, object dataSource, string dataMember, bool formattingEnabled)
        {
            var b = new Binding(propertyName, dataSource, dataMember, formattingEnabled);
            Add(b);
            return b;
        }
        public Binding Add(string propertyName, object dataSource, string dataMember, bool formattingEnabled, DataSourceUpdateMode updateMode)
        {
            var b = new Binding(propertyName, dataSource, dataMember, formattingEnabled, updateMode);
            Add(b);
            return b;
        }

        public void Remove(Binding binding) { if (list.Remove(binding)) binding.Detach(); }
        public void RemoveAt(int index) => Remove(list[index]);
        public void Clear() { foreach (var b in list.ToArray()) Remove(b); }
        public IEnumerator GetEnumerator() => list.ToArray().GetEnumerator();
        internal IEnumerable<Binding> All => list;
    }
}
