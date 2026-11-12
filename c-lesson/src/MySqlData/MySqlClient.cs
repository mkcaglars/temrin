using System;
using System.Collections;
using System.Collections.Generic;
using System.Data;
using System.Data.Common;
using System.Globalization;
using System.Linq;
using System.Text;
using System.Text.Json;
using MiniWinForms;

namespace MySql.Data.MySqlClient
{
    /// <summary>MySQL sunucusunun döndürdüğü hata (Number: MySQL hata kodu).</summary>
    public sealed class MySqlException : DbException
    {
        readonly string sqlState;
        public MySqlException(string message, int number = 0, string sqlState = null) : base(message) { Number = number; this.sqlState = sqlState; }
        public int Number { get; }
        public override string SqlState => sqlState;
        public override int ErrorCode => Number;
    }

    public enum MySqlDbType
    {
        Decimal = 0, Byte = 1, Int16 = 2, Int24 = 9, Int32 = 3, Int64 = 8, Float = 4, Double = 5, Timestamp = 7, Date = 10, Time = 11, DateTime = 12,
        Year = 13, Newdate = 14, VarString = 15, Bit = 16, JSON = 245, NewDecimal = 246, Enum = 247, Set = 248, TinyBlob = 249, MediumBlob = 250,
        LongBlob = 251, Blob = 252, VarChar = 253, String = 254, Geometry = 255, UByte = 501, UInt16 = 502, UInt24 = 509, UInt32 = 503, UInt64 = 508,
        Binary = 600, VarBinary = 601, TinyText = 749, MediumText = 750, LongText = 751, Text = 752, Guid = 800,
    }

    /// <summary>Tarayıcıdaki MySQL simülatörü ile konuşan köprü.</summary>
    internal static class Bridge
    {
        public static JsonElement Call(string op, object payload)
        {
            string json = JsonSerializer.Serialize(payload);
            string res = Ui.Backend.Sql(op, json);
            using var doc = JsonDocument.Parse(string.IsNullOrEmpty(res) ? "{}" : res);
            var root = doc.RootElement.Clone();
            if (root.TryGetProperty("error", out var e))
            {
                int code = e.TryGetProperty("code", out var c) ? c.GetInt32() : 0;
                string msg = e.TryGetProperty("message", out var m) ? m.GetString() : "MySQL hatası";
                string state = e.TryGetProperty("state", out var s) ? s.GetString() : null;
                if (e.TryGetProperty("kind", out var k) && k.GetString() == "invalid") throw new InvalidOperationException(msg);
                throw new MySqlException(msg, code, state);
            }
            return root;
        }
    }

    public sealed class MySqlConnection : DbConnection, ICloneable
    {
        string connectionString = "";
        int id;
        ConnectionState state = ConnectionState.Closed;
        string database = "";
        string serverVersion = "";

        public MySqlConnection() { }
        public MySqlConnection(string connectionString) { ConnectionString = connectionString; }

        public override string ConnectionString
        {
            get => connectionString;
            set
            {
                if (state != ConnectionState.Closed) throw new InvalidOperationException("Not allowed to change the 'ConnectionString' property while the connection (state=Open).");
                connectionString = value ?? "";
                database = ParseDatabase(connectionString);
            }
        }

        static string ParseDatabase(string cs)
        {
            foreach (var part in cs.Split(';'))
            {
                int i = part.IndexOf('=');
                if (i < 0) continue;
                var k = part.Substring(0, i).Trim().ToLowerInvariant().Replace(" ", "");
                if (k == "database" || k == "initialcatalog") return part.Substring(i + 1).Trim();
            }
            return "";
        }

        public override string Database => database;
        public override string DataSource => "localhost";
        public override string ServerVersion => state == ConnectionState.Open ? serverVersion : throw new InvalidOperationException("Connection must be valid and open.");
        public override ConnectionState State => state;
        internal int Id => id;

        public override void Open()
        {
            if (state == ConnectionState.Open) throw new InvalidOperationException("The connection is already open.");
            if (string.IsNullOrWhiteSpace(connectionString)) throw new InvalidOperationException("The ConnectionString property has not been initialized.");
            var r = Bridge.Call("open", new { cs = connectionString });
            id = r.GetProperty("id").GetInt32();
            serverVersion = r.TryGetProperty("version", out var v) ? v.GetString() : "8.0";
            if (r.TryGetProperty("database", out var d) && d.ValueKind == JsonValueKind.String) database = d.GetString();
            var old = state;
            state = ConnectionState.Open;
            OnStateChange(new StateChangeEventArgs(old, state));
        }

        public override void Close()
        {
            if (state == ConnectionState.Closed) return;
            try { Bridge.Call("close", new { id }); } catch (MySqlException) { }
            state = ConnectionState.Closed;
            OnStateChange(new StateChangeEventArgs(ConnectionState.Open, ConnectionState.Closed));
        }

