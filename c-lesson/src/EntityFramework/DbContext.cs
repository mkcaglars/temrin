using System.Collections;
using System.Collections.Generic;
using System.ComponentModel;
using System.Configuration;
using System.Data.Entity.Core;
using System.Data.Entity.Infrastructure;
using System.Data.Entity.Validation;
using System.Globalization;
using System.Linq;
using System.Reflection;
using System.Text;
using MySql.Data.MySqlClient;

namespace System.Data.Entity
{
    public enum EntityState { Detached = 1, Unchanged = 2, Added = 4, Deleted = 8, Modified = 16 }

    /// <summary>Veritabanı oturumu: tablolara (DbSet) erişim ve değişiklikleri kaydetme.</summary>
    public class DbContext : IDisposable
    {
        internal readonly string connectionString;
        internal readonly List<EntityEntry> entries = new List<EntityEntry>();
        readonly Dictionary<Type, object> sets = new Dictionary<Type, object>();
        readonly Dictionary<IEntitySet, List<NavInfo>> navs = new Dictionary<IEntitySet, List<NavInfo>>();
        bool disposed;

        protected DbContext() : this(null) { }

        protected DbContext(string nameOrConnectionString)
        {
            string name = nameOrConnectionString ?? GetType().Name;
            if (name.StartsWith("name=", StringComparison.OrdinalIgnoreCase)) name = name.Substring(5);
            string cs;
            if (name.Contains('='))
            {
                cs = name;
            }
            else
            {
                var setting = ConfigurationManager.ConnectionStrings[name];
                if (setting == null)
                    throw new InvalidOperationException($"No connection string named '{name}' could be found in the application config file.");
                cs = setting.ConnectionString;
            }
            connectionString = ProviderConnectionString(cs);
            Database = new Database(this);
            // DbSet<T> özelliklerini doldur
            foreach (var p in GetType().GetProperties(BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic))
            {
                if (!p.PropertyType.IsGenericType || p.PropertyType.GetGenericTypeDefinition() != typeof(DbSet<>) || !p.CanWrite) continue;
                var t = p.PropertyType.GetGenericArguments()[0];
                var set = CreateSet(t, p.Name);
                p.SetValue(this, set);
            }
        }

        static string ProviderConnectionString(string cs)
        {
            const string key = "provider connection string=";
            int i = cs.IndexOf(key, StringComparison.OrdinalIgnoreCase);
            if (i < 0) return cs;
            string rest = cs.Substring(i + key.Length).Trim();
            if (rest.StartsWith("\"")) { int j = rest.IndexOf('"', 1); return j > 0 ? rest.Substring(1, j - 1) : rest.Trim('"'); }
            if (rest.StartsWith("'")) { int j = rest.IndexOf('\'', 1); return j > 0 ? rest.Substring(1, j - 1) : rest.Trim('\''); }
            return rest;
        }

        object CreateSet(Type t, string propertyName)
        {
            if (sets.TryGetValue(t, out var s)) return s;
            var set = Activator.CreateInstance(typeof(DbSet<>).MakeGenericType(t), BindingFlags.Instance | BindingFlags.NonPublic | BindingFlags.Public, null, new object[] { this, propertyName }, CultureInfo.InvariantCulture);
            sets[t] = set;
            return set;
        }

        public Database Database { get; }

        public virtual DbSet<TEntity> Set<TEntity>() where TEntity : class => (DbSet<TEntity>)CreateSet(typeof(TEntity), typeof(TEntity).Name);

        protected virtual void OnModelCreating(DbModelBuilder modelBuilder) { }

        internal MySqlConnection Open()
        {
            if (disposed) throw new ObjectDisposedException(GetType().Name, "The operation cannot be completed because the DbContext has been disposed.");
            var c = new MySqlConnection(connectionString);
            c.Open();
            return c;
        }

        internal EntityEntry EntryOf(object entity) => entity == null ? null : entries.FirstOrDefault(e => ReferenceEquals(e.Entity, entity));

        public DbEntityEntry Entry(object entity)
        {
            if (entity == null) throw new ArgumentNullException(nameof(entity));
            var e = EntryOf(entity) ?? new EntityEntry(this, entity, EntityState.Detached, SetFor(entity.GetType()));
            return new DbEntityEntry(e);
        }

        public DbEntityEntry<TEntity> Entry<TEntity>(TEntity entity) where TEntity : class
        {
            if (entity == null) throw new ArgumentNullException(nameof(entity));
            var e = EntryOf(entity) ?? new EntityEntry(this, entity, EntityState.Detached, SetFor(entity.GetType()));
            return new DbEntityEntry<TEntity>(e);
        }

        internal IEntitySet SetFor(Type t)
        {
            if (sets.TryGetValue(t, out var s)) return (IEntitySet)s;
            return (IEntitySet)CreateSet(t, t.Name);
        }

        internal bool IsEntityType(Type t) => sets.ContainsKey(t);

        // ------------------------------------------------------------ ilişkiler (navigation properties)

        static Type ElementType(Type t)
        {
            if (t == typeof(string) || !typeof(IEnumerable).IsAssignableFrom(t)) return null;
            if (t.IsGenericType) return t.GetGenericArguments()[0];
            var i = t.GetInterfaces().FirstOrDefault(x => x.IsGenericType && x.GetGenericTypeDefinition() == typeof(IEnumerable<>));
            return i?.GetGenericArguments()[0];
        }

