// MySQL sunucu simülatörü: MySQL komutlarını çözümleyip sql.js (SQLite) üzerinde çalıştırır.
// Her MySQL veritabanı ayrı bir SQLite veritabanıdır; tablo tanımları (MySQL türleri, anahtarlar)
// veritabanının içindeki __mysql_sim_meta tablosunda saklanır.
import { tokenize, splitStatements } from './lexer.js';
import { registerFunctions, fold, normDate, normDateTime, normTime, likeMatch } from './funcs.js';

import { installRoutines } from './routines.js';

export const META_TABLE = '__mysql_sim_meta';
export const SYSTEM_DBS = ['information_schema', 'mysql', 'performance_schema', 'sys'];
export const VERSIONS = { book: '8.0.36', new: '8.4.3' };

const SQLSTATE = {
  1007: 'HY000', 1008: 'HY000', 1044: '42000', 1045: '28000', 1046: '3D000', 1048: '23000', 1049: '42000', 1050: '42S01', 1051: '42S02',
  1052: '23000', 1054: '42S22', 1060: '42S21', 1062: '23000', 1064: '42000', 1068: '42000', 1072: '42000', 1075: '42000', 1091: '42000',
  1136: '21S01', 1142: '42000', 1146: '42S02', 1264: '22003', 1265: '01000', 1292: '22007', 1305: '42000', 1406: '22001', 1451: '23000', 1452: '23000',
};

export class MySqlError extends Error {
  constructor(code, message, state) {
    super(message);
    this.code = code;
    this.state = state || SQLSTATE[code] || 'HY000';
  }
}

