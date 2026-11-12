// Görev modu: kitaptaki ve öğretmenin yazdığı görevler, adımların otomatik denetimi,
// öğretmen için görev yazma, sınıf ilerlemesi ve veritabanı dağıtımı.
import { h, toast } from '../js/ui.js';
import { api } from '../js/api.js';
import { ICONS } from './icons.js';
import { Session } from './mysql/engine.js';
import { DOWNLOADS, DOCS } from './store.js';
import { BOOK_TASKS } from './booktasks.js';

const lc = (s) => String(s ?? '').toLowerCase();

// ---------------------------------------------------------------- denetim türleri (öğretmen düzenleyicisi için)

export const CHECK_TYPES = {
  installed: { label: 'MySQL kurulu ve yapılandırılmış', params: [] },
  workbench: { label: 'Workbench kurulu', params: [] },
  service_running: { label: 'MySQL hizmeti çalışıyor', params: [] },
  connected: { label: 'Workbench ile sunucuya bağlandı', params: [] },
  db_exists: { label: 'Veritabanı var', params: [['db', 'Veritabanı']] },
  db_not_exists: { label: 'Veritabanı yok (silindi)', params: [['db', 'Veritabanı']] },
  table_exists: { label: 'Tablo var', params: [['db', 'Veritabanı'], ['table', 'Tablo']] },
  column: { label: 'Sütun var (tür/özellik)', params: [['db', 'Veritabanı'], ['table', 'Tablo'], ['column', 'Sütun'], ['columnType', 'Tür (ör. int, varchar, decimal(7,2)) — boş: önemsiz'], ['flags', 'Özellikler: pk, nn, ai, uq, null (virgülle)']] },
  columns_min: { label: 'Tabloda en az N sütun', params: [['db', 'Veritabanı'], ['table', 'Tablo'], ['count', 'N']] },
  row_count: { label: 'Tablodaki kayıt sayısı', params: [['db', 'Veritabanı'], ['table', 'Tablo'], ['min', 'En az'], ['max', 'En çok (boş: sınırsız)']] },
  fk_exists: { label: 'Yabancı anahtar (ilişki) var', params: [['db', 'Veritabanı'], ['table', 'Tablo (FK olan)'], ['ref', 'Başvurulan tablo']] },
  sql_true: { label: 'Denetim sorgusu doğru döner', params: [['db', 'Veritabanı'], ['sql', 'SELECT … (ilk hücre 0 değilse geçer)']] },
  query_result: { label: 'Öğrencinin SELECT sonucu beklenenle aynı', params: [['db', 'Veritabanı'], ['sql', 'Beklenen sonucu veren SELECT'], ['mention', 'Sorguda geçmesi gereken sözcük (isteğe bağlı)'], ['ordered', 'Sıra önemli mi? (evet/hayır)']] },
  query_matches: { label: 'Şu kalıba uyan komut başarıyla çalıştırıldı', params: [['pattern', 'Düzenli ifade (ör. ^\\s*insert\\s+into\\s+personel)'], ['minAffected', 'En az etkilenen satır (isteğe bağlı)']] },
  error_seen: { label: 'Şu hata kodu alındı', params: [['code', 'Hata kodu (ör. 1175)']] },
  export_file: { label: 'Yedek (.sql) dosyası alındı', params: [['db', 'Veritabanı'], ['table', 'Tablo (isteğe bağlı)']] },
  import_done: { label: 'Yedek geri yüklendi (tablo başka veritabanında var)', params: [['table', 'Tablo'], ['notDb', 'Kaynak veritabanı (bunun dışında olmalı)']] },
  user_exists: { label: 'MySQL kullanıcısı var', params: [['user', 'Kullanıcı adı']] },
  safe_updates_off: { label: 'Safe Updates kapalı', params: [] },
};

// ---------------------------------------------------------------- denetleyici

export class TaskEngine {
  constructor(lab) {
    this.lab = lab;
    this.flags = new Set(); // bu oturumda görülen olaylar
    this.queries = []; // son çalıştırılan komutlar
  }