        public override void ChangeDatabase(string databaseName)
        {
            EnsureOpen();
            Bridge.Call("use", new { id, db = databaseName });
            database = databaseName;
        }

        internal void EnsureOpen()
        {
            if (state != ConnectionState.Open) throw new InvalidOperationException("Connection must be valid and open.");
        }

        public new MySqlTransaction BeginTransaction() => (MySqlTransaction)BeginDbTransaction(IsolationLevel.Unspecified);
        public new MySqlTransaction BeginTransaction(IsolationLevel level) => (MySqlTransaction)BeginDbTransaction(level);

        protected override DbTransaction BeginDbTransaction(IsolationLevel isolationLevel)
        {
            EnsureOpen();
            new MySqlCommand("START TRANSACTION", this).ExecuteNonQuery();
            return new MySqlTransaction(this, isolationLevel);
        }

        public new MySqlCommand CreateCommand() => new MySqlCommand { Connection = this };
        protected override DbCommand CreateDbCommand() => CreateCommand();

        public object Clone() => new MySqlConnection(connectionString);

        protected override void Dispose(bool disposing)
        {
            if (disposing) Close();
            base.Dispose(disposing);
        }

        public static void ClearPool(MySqlConnection connection) { }
        public static void ClearAllPools() { }
        public bool Ping() => state == ConnectionState.Open;

        /// <summary>Tablonun birincil ve yabancı anahtarlarını JSON olarak döndürür (Entity Framework için).</summary>
        [System.ComponentModel.EditorBrowsable(System.ComponentModel.EditorBrowsableState.Never)]
        public string GetTableSchema(string table)
        {
            EnsureOpen();
            return Bridge.Call("schema", new { id, table }).GetRawText();
        }
    }

    public sealed class MySqlTransaction : DbTransaction
    {
        readonly MySqlConnection conn;
        bool done;
        internal MySqlTransaction(MySqlConnection conn, IsolationLevel level) { this.conn = conn; IsolationLevel = level; }
        public new MySqlConnection Connection => conn;
        protected override DbConnection DbConnection => conn;
        public override IsolationLevel IsolationLevel { get; }
        public override void Commit() { if (done) throw new InvalidOperationException("Transaction has already been committed or is not pending"); done = true; new MySqlCommand("COMMIT", conn).ExecuteNonQuery(); }
        public override void Rollback() { if (done) throw new InvalidOperationException("Transaction has already been committed or is not pending"); done = true; new MySqlCommand("ROLLBACK", conn).ExecuteNonQuery(); }
        protected override void Dispose(bool disposing) { if (disposing && !done && conn.State == ConnectionState.Open) { try { Rollback(); } catch (MySqlException) { } } base.Dispose(disposing); }
    }

    public sealed class MySqlParameter : DbParameter, ICloneable
    {
        string name = "";
        object value;
        MySqlDbType mySqlDbType = MySqlDbType.VarChar;
        DbType dbType = DbType.String;
        bool typeSet;

        public MySqlParameter() { }
        public MySqlParameter(string parameterName, object value) { ParameterName = parameterName; Value = value; }
        public MySqlParameter(string parameterName, MySqlDbType dbType) { ParameterName = parameterName; MySqlDbType = dbType; }
        public MySqlParameter(string parameterName, MySqlDbType dbType, int size) : this(parameterName, dbType) { Size = size; }
        public MySqlParameter(string parameterName, MySqlDbType dbType, int size, string sourceColumn) : this(parameterName, dbType, size) { SourceColumn = sourceColumn; }

        public override DbType DbType { get => dbType; set { dbType = value; typeSet = true; } }
        public MySqlDbType MySqlDbType { get => mySqlDbType; set { mySqlDbType = value; typeSet = true; } }
        public override ParameterDirection Direction { get; set; } = ParameterDirection.Input;
        public override bool IsNullable { get; set; }
        public override string ParameterName { get => name; set => name = value ?? ""; }
        public override int Size { get; set; }
        public override string SourceColumn { get; set; } = "";
        public override bool SourceColumnNullMapping { get; set; }
        public override DataRowVersion SourceVersion { get; set; } = DataRowVersion.Current;
        public override object Value { get => value; set => this.value = value; }
        public override void ResetDbType() { typeSet = false; dbType = DbType.String; mySqlDbType = MySqlDbType.VarChar; }
        internal bool TypeSet => typeSet;
        public object Clone() => new MySqlParameter(name, value) { mySqlDbType = mySqlDbType, dbType = dbType, typeSet = typeSet, Size = Size, SourceColumn = SourceColumn, Direction = Direction };
        public override string ToString() => name;
    }

    public sealed class MySqlParameterCollection : DbParameterCollection
    {
        readonly List<MySqlParameter> list = new List<MySqlParameter>();

