// Proje veritabanından (okul.mdf şeması) Visual Studio'nun veri kümesi sihirbazıyla aynı adlarda
// tipli DataSet, TableAdapter ve TableAdapterManager kodu üretir. Veriler uygulama klasöründeki
// okul.xml dosyasında tutulur (tarayıcıda proje ile birlikte kaydedilir; ZIP'te Visual Studio'da da çalışır).

/** SQL türü → .NET türü */
export const SQL_TYPES = {
  int: 'int', bigint: 'long', smallint: 'short', tinyint: 'byte', bit: 'bool',
  varchar: 'string', nvarchar: 'string', char: 'string', nchar: 'string', text: 'string', ntext: 'string',
  datetime: 'global::System.DateTime', date: 'global::System.DateTime', datetime2: 'global::System.DateTime', smalldatetime: 'global::System.DateTime',
  time: 'global::System.TimeSpan', decimal: 'decimal', numeric: 'decimal', money: 'decimal', smallmoney: 'decimal',
  float: 'double', real: 'float', uniqueidentifier: 'global::System.Guid', varbinary: 'byte[]', image: 'byte[]',
};

export const SQL_TYPE_LIST = ['int', 'bigint', 'smallint', 'tinyint', 'bit', 'varchar', 'nvarchar', 'char', 'nchar', 'text', 'ntext',
  'date', 'datetime', 'datetime2', 'time', 'decimal', 'money', 'float', 'real', 'uniqueidentifier', 'varbinary', 'image'];

const HAS_LENGTH = new Set(['varchar', 'nvarchar', 'char', 'nchar', 'varbinary']);

export function hasLength(type) {
  return HAS_LENGTH.has(type);
}

/** Sütun türünün SQL yazımı: varchar(50), nvarchar(MAX), decimal(18, 2) */
export function sqlTypeText(c) {
  if (HAS_LENGTH.has(c.type)) return `${c.type}(${c.length === -1 || c.length == null ? 'MAX' : c.length})`;
  if (c.type === 'decimal' || c.type === 'numeric') return `${c.type}(${c.precision ?? 18}, ${c.scale ?? 0})`;
  return c.type;
}

function netType(c) {
  return SQL_TYPES[c.type] || 'string';
}

function typeofExpr(c) {
  return `typeof(${netType(c)})`;
}

function isValueType(c) {
  const t = netType(c);
  return t !== 'string' && t !== 'byte[]';
}

/** Veri kümesi sınıfının bileşen alanı için adı: OkulDataSet → okulDataSet */
export function instanceName(className) {
  return className.charAt(0).toLocaleLowerCase('tr-TR') + className.slice(1);
}

export function tableAdapterName(table) {
  return `${table.name}TableAdapter`;
}

export function dataFileName(db) {
  return `${db.name}.xml`;
}

export function designerFileName(db) {
  return `${db.dataSet}.Designer.cs`;
}

/** CREATE TABLE betiği (Veri penceresinde ve ZIP'teki okul.sql dosyasında) */
export function createTableSql(table) {
  const lines = table.columns.map((c) => {
    let s = `    [${c.name}] ${sqlTypeText(c).toUpperCase()}`;
    if (c.identity) s += ' IDENTITY (1, 1)';
    s += c.nullable === false || c.pk ? ' NOT NULL' : ' NULL';
    return s;
  });
  const pk = table.columns.filter((c) => c.pk);
  if (pk.length === 1 && !lines.some((l) => l.includes('PRIMARY'))) {
    const i = table.columns.indexOf(pk[0]);
    lines[i] += ' PRIMARY KEY';
  } else if (pk.length > 1) {
    lines.push(`    PRIMARY KEY (${pk.map((c) => `[${c.name}]`).join(', ')})`);
  }
  return `CREATE TABLE [dbo].[${table.name}]\n(\n${lines.join(',\n')}\n)`;
}