        /// <summary>Varlık sınıfındaki gezinme özelliklerini veritabanındaki yabancı anahtarlarla eşleştirir.</summary>
        internal List<NavInfo> NavsOf(IEntitySet set, MySqlConnection conn)
        {
            if (navs.TryGetValue(set, out var list)) return list;
            list = new List<NavInfo>();
            navs[set] = list;
            string myTable = set.TableName(conn);
            var used = new HashSet<FkInfo>();
            foreach (var p in set.EntityType.GetProperties(BindingFlags.Instance | BindingFlags.Public))
            {
                if (!p.CanRead) continue;
                var elem = ElementType(p.PropertyType);
                if (elem != null && IsEntityType(elem))
                {
                    // koleksiyon: alt tablodaki, bu tabloya başvuran yabancı anahtar
                    var child = SetFor(elem);
                    var fk = child.Fks(conn).FirstOrDefault(f => string.Equals(f.RefTable, myTable, StringComparison.OrdinalIgnoreCase) && !used.Contains(f));
                    if (fk == null) continue;
                    used.Add(fk);
                    list.Add(new NavInfo { Prop = p, Collection = true, Target = child, Fk = fk, ElementType = elem });
                }
                else if (IsEntityType(p.PropertyType))
                {
                    var parent = SetFor(p.PropertyType);
                    string pt = parent.TableName(conn);
                    var fk = set.Fks(conn).FirstOrDefault(f => string.Equals(f.RefTable, pt, StringComparison.OrdinalIgnoreCase) && !used.Contains(f));
                    if (fk == null) continue;
                    used.Add(fk);
                    list.Add(new NavInfo { Prop = p, Collection = false, Target = parent, Fk = fk });
                }
            }
            return list;
        }

        /// <summary>Kaydın ilişkili nesnelerini yükler (EF'deki tembel yüklemenin karşılığı).</summary>
        internal void LoadNavigations(EntityEntry e, MySqlConnection conn)
        {
            if (!Configuration.LazyLoadingEnabled || e.NavLoaded) return;
            e.NavLoaded = true;
            foreach (var n in NavsOf(e.Set, conn))
            {
                if (!n.Collection)
                {
                    var vals = n.Fk.Cols.Select(c => e.Set.GetColumn(e, c)).ToArray();
                    object target = vals.Any(v => v == null || v is DBNull) ? null : n.Target.FindOrLoad(conn, n.Fk.RefCols, vals);
                    if (n.Prop.CanWrite) n.Prop.SetValue(e.Entity, target);
                }
                else
                {
                    var ownerVals = n.Fk.RefCols.Select(c => e.Set.GetColumn(e, c)).ToArray();
                    var items = ownerVals.Any(v => v == null) ? new List<object>() : n.Target.LoadWhere(conn, n.Fk.Cols, ownerVals);
                    var coll = n.Prop.GetValue(e.Entity);
                    if (coll == null && n.Prop.CanWrite)
                    {
                        coll = Activator.CreateInstance(typeof(HashSet<>).MakeGenericType(n.ElementType));
                        n.Prop.SetValue(e.Entity, coll);
                    }
                    if (coll == null) continue;
                    var clear = coll.GetType().GetMethod("Clear", Type.EmptyTypes);
                    var add = coll.GetType().GetMethod("Add", new[] { n.ElementType });
                    clear?.Invoke(coll, null);
                    foreach (var it in items) add?.Invoke(coll, new[] { it });
                }
            }
        }

        /// <summary>İlişkili nesnelere eklenen yeni kayıtları da izlemeye alır (EF'deki nesne grafiği).</summary>
        void DetectGraph(MySqlConnection conn)
        {
            bool added = true;
            while (added)
            {
                added = false;
                foreach (var e in entries.Where(x => x.State != EntityState.Deleted).ToList())
                {
                    foreach (var n in NavsOf(e.Set, conn))
                    {
                        var v = n.Prop.GetValue(e.Entity);
                        if (v == null) continue;
                        IEnumerable targets = n.Collection ? (IEnumerable)v : new[] { v };
                        foreach (var t in targets)
                        {
                            if (t == null || EntryOf(t) != null) continue;
                            entries.Add(new EntityEntry(this, t, EntityState.Added, SetFor(t.GetType())));
                            added = true;
                        }
                    }
                }
            }
        }

        /// <summary>Yabancı anahtar değerlerini ilişkili nesnelerden kopyalar.</summary>
        void FixUp(EntityEntry e, MySqlConnection conn, ISet<EntityEntry> unwritten)
        {
            foreach (var n in NavsOf(e.Set, conn))
            {
                var v = n.Prop.GetValue(e.Entity);
                if (v == null) continue;
                if (!n.Collection)
                {
                    var pe = EntryOf(v);
                    if (pe == null || unwritten.Contains(pe)) continue;
                    for (int i = 0; i < n.Fk.Cols.Length; i++) e.Set.SetColumn(e, n.Fk.Cols[i], pe.Set.GetColumn(pe, n.Fk.RefCols[i]));
                }
                else if (!unwritten.Contains(e))
                {
                    foreach (var child in (IEnumerable)v)
                    {
                        var ce = EntryOf(child);
                        if (ce == null || ce.State == EntityState.Deleted) continue;
                        for (int i = 0; i < n.Fk.Cols.Length; i++) ce.Set.SetColumn(ce, n.Fk.Cols[i], e.Set.GetColumn(e, n.Fk.RefCols[i]));
                    }
                }
            }
        }