  record(type, data) {
    if (type === 'query') {
      const r = data.result;
      this.queries.push({ sql: r.sql, ok: r.ok, rows: r.rows, columns: r.columns, affected: r.affected, code: r.error?.code, db: r.db ?? data.session?.db, at: Date.now() });
      if (this.queries.length > 200) this.queries.shift();
      if (!r.ok) this.flags.add('error:' + r.error.code);
    } else if (type === 'connect' && data.ok) this.flags.add('connected');
    else if (type === 'installer-check' && data.ok) this.flags.add('installer-check');
    else if (type === 'cli-login' && data.ok) this.flags.add('cli-login');
    else if (type === 'admin') this.flags.add('admin:' + data.page);
    else if (type === 'export') { this.flags.add('export'); this.lastExport = data; } else if (type === 'import' && data.ok) this.flags.add('import');
  }

  rootSession() {
    const server = this.lab.server;
    const root = server.users.find((u) => u.user === 'root' && u.host === 'localhost') || server.users[0];
    const s = new Session(server, root, 'localhost');
    s.close();
    return s;
  }

  meta(db, table) {
    const ctx = this.lab.server.getDb(db);
    return table ? ctx?.meta.tables[lc(table)] : ctx;
  }

  /** Tek denetim: true/false */
  check(c, progress) {
    const { server, store } = this.lab;
    const flags = new Set([...this.flags, ...(progress.flags || [])]);
    switch (c.type) {
      case 'any': return (c.any || []).some((x) => this.check(x, progress));
      case 'all': return (c.all || []).every((x) => this.check(x, progress));
      case 'installed': return !!(store.state.install.mysql && store.state.install.configured);
      case 'workbench': return !!store.state.install.workbench;
      case 'products': return (c.products || []).every((p) => store.state.install.products.includes(p));
      case 'service_running': return store.state.install.mysql && server.running;
      case 'connected': return flags.has('connected');
      case 'flag': return flags.has(c.flag);
      case 'download': return Object.entries(store.state.files).some(([p, f]) => p.startsWith(DOWNLOADS + '/') && (c.kinds || []).some((k) => f.content === 'MSI:' + k));
      case 'saved_password': return store.state.connections.some((x) => x.password != null);
      case 'db_exists': return server.hasDb(c.db);
      case 'db_not_exists': return !server.hasDb(c.db);
      case 'table_exists': return !!this.meta(c.db, c.table);
      case 'tables_exist': return (c.tables || []).every((t) => this.meta(c.db, t));
      case 'columns_min': { const m = this.meta(c.db, c.table); return !!m && m.columns.length >= Number(c.count || 0); }
      case 'has_type': { const m = this.meta(c.db, c.table); return !!m && m.columns.some((x) => x.type === c.colType); }
      case 'column': {
        const m = this.meta(c.db, c.table);
        if (!m) return false;
        const col = m.columns.find((x) => lc(x.name) === lc(c.column));
        if (!col) return false;
        if (c.columnType) {
          const want = lc(c.columnType).replace(/\s+/g, '');
          const fam = { integer: 'int' }[want] || want;
          const m2 = /^(\w+)(?:\((\d+)(?:,(\d+))?\))?$/.exec(fam);
          if (m2) {
            if (m2[1] !== col.type && !(m2[1] === 'int' && col.type === 'int')) return false;
            if (m2[2] != null && Number(m2[2]) !== Number(col.len)) return false;
            if (m2[3] != null && Number(m2[3]) !== Number(col.scale)) return false;
          }
        }
        const flagsWant = String(c.flags || '').split(/[,\s]+/).filter(Boolean).map(lc);
        const isPk = m.pk.some((x) => lc(x) === lc(col.name));
        for (const f of flagsWant) {
          if (f === 'pk' && !isPk) return false;
          if (f === 'ai' && !col.autoInc) return false;
          if (f === 'nn' && !(col.notNull || isPk)) return false;
          if (f === 'null' && (col.notNull || isPk)) return false;
          if (f === 'uq' && !m.uniques.some((u) => u.cols.length === 1 && lc(u.cols[0]) === lc(col.name))) return false;
        }
        return true;
      }
      case 'row_count': {
        const m = this.meta(c.db, c.table);
        if (!m) return false;
        const n = this.meta(c.db).sql.exec(`SELECT count(*) FROM "${m.name}"`)[0].values[0][0];
        return n >= Number(c.min || 0) && (c.max === undefined || c.max === '' || n <= Number(c.max));
      }
      case 'fk_exists': {
        const m = this.meta(c.db, c.table);
        return !!m && m.fks.some((f) => !c.ref || lc(f.refTable) === lc(c.ref));
      }
      case 'sql_true': {
        if (!server.hasDb(c.db)) return false;
        try {
          const s = this.rootSession();
          s.use(c.db);
          const r = s.execute(c.sql)[0];
          const v = r.ok && r.rows?.[0]?.[0];
          return !!v && v !== '0';
        } catch { return false; }
      }
      case 'query_result': return this.checkQueryResult(c);
      case 'query_matches': {
        let re;
        try { re = new RegExp(c.pattern, 'i'); } catch { return false; }
        return this.queries.some((q) => q.ok && re.test(q.sql.replace(/\s+/g, ' ').trim()) && (!c.minAffected || q.affected >= Number(c.minAffected))) || (progress.flags || []).includes('qm:' + c.pattern);
      }
      case 'error_seen': return flags.has('error:' + c.code);
      case 'prefs_safe_off': case 'safe_updates_off': return !store.state.prefs.safeUpdates;
      case 'export_file': {
        return Object.entries(store.state.files).some(([p, f]) => p.toLowerCase().endsWith('.sql') && p.startsWith(DOCS) && /-- MySQL dump/.test(f.content || '') && (!c.db || new RegExp(`Database: ${c.db}\\b|USE \`${c.db}\``, 'i').test(f.content)) && (!c.table || f.content.includes(`CREATE TABLE \`${lc(c.table)}\``) || f.content.includes(`INSERT INTO \`${lc(c.table)}\``)));
      }
      case 'import_done': {
        if (!flags.has('import')) return false;
        return server.databaseNames().some((d) => d !== lc(c.notDb) && server.getDb(d).meta.tables[lc(c.table)]);
      }
      case 'user_exists': return server.users.some((u) => lc(u.user) === lc(c.user));
      default: return false;
    }
  }