        public new MySqlParameter this[int index] { get => list[index]; set => list[index] = value; }
        public new MySqlParameter this[string name] { get => list[IndexOfChecked(name)]; set => list[IndexOfChecked(name)] = value; }

        int IndexOfChecked(string name)
        {
            int i = IndexOf(name);
            if (i < 0) throw new ArgumentException($"Parameter '{name}' not found in the collection.");
            return i;
        }

        public MySqlParameter Add(MySqlParameter p)
        {
            if (p == null) throw new ArgumentNullException(nameof(p));
            if (!string.IsNullOrEmpty(p.ParameterName) && IndexOf(p.ParameterName) >= 0) throw new MySqlException($"Parameter '{p.ParameterName}' has already been defined.");
            list.Add(p);
            return p;
        }
        public MySqlParameter Add(string parameterName, MySqlDbType dbType) => Add(new MySqlParameter(parameterName, dbType));
        public MySqlParameter Add(string parameterName, MySqlDbType dbType, int size) => Add(new MySqlParameter(parameterName, dbType, size));
        public MySqlParameter Add(string parameterName, MySqlDbType dbType, int size, string sourceColumn) => Add(new MySqlParameter(parameterName, dbType, size, sourceColumn));
        public MySqlParameter AddWithValue(string parameterName, object value) => Add(new MySqlParameter(parameterName, value));

        public override int Add(object value) { Add((MySqlParameter)value); return list.Count - 1; }
        public override void AddRange(Array values) { foreach (var v in values) Add(v); }
        public override void Clear() => list.Clear();
        public override bool Contains(object value) => value is MySqlParameter p && list.Contains(p);
        public override bool Contains(string value) => IndexOf(value) >= 0;
        public override void CopyTo(Array array, int index) => ((ICollection)list).CopyTo(array, index);
        public override int Count => list.Count;
        public override IEnumerator GetEnumerator() => list.GetEnumerator();
        protected override DbParameter GetParameter(int index) => list[index];
        protected override DbParameter GetParameter(string parameterName) => list[IndexOfChecked(parameterName)];
        public override int IndexOf(object value) => value is MySqlParameter p ? list.IndexOf(p) : -1;
        public override int IndexOf(string parameterName)
        {
            string n = Norm(parameterName);
            return list.FindIndex(p => Norm(p.ParameterName) == n);
        }
        internal static string Norm(string n) => (n ?? "").TrimStart('@', '?').ToLowerInvariant();
        public override void Insert(int index, object value) => list.Insert(index, (MySqlParameter)value);
        public override void Remove(object value) => list.Remove((MySqlParameter)value);
        public override void RemoveAt(int index) => list.RemoveAt(index);
        public override void RemoveAt(string parameterName) => list.RemoveAt(IndexOfChecked(parameterName));
        protected override void SetParameter(int index, DbParameter value) => list[index] = (MySqlParameter)value;
        protected override void SetParameter(string parameterName, DbParameter value) => list[IndexOfChecked(parameterName)] = (MySqlParameter)value;
        public override object SyncRoot => ((ICollection)list).SyncRoot;
        internal IEnumerable<MySqlParameter> Items => list;
    }

    public sealed class MySqlCommand : DbCommand, ICloneable
    {
        MySqlConnection connection;
        string commandText = "";
        readonly MySqlParameterCollection parameters = new MySqlParameterCollection();

        public MySqlCommand() { }
        public MySqlCommand(string cmdText) { CommandText = cmdText; }
        public MySqlCommand(string cmdText, MySqlConnection connection) { CommandText = cmdText; Connection = connection; }
        public MySqlCommand(string cmdText, MySqlConnection connection, MySqlTransaction transaction) : this(cmdText, connection) { Transaction = transaction; }

        public override string CommandText { get => commandText; set => commandText = value ?? ""; }
        public override int CommandTimeout { get; set; } = 30;
        public override CommandType CommandType { get; set; } = CommandType.Text;
        public override bool DesignTimeVisible { get; set; }
        public override UpdateRowSource UpdatedRowSource { get; set; } = UpdateRowSource.Both;
        public new MySqlConnection Connection { get => connection; set => connection = value; }
        protected override DbConnection DbConnection { get => connection; set => connection = (MySqlConnection)value; }
        public new MySqlParameterCollection Parameters => parameters;
        protected override DbParameterCollection DbParameterCollection => parameters;
        public new MySqlTransaction Transaction { get; set; }
        protected override DbTransaction DbTransaction { get => Transaction; set => Transaction = (MySqlTransaction)value; }
        public long LastInsertedId { get; private set; } = -1;