        /// <summary>e kaydı, d kaydına (yabancı anahtar ya da ilişki ile) bağlı mı?</summary>
        bool DependsOn(EntityEntry e, EntityEntry d, MySqlConnection conn)
        {
            foreach (var n in NavsOf(e.Set, conn))
                if (!n.Collection && ReferenceEquals(n.Prop.GetValue(e.Entity), d.Entity)) return true;
            foreach (var n in NavsOf(d.Set, conn))
                if (n.Collection && n.Prop.GetValue(d.Entity) is IEnumerable coll && coll.Cast<object>().Any(x => ReferenceEquals(x, e.Entity))) return true;
            string dt = d.Set.TableName(conn);
            foreach (var fk in e.Set.Fks(conn).Where(f => string.Equals(f.RefTable, dt, StringComparison.OrdinalIgnoreCase)))
            {
                bool all = true;
                for (int i = 0; i < fk.Cols.Length && all; i++)
                {
                    var a = e.Set.GetColumn(e, fk.Cols[i]);
                    var b = d.Set.GetColumn(d, fk.RefCols[i]);
                    all = a != null && b != null && string.Equals(Convert.ToString(a, CultureInfo.InvariantCulture), Convert.ToString(b, CultureInfo.InvariantCulture), StringComparison.Ordinal);
                }
                if (all) return true;
            }
            return false;
        }

        /// <summary>Bağımlılıklara göre sıralar: önce bağımsız olanlar (silmede ters çevrilir).</summary>
        List<EntityEntry> Order(List<EntityEntry> list, MySqlConnection conn)
        {
            var rest = list.ToList();
            var outList = new List<EntityEntry>();
            while (rest.Count > 0)
            {
                var next = rest.FirstOrDefault(e => !rest.Any(d => d != e && DependsOn(e, d, conn))) ?? rest[0];
                outList.Add(next);
                rest.Remove(next);
            }
            return outList;
        }

        public virtual int SaveChanges()
        {
            using var conn = Open();
            DetectGraph(conn);
            var empty = new HashSet<EntityEntry>();
            foreach (var e in entries.Where(x => x.State != EntityState.Deleted).ToList()) FixUp(e, conn, entries.Where(x => x.State == EntityState.Added).ToHashSet());
            foreach (var e in entries.Where(x => x.State == EntityState.Unchanged)) if (e.IsModified()) e.State = EntityState.Modified;
            var pending = entries.Where(x => x.State is EntityState.Added or EntityState.Modified or EntityState.Deleted).ToList();
            if (pending.Count == 0) return 0;
            var adds = Order(pending.Where(x => x.State == EntityState.Added).ToList(), conn);
            var mods = pending.Where(x => x.State == EntityState.Modified).ToList();
            var dels = Order(pending.Where(x => x.State == EntityState.Deleted).ToList(), conn);
            dels.Reverse();
            // Doğrulama (NOT NULL / uzunluk) — yeni kayıtların yabancı anahtarları yazım sırasında dolar
            var errors = new List<DbEntityValidationResult>();
            foreach (var e in mods)
            {
                var r = e.Set.Validate(e, false);
                if (r != null) errors.Add(r);
            }
            foreach (var e in adds)
            {
                var r = e.Set.Validate(e, true);
                if (r != null) errors.Add(r);
            }
            if (errors.Count > 0) throw new DbEntityValidationException("Validation failed for one or more entities. See 'EntityValidationErrors' property for more details.", errors);
            int n = 0;
            var unwritten = adds.ToHashSet();
            try
            {
                foreach (var e in adds)
                {
                    FixUp(e, conn, unwritten);
                    n += e.Set.Write(conn, e);
                    unwritten.Remove(e);
                    foreach (var other in entries.ToList()) FixUp(other, conn, unwritten);
                }
                foreach (var e in mods) { FixUp(e, conn, empty); n += e.Set.Write(conn, e); }
                foreach (var e in dels) n += e.Set.Write(conn, e);
            }
            catch (MySqlException ex)
            {
                throw new DbUpdateException("An error occurred while updating the entries. See the inner exception for details.", new UpdateException("An error occurred while updating the entries. See the inner exception for details.", ex));
            }
            foreach (var e in pending)
            {
                if (e.State == EntityState.Deleted)
                {
                    entries.Remove(e);
                    // silinen kaydı ilişkili koleksiyonlardan çıkar
                    foreach (var o in entries)
                        foreach (var nv in NavsOf(o.Set, conn).Where(x => x.Collection))
                        {
                            var coll = nv.Prop.GetValue(o.Entity);
                            coll?.GetType().GetMethod("Remove", new[] { nv.ElementType })?.Invoke(coll, new[] { e.Entity });
                        }
                    continue;
                }
                e.State = EntityState.Unchanged;
                e.Snapshot();
                e.NavLoaded = false;
            }
            return n;
        }