  checkQueryResult(c) {
    if (!this.lab.server.hasDb(c.db)) return false;
    let expected;
    try {
      const s = this.rootSession();
      s.use(c.db);
      expected = s.execute(c.sql)[0];
    } catch { return false; }
    if (!expected?.ok) return false;
    const mention = c.mention ? new RegExp(c.mention, 'i') : null;
    const ordered = /^(e|evet|true|1|yes)$/i.test(String(c.ordered || ''));
    const norm = (v) => (v == null ? 'NULL' : typeof v === 'number' ? String(Number(v.toPrecision(12))) : String(v));
    return this.queries.some((q) => {
      if (!q.ok || !q.rows || (q.db && q.db !== lc(c.db))) return false;
      if (mention && !mention.test(q.sql)) return false;
      if (q.rows.length !== expected.rows.length) return false;
      // ilk beklenen sütun öğrencinin sonucunda varsa onu, yoksa tüm satırları karşılaştır
      const key = expected.columns[0].name;
      const ki = q.columns.findIndex((x) => lc(x.name) === lc(key));
      const a = ki >= 0 ? q.rows.map((r) => norm(r[ki])) : q.rows.map((r) => r.map(norm).join('|'));
      const b = ki >= 0 ? expected.rows.map((r) => norm(r[0])) : expected.rows.map((r) => r.map(norm).join('|'));
      if (ordered) return a.join('\n') === b.join('\n');
      return a.slice().sort().join('\n') === b.slice().sort().join('\n');
    });
  }
}

// ---------------------------------------------------------------- panel

export class TaskPanel {
  constructor(lab) {
    this.lab = lab;
    this.engine = new TaskEngine(lab);
    this.tasks = [];
    this.progress = {};
    this.openKey = null;
    this.el = h('div', { class: 'tp hidden' });
    lab.desk.el.appendChild(this.el);
    this.btn = h('button', { class: 'lab-tray-btn', title: 'Görevler', html: ICONS.tasks, onclick: () => this.toggle() });
    lab.desk.tray.prepend(this.btn);
    lab.events.on('*', (type, data) => { this.engine.record(type, data); this.schedule(); });
    lab.store.on((ev) => { if (['change', 'drop', 'state', 'files', 'users', 'running'].includes(ev.type)) this.schedule(); });
    this.load();
  }