function sqlLiteral(v, c) {
  if (v === null || v === undefined || v === '') return 'NULL';
  const t = netType(c);
  if (t === 'bool') return v === true || v === 'true' || v === 1 || v === '1' ? '1' : '0';
  if (['int', 'long', 'short', 'byte', 'decimal', 'double', 'float'].includes(t)) return String(v).replace(',', '.');
  return (c.type.startsWith('n') ? 'N' : '') + "'" + String(v).replace(/'/g, "''") + "'";
}

/** Tablo oluşturma + örnek verileri ekleme betiği */
export function databaseSql(db) {
  const out = [`-- ${db.name}.mdf veritabanı (Ders Stüdyosu'ndan dışa aktarıldı)`, ''];
  for (const t of db.tables) {
    out.push(createTableSql(t), 'GO', '');
    if (t.rows?.length) {
      const ident = t.columns.some((c) => c.identity);
      if (ident) out.push(`SET IDENTITY_INSERT [dbo].[${t.name}] ON`);
      for (const r of t.rows) {
        out.push(`INSERT INTO [dbo].[${t.name}] (${t.columns.map((c) => `[${c.name}]`).join(', ')}) VALUES (${t.columns.map((c, i) => sqlLiteral(r[i], c)).join(', ')})`);
      }
      if (ident) out.push(`SET IDENTITY_INSERT [dbo].[${t.name}] OFF`);
      out.push('GO', '');
    }
  }
  return out.join('\n');
}

// ------------------------------------------------------------------ XML (okul.xml)

function xmlEscape(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function xmlValue(v, c) {
  const t = netType(c);
  if (t === 'bool') return v === true || v === 'true' || v === 1 || v === '1' ? 'true' : 'false';
  if (t === 'global::System.DateTime') {
    const s = String(v);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s + 'T00:00:00' : s;
  }
  return xmlEscape(v);
}

/** Proje veritabanının satırlarını DataSet.WriteXml (IgnoreSchema) biçiminde yazar. */
export function databaseXml(db) {
  const out = ['<?xml version="1.0" standalone="yes"?>', `<${db.dataSet}>`];
  for (const t of db.tables) {
    for (const r of t.rows || []) {
      out.push(`  <${t.name}>`);
      t.columns.forEach((c, i) => {
        const v = r[i];
        if (v === null || v === undefined || (v === '' && netType(c) !== 'string')) return;
        out.push(`    <${c.name}>${xmlValue(v, c)}</${c.name}>`);
      });
      out.push(`  </${t.name}>`);
    }
  }
  out.push(`</${db.dataSet}>`);
  return out.join('\n');
}

/** Program okul.xml dosyasını değiştirince satırları geri okur. */
export function parseDatabaseXml(db, xml) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror')) return null;
  const result = {};
  for (const t of db.tables) {
    const rows = [];
    for (const el of doc.documentElement.children) {
      if (el.localName !== t.name) continue;
      const row = t.columns.map((c) => {
        const ch = [...el.children].find((x) => x.localName === c.name);
        if (!ch) return null;
        return parseValue(ch.textContent, c);
      });
      rows.push(row);
    }
    result[t.name] = rows;
  }
  return result;
}

export function parseValue(text, c) {
  const t = netType(c);
  if (text === null || text === undefined) return null;
  if (t === 'bool') return text === 'true' || text === '1' || text === true;
  if (['int', 'long', 'short', 'byte'].includes(t)) { const n = parseInt(text, 10); return Number.isFinite(n) ? n : null; }
  if (['decimal', 'double', 'float'].includes(t)) { const n = parseFloat(String(text).replace(',', '.')); return Number.isFinite(n) ? n : null; }
  if (t === 'global::System.DateTime') return String(text).substring(0, 19);
  return String(text);
}

// ------------------------------------------------------------------ C# üretimi

const STRONG_TYPING = (table, col) => `'${table}' tablosundaki '${col}' sütununun değeri DBNull.`;

function dataTableCode(ds, t) {
  const T = t.name;
  const cols = t.columns;
  const pk = cols.filter((c) => c.pk);
  const autoInc = (c) => c.autoIncrement || c.identity;
  const addParams = cols.filter((c) => !autoInc(c));
  const L = [];
  L.push(`        /// <summary>'${T}' tablosu.</summary>`);
  L.push(`        [global::System.Serializable()]`);
  L.push(`        public partial class ${T}DataTable : global::System.Data.DataTable, global::System.Collections.Generic.IEnumerable<${T}Row> {`);
  L.push('');
  for (const c of cols) L.push(`            private global::System.Data.DataColumn column${c.name};`);
  L.push('');
  L.push(`            public ${T}DataTable() {`);
  L.push(`                this.TableName = "${T}";`);
  L.push('                this.BeginInit();');
  L.push('                this.InitClass();');
  L.push('                this.EndInit();');
  L.push('            }');
  L.push('');
  for (const c of cols) {
    L.push(`            public global::System.Data.DataColumn ${c.name}Column {`);
    L.push(`                get { return this.column${c.name}; }`);
    L.push('            }');
    L.push('');
  }
  L.push('            [global::System.ComponentModel.Browsable(false)]');
  L.push('            public int Count {');
  L.push('                get { return this.Rows.Count; }');
  L.push('            }');
  L.push('');
  L.push(`            public ${T}Row this[int index] {`);
  L.push(`                get { return ((${T}Row)(this.Rows[index])); }`);
  L.push('            }');
  L.push('');
  for (const ev of ['Changing', 'Changed', 'Deleting', 'Deleted']) L.push(`            public event ${T}RowChangeEventHandler ${T}Row${ev};`);
  L.push('');
  L.push(`            public void Add${T}Row(${T}Row row) {`);
  L.push('                this.Rows.Add(row);');
  L.push('            }');
  L.push('');
  L.push(`            public ${T}Row Add${T}Row(${addParams.map((c) => `${netType(c)} ${c.name}`).join(', ')}) {`);
  L.push(`                ${T}Row row${T}Row = ((${T}Row)(this.NewRow()));`);
  L.push(`                object[] columnValuesArray = new object[] {`);
  L.push(cols.map((c) => `                        ${autoInc(c) ? 'null' : c.name}`).join(',\n') + '};');
  L.push(`                row${T}Row.ItemArray = columnValuesArray;`);
  L.push(`                this.Rows.Add(row${T}Row);`);
  L.push(`                return row${T}Row;`);
  L.push('            }');
  L.push('');
  if (pk.length) {
    L.push(`            public ${T}Row FindBy${pk.map((c) => c.name).join('')}(${pk.map((c) => `${netType(c)} ${c.name}`).join(', ')}) {`);
    L.push(`                return ((${T}Row)(this.Rows.Find(new object[] {`);
    L.push(pk.map((c) => `                            ${c.name}`).join(',\n') + '})));');
    L.push('            }');
    L.push('');
  }
  L.push(`            public virtual global::System.Collections.Generic.IEnumerator<${T}Row> GetEnumerator() {`);
  L.push('                for (int i = 0; i < this.Rows.Count; i++) {');
  L.push(`                    yield return ((${T}Row)(this.Rows[i]));`);
  L.push('                }');
  L.push('            }');
  L.push('');
  L.push('            global::System.Collections.IEnumerator global::System.Collections.IEnumerable.GetEnumerator() {');
  L.push('                return this.GetEnumerator();');
  L.push('            }');
  L.push('');
  L.push('            public override global::System.Data.DataTable Clone() {');
  L.push(`                ${T}DataTable cln = ((${T}DataTable)(base.Clone()));`);
  L.push('                cln.InitVars();');
  L.push('                return cln;');
  L.push('            }');
  L.push('');
  L.push('            protected override global::System.Data.DataTable CreateInstance() {');
  L.push(`                return new ${T}DataTable();`);
  L.push('            }');
  L.push('');
  L.push('            internal void InitVars() {');
  for (const c of cols) L.push(`                this.column${c.name} = base.Columns["${c.name}"];`);
  L.push('            }');
  L.push('');
  L.push('            private void InitClass() {');
  for (const c of cols) {
    L.push(`                this.column${c.name} = new global::System.Data.DataColumn("${c.name}", ${typeofExpr(c)}, null, global::System.Data.MappingType.Element);`);
    L.push(`                base.Columns.Add(this.column${c.name});`);
  }
  if (pk.length) {
    L.push(`                this.Constraints.Add(new global::System.Data.UniqueConstraint("Constraint1", new global::System.Data.DataColumn[] {`);
    L.push(pk.map((c) => `                                this.column${c.name}`).join(',\n') + '}, true));');
  }
  for (const c of cols) {
    if (autoInc(c)) {
      L.push(`                this.column${c.name}.AutoIncrement = true;`);
      L.push(`                this.column${c.name}.AutoIncrementSeed = ${c.seed ?? -1};`);
      L.push(`                this.column${c.name}.AutoIncrementStep = ${c.step ?? -1};`);
    }
    if (c.nullable === false || c.pk) L.push(`                this.column${c.name}.AllowDBNull = false;`);
    if (c.identity) L.push(`                this.column${c.name}.ReadOnly = true;`);
    if (pk.length === 1 && c.pk) L.push(`                this.column${c.name}.Unique = true;`);
    if (netType(c) === 'string' && c.length > 0) L.push(`                this.column${c.name}.MaxLength = ${c.length};`);
  }
  L.push('            }');
  L.push('');
  L.push(`            public ${T}Row New${T}Row() {`);
  L.push(`                return ((${T}Row)(this.NewRow()));`);
  L.push('            }');
  L.push('');
  L.push('            protected override global::System.Data.DataRow NewRowFromBuilder(global::System.Data.DataRowBuilder builder) {');
  L.push(`                return new ${T}Row(builder);`);
  L.push('            }');
  L.push('');
  L.push('            protected override global::System.Type GetRowType() {');
  L.push(`                return typeof(${T}Row);`);
  L.push('            }');
  L.push('');
  for (const [ev, base] of [['Changed', 'OnRowChanged'], ['Changing', 'OnRowChanging'], ['Deleted', 'OnRowDeleted'], ['Deleting', 'OnRowDeleting']]) {
    L.push(`            protected override void ${base}(global::System.Data.DataRowChangeEventArgs e) {`);
    L.push(`                base.${base}(e);`);
    L.push(`                if ((this.${T}Row${ev} != null)) {`);
    L.push(`                    this.${T}Row${ev}(this, new ${T}RowChangeEvent(((${T}Row)(e.Row)), e.Action));`);
    L.push('                }');
    L.push('            }');
    L.push('');
  }
  L.push(`            public void Remove${T}Row(${T}Row row) {`);
  L.push('                this.Rows.Remove(row);');
  L.push('            }');
  L.push('        }');
  return L.join('\n');
}

function dataRowCode(ds, t) {
  const T = t.name;
  const L = [];
  L.push(`        /// <summary>'${T}' tablosunun bir satırı.</summary>`);
  L.push(`        public partial class ${T}Row : global::System.Data.DataRow {`);
  L.push('');
  L.push(`            private ${T}DataTable table${T};`);
  L.push('');
  L.push(`            internal ${T}Row(global::System.Data.DataRowBuilder rb) : `);
  L.push('                    base(rb) {');
  L.push(`                this.table${T} = ((${T}DataTable)(this.Table));`);
  L.push('            }');
  L.push('');
  for (const c of t.columns) {
    const nt = netType(c);
    const access = `this[this.table${T}.${c.name}Column]`;
    L.push(`            public ${nt} ${c.name} {`);
    if (c.nullable === false || c.pk) {
      L.push('                get {');
      L.push(`                    return ((${nt})(${access}));`);
      L.push('                }');
    } else {
      L.push('                get {');
      L.push('                    try {');
      L.push(`                        return ((${nt})(${access}));`);
      L.push('                    }');
      L.push('                    catch (global::System.InvalidCastException e) {');
      L.push(`                        throw new global::System.Data.StrongTypingException("${STRONG_TYPING(T, c.name)}", e);`);
      L.push('                    }');
      L.push('                }');
    }
    L.push('                set {');
    L.push(`                    ${access} = value;`);
    L.push('                }');
    L.push('            }');
    L.push('');
  }
  for (const c of t.columns) {
    if (c.nullable === false || c.pk) continue;
    L.push(`            public bool Is${c.name}Null() {`);
    L.push(`                return this.IsNull(this.table${T}.${c.name}Column);`);
    L.push('            }');
    L.push('');
    L.push(`            public void Set${c.name}Null() {`);
    L.push(`                this[this.table${T}.${c.name}Column] = global::System.Convert.DBNull;`);
    L.push('            }');
    L.push('');
  }
  L.push('        }');
  L.push('');
  L.push(`        public class ${T}RowChangeEvent : global::System.EventArgs {`);
  L.push('');
  L.push(`            private ${T}Row eventRow;`);
  L.push('');
  L.push('            private global::System.Data.DataRowAction eventAction;');
  L.push('');
  L.push(`            public ${T}RowChangeEvent(${T}Row row, global::System.Data.DataRowAction action) {`);
  L.push('                this.eventRow = row;');
  L.push('                this.eventAction = action;');
  L.push('            }');
  L.push('');
  L.push(`            public ${T}Row Row {`);
  L.push('                get { return this.eventRow; }');
  L.push('            }');
  L.push('');
  L.push('            public global::System.Data.DataRowAction Action {');
  L.push('                get { return this.eventAction; }');
  L.push('            }');
  L.push('        }');
  return L.join('\n');
}

function tableAdapterCode(db, t) {
  const DS = db.dataSet;
  const T = t.name;
  const A = tableAdapterName(t);
  const pk = t.columns.filter((c) => c.pk);
  const insertCols = t.columns.filter((c) => !c.identity);
  const L = [];
  L.push(`    /// <summary>'${T}' tablosunu doldurur (Fill) ve değişiklikleri veritabanına yazar (Update).</summary>`);
  L.push('    [global::System.ComponentModel.DesignerCategoryAttribute("code")]');
  L.push('    [global::System.ComponentModel.ToolboxItem(true)]');
  L.push(`    public partial class ${A} : global::System.ComponentModel.Component {`);
  L.push('');
  L.push('        private bool _clearBeforeFill;');
  L.push('');
  L.push(`        public ${A}() {`);
  L.push('            this.ClearBeforeFill = true;');
  L.push('        }');
  L.push('');
  L.push('        public bool ClearBeforeFill {');
  L.push('            get { return this._clearBeforeFill; }');
  L.push('            set { this._clearBeforeFill = value; }');
  L.push('        }');
  L.push('');
  L.push(`        public virtual int Fill(${DS}.${T}DataTable dataTable) {`);
  L.push('            if ((this.ClearBeforeFill == true)) {');
  L.push('                dataTable.Clear();');
  L.push('            }');
  L.push(`            return VeriTabani.Doldur(dataTable, "${T}");`);
  L.push('        }');
  L.push('');
  L.push(`        public virtual ${DS}.${T}DataTable GetData() {`);
  L.push(`            ${DS}.${T}DataTable dataTable = new ${DS}.${T}DataTable();`);
  L.push(`            VeriTabani.Doldur(dataTable, "${T}");`);
  L.push('            return dataTable;');
  L.push('        }');
  L.push('');
  L.push(`        public virtual int Update(${DS}.${T}DataTable dataTable) {`);
  L.push(`            return VeriTabani.Guncelle(dataTable, "${T}", ${pk.length ? `new string[] { ${pk.map((c) => `"${c.name}"`).join(', ')} }` : 'new string[0]'});`);
  L.push('        }');
  L.push('');
  L.push(`        public virtual int Update(${DS} dataSet) {`);
  L.push(`            return this.Update(dataSet.${T});`);
  L.push('        }');
  L.push('');
  L.push('        public virtual int Update(global::System.Data.DataRow dataRow) {');
  L.push('            return this.Update(new global::System.Data.DataRow[] { dataRow });');
  L.push('        }');
  L.push('');
  L.push('        public virtual int Update(global::System.Data.DataRow[] dataRows) {');
  L.push('            if (dataRows.Length == 0) return 0;');
  L.push(`            return VeriTabani.Guncelle(dataRows, "${T}", ${pk.length ? `new string[] { ${pk.map((c) => `"${c.name}"`).join(', ')} }` : 'new string[0]'});`);
  L.push('        }');
  L.push('');
  const nullableType = (c) => (isValueType(c) && c.nullable !== false && !c.pk ? `global::System.Nullable<${netType(c)}>` : netType(c));
  L.push(`        public virtual int Insert(${insertCols.map((c) => `${nullableType(c)} ${c.name}`).join(', ')}) {`);
  L.push(`            ${DS}.${T}DataTable dataTable = new ${DS}.${T}DataTable();`);
  L.push(`            ${DS}.${T}Row row = dataTable.New${T}Row();`);
  for (const c of insertCols) {
    if (isValueType(c) && c.nullable !== false && !c.pk) L.push(`            if (${c.name}.HasValue) row.${c.name} = ${c.name}.Value; else row.Set${c.name}Null();`);
    else if (c.nullable === false || c.pk) L.push(`            row.${c.name} = ${c.name};`);
    else L.push(`            if (${c.name} != null) row.${c.name} = ${c.name}; else row.Set${c.name}Null();`);
  }
  L.push('            dataTable.Rows.Add(row);');
  L.push('            return this.Update(dataTable);');
  L.push('        }');
  L.push('    }');
  return L.join('\n');
}

function managerCode(db) {
  const DS = db.dataSet;
  const L = [];
  L.push('    /// <summary>Veri kümesindeki tüm tabloların değişikliklerini tek seferde kaydeder (UpdateAll).</summary>');
  L.push('    [global::System.ComponentModel.DesignerCategoryAttribute("code")]');
  L.push('    [global::System.ComponentModel.ToolboxItem(true)]');
  L.push('    public partial class TableAdapterManager : global::System.ComponentModel.Component {');
  L.push('');
  L.push('        private UpdateOrderOption _updateOrder;');
  for (const t of db.tables) L.push(`        private ${tableAdapterName(t)} _${tableAdapterName(t)};`);
  L.push('        private bool _backupDataSetBeforeUpdate;');
  L.push('');
  L.push('        public UpdateOrderOption UpdateOrder {');
  L.push('            get { return this._updateOrder; }');
  L.push('            set { this._updateOrder = value; }');
  L.push('        }');
  L.push('');
  for (const t of db.tables) {
    const A = tableAdapterName(t);
    L.push(`        public ${A} ${A} {`);
    L.push(`            get { return this._${A}; }`);
    L.push(`            set { this._${A} = value; }`);
    L.push('        }');
    L.push('');
  }
  L.push('        public bool BackupDataSetBeforeUpdate {');
  L.push('            get { return this._backupDataSetBeforeUpdate; }');
  L.push('            set { this._backupDataSetBeforeUpdate = value; }');
  L.push('        }');
  L.push('');
  L.push('        public int TableAdapterInstanceCount {');
  L.push('            get {');
  L.push('                int count = 0;');
  for (const t of db.tables) L.push(`                if ((this._${tableAdapterName(t)} != null)) count = (count + 1);`);
  L.push('                return count;');
  L.push('            }');
  L.push('        }');
  L.push('');
  L.push(`        public virtual int UpdateAll(${DS} dataSet) {`);
  L.push('            if ((dataSet == null)) {');
  L.push('                throw new global::System.ArgumentNullException("dataSet");');
  L.push('            }');
  L.push('            if ((dataSet.HasChanges() == false)) {');
  L.push('                return 0;');
  L.push('            }');
  for (const t of db.tables) {
    const A = tableAdapterName(t);
    L.push(`            if (((this._${A} == null) && (dataSet.${t.name}.GetChanges() != null))) {`);
    L.push(`                throw new global::System.ArgumentException("TableAdapterManager'ın ${A} özelliği ayarlanmamış (null). Tasarımcıda tableAdapterManager'ın ${A} özelliğini seçin.");`);
    L.push('            }');
  }
  L.push('            int result = 0;');
  for (const t of db.tables) {
    const A = tableAdapterName(t);
    L.push(`            if ((this._${A} != null)) {`);
    L.push(`                result = (result + this._${A}.Update(dataSet.${t.name}));`);
    L.push('            }');
  }
  L.push('            return result;');
  L.push('        }');
  L.push('');
  L.push('        public enum UpdateOrderOption {');
  L.push('            InsertUpdateDelete = 0,');
  L.push('            UpdateInsertDelete = 1,');
  L.push('        }');
  L.push('    }');
  return L.join('\n');
}

/** Veritabanını (okul.xml) okuyan/yazan yardımcı sınıf — SQL Server yerine geçer. */
function storeCode(db) {
  const DS = db.dataSet;
  return `    /// <summary>
    /// Veritabanı (${db.name}.mdf) yerine geçen basit veri deposu. Kayıtlar uygulama klasöründeki
    /// ${dataFileName(db)} dosyasında durur. Bu sınıfı doğrudan kullanmanız gerekmez.
    /// </summary>
    internal static class VeriTabani {

        private static ${DS} depo;

        private static string Dosya {
            get { return global::System.IO.Path.Combine(global::System.Windows.Forms.Application.StartupPath, "${dataFileName(db)}"); }
        }

        private static ${DS} Depo {
            get {
                if ((depo == null)) {
                    depo = new ${DS}();
                    depo.EnforceConstraints = false;
                    if (global::System.IO.File.Exists(Dosya)) {
                        depo.ReadXml(Dosya, global::System.Data.XmlReadMode.IgnoreSchema);
                    }
                    depo.AcceptChanges();
                }
                return depo;
            }
        }

        internal static int Doldur(global::System.Data.DataTable hedef, string tablo) {
            global::System.Data.DataTable kaynak = Depo.Tables[tablo];
            hedef.BeginLoadData();
            foreach (global::System.Data.DataRow r in kaynak.Rows) {
                hedef.LoadDataRow(r.ItemArray, true);
            }
            hedef.EndLoadData();
            return kaynak.Rows.Count;
        }

        internal static int Guncelle(global::System.Data.DataTable tablo, string ad, string[] anahtar) {
            global::System.Data.DataRow[] satirlar = new global::System.Data.DataRow[tablo.Rows.Count];
            tablo.Rows.CopyTo(satirlar, 0);
            return Guncelle(satirlar, ad, anahtar);
        }

        internal static int Guncelle(global::System.Data.DataRow[] satirlar, string ad, string[] anahtar) {
            global::System.Data.DataTable depoTablo = Depo.Tables[ad];
            int sayi = 0;
            // Sıra: ekle, güncelle, sil (TableAdapterManager.UpdateOrderOption.InsertUpdateDelete)
            foreach (global::System.Data.DataRowState durum in new global::System.Data.DataRowState[] { global::System.Data.DataRowState.Added, global::System.Data.DataRowState.Modified, global::System.Data.DataRowState.Deleted }) {
                foreach (global::System.Data.DataRow r in satirlar) {
                    if ((r == null) || (r.RowState != durum)) continue;
                    if (durum == global::System.Data.DataRowState.Added) Ekle(depoTablo, r, anahtar);
                    else if (durum == global::System.Data.DataRowState.Modified) Degistir(depoTablo, r, anahtar);
                    else Sil(depoTablo, r, anahtar);
                    sayi++;
                }
            }
            foreach (global::System.Data.DataRow r in satirlar) {
                if ((r != null) && (r.RowState != global::System.Data.DataRowState.Detached) && (r.RowState != global::System.Data.DataRowState.Unchanged)) r.AcceptChanges();
            }
            if (sayi > 0) {
                Depo.AcceptChanges();
                Depo.WriteXml(Dosya, global::System.Data.XmlWriteMode.IgnoreSchema);
            }
            return sayi;
        }

        private static global::System.Data.DataRow Bul(global::System.Data.DataTable depoTablo, global::System.Data.DataRow r, string[] anahtar, global::System.Data.DataRowVersion surum) {
            object[] degerler = new object[anahtar.Length];
            for (int i = 0; i < anahtar.Length; i++) {
                degerler[i] = (surum == global::System.Data.DataRowVersion.Original) ? r[anahtar[i], surum] : r[anahtar[i]];
            }
            foreach (global::System.Data.DataRow d in depoTablo.Rows) {
                bool ayni = true;
                for (int i = 0; i < anahtar.Length; i++) {
                    if (!object.Equals(d[anahtar[i]], degerler[i])) { ayni = false; break; }
                }
                if (ayni) return d;
            }
            return null;
        }

        private static void Ekle(global::System.Data.DataTable depoTablo, global::System.Data.DataRow r, string[] anahtar) {
            foreach (global::System.Data.DataColumn c in r.Table.Columns) {
                if (!c.AllowDBNull && r.IsNull(c) && !(c.ReadOnly && c.AutoIncrement)) {
                    throw new global::System.InvalidOperationException("'" + c.ColumnName + "' sütununa NULL değeri eklenemez. Sütun boş bırakılamaz (dbo." + depoTablo.TableName + ").");
                }
            }
            global::System.Data.DataRow yeni = depoTablo.NewRow();
            foreach (global::System.Data.DataColumn c in r.Table.Columns) {
                if (c.ReadOnly && c.AutoIncrement) {
                    // IDENTITY sütunu: değeri veritabanı verir ve satıra geri yazılır.
                    int enBuyuk = 0;
                    foreach (global::System.Data.DataRow d in depoTablo.Rows) {
                        if (!d.IsNull(c.ColumnName)) enBuyuk = global::System.Math.Max(enBuyuk, global::System.Convert.ToInt32(d[c.ColumnName]));
                    }
                    yeni[c.ColumnName] = enBuyuk + 1;
                    c.ReadOnly = false;
                    r[c] = yeni[c.ColumnName];
                    c.ReadOnly = true;
                }
                else {
                    yeni[c.ColumnName] = r[c];
                }
            }
            if ((anahtar.Length > 0) && (Bul(depoTablo, yeni, anahtar, global::System.Data.DataRowVersion.Current) != null)) {
                throw new global::System.InvalidOperationException("PRIMARY KEY kısıtlaması ihlal edildi: 'dbo." + depoTablo.TableName + "' tablosunda aynı anahtar değerine sahip bir kayıt zaten var (" + yeni[anahtar[0]] + ").");
            }
            depoTablo.Rows.Add(yeni);
        }

        private static void Degistir(global::System.Data.DataTable depoTablo, global::System.Data.DataRow r, string[] anahtar) {
            if (anahtar.Length == 0) {
                throw new global::System.InvalidOperationException("Birincil anahtarı (PRIMARY KEY) olmayan '" + depoTablo.TableName + "' tablosunda kayıt güncellenemez.");
            }
            global::System.Data.DataRow d = Bul(depoTablo, r, anahtar, global::System.Data.DataRowVersion.Original);
            if ((d == null)) {
                throw new global::System.Data.DBConcurrencyException("Eşzamanlılık ihlali: UpdateCommand beklenen 1 kayıttan 0 tanesini etkiledi.");
            }
            foreach (global::System.Data.DataColumn c in r.Table.Columns) {
                if (!c.ReadOnly) d[c.ColumnName] = r[c];
            }
        }

        private static void Sil(global::System.Data.DataTable depoTablo, global::System.Data.DataRow r, string[] anahtar) {
            if (anahtar.Length == 0) {
                throw new global::System.InvalidOperationException("Birincil anahtarı (PRIMARY KEY) olmayan '" + depoTablo.TableName + "' tablosunda kayıt silinemez.");
            }
            global::System.Data.DataRow d = Bul(depoTablo, r, anahtar, global::System.Data.DataRowVersion.Original);
            if ((d == null)) {
                throw new global::System.Data.DBConcurrencyException("Eşzamanlılık ihlali: DeleteCommand beklenen 1 kayıttan 0 tanesini etkiledi.");
            }
            depoTablo.Rows.Remove(d);
        }
    }`;
}

/** OkulDataSet.Designer.cs içeriği */
export function generateDataSet(ns, db) {
  const DS = db.dataSet;
  const L = [];
  L.push('//------------------------------------------------------------------------------');
  L.push('// <auto-generated>');
  L.push(`//     Bu kod ${DS}.xsd veri kümesinden (${db.name}.mdf veritabanı) otomatik üretildi.`);
  L.push('//     Sınıf ve üye adları Visual Studio veri kümesi tasarımcısının ürettikleriyle aynıdır.');
  L.push('//     Bu dosyada yapılan değişiklikler kaybolur.');
  L.push('// </auto-generated>');
  L.push('//------------------------------------------------------------------------------');
  L.push('');
  L.push('#pragma warning disable 1591');
  L.push('');
  L.push(`namespace ${ns} {`);
  L.push('');
  L.push('');
  L.push('    [global::System.Serializable()]');
  L.push('    [global::System.ComponentModel.DesignerCategoryAttribute("code")]');
  L.push('    [global::System.ComponentModel.ToolboxItem(true)]');
  L.push(`    public partial class ${DS} : global::System.Data.DataSet {`);
  L.push('');
  for (const t of db.tables) L.push(`        private ${t.name}DataTable table${t.name};`);
  L.push('');
  L.push('        private global::System.Data.SchemaSerializationMode _schemaSerializationMode = global::System.Data.SchemaSerializationMode.IncludeSchema;');
  L.push('');
  L.push(`        public ${DS}() {`);
  L.push('            this.BeginInit();');
  L.push('            this.InitClass();');
  L.push('            this.EndInit();');
  L.push('        }');
  L.push('');
  for (const t of db.tables) {
    L.push('        [global::System.ComponentModel.Browsable(false)]');
    L.push(`        public ${t.name}DataTable ${t.name} {`);
    L.push(`            get { return this.table${t.name}; }`);
    L.push('        }');
    L.push('');
  }
  L.push('        public override global::System.Data.SchemaSerializationMode SchemaSerializationMode {');
  L.push('            get { return this._schemaSerializationMode; }');
  L.push('            set { this._schemaSerializationMode = value; }');
  L.push('        }');
  L.push('');
  L.push('        public override global::System.Data.DataSet Clone() {');
  L.push(`            ${DS} cln = ((${DS})(base.Clone()));`);
  L.push('            cln.InitVars();');
  L.push('            cln.SchemaSerializationMode = this.SchemaSerializationMode;');
  L.push('            return cln;');
  L.push('        }');
  L.push('');
  L.push('        internal void InitVars() {');
  for (const t of db.tables) {
    L.push(`            this.table${t.name} = ((${t.name}DataTable)(base.Tables["${t.name}"]));`);
    L.push(`            if ((this.table${t.name} != null)) {`);
    L.push(`                this.table${t.name}.InitVars();`);
    L.push('            }');
  }
  L.push('        }');
  L.push('');
  L.push('        private void InitClass() {');
  L.push(`            this.DataSetName = "${DS}";`);
  L.push('            this.Prefix = "";');
  L.push('            this.EnforceConstraints = true;');
  L.push('            this.SchemaSerializationMode = global::System.Data.SchemaSerializationMode.IncludeSchema;');
  for (const t of db.tables) {
    L.push(`            this.table${t.name} = new ${t.name}DataTable();`);
    L.push(`            base.Tables.Add(this.table${t.name});`);
  }
  L.push('        }');
  L.push('');
  for (const t of db.tables) L.push(`        public delegate void ${t.name}RowChangeEventHandler(object sender, ${t.name}RowChangeEvent e);`);
  L.push('');
  for (const t of db.tables) {
    L.push(dataTableCode(DS, t));
    L.push('');
    L.push(dataRowCode(DS, t));
    L.push('');
  }
  L.push('    }');
  L.push('}');
  L.push(`namespace ${ns}.${DS}TableAdapters {`);
  L.push('');
  for (const t of db.tables) {
    L.push(tableAdapterCode(db, t));
    L.push('');
  }
  L.push(managerCode(db));
  L.push('');
  L.push(storeCode(db));
  L.push('}');
  L.push('');
  L.push('#pragma warning restore 1591');
  L.push('');
  return L.join('\n');
}