        public System.Threading.Tasks.Task<int> SaveChangesAsync() => System.Threading.Tasks.Task.FromResult(SaveChanges());

        public void Dispose()
        {
            disposed = true;
            GC.SuppressFinalize(this);
        }

        public DbChangeTracker ChangeTracker => new DbChangeTracker(this);
        public DbContextConfiguration Configuration { get; } = new DbContextConfiguration();
    }

    public sealed class DbContextConfiguration
    {
        public bool LazyLoadingEnabled { get; set; } = true;
        public bool ProxyCreationEnabled { get; set; } = true;
        public bool AutoDetectChangesEnabled { get; set; } = true;
        public bool ValidateOnSaveEnabled { get; set; } = true;
    }

    public sealed class DbChangeTracker
    {
        readonly DbContext ctx;
        internal DbChangeTracker(DbContext ctx) { this.ctx = ctx; }
        public bool HasChanges() => ctx.entries.Any(e => e.State != EntityState.Unchanged || e.IsModified());
        public void DetectChanges() { foreach (var e in ctx.entries.Where(x => x.State == EntityState.Unchanged)) if (e.IsModified()) e.State = EntityState.Modified; }
        public IEnumerable<DbEntityEntry> Entries() => ctx.entries.Select(e => new DbEntityEntry(e)).ToList();
    }

    public sealed class Database
    {
        readonly DbContext ctx;
        internal Database(DbContext ctx) { this.ctx = ctx; }
        public MySqlConnection Connection => new MySqlConnection(ctx.connectionString);
        public bool Exists() { try { using var c = ctx.Open(); return true; } catch (MySqlException) { return false; } }

        public int ExecuteSqlCommand(string sql, params object[] parameters)
        {
            using var c = ctx.Open();
            var cmd = new MySqlCommand(sql, c);
            AddParameters(cmd, parameters);
            return cmd.ExecuteNonQuery();
        }

        internal static void AddParameters(MySqlCommand cmd, object[] parameters)
        {
            if (parameters == null) return;
            for (int i = 0; i < parameters.Length; i++)
            {
                if (parameters[i] is MySqlParameter mp) cmd.Parameters.Add(mp);
                else cmd.Parameters.AddWithValue("@p" + i.ToString(CultureInfo.InvariantCulture), parameters[i]);
            }
        }

        public IEnumerable<T> SqlQuery<T>(string sql, params object[] parameters)
        {
            using var c = ctx.Open();
            var cmd = new MySqlCommand(sql, c);
            AddParameters(cmd, parameters);
            using var r = cmd.ExecuteReader();
            var list = new List<T>();
            bool scalar = typeof(T).IsPrimitive || typeof(T) == typeof(string) || typeof(T) == typeof(decimal) || typeof(T) == typeof(DateTime) || Nullable.GetUnderlyingType(typeof(T)) != null;
            while (r.Read())
            {
                if (scalar) { list.Add((T)Materializer.ConvertTo(r.GetValue(0), typeof(T))); continue; }
                var o = Activator.CreateInstance<T>();
                for (int i = 0; i < r.FieldCount; i++)
                {
                    var p = typeof(T).GetProperty(r.GetName(i), BindingFlags.Instance | BindingFlags.Public | BindingFlags.IgnoreCase);
                    if (p != null && p.CanWrite) p.SetValue(o, Materializer.ConvertTo(r.GetValue(i), p.PropertyType));
                }
                list.Add(o);
            }
            return list;
        }
    }

    public class DbModelBuilder { }

    // ------------------------------------------------------------ varlık kayıtları

    internal sealed class FkInfo
    {
        public string Name;
        public string[] Cols;
        public string RefTable;
        public string[] RefCols;
    }

    internal sealed class NavInfo
    {
        public PropertyInfo Prop;
        public bool Collection;
        public IEntitySet Target;
        public FkInfo Fk;
        public Type ElementType;
    }

    internal sealed class EntityEntry
    {
        public EntityEntry(DbContext ctx, object entity, EntityState state, IEntitySet set) { Context = ctx; Entity = entity; State = state; Set = set; }
        public DbContext Context { get; }
        public object Entity { get; }
        public IEntitySet Set { get; }
        public EntityState State { get; set; }
        public bool NavLoaded { get; set; }
        /// <summary>Sınıfta özelliği olmayan sütunların değerleri (ör. modele alınmamış yabancı anahtarlar)</summary>
        public Dictionary<string, object> Raw { get; } = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
        public Dictionary<string, object> Original { get; private set; } = new Dictionary<string, object>();

        public void Snapshot() => Original = Set.Values(this);

        public bool IsModified()
        {
            var cur = Set.Values(this);
            foreach (var kv in cur) if (!Original.TryGetValue(kv.Key, out var o) || !Equals(o, kv.Value)) return true;
            return false;
        }
    }

    public class DbEntityEntry
    {
        internal readonly EntityEntry e;
        internal DbEntityEntry(EntityEntry e) { this.e = e; }
        public object Entity => e.Entity;
        public EntityState State
        {
            get => e.State == EntityState.Unchanged && e.IsModified() ? EntityState.Modified : e.State;
            set
            {
                var ctx = e.Context;
                bool tracked = ctx.entries.Contains(e);
                if (value == EntityState.Detached) { ctx.entries.Remove(e); e.State = EntityState.Detached; return; }
                if (!tracked) { ctx.entries.Add(e); if (value != EntityState.Added) e.Snapshot(); }
                e.State = value;
            }
        }
        public void Reload() { e.Set.Reload(e); }
    }