  get isTeacher() { return this.lab.user.role === 'ogretmen'; }

  async load() {
    try {
      const r = await api.labTasks();
      this.teacherTasks = (r.tasks || []).map((t) => ({ key: 't' + t.id, id: t.id, title: t.title, sinif: t.sinif, active: t.active, author: t.author, ...(t.data || {}) }));
      this.progress = r.progress || {};
    } catch (e) {
      this.teacherTasks = [];
      console.error(e);
    }
    this.tasks = [...BOOK_TASKS, ...this.teacherTasks.filter((t) => this.isTeacher || t.active)];
    if (this.lab.store.state.taskMode) this.toggle(true);
    this.evaluate();
  }

  toggle(force) {
    const show = force ?? this.el.classList.contains('hidden');
    this.el.classList.toggle('hidden', !show);
    if (show) this.render();
  }

  schedule() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.evaluate(), 300);
  }

  /** Her görevin sıradaki adımını denetler; tamamlananları kaydeder */
  evaluate() {
    let changed = false;
    for (const t of this.tasks) {
      const p = this.progress[t.key] ??= { data: { done: [], flags: [] }, done: false };
      p.data ??= { done: [], flags: [] };
      p.data.done ??= [];
      if (!p.data.at || Array.isArray(p.data.at)) p.data.at = {};
      let advanced = false;
      for (const st of t.steps) {
        if (p.data.done.includes(st.id)) continue;
        const ok = (st.checks || []).length > 0 && st.checks.every((c) => {
          try { return this.engine.check(c, p.data); } catch (e) { console.error(e); return false; }
        });
        if (!ok) break;
        p.data.done.push(st.id);
        p.data.at ??= {};
        p.data.at[st.id] = new Date().toISOString();
        advanced = true;
      }
      if (advanced) {
        changed = true;
        p.done = t.steps.every((s) => p.data.done.includes(s.id));
        this.save(t, p);
        const last = t.steps.filter((s) => p.data.done.includes(s.id)).pop();
        if (last) toast(`✔ ${t.title}: ${last.title}`, 'success', 3000);
        if (p.done) toast(`🎉 "${t.title}" görevi tamamlandı!`, 'success', 5000);
      }
    }
    if (changed || !this.el.classList.contains('hidden')) this.render();
  }

  save(t, p) {
    api.saveLabProgress(t.key, p.data, p.done).catch((e) => console.error('ilerleme kaydedilemedi', e));
  }

  render() {
    if (this.el.classList.contains('hidden')) return;
    const scroll = this.el.querySelector('.tp-body')?.scrollTop || 0;
    this.el.innerHTML = '';
    const head = h('div', { class: 'tp-head' }, h('span', { html: ICONS.tasks }), h('b', {}, 'Görevler'), h('div', { class: 'spacer' }),
      this.isTeacher ? h('button', { class: 'tp-mini', title: 'Görev yönetimi ve sınıf ilerlemesi', onclick: () => openTeacher(this) }, 'Öğretmen') : null,
      h('button', { class: 'tp-mini', title: 'Gizle', onclick: () => this.toggle(false) }, '✕'));
    const body = h('div', { class: 'tp-body' });
    const open = this.tasks.find((t) => t.key === this.openKey);
    if (open) this.renderTask(body, open);
    else {
      const groups = [['Kitap: Veri Tabanı İşlemleri', this.tasks.filter((t) => t.book)], ['Öğretmenimin görevleri', this.tasks.filter((t) => !t.book)]];
      for (const [label, list] of groups) {
        if (!list.length && label.startsWith('Kitap')) continue;
        body.appendChild(h('div', { class: 'tp-group' }, label));
        if (!list.length) body.appendChild(h('div', { class: 'tp-empty' }, 'Henüz görev yok.'));
        for (const t of list) {
          const p = this.progress[t.key]?.data?.done || [];
          const n = t.steps.filter((s) => p.includes(s.id)).length;
          const pct = Math.round((n / t.steps.length) * 100);
          body.appendChild(h('div', { class: 'tp-item' + (n === t.steps.length ? ' done' : ''), onclick: () => { this.openKey = t.key; this.render(); } },
            h('div', { class: 'tp-item-title' }, t.title, !t.active && !t.book ? h('span', { class: 'tp-badge' }, 'pasif') : null),
            h('div', { class: 'tp-bar' }, h('div', { class: 'tp-fill', style: { width: pct + '%' } })), h('div', { class: 'tp-item-sub' }, `${n} / ${t.steps.length} adım`)));
        }
      }
    }
    this.el.append(head, body);
    body.scrollTop = scroll;
  }

  renderTask(body, t) {
    const p = this.progress[t.key]?.data?.done || [];
    const cur = t.steps.find((s) => !p.includes(s.id));
    body.append(h('button', { class: 'tp-back', onclick: () => { this.openKey = null; this.render(); } }, '← Tüm görevler'),
      h('div', { class: 'tp-title' }, t.title), t.intro ? h('div', { class: 'tp-intro' }, t.intro) : null);
    for (const s of t.steps) {
      const done = p.includes(s.id);
      const isCur = s === cur;
      const el = h('div', { class: 'tp-step' + (done ? ' done' : isCur ? ' cur' : '') },
        h('span', { class: 'tp-step-ico' }, done ? '✔' : isCur ? '➜' : '○'),
        h('div', { class: 'tp-step-main' }, h('div', { class: 'tp-step-title' }, s.title),
          isCur && s.help ? h('div', { class: 'tp-step-help' }, s.help) : null,
          isCur && s.hint ? h('details', { class: 'tp-hint' }, h('summary', {}, 'İpucu'), h('pre', {}, s.hint)) : null));
      body.appendChild(el);
    }
    if (!cur) body.appendChild(h('div', { class: 'tp-done' }, '🎉 Tüm adımlar tamamlandı.'));
    if (cur && !(cur.checks || []).length) body.appendChild(h('button', { class: 'lab-btn', onclick: () => { this.markDone(t, cur); } }, 'Bu adımı yaptım'));
  }

  markDone(t, s) {
    const pr = this.progress[t.key] ??= { data: { done: [], flags: [] }, done: false };
    pr.data.done.push(s.id);
    pr.done = t.steps.every((x) => pr.data.done.includes(x.id));
    this.save(t, pr);
    this.evaluate();
    this.render();
  }
}

