// Laboratuvar durumu: MySQL sunucusu, sanal dosyalar, kurulum bilgileri ve sunucuya kayıt.
import { api } from '../js/api.js';
import { MySqlServer, VERSIONS } from './mysql/engine.js';

export const USER_HOME = 'C:/Users/Ogrenci';
export const DOCS = USER_HOME + '/Documents';
export const DESKTOP = USER_HOME + '/Desktop';
export const DOWNLOADS = USER_HOME + '/Downloads';

export function toBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromBase64(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function defaultState() {
  return {
    v: 1,
    mode: 'book', // 'book': kitaptaki sürümler, 'new': güncel sürümler
    taskMode: true,
    install: {
      mysql: false, // MySQL Server kurulu mu
      workbench: false,
      shell: false,
      configured: false,
      serviceName: 'MySQL80',
      autoStart: true,
      products: [],
      vs: false,
    },
    server: null,
    connections: [],
    prefs: { safeUpdates: true, limitRows: 1000, stopOnError: true },
    files: {},
    queryTabs: {},
    seen: {},
  };
}

/** Uygulama kurulmadan doğrudan kullanım için (serbest mod "hazır kur" seçeneği) */
export function installEverything(state, server, rootPassword) {
  const v = state.mode === 'new' ? VERSIONS.new : VERSIONS.book;
  server.version = v;
  server.running = true;
  server.setRootPassword(rootPassword);
  Object.assign(state.install, { mysql: true, workbench: true, shell: true, configured: true, products: state.mode === 'new' ? ['server', 'workbench'] : ['server', 'workbench', 'shell', 'router', 'connector-net', 'samples'] });
  if (!state.connections.length) state.connections.push(defaultConnection(state));
}

export function defaultConnection(state) {
  return { id: 'local', name: `Local instance ${state.install.serviceName || 'MySQL80'}`, host: 'localhost', port: 3306, user: 'root', password: null, schema: '' };
}

export class LabStore {
  /** opts.mergeState: durum kaydedilirken sunucudaki güncel durum alınıp yalnızca MySQL kullanıcıları güncellenir (Stüdyo). */
  constructor(SQL, user, opts = {}) {
    this.SQL = SQL;
    this.user = user;
    this.mergeState = !!opts.mergeState;
    this.state = defaultState();
    this.server = new MySqlServer(SQL, {});
    this.dirtyDbs = new Set();
    this.deletedDbs = new Set();
    this.stateDirty = false;
    this.timer = null;
    this.saving = null;
    this.listeners = new Set();
    this.server.on((ev) => this.onServerEvent(ev));
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  /** Aynı tarayıcıdaki diğer sekmelerle (Stüdyo ↔ Laboratuvar) veritabanı değişikliklerini eşitler. */
  enableSync() {
    if (typeof BroadcastChannel === 'undefined' || this.channel) return;
    this.instance = Math.random().toString(36).slice(2);
    this.channel = new BroadcastChannel('csharp-ders-lab');
    this.channel.onmessage = async (ev) => {
      const m = ev.data;
      if (!m || m.from === this.instance) return;
      if (m.type === 'dbs') {
        for (const name of m.deleted || []) if (this.server.hasDb(name) && !this.dirtyDbs.has(name)) this.server.dropDatabase(name);
        for (const name of m.dbs || []) {
          if (this.dirtyDbs.has(name)) continue;
          try {
            const d = await api.labDatabase(name);
            this.server.loadDatabase(d.name, fromBase64(d.data));
          } catch (e) { console.error(e); }
        }
        this.emit({ type: 'reload', dbs: m.dbs || [] });
      } else if (m.type === 'state') {
        try {
          const r = await api.labState();
          if (r.state) {
            Object.assign(this.state.install, r.state.install || {});
            if (r.state.server) this.server.importState(r.state.server);
            // başka sekmede eklenen dosyalar (ör. Stüdyo'nun ürettiği setup.exe)
            for (const [p, f] of Object.entries(r.state.files || {})) if (!this.state.files[p] || this.state.files[p].mtime < f.mtime) this.state.files[p] = f;
            this.emit({ type: 'reload', dbs: [] });
            this.emit({ type: 'files' });
          }
        } catch (e) { console.error(e); }
      }
    };
  }
  emit(ev) { for (const fn of this.listeners) { try { fn(ev); } catch (e) { console.error(e); } } }

  async load() {
    const r = await api.labState();
    if (r.state) this.state = Object.assign(defaultState(), r.state, { install: Object.assign(defaultState().install, r.state.install || {}) });
    this.state.prefs = Object.assign(defaultState().prefs, this.state.prefs || {});
    // Eski sürümde PHP boş nesneleri diziye çeviriyordu: düzelt
    for (const k of ['files', 'queryTabs', 'seen']) if (!this.state[k] || Array.isArray(this.state[k])) this.state[k] = {};
    if (this.state.server) this.server.importState(this.state.server);
    const list = r.databases || [];
    const loaded = await Promise.all(list.map((d) => api.labDatabase(d.name).then((x) => x, () => null)));
    for (const d of loaded) {
      if (!d) continue;
      try {
        this.server.loadDatabase(d.name, fromBase64(d.data));
      } catch (e) {
        console.error('Veritabanı açılamadı', d.name, e);
      }
    }
    this.serverEventsMuted = false;
  }

  onServerEvent(ev) {
    if (ev.type === 'change') {
      this.dirtyDbs.add(ev.db);
      this.deletedDbs.delete(ev.db);
    } else if (ev.type === 'drop') {
      this.dirtyDbs.delete(ev.db);
      this.deletedDbs.add(ev.db);
    } else if (ev.type === 'users' || ev.type === 'running') {
      this.stateDirty = true;
    }
    this.schedule();
    this.emit(ev);
  }

  /** Durum değişti: kaydı planla */
  touch() {
    this.stateDirty = true;
    this.schedule();
    this.emit({ type: 'state' });
  }

  schedule(ms = 1500) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), ms);
  }

  get pending() { return this.stateDirty || this.dirtyDbs.size > 0 || this.deletedDbs.size > 0; }

  async flush(opts = {}) {
    clearTimeout(this.timer);
    if (this.saving) { await this.saving; if (!this.pending) return; }
    this.saving = this.doFlush(opts).finally(() => { this.saving = null; });
    return this.saving;
  }

  async doFlush(opts) {
    const dbs = [...this.dirtyDbs];
    const del = [...this.deletedDbs];
    const st = this.stateDirty;
    this.dirtyDbs.clear();
    this.deletedDbs.clear();
    this.stateDirty = false;
    try {
      for (const name of del) await api.deleteLabDatabase(name);
      for (const name of dbs) {
        if (!this.server.hasDb(name)) continue;
        const bytes = this.server.exportDatabase(name);
        await api.saveLabDatabase(name, toBase64(bytes), opts);
      }
      if (st || dbs.length || del.length) {
        this.state.server = this.server.exportState();
        if (this.mergeState) {
          const cur = (await api.labState()).state || this.state;
          cur.server = this.state.server;
          await api.saveLabState(cur, opts);
        } else await api.saveLabState(this.state, opts);
        if (st && this.channel) this.channel.postMessage({ type: 'state', from: this.instance });
      }
      this.emit({ type: 'saved', dbs, deleted: del });
      if ((dbs.length || del.length) && this.channel) this.channel.postMessage({ type: 'dbs', dbs, deleted: del, from: this.instance });
    } catch (e) {
      for (const n of dbs) this.dirtyDbs.add(n);
      for (const n of del) this.deletedDbs.add(n);
      if (st) this.stateDirty = true;
      this.emit({ type: 'save-error', error: e });
      if (e.status !== 413) this.schedule(10000);
      throw e;
    }
  }

  /** Başka bir sayfadan (Stüdyo) laboratuvar dosyası yazar: sunucudaki güncel durum alınır, dosyalar eklenir. */
  async mergeFiles(files) {
    const r = await api.labState();
    const st = r.state || defaultState();
    if (!st.files || Array.isArray(st.files)) st.files = {};
    for (const [p, f] of Object.entries(files)) st.files[this.norm(p)] = { content: f.content, mtime: Date.now(), kind: f.kind || 'text' };
    await api.saveLabState(st);
    Object.assign(this.state.files, st.files);
    if (this.channel) this.channel.postMessage({ type: 'state', from: this.instance });
  }

  // ---- sanal dosya sistemi

  norm(path) { return String(path).replace(/\\/g, '/').replace(/\/+/g, '/'); }

  writeFile(path, content, kind) {
    this.state.files[this.norm(path)] = { content, mtime: Date.now(), kind: kind || 'text' };
    this.touch();
    this.emit({ type: 'files' });
  }

  readFile(path) { return this.state.files[this.norm(path)]?.content ?? null; }
  exists(path) { return !!this.state.files[this.norm(path)]; }
  deleteFile(path) { delete this.state.files[this.norm(path)]; this.touch(); this.emit({ type: 'files' }); }

  /** Klasördeki dosyalar ve alt klasörler */
  list(dir) {
    dir = this.norm(dir).replace(/\/$/, '');
    const files = [];
    const dirs = new Set();
    for (const [p, f] of Object.entries(this.state.files)) {
      if (!p.startsWith(dir + '/')) continue;
      const rest = p.slice(dir.length + 1);
      const i = rest.indexOf('/');
      if (i < 0) files.push({ name: rest, path: p, ...f });
      else dirs.add(rest.slice(0, i));
    }
    return { files: files.sort((a, b) => a.name.localeCompare(b.name, 'tr')), dirs: [...dirs].sort() };
  }
}