    public sealed class DbEntityEntry<TEntity> : DbEntityEntry where TEntity : class
    {
        internal DbEntityEntry(EntityEntry e) : base(e) { }
        public new TEntity Entity => (TEntity)e.Entity;
    }

    internal interface IEntitySet
    {
        Type EntityType { get; }
        string TableName(MySqlConnection conn);
        List<FkInfo> Fks(MySqlConnection conn);
        object GetColumn(EntityEntry e, string column);
        void SetColumn(EntityEntry e, string column, object value);
        object FindOrLoad(MySqlConnection conn, string[] cols, object[] values);
        List<object> LoadWhere(MySqlConnection conn, string[] cols, object[] values);
        Dictionary<string, object> Values(EntityEntry e);
        int Write(MySqlConnection conn, EntityEntry e);
        DbEntityValidationResult Validate(EntityEntry e, bool adding);
        void Reload(EntityEntry e);
    }

    internal static class Materializer
    {
        public static object ConvertTo(object v, Type t)
        {
            if (v == null || v is DBNull) return t.IsValueType && Nullable.GetUnderlyingType(t) == null ? Activator.CreateInstance(t) : null;
            var u = Nullable.GetUnderlyingType(t) ?? t;
            if (u.IsInstanceOfType(v)) return v;
            if (u == typeof(bool)) return Convert.ToDecimal(v, CultureInfo.InvariantCulture) != 0;
            if (u.IsEnum) return Enum.ToObject(u, v);
            if (u == typeof(TimeSpan)) return TimeSpan.Parse(v.ToString(), CultureInfo.InvariantCulture);
            return Convert.ChangeType(v, u, CultureInfo.InvariantCulture);
        }

        public static bool Same(object a, object b) =>
            (a == null || a is DBNull) ? (b == null || b is DBNull) : b != null && !(b is DBNull) && string.Equals(Convert.ToString(a, CultureInfo.InvariantCulture), Convert.ToString(b, CultureInfo.InvariantCulture), StringComparison.Ordinal);
    }

    /// <summary>Bir tablonun kayıtları. LINQ sorguları (Where, FirstOrDefault, ToList, join...) doğrudan kullanılabilir.</summary>
    public class DbSet<TEntity> : IEnumerable<TEntity>, IListSource, IEntitySet where TEntity : class
    {
        readonly DbContext ctx;
        readonly string propertyName;
        string table;
        List<ColumnMap> columns;
        List<ColumnMap> allColumns;
        List<FkInfo> fks;

        sealed class ColumnMap
        {
            public string Column;
            public PropertyInfo Prop; // null: sınıfta karşılığı yok
            public bool Key;
            public bool AutoInc;
            public bool NotNull;
            public int MaxLength;
        }

        internal DbSet(DbContext ctx, string propertyName) { this.ctx = ctx; this.propertyName = propertyName; }

        protected DbSet() { }

        Type IEntitySet.EntityType => typeof(TEntity);

        List<ColumnMap> Columns(MySqlConnection conn)
        {
            if (columns != null) return columns;
            // Tablo adı: varlık sınıfının adı, olmazsa DbSet özelliğinin adı
            foreach (var candidate in new[] { typeof(TEntity).Name, propertyName, propertyName.TrimEnd('s') }.Distinct())
            {
                try
                {
                    using var r = new MySqlCommand("SELECT * FROM `" + candidate.Replace("`", "``") + "` LIMIT 0", conn).ExecuteReader();
                    var schema = r.GetSchemaTable();
                    var all = new List<ColumnMap>();
                    foreach (DataRow row in schema.Rows)
                    {
                        string col = (string)row["ColumnName"];
                        var prop = typeof(TEntity).GetProperty(col, BindingFlags.Instance | BindingFlags.Public | BindingFlags.IgnoreCase);
                        if (prop != null && (!prop.CanWrite || ctx.IsEntityType(prop.PropertyType))) prop = null;
                        all.Add(new ColumnMap { Column = col, Prop = prop, Key = (bool)row["IsKey"], AutoInc = (bool)row["IsAutoIncrement"], NotNull = !(bool)row["AllowDBNull"], MaxLength = (int)row["ColumnSize"] });
                    }
                    table = candidate.ToLowerInvariant();
                    allColumns = all;
                    columns = all.Where(c => c.Prop != null).ToList();
                    return columns;
                }
                catch (MySqlException ex) when (ex.Number == 1146) { }
            }
            throw new MySqlException($"Table '{conn.Database}.{typeof(TEntity).Name.ToLowerInvariant()}' doesn't exist", 1146);
        }

        string IEntitySet.TableName(MySqlConnection conn) { Columns(conn); return table; }