// ---------------------------------------------------------------- öğretmen

function openTeacher(panel) {
  const { lab } = panel;
  const w = lab.desk.open({ title: 'Öğretmen — Görevler ve Sınıf', icon: ICONS.tasks, width: 980, height: 620 });
  let tab = 'tasks';
  const body = h('div', { class: 'tt-body' });
  const tabs = h('div', { class: 'wb-te-subtabs top' });
  const render = () => {
    tabs.innerHTML = '';
    for (const [id, l] of [['tasks', 'Görevlerim'], ['progress', 'Sınıf ilerlemesi'], ['dbs', 'Veritabanı dağıt']]) tabs.appendChild(h('button', { class: 'wb-nav-tab' + (tab === id ? ' active' : ''), onclick: () => { tab = id; render(); } }, l));
    body.innerHTML = '';
    if (tab === 'tasks') renderTeacherTasks(panel, body, w, render);
    else if (tab === 'progress') renderClassProgress(panel, body);
    else renderDistribute(panel, body, w);
  };
  w.body.appendChild(h('div', { class: 'lab-col' }, tabs, body));
  render();
}

async function classes() {
  try { return (await api.students()).classes || []; } catch { return []; }
}

function renderTeacherTasks(panel, body, w, rerender) {
  const list = panel.teacherTasks || [];
  body.append(h('div', { class: 'wb-form-btns' }, h('button', { class: 'lab-btn primary', onclick: () => editTask(panel, null, w, rerender) }, '+ Yeni görev'), h('span', { class: 'muted' }, 'Görevler seçtiğiniz sınıftaki öğrencilerin Görevler panelinde görünür. Adımlar, seçtiğiniz denetimlerle otomatik işaretlenir.')));
  const t = h('table', { class: 'wb-grid' }, h('thead', {}, h('tr', {}, h('th', {}, 'Başlık'), h('th', {}, 'Sınıf'), h('th', {}, 'Adım'), h('th', {}, 'Durum'), h('th', {}, ''))));
  const tb = h('tbody');
  for (const task of list) {
    tb.appendChild(h('tr', {}, h('td', {}, task.title), h('td', {}, task.sinif || 'Tüm sınıflar'), h('td', {}, String(task.steps?.length || 0)), h('td', {}, task.active ? 'Etkin' : 'Pasif'),
      h('td', {}, h('button', { class: 'lab-btn', onclick: () => editTask(panel, task, w, rerender) }, 'Düzenle'), ' ',
        h('button', { class: 'lab-btn', onclick: async () => {
          const r = await panel.lab.desk.message({ title: 'Görevi sil', text: `"${task.title}" ve öğrencilerin bu görevdeki ilerlemesi silinsin mi?`, icon: 'warning', buttons: [{ text: 'Sil', value: 'y', primary: true }, { text: 'İptal', value: null }], owner: w });
          if (r !== 'y') return;
          await api.deleteLabTask(task.id);
          await panel.load();
          rerender();
        } }, 'Sil'))));
  }
  t.appendChild(tb);
  body.appendChild(h('div', { class: 'wb-grid-scroll' }, t));
  if (!list.length) body.appendChild(h('div', { class: 'muted' }, 'Henüz görev yazmadınız. Kitaptaki hazır görevler tüm öğrencilerde zaten vardır.'));
}