        public override void Cancel() { }
        public override void Prepare() { }
        public new MySqlParameter CreateParameter() => new MySqlParameter();
        protected override DbParameter CreateDbParameter() => CreateParameter();
        public object Clone() { var c = new MySqlCommand(commandText, connection) { CommandType = CommandType, Transaction = Transaction }; foreach (var p in parameters.Items) c.Parameters.Add((MySqlParameter)p.Clone()); return c; }

        internal JsonElement Run()
        {
            if (connection == null) throw new InvalidOperationException("Connection must be valid and open.");
            connection.EnsureOpen();
            if (string.IsNullOrWhiteSpace(commandText)) throw new InvalidOperationException("The CommandText property has not been properly initialized.");
            string sql = commandText;
            List<(MySqlParameter p, string v)> outs = null;
            if (CommandType == CommandType.StoredProcedure)
            {
                // Connector/NET gibi: parametreler yordam tanımındaki adlarla eşleştirilir, CALL komutu kurulur
                var info = Bridge.Call("routine", new { id = connection.Id, name = commandText.Trim() });
                var args = new List<string>();
                var pre = new StringBuilder();
                outs = new List<(MySqlParameter, string)>();
                foreach (var pi in info.GetProperty("params").EnumerateArray())
                {
                    string pn = pi.GetProperty("name").GetString();
                    string mode = pi.GetProperty("mode").GetString();
                    var prm = parameters.Items.FirstOrDefault(x => MySqlParameterCollection.Norm(x.ParameterName) == pn.ToLowerInvariant());
                    if (prm == null) throw new ArgumentException($"Parameter '{pn}' not found in the collection.");
                    if (mode == "IN" && prm.Direction == ParameterDirection.Input) { args.Add("@" + MySqlParameterCollection.Norm(prm.ParameterName)); continue; }
                    string v = "@_cnet_" + pn.ToLowerInvariant();
                    if (mode == "INOUT" || prm.Direction == ParameterDirection.InputOutput) pre.Append($"SET {v} = @{MySqlParameterCollection.Norm(prm.ParameterName)}; ");
                    args.Add(v);
                    if (mode != "IN") outs.Add((prm, v));
                }
                sql = pre + "CALL " + info.GetProperty("name").GetString() + "(" + string.Join(", ", args) + ")";
                if (outs.Count > 0) sql += "; SELECT " + string.Join(", ", outs.Select(o => o.v));
            }
            if (CommandType == CommandType.TableDirect) sql = "SELECT * FROM " + sql;
            var ps = parameters.Items.Select(p => new { name = MySqlParameterCollection.Norm(p.ParameterName), kind = Kind(p.Value), value = Encode(p.Value) }).ToArray();
            var r = Bridge.Call("exec", new { id = connection.Id, sql, @params = ps });
            if (outs != null && outs.Count > 0)
            {
                // son sonuç kümesi OUT parametre değerleri: parametrelere yaz ve sonuçlardan çıkar
                var list = r.GetProperty("results").EnumerateArray().ToList();
                var last = list[list.Count - 1];
                var cols = MySqlDataReader.ReadColumns(last);
                var vals = last.GetProperty("rows").EnumerateArray().First().EnumerateArray().ToList();
                for (int i = 0; i < outs.Count; i++)
                {
                    object v = MySqlDataReader.Convert(vals[i], cols[i]);
                    outs[i].p.Value = v ?? DBNull.Value;
                }
                var kept = list.Take(list.Count - 1).Where(x => !(x.TryGetProperty("affected", out _) && !x.TryGetProperty("rows", out _) && list.IndexOf(x) < list.Count - 2)).ToList();
                var json = "{\"results\":[" + string.Join(",", kept.Select(x => x.GetRawText())) + "]}";
                r = JsonDocument.Parse(json).RootElement.Clone();
            }
            if (r.TryGetProperty("insertId", out var ins) && ins.ValueKind == JsonValueKind.Number) LastInsertedId = ins.GetInt64();
            else if (r.TryGetProperty("results", out var rs))
                foreach (var x in rs.EnumerateArray())
                    if (x.TryGetProperty("insertId", out var xi) && xi.ValueKind == JsonValueKind.Number) LastInsertedId = xi.GetInt64();
            return r;
        }

        static string Kind(object v) => v switch
        {
            null => "null",
            DBNull => "null",
            string => "str",
            char => "str",
            bool => "bool",
            DateTime => "date",
            DateTimeOffset => "date",
            TimeSpan => "str",
            byte[] => "bytes",
            Enum => "num",
            _ when v is IConvertible c && IsNumber(c.GetTypeCode()) => "num",
            _ => "str",
        };

        static bool IsNumber(TypeCode t) => t >= TypeCode.SByte && t <= TypeCode.Decimal;