        List<FkInfo> IEntitySet.Fks(MySqlConnection conn)
        {
            if (fks != null) return fks;
            Columns(conn);
            fks = new List<FkInfo>();
            var json = conn.GetTableSchema(table);
            using var doc = System.Text.Json.JsonDocument.Parse(json);
            if (doc.RootElement.TryGetProperty("fks", out var arr))
                foreach (var f in arr.EnumerateArray())
                    fks.Add(new FkInfo
                    {
                        Name = f.GetProperty("name").GetString(),
                        Cols = f.GetProperty("cols").EnumerateArray().Select(x => x.GetString()).ToArray(),
                        RefTable = f.GetProperty("refTable").GetString(),
                        RefCols = f.GetProperty("refCols").EnumerateArray().Select(x => x.GetString()).ToArray(),
                    });
            return fks;
        }

        IEnumerable<ColumnMap> Keys => allColumns.Where(c => c.Key);

        object[] KeyOf(EntityEntry e) => Keys.Select(c => ((IEntitySet)this).GetColumn(e, c.Column)).ToArray();

        static bool KeyEquals(object[] a, object[] b) => a.Length == b.Length && a.Zip(b, Materializer.Same).All(z => z);

        object IEntitySet.GetColumn(EntityEntry e, string column)
        {
            var c = allColumns?.FirstOrDefault(x => string.Equals(x.Column, column, StringComparison.OrdinalIgnoreCase));
            if (c?.Prop != null) return c.Prop.GetValue(e.Entity);
            return e.Raw.TryGetValue(column, out var v) ? v : null;
        }

        void IEntitySet.SetColumn(EntityEntry e, string column, object value)
        {
            var c = allColumns?.FirstOrDefault(x => string.Equals(x.Column, column, StringComparison.OrdinalIgnoreCase));
            if (c?.Prop != null)
            {
                var cur = c.Prop.GetValue(e.Entity);
                var nv = Materializer.ConvertTo(value, c.Prop.PropertyType);
                if (!Materializer.Same(cur, nv)) c.Prop.SetValue(e.Entity, nv);
            }
            else e.Raw[column] = value;
        }

        EntityEntry Materialize(MySqlDataReader r, List<ColumnMap> cols, List<EntityEntry> fresh)
        {
            var values = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
            for (int i = 0; i < r.FieldCount; i++) values[r.GetName(i)] = r.GetValue(i) is DBNull ? null : r.GetValue(i);
            object[] key = Keys.Select(c => values.TryGetValue(c.Column, out var v) ? v : null).ToArray();
            // Kimlik eşlemesi: aynı kayıt için aynı nesne
            var existing = ctx.entries.FirstOrDefault(e => e.Set == (IEntitySet)this && e.State != EntityState.Added && KeyEquals(KeyOf(e), key));
            if (existing != null)
            {
                if (existing.State == EntityState.Unchanged && !existing.IsModified()) { Fill(existing, values); existing.Snapshot(); }
                return existing;
            }
            var entity = Activator.CreateInstance<TEntity>();
            var entry = new EntityEntry(ctx, entity, EntityState.Unchanged, this);
            Fill(entry, values);
            entry.Snapshot();
            ctx.entries.Add(entry);
            fresh.Add(entry);
            return entry;
        }

        void Fill(EntityEntry e, Dictionary<string, object> values)
        {
            foreach (var c in allColumns)
            {
                if (!values.TryGetValue(c.Column, out var v)) continue;
                if (c.Prop != null) c.Prop.SetValue(e.Entity, Materializer.ConvertTo(v, c.Prop.PropertyType));
                else e.Raw[c.Column] = v;
            }
        }

        List<TEntity> Query(string where = null, object[] keyValues = null) => QueryEntries(where, keyValues).Select(e => (TEntity)e.Entity).ToList();

        List<EntityEntry> QueryEntries(string where, object[] keyValues)
        {
            using var conn = ctx.Open();
            return QueryEntries(conn, where, keyValues);
        }

        List<EntityEntry> QueryEntries(MySqlConnection conn, string where, object[] keyValues)
        {
            var cols = Columns(conn);
            var cmd = new MySqlCommand("SELECT * FROM `" + table + "`" + (where ?? ""), conn);
            if (keyValues != null) for (int i = 0; i < keyValues.Length; i++) cmd.Parameters.AddWithValue("@k" + i.ToString(CultureInfo.InvariantCulture), keyValues[i]);
            var list = new List<EntityEntry>();
            var fresh = new List<EntityEntry>();
            using (var r = cmd.ExecuteReader())
                while (r.Read()) list.Add(Materialize(r, cols, fresh));
            // ilişkili nesneleri yükle (her kayıt bir kez; kaydedilenler yeniden)
            foreach (var e in list) ctx.LoadNavigations(e, conn);
            // silinmek üzere işaretlenenler sorguda görünmez
            return list.Where(x => x.State != EntityState.Deleted).ToList();
        }

        static string WhereCols(string[] cols) => " WHERE " + string.Join(" AND ", cols.Select((c, i) => "`" + c.Replace("`", "``") + "` = @k" + i.ToString(CultureInfo.InvariantCulture)));

        object IEntitySet.FindOrLoad(MySqlConnection conn, string[] cols, object[] values)
        {
            Columns(conn);
            var tracked = ctx.entries.FirstOrDefault(e => e.Set == (IEntitySet)this && e.State != EntityState.Deleted && cols.Select((c, i) => Materializer.Same(((IEntitySet)this).GetColumn(e, c), values[i])).All(x => x));
            if (tracked != null) return tracked.Entity;
            return QueryEntries(conn, WhereCols(cols), values).FirstOrDefault()?.Entity;
        }