async function editTask(panel, task, owner, rerender) {
  const { lab } = panel;
  const d = task ? JSON.parse(JSON.stringify({ title: task.title, sinif: task.sinif, active: task.active, intro: task.intro || '', steps: task.steps || [] })) : { title: '', sinif: '', active: true, intro: '', steps: [] };
  const w = lab.desk.open({ title: task ? 'Görevi düzenle' : 'Yeni görev', width: 860, height: 640, modal: true, owner, minimizable: false });
  const cls = await classes();
  const body = h('div', { class: 'tt-edit' });
  const render = () => {
    body.innerHTML = '';
    const title = h('input', { class: 'lab-input', value: d.title, placeholder: 'ör. Okul veritabanı: ogrenci tablosu' });
    title.oninput = () => { d.title = title.value; };
    const sinif = h('select', { class: 'lab-input' }, h('option', { value: '' }, 'Tüm sınıflar'), ...cls.map((c) => h('option', { value: c, selected: c === d.sinif }, c)));
    sinif.onchange = () => { d.sinif = sinif.value; };
    const active = h('input', { type: 'checkbox', checked: d.active });
    active.onchange = () => { d.active = active.checked; };
    const intro = h('textarea', { class: 'lab-input', rows: 2, placeholder: 'Görevin açıklaması (isteğe bağlı)' });
    intro.value = d.intro;
    intro.oninput = () => { d.intro = intro.value; };
    body.append(h('div', { class: 'wb-form-row' }, h('label', {}, 'Başlık:'), title), h('div', { class: 'wb-form-row' }, h('label', {}, 'Sınıf:'), sinif, h('label', { class: 'wb-te-colrow' }, active, ' Etkin (öğrenciler görür)')), h('div', { class: 'wb-form-row' }, h('label', {}, 'Açıklama:'), intro));
    d.steps.forEach((s, i) => {
      const st = h('div', { class: 'tt-step' });
      const t = h('input', { class: 'lab-input', value: s.title, placeholder: `Adım ${i + 1} başlığı` });
      t.oninput = () => { s.title = t.value; };
      const help = h('textarea', { class: 'lab-input', rows: 2, placeholder: 'Öğrenciye gösterilecek açıklama' });
      help.value = s.help || '';
      help.oninput = () => { s.help = help.value; };
      st.append(h('div', { class: 'tt-step-head' }, h('b', {}, `${i + 1}.`), t,
        h('button', { class: 'lab-btn', title: 'Yukarı', onclick: () => { if (i > 0) { [d.steps[i - 1], d.steps[i]] = [d.steps[i], d.steps[i - 1]]; render(); } } }, '↑'),
        h('button', { class: 'lab-btn', title: 'Sil', onclick: () => { d.steps.splice(i, 1); render(); } }, '✕')), help);
      s.checks ??= [];
      s.checks.forEach((c, k) => {
        const type = h('select', { class: 'lab-input' }, ...Object.entries(CHECK_TYPES).map(([id, ct]) => h('option', { value: id, selected: id === c.type }, ct.label)));
        type.onchange = () => { s.checks[k] = { type: type.value }; render(); };
        const params = (CHECK_TYPES[c.type]?.params || []).map(([key, label]) => {
          const inp = h(key === 'sql' ? 'textarea' : 'input', { class: 'lab-input', placeholder: label, title: label, rows: 2 });
          inp.value = c[key] ?? '';
          inp.oninput = () => { c[key] = inp.value; };
          return inp;
        });
        st.appendChild(h('div', { class: 'tt-check' }, h('span', { class: 'muted' }, 'Denetim:'), type, ...params, h('button', { class: 'lab-btn', onclick: () => { s.checks.splice(k, 1); render(); } }, '✕')));
      });
      st.appendChild(h('div', { class: 'wb-form-btns' }, h('button', { class: 'lab-btn', onclick: () => { s.checks.push({ type: 'db_exists', db: '' }); render(); } }, '+ Denetim'),
        h('span', { class: 'muted small' }, s.checks.length ? 'Tüm denetimler sağlanınca adım tamamlanır.' : 'Denetim yoksa öğrenci "Bu adımı yaptım" ile işaretler.')));
      body.appendChild(st);
    });
    body.appendChild(h('div', { class: 'wb-form-btns' }, h('button', { class: 'lab-btn', onclick: () => { d.steps.push({ id: 's' + Date.now().toString(36) + d.steps.length, title: '', help: '', checks: [] }); render(); } }, '+ Adım ekle'),
      h('button', { class: 'lab-btn', title: 'Denetimleri kendi laboratuvarınızda dener', onclick: () => testTask() }, 'Kendi laboratuvarımda dene'),
      h('div', { class: 'spacer' }), h('button', { class: 'lab-btn', onclick: () => w.close() }, 'İptal'), h('button', { class: 'lab-btn primary', onclick: save }, 'Kaydet')));
  };
  const testTask = () => {
    const lines = d.steps.map((s, i) => {
      const res = (s.checks || []).map((c) => `${CHECK_TYPES[c.type]?.label || c.type}: ${panel.engine.check(c, { flags: [] }) ? '✔' : '✖'}`);
      return `${i + 1}. ${s.title || '(başlıksız)'}\n   ${res.join('\n   ') || '(denetim yok)'}`;
    });
    lab.desk.message({ title: 'Deneme sonucu', text: h('pre', { class: 'tt-test' }, lines.join('\n')), icon: 'info', owner: w, width: 600 });
  };
  const save = async () => {
    if (!d.title.trim()) { await lab.desk.message({ title: 'Görev', text: 'Başlık yazın.', icon: 'warning', owner: w }); return; }
    if (!d.steps.length) { await lab.desk.message({ title: 'Görev', text: 'En az bir adım ekleyin.', icon: 'warning', owner: w }); return; }
    d.steps.forEach((s, i) => { s.id ??= 's' + i; if (!s.title) s.title = `Adım ${i + 1}`; });
    const payload = { title: d.title.trim(), sinif: d.sinif, active: d.active, data: { intro: d.intro, steps: d.steps } };
    try {
      if (task) await api.saveLabTask(task.id, payload); else await api.createLabTask(payload);
      toast('Görev kaydedildi.', 'success');
      w.close(true);
      await panel.load();
      rerender();
    } catch (e) {
      lab.desk.message({ title: 'Görev', text: e.message, icon: 'error', owner: w });
    }
  };
  w.body.appendChild(h('div', { class: 'tt-scroll' }, body));
  render();
}