        static string Encode(object v) => v switch
        {
            null => null,
            DBNull => null,
            bool b => b ? "1" : "0",
            DateTime d => d.TimeOfDay == TimeSpan.Zero ? d.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) : d.ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture),
            DateTimeOffset d => d.ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture),
            TimeSpan t => t.ToString("c", CultureInfo.InvariantCulture),
            byte[] bytes => Convert.ToBase64String(bytes),
            Enum e => Convert.ToInt64(e, CultureInfo.InvariantCulture).ToString(CultureInfo.InvariantCulture),
            IFormattable f => f.ToString(null, CultureInfo.InvariantCulture),
            _ => v.ToString(),
        };

        public override int ExecuteNonQuery()
        {
            var r = Run();
            int total = 0;
            foreach (var res in r.GetProperty("results").EnumerateArray())
                if (res.TryGetProperty("affected", out var a)) total += a.GetInt32();
            return total;
        }

        public override object ExecuteScalar()
        {
            var r = Run();
            foreach (var res in r.GetProperty("results").EnumerateArray())
            {
                if (!res.TryGetProperty("rows", out var rows)) continue;
                var cols = MySqlDataReader.ReadColumns(res);
                foreach (var row in rows.EnumerateArray())
                {
                    var e = row.EnumerateArray().FirstOrDefault();
                    return MySqlDataReader.Convert(e, cols[0]) ?? DBNull.Value;
                }
                return null;
            }
            return null;
        }

        public new MySqlDataReader ExecuteReader() => ExecuteReader(CommandBehavior.Default);
        public new MySqlDataReader ExecuteReader(CommandBehavior behavior)
        {
            var r = Run();
            return new MySqlDataReader(r, behavior.HasFlag(CommandBehavior.CloseConnection) ? connection : null);
        }
        protected override DbDataReader ExecuteDbDataReader(CommandBehavior behavior) => ExecuteReader(behavior);
    }

    internal sealed class ColumnInfo
    {
        public string Name;
        public string Type;
        public int Scale;
        public bool Unsigned;
        public int Length;
        public string Table;
        public string Column;
        public bool Pk;
        public bool AutoInc;
        public bool NotNull;
        public Type ClrType;
    }

    public sealed class MySqlDataReader : DbDataReader
    {
        readonly List<(List<ColumnInfo> cols, List<object[]> rows, int affected)> sets = new List<(List<ColumnInfo>, List<object[]>, int)>();
        readonly MySqlConnection closeOnDispose;
        int set;
        int row = -1;
        bool closed;

        internal MySqlDataReader(JsonElement r, MySqlConnection closeConnection)
        {
            closeOnDispose = closeConnection;
            int affected = 0;
            foreach (var res in r.GetProperty("results").EnumerateArray())
            {
                if (!res.TryGetProperty("rows", out var rows)) { if (res.TryGetProperty("affected", out var a)) affected += a.GetInt32(); continue; }
                var cols = ReadColumns(res);
                var list = new List<object[]>();
                foreach (var rw in rows.EnumerateArray())
                {
                    var vals = new object[cols.Count];
                    int i = 0;
                    foreach (var e in rw.EnumerateArray()) { if (i < vals.Length) vals[i] = Convert(e, cols[i]) ?? DBNull.Value; i++; }
                    list.Add(vals);
                }
                sets.Add((cols, list, affected));
            }
            if (sets.Count == 0) sets.Add((new List<ColumnInfo>(), new List<object[]>(), affected));
            recordsAffected = affected;
        }

        readonly int recordsAffected;

        internal static List<ColumnInfo> ReadColumns(JsonElement res)
        {
            var cols = new List<ColumnInfo>();
            foreach (var c in res.GetProperty("columns").EnumerateArray())
            {
                var ci = new ColumnInfo
                {
                    Name = c.GetProperty("name").GetString(),
                    Type = c.TryGetProperty("type", out var t) ? t.GetString() : "varchar",
                    Scale = c.TryGetProperty("scale", out var s) && s.ValueKind == JsonValueKind.Number ? s.GetInt32() : 0,
                    Length = c.TryGetProperty("len", out var l) && l.ValueKind == JsonValueKind.Number ? l.GetInt32() : 0,
                    Unsigned = c.TryGetProperty("unsigned", out var u) && u.ValueKind == JsonValueKind.True,
                    Table = c.TryGetProperty("table", out var tb) && tb.ValueKind == JsonValueKind.String ? tb.GetString() : null,
                    Column = c.TryGetProperty("column", out var cl) && cl.ValueKind == JsonValueKind.String ? cl.GetString() : null,
                    Pk = c.TryGetProperty("pk", out var pk) && pk.ValueKind == JsonValueKind.True,
                    AutoInc = c.TryGetProperty("autoInc", out var ai) && ai.ValueKind == JsonValueKind.True,
                    NotNull = c.TryGetProperty("notNull", out var nn) && nn.ValueKind == JsonValueKind.True,
                };
                ci.ClrType = ClrTypeOf(ci);
                cols.Add(ci);
            }
            return cols;
        }

        static Type ClrTypeOf(ColumnInfo c) => c.Type switch
        {
            "tinyint" => c.Length == 1 && !c.Unsigned ? typeof(bool) : c.Unsigned ? typeof(byte) : typeof(sbyte),
            "smallint" => c.Unsigned ? typeof(ushort) : typeof(short),
            "mediumint" or "int" or "integer" => c.Unsigned ? typeof(uint) : typeof(int),
            "bigint" => c.Unsigned ? typeof(ulong) : typeof(long),
            "year" => typeof(int),
            "bit" => typeof(ulong),
            "decimal" => typeof(decimal),
            "float" => typeof(float),
            "double" => typeof(double),
            "date" or "datetime" or "timestamp" => typeof(DateTime),
            "time" => typeof(TimeSpan),
            "blob" or "tinyblob" or "mediumblob" or "longblob" or "binary" or "varbinary" => typeof(byte[]),
            _ => typeof(string),
        };

        internal static object Convert(JsonElement e, ColumnInfo c)
        {
            if (e.ValueKind == JsonValueKind.Null || e.ValueKind == JsonValueKind.Undefined) return null;
            var inv = CultureInfo.InvariantCulture;
            try
            {
                if (c.ClrType == typeof(string)) return e.ValueKind == JsonValueKind.String ? e.GetString() : e.GetRawText();
                if (c.ClrType == typeof(byte[])) return System.Convert.FromBase64String(e.GetString());
                if (c.ClrType == typeof(DateTime))
                {
                    var s = e.GetString();
                    return DateTime.ParseExact(s, s.Length > 10 ? "yyyy-MM-dd HH:mm:ss" : "yyyy-MM-dd", inv);
                }
                if (c.ClrType == typeof(TimeSpan)) return TimeSpan.Parse(e.GetString(), inv);
                var num = e.ValueKind == JsonValueKind.Number ? e.GetRawText() : e.GetString();
                if (c.ClrType == typeof(decimal))
                {
                    // MySQL DECIMAL(7,2) değeri her zaman 2 basamaklı ölçekle gelir (9500.50)
                    var dv = Math.Round(decimal.Parse(num, NumberStyles.Float, inv), c.Scale);
                    return c.Scale > 0 ? decimal.Parse(dv.ToString("F" + c.Scale, inv), inv) : dv;
                }
                if (c.ClrType == typeof(double)) return double.Parse(num, NumberStyles.Float, inv);
                if (c.ClrType == typeof(float)) return float.Parse(num, NumberStyles.Float, inv);
                if (c.ClrType == typeof(bool)) return decimal.Parse(num, NumberStyles.Float, inv) != 0;
                var d = decimal.Parse(num, NumberStyles.Float, inv);
                return System.Convert.ChangeType(Math.Round(d), c.ClrType, inv);
            }
            catch (Exception)
            {
                return e.ValueKind == JsonValueKind.String ? e.GetString() : e.GetRawText();
            }
        }

        List<ColumnInfo> Cols => sets[set].cols;
        List<object[]> Rows => sets[set].rows;
        object[] Current
        {
            get
            {
                if (closed) throw new InvalidOperationException("Invalid attempt to access a field before calling Read()");
                if (row < 0 || row >= Rows.Count) throw new MySqlException("Invalid attempt to access a field before calling Read()");
                return Rows[row];
            }
        }

        public override bool Read()
        {
            if (closed) throw new InvalidOperationException("Invalid attempt to Read when reader is closed.");
            if (row + 1 >= Rows.Count) { row = Rows.Count; return false; }
            row++;
            return true;
        }

        public override bool NextResult()
        {
            if (set + 1 >= sets.Count) return false;
            set++;
            row = -1;
            return true;
        }

        public override int FieldCount => Cols.Count;
        public override bool HasRows => Rows.Count > 0;
        public override bool IsClosed => closed;
        public override int RecordsAffected => recordsAffected;
        public override int Depth => 0;
        public override object this[int ordinal] => GetValue(ordinal);
        public override object this[string name] => GetValue(GetOrdinal(name));

        public override string GetName(int ordinal) => Cols[ordinal].Name;
        public override int GetOrdinal(string name)
        {
            int i = Cols.FindIndex(c => c.Name == name);
            if (i < 0) i = Cols.FindIndex(c => string.Equals(c.Name, name, StringComparison.OrdinalIgnoreCase));
            if (i < 0) throw new IndexOutOfRangeException($"Could not find specified column in results: {name}");
            return i;
        }
        public override Type GetFieldType(int ordinal) => Cols[ordinal].ClrType;
        public override string GetDataTypeName(int ordinal) => Cols[ordinal].Type.ToUpperInvariant();
        public override object GetValue(int ordinal) => Current[ordinal];
        public override int GetValues(object[] values)
        {
            int n = Math.Min(values.Length, FieldCount);
            Array.Copy(Current, values, n);
            return n;
        }
        public override bool IsDBNull(int ordinal) => Current[ordinal] is DBNull;
        public bool IsDBNull(string name) => IsDBNull(GetOrdinal(name));

        object NotNull(int ordinal)
        {
            var v = Current[ordinal];
            if (v is DBNull) throw new System.Data.SqlTypes.SqlNullValueException("Data is Null. This method or property cannot be called on Null values.");
            return v;
        }

        public override string GetString(int ordinal) { var v = NotNull(ordinal); return v is DateTime d ? d.ToString(CultureInfo.CurrentCulture) : System.Convert.ToString(v, CultureInfo.CurrentCulture); }
        public override int GetInt32(int ordinal) => System.Convert.ToInt32(NotNull(ordinal), CultureInfo.InvariantCulture);
        public override long GetInt64(int ordinal) => System.Convert.ToInt64(NotNull(ordinal), CultureInfo.InvariantCulture);
        public override short GetInt16(int ordinal) => System.Convert.ToInt16(NotNull(ordinal), CultureInfo.InvariantCulture);
        public override byte GetByte(int ordinal) => System.Convert.ToByte(NotNull(ordinal), CultureInfo.InvariantCulture);
        public override bool GetBoolean(int ordinal) => System.Convert.ToBoolean(NotNull(ordinal), CultureInfo.InvariantCulture);
        public override char GetChar(int ordinal) => GetString(ordinal)[0];
        public override decimal GetDecimal(int ordinal) => System.Convert.ToDecimal(NotNull(ordinal), CultureInfo.InvariantCulture);
        public override double GetDouble(int ordinal) => System.Convert.ToDouble(NotNull(ordinal), CultureInfo.InvariantCulture);
        public override float GetFloat(int ordinal) => System.Convert.ToSingle(NotNull(ordinal), CultureInfo.InvariantCulture);
        public override DateTime GetDateTime(int ordinal) { var v = NotNull(ordinal); return v is DateTime d ? d : DateTime.Parse(System.Convert.ToString(v, CultureInfo.InvariantCulture), CultureInfo.InvariantCulture); }
        public override Guid GetGuid(int ordinal) => Guid.Parse(GetString(ordinal));
        public TimeSpan GetTimeSpan(int ordinal) => (TimeSpan)NotNull(ordinal);
        public string GetString(string column) => GetString(GetOrdinal(column));
        public int GetInt32(string column) => GetInt32(GetOrdinal(column));
        public long GetInt64(string column) => GetInt64(GetOrdinal(column));
        public short GetInt16(string column) => GetInt16(GetOrdinal(column));
        public bool GetBoolean(string column) => GetBoolean(GetOrdinal(column));
        public decimal GetDecimal(string column) => GetDecimal(GetOrdinal(column));
        public double GetDouble(string column) => GetDouble(GetOrdinal(column));
        public float GetFloat(string column) => GetFloat(GetOrdinal(column));
        public DateTime GetDateTime(string column) => GetDateTime(GetOrdinal(column));
        public byte GetByte(string column) => GetByte(GetOrdinal(column));
        public char GetChar(string column) => GetChar(GetOrdinal(column));
        public override long GetBytes(int ordinal, long dataOffset, byte[] buffer, int bufferOffset, int length)
        {
            var b = (byte[])NotNull(ordinal);
            if (buffer == null) return b.Length;
            int n = (int)Math.Max(0, Math.Min(length, b.Length - dataOffset));
            Array.Copy(b, dataOffset, buffer, bufferOffset, n);
            return n;
        }
        public override long GetChars(int ordinal, long dataOffset, char[] buffer, int bufferOffset, int length)
        {
            var s = GetString(ordinal);
            if (buffer == null) return s.Length;
            int n = (int)Math.Max(0, Math.Min(length, s.Length - dataOffset));
            s.CopyTo((int)dataOffset, buffer, bufferOffset, n);
            return n;
        }
        public override IEnumerator GetEnumerator() => new DbEnumerator(this, closeReader: false);

        public override DataTable GetSchemaTable()
        {
            var t = new DataTable("SchemaTable");
            t.Columns.Add("ColumnName", typeof(string));
            t.Columns.Add("ColumnOrdinal", typeof(int));
            t.Columns.Add("ColumnSize", typeof(int));
            t.Columns.Add("NumericPrecision", typeof(int));
            t.Columns.Add("NumericScale", typeof(int));
            t.Columns.Add("IsUnique", typeof(bool));
            t.Columns.Add("IsKey", typeof(bool));
            t.Columns.Add("BaseCatalogName", typeof(string));
            t.Columns.Add("BaseColumnName", typeof(string));
            t.Columns.Add("BaseSchemaName", typeof(string));
            t.Columns.Add("BaseTableName", typeof(string));
            t.Columns.Add("DataType", typeof(Type));
            t.Columns.Add("AllowDBNull", typeof(bool));
            t.Columns.Add("ProviderType", typeof(int));
            t.Columns.Add("IsAliased", typeof(bool));
            t.Columns.Add("IsExpression", typeof(bool));
            t.Columns.Add("IsIdentity", typeof(bool));
            t.Columns.Add("IsAutoIncrement", typeof(bool));
            t.Columns.Add("IsRowVersion", typeof(bool));
            t.Columns.Add("IsHidden", typeof(bool));
            t.Columns.Add("IsLong", typeof(bool));
            t.Columns.Add("IsReadOnly", typeof(bool));
            int i = 0;
            foreach (var c in Cols)
            {
                t.Rows.Add(c.Name, i++, c.Length > 0 ? c.Length : -1, 0, c.Scale, c.Pk, c.Pk, null, c.Column ?? c.Name, null, c.Table, c.ClrType, !c.NotNull && !c.Pk, 0,
                    c.Column != null && !string.Equals(c.Column, c.Name, StringComparison.OrdinalIgnoreCase), c.Table == null, c.AutoInc, c.AutoInc, false, false, false, c.Table == null);
            }
            return t;
        }

        public override void Close()
        {
            if (closed) return;
            closed = true;
            closeOnDispose?.Close();
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing) Close();
            base.Dispose(disposing);
        }
    }

    public sealed class MySqlDataAdapter : DbDataAdapter
    {
        public MySqlDataAdapter() { }
        public MySqlDataAdapter(MySqlCommand selectCommand) { SelectCommand = selectCommand; }
        public MySqlDataAdapter(string selectCommandText, MySqlConnection connection) { SelectCommand = new MySqlCommand(selectCommandText, connection); }
        public MySqlDataAdapter(string selectCommandText, string selectConnString) { SelectCommand = new MySqlCommand(selectCommandText, new MySqlConnection(selectConnString)); }

        public new MySqlCommand SelectCommand { get => (MySqlCommand)base.SelectCommand; set => base.SelectCommand = value; }
        public new MySqlCommand InsertCommand { get => (MySqlCommand)base.InsertCommand; set => base.InsertCommand = value; }
        public new MySqlCommand UpdateCommand { get => (MySqlCommand)base.UpdateCommand; set => base.UpdateCommand = value; }
        public new MySqlCommand DeleteCommand { get => (MySqlCommand)base.DeleteCommand; set => base.DeleteCommand = value; }
    }

    /// <summary>SELECT komutuna göre INSERT/UPDATE/DELETE komutlarını otomatik üretir (DataAdapter.Update için).</summary>
    public sealed class MySqlCommandBuilder : DbCommandBuilder
    {
        public MySqlCommandBuilder() { QuotePrefix = "`"; QuoteSuffix = "`"; }
        public MySqlCommandBuilder(MySqlDataAdapter adapter) : this() { DataAdapter = adapter; }
        public new MySqlDataAdapter DataAdapter { get => (MySqlDataAdapter)base.DataAdapter; set => base.DataAdapter = value; }
        public new MySqlCommand GetInsertCommand() => (MySqlCommand)base.GetInsertCommand();
        public new MySqlCommand GetUpdateCommand() => (MySqlCommand)base.GetUpdateCommand();
        public new MySqlCommand GetDeleteCommand() => (MySqlCommand)base.GetDeleteCommand();
        protected override void ApplyParameterInfo(DbParameter parameter, DataRow row, StatementType statementType, bool whereClause) { }
        protected override string GetParameterName(int parameterOrdinal) => "@p" + parameterOrdinal.ToString(CultureInfo.InvariantCulture);
        protected override string GetParameterName(string parameterName) => "@" + parameterName;
        protected override string GetParameterPlaceholder(int parameterOrdinal) => "@p" + parameterOrdinal.ToString(CultureInfo.InvariantCulture);
        protected override void SetRowUpdatingHandler(DbDataAdapter adapter) { }
        public override string QuoteIdentifier(string unquotedIdentifier) => "`" + unquotedIdentifier.Replace("`", "``") + "`";
        public override string UnquoteIdentifier(string quotedIdentifier) => quotedIdentifier.Trim('`').Replace("``", "`");
    }

    public static class MySqlHelper
    {
        public static int ExecuteNonQuery(MySqlConnection connection, string commandText, params MySqlParameter[] commandParameters)
        {
            var c = new MySqlCommand(commandText, connection);
            foreach (var p in commandParameters ?? Array.Empty<MySqlParameter>()) c.Parameters.Add(p);
            return c.ExecuteNonQuery();
        }
        public static string EscapeString(string value) => (value ?? "").Replace("\\", "\\\\").Replace("'", "\\'").Replace("\"", "\\\"");
    }
}