const err = (code, msg) => new MySqlError(code, msg);
const bq = (s) => '`' + String(s).replace(/`/g, '``') + '`';
const dq = (s) => '"' + String(s).replace(/"/g, '""') + '"';
const sq = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const lc = (s) => String(s).toLowerCase();

/** MySQL dizgi sabiti (dump/SHOW CREATE için) */
export function mysqlString(v) {
  return "'" + String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\0/g, '\\0') + "'";
}

const RESERVED = new Set(('ADD ALL ALTER AND AS ASC BETWEEN BY CASE CHANGE CHECK COLUMN CONSTRAINT CREATE CROSS DATABASE DATABASES DEFAULT DELETE DESC DESCRIBE ' +
  'DISTINCT DROP ELSE EXISTS FALSE FOREIGN FROM GRANT GROUP HAVING IN INDEX INNER INSERT INTERVAL INTO IS JOIN KEY KEYS LEFT LIKE LIMIT MOD NOT NULL ON OR ORDER ' +
  'OUTER PRIMARY REFERENCES RENAME REPLACE RIGHT SCHEMA SELECT SET SHOW TABLE THEN TO TRUE UNION UNIQUE UPDATE USE USING VALUES WHEN WHERE WITH ' +
  'INT INTEGER TINYINT SMALLINT MEDIUMINT BIGINT DECIMAL NUMERIC FLOAT DOUBLE REAL CHAR VARCHAR BINARY VARBINARY ROW ROWS RANK').split(' '));

// ---------------------------------------------------------------- veri türleri

const INT_TYPES = { tinyint: [-128, 127, 255], smallint: [-32768, 32767, 65535], mediumint: [-8388608, 8388607, 16777215], int: [-2147483648, 2147483647, 4294967295], bigint: null };
const TEXT_TYPES = new Set(['char', 'varchar', 'tinytext', 'text', 'mediumtext', 'longtext', 'enum', 'set', 'json']);
const BLOB_TYPES = new Set(['binary', 'varbinary', 'tinyblob', 'blob', 'mediumblob', 'longblob']);
const TYPE_ALIASES = { integer: 'int', bool: 'tinyint', boolean: 'tinyint', dec: 'decimal', numeric: 'decimal', fixed: 'decimal', real: 'double', nchar: 'char', nvarchar: 'varchar', character: 'char', int1: 'tinyint', int2: 'smallint', int3: 'mediumint', int4: 'int', int8: 'bigint', middleint: 'mediumint' };
const ALL_TYPES = new Set([...Object.keys(INT_TYPES), 'decimal', 'float', 'double', 'bit', ...TEXT_TYPES, ...BLOB_TYPES, 'date', 'datetime', 'timestamp', 'time', 'year']);

export function isIntType(t) { return t in INT_TYPES || t === 'year' || t === 'bit'; }
export function isNumType(t) { return isIntType(t) || t === 'decimal' || t === 'float' || t === 'double'; }
export function isTextType(t) { return TEXT_TYPES.has(t); }

/** DESCRIBE / SHOW CREATE biçiminde tür metni: int, varchar(45), decimal(7,2) unsigned */
export function typeText(c) {
  let s = c.type;
  if (c.type === 'enum' || c.type === 'set') s += '(' + c.values.map(mysqlString).join(',') + ')';
  else if (c.type === 'decimal') s += `(${c.len ?? 10},${c.scale ?? 0})`;
  else if ((c.type === 'float' || c.type === 'double') && c.len != null) s += `(${c.len},${c.scale ?? 0})`;
  else if (['char', 'varchar', 'binary', 'varbinary', 'bit'].includes(c.type)) s += `(${c.len ?? 1})`;
  else if (c.type === 'tinyint' && c.len === 1 && !c.unsigned) s += '(1)';
  else if (c.type in INT_TYPES && c.zerofill && c.len) s += `(${c.len})`;
  else if (['datetime', 'timestamp', 'time'].includes(c.type) && c.len) s += `(${c.len})`;
  if (c.unsigned) s += ' unsigned';
  if (c.zerofill) s += ' zerofill';
  return s;
}

function sqliteType(c) {
  if (c.type in INT_TYPES || c.type === 'year' || c.type === 'bit') return 'INTEGER';
  if (c.type === 'decimal' || c.type === 'float' || c.type === 'double') return 'REAL';
  if (BLOB_TYPES.has(c.type)) return 'BLOB';
  return 'TEXT';
}

/** Sonuç tablosunda gösterilecek değer metni (NULL → null) */
export function displayValue(v, col) {
  if (v == null) return null;
  if (v instanceof Uint8Array) return `BLOB (${v.length} bayt)`;
  if (typeof v === 'number') {
    if (col && col.type === 'decimal') return v.toFixed(col.scale ?? 0);
    if (col && col.zerofill && col.len) return String(v).padStart(col.len, '0');
    if (Number.isInteger(v)) return String(v);
    return String(Number(v.toPrecision(15)));
  }
  return String(v);
}

// MySQL işlev adı → SQLite karşılığı (funcs.js)
const FUNC_MAP = {
  NOW: 'm_now', SYSDATE: 'm_now', CURRENT_TIMESTAMP: 'm_now', LOCALTIME: 'm_now', LOCALTIMESTAMP: 'm_now', CURDATE: 'm_curdate', CURRENT_DATE: 'm_curdate',
  CURTIME: 'm_curtime', CURRENT_TIME: 'm_curtime', YEAR: 'm_year', MONTH: 'm_month', DAY: 'm_day', DAYOFMONTH: 'm_day', HOUR: 'm_hour', MINUTE: 'm_minute',
  SECOND: 'm_second', QUARTER: 'm_quarter', DAYNAME: 'm_dayname', MONTHNAME: 'm_monthname', DAYOFWEEK: 'm_dayofweek', DAYOFYEAR: 'm_dayofyear',
  DATEDIFF: 'm_datediff', DATE_FORMAT: 'm_date_format', DATE_ADD: 'm_date_add', ADDDATE: 'm_date_add', DATE_SUB: 'm_date_sub', SUBDATE: 'm_date_sub',
  TIMESTAMPDIFF: 'm_timestampdiff', CONCAT: 'm_concat', CONCAT_WS: 'm_concat_ws', CHAR_LENGTH: 'length', CHARACTER_LENGTH: 'length', LEFT: 'm_left',
  RIGHT: 'm_right', LOCATE: 'm_locate', INSTR: 'm_instr', MID: 'substr', SUBSTRING: 'substr', LCASE: 'lower', UCASE: 'upper', REVERSE: 'm_reverse',
  REPEAT: 'm_repeat', SPACE: 'm_space', LPAD: 'm_lpad', RPAD: 'm_rpad', FORMAT: 'm_format', TRUNCATE: 'm_truncate', ROUND: 'm_round', CEIL: 'm_ceil',
  CEILING: 'm_ceil', FLOOR: 'm_floor', POW: 'm_pow', POWER: 'm_pow', SQRT: 'm_sqrt', EXP: 'm_exp', LN: 'm_ln', LOG: 'm_ln', LOG10: 'm_log10', MOD: 'm_mod',
  SIGN: 'm_sign', PI: 'm_pi', RAND: 'm_rand', GREATEST: 'max', LEAST: 'min', ISNULL: 'm_isnull', STRCMP: 'm_strcmp', DATABASE: 'm_database', SCHEMA: 'm_database',
  VERSION: 'm_version', USER: 'm_user', CURRENT_USER: 'm_user', SESSION_USER: 'm_user', SYSTEM_USER: 'm_user', LAST_INSERT_ID: 'last_insert_rowid', UUID: 'm_uuid',
  IF: 'iif',
};

// ---------------------------------------------------------------- çözümleyici yardımcısı

const sig = (t) => t.t !== 'ws' && t.t !== 'cmt';

class Parser {
  constructor(tokens, src, stmt) {
    this.toks = tokens.filter(sig);
    this.i = 0;
    this.src = src;
    this.stmt = stmt;
  }
  get cur() { return this.toks[this.i]; }
  peek(n = 0) { return this.toks[this.i + n]; }
  match(t, w) { return t && (t.t === 'id' ? t.u === w : t.t === 'op' && t.v === w); }
  is(...words) { return words.every((w, k) => this.match(this.peek(k), w)); }
  eat(...words) {
    if (!this.is(...words)) return false;
    this.i += words.length;
    return true;
  }
  expect(...words) { if (!this.eat(...words)) throw this.syntax(); }
  done() { return this.i >= this.toks.length; }
  end() { if (!this.done()) throw this.syntax(); }
  syntax(t = this.cur) { return syntaxError(this.src, this.stmt, t); }
  name(allowReserved = false) {
    const t = this.cur;
    if (!t || !(t.t === 'id' || t.t === 'qid' || t.t === 'str')) throw this.syntax();
    if (t.t === 'id' && !allowReserved && RESERVED.has(t.u)) throw this.syntax();
    this.i++;
    return t.t === 'id' ? t.v : t.val;
  }
  qname() {
    const a = this.name();
    if (this.is('.')) {
      this.i++;
      return { db: a, name: this.name(true) };
    }
    return { db: null, name: a };
  }
  num() {
    const t = this.cur;
    if (!t || t.t !== 'num') throw this.syntax();
    this.i++;
    return t.val;
  }
  /** ( ... ) içindeki belirteçleri döndürür */
  group() {
    if (!this.is('(')) throw this.syntax();
    const start = this.i;
    let depth = 0;
    for (; this.i < this.toks.length; this.i++) {
      const t = this.toks[this.i];
      if (t.t === 'op' && t.v === '(') depth++;
      else if (t.t === 'op' && t.v === ')') {
        depth--;
        if (depth === 0) {
          this.i++;
          return this.toks.slice(start + 1, this.i - 1);
        }
      }
    }
    throw this.syntax();
  }
  /** (a, b(10) ASC, `c`) */
  nameList() {
    this.expect('(');
    const names = [];
    for (;;) {
      names.push(this.name());
      if (this.is('(')) this.group();
      this.eat('ASC') || this.eat('DESC');
      if (this.eat(',')) continue;
      this.expect(')');
      return names;
    }
  }
  textOf(toks) {
    if (!toks.length) return '';
    return this.src.slice(toks[0].s, toks[toks.length - 1].e);
  }
}

function syntaxError(src, stmt, t) {
  const from = t ? t.s : stmt.e;
  let near = src.slice(from, stmt.e);
  if (near.length > 80) near = near.slice(0, 80);
  const line = src.slice(stmt.s, from).split('\n').length;
  return err(1064, `You have an error in your SQL syntax; check the manual that corresponds to your MySQL server version for the right syntax to use near '${near}' at line ${line}`);
}

// ---------------------------------------------------------------- sunucu

export class MySqlServer {
  /**
   * @param SQL sql.js modülü (initSqlJs sonucu)
   * @param opts { version, rootPassword, clock: () => Date }
   */
  constructor(SQL, opts = {}) {
    this.SQL = SQL;
    this.version = opts.version || VERSIONS.book;
    this.clock = opts.clock || (() => new Date());
    this.running = true;
    this.port = 3306;
    this.epoch = 1;
    this.connId = 7;
    this.sessions = new Set();
    this.startedAt = Date.now();
    this.dbs = new Map();
    this.users = [{ user: 'root', host: 'localhost', password: opts.rootPassword ?? '', grants: [{ db: '*', table: '*', privs: ['ALL PRIVILEGES'], grantOption: true }] }];
    this.listeners = new Set();
    this.active = null; // komutu çalıştıran oturum
    this.scratch = this.openSqlite(null);
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(ev) { for (const fn of this.listeners) { try { fn(ev); } catch (e) { console.error(e); } } }

  openSqlite(bytes) {
    const db = bytes ? new this.SQL.Database(bytes) : new this.SQL.Database();
    this.prepareSqlite(db);
    return db;
  }

  prepareSqlite(db) {
    registerFunctions(db, {
      now: () => this.clock(),
      database: () => this.active?.db ?? null,
      version: () => this.version,
      user: () => (this.active ? `${this.active.user}@${this.active.host}` : 'root@localhost'),
    });
    this.registerRoutineHelpers(db);
    db.run('PRAGMA foreign_keys = ' + (this.active?.fkChecks === false ? 'OFF' : 'ON'));
  }

  // ---- veritabanları

  hasDb(name) { return this.dbs.has(lc(name)); }
  getDb(name) { return this.dbs.get(lc(name)); }
  databaseNames() { return [...this.dbs.keys()].sort(); }

  createDatabase(name, opts = {}) {
    const key = lc(name);
    const sqlite = this.openSqlite(null);
    sqlite.run(`CREATE TABLE ${META_TABLE}(k TEXT PRIMARY KEY, v TEXT)`);
    const ctx = { name: key, sql: sqlite, meta: { tables: {}, views: {}, charset: opts.charset || 'utf8mb4', collation: opts.collation || 'utf8mb4_0900_ai_ci' } };
    this.dbs.set(key, ctx);
    this.saveMeta(ctx);
    return ctx;
  }

  dropDatabase(name) {
    const ctx = this.getDb(name);
    if (!ctx) return 0;
    const n = Object.keys(ctx.meta.tables).length + Object.keys(ctx.meta.views).length;
    ctx.sql.close();
    this.dbs.delete(lc(name));
    return n;
  }

  /** SQLite dosyasından (Uint8Array) veritabanı yükler */
  loadDatabase(name, bytes) {
    const key = lc(name);
    const old = this.dbs.get(key);
    if (old) old.sql.close();
    const sqlite = this.openSqlite(bytes);
    let meta;
    try {
      const r = sqlite.exec(`SELECT v FROM ${META_TABLE} WHERE k = 'meta'`);
      meta = JSON.parse(r[0].values[0][0]);
    } catch {
      sqlite.close();
      throw new Error(`"${name}" geçerli bir simülatör veritabanı değil.`);
    }
    meta.views ??= {};
    const ctx = { name: key, sql: sqlite, meta };
    this.dbs.set(key, ctx);
    this.registerUserFunctions(ctx);
    return ctx;
  }

  /** Veritabanını SQLite dosyası olarak dışa aktarır */
  exportDatabase(name) {
    const ctx = this.getDb(name);
    if (!ctx) throw new Error('Veritabanı yok: ' + name);
    const bytes = ctx.sql.export();
    // sql.js export() bağlantıyı yeniden açar: işlevler ve ayarlar yeniden kurulur.
    this.prepareSqlite(ctx.sql);
    this.registerUserFunctions(ctx);
    return bytes;
  }

  saveMeta(ctx) {
    ctx.sql.run(`INSERT OR REPLACE INTO ${META_TABLE}(k, v) VALUES ('meta', ?)`, [JSON.stringify(ctx.meta)]);
  }

  // ---- kullanıcılar

  findUser(user, host = 'localhost') {
    const u = this.users.filter((x) => x.user === user);
    return u.find((x) => x.host === host) || u.find((x) => x.host === '%') || (host === '127.0.0.1' || host === '::1' ? u.find((x) => x.host === 'localhost') : null) || null;
  }

  /** Bağlantı açar. Hatalıysa MySqlError (1045 / 2003) fırlatır. */
  connect(user, password, host = 'localhost', opts = {}) {
    if (!this.running) throw new MySqlError(2003, `Can't connect to MySQL server on '${host}:${this.port}' (10061)`, 'HY000');
    const u = this.findUser(user, host);
    if (!u || (u.password || '') !== (password || '')) {
      throw new MySqlError(1045, `Access denied for user '${user}'@'${host}' (using password: ${password ? 'YES' : 'NO'})`);
    }
    const s = new Session(this, u, host);
    if (opts.database) s.use(opts.database);
    if (opts.safeUpdates) s.safeUpdates = true;
    return s;
  }

  privsOn(u, db, table) {
    const out = new Set();
    for (const g of u.grants || []) {
      if (g.db !== '*' && lc(g.db) !== lc(db ?? '')) continue;
      if (g.table !== '*' && table != null && lc(g.table) !== lc(table)) continue;
      for (const p of g.privs) out.add(p);
    }
    return out;
  }

  can(u, db, priv, table) {
    const p = this.privsOn(u, db, table);
    return p.has('ALL PRIVILEGES') || p.has('ALL') || p.has(priv);
  }

  canSeeDb(u, db) {
    return (u.grants || []).some((g) => g.db === '*' || lc(g.db) === lc(db));
  }

  // ---- durum (kalıcılık)

  exportState() {
    return { version: this.version, running: this.running, users: this.users };
  }

  importState(st) {
    if (!st) return;
    if (st.version) this.version = st.version;
    if (typeof st.running === 'boolean') this.running = st.running;
    if (Array.isArray(st.users) && st.users.some((u) => u.user === 'root')) this.users = st.users;
  }

  /** Hizmeti durdurur / başlatır (Windows hizmeti ya da Workbench Startup/Shutdown) */
  setRunning(on) {
    if (on === this.running) return;
    this.running = on;
    this.epoch++;
    if (on) this.startedAt = Date.now();
    this.sessions.clear();
    this.emit({ type: 'running', running: on });
  }

  setRootPassword(pw) {
    for (const u of this.users) if (u.user === 'root') u.password = pw;
  }
}

// ---------------------------------------------------------------- oturum

export class Session {
  constructor(server, user, host) {
    this.server = server;
    this.account = user;
    this.user = user.user;
    this.host = host;
    this.db = null;
    this.vars = new Map();
    this.safeUpdates = false;
    this.fkChecks = true;
    this.inTx = false;
    this.txDbs = new Set();
    this.lastInsertId = 0;
    this.limitRows = 0; // Workbench "Limit to 1000 rows"
    this.epoch = server.epoch; // sunucu yeniden başlatılınca eski bağlantılar kopar
    this.id = ++server.connId;
    server.sessions.add(this);
  }

  close() {
    this.server.sessions.delete(this);
    // oturuma ait geçici (TEMPORARY) tablolar oturumla birlikte silinir
    for (const ctx of this.server.dbs.values()) {
      for (const m of Object.values(ctx.meta.tables)) {
        if (m.temporary !== this.id) continue;
        try { ctx.sql.run(`DROP TABLE ${dq(m.name)}`); } catch { /* yok */ }
        delete ctx.meta.tables[m.name];
        this.server.saveMeta(ctx);
      }
    }
  }

  use(name) {
    const ctx = this.server.getDb(name);
    if (!ctx || SYSTEM_DBS.includes(lc(name))) {
      if (SYSTEM_DBS.includes(lc(name))) { this.db = lc(name); return; }
      throw err(1049, `Unknown database '${name}'`);
    }
    if (!this.server.canSeeDb(this.account, name)) throw err(1044, `Access denied for user '${this.user}'@'${this.host}' to database '${name}'`);
    this.db = ctx.name;
  }

  /**
   * Betiği çalıştırır. Döner: sonuç dizisi. stopOnError varsayılan true (Workbench gibi).
   * Sonuç: { sql, s, e, ok, error?, columns?, rows?, affected, message, insertId?, ms, schema?: true, db? }
   */
  execute(script, opts = {}) {
    const stopOnError = opts.stopOnError !== false;
    const list = splitStatements(script);
    const results = [];
    for (const st of list) {
      const r = this.run(script, st);
      if (r.multi) {
        // CALL: yordamın döndürdüğü her sonuç kümesi ayrı bir sonuç
        const sets = r.multi;
        delete r.multi;
        for (const x of sets) results.push({ ...r, ...x, sql: r.sql, ok: true, message: `${x.rows.length} row(s) returned`, editable: null, affected: 0 });
        r.message = `${r.affected} row(s) affected`;
      }
      results.push(r);
      if (!r.ok && stopOnError) break;
    }
    return results;
  }

  /** Tek komut: belirteçler + kaynak */
  run(src, st) {
    const t0 = performance.now();
    const res = { sql: st.sql, s: st.s, e: st.e, ok: true, affected: 0, message: '' };
    this.server.active = this;
    this.server.trgFlag = 0;
    this.frame = null;
    try {
      if (!this.server.running || this.server.epoch !== this.epoch) throw new MySqlError(2013, 'Lost connection to MySQL server during query', 'HY000');
      const out = this.dispatch(src, st);
      Object.assign(res, out);
      if (res.rows && !res.message) res.message = `${res.rows.length} row(s) returned`;
      if (!res.message) res.message = `${res.affected} row(s) affected` + (res.info ? ' ' + res.info : '');
    } catch (e) {
      res.ok = false;
      if (e instanceof MySqlError) res.error = { code: e.code, state: e.state, message: e.message };
      else {
        console.error(e);
        res.error = { code: 1105, state: 'HY000', message: 'Unknown error: ' + (e.message || e) };
      }
      res.message = `Error Code: ${res.error.code}. ${res.error.message}`;
    } finally {
      this.server.active = null;
    }
    res.ms = performance.now() - t0;
    return res;
  }

  ctx(name = this.db) {
    if (!name) throw err(1046, 'No database selected');
    const c = this.server.getDb(name);
    if (!c) {
      if (SYSTEM_DBS.includes(lc(name))) throw err(1044, `Access denied for user '${this.user}'@'${this.host}' to database '${name}'`);
      throw err(1049, `Unknown database '${name}'`);
    }
    return c;
  }

  changed(ctx, schema) {
    this.server.emit({ type: 'change', db: ctx.name, schema: !!schema });
  }

  requirePriv(db, priv, table) {
    if (!this.server.can(this.account, db, priv, table)) {
      if (table) throw err(1142, `${priv} command denied to user '${this.user}'@'${this.host}' for table '${table}'`);
      throw err(1044, `Access denied for user '${this.user}'@'${this.host}' to database '${db}'`);
    }
  }

  dispatch(src, st) {
    const p = new Parser(st.tokens, src, st);
    const first = p.cur;
    if (!first) return { affected: 0 };
    const w = first.t === 'id' ? first.u : first.v;
    switch (w) {
      case 'SELECT':
      case 'WITH':
      case '(':
        if (this.findInto(st.tokens.filter(sig)) >= 0) {
          try { return this.selectInto(src, st); } catch (e) { if (e.warning) return { affected: 0, warnings: 1 }; throw e; }
        }
        return this.dml(src, st, 'SELECT');
      case 'INSERT':
      case 'REPLACE':
      case 'UPDATE':
      case 'DELETE':
        return this.dml(src, st, w === '(' || w === 'WITH' ? 'SELECT' : w);
      case 'TABLE':
        return this.dml(src, { ...st, tokens: [...tokenize('SELECT * FROM'), { t: 'ws', v: ' ' }, ...st.tokens.slice(st.tokens.indexOf(first) + 1)] }, 'SELECT');
      case 'CREATE': return this.create(p, src, st);
      case 'CALL': return this.call(p, src, st);
      case 'DROP': return this.drop(p);
      case 'ALTER': return this.alter(p);
      case 'RENAME': return this.renameTables(p);
      case 'TRUNCATE': return this.truncate(p);
      case 'USE': {
        p.i++;
        const name = p.name(true);
        p.end();
        this.use(name);
        return { affected: 0, useDb: this.db };
      }
      case 'SHOW': return this.show(p);
      case 'DESCRIBE':
      case 'DESC':
      case 'EXPLAIN': {
        p.i++;
        if (p.eat('FORMAT')) { p.expect('='); const f = p.name(true).toUpperCase(); if (f !== 'TRADITIONAL') throw err(1235, `Simülatör: EXPLAIN FORMAT=${f} desteklenmiyor; FORMAT=TRADITIONAL (tablo) kullanılır.`); }
        if (p.is('ANALYZE')) throw err(1235, 'Simülatör: EXPLAIN ANALYZE desteklenmiyor.');
        if (p.is('SELECT') || p.is('UPDATE') || p.is('DELETE') || p.is('INSERT') || p.is('REPLACE') || p.is('WITH') || p.is('(')) {
          const first = p.cur;
          const inner = st.tokens.slice(st.tokens.indexOf(first));
          const kind2 = first.t === 'id' ? (first.u === 'WITH' ? 'SELECT' : first.u) : 'SELECT';
          this.explainMode = true;
          try { return this.dml(src, { ...st, tokens: inner }, kind2); } finally { this.explainMode = false; }
        }
        const q = p.qname();
        const col = p.done() ? null : p.name(true);
        return this.describe(q, col);
      }
      case 'SET': return this.set(p);
      case 'START':
      case 'BEGIN':
        this.commitAll();
        this.inTx = true;
        return { affected: 0 };
      case 'COMMIT':
        this.commitAll();
        return { affected: 0 };
      case 'ROLLBACK':
        this.rollbackAll();
        return { affected: 0 };
      case 'LOCK':
      case 'UNLOCK':
      case 'FLUSH':
      case 'ANALYZE':
      case 'OPTIMIZE':
        return { affected: 0 };
      case 'GRANT': return this.grant(p, src, st);
      case 'REVOKE': return this.revoke(p);
      default:
        throw p.syntax(first);
    }
  }

  commitAll() {
    for (const name of this.txDbs) { const c = this.server.getDb(name); if (c) { try { c.sql.run('COMMIT'); } catch { /* yok */ } this.changed(c, false); } }
    this.txDbs.clear();
    this.inTx = false;
  }

  rollbackAll() {
    for (const name of this.txDbs) { const c = this.server.getDb(name); if (c) { try { c.sql.run('ROLLBACK'); } catch { /* yok */ } this.changed(c, false); } }
    this.txDbs.clear();
    this.inTx = false;
  }

  // ------------------------------------------------------------ SET

  sysVar(name) {
    const n = lc(name).replace(/^@@/, '').replace(/^(session|global|local)\./, '');
    const map = {
      version: this.server.version, version_comment: 'MySQL Community Server - GPL', port: this.server.port, sql_safe_updates: this.safeUpdates ? 1 : 0,
      foreign_key_checks: this.fkChecks ? 1 : 0, autocommit: this.inTx ? 0 : 1, character_set_client: 'utf8mb4', character_set_server: 'utf8mb4',
      character_set_connection: 'utf8mb4', character_set_results: 'utf8mb4', collation_server: 'utf8mb4_0900_ai_ci', collation_connection: 'utf8mb4_0900_ai_ci',
      lower_case_table_names: 1, hostname: 'OGRENCI-PC', datadir: `C:\\ProgramData\\MySQL\\MySQL Server ${this.server.version.slice(0, 3)}\\Data\\`,
      basedir: `C:\\Program Files\\MySQL\\MySQL Server ${this.server.version.slice(0, 3)}\\`, time_zone: 'SYSTEM', unique_checks: 1, sql_mode: 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION',
      sql_notes: 1, log_bin_trust_function_creators: this.server.logBinTrust ? 1 : 0, log_bin: 1, max_allowed_packet: 67108864, default_storage_engine: 'InnoDB', transaction_isolation: 'REPEATABLE-READ', tx_isolation: 'REPEATABLE-READ',
    };
    return n in map ? map[n] : null;
  }

  set(p) {
    p.expect('SET');
    if (p.eat('NAMES') || p.eat('CHARACTER', 'SET') || p.eat('CHARSET')) return { affected: 0 };
    if (p.eat('PASSWORD')) {
      let target = this.account;
      if (p.eat('FOR')) target = this.userRef(p);
      p.expect('=');
      const t = p.cur;
      if (!t || t.t !== 'str') throw p.syntax();
      target.password = t.val;
      this.server.emit({ type: 'users' });
      return { affected: 0 };
    }
    if (p.eat('TRANSACTION') || p.eat('SESSION', 'TRANSACTION') || p.eat('GLOBAL', 'TRANSACTION')) return { affected: 0 };
    for (;;) {
      const t = p.cur;
      if (!t) throw p.syntax();
      let name;
      let isUser = false;
      if (t.t === 'var' && !t.v.startsWith('@@')) { name = t.v.slice(1).replace(/[`'"]/g, ''); isUser = true; p.i++; }
      else if (t.t === 'var') { name = t.v.slice(2); p.i++; }
      else {
        p.eat('SESSION') || p.eat('GLOBAL') || p.eat('LOCAL') || p.eat('PERSIST');
        name = p.name(true);
        if (p.eat('.')) name = p.name(true);
      }
      if (!p.eat('=') && !p.eat(':=')) throw p.syntax();
      // değer: ifade sonuna (üst düzey virgül) kadar
      const start = p.i;
      let depth = 0;
      while (!p.done()) {
        const x = p.cur;
        if (x.t === 'op' && x.v === '(') depth++;
        else if (x.t === 'op' && x.v === ')') depth--;
        else if (x.t === 'op' && x.v === ',' && depth === 0) break;
        p.i++;
      }
      const vt = p.toks.slice(start, p.i);
      const value = this.evalSimple(vt, p);
      if (isUser) this.vars.set(lc(name), value);
      else this.setSysVar(name, value, p);
      if (!p.eat(',')) break;
    }
    p.end();
    return { affected: 0 };
  }

  evalSimple(vt, p) {
    if (vt.length === 1) {
      const t = vt[0];
      if (t.t === 'id' && (t.u === 'ON' || t.u === 'TRUE')) return 1;
      if (t.t === 'id' && (t.u === 'OFF' || t.u === 'FALSE')) return 0;
      if (t.t === 'id' && t.u === 'DEFAULT') return null;
      if (t.t === 'id') return t.v;
    }
    if (!vt.length) throw p.syntax();
    const expr = this.translate(vt, p.src, this.db ? this.server.getDb(this.db) : null).text;
    const db = this.db && this.server.getDb(this.db) ? this.server.getDb(this.db).sql : this.server.scratch;
    try {
      const r = db.exec('SELECT ' + expr);
      return r[0]?.values[0][0] ?? null;
    } catch (e) {
      throw this.mapError(e, { kind: 'SELECT' });
    }
  }

  setSysVar(name, v, p) {
    const n = lc(name);
    const on = v === 1 || v === '1' || /^(on|true)$/i.test(String(v));
    if (n === 'sql_safe_updates') this.safeUpdates = on;
    else if (n === 'log_bin_trust_function_creators') this.server.logBinTrust = on;
    else if (n === 'foreign_key_checks') {
      this.fkChecks = on;
      for (const c of this.server.dbs.values()) { try { c.sql.run('PRAGMA foreign_keys = ' + (on ? 'ON' : 'OFF')); } catch { /* işlem içinde */ } }
      this.server.scratch.run('PRAGMA foreign_keys = ' + (on ? 'ON' : 'OFF'));
    } else if (n === 'autocommit') {
      if (on) this.commitAll(); else this.inTx = true;
    } else if (this.sysVar(n) === null && !/^(sql_mode|time_zone|names|character_set_\w+|collation_\w+|unique_checks|sql_notes|old_\w+|saved_\w+)$/.test(n)) {
      throw err(1193, `Unknown system variable '${name}'`);
    }
  }

  // ------------------------------------------------------------ çeviri (MySQL → SQLite)

  /**
   * Belirteçleri SQLite SQL metnine çevirir.
   * Döner: { text, qualifiers: Set<db> , names: Set<lc id> }
   */
  translate(toks, src, ctx, opts = {}) {
    const S = [];
    toks.forEach((t, i) => { if (sig(t)) S.push(i); });
    const out = toks.map((t) => (t.t === 'cmt' ? ' ' : t.v));
    const pre = new Array(toks.length).fill('');
    const post = new Array(toks.length).fill('');
    const qualifiers = new Set();
    const names = new Set();
    const tableNames = ctx ? new Set(Object.keys(ctx.meta.tables)) : new Set();
    const T = (j) => (j >= 0 && j < S.length ? toks[S[j]] : null);
    const frames = []; // parantez yığını: { fn, cast }
    let castSkip = null;
    let inUpsert = false;
    let skipParen = false;
    for (let j = 0; j < S.length; j++) {
      const k = S[j];
      const t = toks[k];
      const prev = T(j - 1);
      const next = T(j + 1);
      if (t.__out != null) { out[k] = t.__out; continue; }
      if (castSkip && frames.length >= castSkip.depth) {
        if (t.t === 'op' && t.v === ')' && frames.length === castSkip.depth) { castSkip = null; } else {
          if (t.t === 'op' && t.v === '(') frames.push({});
          else if (t.t === 'op' && t.v === ')') frames.pop();
          out[k] = '';
          continue;
        }
      }
      if (t.t === 'op' && t.v === '(') {
        frames.push({ fn: prev && (prev.t === 'id') ? prev.u : null, start: j, drop: skipParen });
        if (skipParen) { out[k] = ''; skipParen = false; }
        continue;
      }
      if (t.t === 'op' && t.v === ')') { const fr = frames.pop(); if (fr?.drop) out[k] = ''; continue; }
      const frame = frames[frames.length - 1];
      switch (t.t) {
        case 'qid':
        case 'id': {
          const name = t.t === 'qid' ? t.val : t.v;
          // veritabanı niteleyicisi: db.tablo
          if (next && next.t === 'op' && next.v === '.' && (!prev || !(prev.t === 'op' && prev.v === '.'))) {
            const after = T(j + 2);
            if (after && (after.t === 'id' || after.t === 'qid') && this.server.hasDb(name) && !tableNames.has(lc(name))) {
              qualifiers.add(lc(name));
              // başka veritabanı: ATTACH edilmiş şema adıyla kalır
              if (opts.execDb && lc(name) !== opts.execDb) { out[k] = dq(lc(name)); continue; }
              out[k] = '';
              out[S[j + 1]] = '';
              continue;
            }
          }
          // saklı program yerel değişkeni (MySQL'de yerel değişken sütun adından önceliklidir)
          if ((this.frame || opts.trigger) && !t.__noLocal && !(prev && prev.t === 'op' && prev.v === '.') && !(next && next.t === 'op' && (next.v === '.' || (next.v === '(' && t.t === 'id'))) && !(prev && prev.t === 'id' && prev.u === 'AS')) {
            const lv = this.localRef(name, opts);
            if (lv !== undefined) { out[k] = lv; t.__isLocal = true; break; }
          }
          names.add(lc(name));
          if (t.t === 'qid') { out[k] = dq(name); break; }
          const u = t.u;
          const isCall = next && next.t === 'op' && next.v === '(' && next.s === t.e;
          const isCallLoose = next && next.t === 'op' && next.v === '(';
          const tableCtx = prev && prev.t === 'id' && ['INTO', 'FROM', 'JOIN', 'UPDATE', 'TABLE', 'EXISTS'].includes(prev.u);
          if (!tableCtx && (isCall || (isCallLoose && FUNC_MAP[u] && !['LEFT', 'RIGHT'].includes(u)))) {
            if (FUNC_MAP[u]) out[k] = FUNC_MAP[u];
            break;
          }
          if (frame && frame.fn === 'TIMESTAMPDIFF' && prev && prev.t === 'op' && prev.v === '(') { out[k] = sq(u); break; }
          if (frame && frame.fn === 'CAST' && u === 'AS') {
            const ty = next ? next.u : '';
            const map = { SIGNED: 'INTEGER', UNSIGNED: 'INTEGER', INTEGER: 'INTEGER', INT: 'INTEGER', CHAR: 'TEXT', VARCHAR: 'TEXT', DECIMAL: 'REAL', DOUBLE: 'REAL', FLOAT: 'REAL', REAL: 'REAL', DATE: 'TEXT', DATETIME: 'TEXT', TIME: 'TEXT', BINARY: 'BLOB', JSON: 'TEXT' };
            out[k] = 'AS ' + (map[ty] || 'TEXT');
            castSkip = { depth: frames.length };
            break;
          }
          switch (u) {
            case 'CURRENT_DATE': out[k] = 'm_curdate()'; break;
            case 'CURRENT_TIME': out[k] = 'm_curtime()'; break;
            case 'CURRENT_TIMESTAMP':
            case 'LOCALTIME':
            case 'LOCALTIMESTAMP': out[k] = 'm_now()'; break;
            case 'CURRENT_USER': out[k] = 'm_user()'; break;
            case 'DIV': out[k] = '/'; break;
            case 'MOD': out[k] = '%'; break;
            case 'RLIKE': out[k] = 'REGEXP'; break;
            case 'STRAIGHT_JOIN': out[k] = 'JOIN'; break;
            case 'SQL_CALC_FOUND_ROWS':
            case 'SQL_NO_CACHE':
            case 'SQL_CACHE':
            case 'HIGH_PRIORITY':
            case 'LOW_PRIORITY':
            case 'DELAYED':
            case 'QUICK':
              out[k] = ''; break;
            case 'BINARY':
              if (!(next && next.t === 'op' && next.v === '(')) out[k] = '';
              break;
            case 'SEPARATOR':
              if (frame && frame.fn === 'GROUP_CONCAT') out[k] = ',';
              break;
            case 'INTERVAL': {
              // DATE_ADD(d, INTERVAL 5 DAY) → m_date_add(d, 5, 'DAY')
              out[k] = '';
              let m = j + 1;
              let depth = 0;
              for (; m < S.length; m++) {
                const x = T(m);
                if (x.t === 'op' && x.v === '(') depth++;
                else if (x.t === 'op' && x.v === ')') depth--;
                if (depth === 0 && x.t === 'id' && /^(YEAR|QUARTER|MONTH|WEEK|DAY|HOUR|MINUTE|SECOND)$/.test(x.u)) break;
              }
              if (m < S.length) {
                const unit = T(m);
                unit.__unit = true;
                out[S[m]] = `, '${unit.u}'`;
              }
              break;
            }
            case 'IGNORE':
              if (prev && prev.t === 'id' && prev.u === 'INSERT') out[k] = 'OR IGNORE';
              break;
            case 'DUPLICATE':
              // ON DUPLICATE KEY UPDATE → ON CONFLICT DO UPDATE SET
              if (prev && prev.u === 'ON' && next && next.u === 'KEY' && T(j + 2)?.u === 'UPDATE') {
                out[k] = 'CONFLICT DO';
                out[S[j + 1]] = '';
                out[S[j + 2]] = 'UPDATE SET';
                inUpsert = true;
                j += 2;
              }
              break;
            default:
              if (t.__unit) break;
              if (u === 'VALUES' && isCallLoose && inUpsert) { out[k] = 'excluded.'; skipParen = true; }
          }
          break;
        }
        case 'str': {
          // ardışık dizgiler MySQL'de birleşir: 'a' 'b'
          if (next && next.t === 'str' && !(prev && prev.t === 'id' && prev.u === 'AS')) {
            next.val = t.val + next.val;
            out[k] = '';
            break;
          }
          out[k] = sq(t.val);
          break;
        }
        case 'num':
          if (/^0x/i.test(t.v)) out[k] = String(t.val);
          break;
        case 'var': {
          if (t.v.startsWith('@@')) {
            const v = this.sysVar(t.v);
            if (v === null) throw err(1193, `Unknown system variable '${t.v.slice(2)}'`);
            out[k] = typeof v === 'number' ? String(v) : sq(v);
          } else if (opts.trigger) {
            out[k] = `m_getvar(${sq(lc(t.v.slice(1).replace(/[`'"]/g, '')))})`;
          } else {
            const v = this.vars.get(lc(t.v.slice(1).replace(/[`'"]/g, '')));
            out[k] = v == null ? 'NULL' : typeof v === 'number' ? String(v) : sq(v);
          }
          break;
        }
        case 'op':
          if (t.v === '&&') out[k] = ' AND ';
          else if (t.v === '||') out[k] = ' OR ';
          else if (t.v === '!') out[k] = ' NOT ';
          else if (t.v === '<=>') out[k] = ' IS ';
          else if (t.v === '/') out[k] = '*1.0/';
          else if (t.v === ':=') throw err(1064, 'Atama işleci (:=) bu simülatörde desteklenmiyor.');
          break;
        default:
      }
    }
    // Dizgi karşılaştırmaları: utf8mb4_0900_ai_ci gibi Türkçe harflerde de büyük/küçük harf ve aksan duyarsız
    this.foldComparisons(toks, S, out, pre, post, ctx);
    // ORDER BY: MySQL harmanlamasına (Türkçe/aksan duyarsız) uygun sıralama anahtarı
    if (!opts.noOrderWrap) this.wrapOrderBy(toks, S, out, pre, post);
    if (opts.aliasSelect) this.aliasSelectList(toks, S, out, post, src);
    let text = '';
    for (let i = 0; i < toks.length; i++) text += pre[i] + (toks[i].__pre || '') + out[i] + post[i] + (toks[i].__post || '');
    return { text, qualifiers, names };
  }

  foldComparisons(toks, S, out, pre, post, ctx) {
    const T = (j) => toks[S[j]];
    // yalnızca metin türündeki sütunlar katlanır (sayısal sütunda '1' = 1 karşılaştırması bozulmasın)
    const textCols = new Set();
    const otherCols = new Set();
    for (const m of Object.values(ctx?.meta.tables || {})) {
      for (const c of m.columns) (isTextType(c.type) && c.type !== 'json' ? textCols : otherCols).add(lc(c.name));
    }
    const isText = (j) => { const t = T(j); const n = lc(t.t === 'qid' ? t.val : t.v); return textCols.has(n) && !otherCols.has(n); };
    let depth = 0;
    let assign = -1; // SET bölgesi (atamalar) içindeki derinlik
    const isRef = (j) => T(j) && (T(j).t === 'id' || T(j).t === 'qid') && !RESERVED.has(T(j).u) && !(T(j + 1) && T(j + 1).v === '(');
    for (let j = 0; j < S.length; j++) {
      const t = T(j);
      if (t.t === 'op' && t.v === '(') { depth++; continue; }
      if (t.t === 'op' && t.v === ')') { depth--; continue; }
      if (t.t === 'id' && t.u === 'SET') { assign = depth; continue; }
      if (t.t === 'id' && /^(WHERE|ORDER|LIMIT|FROM)$/.test(t.u) && depth <= assign) assign = -1;
      if (assign >= 0 && depth === assign) continue;
      if (!(t.t === 'op' && (t.v === '=' || t.v === '<>' || t.v === '!='))) continue;
      const a = T(j - 1);
      const b = T(j + 1);
      if (!a || !b) continue;
      // sol: ad veya t.ad ; sağ: dizgi (ya da tersi)
      let left = null;
      if (isRef(j - 1)) left = (j >= 3 && T(j - 2).v === '.' && isRef(j - 3)) ? j - 3 : j - 1;
      if (left != null && !isText(j - 1)) left = null;
      if (left != null && b.t === 'str') {
        pre[S[left]] = 'm_sort(' + pre[S[left]];
        post[S[j - 1]] += ')';
        pre[S[j + 1]] = 'm_sort(' + pre[S[j + 1]];
        post[S[j + 1]] += ')';
      } else if (a.t === 'str' && isRef(j + 1)) {
        const right = T(j + 2) && T(j + 2).v === '.' && isRef(j + 3) ? j + 3 : j + 1;
        if (!isText(right)) continue;
        pre[S[j - 1]] = 'm_sort(' + pre[S[j - 1]];
        post[S[j - 1]] += ')';
        pre[S[j + 1]] = 'm_sort(' + pre[S[j + 1]];
        post[S[right]] += ')';
      }
    }
  }

  wrapOrderBy(toks, S, out, pre, post) {
    const T = (j) => toks[S[j]];
    // UNION içeren sorgularda ORDER BY terimleri sonuç sütunlarıyla eşleşmelidir: sarılmaz.
    if (S.some((k) => toks[k].t === 'id' && (toks[k].u === 'UNION' || toks[k].u === 'INTERSECT' || toks[k].u === 'EXCEPT'))) return;
    for (let j = 0; j < S.length - 1; j++) {
      const t = T(j);
      if (!(t.t === 'id' && t.u === 'ORDER' && T(j + 1).t === 'id' && T(j + 1).u === 'BY')) continue;
      let m = j + 2;
      let depth = 0;
      let termStart = m;
      const flush = (endExcl) => {
        let a = termStart;
        let b = endExcl - 1;
        if (b >= a && T(b).t === 'id' && (T(b).u === 'ASC' || T(b).u === 'DESC')) b--;
        if (b < a) return;
        if (a === b && T(a).t === 'num') return;
        pre[S[a]] = 'm_sort(' + pre[S[a]];
        post[S[b]] = post[S[b]] + ')';
      };
      for (; m < S.length; m++) {
        const x = T(m);
        if (x.t === 'op' && x.v === '(') depth++;
        else if (x.t === 'op' && x.v === ')') {
          if (depth === 0) break;
          depth--;
        } else if (depth === 0 && x.t === 'op' && x.v === ',') {
          flush(m);
          termStart = m + 1;
        } else if (depth === 0 && x.t === 'id' && /^(LIMIT|FOR|LOCK|INTO|UNION|WINDOW|SEPARATOR)$/.test(x.u)) break;
      }
      flush(m);
      j = m - 1;
    }
  }

  aliasSelectList(toks, S, out, post, src) {
    const T = (j) => toks[S[j]];
    if (!S.length || T(0).t !== 'id' || T(0).u !== 'SELECT') return;
    let j = 1;
    while (j < S.length && T(j).t === 'id' && /^(DISTINCT|ALL|DISTINCTROW|SQL_CALC_FOUND_ROWS|SQL_NO_CACHE|HIGH_PRIORITY|STRAIGHT_JOIN)$/.test(T(j).u)) j++;
    let depth = 0;
    let start = j;
    const items = [];
    for (; j < S.length; j++) {
      const x = T(j);
      if (x.t === 'op' && x.v === '(') depth++;
      else if (x.t === 'op' && x.v === ')') depth--;
      else if (depth === 0 && x.t === 'op' && x.v === ',') { items.push([start, j - 1]); start = j + 1; } else if (depth === 0 && x.t === 'id' && /^(FROM|INTO|WHERE|GROUP|HAVING|ORDER|LIMIT|UNION|WINDOW|FOR)$/.test(x.u)) break;
    }
    items.push([start, j - 1]);
    const NOT_ALIAS = new Set(['END', 'NULL', 'TRUE', 'FALSE', 'AND', 'OR', 'NOT', 'ASC', 'DESC', 'DISTINCT', 'IS', 'IN', 'LIKE', 'THEN', 'ELSE']);
    for (const [a, b] of items) {
      if (b < a) continue;
      const len = b - a + 1;
      const first = T(a);
      const last = T(b);
      // basit sütun: ad, t.ad, *, t.*
      if (len === 1 && !first.__isLocal && (first.t === 'id' || first.t === 'qid' || (first.t === 'op' && first.v === '*'))) continue;
      if (len === 3 && T(a + 1).v === '.' && (first.t === 'id' || first.t === 'qid')) continue;
      if (len === 5 && T(a + 1).v === '.' && T(a + 3).v === '.') continue;
      if (len >= 2) {
        const p = T(b - 1);
        if (p.t === 'id' && p.u === 'AS') continue;
        if ((last.t === 'id' && !NOT_ALIAS.has(last.u) && !RESERVED.has(last.u)) || last.t === 'qid' || last.t === 'str') {
          if (p.t === 'id' || p.t === 'qid' || p.t === 'num' || p.t === 'str' || (p.t === 'op' && p.v === ')')) {
            if (!(p.t === 'id' && (RESERVED.has(p.u) || NOT_ALIAS.has(p.u)))) continue;
          }
        }
      }
      if (first.t === 'num' && len === 1) { post[S[b]] += ' AS ' + dq(first.v); continue; }
      const text = src.slice(first.s, last.e);
      post[S[b]] += ' AS ' + dq(text);
    }
  }

  // ------------------------------------------------------------ DML

  dml(src, st, kind) {
    let toks = st.tokens;
    // MySQL çok tablolu UPDATE / DELETE → SQLite biçimi
    if (kind === 'UPDATE' || kind === 'DELETE') {
      const rw = this.rewriteMultiTable(toks.filter(sig), src, kind);
      if (rw) { src = rw; toks = tokenize(rw); st = { ...st, tokens: toks }; }
    }
    const sigToks = toks.filter(sig);
    const tq = this.dmlTargetQ(sigToks, kind);
    const target = tq?.name ?? null;
    // hedef tablonun veritabanı (UPDATE db.t ...) ve sorgunun çalışacağı bağlantı
    let tctx = kind !== 'SELECT' && tq?.db ? this.ctx(tq.db) : this.db ? this.server.getDb(this.db) : null;
    let ctx = this.db ? this.server.getDb(this.db) : tctx;
    const opts = { aliasSelect: kind === 'SELECT', upsert: true };
    let tr = this.translate(toks, src, ctx, { ...opts, execDb: ctx?.name });
    if (!ctx && tr.qualifiers.size) {
      ctx = this.server.getDb([...tr.qualifiers][0]);
      tr = this.translate(toks, src, ctx, { ...opts, execDb: ctx.name });
    }
    if (kind === 'SELECT') tctx = ctx;
    // farklı veritabanlarındaki tablolar: SQLite ATTACH
    const attach = [...tr.qualifiers].filter((q) => q !== ctx?.name);
    // INSERT ... SET a=1, b=2
    let sqlText = tr.text;
    if (kind !== 'SELECT') {
      if (!tctx) throw err(1046, 'No database selected');
      if (target && !tctx.meta.tables[lc(target)]) {
        if (tctx.meta.views[lc(target)]) throw err(1288, `The target table ${target} of the ${kind} is not updatable`);
        throw err(1146, `Table '${tctx.name}.${lc(target)}' doesn't exist`);
      }
      this.requirePriv(tctx.name, kind === 'REPLACE' ? 'INSERT' : kind, target);
      if (kind === 'INSERT' || kind === 'REPLACE') sqlText = this.rewriteInsertSet(sigToks, src, tctx, sqlText, ctx);
      if ((kind === 'UPDATE' || kind === 'DELETE') && this.safeUpdates) this.checkSafeUpdate(sigToks, tctx, target, kind);
      if ((kind === 'UPDATE' || kind === 'DELETE') && sigToks.some((t, i) => t.t === 'id' && t.u === 'LIMIT' && i > 0)) {
        sqlText = this.rewriteLimit(sqlText, kind, target);
      }
    } else if (ctx) this.requirePriv(ctx.name, 'SELECT');
    for (const q of attach) this.requirePriv(q, 'SELECT');
    const db = ctx ? ctx.sql : this.server.scratch;
    const attached = [];
    try {
      for (const q of attach) {
        const other = this.server.getDb(q);
        if (this.txDbs.has(ctx.name)) throw err(1235, 'Simülatör: açık bir işlem (transaction) içinde başka veritabanındaki tabloya erişilemiyor; önce COMMIT yapın.');
        db.run(`ATTACH DATABASE ${sq('/' + other.sql.filename)} AS ${dq(q)}`);
        attached.push(q);
      }
      return this.dmlRun({ db, ctx, tctx, kind, target, sigToks, src, sqlText, tr });
    } finally {
      for (const q of attached) { try { db.run(`DETACH DATABASE ${dq(q)}`); } catch { /* yok */ } }
    }
  }

  dmlRun({ db, ctx, tctx, kind, target, sigToks, src, sqlText, tr }) {
    if (this.explainMode) {
      this.explainMode = false;
      return this.explainPlan(db, sqlText, tctx || ctx, sigToks, kind, target, { kind, ctx: tctx || ctx, target, toks: sigToks, src });
    }
    if (this.inTx && ctx && !this.txDbs.has(ctx.name)) {
      db.run('BEGIN');
      this.txDbs.add(ctx.name);
    }
    const errCtx = { kind, ctx: tctx || ctx, target, toks: sigToks, src };
    if (kind === 'SELECT') {
      let stmt;
      try {
        stmt = db.prepare(sqlText);
      } catch (e) {
        throw this.mapError(e, errCtx);
      }
      try {
        const names = stmt.getColumnNames();
        const rows = [];
        const limit = this.limitRows && !this.hasTopLevel(sigToks, 'LIMIT') ? this.limitRows : 0;
        while (stmt.step()) {
          rows.push(stmt.get());
          if (limit && rows.length >= limit) break;
        }
        const columns = this.describeColumns(names, rows, ctx, tr.names, sigToks);
        const editable = this.editableInfo(sigToks, ctx, columns);
        return { columns, rows, affected: 0, db: ctx?.name ?? null, editable, limited: !!(limit && rows.length >= limit) };
      } catch (e) {
        throw this.mapError(e, errCtx);
      } finally {
        stmt.free();
      }
    }
    try {
      db.run(sqlText);
    } catch (e) {
      throw this.mapError(e, errCtx);
    }
    const affected = db.getRowsModified();
    const res = { affected, db: tctx.name, table: lc(target) };
    if (kind === 'INSERT' || kind === 'REPLACE') {
      const id = db.exec('SELECT last_insert_rowid()')[0].values[0][0];
      const meta = tctx.meta.tables[lc(target)];
      if (meta && meta.columns.some((c) => c.autoInc) && affected > 0) { this.lastInsertId = id; res.insertId = id; }
      const tuples = this.countTuples(sigToks);
      if (tuples > 1) res.info = `Records: ${tuples}  Duplicates: 0  Warnings: 0`;
    } else if (kind === 'UPDATE') {
      res.info = `Rows matched: ${affected}  Changed: ${affected}  Warnings: 0`;
    }
    if (!this.inTx) this.changed(tctx, false);
    return res;
  }

  /** EXPLAIN: SQLite sorgu planını MySQL EXPLAIN tablosuna çevirir */
  explainPlan(db, sqlText, ctx, T, kind, target, errCtx) {
    let plan;
    try { plan = db.exec('EXPLAIN QUERY PLAN ' + sqlText)[0]?.values || []; } catch (e) { throw this.mapError(e, errCtx); }
    // takma ad → tablo
    const alias = new Map();
    for (let i = 0; i < T.length; i++) {
      const t = T[i];
      if (!(t.t === 'id' && ['FROM', 'JOIN', 'UPDATE', 'INTO'].includes(t.u))) continue;
      let k = i + 1;
      while (k < T.length) {
        let n = T[k];
        if (!n || !(n.t === 'id' || n.t === 'qid')) break;
        if (T[k + 1]?.v === '.') { k += 2; n = T[k]; }
        const name = lc(n.t === 'qid' ? n.val : n.v);
        k++;
        let a = name;
        if (T[k]?.t === 'id' && T[k].u === 'AS') { a = lc(T[k + 1].t === 'qid' ? T[k + 1].val : T[k + 1].v); k += 2; } else if (T[k] && (T[k].t === 'qid' || (T[k].t === 'id' && !RESERVED.has(T[k].u) && !['STRAIGHT_JOIN', 'USING', 'NATURAL'].includes(T[k].u)))) { a = lc(T[k].t === 'qid' ? T[k].val : T[k].v); k++; }
        alias.set(a, name);
        if (T[k]?.v === ',') { k++; continue; }
        break;
      }
    }
    const count = (name) => { try { return db.exec(`SELECT count(*) FROM ${dq(name)}`)[0].values[0][0]; } catch { return null; } };
    const hasWhere = T.some((t) => t.t === 'id' && t.u === 'WHERE');
    const rows = [];
    const selId = new Map([[0, 1]]);
    const selType = new Map([[1, kind === 'SELECT' ? 'SIMPLE' : kind]]);
    let nextId = 1;
    let filesort = false;
    for (const [id, parent, , detail] of plan) {
      const d = String(detail);
      const sid = selId.get(parent) ?? 1;
      if (/SUBQUERY|CO-ROUTINE|MATERIALIZE/.test(d)) {
        const n = ++nextId;
        selId.set(id, n);
        selType.set(n, /CORRELATED/.test(d) ? 'DEPENDENT SUBQUERY' : /CO-ROUTINE|MATERIALIZE/.test(d) ? 'DERIVED' : 'SUBQUERY');
        if (selType.get(1) === 'SIMPLE') selType.set(1, 'PRIMARY');
        continue;
      }
      selId.set(id, sid);
      if (/TEMP B-TREE/.test(d)) { filesort = true; continue; }
      const m = /^(SCAN|SEARCH) (\S+)(?: USING (.*))?$/.exec(d);
      if (!m) continue;
      const a = lc(m[2]);
      const table = alias.get(a) || a;
      const meta = ctx?.meta.tables[table];
      const using = m[3] || '';
      let type = 'ALL';
      let key = null;
      let extra = [];
      let est = count(table);
      const idxName = (/INDEX (\S+)/.exec(using) || [])[1];
      const keyName = !idxName ? null : /^sqlite_autoindex_/.test(idxName) ? 'PRIMARY' : idxName.includes('.') ? idxName.slice(idxName.indexOf('.') + 1) : idxName;
      const unique = keyName === 'PRIMARY' || /INTEGER PRIMARY KEY/.test(using) || (meta && meta.uniques.some((u) => u.name === keyName));
      if (m[1] === 'SEARCH') {
        key = /INTEGER PRIMARY KEY/.test(using) ? 'PRIMARY' : /AUTOMATIC/.test(using) ? null : keyName;
        const eq = /\(([^)]*)\)/.exec(using)?.[1] || '';
        const range = /[<>]/.test(eq);
        if (!key) { type = 'ALL'; extra.push('Using where; Using join buffer (hash join)'); } else if (range) { type = 'range'; extra.push('Using where'); est = Math.max(1, Math.round((est || 0) / 3)); } else if (unique) { type = rows.length ? 'eq_ref' : 'const'; est = 1; } else { type = 'ref'; est = Math.max(1, Math.round((est || 0) / 10)); }
        if (/COVERING/.test(using) && key) extra.push('Using index');
      } else {
        if (/COVERING INDEX/.test(using)) { type = 'index'; key = keyName; extra.push('Using index'); }
        if (hasWhere) extra.unshift('Using where');
      }
      const possible = meta ? [meta.pk.length ? 'PRIMARY' : null, ...meta.uniques.map((u) => u.name), ...meta.indexes.map((u) => u.name)].filter(Boolean) : [];
      rows.push([selId.get(id) ?? sid, selType.get(selId.get(id) ?? sid) || 'SIMPLE', a, null, type, key ? possible.filter((x) => x === key).join(',') || key : null, key, key ? '4' : null, type === 'const' ? 'const' : null, est ?? 1, '100.00', extra.join('; ') || null]);
    }
    if (rows.some((r) => r[0] > 1)) for (const r of rows) if (r[0] === 1 && r[1] === 'SIMPLE') r[1] = 'PRIMARY';
    if (filesort && rows.length) rows[0][11] = [rows[0][11], 'Using temporary; Using filesort'].filter(Boolean).join('; ');
    if (!rows.length) rows.push([1, kind === 'SELECT' ? 'SIMPLE' : kind, target ? lc(target) : null, null, kind === 'SELECT' ? null : 'ALL', null, null, null, null, kind === 'SELECT' ? null : null, kind === 'SELECT' ? null : '100.00', kind === 'SELECT' ? 'No tables used' : null]);
    const names = ['id', 'select_type', 'table', 'partitions', 'type', 'possible_keys', 'key', 'key_len', 'ref', 'rows', 'filtered', 'Extra'];
    return { columns: names.map((n) => ({ name: n, type: n === 'id' || n === 'rows' ? 'bigint' : n === 'filtered' ? 'varchar' : 'varchar' })), rows, affected: 0, db: ctx?.name ?? null };
  }

  hasTopLevel(sigToks, word) {
    let depth = 0;
    for (const t of sigToks) {
      if (t.t === 'op' && t.v === '(') depth++;
      else if (t.t === 'op' && t.v === ')') depth--;
      else if (depth === 0 && t.t === 'id' && t.u === word) return true;
    }
    return false;
  }

  /**
   * MySQL çok tablolu UPDATE / DELETE komutlarını SQLite'ın anlayacağı biçime çevirir.
   * UPDATE a JOIN b ON k SET a.x = b.y WHERE w  →  UPDATE a SET x = b.y FROM b WHERE (k) AND (w)
   * DELETE a FROM a JOIN b ON k WHERE w         →  DELETE FROM a WHERE rowid IN (SELECT a.rowid FROM a JOIN b ON k WHERE w)
   * Döner: yeni MySQL metni ya da null (tek tablolu komut).
   */
  rewriteMultiTable(T, src, kind) {
    const text = (a, b) => (b > a ? src.slice(T[a].s, T[b - 1].e) : '');
    const isW = (t, ...w) => t && t.t === 'id' && w.includes(t.u);
    const isOp = (t, v) => t && t.t === 'op' && t.v === v;
    const topIdx = (from, pred) => {
      let d = 0;
      for (let i = from; i < T.length; i++) {
        if (isOp(T[i], '(')) d++;
        else if (isOp(T[i], ')')) d--;
        else if (d === 0 && pred(T[i], i)) return i;
      }
      return -1;
    };
    const unsupported = (m) => err(1235, `Simülatör: ${m}`);
    /** tablo başvurusu: ad [. ad] [[AS] takma] → { end, name, alias, nameText } */
    const tableRef = (i) => {
      const a = i;
      if (isOp(T[i], '(')) throw unsupported('alt sorgulu çok tablolu güncelleme desteklenmiyor.');
      let name = T[i].t === 'qid' ? T[i].val : T[i].v;
      i++;
      if (isOp(T[i], '.')) { name = T[i + 1].t === 'qid' ? T[i + 1].val : T[i + 1].v; i += 2; }
      const nameEnd = i;
      let alias = name;
      if (isW(T[i], 'AS')) { alias = T[i + 1].t === 'qid' ? T[i + 1].val : T[i + 1].v; i += 2; } else if (T[i] && (T[i].t === 'id' || T[i].t === 'qid') && !isW(T[i], 'JOIN', 'INNER', 'LEFT', 'RIGHT', 'CROSS', 'STRAIGHT_JOIN', 'ON', 'USING', 'SET', 'WHERE', 'NATURAL', 'ORDER', 'LIMIT')) { alias = T[i].t === 'qid' ? T[i].val : T[i].v; i++; }
      return { end: i, name: lc(name), alias: lc(alias), nameText: text(a, nameEnd), text: text(a, i) };
    };
    /** FROM bölümü: ilk tablo + birleşimler → { first, joins: [{ kind, ref, on }] , refsText } */
    const refs = (a, b) => {
      const first = tableRef(a);
      const all = [first];
      const joins = [];
      let i = first.end;
      while (i < b) {
        if (isOp(T[i], ',')) { const r = tableRef(i + 1); all.push(r); joins.push({ kind: ',', ref: r, on: null, a: i, b: r.end }); i = r.end; continue; }
        const ja = i;
        let jk = 'INNER';
        if (isW(T[i], 'LEFT', 'RIGHT')) { jk = T[i].u; i++; if (isW(T[i], 'OUTER')) i++; } else if (isW(T[i], 'INNER', 'CROSS')) i++;
        else if (isW(T[i], 'NATURAL')) throw unsupported('NATURAL JOIN içeren çok tablolu komut desteklenmiyor.');
        if (!isW(T[i], 'JOIN', 'STRAIGHT_JOIN')) throw syntaxError(src, { s: T[0].s, e: T[T.length - 1].e }, T[i]);
        const r = tableRef(i + 1);
        all.push(r);
        i = r.end;
        let on = null;
        if (isW(T[i], 'ON')) {
          const ca = i + 1;
          let d = 0;
          let k = ca;
          for (; k < b; k++) {
            if (isOp(T[k], '(')) d++;
            else if (isOp(T[k], ')')) d--;
            else if (d === 0 && (isW(T[k], 'JOIN', 'INNER', 'LEFT', 'RIGHT', 'CROSS', 'STRAIGHT_JOIN', 'NATURAL') || isOp(T[k], ','))) break;
          }
          on = { a: ca, b: k };
          i = k;
        } else if (isW(T[i], 'USING')) throw unsupported('USING (...) ile birleşen çok tablolu komut desteklenmiyor; ON kullanın.');
        joins.push({ kind: jk, ref: r, on, a: ja, b: i });
      }
      return { first, joins, all };
    };
    if (kind === 'UPDATE') {
      let i = 1;
      while (isW(T[i], 'LOW_PRIORITY', 'IGNORE')) i++;
      const setIdx = topIdx(i, (t) => isW(t, 'SET'));
      if (setIdx < 0) return null;
      if (topIdx(i, (t, k) => k < setIdx && (isW(t, 'JOIN', 'STRAIGHT_JOIN') || isOp(t, ','))) < 0) return null;
      const R = refs(i, setIdx);
      if (R.joins.some((j) => j.kind === 'LEFT' || j.kind === 'RIGHT')) throw unsupported('LEFT/RIGHT JOIN içeren UPDATE desteklenmiyor; INNER JOIN kullanın.');
      const whereIdx = topIdx(setIdx, (t) => isW(t, 'WHERE', 'ORDER', 'LIMIT'));
      const setEnd = whereIdx < 0 ? T.length : whereIdx;
      // atamalar: sol taraftaki niteleyici yalnızca ilk tablo olabilir
      const assigns = [];
      let k = setIdx + 1;
      while (k < setEnd) {
        let d = 0;
        let e = k;
        for (; e < setEnd; e++) { if (isOp(T[e], '(')) d++; else if (isOp(T[e], ')')) d--; else if (d === 0 && isOp(T[e], ',')) break; }
        let c = k;
        if (isOp(T[k + 1], '.')) {
          const q = lc(T[k].t === 'qid' ? T[k].val : T[k].v);
          if (q !== R.first.alias && q !== R.first.name) throw unsupported('çok tablolu UPDATE\'te yalnızca ilk tablonun sütunları güncellenebilir.');
          c = k + 2;
        }
        assigns.push(text(c, e));
        k = e + 1;
      }
      const conds = R.joins.filter((j) => j.on).map((j) => `(${text(j.on.a, j.on.b)})`);
      // FROM: ilk birleşenden sonrakiler; ilk birleşimin ON koşulu WHERE'e taşınır
      const rest = R.joins.map((j, n) => (n === 0 ? j.ref.text : j.kind === ',' ? ', ' + j.ref.text : `JOIN ${j.ref.text}${j.on ? ` ON ${text(j.on.a, j.on.b)}` : ''}`));
      const firstOn = R.joins[0].on ? [`(${text(R.joins[0].on.a, R.joins[0].on.b)})`] : [];
      void conds;
      const where = whereIdx >= 0 && isW(T[whereIdx], 'WHERE') ? [`(${text(whereIdx + 1, topIdx(whereIdx + 1, (t) => isW(t, 'ORDER', 'LIMIT')) < 0 ? T.length : topIdx(whereIdx + 1, (t) => isW(t, 'ORDER', 'LIMIT')))})`] : [];
      const w = [...firstOn, ...where];
      const firstRef = R.first.alias !== R.first.name ? `${R.first.nameText} AS ${bq(R.first.alias)}` : R.first.nameText;
      return `UPDATE ${firstRef} SET ${assigns.join(', ')} FROM ${rest.join(' ')}${w.length ? ' WHERE ' + w.join(' AND ') : ''}`;
    }
    // DELETE
    let i = 1;
    while (isW(T[i], 'LOW_PRIORITY', 'QUICK', 'IGNORE')) i++;
    let targets;
    let fromA;
    let fromB;
    if (isW(T[i], 'FROM')) {
      const usingIdx = topIdx(i, (t) => isW(t, 'USING'));
      if (usingIdx < 0) return null;
      targets = [];
      for (let k = i + 1; k < usingIdx; k++) if (T[k].t === 'id' || T[k].t === 'qid') { if (!isOp(T[k + 1], '.') || isOp(T[k + 2], '*')) targets.push(lc(T[k].t === 'qid' ? T[k].val : T[k].v)); }
      fromA = usingIdx + 1;
    } else {
      const fromIdx = topIdx(i, (t) => isW(t, 'FROM'));
      if (fromIdx < 0) return null;
      targets = [];
      for (let k = i; k < fromIdx; k++) if ((T[k].t === 'id' || T[k].t === 'qid') && !(isOp(T[k - 1], '.'))) targets.push(lc(T[k].t === 'qid' ? T[k].val : T[k].v));
      fromA = fromIdx + 1;
    }
    const whereIdx = topIdx(fromA, (t) => isW(t, 'WHERE', 'ORDER', 'LIMIT'));
    fromB = whereIdx < 0 ? T.length : whereIdx;
    if (targets.length !== 1) throw unsupported('tek komutta birden fazla tablodan silme desteklenmiyor; her tablo için ayrı DELETE yazın.');
    const R = refs(fromA, fromB);
    const tgt = R.all.find((r) => r.alias === targets[0]) || R.all.find((r) => r.name === targets[0]);
    if (!tgt) throw err(1109, `Unknown table '${targets[0]}' in MULTI DELETE`);
    const where = whereIdx >= 0 && isW(T[whereIdx], 'WHERE') ? ' ' + text(whereIdx, T.length) : '';
    return `DELETE FROM ${tgt.nameText} WHERE rowid IN (SELECT ${bq(tgt.alias)}.rowid FROM ${text(fromA, fromB)}${where})`;
  }

  dmlTarget(T, kind) { return this.dmlTargetQ(T, kind)?.name ?? null; }

  /** DML hedef tablosu: { db, name } */
  dmlTargetQ(T, kind) {
    const nm = (t) => (t.t === 'qid' ? t.val : t.t === 'id' ? t.v : null);
    const nameAt = (i) => {
      const t = T[i];
      if (!t) return null;
      if (T[i + 1] && T[i + 1].v === '.' && T[i + 2] && (T[i + 2].t === 'id' || T[i + 2].t === 'qid')) return { db: nm(t), name: nm(T[i + 2]) };
      const n = nm(t);
      return n == null ? null : { db: null, name: n };
    };
    if (kind === 'INSERT' || kind === 'REPLACE') {
      let i = 1;
      while (T[i] && T[i].t === 'id' && /^(IGNORE|LOW_PRIORITY|DELAYED|HIGH_PRIORITY)$/.test(T[i].u)) i++;
      if (T[i] && T[i].t === 'id' && T[i].u === 'INTO') i++;
      return nameAt(i);
    }
    if (kind === 'UPDATE') {
      let i = 1;
      while (T[i] && T[i].t === 'id' && /^(IGNORE|LOW_PRIORITY)$/.test(T[i].u)) i++;
      return nameAt(i);
    }
    if (kind === 'DELETE') {
      const i = T.findIndex((t) => t.t === 'id' && t.u === 'FROM');
      return i < 0 ? null : nameAt(i + 1);
    }
    return null;
  }

  countTuples(T) {
    const i = T.findIndex((t) => t.t === 'id' && (t.u === 'VALUES' || t.u === 'VALUE'));
    if (i < 0) return 1;
    let n = 0;
    let depth = 0;
    for (let k = i + 1; k < T.length; k++) {
      const t = T[k];
      if (t.t === 'op' && t.v === '(') { if (depth === 0) n++; depth++; } else if (t.t === 'op' && t.v === ')') depth--;
      else if (depth === 0 && t.t === 'id') break;
    }
    return n;
  }

  /** INSERT INTO t SET a=1, b='x' → INSERT INTO t (a, b) VALUES (1, 'x') */
  rewriteInsertSet(T, src, ctx, sqlText, execCtx = ctx) {
    const o = { execDb: execCtx?.name };
    const setIdx = T.findIndex((t, i) => i > 1 && t.t === 'id' && t.u === 'SET');
    if (setIdx < 0 || T.some((t) => t.t === 'id' && (t.u === 'VALUES' || t.u === 'SELECT'))) return sqlText;
    const cols = [];
    const vals = [];
    let k = setIdx + 1;
    while (k < T.length) {
      const c = T[k];
      if (!(c && (c.t === 'id' || c.t === 'qid')) || !T[k + 1] || T[k + 1].v !== '=') throw syntaxError(src, { s: T[0].s, e: T[T.length - 1].e }, c);
      cols.push(c.t === 'qid' ? c.val : c.v);
      let m = k + 2;
      let depth = 0;
      const start = m;
      while (m < T.length) {
        const x = T[m];
        if (x.v === '(') depth++;
        else if (x.v === ')') depth--;
        else if (depth === 0 && x.v === ',') break;
        else if (depth === 0 && x.t === 'id' && x.u === 'ON') break;
        m++;
      }
      vals.push(this.translate(T.slice(start, m).flatMap((x, i) => (i ? [{ t: 'ws', v: ' ' }, x] : [x])), src, ctx, o).text);
      k = m;
      if (T[k] && T[k].v === ',') { k++; continue; }
      break;
    }
    const head = this.translate(T.slice(0, setIdx).flatMap((x, i) => (i ? [{ t: 'ws', v: ' ' }, x] : [x])), src, ctx, o).text;
    return `${head} (${cols.map(dq).join(', ')}) VALUES (${vals.join(', ')})`;
  }

  rewriteLimit(sqlText, kind, target) {
    // UPDATE t SET ... WHERE x LIMIT n → rowid ile sınırlama
    const m = /^([\s\S]*?)\s+((?:ORDER\s+BY[\s\S]*?)?\s*LIMIT\s+[\s\S]+)$/i.exec(sqlText);
    if (!m) return sqlText;
    const body = m[1];
    const tail = m[2];
    const w = /\bWHERE\b([\s\S]*)$/i.exec(body);
    const where = w ? w[1] : '1';
    const head = w ? body.slice(0, w.index) : body;
    return `${head} WHERE rowid IN (SELECT rowid FROM ${dq(lc(target))} WHERE ${where} ${tail})`;
  }

  checkSafeUpdate(T, ctx, target, kind) {
    const meta = ctx.meta.tables[lc(target)];
    if (!meta) return;
    const wi = T.findIndex((t) => t.t === 'id' && t.u === 'WHERE');
    const hasLimit = T.some((t) => t.t === 'id' && t.u === 'LIMIT');
    const keyCols = new Set([...meta.pk, ...meta.uniques.flatMap((u) => u.cols), ...meta.indexes.flatMap((u) => u.cols), ...meta.fks.flatMap((f) => f.cols)].map(lc));
    let ok = hasLimit;
    if (wi >= 0) {
      for (let i = wi + 1; i < T.length; i++) {
        const t = T[i];
        if ((t.t === 'id' || t.t === 'qid') && keyCols.has(lc(t.t === 'qid' ? t.val : t.v))) ok = true;
      }
    }
    if (!ok) {
      throw err(1175, `You are using safe update mode and you tried to ${kind === 'DELETE' ? 'update' : 'update'} a table without a WHERE that uses a KEY column.  To disable safe mode, toggle the option in Preferences -> SQL Editor and reconnect.`);
    }
  }

  describeColumns(names, rows, ctx, usedNames, T) {
    if (ctx) {
      // görünümlerin kullandığı tablolar da sütun kaynağı sayılır
      usedNames = new Set(usedNames);
      for (const v of Object.values(ctx.meta.views)) {
        if (!usedNames.has(v.name)) continue;
        for (const t of tokenize(v.select)) if (t.t === 'id' || t.t === 'qid') usedNames.add(lc(t.t === 'qid' ? t.val : t.v));
      }
    }
    const tables = ctx ? Object.values(ctx.meta.tables).filter((m) => usedNames.has(m.name)) : [];
    return names.map((name, i) => {
      let col = null;
      let table = null;
      for (const m of tables) {
        const c = m.columns.find((x) => lc(x.name) === lc(name));
        if (c) { col = c; table = m.name; break; }
      }
      if (col) {
        return { name, type: col.type, len: col.len, scale: col.scale, unsigned: col.unsigned, zerofill: col.zerofill, table, column: col.name, pk: (ctx.meta.tables[table].pk || []).some((x) => lc(x) === lc(col.name)), notNull: !!col.notNull, autoInc: !!col.autoInc, values: col.values };
      }
      let type = 'varchar';
      for (const r of rows) {
        const v = r[i];
        if (v == null) continue;
        type = typeof v === 'number' ? (Number.isInteger(v) ? 'bigint' : 'double') : v instanceof Uint8Array ? 'blob' : 'varchar';
        break;
      }
      return { name, type, table: null, column: null };
    });
  }

  /** Workbench sonuç tablosunun düzenlenebilirliği: tek tablo, birincil anahtar sonuçta */
  editableInfo(T, ctx, columns) {
    if (!ctx) return null;
    const up = T.map((t) => (t.t === 'id' ? t.u : t.v));
    if (up[0] !== 'SELECT') return null;
    if (up.some((u) => ['JOIN', 'GROUP', 'UNION', 'DISTINCT', 'HAVING', 'COUNT', 'SUM', 'AVG', 'MIN', 'MAX'].includes(u))) return null;
    if (up.filter((u) => u === 'SELECT').length > 1) return null;
    const fi = up.indexOf('FROM');
    if (fi < 0) return null;
    let k = fi + 1;
    let t = T[k];
    if (T[k + 1] && T[k + 1].v === '.') t = T[k + 2];
    if (!t) return null;
    const name = lc(t.t === 'qid' ? t.val : t.v);
    const meta = ctx.meta.tables[name];
    if (!meta || !meta.pk.length) return null;
    const after = T[(T[k + 1] && T[k + 1].v === '.') ? k + 3 : k + 1];
    if (after && after.v === ',') return null;
    const pkIdx = meta.pk.map((p) => columns.findIndex((c) => c.table === name && lc(c.column) === lc(p) && lc(c.name) === lc(p)));
    if (pkIdx.some((i) => i < 0)) return null;
    return { db: ctx.name, table: name, pk: meta.pk, pkIndex: pkIdx };
  }

  // ------------------------------------------------------------ hata eşleme

  mapError(e, c) {
    if (e instanceof MySqlError) return e;
    const msg = String(e.message || e);
    const um = /m!err!(\d+)!([0-9A-Z]{5})!([\s\S]*)$/.exec(msg);
    if (um) return new MySqlError(Number(um[1]), um[3], um[2]);
    const db = c.ctx?.name;
    let m;
      const tbl = (n) => (n.includes('.') ? lc(n).replace(/"/g, '') : `${db ?? ''}.${lc(n)}`);
    if ((m = /^no such table: (?:main\.)?(.+)$/.exec(msg))) {
      if (!db) return err(1046, 'No database selected');
      return err(1146, `Table '${tbl(m[1])}' doesn't exist`);
    }
    if ((m = /^no such column: (.+)$/.exec(msg)) || (m = /^table \S+ has no column named (.+)$/.exec(msg))) {
      return err(1054, `Unknown column '${m[1]}' in '${c.kind === 'SELECT' ? 'field list' : c.kind === 'INSERT' ? 'field list' : 'where clause'}'`);
    }
    if ((m = /^near "(.*)": syntax error$/s.exec(msg))) {
      const near = m[1];
      const T = c.toks || [];
      const tok = T.find((t) => t.v === near || (t.t === 'qid' && t.val === near.replace(/^"|"$/g, '')) || (t.t === 'str' && near.startsWith("'") && t.val === near.slice(1, -1)));
      const s = T.length ? T[0].s : 0;
      const e2 = T.length ? T[T.length - 1].e : 0;
      return syntaxError(c.src || '', { s, e: e2 }, tok || null);
    }
    if (/^incomplete input/.test(msg) || /unrecognized token/.test(msg)) {
      const T = c.toks || [];
      return syntaxError(c.src || '', { s: T[0]?.s ?? 0, e: T[T.length - 1]?.e ?? 0 }, null);
    }
    if ((m = /^UNIQUE constraint failed: (.+)$/.exec(msg))) return this.duplicateError(m[1], c);
    if ((m = /^NOT NULL constraint failed: [^.]+\.(.+)$/.exec(msg))) {
      const col = m[1];
      if (c.kind === 'ALTER') return err(1138, 'Invalid use of NULL value');
      if (c.kind === 'INSERT' && this.insertColumns(c) && !this.insertColumns(c).includes(lc(col))) return err(1364, `Field '${col}' doesn't have a default value`);
      return err(1048, `Column '${col}' cannot be null`);
    }
    if ((m = /^CHECK constraint failed: (.+)$/.exec(msg))) return this.checkError(m[1], c);
    if (/FOREIGN KEY constraint failed/.test(msg)) return this.fkError(c);
    if ((m = /^cannot store (\w+) value in (\w+) column [^.]+\.(.+)$/.exec(msg))) {
      const kind = m[2] === 'INTEGER' || m[2] === 'INT' ? 'integer' : m[2] === 'REAL' ? 'decimal' : 'string';
      return err(1366, `Incorrect ${kind} value: '${this.guessValue(c, m[3]) ?? ''}' for column '${m[3]}' at row ${this.guessRow(c, m[3])}`);
    }
    if (/^table \S+ has \d+ columns but \d+ values were supplied/.test(msg) || /^\d+ values for \d+ columns/.test(msg) || /all VALUES must have the same number of terms/.test(msg)) {
      return err(1136, 'Column count doesn\'t match value count at row 1');
    }
    if ((m = /^ambiguous column name: (.+)$/.exec(msg))) return err(1052, `Column '${m[1]}' in field list is ambiguous`);
    if (/^misuse of aggregate/.test(msg)) return err(1111, 'Invalid use of group function');
    if ((m = /^no such function: (.+)$/.exec(msg))) return err(1305, `FUNCTION ${db ?? ''}${db ? '.' : ''}${m[1]} does not exist`);
    if ((m = /^wrong number of arguments to function (\w+)/.exec(msg)) && c.ctx?.meta.functions?.[lc(m[1])]) {
      const f = c.ctx.meta.functions[lc(m[1])];
      return err(1318, `Incorrect number of arguments for FUNCTION ${db}.${f.name}; expected ${f.params.length}, got ${argCount(c.toks || [], m[1], f.params.length)}`);
    }
    if ((m = /^wrong number of arguments to function (\w+)/.exec(msg))) return err(1582, `Incorrect parameter count in the call to native function '${m[1].replace(/^m_/, '').toUpperCase()}'`);
    if (/ORDER BY term does not match/.test(msg)) return err(1054, 'Unknown column in \'order clause\'');
    if (/sub-select returns \d+ columns/.test(msg) || /row value misused/.test(msg)) return err(1241, 'Operand should contain 1 column(s)');
    if (/datatype mismatch/.test(msg)) return err(1366, 'Incorrect value for column');
    if (/cannot start a transaction within a transaction|cannot commit/.test(msg)) return err(1105, msg);
    return err(1105, msg);
  }

  insertColumns(c) {
    if (c.kind !== 'INSERT' && c.kind !== 'REPLACE') return null;
    const T = c.toks;
    const ti = T.findIndex((t) => t.t === 'id' && t.u === 'INTO');
    let i = ti < 0 ? 1 : ti + 1;
    if (T[i + 1] && T[i + 1].v === '.') i += 2;
    i++;
    if (!T[i] || T[i].v !== '(') {
      if (T[i] && T[i].t === 'id' && T[i].u === 'SET') {
        const cols = [];
        let depth = 0;
        for (let k = i + 1; k < T.length; k++) {
          const t = T[k];
          if (t.v === '(') depth++;
          else if (t.v === ')') depth--;
          else if (depth === 0 && (t.t === 'id' || t.t === 'qid') && T[k + 1]?.v === '=' && (T[k - 1].v === ',' || k === i + 1)) cols.push(lc(t.t === 'qid' ? t.val : t.v));
        }
        return cols;
      }
      return null;
    }
    const cols = [];
    for (let k = i + 1; k < T.length && T[k].v !== ')'; k++) if (T[k].t === 'id' || T[k].t === 'qid') cols.push(lc(T[k].t === 'qid' ? T[k].val : T[k].v));
    return cols;
  }

  /** INSERT ... VALUES içindeki sabit değerler: satırlar → { sütun: değer } */
  insertTuples(c) {
    const meta = c.ctx?.meta.tables[lc(c.target || '')];
    if (!meta || (c.kind !== 'INSERT' && c.kind !== 'REPLACE')) return null;
    const cols = this.insertColumns(c) || meta.columns.map((x) => lc(x.name));
    const T = c.toks;
    const vi = T.findIndex((t) => t.t === 'id' && (t.u === 'VALUES' || t.u === 'VALUE'));
    if (vi < 0) {
      // INSERT ... SET
      const si = T.findIndex((t, i) => i > 1 && t.t === 'id' && t.u === 'SET');
      if (si < 0) return null;
      const row = {};
      for (let k = si + 1; k < T.length; k++) {
        if ((T[k].t === 'id' || T[k].t === 'qid') && T[k + 1]?.v === '=') row[lc(T[k].t === 'qid' ? T[k].val : T[k].v)] = litValue(T[k + 2], T[k + 3]);
      }
      return [row];
    }
    const rows = [];
    let k = vi + 1;
    while (k < T.length) {
      if (T[k].v !== '(') break;
      const row = {};
      let ci = 0;
      let depth = 0;
      let start = k + 1;
      for (k = k + 1; k < T.length; k++) {
        const t = T[k];
        if (t.v === '(') depth++;
        else if (t.v === ')' && depth > 0) depth--;
        else if (depth === 0 && (t.v === ',' || t.v === ')')) {
          const part = T.slice(start, k);
          row[cols[ci++]] = part.length === 1 ? litValue(part[0]) : part.length === 2 && part[0].v === '-' ? -litValue(part[1]) : undefined;
          start = k + 1;
          if (t.v === ')') { k++; break; }
        }
      }
      rows.push(row);
      if (T[k] && T[k].v === ',') k++;
    }
    return rows;
  }

  guessValue(c, col) {
    if (c.kind === 'UPDATE') {
      const T = c.toks;
      for (let k = 0; k < T.length - 2; k++) if ((T[k].t === 'id' || T[k].t === 'qid') && lc(T[k].t === 'qid' ? T[k].val : T[k].v) === lc(col) && T[k + 1].v === '=') return litValue(T[k + 2]);
      return undefined;
    }
    const rows = this.insertTuples(c);
    if (!rows) return undefined;
    const r = rows[this.guessRow(c, col) - 1];
    return r ? r[lc(col)] : undefined;
  }

  guessRow(c, col, pred) {
    const rows = this.insertTuples(c);
    if (!rows) return 1;
    const meta = c.ctx.meta.tables[lc(c.target)];
    const def = meta?.columns.find((x) => lc(x.name) === lc(col));
    const test = pred || ((v) => {
      if (v === undefined || v === null) return false;
      if (!def) return false;
      if (isIntType(def.type)) return !(typeof v === 'number' && Number.isInteger(v)) && !/^-?\d+$/.test(String(v));
      if (def.type === 'decimal' || def.type === 'float' || def.type === 'double') return typeof v !== 'number' && !/^-?\d*\.?\d+(e[+-]?\d+)?$/i.test(String(v).trim());
      return false;
    });
    const i = rows.findIndex((r) => test(r[lc(col)]));
    return i < 0 ? 1 : i + 1;
  }

  duplicateError(cols, c) {
    const list = cols.split(', ').map((x) => x.split('.'));
    const table = lc(list[0][0]);
    const names = list.map((x) => lc(x[1]));
    const meta = c.ctx?.meta.tables[table];
    let key = 'PRIMARY';
    if (meta) {
      const same = (a) => a.length === names.length && a.every((x, i) => lc(x) === names[i]);
      const inPk = names.every((n) => meta.pk.some((p) => lc(p) === n));
      if (!same(meta.pk) && !inPk) key = (meta.uniques.find((u) => same(u.cols)) || { name: names.join('_') }).name;
    }
    let value = '?';
    const rows = this.insertTuples(c);
    if (rows && meta) {
      const seen = new Set();
      for (const r of rows) {
        const v = names.map((n) => r[n]);
        if (v.some((x) => x === undefined)) continue;
        const keyStr = v.map((x) => fold(String(x))).join('-');
        let exists = seen.has(keyStr);
        if (!exists) {
          try {
            const q = c.ctx.sql.exec(`SELECT 1 FROM ${dq(table)} WHERE ${names.map((n) => `${dq(n)} = ?`).join(' AND ')} LIMIT 1`, v);
            exists = q.length > 0;
          } catch { /* yok */ }
        }
        if (exists) { value = v.join('-'); break; }
        seen.add(keyStr);
      }
    } else if (c.kind === 'UPDATE') {
      const v = names.map((n) => this.guessValue(c, n));
      if (v.every((x) => x !== undefined)) value = v.join('-');
    }
    return err(1062, `Duplicate entry '${value}' for key '${table}.${key}'`);
  }

  checkError(name, c) {
    const m = /^m!(\w+)!(.+)$/.exec(name);
    if (!m) {
      const n = /^m!chk!(.+)$/.exec(name);
      return err(3819, `Check constraint '${n ? n[1] : name}' is violated.`);
    }
    const [, kind, col] = m;
    if (kind === 'chk') return err(3819, `Check constraint '${col}' is violated.`);
    const meta = c.ctx?.meta.tables[lc(c.target || '')];
    const def = meta?.columns.find((x) => lc(x.name) === lc(col));
    const rowOf = (pred) => (c.kind === 'ALTER' ? 1 : this.guessRow(c, col, pred));
    switch (kind) {
      case 'len': return err(1406, `Data too long for column '${col}' at row ${rowOf((v) => v != null && [...String(v)].length > (def?.len ?? 0))}`);
      case 'rng': return err(1264, `Out of range value for column '${col}' at row ${rowOf((v) => typeof v === 'number' && outOfRange(def, v))}`);
      case 'enum': return err(1265, `Data truncated for column '${col}' at row ${rowOf((v) => v != null && def && !def.values.some((x) => fold(x) === fold(String(v))))}`);
      case 'date':
      case 'datetime':
      case 'time': {
        const r = rowOf((v) => v != null && !isValidTemporal(def?.type, v));
        const v = c.kind === 'ALTER' ? '' : this.guessValue(c, col) ?? '';
        return err(1292, `Incorrect ${kind === 'time' ? 'time' : kind === 'date' ? 'date' : 'datetime'} value: '${v}' for column '${col}' at row ${r}`);
      }
      default: return err(3819, `Check constraint '${col}' is violated.`);
    }
  }

  fkError(c) {
    const ctx = c.ctx;
    const target = lc(c.target || '');
    const meta = ctx?.meta.tables[target];
    const fkText = (child, fk) => `(\`${ctx.name}\`.\`${child}\`, CONSTRAINT \`${fk.name}\` FOREIGN KEY (${fk.cols.map(bq).join(', ')}) REFERENCES \`${fk.refTable}\` (${fk.refCols.map(bq).join(', ')})${fk.onDelete && !['NO ACTION', 'RESTRICT'].includes(fk.onDelete) ? ' ON DELETE ' + fk.onDelete : ''}${fk.onUpdate && !['NO ACTION', 'RESTRICT'].includes(fk.onUpdate) ? ' ON UPDATE ' + fk.onUpdate : ''})`;
    if (c.kind === 'DELETE' || (c.kind === 'UPDATE' && !this.updatesChildCols(c, meta))) {
      for (const m of Object.values(ctx.meta.tables)) {
        const fk = m.fks.find((f) => lc(f.refTable) === target);
        if (fk) return err(1451, `Cannot delete or update a parent row: a foreign key constraint fails ${fkText(m.name, fk)}`);
      }
    }
    const fk = meta?.fks[0];
    if (fk) {
      // değeri sağlanmayan ilk yabancı anahtar
      const rows = this.insertTuples(c);
      let chosen = fk;
      if (rows) {
        for (const f of meta.fks) {
          const bad = rows.some((r) => {
            const v = f.cols.map((x) => r[lc(x)]);
            if (v.some((x) => x == null)) return false;
            try { return ctx.sql.exec(`SELECT 1 FROM ${dq(lc(f.refTable))} WHERE ${f.refCols.map((x) => `${dq(x)} = ?`).join(' AND ')}`, v).length === 0; } catch { return false; }
          });
          if (bad) { chosen = f; break; }
        }
      }
      return err(1452, `Cannot add or update a child row: a foreign key constraint fails ${fkText(meta.name, chosen)}`);
    }
    return err(1452, 'Cannot add or update a child row: a foreign key constraint fails');
  }

  updatesChildCols(c, meta) {
    if (!meta || !meta.fks.length) return false;
    const fkCols = new Set(meta.fks.flatMap((f) => f.cols).map(lc));
    const T = c.toks;
    const si = T.findIndex((t) => t.t === 'id' && t.u === 'SET');
    for (let k = si + 1; k < T.length; k++) {
      if (T[k].t === 'id' && T[k].u === 'WHERE') break;
      if ((T[k].t === 'id' || T[k].t === 'qid') && T[k + 1]?.v === '=' && fkCols.has(lc(T[k].t === 'qid' ? T[k].val : T[k].v))) return true;
    }
    return false;
  }

  // ------------------------------------------------------------ CREATE

  create(p, src, st) {
    p.expect('CREATE');
    if (p.is('DEFINER') || p.is('ALGORITHM') || p.is('SQL')) {
      // CREATE [ALGORITHM=..] [DEFINER=..] [SQL SECURITY ..] VIEW|PROCEDURE|FUNCTION|TRIGGER|EVENT
      while (!p.done() && !['VIEW', 'PROCEDURE', 'FUNCTION', 'TRIGGER', 'EVENT'].includes(p.cur.u)) p.i++;
      if (p.eat('VIEW')) return this.createView(p, false);
    }
    if (p.eat('DATABASE') || p.eat('SCHEMA')) {
      const ifNot = p.eat('IF', 'NOT', 'EXISTS');
      const name = p.name();
      const opts = this.dbOptions(p);
      p.end();
      if (!/^[\p{L}\p{N}_$]{1,64}$/u.test(name)) throw err(1102, `Incorrect database name '${name}'`);
      if (this.server.hasDb(name) || SYSTEM_DBS.includes(lc(name))) {
        if (ifNot) return { affected: 1, warnings: 1 };
        throw err(1007, `Can't create database '${lc(name)}'; database exists`);
      }
      this.requirePriv(name, 'CREATE');
      const ctx = this.server.createDatabase(name, opts);
      this.changed(ctx, true);
      return { affected: 1, schema: true, db: ctx.name };
    }
    let unique = false;
    if (p.eat('UNIQUE')) unique = true;
    else p.eat('FULLTEXT') || p.eat('SPATIAL');
    if (p.eat('INDEX') || p.eat('KEY')) {
      const name = p.name();
      p.expect('ON');
      const q = p.qname();
      const cols = p.nameList();
      while (!p.done()) p.i++;
      const ctx = this.ctx(q.db || this.db);
      return this.alterTableSpecs(ctx, q.name, [{ op: 'addIndex', unique, name, cols }]);
    }
    if (unique) throw p.syntax();
    if (p.eat('TEMPORARY')) { p.expect('TABLE'); return this.createTable(p, true); }
    if (p.eat('TABLE')) return this.createTable(p);
    if (p.eat('USER')) return this.createUser(p);
    if (p.eat('OR', 'REPLACE')) {
      while (p.eat('ALGORITHM') || p.eat('DEFINER') || p.eat('SQL')) { /* atla */ }
      if (p.eat('VIEW')) return this.createView(p, true);
      throw p.syntax();
    }
    if (p.eat('VIEW')) return this.createView(p, false);
    if (p.is('PROCEDURE') || p.is('FUNCTION') || p.is('TRIGGER') || p.is('EVENT')) return this.createRoutine(p, src, st);
    throw p.syntax();
  }

  dbOptions(p) {
    const o = {};
    for (;;) {
      p.eat('DEFAULT');
      if (p.eat('CHARACTER', 'SET') || p.eat('CHARSET')) { p.eat('='); o.charset = lc(p.name(true)); continue; }
      if (p.eat('COLLATE')) { p.eat('='); o.collation = lc(p.name(true)); continue; }
      if (p.eat('ENCRYPTION')) { p.eat('='); p.i++; continue; }
      break;
    }
    return o;
  }

  createTable(p, temporary = false) {
    const ifNot = p.eat('IF', 'NOT', 'EXISTS');
    const q = p.qname();
    const ctx = this.ctx(q.db || this.db);
    const tname = lc(q.name);
    if (tname.length > 64) throw err(1059, `Identifier name '${q.name}' is too long`);
    if (ctx.meta.tables[tname] || ctx.meta.views[tname]) {
      if (ifNot) return { affected: 0, warnings: 1 };
      throw err(1050, `Table '${tname}' already exists`);
    }
    this.requirePriv(ctx.name, 'CREATE');
    if (p.eat('LIKE') || (p.is('(') && p.peek(1)?.u === 'LIKE')) {
      const paren = p.eat('(');
      if (paren) p.expect('LIKE');
      const src = p.qname();
      if (paren) p.expect(')');
      const sctx = this.ctx(src.db || this.db);
      const sm = sctx.meta.tables[lc(src.name)];
      if (!sm) throw err(1146, `Table '${sctx.name}.${lc(src.name)}' doesn't exist`);
      const meta = JSON.parse(JSON.stringify(sm));
      meta.name = tname;
      meta.fks = [];
      this.buildTable(ctx, meta);
      this.saveMetaAndNotify(ctx);
      return { affected: 0, schema: true, db: ctx.name };
    }
    const meta = { name: tname, columns: [], pk: [], uniques: [], indexes: [], fks: [], checks: [], engine: 'InnoDB', comment: '', charset: 'utf8mb4', collation: 'utf8mb4_0900_ai_ci' };
    let asSelect = null;
    if (p.is('(')) {
      p.expect('(');
      for (;;) {
        this.tableElement(p, meta, ctx);
        if (p.eat(',')) continue;
        p.expect(')');
        break;
      }
    }
    this.tableOptions(p, meta);
    if (p.eat('AS') || p.is('SELECT')) {
      asSelect = p.toks.slice(p.i);
      p.i = p.toks.length;
    }
    p.end();
    if (temporary) meta.temporary = this.id;
    let sel = null;
    if (asSelect) {
      // CREATE TABLE ... SELECT: sütunlar sorgu sonucundan
      const text = p.src.slice(asSelect[0].s, p.stmt.e);
      const saveLimit = this.limitRows;
      this.limitRows = 0;
      try { sel = this.dml(text, { sql: text, s: 0, e: text.length, tokens: tokenize(text) }, 'SELECT'); } finally { this.limitRows = saveLimit; }
      for (const c of sel.columns) {
        if (meta.columns.some((x) => lc(x.name) === lc(c.name))) continue;
        let col;
        if (c.column) col = { name: c.name, type: c.type, len: c.len, scale: c.scale, unsigned: c.unsigned, zerofill: c.zerofill, values: c.values, notNull: c.notNull };
        else {
          const i = sel.columns.indexOf(c);
          const max = Math.max(1, ...sel.rows.map((r) => (r[i] == null ? 0 : [...String(r[i])].length)));
          col = c.type === 'bigint' ? { name: c.name, type: 'bigint' } : c.type === 'double' ? { name: c.name, type: 'double' } : c.type === 'blob' ? { name: c.name, type: 'longblob' } : { name: c.name, type: 'varchar', len: Math.max(max, 1) };
        }
        for (const k of Object.keys(col)) if (col[k] === undefined) delete col[k];
        meta.columns.push(col);
      }
    }
    if (!meta.columns.length) throw err(1113, 'A table must have at least 1 column');
    this.finishMeta(ctx, meta);
    this.buildTable(ctx, meta);
    if (meta.autoIncStart > 1) this.setAutoInc(ctx, tname, meta.autoIncStart);
    delete meta.autoIncStart;
    if (sel && sel.rows.length) {
      const cols = sel.columns.map((c) => dq(c.name));
      const ins = `INSERT INTO ${dq(tname)} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`;
      try {
        for (const r of sel.rows) ctx.sql.run(ins, r);
      } catch (e) {
        ctx.sql.run(`DROP TABLE ${dq(tname)}`);
        delete ctx.meta.tables[tname];
        throw this.mapError(e, { kind: 'INSERT', ctx, target: tname, toks: [], src: '' });
      }
    }
    this.saveMetaAndNotify(ctx);
    const n = sel ? sel.rows.length : 0;
    return { affected: n, schema: true, db: ctx.name, info: sel ? `Records: ${n}  Duplicates: 0  Warnings: 0` : undefined };
  }

  saveMetaAndNotify(ctx) {
    this.server.saveMeta(ctx);
    this.changed(ctx, true);
  }

  tableOptions(p, meta) {
    for (;;) {
      p.eat(',');
      if (p.eat('ENGINE')) { p.eat('='); meta.engine = p.name(true); continue; }
      if (p.eat('AUTO_INCREMENT')) { p.eat('='); meta.autoIncStart = p.num(); continue; }
      if (p.eat('DEFAULT')) continue;
      if (p.eat('CHARACTER', 'SET') || p.eat('CHARSET')) { p.eat('='); meta.charset = lc(p.name(true)); continue; }
      if (p.eat('COLLATE')) { p.eat('='); meta.collation = lc(p.name(true)); continue; }
      if (p.eat('COMMENT')) { p.eat('='); meta.comment = p.cur?.val ?? ''; p.i++; continue; }
      if (p.eat('ROW_FORMAT') || p.eat('KEY_BLOCK_SIZE') || p.eat('STATS_PERSISTENT') || p.eat('AVG_ROW_LENGTH') || p.eat('MAX_ROWS') || p.eat('MIN_ROWS') || p.eat('PACK_KEYS')) { p.eat('='); p.i++; continue; }
      break;
    }
  }

  tableElement(p, meta, ctx) {
    let cname = null;
    if (p.eat('CONSTRAINT')) {
      if (!p.is('PRIMARY') && !p.is('UNIQUE') && !p.is('FOREIGN') && !p.is('CHECK')) cname = p.name();
    }
    if (p.eat('PRIMARY', 'KEY')) {
      if (p.eat('USING')) p.i++;
      if (meta.pk.length) throw err(1068, 'Multiple primary key defined');
      meta.pk = p.nameList();
      this.indexTail(p);
      return;
    }
    if (p.eat('UNIQUE')) {
      p.eat('INDEX') || p.eat('KEY');
      const name = p.is('(') ? cname : p.name();
      meta.uniques.push({ name, cols: p.nameList() });
      this.indexTail(p);
      return;
    }
    if (p.eat('FOREIGN', 'KEY')) {
      const idx = p.is('(') ? null : p.name();
      const fk = this.fkTail(p, cname || idx);
      meta.fks.push(fk);
      return;
    }
    if (p.eat('CHECK')) {
      const g = p.group();
      meta.checks.push({ name: cname, expr: p.textOf(g) });
      p.eat('ENFORCED') || p.eat('NOT', 'ENFORCED');
      return;
    }
    if (cname) throw p.syntax();
    if (p.eat('INDEX') || p.eat('KEY') || p.eat('FULLTEXT') || p.eat('SPATIAL')) {
      p.eat('INDEX') || p.eat('KEY');
      const name = p.is('(') ? null : p.name();
      meta.indexes.push({ name, cols: p.nameList() });
      this.indexTail(p);
      return;
    }
    const col = this.columnDef(p);
    if (meta.columns.some((c) => lc(c.name) === lc(col.name))) throw err(1060, `Duplicate column name '${col.name}'`);
    if (col.pkInline) {
      if (meta.pk.length) throw err(1068, 'Multiple primary key defined');
      meta.pk = [col.name];
    }
    if (col.uniqueInline) meta.uniques.push({ name: null, cols: [col.name] });
    if (col.checkInline) meta.checks.push({ name: null, expr: col.checkInline });
    delete col.pkInline;
    delete col.uniqueInline;
    delete col.checkInline;
    meta.columns.push(col);
  }

  indexTail(p) {
    for (;;) {
      if (p.eat('USING')) { p.i++; continue; }
      if (p.eat('VISIBLE') || p.eat('INVISIBLE')) continue;
      if (p.eat('COMMENT')) { p.i++; continue; }
      if (p.eat('KEY_BLOCK_SIZE')) { p.eat('='); p.i++; continue; }
      break;
    }
  }

  fkTail(p, name) {
    const cols = p.nameList();
    p.expect('REFERENCES');
    const ref = p.qname();
    const refCols = p.nameList();
    const fk = { name, cols, refTable: lc(ref.name), refCols, onDelete: null, onUpdate: null };
    for (;;) {
      if (p.eat('ON', 'DELETE')) { fk.onDelete = this.fkAction(p); continue; }
      if (p.eat('ON', 'UPDATE')) { fk.onUpdate = this.fkAction(p); continue; }
      if (p.eat('MATCH')) { p.i++; continue; }
      break;
    }
    if (fk.cols.length !== fk.refCols.length) throw err(1239, `Incorrect foreign key definition for '${name || 'foreign key without name'}': Key reference and table reference don't match`);
    return fk;
  }

  fkAction(p) {
    if (p.eat('CASCADE')) return 'CASCADE';
    if (p.eat('RESTRICT')) return 'RESTRICT';
    if (p.eat('SET', 'NULL')) return 'SET NULL';
    if (p.eat('NO', 'ACTION')) return 'NO ACTION';
    if (p.eat('SET', 'DEFAULT')) return 'SET DEFAULT';
    throw p.syntax();
  }

  parseType(p) {
    const t = p.cur;
    if (!t || t.t !== 'id') throw p.syntax();
    let type = t.v.toLowerCase();
    p.i++;
    const c = {};
    if (type === 'double' && p.eat('PRECISION')) type = 'double';
    if (type === 'character' && p.eat('VARYING')) type = 'varchar';
    if (type === 'national') { const n = p.name(true).toLowerCase(); type = n === 'varchar' ? 'varchar' : 'char'; }
    if (type === 'long') { p.eat('VARCHAR'); type = 'mediumtext'; }
    if (type === 'bool' || type === 'boolean') { c.len = 1; }
    type = TYPE_ALIASES[type] || type;
    if (!ALL_TYPES.has(type)) throw p.syntax(t);
    c.type = type;
    if (type === 'enum' || type === 'set') {
      p.expect('(');
      c.values = [];
      for (;;) {
        const s = p.cur;
        if (!s || s.t !== 'str') throw p.syntax();
        c.values.push(s.val);
        p.i++;
        if (p.eat(',')) continue;
        p.expect(')');
        break;
      }
    } else if (p.is('(')) {
      p.i++;
      c.len = p.num();
      if (p.eat(',')) c.scale = p.num();
      p.expect(')');
    }
    if (type === 'decimal') {
      c.len ??= 10;
      c.scale ??= 0;
      if (c.len > 65) throw err(1426, `Too-big precision ${c.len} specified for column. Maximum is 65.`);
      if (c.scale > 30) throw err(1425, `Too big scale ${c.scale} specified for column. Maximum is 30.`);
    }
    if ((type === 'decimal' || type === 'float' || type === 'double') && c.scale != null && c.scale > c.len) throw err(1427, 'For float(M,D), double(M,D) or decimal(M,D), M must be >= D');
    if (type === 'char' || type === 'binary') c.len ??= 1;
    if ((type === 'varchar' || type === 'varbinary') && c.len == null) throw p.syntax();
    if (type === 'varchar' && c.len > 16383) throw err(1074, `Column length too big (max = 16383); use BLOB or TEXT instead`);
    if (type === 'char' && c.len > 255) throw err(1074, 'Column length too big (max = 255); use BLOB or TEXT instead');
    if (type in INT_TYPES && c.len != null && !c.zerofill) { /* görüntü genişliği (8.0.17+ kullanımdan kalktı) */ }
    for (;;) {
      if (p.eat('UNSIGNED')) { c.unsigned = true; continue; }
      if (p.eat('SIGNED')) continue;
      if (p.eat('ZEROFILL')) { c.zerofill = true; c.unsigned = true; continue; }
      if (p.eat('CHARACTER', 'SET') || p.eat('CHARSET')) { p.name(true); continue; }
      if (p.eat('BINARY')) continue;
      break;
    }
    if (!(type in INT_TYPES)) {
      if (c.zerofill || c.unsigned) {
        if (!(type === 'decimal' || type === 'float' || type === 'double')) throw p.syntax();
      }
    }
    if (type in INT_TYPES && !c.zerofill && !(type === 'tinyint' && c.len === 1)) delete c.len;
    return c;
  }

  columnDef(p) {
    const name = p.name();
    if (name.length > 64) throw err(1059, `Identifier name '${name}' is too long`);
    const c = { name, ...this.parseType(p) };
    for (;;) {
      if (p.done() || p.is(',') || p.is(')') || p.is('FIRST') || p.is('AFTER')) break;
      if (p.eat('NOT', 'NULL')) { c.notNull = true; continue; }
      if (p.eat('NULL')) { c.notNull = false; continue; }
      if (p.eat('DEFAULT')) { c.default = this.defaultValue(p, c); continue; }
      if (p.eat('AUTO_INCREMENT')) { c.autoInc = true; continue; }
      if (p.eat('PRIMARY', 'KEY') || p.eat('KEY')) { c.pkInline = true; continue; }
      if (p.eat('UNIQUE')) { p.eat('KEY'); c.uniqueInline = true; continue; }
      if (p.eat('COMMENT')) { const s = p.cur; if (!s || s.t !== 'str') throw p.syntax(); c.comment = s.val; p.i++; continue; }
      if (p.eat('COLLATE')) { p.name(true); continue; }
      if (p.eat('CHARACTER', 'SET') || p.eat('CHARSET')) { p.name(true); continue; }
      if (p.eat('ON', 'UPDATE')) { p.expect('CURRENT_TIMESTAMP'); if (p.is('(')) p.group(); c.onUpdateNow = true; continue; }
      if (p.eat('VISIBLE') || p.eat('INVISIBLE')) continue;
      if (p.eat('REFERENCES')) { p.qname(); p.nameList(); while (p.eat('ON', 'DELETE') || p.eat('ON', 'UPDATE')) this.fkAction(p); continue; }
      if (p.eat('CONSTRAINT')) { if (!p.is('CHECK')) p.name(); continue; }
      if (p.eat('CHECK')) { c.checkInline = p.textOf(p.group()); p.eat('ENFORCED') || p.eat('NOT', 'ENFORCED'); continue; }
      if (p.eat('GENERATED') || p.is('AS')) throw err(1235, 'Hesaplanan (GENERATED) sütunlar bu simülatörde desteklenmiyor.');
      if (p.eat('SRID')) { p.i++; continue; }
      throw p.syntax();
    }
    if (c.pkInline) c.notNull = true;
    if (c.default && !c.default.now && !c.default.expr) {
      const v = c.default.value;
      if ((TEXT_TYPES.has(c.type) && c.type !== 'char' && c.type !== 'varchar' && c.type !== 'enum' && c.type !== 'set') || BLOB_TYPES.has(c.type) && c.type !== 'binary' && c.type !== 'varbinary') {
        throw err(1101, `BLOB, TEXT, GEOMETRY or JSON column '${name}' can't have a default value`);
      }
      if (v === null && c.notNull) throw err(1067, `Invalid default value for '${name}'`);
      if (v !== null && !defaultValid(c, v)) throw err(1067, `Invalid default value for '${name}'`);
    }
    if (c.default?.now && !['datetime', 'timestamp'].includes(c.type)) throw err(1067, `Invalid default value for '${name}'`);
    if (c.autoInc && c.default) throw err(1067, `Invalid default value for '${name}'`);
    if (c.autoInc && !(c.type in INT_TYPES || c.type === 'float' || c.type === 'double')) throw err(1063, `Incorrect column specifier for column '${name}'`);
    return c;
  }

  defaultValue(p, c) {
    const t = p.cur;
    if (!t) throw p.syntax();
    if (t.t === 'op' && t.v === '(') {
      const g = p.group();
      return { expr: p.textOf(g) };
    }
    if (t.t === 'id' && (t.u === 'CURRENT_TIMESTAMP' || t.u === 'NOW' || t.u === 'LOCALTIMESTAMP')) {
      p.i++;
      if (p.is('(')) p.group();
      return { now: true };
    }
    if (t.t === 'id' && t.u === 'NULL') { p.i++; return { value: null }; }
    if (t.t === 'id' && (t.u === 'TRUE' || t.u === 'FALSE')) { p.i++; return { value: t.u === 'TRUE' ? 1 : 0 }; }
    if (t.t === 'op' && (t.v === '-' || t.v === '+')) {
      p.i++;
      const n = p.num();
      return { value: t.v === '-' ? -n : n };
    }
    if (t.t === 'num') { p.i++; return { value: t.val }; }
    if (t.t === 'str') { p.i++; return { value: t.val }; }
    throw p.syntax();
  }

  /** Adsız anahtarlara ad verir, doğrular */
  finishMeta(ctx, meta) {
    const has = (n) => [...meta.uniques, ...meta.indexes].some((x) => x.name && lc(x.name) === lc(n)) || lc(n) === 'primary';
    const colNames = new Set(meta.columns.map((c) => lc(c.name)));
    const canon = (n) => meta.columns.find((c) => lc(c.name) === lc(n))?.name ?? n;
    const checkCols = (cols) => {
      for (const c of cols) if (!colNames.has(lc(c))) throw err(1072, `Key column '${c}' doesn't exist in table`);
      return cols.map(canon);
    };
    meta.pk = checkCols(meta.pk);
    for (const c of meta.columns) if (meta.pk.some((x) => lc(x) === lc(c.name))) c.notNull = true;
    for (const list of [meta.uniques, meta.indexes]) {
      for (const u of list) {
        u.cols = checkCols(u.cols);
        if (!u.name) {
          let n = u.cols[0];
          let k = 2;
          while (has(n)) n = `${u.cols[0]}_${k++}`;
          u.name = n;
        } else {
          const dup = [...meta.uniques, ...meta.indexes].filter((x) => x.name && lc(x.name) === lc(u.name));
          if (dup.length > 1) throw err(1061, `Duplicate key name '${u.name}'`);
        }
      }
    }
    let fkn = 1;
    for (const fk of meta.fks) {
      fk.cols = checkCols(fk.cols);
      if (!fk.name) {
        while (meta.fks.some((f) => f.name && lc(f.name) === `${meta.name}_ibfk_${fkn}`)) fkn++;
        fk.name = `${meta.name}_ibfk_${fkn++}`;
      }
      this.validateFk(ctx, meta, fk);
      // yabancı anahtar için dizin
      const covered = [meta.pk, ...meta.uniques.map((u) => u.cols), ...meta.indexes.map((u) => u.cols)].some((cols) => fk.cols.every((c, i) => cols[i] && lc(cols[i]) === lc(c)));
      if (!covered) meta.indexes.push({ name: has(fk.name) ? `${fk.name}_idx` : fk.name, cols: fk.cols.slice() });
    }
    let chk = 1;
    for (const ch of meta.checks) {
      if (!ch.name) {
        while (meta.checks.some((x) => x.name === `${meta.name}_chk_${chk}`)) chk++;
        ch.name = `${meta.name}_chk_${chk++}`;
      }
    }
    const ai = meta.columns.filter((c) => c.autoInc);
    if (ai.length > 1) throw err(1075, 'Incorrect table definition; there can be only one auto column and it must be defined as a key');
    if (ai.length === 1) {
      const isKey = (meta.pk.length && lc(meta.pk[0]) === lc(ai[0].name)) || meta.uniques.some((u) => lc(u.cols[0]) === lc(ai[0].name)) || meta.indexes.some((u) => lc(u.cols[0]) === lc(ai[0].name));
      if (!isKey) throw err(1075, 'Incorrect table definition; there can be only one auto column and it must be defined as a key');
      if (!(meta.pk.length >= 1 && lc(meta.pk[0]) === lc(ai[0].name) && ai[0].type in INT_TYPES)) {
        throw err(1235, 'Bu simülatörde AUTO_INCREMENT sütunu, tam sayı türünde ve PRIMARY KEY\'in ilk sütunu olmalıdır.');
      }
    }
  }

  validateFk(ctx, meta, fk) {
    const parent = lc(fk.refTable) === meta.name ? meta : ctx.meta.tables[lc(fk.refTable)];
    if (!parent) {
      if (this.fkChecks) throw err(1824, `Failed to open the referenced table '${fk.refTable}'`);
      return;
    }
    fk.refCols = fk.refCols.map((n) => {
      const c = parent.columns.find((x) => lc(x.name) === lc(n));
      if (!c) throw err(3734, `Failed to add the foreign key constraint. Missing column '${n}' for constraint '${fk.name}' in the referenced table '${parent.name}'`);
      return c.name;
    });
    const same = (cols) => cols.length === fk.refCols.length && cols.every((c, i) => lc(c) === lc(fk.refCols[i]));
    if (!same(parent.pk) && !parent.uniques.some((u) => same(u.cols))) {
      throw err(1822, `Failed to add the foreign key constraint. Missing index for constraint '${fk.name}' in the referenced table '${parent.name}'`);
    }
    fk.cols.forEach((cn, i) => {
      const a = meta.columns.find((x) => lc(x.name) === lc(cn));
      const b = parent.columns.find((x) => lc(x.name) === lc(fk.refCols[i]));
      const fam = (c) => (c.type in INT_TYPES ? 'int' + (c.unsigned ? 'u' : '') : c.type === 'decimal' ? `dec${c.len},${c.scale}` : TEXT_TYPES.has(c.type) && c.type !== 'enum' ? 'str' : c.type);
      if (fam(a) !== fam(b) || (a.type in INT_TYPES && a.type !== b.type)) {
        throw err(3780, `Referencing column '${a.name}' and referenced column '${b.name}' in foreign key constraint '${fk.name}' are incompatible.`);
      }
      if ((fk.onDelete === 'SET NULL' || fk.onUpdate === 'SET NULL') && a.notNull) {
        throw err(1830, `Column '${a.name}' cannot be NOT NULL: needed in a foreign key constraint '${fk.name}' SET NULL`);
      }
    });
  }

  /** Tanımdan SQLite tablosunu, dizinleri ve tetikleyicileri oluşturur */
  buildTable(ctx, meta, sqliteName = meta.name) {
    ctx.sql.run(this.sqliteDdl(ctx, meta, sqliteName));
    ctx.meta.tables[meta.name] = meta;
    if (sqliteName === meta.name) this.buildIndexesAndTriggers(ctx, meta);
  }

  buildIndexesAndTriggers(ctx, meta) {
    const t = meta.name;
    for (const u of meta.uniques) ctx.sql.run(`CREATE UNIQUE INDEX ${dq(t + '.' + u.name)} ON ${dq(t)} (${u.cols.map(dq).join(', ')})`);
    for (const u of meta.indexes) ctx.sql.run(`CREATE INDEX ${dq(t + '.' + u.name)} ON ${dq(t)} (${u.cols.map(dq).join(', ')})`);
    const sets = [];
    for (const c of meta.columns) {
      const q = dq(c.name);
      if (c.type === 'decimal') sets.push(`${q} = m_round(${q}, ${c.scale ?? 0})`);
      else if ((c.type === 'float' || c.type === 'double') && c.scale != null) sets.push(`${q} = m_round(${q}, ${c.scale})`);
      else if (c.type === 'date') sets.push(`${q} = m_date_norm(${q})`);
      else if (c.type === 'datetime' || c.type === 'timestamp') sets.push(`${q} = m_datetime_norm(${q})`);
      else if (c.type === 'time') sets.push(`${q} = m_time_norm(${q})`);
      else if (c.type === 'enum') sets.push(`${q} = CASE ${c.values.map((v) => `WHEN ${q} = ${sq(v)} THEN ${sq(v)}`).join(' ')} ELSE ${q} END`);
    }
    if (sets.length) {
      ctx.sql.run(`CREATE TRIGGER ${dq(t + '.~ni')} AFTER INSERT ON ${dq(t)} BEGIN UPDATE ${dq(t)} SET ${sets.join(', ')} WHERE rowid = NEW.rowid; END`);
    }
    const usets = sets.slice();
    for (const c of meta.columns) {
      if (c.onUpdateNow) usets.push(`${dq(c.name)} = CASE WHEN NEW.${dq(c.name)} IS OLD.${dq(c.name)} THEN m_now() ELSE m_datetime_norm(NEW.${dq(c.name)}) END`);
    }
    if (usets.length) {
      ctx.sql.run(`CREATE TRIGGER ${dq(t + '.~nu')} AFTER UPDATE ON ${dq(t)} BEGIN UPDATE ${dq(t)} SET ${usets.join(', ')} WHERE rowid = NEW.rowid; END`);
    }
    this.createUserTriggers(ctx, t);
  }

  sqliteDdl(ctx, meta, sqliteName) {
    const parts = [];
    const singleAi = meta.columns.find((c) => c.autoInc);
    for (const c of meta.columns) {
      const q = dq(c.name);
      let s = q + ' ' + (c === singleAi ? 'INTEGER' : sqliteType(c) === 'INTEGER' ? 'INT' : sqliteType(c));
      if (sqliteType(c) === 'TEXT') s += ' COLLATE NOCASE';
      if (c === singleAi) s += ' PRIMARY KEY AUTOINCREMENT';
      if (c.notNull) s += ' NOT NULL';
      if (c.default) s += ' DEFAULT ' + this.sqliteDefault(ctx, c);
      const checks = [];
      if ((c.type === 'varchar' || c.type === 'char') && c.len) checks.push([`m!len!${c.name}`, `length(${q}) <= ${c.len}`]);
      if (c.type === 'tinytext') checks.push([`m!len!${c.name}`, `length(${q}) <= 255`]);
      if (c.type === 'text') checks.push([`m!len!${c.name}`, `length(${q}) <= 65535`]);
      if (c.type in INT_TYPES && INT_TYPES[c.type]) {
        const [lo, hi, uhi] = INT_TYPES[c.type];
        checks.push([`m!rng!${c.name}`, c.unsigned ? `${q} BETWEEN 0 AND ${uhi}` : `${q} BETWEEN ${lo} AND ${hi}`]);
      } else if (c.type === 'bigint' && c.unsigned) checks.push([`m!rng!${c.name}`, `${q} >= 0`]);
      if (c.type === 'decimal') {
        const max = 10 ** ((c.len ?? 10) - (c.scale ?? 0));
        checks.push([`m!rng!${c.name}`, c.unsigned ? `${q} >= 0 AND ${q} < ${max}` : `abs(${q}) < ${max}`]);
      } else if ((c.type === 'float' || c.type === 'double') && c.unsigned) checks.push([`m!rng!${c.name}`, `${q} >= 0`]);
      if (c.type === 'year') checks.push([`m!rng!${c.name}`, `${q} = 0 OR ${q} BETWEEN 1901 AND 2155`]);
      if (c.type === 'enum') checks.push([`m!enum!${c.name}`, `${q} IN (${c.values.map(sq).join(', ')})`]);
      if (c.type === 'date') checks.push([`m!date!${c.name}`, `m_date_ok(${q})`]);
      if (c.type === 'datetime' || c.type === 'timestamp') checks.push([`m!datetime!${c.name}`, `m_datetime_ok(${q})`]);
      if (c.type === 'time') checks.push([`m!time!${c.name}`, `m_time_ok(${q})`]);
      for (const [n, e] of checks) s += ` CONSTRAINT ${dq(n)} CHECK (${e})`;
      parts.push(s);
    }
    // AUTO_INCREMENT sütunu SQLite'ta tek başına birincil anahtardır; çok sütunlu PK'nin tekilliği bundan gelir
    if (meta.pk.length && !singleAi) parts.push(`PRIMARY KEY (${meta.pk.map(dq).join(', ')})`);
    for (const fk of meta.fks) {
      let s = `CONSTRAINT ${dq(fk.name)} FOREIGN KEY (${fk.cols.map(dq).join(', ')}) REFERENCES ${dq(lc(fk.refTable))} (${fk.refCols.map(dq).join(', ')})`;
      if (fk.onDelete && fk.onDelete !== 'NO ACTION') s += ' ON DELETE ' + fk.onDelete;
      if (fk.onUpdate && fk.onUpdate !== 'NO ACTION') s += ' ON UPDATE ' + fk.onUpdate;
      parts.push(s);
    }
    for (const ch of meta.checks) {
      const toks = tokenize(ch.expr);
      const tr = this.translate(toks, ch.expr, ctx, { noOrderWrap: true });
      parts.push(`CONSTRAINT ${dq('m!chk!' + ch.name)} CHECK (${tr.text})`);
    }
    return `CREATE TABLE ${dq(sqliteName)} (\n  ${parts.join(',\n  ')}\n) STRICT`;
  }

  sqliteDefault(ctx, c) {
    const d = c.default;
    if (d.now) return '(m_now())';
    if (d.expr) {
      const toks = tokenize(d.expr);
      return '(' + this.translate(toks, d.expr, ctx, { noOrderWrap: true }).text + ')';
    }
    if (d.value === null) return 'NULL';
    if (typeof d.value === 'number') return String(d.value);
    return sq(d.value);
  }

  setAutoInc(ctx, table, next) {
    const seq = Math.max(0, next - 1);
    const r = ctx.sql.exec(`SELECT max(rowid) FROM ${dq(table)}`);
    const max = r[0]?.values[0][0] ?? 0;
    const v = Math.max(seq, max || 0);
    try {
      ctx.sql.run('DELETE FROM sqlite_sequence WHERE name = ?', [table]);
      ctx.sql.run('INSERT INTO sqlite_sequence(name, seq) VALUES (?, ?)', [table, v]);
    } catch { /* AUTO_INCREMENT yok */ }
  }

  autoIncNext(ctx, table) {
    try {
      const r = ctx.sql.exec('SELECT seq FROM sqlite_sequence WHERE name = ?', [table]);
      return (r[0]?.values[0][0] ?? 0) + 1;
    } catch {
      return 1;
    }
  }

  createView(p, orReplace) {
    const q = p.qname();
    const ctx = this.ctx(q.db || this.db);
    const name = lc(q.name);
    let cols = null;
    if (p.is('(')) cols = p.nameList();
    p.expect('AS');
    const selToks = p.toks.slice(p.i);
    const text = p.textOf(selToks);
    if (ctx.meta.tables[name]) throw err(1050, `Table '${name}' already exists`);
    if (ctx.meta.views[name] && !orReplace) throw err(1050, `Table '${name}' already exists`);
    const toks = tokenize(text);
    const tr = this.translate(toks, text, ctx, { aliasSelect: true });
    try {
      if (ctx.meta.views[name]) ctx.sql.run(`DROP VIEW ${dq(name)}`);
      ctx.sql.run(`CREATE VIEW ${dq(name)}${cols ? ' (' + cols.map(dq).join(', ') + ')' : ''} AS ${tr.text}`);
      ctx.sql.exec(`SELECT * FROM ${dq(name)} LIMIT 0`);
    } catch (e) {
      try { ctx.sql.run(`DROP VIEW IF EXISTS ${dq(name)}`); } catch { /* yok */ }
      throw this.mapError(e, { kind: 'SELECT', ctx, toks: toks.filter(sig), src: text });
    }
    ctx.meta.views[name] = { name, select: text, cols };
    this.saveMetaAndNotify(ctx);
    return { affected: 0, schema: true, db: ctx.name };
  }

  // ------------------------------------------------------------ DROP

  drop(p) {
    p.expect('DROP');
    if (p.eat('DATABASE') || p.eat('SCHEMA')) {
      const ifEx = p.eat('IF', 'EXISTS');
      const name = p.name();
      p.end();
      if (SYSTEM_DBS.includes(lc(name))) throw err(3552, `Access to system schema '${lc(name)}' is rejected.`);
      if (!this.server.hasDb(name)) {
        if (ifEx) return { affected: 0, warnings: 1 };
        throw err(1008, `Can't drop database '${lc(name)}'; database doesn't exist`);
      }
      this.requirePriv(name, 'DROP');
      if (this.txDbs.has(lc(name))) this.commitAll();
      const n = this.server.dropDatabase(name);
      if (this.db === lc(name)) this.db = null;
      this.server.emit({ type: 'drop', db: lc(name) });
      return { affected: n, schema: true, db: lc(name) };
    }
    p.eat('TEMPORARY');
    if (p.eat('TABLE') || p.eat('TABLES')) {
      const ifEx = p.eat('IF', 'EXISTS');
      const list = [];
      do list.push(p.qname()); while (p.eat(','));
      p.eat('RESTRICT') || p.eat('CASCADE');
      p.end();
      const byCtx = list.map((q) => ({ ctx: this.ctx(q.db || this.db), name: lc(q.name) }));
      const missing = byCtx.filter((x) => !x.ctx.meta.tables[x.name]);
      if (missing.length && !ifEx) throw err(1051, `Unknown table '${missing.map((x) => `${x.ctx.name}.${x.name}`).join(',')}'`);
      const dropping = byCtx.filter((x) => x.ctx.meta.tables[x.name]);
      if (this.fkChecks) {
        for (const x of dropping) {
          for (const m of Object.values(x.ctx.meta.tables)) {
            if (m.name === x.name || dropping.some((d) => d.ctx === x.ctx && d.name === m.name)) continue;
            const fk = m.fks.find((f) => lc(f.refTable) === x.name);
            if (fk) throw err(3730, `Cannot drop table '${x.name}' referenced by a foreign key constraint '${fk.name}' on table '${m.name}'.`);
          }
        }
      }
      for (const x of dropping) {
        this.requirePriv(x.ctx.name, 'DROP', x.name);
        x.ctx.sql.run('PRAGMA foreign_keys = OFF');
        try {
          x.ctx.sql.run(`DROP TABLE ${dq(x.name)}`);
          try { x.ctx.sql.run('DELETE FROM sqlite_sequence WHERE name = ?', [x.name]); } catch { /* yok */ }
        } finally {
          x.ctx.sql.run('PRAGMA foreign_keys = ' + (this.fkChecks ? 'ON' : 'OFF'));
        }
        delete x.ctx.meta.tables[x.name];
        for (const [k, tg] of Object.entries(x.ctx.meta.triggers || {})) if (tg.table === x.name) delete x.ctx.meta.triggers[k];
        this.saveMetaAndNotify(x.ctx);
      }
      return { affected: 0, schema: true, db: dropping[0]?.ctx.name };
    }
    if (p.eat('VIEW')) {
      const ifEx = p.eat('IF', 'EXISTS');
      const list = [];
      do list.push(p.qname()); while (p.eat(','));
      p.end();
      for (const q of list) {
        const ctx = this.ctx(q.db || this.db);
        const name = lc(q.name);
        if (!ctx.meta.views[name]) {
          if (ifEx) continue;
          throw err(1051, `Unknown table '${ctx.name}.${name}'`);
        }
        ctx.sql.run(`DROP VIEW ${dq(name)}`);
        delete ctx.meta.views[name];
        this.saveMetaAndNotify(ctx);
      }
      return { affected: 0, schema: true };
    }
    if (p.is('PROCEDURE') || p.is('FUNCTION') || p.is('TRIGGER')) return this.dropRoutine(p);
    if (p.eat('INDEX') || p.eat('KEY')) {
      const name = p.name(true);
      p.expect('ON');
      const q = p.qname();
      p.end();
      const ctx = this.ctx(q.db || this.db);
      return this.alterTableSpecs(ctx, q.name, [lc(name) === 'primary' ? { op: 'dropPk' } : { op: 'dropIndex', name }]);
    }
    if (p.eat('USER')) {
      const ifEx = p.eat('IF', 'EXISTS');
      const list = [];
      do list.push(this.userSpec(p)); while (p.eat(','));
      p.end();
      for (const u of list) {
        const i = this.server.users.findIndex((x) => x.user === u.user && x.host === u.host);
        if (i < 0) {
          if (ifEx) continue;
          throw err(1396, `Operation DROP USER failed for '${u.user}'@'${u.host}'`);
        }
        this.server.users.splice(i, 1);
      }
      this.server.emit({ type: 'users' });
      return { affected: 0 };
    }
    throw p.syntax();
  }

  // ------------------------------------------------------------ ALTER

  alter(p) {
    p.expect('ALTER');
    if (p.eat('DATABASE') || p.eat('SCHEMA')) {
      const name = p.is('DEFAULT') || p.is('CHARACTER') || p.is('CHARSET') || p.is('COLLATE') ? this.db : p.name();
      const ctx = this.ctx(name);
      const o = this.dbOptions(p);
      p.end();
      Object.assign(ctx.meta, o);
      this.saveMetaAndNotify(ctx);
      return { affected: 1, schema: true, db: ctx.name };
    }
    if (p.eat('USER')) {
      p.eat('IF', 'EXISTS');
      const u = this.userRef(p);
      if (p.eat('IDENTIFIED')) {
        if (p.eat('WITH')) p.name(true);
        p.expect('BY');
        const t = p.cur;
        if (!t || t.t !== 'str') throw p.syntax();
        p.i++;
        u.password = t.val;
      }
      while (!p.done()) p.i++;
      this.server.emit({ type: 'users' });
      return { affected: 0 };
    }
    p.eat('ONLINE') || p.eat('IGNORE');
    p.expect('TABLE');
    const q = p.qname();
    const ctx = this.ctx(q.db || this.db);
    const specs = [];
    if (!p.done()) {
      for (;;) {
        specs.push(...this.alterSpec(p));
        if (p.eat(',')) continue;
        break;
      }
    }
    p.end();
    return this.alterTableSpecs(ctx, q.name, specs);
  }

  alterSpec(p) {
    const pos = () => {
      if (p.eat('FIRST')) return { first: true };
      if (p.eat('AFTER')) return { after: p.name() };
      return null;
    };
    if (p.eat('ADD')) {
      let cname = null;
      if (p.eat('CONSTRAINT')) { if (!p.is('PRIMARY') && !p.is('UNIQUE') && !p.is('FOREIGN') && !p.is('CHECK')) cname = p.name(); }
      if (p.eat('PRIMARY', 'KEY')) { const cols = p.nameList(); this.indexTail(p); return [{ op: 'addPk', cols }]; }
      if (p.eat('UNIQUE')) {
        p.eat('INDEX') || p.eat('KEY');
        const name = p.is('(') ? cname : p.name();
        const cols = p.nameList();
        this.indexTail(p);
        return [{ op: 'addIndex', unique: true, name, cols }];
      }
      if (p.eat('FOREIGN', 'KEY')) {
        const idx = p.is('(') ? null : p.name();
        return [{ op: 'addFk', fk: this.fkTail(p, cname || idx) }];
      }
      if (p.eat('CHECK')) { const g = p.group(); p.eat('ENFORCED') || p.eat('NOT', 'ENFORCED'); return [{ op: 'addCheck', name: cname, expr: p.textOf(g) }]; }
      if (cname) throw p.syntax();
      if (p.eat('INDEX') || p.eat('KEY') || p.eat('FULLTEXT') || p.eat('SPATIAL')) {
        p.eat('INDEX') || p.eat('KEY');
        const name = p.is('(') ? null : p.name();
        const cols = p.nameList();
        this.indexTail(p);
        return [{ op: 'addIndex', unique: false, name, cols }];
      }
      p.eat('COLUMN');
      if (p.is('(')) {
        p.i++;
        const out = [];
        for (;;) {
          out.push({ op: 'addColumn', col: this.columnDef(p) });
          if (p.eat(',')) continue;
          p.expect(')');
          return out;
        }
      }
      const col = this.columnDef(p);
      return [{ op: 'addColumn', col, pos: pos() }];
    }
    if (p.eat('DROP')) {
      if (p.eat('PRIMARY', 'KEY')) return [{ op: 'dropPk' }];
      if (p.eat('FOREIGN', 'KEY')) return [{ op: 'dropFk', name: p.name() }];
      if (p.eat('INDEX') || p.eat('KEY')) return [{ op: 'dropIndex', name: p.name() }];
      if (p.eat('CHECK') || p.eat('CONSTRAINT')) return [{ op: 'dropConstraint', name: p.name() }];
      p.eat('COLUMN');
      return [{ op: 'dropColumn', name: p.name() }];
    }
    if (p.eat('MODIFY')) {
      p.eat('COLUMN');
      const col = this.columnDef(p);
      return [{ op: 'change', old: col.name, col, pos: pos() }];
    }
    if (p.eat('CHANGE')) {
      p.eat('COLUMN');
      const old = p.name();
      const col = this.columnDef(p);
      return [{ op: 'change', old, col, pos: pos() }];
    }
    if (p.eat('RENAME')) {
      if (p.eat('COLUMN')) { const a = p.name(); p.expect('TO'); return [{ op: 'renameColumn', old: a, name: p.name() }]; }
      if (p.eat('INDEX') || p.eat('KEY')) { const a = p.name(); p.expect('TO'); return [{ op: 'renameIndex', old: a, name: p.name() }]; }
      p.eat('TO') || p.eat('AS');
      return [{ op: 'rename', to: p.qname() }];
    }
    if (p.eat('ALTER')) {
      p.eat('COLUMN');
      const name = p.name();
      if (p.eat('SET', 'DEFAULT')) {
        const c = { type: 'varchar' };
        return [{ op: 'setDefault', name, def: this.defaultValue(p, c) }];
      }
      if (p.eat('DROP', 'DEFAULT')) return [{ op: 'setDefault', name, def: null }];
      if (p.eat('SET', 'VISIBLE') || p.eat('SET', 'INVISIBLE')) return [];
      throw p.syntax();
    }
    if (p.eat('AUTO_INCREMENT')) { p.eat('='); return [{ op: 'autoInc', value: p.num() }]; }
    if (p.eat('ENGINE') || p.eat('ROW_FORMAT')) { p.eat('='); p.name(true); return []; }
    if (p.eat('COMMENT')) { p.eat('='); const t = p.cur; p.i++; return [{ op: 'comment', value: t?.val ?? '' }]; }
    if (p.eat('CONVERT', 'TO') || p.eat('DEFAULT') || p.is('CHARACTER') || p.is('CHARSET') || p.is('COLLATE')) {
      while (!p.done() && !p.is(',')) p.i++;
      return [];
    }
    if (p.eat('ORDER', 'BY')) { while (!p.done() && !p.is(',')) p.i++; return []; }
    if (p.eat('DISABLE', 'KEYS') || p.eat('ENABLE', 'KEYS') || p.eat('FORCE')) return [];
    throw p.syntax();
  }

  /** ALTER işlemlerini tanımın kopyasına uygular ve tabloyu yeniden kurar */
  alterTableSpecs(ctx, tableName, specs) {
    const name = lc(tableName);
    const old = ctx.meta.tables[name];
    if (!old) throw err(1146, `Table '${ctx.name}.${name}' doesn't exist`);
    this.requirePriv(ctx.name, 'ALTER', name);
    if (!specs.length) return { affected: 0, schema: true, db: ctx.name };
    if (this.txDbs.size) this.commitAll();
    const meta = JSON.parse(JSON.stringify(old));
    // yeni sütun adı → eski sütun adı (veri kopyası için)
    const source = new Map(meta.columns.map((c) => [c, c.name]));
    let renameTo = null;
    let autoInc = null;
    const findCol = (n) => meta.columns.find((c) => lc(c.name) === lc(n));
    const placeAt = (col, pos) => {
      const i = meta.columns.indexOf(col);
      if (pos && i >= 0) meta.columns.splice(i, 1);
      if (!pos) { if (i < 0) meta.columns.push(col); return; }
      if (pos.first) meta.columns.unshift(col);
      else {
        const j = meta.columns.findIndex((c) => lc(c.name) === lc(pos.after));
        if (j < 0) throw err(1054, `Unknown column '${pos.after}' in '${name}'`);
        meta.columns.splice(j + 1, 0, col);
      }
    };
    const renameRefs = (oldN, newN) => {
      const r = (arr) => arr.map((x) => (lc(x) === lc(oldN) ? newN : x));
      meta.pk = r(meta.pk);
      for (const u of [...meta.uniques, ...meta.indexes]) u.cols = r(u.cols);
      for (const f of meta.fks) f.cols = r(f.cols);
      for (const m of Object.values(ctx.meta.tables)) {
        if (m === old) continue;
        for (const f of m.fks) if (lc(f.refTable) === name) f.refCols = f.refCols.map((x) => (lc(x) === lc(oldN) ? newN : x));
      }
      for (const f of meta.fks) if (lc(f.refTable) === name) f.refCols = r(f.refCols);
    };
    let dataChange = false;
    for (const s of specs) {
      switch (s.op) {
        case 'addColumn': {
          if (findCol(s.col.name)) throw err(1060, `Duplicate column name '${s.col.name}'`);
          const col = { ...s.col };
          const pk = col.pkInline;
          const uq = col.uniqueInline;
          const ck = col.checkInline;
          delete col.pkInline; delete col.uniqueInline; delete col.checkInline;
          placeAt(col, s.pos);
          source.set(col, null);
          if (pk) { if (meta.pk.length) throw err(1068, 'Multiple primary key defined'); meta.pk = [col.name]; col.notNull = true; }
          if (uq) meta.uniques.push({ name: null, cols: [col.name] });
          if (ck) meta.checks.push({ name: null, expr: ck });
          dataChange = true;
          break;
        }
        case 'dropColumn': {
          const col = findCol(s.name);
          if (!col) throw err(1091, `Can't DROP '${s.name}'; check that column/key exists`);
          if (meta.columns.length === 1) throw err(1090, 'You can\'t delete all columns with ALTER TABLE; use DROP TABLE instead');
          const fk = meta.fks.find((f) => f.cols.some((c) => lc(c) === lc(col.name)));
          if (fk) throw err(1828, `Cannot drop column '${col.name}': needed in a foreign key constraint '${fk.name}'`);
          for (const m of Object.values(ctx.meta.tables)) {
            if (m.name === name) continue;
            const rf = m.fks.find((f) => lc(f.refTable) === name && f.refCols.some((c) => lc(c) === lc(col.name)));
            if (rf) throw err(1829, `Cannot drop column '${col.name}': needed in a foreign key constraint '${rf.name}' of table '${m.name}'`);
          }
          meta.columns.splice(meta.columns.indexOf(col), 1);
          const keep = (cols) => cols.filter((c) => lc(c) !== lc(col.name));
          meta.pk = keep(meta.pk);
          for (const list of ['uniques', 'indexes']) meta[list] = meta[list].map((u) => ({ ...u, cols: keep(u.cols) })).filter((u) => u.cols.length);
          dataChange = true;
          break;
        }
        case 'change': {
          const col = findCol(s.old);
          if (!col) throw err(1054, `Unknown column '${s.old}' in '${name}'`);
          if (lc(s.col.name) !== lc(col.name) && findCol(s.col.name)) throw err(1060, `Duplicate column name '${s.col.name}'`);
          const nc = { ...s.col };
          const pk = nc.pkInline;
          delete nc.pkInline; delete nc.uniqueInline; delete nc.checkInline;
          if (meta.pk.some((x) => lc(x) === lc(col.name))) nc.notNull = true;
          const i = meta.columns.indexOf(col);
          meta.columns[i] = nc;
          source.set(nc, source.get(col));
          source.delete(col);
          if (col.name !== nc.name) renameRefs(col.name, nc.name);
          if (pk && !meta.pk.length) meta.pk = [nc.name];
          if (s.pos) placeAt(nc, s.pos);
          // yabancı anahtar uyumluluğu
          for (const m of Object.values(ctx.meta.tables)) {
            if (m.name === name) continue;
            for (const f of m.fks) {
              if (lc(f.refTable) !== name) continue;
              const k = f.refCols.findIndex((x) => lc(x) === lc(nc.name));
              if (k < 0) continue;
              const child = m.columns.find((x) => lc(x.name) === lc(f.cols[k]));
              if (child && (child.type !== nc.type || !!child.unsigned !== !!nc.unsigned)) throw err(3780, `Referencing column '${child.name}' and referenced column '${nc.name}' in foreign key constraint '${f.name}' are incompatible.`);
            }
          }
          dataChange = true;
          break;
        }
        case 'renameColumn': {
          const col = findCol(s.old);
          if (!col) throw err(1054, `Unknown column '${s.old}' in '${name}'`);
          if (findCol(s.name) && lc(s.name) !== lc(s.old)) throw err(1060, `Duplicate column name '${s.name}'`);
          const nc = { ...col, name: s.name };
          meta.columns[meta.columns.indexOf(col)] = nc;
          source.set(nc, source.get(col));
          source.delete(col);
          renameRefs(col.name, nc.name);
          break;
        }
        case 'addPk':
          if (meta.pk.length) throw err(1068, 'Multiple primary key defined');
          meta.pk = s.cols;
          for (const c of s.cols) { const col = findCol(c); if (col) col.notNull = true; }
          break;
        case 'dropPk':
          if (!meta.pk.length) throw err(1091, 'Can\'t DROP \'PRIMARY\'; check that column/key exists');
          meta.pk = [];
          break;
        case 'addIndex':
          (s.unique ? meta.uniques : meta.indexes).push({ name: s.name, cols: s.cols });
          break;
        case 'dropIndex': {
          const n = lc(s.name);
          const ui = meta.uniques.findIndex((u) => lc(u.name) === n);
          const ii = meta.indexes.findIndex((u) => lc(u.name) === n);
          if (ui < 0 && ii < 0) throw err(1091, `Can't DROP '${s.name}'; check that column/key exists`);
          const cols = ui >= 0 ? meta.uniques[ui].cols : meta.indexes[ii].cols;
          const fk = meta.fks.find((f) => f.cols.every((c, i) => cols[i] && lc(cols[i]) === lc(c)));
          if (fk && ![meta.pk, ...meta.uniques.filter((_, i) => i !== ui).map((u) => u.cols), ...meta.indexes.filter((_, i) => i !== ii).map((u) => u.cols)].some((cs) => fk.cols.every((c, i) => cs[i] && lc(cs[i]) === lc(c)))) {
            throw err(1553, `Cannot drop index '${s.name}': needed in a foreign key constraint`);
          }
          if (ui >= 0) meta.uniques.splice(ui, 1); else meta.indexes.splice(ii, 1);
          break;
        }
        case 'renameIndex': {
          const x = [...meta.uniques, ...meta.indexes].find((u) => lc(u.name) === lc(s.old));
          if (!x) throw err(1176, `Key '${s.old}' doesn't exist in table '${name}'`);
          x.name = s.name;
          break;
        }
        case 'addFk':
          if (meta.fks.some((f) => s.fk.name && lc(f.name) === lc(s.fk.name))) throw err(1826, `Duplicate foreign key constraint name '${s.fk.name}'`);
          meta.fks.push(s.fk);
          dataChange = true;
          break;
        case 'dropFk': {
          const i = meta.fks.findIndex((f) => lc(f.name) === lc(s.name));
          if (i < 0) throw err(1091, `Can't DROP '${s.name}'; check that column/key exists`);
          meta.fks.splice(i, 1);
          break;
        }
        case 'addCheck':
          meta.checks.push({ name: s.name, expr: s.expr });
          dataChange = true;
          break;
        case 'dropConstraint': {
          const n = lc(s.name);
          const ci = meta.checks.findIndex((c) => lc(c.name) === n);
          if (ci >= 0) { meta.checks.splice(ci, 1); break; }
          const fi = meta.fks.findIndex((f) => lc(f.name) === n);
          if (fi >= 0) { meta.fks.splice(fi, 1); break; }
          const ui = meta.uniques.findIndex((u) => lc(u.name) === n);
          if (ui >= 0) { meta.uniques.splice(ui, 1); break; }
          throw err(3940, `Constraint '${s.name}' does not exist.`);
        }
        case 'setDefault': {
          const col = findCol(s.name);
          if (!col) throw err(1054, `Unknown column '${s.name}' in '${name}'`);
          if (s.def) col.default = s.def; else delete col.default;
          if (s.def && s.def.value !== undefined && s.def.value !== null && !defaultValid(col, s.def.value)) throw err(1067, `Invalid default value for '${col.name}'`);
          break;
        }
        case 'rename': {
          const tctx = s.to.db ? this.ctx(s.to.db) : ctx;
          if (tctx !== ctx) throw err(1235, 'Tabloyu başka bir veritabanına taşımak bu simülatörde desteklenmiyor.');
          renameTo = lc(s.to.name);
          if (renameTo !== name && (ctx.meta.tables[renameTo] || ctx.meta.views[renameTo])) throw err(1050, `Table '${renameTo}' already exists`);
          break;
        }
        case 'autoInc':
          autoInc = s.value;
          break;
        case 'comment':
          meta.comment = s.value;
          break;
        default:
      }
    }
    // FK adları ve doğrulama
    meta.fks.forEach((f) => { if (!f.name) f.name = null; });
    this.finishMeta(ctx, meta);
    const finalName = renameTo || name;
    meta.name = finalName;
    for (const f of meta.fks) if (lc(f.refTable) === name) f.refTable = finalName;
    const nextAi = this.autoIncNext(ctx, name);
    const movedTriggers = renameTo && renameTo !== name ? Object.values(ctx.meta.triggers || {}).filter((tg) => tg.table === name) : [];
    for (const tg of movedTriggers) tg.table = renameTo;
    try {
      this.rebuild(ctx, old, meta, source, dataChange);
    } catch (e) {
      for (const tg of movedTriggers) tg.table = name;
      throw e;
    }
    if (renameTo && renameTo !== name) {
      for (const m of Object.values(ctx.meta.tables)) for (const f of m.fks) if (lc(f.refTable) === name) f.refTable = renameTo;
    }
    if (meta.columns.some((c) => c.autoInc)) this.setAutoInc(ctx, finalName, autoInc ?? nextAi);
    this.saveMetaAndNotify(ctx);
    return { affected: 0, schema: true, db: ctx.name, info: 'Records: 0  Duplicates: 0  Warnings: 0' };
  }

  /** Tabloyu yeni tanımla yeniden kurar ve verileri taşır */
  rebuild(ctx, oldMeta, meta, source, dataChange) {
    const db = ctx.sql;
    const tmp = '__mysql_sim_new';
    const oldName = oldMeta.name;
    db.run('PRAGMA foreign_keys = OFF');
    db.run('PRAGMA legacy_alter_table = ON');
    db.run('BEGIN');
    try {
      ctx.meta.tables[meta.name] = meta;
      db.run(this.sqliteDdl(ctx, meta, tmp));
      const cols = [];
      const exprs = [];
      const count = db.exec(`SELECT count(*) FROM ${dq(oldName)}`)[0].values[0][0];
      for (const c of meta.columns) {
        const src = source.get(c);
        if (src == null) {
          if (c.default || !c.notNull) continue;
          if (count === 0 || c.autoInc) continue;
          if (c.type === 'date' || c.type === 'datetime' || c.type === 'timestamp') throw err(1292, `Incorrect date value: '0000-00-00' for column '${c.name}' at row 1`);
          cols.push(dq(c.name));
          exprs.push(isNumType(c.type) ? '0' : c.type === 'enum' ? sq(c.values[0]) : c.type === 'time' ? "'00:00:00'" : "''");
          continue;
        }
        const q = dq(src);
        let e = q;
        if (c.type === 'decimal') e = `m_round(${q}, ${c.scale ?? 0})`;
        else if (c.type in INT_TYPES) e = `CASE WHEN typeof(${q}) = 'real' THEN m_round(${q}, 0) ELSE ${q} END`;
        else if (c.type === 'date') e = `coalesce(m_date_norm(${q}), ${q})`;
        else if (c.type === 'datetime' || c.type === 'timestamp') e = `coalesce(m_datetime_norm(${q}), ${q})`;
        cols.push(dq(c.name));
        exprs.push(e);
      }
      if (cols.length) db.run(`INSERT INTO ${dq(tmp)} (${cols.join(', ')}) SELECT ${exprs.join(', ')} FROM ${dq(oldName)}`);
      db.run(`DROP TABLE ${dq(oldName)}`);
      db.run(`ALTER TABLE ${dq(tmp)} RENAME TO ${dq(meta.name)}`);
      if (oldName !== meta.name) {
        delete ctx.meta.tables[oldName];
        try { db.run('UPDATE sqlite_sequence SET name = ? WHERE name = ?', [meta.name, oldName]); } catch { /* yok */ }
        // diğer tablolardaki başvurular (SQLite eski adla bırakır)
        for (const m of Object.values(ctx.meta.tables)) {
          if (m === meta || !m.fks.some((f) => lc(f.refTable) === oldName)) continue;
          for (const f of m.fks) if (lc(f.refTable) === oldName) f.refTable = meta.name;
          this.rebuildPlain(ctx, m);
        }
      }
      this.buildIndexesAndTriggers(ctx, meta);
      if (this.fkChecks && dataChange) {
        const bad = db.exec('PRAGMA foreign_key_check');
        if (bad.length && bad[0].values.length) {
          const row = bad[0].values[0];
          const child = ctx.meta.tables[lc(row[0])];
          const fk = child?.fks.find((f) => lc(f.refTable) === lc(row[2])) || child?.fks[0];
          throw err(1452, `Cannot add or update a child row: a foreign key constraint fails (\`${ctx.name}\`.\`${row[0]}\`, CONSTRAINT \`${fk?.name}\` FOREIGN KEY (${fk?.cols.map(bq).join(', ')}) REFERENCES \`${fk?.refTable}\` (${fk?.refCols.map(bq).join(', ')}))`);
        }
      }
      db.run('COMMIT');
    } catch (e) {
      try { db.run('ROLLBACK'); } catch { /* yok */ }
      ctx.meta.tables[oldMeta.name] = oldMeta;
      if (meta.name !== oldMeta.name) delete ctx.meta.tables[meta.name];
      throw this.mapError(e, { kind: 'ALTER', ctx, target: meta.name, toks: [], src: '' });
    } finally {
      db.run('PRAGMA legacy_alter_table = OFF');
      db.run('PRAGMA foreign_keys = ' + (this.fkChecks ? 'ON' : 'OFF'));
    }
  }

  /** Aynı tanımla yeniden kurulum (başka tablonun adı değişince FK metnini güncellemek için) */
  rebuildPlain(ctx, m) {
    const db = ctx.sql;
    const tmp = '__mysql_sim_fix';
    db.run(this.sqliteDdl(ctx, m, tmp));
    const cols = m.columns.map((c) => dq(c.name)).join(', ');
    db.run(`INSERT INTO ${dq(tmp)} (${cols}) SELECT ${cols} FROM ${dq(m.name)}`);
    db.run(`DROP TABLE ${dq(m.name)}`);
    db.run(`ALTER TABLE ${dq(tmp)} RENAME TO ${dq(m.name)}`);
    this.buildIndexesAndTriggers(ctx, m);
  }

  renameTables(p) {
    p.expect('RENAME');
    if (p.eat('USER')) {
      do {
        const u = this.userRef(p);
        p.expect('TO');
        const n = this.userSpec(p);
        u.user = n.user;
        u.host = n.host;
      } while (p.eat(','));
      this.server.emit({ type: 'users' });
      return { affected: 0 };
    }
    p.expect('TABLE');
    const pairs = [];
    do {
      const a = p.qname();
      p.expect('TO');
      const b = p.qname();
      pairs.push([a, b]);
    } while (p.eat(','));
    p.end();
    for (const [a, b] of pairs) {
      const ctx = this.ctx(a.db || this.db);
      this.alterTableSpecs(ctx, a.name, [{ op: 'rename', to: b }]);
    }
    return { affected: 0, schema: true };
  }

  truncate(p) {
    p.expect('TRUNCATE');
    p.eat('TABLE');
    const q = p.qname();
    p.end();
    const ctx = this.ctx(q.db || this.db);
    const name = lc(q.name);
    const meta = ctx.meta.tables[name];
    if (!meta) throw err(1146, `Table '${ctx.name}.${name}' doesn't exist`);
    this.requirePriv(ctx.name, 'DROP', name);
    if (this.fkChecks) {
      for (const m of Object.values(ctx.meta.tables)) {
        if (m.name === name) continue;
        const fk = m.fks.find((f) => lc(f.refTable) === name);
        if (fk) throw err(1701, `Cannot truncate a table referenced in a foreign key constraint (\`${ctx.name}\`.\`${m.name}\`, CONSTRAINT \`${fk.name}\`)`);
      }
    }
    // TRUNCATE, DELETE tetikleyicilerini çalıştırmaz
    this.server.trgFlag = 1;
    try { ctx.sql.run(`DELETE FROM ${dq(name)}`); } finally { this.server.trgFlag = 0; }
    try { ctx.sql.run('DELETE FROM sqlite_sequence WHERE name = ?', [name]); } catch { /* yok */ }
    this.changed(ctx, false);
    return { affected: 0, db: ctx.name, table: name };
  }

  // ------------------------------------------------------------ SHOW / DESCRIBE

  rowsResult(names, rows) {
    return { columns: names.map((n) => ({ name: n, type: 'varchar' })), rows, affected: 0 };
  }

  show(p) {
    p.expect('SHOW');
    const like = () => {
      if (p.eat('LIKE')) { const t = p.cur; p.i++; return (v) => likeMatch2(t?.val ?? '', v); }
      if (p.eat('WHERE')) { while (!p.done()) p.i++; return () => true; }
      return () => true;
    };
    if (p.eat('DATABASES') || p.eat('SCHEMAS')) {
      const f = like();
      const list = [...SYSTEM_DBS, ...this.server.databaseNames()].filter((d) => SYSTEM_DBS.includes(d) ? d === 'information_schema' || d === 'performance_schema' || this.account.grants.some((g) => g.db === '*') : this.server.canSeeDb(this.account, d)).sort();
      return this.rowsResult(['Database'], list.filter(f).map((d) => [d]));
    }
    const full = p.eat('FULL');
    if (p.eat('TABLES')) {
      let dbName = this.db;
      if (p.eat('FROM') || p.eat('IN')) dbName = p.name(true);
      const f = like();
      const ctx = this.ctx(dbName);
      const names = [...Object.keys(ctx.meta.tables).filter((n) => !ctx.meta.tables[n].temporary).map((n) => [n, 'BASE TABLE']), ...Object.keys(ctx.meta.views).map((n) => [n, 'VIEW'])].sort((a, b) => a[0].localeCompare(b[0])).filter((x) => f(x[0]));
      return this.rowsResult(full ? [`Tables_in_${ctx.name}`, 'Table_type'] : [`Tables_in_${ctx.name}`], names.map((x) => (full ? x : [x[0]])));
    }
    if (p.eat('COLUMNS') || p.eat('FIELDS')) {
      if (!p.eat('FROM')) p.expect('IN');
      const q = p.qname();
      if (p.eat('FROM') || p.eat('IN')) q.db = p.name(true);
      like();
      return this.describe(q, null, full);
    }
    if (p.eat('CREATE', 'TABLE')) {
      const q = p.qname();
      p.end();
      const ctx = this.ctx(q.db || this.db);
      const name = lc(q.name);
      if (ctx.meta.views[name]) {
        const v = ctx.meta.views[name];
        return this.rowsResult(['View', 'Create View', 'character_set_client', 'collation_connection'], [[name, `CREATE ALGORITHM=UNDEFINED DEFINER=\`root\`@\`localhost\` SQL SECURITY DEFINER VIEW \`${name}\` AS ${v.select}`, 'utf8mb4', 'utf8mb4_0900_ai_ci']]);
      }
      if (!ctx.meta.tables[name]) throw err(1146, `Table '${ctx.name}.${name}' doesn't exist`);
      return this.rowsResult(['Table', 'Create Table'], [[name, this.showCreateTable(ctx, name)]]);
    }
    if (p.eat('CREATE', 'VIEW')) {
      const q = p.qname();
      const ctx = this.ctx(q.db || this.db);
      const v = ctx.meta.views[lc(q.name)];
      if (!v) throw err(1146, `Table '${ctx.name}.${lc(q.name)}' doesn't exist`);
      return this.rowsResult(['View', 'Create View'], [[v.name, `CREATE VIEW \`${v.name}\` AS ${v.select}`]]);
    }
    if (p.eat('CREATE', 'DATABASE') || p.eat('CREATE', 'SCHEMA')) {
      p.eat('IF', 'NOT', 'EXISTS');
      const ctx = this.ctx(p.name(true));
      return this.rowsResult(['Database', 'Create Database'], [[ctx.name, this.showCreateDatabase(ctx)]]);
    }
    if (p.eat('INDEX') || p.eat('INDEXES') || p.eat('KEYS')) {
      if (!p.eat('FROM')) p.expect('IN');
      const q = p.qname();
      if (p.eat('FROM') || p.eat('IN')) q.db = p.name(true);
      const ctx = this.ctx(q.db || this.db);
      const m = ctx.meta.tables[lc(q.name)];
      if (!m) throw err(1146, `Table '${ctx.name}.${lc(q.name)}' doesn't exist`);
      const rows = [];
      const add = (key, cols, nonUnique) => cols.forEach((c, i) => rows.push([m.name, nonUnique, key, i + 1, c, 'A', null, null, null, m.columns.find((x) => lc(x.name) === lc(c))?.notNull ? '' : 'YES', 'BTREE', '', '', 'YES', null]));
      if (m.pk.length) add('PRIMARY', m.pk, 0);
      for (const u of m.uniques) add(u.name, u.cols, 0);
      for (const u of m.indexes) add(u.name, u.cols, 1);
      return this.rowsResult(['Table', 'Non_unique', 'Key_name', 'Seq_in_index', 'Column_name', 'Collation', 'Cardinality', 'Sub_part', 'Packed', 'Null', 'Index_type', 'Comment', 'Index_comment', 'Visible', 'Expression'], rows);
    }
    if (p.eat('VARIABLES') || p.eat('SESSION', 'VARIABLES') || p.eat('GLOBAL', 'VARIABLES')) {
      const f = like();
      const names = ['autocommit', 'basedir', 'character_set_client', 'character_set_connection', 'character_set_results', 'character_set_server', 'collation_connection', 'collation_server', 'datadir', 'default_storage_engine', 'foreign_key_checks', 'hostname', 'lower_case_table_names', 'max_allowed_packet', 'port', 'sql_mode', 'sql_safe_updates', 'time_zone', 'transaction_isolation', 'version', 'version_comment'];
      return this.rowsResult(['Variable_name', 'Value'], names.filter(f).map((n) => [n, String(this.sysVar(n))]));
    }
    if (p.eat('WARNINGS') || p.eat('ERRORS')) return this.rowsResult(['Level', 'Code', 'Message'], []);
    if (p.eat('GRANTS')) {
      let u = this.account;
      if (p.eat('FOR')) u = this.userRef(p);
      const rows = (u.grants || []).map((g) => [`GRANT ${g.privs.join(', ')} ON ${g.db === '*' ? '*' : bq(g.db)}.${g.table === '*' ? '*' : bq(g.table)} TO \`${u.user}\`@\`${u.host}\`${g.grantOption ? ' WITH GRANT OPTION' : ''}`]);
      if (!rows.length) rows.push([`GRANT USAGE ON *.* TO \`${u.user}\`@\`${u.host}\``]);
      return this.rowsResult([`Grants for ${u.user}@${u.host}`], rows);
    }
    if (p.eat('ENGINES')) return this.rowsResult(['Engine', 'Support', 'Comment'], [['InnoDB', 'DEFAULT', 'Supports transactions, row-level locking, and foreign keys'], ['MyISAM', 'YES', 'MyISAM storage engine'], ['MEMORY', 'YES', 'Hash based, stored in memory']]);
    if (p.eat('TABLE', 'STATUS')) {
      let dbName = this.db;
      if (p.eat('FROM') || p.eat('IN')) dbName = p.name(true);
      const f = like();
      const ctx = this.ctx(dbName);
      const rows = Object.values(ctx.meta.tables).filter((m) => f(m.name)).map((m) => {
        const n = ctx.sql.exec(`SELECT count(*) FROM ${dq(m.name)}`)[0].values[0][0];
        return [m.name, m.engine, 10, 'Dynamic', n, n ? 16384 / n | 0 : 0, 16384, m.columns.some((c) => c.autoInc) ? this.autoIncNext(ctx, m.name) : null, m.collation, m.comment];
      });
      return this.rowsResult(['Name', 'Engine', 'Version', 'Row_format', 'Rows', 'Avg_row_length', 'Data_length', 'Auto_increment', 'Collation', 'Comment'], rows);
    }
    if (p.eat('PROCESSLIST')) return this.rowsResult(['Id', 'User', 'Host', 'db', 'Command', 'Time', 'State', 'Info'], [[8, this.user, `${this.host}:52144`, this.db, 'Query', 0, 'init', 'SHOW PROCESSLIST']]);
    if (p.eat('STATUS') || p.eat('SESSION', 'STATUS') || p.eat('GLOBAL', 'STATUS')) {
      const f = like();
      return this.rowsResult(['Variable_name', 'Value'], [['Uptime', '3600'], ['Threads_connected', '1'], ['Questions', '42']].filter((x) => f(x[0])));
    }
    if (p.eat('CHARACTER', 'SET') || p.eat('CHARSET')) return this.rowsResult(['Charset', 'Description', 'Default collation', 'Maxlen'], [['utf8mb4', 'UTF-8 Unicode', 'utf8mb4_0900_ai_ci', '4'], ['latin1', 'cp1252 West European', 'latin1_swedish_ci', '1']]);
    if (p.eat('COLLATION')) return this.rowsResult(['Collation', 'Charset', 'Id', 'Default'], [['utf8mb4_0900_ai_ci', 'utf8mb4', '255', 'Yes'], ['utf8mb4_turkish_ci', 'utf8mb4', '233', ''], ['utf8mb4_tr_0900_ai_ci', 'utf8mb4', '265', '']]);
    const rr = this.showRoutines(p, like);
    if (rr) return rr;
    throw p.syntax();
  }

  describe(q, onlyCol, full) {
    const ctx = this.ctx(q.db || this.db);
    const name = lc(q.name);
    const m = ctx.meta.tables[name];
    if (!m) {
      if (ctx.meta.views[name]) {
        const r = ctx.sql.exec(`PRAGMA table_info(${dq(name)})`);
        return this.rowsResult(['Field', 'Type', 'Null', 'Key', 'Default', 'Extra'], (r[0]?.values || []).map((x) => [x[1], x[2] || 'varchar(255)', 'YES', '', null, '']));
      }
      throw err(1146, `Table '${ctx.name}.${name}' doesn't exist`);
    }
    const rows = m.columns.filter((c) => !onlyCol || likeMatch2(onlyCol, c.name)).map((c) => {
      const key = m.pk.some((x) => lc(x) === lc(c.name)) ? 'PRI' : m.uniques.some((u) => u.cols.length === 1 && lc(u.cols[0]) === lc(c.name)) ? 'UNI' : [...m.indexes, ...m.uniques].some((u) => lc(u.cols[0]) === lc(c.name)) ? 'MUL' : '';
      const def = c.default ? (c.default.now ? 'CURRENT_TIMESTAMP' : c.default.expr ? c.default.expr : c.default.value === null ? null : displayValue(c.default.value, c)) : null;
      const extra = [c.autoInc ? 'auto_increment' : '', c.default?.now || c.default?.expr ? 'DEFAULT_GENERATED' : '', c.onUpdateNow ? 'on update CURRENT_TIMESTAMP' : ''].filter(Boolean).join(' ');
      const base = [c.name, typeText(c), c.notNull ? 'NO' : 'YES', key, def, extra];
      if (full) return [c.name, typeText(c), isTextType(c.type) ? 'utf8mb4_0900_ai_ci' : null, c.notNull ? 'NO' : 'YES', key, def, extra, 'select,insert,update,references', c.comment || ''];
      return base;
    });
    return this.rowsResult(full ? ['Field', 'Type', 'Collation', 'Null', 'Key', 'Default', 'Extra', 'Privileges', 'Comment'] : ['Field', 'Type', 'Null', 'Key', 'Default', 'Extra'], rows);
  }

  showCreateDatabase(ctx) {
    return `CREATE DATABASE \`${ctx.name}\` /*!40100 DEFAULT CHARACTER SET ${ctx.meta.charset} COLLATE ${ctx.meta.collation} */ /*!80016 DEFAULT ENCRYPTION='N' */`;
  }

  showCreateTable(ctx, name) {
    const m = ctx.meta.tables[name];
    const lines = [];
    for (const c of m.columns) {
      let s = `  ${bq(c.name)} ${typeText(c)}`;
      if (isTextType(c.type) && c.type !== 'json' && m.collation !== 'utf8mb4_0900_ai_ci') s += ` COLLATE ${m.collation}`;
      if (c.notNull) s += ' NOT NULL';
      if (c.default) {
        if (c.default.now) s += ' DEFAULT CURRENT_TIMESTAMP';
        else if (c.default.expr) s += ` DEFAULT (${c.default.expr})`;
        else if (c.default.value === null) s += ' DEFAULT NULL';
        else s += ' DEFAULT ' + mysqlString(displayValue(c.default.value, c));
      } else if (!c.notNull && !c.autoInc && !(TEXT_TYPES.has(c.type) && !['char', 'varchar', 'enum', 'set'].includes(c.type)) && !BLOB_TYPES.has(c.type)) s += ' DEFAULT NULL';
      if (c.onUpdateNow) s += ' ON UPDATE CURRENT_TIMESTAMP';
      if (c.autoInc) s += ' AUTO_INCREMENT';
      if (c.comment) s += ' COMMENT ' + mysqlString(c.comment);
      lines.push(s);
    }
    if (m.pk.length) lines.push(`  PRIMARY KEY (${m.pk.map(bq).join(',')})`);
    for (const u of m.uniques) lines.push(`  UNIQUE KEY ${bq(u.name)} (${u.cols.map(bq).join(',')})`);
    for (const u of m.indexes) lines.push(`  KEY ${bq(u.name)} (${u.cols.map(bq).join(',')})`);
    for (const f of m.fks) {
      let s = `  CONSTRAINT ${bq(f.name)} FOREIGN KEY (${f.cols.map(bq).join(', ')}) REFERENCES ${bq(f.refTable)} (${f.refCols.map(bq).join(', ')})`;
      if (f.onDelete && f.onDelete !== 'NO ACTION' && f.onDelete !== 'RESTRICT') s += ' ON DELETE ' + f.onDelete;
      if (f.onUpdate && f.onUpdate !== 'NO ACTION' && f.onUpdate !== 'RESTRICT') s += ' ON UPDATE ' + f.onUpdate;
      lines.push(s);
    }
    for (const ch of m.checks) lines.push(`  CONSTRAINT ${bq(ch.name)} CHECK (${ch.expr})`);
    let tail = `) ENGINE=${m.engine || 'InnoDB'}`;
    if (m.columns.some((c) => c.autoInc)) {
      const next = this.autoIncNext(ctx, name);
      if (next > 1) tail += ` AUTO_INCREMENT=${next}`;
    }
    tail += ` DEFAULT CHARSET=${m.charset || 'utf8mb4'} COLLATE=${m.collation || 'utf8mb4_0900_ai_ci'}`;
    if (m.comment) tail += ` COMMENT=${mysqlString(m.comment)}`;
    return `CREATE TABLE ${bq(name)} (\n${lines.join(',\n')}\n${tail}`;
  }

  // ------------------------------------------------------------ kullanıcılar

  userSpec(p) {
    const user = p.name(true);
    let host = '%';
    if (p.cur && p.cur.t === 'var') {
      host = p.cur.v.slice(1).replace(/^['"`]|['"`]$/g, '');
      p.i++;
    } else if (p.eat('@')) host = p.name(true);
    return { user, host };
  }

  userRef(p) {
    if (p.eat('CURRENT_USER')) { if (p.is('(')) p.group(); return this.account; }
    const s = this.userSpec(p);
    const u = this.server.users.find((x) => x.user === s.user && x.host === s.host);
    if (!u) throw err(1396, `Operation ALTER USER failed for '${s.user}'@'${s.host}'`);
    return u;
  }

  createUser(p) {
    const ifNot = p.eat('IF', 'NOT', 'EXISTS');
    const list = [];
    do {
      const s = this.userSpec(p);
      let password = '';
      if (p.eat('IDENTIFIED')) {
        if (p.eat('WITH')) { p.name(true); }
        if (p.eat('BY')) {
          const t = p.cur;
          if (!t || t.t !== 'str') throw p.syntax();
          password = t.val;
          p.i++;
        }
      }
      list.push({ ...s, password });
    } while (p.eat(','));
    while (!p.done()) p.i++;
    if (this.account.user !== 'root' && !this.server.can(this.account, '*', 'CREATE USER')) throw err(1227, 'Access denied; you need (at least one of) the CREATE USER privilege(s) for this operation');
    for (const s of list) {
      if (this.server.users.some((x) => x.user === s.user && x.host === s.host)) {
        if (ifNot) continue;
        throw err(1396, `Operation CREATE USER failed for '${s.user}'@'${s.host}'`);
      }
      this.server.users.push({ user: s.user, host: s.host, password: s.password, grants: [] });
    }
    this.server.emit({ type: 'users' });
    return { affected: 0 };
  }

  privList(p) {
    const privs = [];
    for (;;) {
      if (p.eat('ALL')) { p.eat('PRIVILEGES'); privs.push('ALL PRIVILEGES'); } else {
        const words = [];
        while (p.cur && p.cur.t === 'id' && !['ON', 'TO', 'FROM'].includes(p.cur.u) && !(p.cur.v === ',')) { words.push(p.cur.u); p.i++; }
        if (!words.length) throw p.syntax();
        privs.push(words.join(' '));
        if (p.is('(')) p.group();
      }
      if (p.eat(',')) continue;
      return privs;
    }
  }

  privTarget(p) {
    let db = '*';
    let table = '*';
    p.eat('TABLE');
    if (p.eat('*')) {
      if (p.eat('.')) { p.expect('*'); } else db = this.db || '*';
    } else {
      const a = p.name(true);
      if (p.eat('.')) {
        db = a;
        if (!p.eat('*')) table = p.name(true);
      } else { db = this.db; table = a; }
    }
    return { db, table };
  }

  grant(p) {
    p.expect('GRANT');
    const privs = this.privList(p);
    p.expect('ON');
    const target = this.privTarget(p);
    p.expect('TO');
    const users = [];
    do users.push(this.userSpec(p)); while (p.eat(','));
    if (p.eat('IDENTIFIED', 'BY')) throw p.syntax();
    const grantOption = p.eat('WITH', 'GRANT', 'OPTION');
    p.end();
    if (!this.server.can(this.account, target.db, 'GRANT OPTION') && !this.account.grants.some((g) => g.grantOption)) {
      throw err(1044, `Access denied for user '${this.user}'@'${this.host}' to database '${target.db}'`);
    }
    for (const s of users) {
      const u = this.server.users.find((x) => x.user === s.user && x.host === s.host);
      if (!u) throw err(1410, 'You are not allowed to create a user with GRANT');
      let g = u.grants.find((x) => lc(x.db) === lc(target.db) && lc(x.table) === lc(target.table));
      if (!g) { g = { db: target.db, table: target.table, privs: [], grantOption: false }; u.grants.push(g); }
      for (const pr of privs) if (!g.privs.includes(pr)) g.privs.push(pr);
      if (grantOption) g.grantOption = true;
    }
    this.server.emit({ type: 'users' });
    return { affected: 0 };
  }

  revoke(p) {
    p.expect('REVOKE');
    const privs = this.privList(p);
    p.expect('ON');
    const target = this.privTarget(p);
    p.expect('FROM');
    const users = [];
    do users.push(this.userSpec(p)); while (p.eat(','));
    p.end();
    for (const s of users) {
      const u = this.server.users.find((x) => x.user === s.user && x.host === s.host);
      if (!u) throw err(1269, 'Can\'t revoke all privileges for one or more of the requested users');
      const g = u.grants.find((x) => lc(x.db) === lc(target.db) && lc(x.table) === lc(target.table));
      if (!g) throw err(1141, `There is no such grant defined for user '${s.user}' on host '${s.host}'`);
      g.privs = privs.includes('ALL PRIVILEGES') ? [] : g.privs.filter((x) => !privs.includes(x));
      if (!g.privs.length) u.grants.splice(u.grants.indexOf(g), 1);
    }
    this.server.emit({ type: 'users' });
    return { affected: 0 };
  }

  // ------------------------------------------------------------ dışa / içe aktarma

  /**
   * mysqldump biçiminde yedek üretir (Workbench Data Export → Self-Contained File).
   * opts: { tables?: string[], includeSchema: boolean, data: boolean, structure: boolean }
   */
  dump(dbName, opts = {}) {
    const ctx = this.ctx(dbName);
    const now = this.server.clock();
    const ver = this.server.version;
    const tables = (opts.tables || Object.keys(ctx.meta.tables)).map(lc).filter((t) => ctx.meta.tables[t] && !ctx.meta.tables[t].temporary).sort();
    const out = [];
    out.push(`-- MySQL dump 10.13  Distrib ${ver}, for Win64 (x86_64)`, '--', `-- Host: 127.0.0.1    Database: ${ctx.name}`, '-- ------------------------------------------------------', `-- Server version\t${ver}`, '');
    out.push('/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;', '/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;', '/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;', '/*!50503 SET NAMES utf8 */;',
      '/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;', '/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;', "/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;", '/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;', '');
    if (opts.includeSchema) {
      out.push('--', `-- Current Database: \`${ctx.name}\``, '--', '', `CREATE DATABASE /*!32312 IF NOT EXISTS*/ \`${ctx.name}\` /*!40100 DEFAULT CHARACTER SET ${ctx.meta.charset} COLLATE ${ctx.meta.collation} */ /*!80016 DEFAULT ENCRYPTION='N' */;`, '', `USE \`${ctx.name}\`;`, '');
    }
    for (const t of tables) {
      if (opts.structure !== false) {
        out.push('--', `-- Table structure for table \`${t}\``, '--', '', `DROP TABLE IF EXISTS \`${t}\`;`, '/*!40101 SET @saved_cs_client     = @@character_set_client */;', '/*!50503 SET character_set_client = utf8mb4 */;', this.showCreateTable(ctx, t) + ';', '/*!40101 SET character_set_client = @saved_cs_client */;', '');
      }
      if (opts.data !== false) {
        out.push('--', `-- Dumping data for table \`${t}\``, '--', '', `LOCK TABLES \`${t}\` WRITE;`, `/*!40000 ALTER TABLE \`${t}\` DISABLE KEYS */;`);
        const m = ctx.meta.tables[t];
        const r = ctx.sql.exec(`SELECT ${m.columns.map((c) => dq(c.name)).join(', ')} FROM ${dq(t)}`);
        const rows = r[0]?.values || [];
        if (rows.length) {
          const vals = rows.map((row) => '(' + row.map((v, i) => sqlLiteral(v, m.columns[i])).join(',') + ')');
          out.push(`INSERT INTO \`${t}\` VALUES ${vals.join(',')};`);
        }
        out.push(`/*!40000 ALTER TABLE \`${t}\` ENABLE KEYS */;`, 'UNLOCK TABLES;', '');
      }
      const trgs = Object.values(ctx.meta.triggers || {}).filter((x) => x.table === t);
      if (trgs.length && opts.triggers !== false && opts.structure !== false) {
        for (const tg of trgs) {
          const [u, h] = tg.definer.split('@');
          out.push('DELIMITER ;;', `/*!50003 CREATE*/ /*!50017 DEFINER=\`${u}\`@\`${h}\`*/ /*!50003 TRIGGER \`${tg.name}\` ${tg.timing} ${tg.event} ON \`${t}\` FOR EACH ROW ${tg.body} */;;`, 'DELIMITER ;');
        }
        out.push('');
      }
    }
    const routines = [...Object.values(ctx.meta.procedures || {}), ...Object.values(ctx.meta.functions || {})];
    if (opts.routines && routines.length) {
      out.push('--', `-- Dumping routines for database '${ctx.name}'`, '--');
      for (const r of routines) {
        out.push(`/*!50003 DROP ${r.type} IF EXISTS \`${r.name}\` */;`, 'DELIMITER ;;', this.routineCreateSql(r) + ' ;;', 'DELIMITER ;');
      }
      out.push('');
    }
    for (const v of Object.values(ctx.meta.views)) {
      if (opts.tables && !opts.tables.map(lc).includes(v.name)) continue;
      out.push('--', `-- Final view structure for view \`${v.name}\``, '--', '', `DROP VIEW IF EXISTS \`${v.name}\`;`, `CREATE VIEW \`${v.name}\` AS ${v.select};`, '');
    }
    out.push('/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;', '/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;', '/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;', '/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;', '/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;', '/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;', '/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;', '');
    const pad = (n) => String(n).padStart(2, '0');
    out.push(`-- Dump completed on ${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`, '');
    return out.join('\n');
  }
}

// ---------------------------------------------------------------- yardımcılar

function litValue(t, t2) {
  if (!t) return undefined;
  if (t.t === 'str') return t.val;
  if (t.t === 'num') return t.val;
  if (t.t === 'op' && t.v === '-' && t2 && t2.t === 'num') return -t2.val;
  if (t.t === 'id' && t.u === 'NULL') return null;
  if (t.t === 'id' && t.u === 'TRUE') return 1;
  if (t.t === 'id' && t.u === 'FALSE') return 0;
  return undefined;
}

function outOfRange(def, v) {
  if (!def) return false;
  if (def.type in INT_TYPES && INT_TYPES[def.type]) {
    const [lo, hi, uhi] = INT_TYPES[def.type];
    return def.unsigned ? v < 0 || v > uhi : v < lo || v > hi;
  }
  if (def.type === 'decimal') return Math.abs(v) >= 10 ** ((def.len ?? 10) - (def.scale ?? 0)) || (def.unsigned && v < 0);
  return def.unsigned && v < 0;
}

function isValidTemporal(type, v) {
  if (type === 'date') return !!normDate(v);
  if (type === 'time') return !!normTime(v);
  return !!normDateTime(v);
}

function defaultValid(c, v) {
  if (isIntType(c.type) || c.type === 'decimal' || c.type === 'float' || c.type === 'double') {
    const n = typeof v === 'number' ? v : Number(v);
    if (!Number.isFinite(n)) return false;
    if (isIntType(c.type) && !Number.isInteger(n)) return true;
    return !outOfRange(c, n);
  }
  if (c.type === 'date' || c.type === 'datetime' || c.type === 'timestamp' || c.type === 'time') return isValidTemporal(c.type, v);
  if (c.type === 'enum') return c.values.some((x) => fold(x) === fold(String(v)));
  if ((c.type === 'varchar' || c.type === 'char') && c.len) return [...String(v)].length <= c.len;
  return true;
}

function likeMatch2(pattern, v) {
  return likeMatch(pattern, v) === 1;
}

/** dump için MySQL değer sabiti */
export function sqlLiteral(v, col) {
  if (v == null) return 'NULL';
  if (v instanceof Uint8Array) return v.length ? '0x' + [...v].map((b) => b.toString(16).padStart(2, '0')).join('') : "''";
  if (typeof v === 'number') return displayValue(v, col && col.zerofill ? { ...col, zerofill: false } : col);
  return mysqlString(v);
}

/** Hata iletisi için: f( ... ) çağrısındaki argüman sayısı */
function argCount(toks, name, expected) {
  const counts = [];
  toks.forEach((t0, i) => {
    if (!(t0.t === 'id' && lc(t0.v) === lc(name) && toks[i + 1]?.v === '(')) return;
    let depth = 0;
    let n = 0;
    for (let k = i + 2; k < toks.length; k++) {
      const t = toks[k];
      if (t.t === 'op' && t.v === '(') depth++;
      else if (t.t === 'op' && t.v === ')') { if (depth === 0) { counts.push(n + (k > i + 2 ? 1 : 0)); return; } depth--; } else if (t.t === 'op' && t.v === ',' && depth === 0) n++;
    }
  });
  return counts.find((c) => c !== expected) ?? counts[0] ?? 0;
}

installRoutines(Session, MySqlServer, { err, MySqlError, dq, sq, lc, sig, Parser, syntaxError, isIntType, isTextType });