async function renderClassProgress(panel, body) {
  const cls = await classes();
  const sel = h('select', { class: 'lab-input' }, h('option', { value: '' }, 'Sınıf seçin'), ...cls.map((c) => h('option', { value: c }, c)));
  const out = h('div', { class: 'wb-grid-scroll' });
  sel.onchange = async () => {
    out.innerHTML = '';
    if (!sel.value) return;
    out.textContent = 'Yükleniyor…';
    let r;
    try { r = await api.labProgress(sel.value); } catch (e) { out.textContent = e.message; return; }
    const tasks = panel.tasks.filter((t) => t.book || !t.sinif || t.sinif === sel.value);
    const t = h('table', { class: 'wb-grid tt-matrix' }, h('thead', {}, h('tr', {}, h('th', {}, 'Öğrenci'), ...tasks.map((x) => h('th', { title: x.title }, x.title.length > 18 ? x.title.slice(0, 17) + '…' : x.title)))));
    const tb = h('tbody');
    for (const s of r.students) {
      tb.appendChild(h('tr', {}, h('td', {}, s.name), ...tasks.map((x) => {
        const p = s.progress?.[x.key];
        const n = p?.data?.done?.length || 0;
        const total = x.steps.length;
        return h('td', { class: 'c ' + (n >= total ? 'tt-full' : n ? 'tt-part' : ''), title: p?.updated_at || '' }, n >= total ? '✔' : `${n}/${total}`);
      })));
    }
    t.appendChild(tb);
    out.innerHTML = '';
    out.appendChild(t);
    if (!r.students.length) out.appendChild(h('div', { class: 'muted' }, 'Bu sınıfta henüz giriş yapmış öğrenci yok.'));
  };
  body.append(h('div', { class: 'wb-form-row' }, h('label', {}, 'Sınıf:'), sel), out);
}