        List<object> IEntitySet.LoadWhere(MySqlConnection conn, string[] cols, object[] values) => QueryEntries(conn, WhereCols(cols), values).Select(e => e.Entity).ToList();

        public IEnumerator<TEntity> GetEnumerator() => Query().GetEnumerator();
        IEnumerator IEnumerable.GetEnumerator() => GetEnumerator();
        bool IListSource.ContainsListCollection => false;
        IList IListSource.GetList() => Query();

        /// <summary>Bellekteki (izlenen) kayıtlar.</summary>
        public System.Collections.ObjectModel.ObservableCollection<TEntity> Local => new System.Collections.ObjectModel.ObservableCollection<TEntity>(ctx.entries.Where(e => e.Set == (IEntitySet)this && e.State != EntityState.Deleted).Select(e => (TEntity)e.Entity));

        public virtual TEntity Add(TEntity entity)
        {
            if (entity == null) throw new ArgumentNullException(nameof(entity));
            var e = ctx.EntryOf(entity);
            if (e == null) ctx.entries.Add(new EntityEntry(ctx, entity, EntityState.Added, this));
            else if (e.State == EntityState.Deleted) e.State = EntityState.Unchanged;
            return entity;
        }

        public virtual IEnumerable<TEntity> AddRange(IEnumerable<TEntity> entities) { foreach (var x in entities.ToList()) Add(x); return entities; }

        public virtual TEntity Remove(TEntity entity)
        {
            if (entity == null) throw new ArgumentNullException(nameof(entity));
            var e = ctx.EntryOf(entity);
            if (e == null) throw new InvalidOperationException("The object cannot be deleted because it was not found in the ObjectStateManager.");
            if (e.State == EntityState.Added) ctx.entries.Remove(e);
            else e.State = EntityState.Deleted;
            return entity;
        }

        public virtual IEnumerable<TEntity> RemoveRange(IEnumerable<TEntity> entities) { foreach (var x in entities.ToList()) Remove(x); return entities; }

        public virtual TEntity Attach(TEntity entity)
        {
            if (ctx.EntryOf(entity) == null) { var e = new EntityEntry(ctx, entity, EntityState.Unchanged, this); e.Snapshot(); ctx.entries.Add(e); }
            return entity;
        }

        public virtual TEntity Find(params object[] keyValues)
        {
            using var conn = ctx.Open();
            Columns(conn);
            var keys = Keys.ToList();
            if (keyValues == null || keyValues.Length != keys.Count) throw new ArgumentException("The number of primary key values passed must match number of primary key values defined on the entity.", nameof(keyValues));
            return (TEntity)((IEntitySet)this).FindOrLoad(conn, keys.Select(k => k.Column).ToArray(), keyValues);
        }

        public DbSet<TEntity> Include(string path) => this;
        public DbSet<TEntity> AsNoTracking() => this;
        public TEntity Create() => Activator.CreateInstance<TEntity>();

        public IEnumerable<TEntity> SqlQuery(string sql, params object[] parameters)
        {
            using var conn = ctx.Open();
            var cols = Columns(conn);
            var cmd = new MySqlCommand(sql, conn);
            Database.AddParameters(cmd, parameters);
            var list = new List<EntityEntry>();
            var fresh = new List<EntityEntry>();
            using (var r = cmd.ExecuteReader())
                while (r.Read()) list.Add(Materialize(r, cols, fresh));
            foreach (var e in fresh) ctx.LoadNavigations(e, conn);
            return list.Select(e => (TEntity)e.Entity).ToList();
        }

        // ---- IEntitySet

        void Ensure() { if (columns == null) using (var conn = ctx.Open()) Columns(conn); }

        Dictionary<string, object> IEntitySet.Values(EntityEntry e)
        {
            Ensure();
            var d = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
            foreach (var c in allColumns)
            {
                if (c.Prop != null) d[c.Column] = c.Prop.GetValue(e.Entity);
                else if (e.Raw.TryGetValue(c.Column, out var v)) d[c.Column] = v;
            }
            return d;
        }

        DbEntityValidationResult IEntitySet.Validate(EntityEntry e, bool adding)
        {
            Ensure();
            var errors = new List<DbValidationError>();
            using var conn = ctx.Open();
            // ilişkiyle doldurulacak yabancı anahtarlar zorunlu sayılmaz
            var navFk = new HashSet<string>(ctx.NavsOf(this, conn).Where(n => !n.Collection && n.Prop.GetValue(e.Entity) != null).SelectMany(n => n.Fk.Cols), StringComparer.OrdinalIgnoreCase);
            foreach (var c in columns)
            {
                var v = c.Prop.GetValue(e.Entity);
                if (c.NotNull && !c.AutoInc && v == null && !navFk.Contains(c.Column)) errors.Add(new DbValidationError(c.Prop.Name, $"The {c.Prop.Name} field is required."));
                if (v is string s && c.MaxLength > 0 && c.MaxLength < 65535 && s.Length > c.MaxLength) errors.Add(new DbValidationError(c.Prop.Name, $"The field {c.Prop.Name} must be a string or array type with a maximum length of '{c.MaxLength}'."));
            }
            return errors.Count == 0 ? null : new DbEntityValidationResult(e.Entity, errors);
        }

