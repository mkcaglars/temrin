// C# programlarının (MySql.Data) laboratuvardaki MySQL simülatörüne bağlanmasını sağlar.
// Öğrencinin laboratuvar veritabanları sunucudan yüklenir; programın yaptığı değişiklikler geri kaydedilir.
import { LabStore } from '../lab/store.js';
import { tokenize } from '../lab/mysql/lexer.js';

let state = null; // { store, server, sessions: Map }
let loading = null;
let nextId = 1;

/** Simülatörü (sql.js + kullanıcının veritabanları) yükler. */
export function ensureMysql(user) {
  if (state) return Promise.resolve(state);
  if (loading) return loading;
  loading = (async () => {
    if (!window.initSqlJs) throw new Error('sql.js yüklenemedi');
    const SQL = await window.initSqlJs({ locateFile: (f) => 'lib/sqljs/' + f });
    const store = new LabStore(SQL, user, { mergeState: true });
    await store.load();
    store.enableSync();
    state = { store, server: store.server, sessions: new Map() };
    return state;
  })();
  loading.catch(() => { loading = null; });
  return loading;
}

/** Laboratuvar sayfası: köprüyü laboratuvarın kendi sunucusuna bağlar */
export function attachMysql(store) {
  if (state?.store === store) return;
  state = { store, server: store.server, sessions: new Map() };
}

export function mysqlReady() { return !!state; }
export function mysqlStore() { return state?.store || null; }

const err = (code, message, state2 = 'HY000') => JSON.stringify({ error: { code, message, state: state2 } });