async function renderDistribute(panel, body, owner) {
  const { lab } = panel;
  const cls = await classes();
  const dbs = lab.server.databaseNames().filter((d) => !['sakila', 'world'].includes(d));
  const dbSel = h('select', { class: 'lab-input' }, ...dbs.map((d) => h('option', { value: d }, d)));
  const asIn = h('input', { class: 'lab-input', placeholder: 'boş: aynı ad' });
  const clsSel = h('select', { class: 'lab-input' }, h('option', { value: '' }, 'Sınıf seçin'), ...cls.map((c) => h('option', { value: c }, c)));
  const over = h('input', { type: 'checkbox' });
  const result = h('div');
  const send = async () => {
    if (!dbSel.value || !clsSel.value) { await lab.desk.message({ title: 'Dağıt', text: 'Veritabanı ve sınıf seçin.', icon: 'warning', owner }); return; }
    await lab.store.flush().catch(() => {});
    try {
      const r = await api.distributeLabDatabase(dbSel.value, { sinif: clsSel.value, as: asIn.value.trim() || undefined, overwrite: over.checked });
      result.innerHTML = '';
      result.append(h('div', { class: 'inst-ok' }, `${r.copied.length} öğrenciye gönderildi.`), r.skipped.length ? h('div', { class: 'muted' }, 'Atlananlar: ' + r.skipped.map((s) => `${s.name} (${s.reason})`).join(', ')) : null);
    } catch (e) {
      await lab.desk.message({ title: 'Dağıt', text: e.message, icon: 'error', owner });
    }
  };
  body.append(h('div', { class: 'muted' }, 'Laboratuvarınızdaki bir veritabanını (tablolar ve kayıtlarıyla) sınıftaki her öğrencinin MySQL sunucusuna kopyalar. Öğrenciler laboratuvarı yeniden açınca görür.'),
    h('div', { class: 'wb-form-row' }, h('label', {}, 'Veritabanı:'), dbSel), h('div', { class: 'wb-form-row' }, h('label', {}, 'Öğrencideki adı:'), asIn),
    h('div', { class: 'wb-form-row' }, h('label', {}, 'Sınıf:'), clsSel), h('label', { class: 'wb-te-colrow' }, over, ' Aynı adlı veritabanı varsa üzerine yaz'),
    h('div', { class: 'wb-form-btns' }, h('button', { class: 'lab-btn primary', onclick: send }, 'Sınıfa gönder')), result);
  if (!dbs.length) body.appendChild(h('div', { class: 'muted' }, 'Önce laboratuvarda bir veritabanı oluşturun.'));
}