        int IEntitySet.Write(MySqlConnection conn, EntityEntry e)
        {
            Columns(conn);
            var t = "`" + table + "`";
            var cmd = new MySqlCommand { Connection = conn };
            int k = 0;
            string P(object v) { string n = "@v" + (k++).ToString(CultureInfo.InvariantCulture); cmd.Parameters.AddWithValue(n, v ?? DBNull.Value); return n; }
            var me = (IEntitySet)this;
            string Where() => " WHERE " + string.Join(" AND ", Keys.Select(c => "`" + c.Column + "` = " + P(e.State == EntityState.Modified && e.Original.TryGetValue(c.Column, out var o) ? o : me.GetColumn(e, c.Column))));
            var cur = me.Values(e);
            switch (e.State)
            {
                case EntityState.Added:
                {
                    var ins = allColumns.Where(c => cur.ContainsKey(c.Column) && !(c.AutoInc && IsDefault(cur[c.Column]))).ToList();
                    cmd.CommandText = $"INSERT INTO {t} (" + string.Join(", ", ins.Select(c => "`" + c.Column + "`")) + ") VALUES (" + string.Join(", ", ins.Select(c => P(cur[c.Column]))) + ")";
                    int n = cmd.ExecuteNonQuery();
                    var ai = allColumns.FirstOrDefault(c => c.AutoInc);
                    if (ai != null && IsDefault(me.GetColumn(e, ai.Column)) && cmd.LastInsertedId > 0) me.SetColumn(e, ai.Column, cmd.LastInsertedId);
                    return n;
                }
                case EntityState.Modified:
                {
                    var changed = allColumns.Where(c => cur.ContainsKey(c.Column) && (!e.Original.TryGetValue(c.Column, out var o) || !Equals(o, cur[c.Column]))).ToList();
                    if (changed.Count == 0) return 0;
                    cmd.CommandText = $"UPDATE {t} SET " + string.Join(", ", changed.Select(c => "`" + c.Column + "` = " + P(cur[c.Column]))) + Where();
                    int n = cmd.ExecuteNonQuery();
                    if (n == 0) throw new DbUpdateConcurrencyException("Store update, insert, or delete statement affected an unexpected number of rows (0). Entities may have been modified or deleted since entities were loaded.");
                    return n;
                }
                case EntityState.Deleted:
                {
                    cmd.CommandText = $"DELETE FROM {t}" + Where();
                    int n = cmd.ExecuteNonQuery();
                    if (n == 0) throw new DbUpdateConcurrencyException("Store update, insert, or delete statement affected an unexpected number of rows (0). Entities may have been modified or deleted since entities were loaded.");
                    return n;
                }
            }
            return 0;
        }

        void IEntitySet.Reload(EntityEntry e)
        {
            var key = KeyOf(e);
            e.State = EntityState.Unchanged;
            e.Snapshot();
            e.NavLoaded = false;
            QueryEntries(WhereCols(Keys.Select(c => c.Column).ToArray()), key);
            using var conn = ctx.Open();
            ctx.LoadNavigations(e, conn);
        }

        static bool IsDefault(object v) => v == null || (v is IConvertible c && c.GetTypeCode() is >= TypeCode.SByte and <= TypeCode.Decimal && Convert.ToDecimal(v, CultureInfo.InvariantCulture) == 0);
    }
}

namespace System.Data.Entity.Infrastructure
{
    public class UnintentionalCodeFirstException : InvalidOperationException
    {
        public UnintentionalCodeFirstException() : base("The context is being used in Code First mode with code that was generated from an EDMX file for either Database First or Model First development.") { }
    }

    public class DbUpdateException : DataException
    {
        public DbUpdateException(string message, Exception inner) : base(message, inner) { }
    }

    public class DbUpdateConcurrencyException : DbUpdateException
    {
        public DbUpdateConcurrencyException(string message) : base(message, null) { }
    }
}

namespace System.Data.Entity.Core
{
    public class UpdateException : DataException
    {
        public UpdateException(string message, Exception inner) : base(message, inner) { }
    }
}

namespace System.Data.Entity.Validation
{
    public sealed class DbValidationError
    {
        public DbValidationError(string propertyName, string errorMessage) { PropertyName = propertyName; ErrorMessage = errorMessage; }
        public string PropertyName { get; }
        public string ErrorMessage { get; }
    }

    public sealed class DbEntityValidationResult
    {
        public DbEntityValidationResult(object entity, IEnumerable<DbValidationError> errors) { Entity = entity; ValidationErrors = errors.ToList(); }
        public object Entity { get; }
        public ICollection<DbValidationError> ValidationErrors { get; }
        public bool IsValid => ValidationErrors.Count == 0;
    }

    public class DbEntityValidationException : DataException
    {
        public DbEntityValidationException(string message, IEnumerable<DbEntityValidationResult> results) : base(message + " " + string.Join(" ", results.SelectMany(r => r.ValidationErrors).Select(e => e.ErrorMessage))) { EntityValidationErrors = results.ToList(); }
        public IEnumerable<DbEntityValidationResult> EntityValidationErrors { get; }
    }
}