function parseCs(cs) {
  const o = {};
  for (const part of String(cs || '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim().toLowerCase().replace(/\s+/g, '');
    o[k] = part.slice(i + 1).trim();
  }
  const pick = (...keys) => { for (const k of keys) if (o[k] !== undefined) return o[k]; return undefined; };
  return {
    host: pick('server', 'host', 'datasource', 'address', 'addr', 'networkaddress') ?? 'localhost',
    port: Number(pick('port') ?? 3306),
    database: pick('database', 'initialcatalog') ?? '',
    user: pick('uid', 'userid', 'username', 'user') ?? '',
    password: pick('pwd', 'password') ?? '',
  };
}

function literal(p) {
  if (p.kind === 'null' || p.value == null) return 'NULL';
  if (p.kind === 'num') return p.value;
  if (p.kind === 'bool') return p.value;
  if (p.kind === 'bytes') {
    const s = atob(p.value);
    let hex = '';
    for (let i = 0; i < s.length; i++) hex += s.charCodeAt(i).toString(16).padStart(2, '0');
    return hex ? `X'${hex}'` : "''";
  }
  return "'" + String(p.value).replace(/\\/g, '\\\\').replace(/'/g, "''") + "'";
}

/** @ad / ?ad parametrelerini değerleriyle değiştirir (MySql.Data istemci tarafında yapar). */
function bindParams(sql, params) {
  if (!params?.length && !/[@?]/.test(sql)) return sql;
  const map = new Map((params || []).map((p) => [p.name, p]));
  const toks = tokenize(sql);
  let out = '';
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.t === 'var' && !t.v.startsWith('@@')) {
      const name = t.v.slice(1).replace(/[`'"]/g, '').toLowerCase();
      // CommandType.StoredProcedure için bağlayıcının kullandığı iç oturum değişkenleri
      if (name.startsWith('_cnet_') && !map.has(name)) { out += t.v; continue; }
      if (!map.has(name)) throw Object.assign(new Error(`Parameter '${t.v}' must be defined.`), { code: 0 });
      out += literal(map.get(name));
      continue;
    }
    if (t.t === 'op' && t.v === '?' && toks[i + 1]?.t === 'id' && map.has(toks[i + 1].v.toLowerCase())) {
      out += literal(map.get(toks[i + 1].v.toLowerCase()));
      i++;
      continue;
    }
    out += t.v;
  }
  return out;
}

function encodeValue(v, col) {
  if (v == null) return null;
  if (v instanceof Uint8Array) {
    let s = '';
    for (let i = 0; i < v.length; i += 0x8000) s += String.fromCharCode.apply(null, v.subarray(i, i + 0x8000));
    return btoa(s);
  }
  if (col && (col.type === 'date' || col.type === 'datetime' || col.type === 'timestamp' || col.type === 'time')) return String(v);
  return v;
}

/** Motorun (C#) eşzamanlı çağrısı: op = open | close | use | exec */
export function sqlCall(op, json) {
  let a;
  try { a = JSON.parse(json || '{}'); } catch { return err(0, 'Geçersiz istek'); }
  if (!state) {
    return err(1042, 'Unable to connect to any of the specified MySQL hosts. (MySQL simülatörü henüz hazır değil: laboratuvar verileri yükleniyor, programı birkaç saniye sonra yeniden başlatın.)');
  }
  const { server, store, sessions } = state;
  try {
    if (op === 'open') {
      const c = parseCs(a.cs);
      const hostOk = ['localhost', '127.0.0.1', '.', '::1'].includes(String(c.host).toLowerCase());
      if (!store.state.install.mysql || !hostOk || c.port !== 3306 || !server.running) {
        return err(1042, 'Unable to connect to any of the specified MySQL hosts.' + (!store.state.install.mysql ? ' (Laboratuvarda MySQL Server henüz kurulmamış.)' : !server.running ? ' (MySQL hizmeti durdurulmuş.)' : ''));
      }
      let s;
      try {
        s = server.connect(c.user, c.password, 'localhost');
      } catch (e) {
        if (e.code === 1045) return err(1045, `Authentication to host '${c.host}' for user '${c.user}' using method 'caching_sha2_password' failed with message: ${e.message}`, '28000');
        throw e;
      }
      if (c.database) s.use(c.database);
      const id = nextId++;
      sessions.set(id, s);
      return JSON.stringify({ id, version: server.version, database: s.db || '' });
    }
    const s = sessions.get(a.id);
    if (op === 'close') {
      if (s) { s.close(); sessions.delete(a.id); }
      return '{}';
    }
    if (!s) return JSON.stringify({ error: { code: 0, message: 'Connection must be valid and open.', kind: 'invalid' } });
    if (op === 'routine') {
      // CommandType.StoredProcedure: yordamın parametre listesi
      const raw = String(a.name || '');
      const dot = raw.indexOf('.');
      const dbName = dot > 0 ? raw.slice(0, dot).replace(/`/g, '') : s.db;
      const name = (dot > 0 ? raw.slice(dot + 1) : raw).replace(/`/g, '').toLowerCase();
      const ctx = dbName ? server.getDb(dbName) : null;
      if (!ctx) return err(1046, 'No database selected', '3D000');
      const r = ctx.meta.procedures?.[name];
      if (!r) return err(1305, `PROCEDURE ${ctx.name}.${name} does not exist`, '42000');
      return JSON.stringify({ name: `\`${ctx.name}\`.\`${r.name}\``, params: r.params.map((p) => ({ name: p.name, mode: p.mode })) });
    }
    if (op === 'schema') {
      const ctx = s.db ? server.getDb(s.db) : null;
      const m = ctx?.meta.tables[String(a.table || '').toLowerCase()];
      if (!m) return JSON.stringify({ pk: [], fks: [] });
      return JSON.stringify({ pk: m.pk, fks: m.fks.map((f) => ({ name: f.name, cols: f.cols, refTable: f.refTable, refCols: f.refCols })) });
    }
    if (op === 'use') {
      s.use(a.db);
      return '{}';
    }
    if (op === 'exec') {
      const sql = bindParams(a.sql, a.params);
      const results = s.execute(sql, { stopOnError: true });
      const out = [];
      let insertId;
      for (const r of results) {
        if (!r.ok) return err(r.error.code, r.error.message, r.error.state);
        if (r.rows) {
          out.push({
            columns: r.columns.map((c) => ({ name: c.name, type: c.type, len: c.len, scale: c.scale, unsigned: !!c.unsigned, table: c.table, column: c.column, pk: !!c.pk, autoInc: !!c.autoInc, notNull: !!c.notNull })),
            rows: r.rows.map((row) => row.map((v, i) => encodeValue(v, r.columns[i]))),
          });
        } else {
          out.push({ affected: r.affected, insertId: r.insertId });
          if (r.insertId != null) insertId = r.insertId;
        }
      }
      return JSON.stringify({ results: out, insertId });
    }
    return err(0, 'Bilinmeyen işlem: ' + op);
  } catch (e) {
    return err(e.code ?? 0, e.message, e.state);
  }
}
