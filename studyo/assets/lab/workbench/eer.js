// MySQL Workbench EER diyagramı: Reverse Engineer, ilişki çizme ("Place a Relationship Using
// Existing Columns"), Identifying Relationship ve Synchronize Model.
import { h } from '../../js/ui.js';
import { ICONS } from '../icons.js';
import { typeText } from '../mysql/engine.js';

const bq = (s) => '`' + String(s).replace(/`/g, '``') + '`';
const lc = (s) => String(s).toLowerCase();

function wizard(conn, title, steps, onFinish) {
  // steps: [{ title, render(el, api) , next?(): bool, auto?: true }]
  return new Promise((resolve) => {
    let i = 0;
    let result = null;
    const w = conn.desk.open({ title, width: 760, height: 520, modal: true, owner: conn.win, minimizable: false, onClose: () => { resolve(result); return true; } });
    const side = h('div', { class: 'wb-wiz-steps' });
    const page = h('div', { class: 'wb-wiz-page' });
    const back = h('button', { class: 'lab-btn' }, '< Back');
    const next = h('button', { class: 'lab-btn primary' }, 'Next >');
    const cancel = h('button', { class: 'lab-btn' }, 'Cancel');
    w.body.appendChild(h('div', { class: 'wb-wiz' }, h('div', { class: 'wb-wiz-main' }, side, page), h('div', { class: 'wb-wiz-foot' }, h('div', { class: 'spacer' }), back, next, cancel)));
    const go = (k) => {
      i = k;
      side.innerHTML = '';
      steps.forEach((s, j) => side.appendChild(h('div', { class: 'wb-wiz-step' + (j === i ? ' cur' : j < i ? ' done' : '') }, (j < i ? '✔ ' : '') + s.title)));
      page.innerHTML = '';
      page.appendChild(h('div', { class: 'wb-wiz-title' }, steps[i].title));
      back.disabled = i === 0;
      next.disabled = false;
      next.textContent = i === steps.length - 1 ? (steps[i].finishText || 'Finish') : steps[i].nextText || 'Next >';
      steps[i].render(page, { setNext: (on) => { next.disabled = !on; } });
    };
    back.onclick = () => go(i - 1);
    cancel.onclick = () => w.close();
    next.onclick = async () => {
      const s = steps[i];
      if (s.next && (await s.next()) === false) return;
      if (i === steps.length - 1) { result = await onFinish(); w.close(true); resolve(result); return; }
      go(i + 1);
    };
    go(0);
    w.center();
  });
}

function taskList(el, items, done) {
  const box = h('div', { class: 'inst-tasks' });
  el.appendChild(box);
  const rows = items.map((t) => { const ic = h('span', { class: 'inst-tick' }, '○'); box.appendChild(h('div', { class: 'inst-task' }, ic, h('span', {}, t))); return ic; });
  let k = 0;
  const tick = () => {
    if (k > 0) { rows[k - 1].textContent = '✔'; rows[k - 1].className = 'inst-tick ok'; }
    if (k < rows.length) { rows[k].textContent = '➜'; rows[k].className = 'inst-tick cur'; k++; setTimeout(tick, 250); } else done?.();
  };
  tick();
}

/** Database > Reverse Engineer... */
export async function reverseEngineer(conn) {
  const srv = conn.lab.server;
  const dbs = srv.databaseNames().filter((d) => srv.canSeeDb(conn.session.account, d));
  const chosen = new Set(conn.session.db ? [conn.session.db] : []);
  const model = await wizard(conn, 'Reverse Engineer Database', [
    { title: 'Connection Options', render(el) { el.append(h('div', {}, 'Set Parameters for Connecting to a DBMS'), h('div', { class: 'wb-form-row' }, h('label', {}, 'Stored Connection:'), h('select', { class: 'lab-input' }, h('option', {}, conn.conn.name))), h('div', { class: 'wb-form-row' }, h('label', {}, 'Hostname:'), h('span', {}, conn.conn.host), h('label', {}, 'Port:'), h('span', {}, String(conn.conn.port))), h('div', { class: 'wb-form-row' }, h('label', {}, 'Username:'), h('span', {}, conn.conn.user))); } },
    { title: 'Connect to DBMS', render(el, api) { api.setNext(false); el.appendChild(h('div', {}, 'The following tasks will now be executed. Please monitor the execution.')); taskList(el, ['Connect to DBMS', 'Retrieve Schema List from Database', 'Check Common Server Configuration Issues'], () => api.setNext(true)); } },
    {
      title: 'Select Schemas',
      render(el) {
        el.appendChild(h('div', {}, 'Select the schemas you want to include:'));
        for (const d of dbs) {
          const cb = h('input', { type: 'checkbox', checked: chosen.has(d) });
          cb.onchange = () => { if (cb.checked) chosen.add(d); else chosen.delete(d); };
          el.appendChild(h('label', { class: 'wb-te-colrow' }, cb, ' ', h('span', { html: ICONS.db, class: 'wb-tree-ico' }), d));
        }
      },
      next() {
        if (chosen.size !== 1) { conn.desk.message({ title: 'Reverse Engineer', text: 'Simülatörde tek bir şema seçin.', icon: 'warning', owner: conn.win }); return false; }
        return true;
      },
    },
    { title: 'Retrieve Objects', render(el, api) { api.setNext(false); taskList(el, ['Retrieve Objects from Selected Schemas', 'Check Results'], () => api.setNext(true)); } },
    { title: 'Select Objects', render(el) { const ctx = srv.getDb([...chosen][0]); const n = Object.keys(ctx.meta.tables).length; el.append(h('div', {}, 'Select the schema objects to import.'), h('label', { class: 'wb-te-colrow' }, h('input', { type: 'checkbox', checked: true, disabled: true }), ` Import MySQL Table Objects — ${n} Total Objects, ${n} Selected`)); }, nextText: 'Execute >' },
    { title: 'Reverse Engineer', render(el, api) { api.setNext(false); taskList(el, ['Reverse Engineer Selected Objects', 'Place Objects on Diagram'], () => api.setNext(true)); } },
    { title: 'Results', render(el) { const ctx = srv.getDb([...chosen][0]); el.append(h('div', {}, 'Reverse Engineer Finished Successfully'), h('div', { class: 'muted' }, `Summary of Reverse Engineered Objects:\n- ${Object.keys(ctx.meta.tables).length} tables from schema '${ctx.name}'`)); } },
  ], () => buildModel(conn, [...chosen][0]));
  if (model) openEer(conn, model);
}

function cloneTable(m) {
  return {
    name: m.name, orig: m.name,
    columns: m.columns.map((c) => ({ ...JSON.parse(JSON.stringify(c)), orig: c.name })),
    pk: m.pk.slice(), uniques: m.uniques.map((u) => ({ name: u.name, cols: u.cols.slice() })), indexes: m.indexes.map((u) => ({ name: u.name, cols: u.cols.slice() })),
  };
}

function buildModel(conn, db) {
  const ctx = conn.lab.server.getDb(db);
  const store = conn.lab.store;
  store.state.models ??= {};
  const prev = store.state.models[db];
  const names = Object.keys(ctx.meta.tables).sort();
  const pos = {};
  names.forEach((t, i) => { pos[t] = prev?.pos?.[t] || { x: 30 + (i % 4) * 240, y: 30 + Math.floor(i / 4) * 240 }; });
  const tables = {};
  for (const t of names) tables[t] = cloneTable(ctx.meta.tables[t]);
  const rels = [];
  for (const m of Object.values(ctx.meta.tables)) {
    for (const f of m.fks) rels.push({ name: f.name, child: m.name, childCols: f.cols.slice(), parent: lc(f.refTable), parentCols: f.refCols.slice(), identifying: f.cols.every((c) => m.pk.some((p) => lc(p) === lc(c))), one: false });
  }
  const model = { db, pos, rels, tables, dropped: [], created: Date.now() };
  store.state.models[db] = model;
  store.touch();
  return model;
}

/** Eski kayıtlı modeller (tablo tanımı olmayan) için tabloları veritabanından doldurur */
function ensureTables(conn, model) {
  if (model.tables) return;
  const ctx = conn.lab.server.getDb(model.db);
  model.tables = {};
  for (const m of Object.values(ctx?.meta.tables || {})) model.tables[m.name] = cloneTable(m);
  model.dropped = [];
}

/** "VARCHAR(45)", "DECIMAL(7,2) UNSIGNED", "ENUM('E','K')" → sütun türü bilgisi */
function parseType(text) {
  const m = /^\s*(\w+)\s*(?:\((.*)\))?\s*(unsigned)?\s*(zerofill)?\s*$/i.exec(text || '');
  if (!m) return null;
  const type = { integer: 'int', bool: 'tinyint', boolean: 'tinyint', dec: 'decimal', numeric: 'decimal' }[lc(m[1])] || lc(m[1]);
  const c = { type };
  if (type === 'enum' || type === 'set') c.values = [...(m[2] || '').matchAll(/'((?:[^']|'')*)'/g)].map((x) => x[1].replace(/''/g, "'"));
  else if (m[2]) { const [a, b] = m[2].split(',').map((x) => Number(x.trim())); c.len = a; if (b != null && !Number.isNaN(b)) c.scale = b; }
  if (/^bool/i.test(m[1])) c.len = 1;
  if (m[3]) c.unsigned = true;
  if (m[4]) { c.zerofill = true; c.unsigned = true; }
  if (type === 'varchar' && !c.len) c.len = 45;
  if (type === 'decimal') { c.len ??= 10; c.scale ??= 0; }
  return c;
}

function colSql(c, pk) {
  let s = `${bq(c.name)} ${typeText(c).replace(/^\w+/, (x) => x.toUpperCase()).replace(/ unsigned/, ' UNSIGNED').replace(/ zerofill/, ' ZEROFILL')}`;
  s += c.notNull || pk ? ' NOT NULL' : ' NULL';
  if (c.default) {
    if (c.default.now) s += ' DEFAULT CURRENT_TIMESTAMP';
    else if (c.default.expr) s += ` DEFAULT (${c.default.expr})`;
    else if (c.default.value === null) s += ' DEFAULT NULL';
    else s += ' DEFAULT ' + (typeof c.default.value === 'number' ? c.default.value : "'" + String(c.default.value).replace(/'/g, "\\'") + "'");
  }
  if (c.autoInc) s += ' AUTO_INCREMENT';
  return s;
}

const colSig = (c) => JSON.stringify([c.type, c.len ?? null, c.scale ?? null, !!c.unsigned, !!c.zerofill, !!c.notNull, !!c.autoInc, c.values || null, c.default || null]);

/** EER diyagram sekmesi */
export function openEer(conn, model) {
  ensureTables(conn, model);
  const existing = conn.tabs.find((t) => t.eerDb === model.db);
  if (existing) { existing.model = model; existing.render(); conn.showTab(existing); return; }
  const tab = { eerDb: model.db, model, title: `EER Diagram (${model.db})`, icon: ICONS.schemaNew, el: h('div', { class: 'eer' }), focus() {} };
  let tool = 'select';
  let pick = null; // { table, col? }
  let selRel = null;
  const canvas = h('div', { class: 'eer-canvas' });
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'eer-svg');
  const status = h('div', { class: 'eer-status' });
  const editor = h('div', { class: 'eer-editor hidden' });
  const tools = h('div', { class: 'eer-tools' });
  const T = () => tab.model.tables;
  const RELTOOLS = {
    r11: ['1:1', 'Place a New 1:1 Non-Identifying Relationship', { one: true, identifying: false }],
    r1n: ['1:n', 'Place a New 1:n Non-Identifying Relationship', { one: false, identifying: false }],
    r11i: ['1:1', 'Place a New 1:1 Identifying Relationship', { one: true, identifying: true }],
    r1ni: ['1:n', 'Place a New 1:n Identifying Relationship', { one: false, identifying: true }],
    rnm: ['n:m', 'Place a New n:m Identifying Relationship', { nm: true }],
  };
  const toolBtn = (id, label, title, cls = '') => {
    const b = h('button', { class: 'eer-tool ' + cls + (tool === id ? ' on' : ''), title }, label);
    b.onclick = () => { tool = id; pick = null; render(); };
    return b;
  };
  const save = () => conn.lab.store.touch();
  const uniqueName = (base, taken) => { let n = base; let k = 1; while (taken(n)) n = base + k++; return n; };
  function statusText() {
    if (tool === 'exist') return pick ? `"${pick.table}.${pick.col}" seçildi. Şimdi başvurulan tablodaki birincil anahtar (PK) sütununa tıklayın.` : 'Önce yabancı anahtar (FK) olacak sütuna, sonra başvurulan tablodaki PK sütununa tıklayın.';
    if (tool === 'table') return 'Yeni tabloyu yerleştirmek için diyagramda boş bir yere tıklayın.';
    if (tool === 'rnm') return pick ? `"${pick.table}" seçildi. Şimdi ikinci tabloya tıklayın (aradaki tablo otomatik oluşturulur).` : 'n:m ilişki: birinci tabloya, sonra ikinci tabloya tıklayın.';
    if (RELTOOLS[tool]) return pick ? `"${pick.table}" seçildi (yabancı anahtar bu tabloya eklenecek). Şimdi başvurulan (PK) tabloya tıklayın.` : 'Önce yabancı anahtarın ekleneceği (alt) tabloya, sonra başvurulan (üst) tabloya tıklayın.';
    return 'Hazır. Tabloyu düzenlemek için başlığına, ilişkiyi düzenlemek için çizgiye çift tıklayın.';
  }
  function render() {
    tools.innerHTML = '';
    tools.append(toolBtn('select', '↖', 'Select (Escape)'), toolBtn('table', '▦', 'Place a New Table (T)'), h('div', { class: 'eer-sep' }),
      ...Object.entries(RELTOOLS).map(([id, [label, title, o]]) => toolBtn(id, label, title, o.identifying || o.nm ? 'solid' : 'dashed')),
      toolBtn('exist', '⇢', 'Place a Relationship Using Existing Columns'));
    status.textContent = statusText();
    canvas.querySelectorAll('.eer-table').forEach((x) => x.remove());
    canvas.classList.toggle('placing', tool === 'table');
    for (const m of Object.values(T())) {
      tab.model.pos[m.name] ??= { x: 40, y: 40 };
      const p = tab.model.pos[m.name];
      const fkCols = new Set(tab.model.rels.filter((r) => r.child === m.name).flatMap((r) => r.childCols.map(lc)));
      const head = h('div', { class: 'eer-thead' }, m.name);
      const box = h('div', { class: 'eer-table' + (pick && pick.table === m.name && !pick.col ? ' picked' : ''), style: { left: p.x + 'px', top: p.y + 'px' }, 'data-t': m.name },
        head,
        ...m.columns.map((col) => {
          const isPk = m.pk.some((x) => lc(x) === lc(col.name));
          const row = h('div', { class: 'eer-col' + (pick && pick.table === m.name && pick.col === col.name ? ' pick' : '') },
            h('span', { class: 'eer-ci ' + (isPk ? 'pk' : fkCols.has(lc(col.name)) ? 'fk' : col.notNull ? 'nn' : 'n') }, isPk ? '🔑' : fkCols.has(lc(col.name)) ? '◆' : '◇'),
            h('span', {}, col.name), h('span', { class: 'eer-ct' }, typeText(col).toUpperCase()));
          row.onclick = (e) => { if (tool === 'exist') { e.stopPropagation(); pickColumn(m.name, col.name); } };
          return row;
        }),
        h('div', { class: 'eer-tfoot' }, 'Indexes ›'));
      box.addEventListener('click', (e) => { if (RELTOOLS[tool]) { e.stopPropagation(); pickTable(m.name); } });
      head.addEventListener('dblclick', () => editTable(m.name));
      dragBox(box, m.name);
      canvas.appendChild(box);
    }
    requestAnimationFrame(drawLines);
  }
  function dragBox(box, name) {
    box.querySelector('.eer-thead').addEventListener('mousedown', (e) => {
      if (tool !== 'select') return;
      e.preventDefault();
      const sx = e.clientX;
      const sy = e.clientY;
      const p0 = { ...tab.model.pos[name] };
      const move = (ev) => {
        tab.model.pos[name] = { x: Math.max(0, p0.x + ev.clientX - sx), y: Math.max(0, p0.y + ev.clientY - sy) };
        box.style.left = tab.model.pos[name].x + 'px';
        box.style.top = tab.model.pos[name].y + 'px';
        drawLines();
      };
      const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); save(); };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    });
  }
  const warn = (text, detail) => conn.desk.message({ title: 'MySQL Workbench', text, detail, icon: 'warning', owner: conn.win });
  function relName(child, parent) {
    const taken = (n) => tab.model.rels.some((r) => r.name === n) || Object.values(conn.lab.server.getDb(tab.model.db)?.meta.tables || {}).some((m) => m.fks.some((f) => f.name === n));
    return uniqueName(`fk_${child}_${parent}`, taken);
  }
  /** Yeni FK sütunları ekleyerek ilişki kurar (Workbench: tablo1_idtablo1) */
  function addRelation(childName, parentName, o) {
    const child = T()[childName];
    const parent = T()[parentName];
    if (!parent.pk.length) { warn(`"${parentName}" tablosunun birincil anahtarı yok.`, 'İlişki kurmak için başvurulan tabloda PRIMARY KEY olmalıdır.'); return; }
    const childCols = [];
    for (const pkName of parent.pk) {
      const pc = parent.columns.find((c) => lc(c.name) === lc(pkName));
      const name = uniqueName(`${parent.name}_${pc.name}`, (n) => child.columns.some((c) => lc(c.name) === lc(n)));
      child.columns.push({ name, type: pc.type, len: pc.len, scale: pc.scale, unsigned: pc.unsigned, values: pc.values, notNull: true });
      childCols.push(name);
      if (o.identifying) child.pk.push(name);
    }
    if (o.one) child.uniques.push({ name: `${childCols[0]}_UNIQUE`, cols: childCols.slice() });
    tab.model.rels.push({ name: relName(childName, parentName), child: childName, childCols, parent: parentName, parentCols: parent.pk.slice(), identifying: !!o.identifying, one: !!o.one });
  }
  function pickTable(name) {
    if (!pick) { pick = { table: name }; render(); return; }
    if (pick.table === name && tool !== 'r1n' && tool !== 'r1ni') { pick = null; render(); return; }
    const first = pick.table;
    pick = null;
    if (tool === 'rnm') {
      const a = T()[first];
      const b = T()[name];
      if (!a.pk.length || !b.pk.length) { warn('n:m ilişki için iki tablonun da birincil anahtarı olmalıdır.'); render(); return; }
      const tn = uniqueName(`${a.name}_has_${b.name}`, (n) => !!T()[n]);
      T()[tn] = { name: tn, orig: null, columns: [], pk: [], uniques: [], indexes: [] };
      tab.model.pos[tn] = { x: (tab.model.pos[a.name].x + tab.model.pos[b.name].x) / 2, y: Math.max(tab.model.pos[a.name].y, tab.model.pos[b.name].y) + 220 };
      addRelation(tn, a.name, { identifying: true });
      addRelation(tn, b.name, { identifying: true });
    } else {
      addRelation(first, name, RELTOOLS[tool][2]);
    }
    tool = 'select';
    save();
    render();
    conn.lab.events.emit('eer-relationship', { db: tab.model.db });
  }
  function pickColumn(table, col) {
    if (!pick || !pick.col) { pick = { table, col }; render(); return; }
    if (pick.table === table) { pick = { table, col }; render(); return; }
    const child = T()[pick.table];
    const parent = T()[table];
    const cc = child.columns.find((x) => x.name === pick.col);
    const pc = parent.columns.find((x) => x.name === col);
    if (!parent.pk.some((x) => lc(x) === lc(col)) && !parent.uniques.some((u) => u.cols.length === 1 && lc(u.cols[0]) === lc(col))) {
      warn(`Başvurulan sütun (${table}.${col}) birincil anahtar ya da UNIQUE olmalıdır.`);
      pick = null;
      render();
      return;
    }
    if (cc.type !== pc.type || !!cc.unsigned !== !!pc.unsigned) {
      warn(`Sütun türleri uyumsuz: ${pick.table}.${pick.col} (${typeText(cc)}) ↔ ${table}.${col} (${typeText(pc)}).`, 'Yabancı anahtar ile başvurduğu sütunun türleri aynı olmalıdır (ör. ikisi de INT).');
      pick = null;
      render();
      return;
    }
    tab.model.rels.push({ name: relName(pick.table, table), child: pick.table, childCols: [pick.col], parent: table, parentCols: [col], identifying: false, one: false });
    pick = null;
    tool = 'select';
    save();
    render();
    conn.lab.events.emit('eer-relationship', { db: tab.model.db });
  }
  const scroll = h('div', { class: 'eer-scroll' }, canvas);
  scroll.addEventListener('click', (e) => {
    if (tool === 'table' && (e.target === canvas || e.target === svg || e.target === scroll)) {
      const r = canvas.getBoundingClientRect();
      const tn = uniqueName('table', (n) => !!T()[n]);
      const name = tn === 'table' ? 'table1' : tn;
      T()[name] = { name, orig: null, columns: [{ name: `id${name}`, type: 'int', notNull: true }], pk: [`id${name}`], uniques: [], indexes: [] };
      tab.model.pos[name] = { x: Math.max(0, e.clientX - r.left - 20), y: Math.max(0, e.clientY - r.top - 10) };
      void scroll;
      tool = 'select';
      save();
      render();
      editTable(name);
      return;
    }
    if (pick) { pick = null; render(); }
  });
  function drawLines() {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const rect = (t) => {
      const b = canvas.querySelector(`.eer-table[data-t="${CSS.escape(t)}"]`);
      return b ? { x: b.offsetLeft, y: b.offsetTop, w: b.offsetWidth, h: b.offsetHeight } : null;
    };
    let maxX = 0;
    let maxY = 0;
    for (const t of canvas.querySelectorAll('.eer-table')) { maxX = Math.max(maxX, t.offsetLeft + t.offsetWidth + 40); maxY = Math.max(maxY, t.offsetTop + t.offsetHeight + 40); }
    svg.setAttribute('width', maxX);
    svg.setAttribute('height', maxY);
    const mk = (tag, attrs) => { const el = document.createElementNS('http://www.w3.org/2000/svg', tag); for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v); return el; };
    for (const r of tab.model.rels) {
      const a = rect(r.child);
      const b = rect(r.parent);
      if (!a || !b) continue;
      const ax = a.x + a.w / 2;
      const ay = a.y + a.h / 2;
      const bx = b.x + b.w / 2;
      const by = b.y + b.h / 2;
      const edge = (R, x2, y2) => {
        const cx = R.x + R.w / 2;
        const cy = R.y + R.h / 2;
        const dx = x2 - cx;
        const dy = y2 - cy;
        const s = Math.min(dx === 0 ? Infinity : (R.w / 2) / Math.abs(dx), dy === 0 ? Infinity : (R.h / 2) / Math.abs(dy));
        return [cx + dx * s, cy + dy * s];
      };
      const [x1, y1] = edge(a, bx, by);
      const [x2, y2] = edge(b, ax, ay);
      const line = mk('line', { x1, y1, x2, y2, class: 'eer-rel' + (r.identifying ? '' : ' dashed') + (selRel === r ? ' sel' : '') });
      const hit = mk('line', { x1, y1, x2, y2, class: 'eer-hit' });
      const title = mk('title', {});
      title.textContent = `${r.name}: ${r.child}.${r.childCols.join(',')} → ${r.parent}.${r.parentCols.join(',')} (${r.one ? '1:1' : '1:n'}${r.identifying ? ', identifying' : ''})`;
      hit.appendChild(title);
      hit.addEventListener('click', (e) => { e.stopPropagation(); selRel = r; drawLines(); });
      hit.addEventListener('dblclick', () => { selRel = r; drawLines(); editRel(r); });
      // çok tarafı (alt tablo): kaz ayağı ya da 1:1 için çizgi
      const len = Math.hypot(x2 - x1, y2 - y1) || 1;
      const ux = (x2 - x1) / len;
      const uy = (y2 - y1) / len;
      const nx = -uy;
      const ny = ux;
      if (r.one) svg.append(mk('line', { x1: x1 + ux * 8 + nx * 6, y1: y1 + uy * 8 + ny * 6, x2: x1 + ux * 8 - nx * 6, y2: y1 + uy * 8 - ny * 6, class: 'eer-rel' }));
      else for (const k of [-1, 0, 1]) svg.append(mk('line', { x1: x1 + nx * 7 * k, y1: y1 + ny * 7 * k, x2: x1 + ux * 12, y2: y1 + uy * 12, class: 'eer-rel' }));
      svg.append(mk('line', { x1: x2 - ux * 8 + nx * 6, y1: y2 - uy * 8 + ny * 6, x2: x2 - ux * 8 - nx * 6, y2: y2 - uy * 8 - ny * 6, class: 'eer-rel' }));
      svg.append(line, hit);
    }
  }
  function renameRefs(oldT, newT, oldC, newC) {
    for (const r of tab.model.rels) {
      if (oldC == null) { if (r.child === oldT) r.child = newT; if (r.parent === oldT) r.parent = newT; continue; }
      if (r.child === oldT) r.childCols = r.childCols.map((c) => (lc(c) === lc(oldC) ? newC : c));
      if (r.parent === oldT) r.parentCols = r.parentCols.map((c) => (lc(c) === lc(oldC) ? newC : c));
    }
  }
  function editTable(name) {
    const m = T()[name];
    if (!m) return;
    editor.classList.remove('hidden');
    editor.innerHTML = '';
    const tname = h('input', { class: 'lab-input', value: m.name });
    tname.onchange = () => {
      const v = lc(tname.value.trim());
      if (!/^[\p{L}\p{N}_$]+$/u.test(v) || (v !== m.name && T()[v])) { tname.value = m.name; return; }
      if (v === m.name) return;
      delete T()[m.name];
      T()[v] = m;
      tab.model.pos[v] = tab.model.pos[m.name];
      delete tab.model.pos[m.name];
      renameRefs(m.name, v);
      // yeni tablonun otomatik "idtabloadi" sütunu da adı izler
      if (!m.orig) for (const c of m.columns) if (lc(c.name) === lc('id' + m.name) && !m.columns.some((x) => lc(x.name) === lc('id' + v))) { m.pk = m.pk.map((x) => (lc(x) === lc(c.name) ? 'id' + v : x)); renameRefs(v, v, c.name, 'id' + v); c.name = 'id' + v; }
      m.name = v;
      save();
      render();
      editTable(v);
    };
    const rows = h('tbody');
    m.columns.forEach((c, i) => {
      const n = h('input', { class: 'wb-te-in', value: c.name });
      n.onchange = () => {
        const v = n.value.trim();
        if (!v || m.columns.some((x, j) => j !== i && lc(x.name) === lc(v))) { n.value = c.name; return; }
        m.pk = m.pk.map((x) => (lc(x) === lc(c.name) ? v : x));
        for (const u of [...m.uniques, ...m.indexes]) u.cols = u.cols.map((x) => (lc(x) === lc(c.name) ? v : x));
        renameRefs(m.name, m.name, c.name, v);
        c.name = v;
        save();
        render();
      };
      const ty = h('input', { class: 'wb-te-in', value: typeText(c).toUpperCase(), list: 'wb-types' });
      ty.onchange = () => {
        const p = parseType(ty.value);
        if (!p) { ty.value = typeText(c).toUpperCase(); return; }
        delete c.len; delete c.scale; delete c.values; delete c.unsigned; delete c.zerofill;
        Object.assign(c, p);
        save();
        render();
      };
      const flag = (k, title) => {
        const isPk = k === 'pk';
        const cb = h('input', { type: 'checkbox', title, checked: isPk ? m.pk.some((x) => lc(x) === lc(c.name)) : !!c[k] });
        cb.onchange = () => {
          if (isPk) { m.pk = cb.checked ? [...m.pk, c.name] : m.pk.filter((x) => lc(x) !== lc(c.name)); if (cb.checked) c.notNull = true; }
          else c[k] = cb.checked;
          if (k === 'autoInc' && cb.checked) c.notNull = true;
          save();
          render();
          editTable(m.name);
        };
        return h('td', { class: 'c' }, cb);
      };
      const del = h('button', { class: 'wb-mini', title: 'Sütunu sil' }, '✕');
      del.onclick = () => {
        if (tab.model.rels.some((r) => (r.child === m.name && r.childCols.some((x) => lc(x) === lc(c.name))) || (r.parent === m.name && r.parentCols.some((x) => lc(x) === lc(c.name))))) { warn('Bu sütun bir ilişkide kullanılıyor; önce ilişkiyi silin.'); return; }
        m.columns.splice(i, 1);
        m.pk = m.pk.filter((x) => lc(x) !== lc(c.name));
        m.uniques = m.uniques.filter((u) => !u.cols.some((x) => lc(x) === lc(c.name)));
        m.indexes = m.indexes.filter((u) => !u.cols.some((x) => lc(x) === lc(c.name)));
        save();
        render();
        editTable(m.name);
      };
      rows.appendChild(h('tr', {}, h('td', {}, n), h('td', {}, ty), flag('pk', 'PRIMARY KEY'), flag('notNull', 'NOT NULL'), flag('autoInc', 'AUTO_INCREMENT'), h('td', {}, del)));
    });
    const add = h('button', { class: 'lab-btn' }, '+ Column');
    add.onclick = () => {
      const n = uniqueName(`${m.name}col`, (x) => m.columns.some((c) => lc(c.name) === lc(x)));
      m.columns.push(m.columns.length ? { name: n, type: 'varchar', len: 45 } : { name: `id${m.name}`, type: 'int', notNull: true });
      if (m.columns.length === 1) m.pk = [m.columns[0].name];
      save();
      render();
      editTable(m.name);
    };
    const drop = h('button', { class: 'lab-btn' }, 'Delete Table');
    drop.onclick = async () => {
      const r = await conn.desk.message({ title: 'Delete Table', text: `"${m.name}" tablosu modelden silinsin mi?`, detail: m.orig ? 'Synchronize Model yapınca veritabanındaki tablo da silinir (DROP TABLE).' : '', icon: 'warning', buttons: [{ text: 'Delete', value: 'y', primary: true }, { text: 'Cancel', value: null }], owner: conn.win });
      if (r !== 'y') return;
      if (m.orig) tab.model.dropped.push(m.orig);
      tab.model.rels = tab.model.rels.filter((x) => x.child !== m.name && x.parent !== m.name);
      delete T()[m.name];
      delete tab.model.pos[m.name];
      editor.classList.add('hidden');
      save();
      render();
    };
    editor.append(h('div', { class: 'eer-ed-head' }, h('b', {}, `${m.name}: Table`), h('div', { class: 'spacer' }), h('button', { class: 'wb-mini', onclick: () => editor.classList.add('hidden') }, '✕')),
      h('datalist', { id: 'wb-types' }, ...['INT', 'VARCHAR(45)', 'DECIMAL(10,2)', 'DATE', 'DATETIME', 'TINYINT', 'BIGINT', 'DOUBLE', 'CHAR(1)', 'TEXT'].map((t) => h('option', { value: t }))),
      h('div', { class: 'eer-ed-body' },
        h('div', { class: 'wb-form-row' }, h('label', {}, 'Table Name:'), tname),
        h('table', { class: 'wb-te-grid' }, h('thead', {}, h('tr', {}, h('th', {}, 'Column Name'), h('th', {}, 'Datatype'), h('th', {}, 'PK'), h('th', {}, 'NN'), h('th', {}, 'AI'), h('th', {}, ''))), rows),
        h('div', { class: 'wb-form-btns' }, add, h('div', { class: 'spacer' }), drop),
        h('div', { class: 'muted small' }, 'Değişiklikler modeldedir; veritabanına uygulamak için Database > Synchronize Model... kullanın.')));
  }
  function editRel(r) {
    editor.classList.remove('hidden');
    editor.innerHTML = '';
    const ident = h('input', { type: 'checkbox', checked: r.identifying });
    ident.onchange = () => {
      r.identifying = ident.checked;
      // tanımlayıcı ilişki: yabancı anahtar sütunları alt tablonun birincil anahtarına katılır
      const child = T()[r.child];
      if (child) {
        if (r.identifying) for (const c of r.childCols) { if (!child.pk.some((x) => lc(x) === lc(c))) child.pk.push(c); }
        else child.pk = child.pk.filter((x) => !r.childCols.some((c) => lc(c) === lc(x)) || child.pk.length === r.childCols.length);
      }
      save();
      render();
    };
    const card = h('select', { class: 'lab-input' }, h('option', { value: '1n', selected: !r.one }, 'One-to-Many'), h('option', { value: '11', selected: r.one }, 'One-to-One'));
    card.onchange = () => {
      r.one = card.value === '11';
      const child = T()[r.child];
      if (child) {
        child.uniques = child.uniques.filter((u) => !(u.cols.length === r.childCols.length && u.cols.every((c, i) => lc(c) === lc(r.childCols[i]))));
        if (r.one) child.uniques.push({ name: `${r.childCols[0]}_UNIQUE`, cols: r.childCols.slice() });
      }
      save();
      render();
    };
    const caption = h('input', { class: 'lab-input', value: r.name });
    caption.oninput = () => { r.name = caption.value.trim() || r.name; save(); };
    editor.append(h('div', { class: 'eer-ed-head' }, h('b', {}, 'Relationship'), h('div', { class: 'spacer' }), h('button', { class: 'wb-mini', onclick: () => editor.classList.add('hidden') }, '✕')),
      h('div', { class: 'wb-te-subtabs top' }, h('button', { class: 'wb-nav-tab' }, 'Relationship'), h('button', { class: 'wb-nav-tab active' }, 'Foreign Key')),
      h('div', { class: 'eer-ed-body' },
        h('div', { class: 'wb-form-row' }, h('label', {}, 'Caption:'), caption),
        h('div', { class: 'wb-form-row' }, h('label', {}, 'Referencing Table:'), h('b', {}, `${r.child}`), h('span', {}, ' Column: ' + r.childCols.join(', '))),
        h('div', { class: 'wb-form-row' }, h('label', {}, 'Referenced Table:'), h('b', {}, `${r.parent}`), h('span', {}, ' Column: ' + r.parentCols.join(', '))),
        h('div', { class: 'wb-form-row' }, h('label', {}, 'Cardinality:'), card),
        h('label', { class: 'wb-te-colrow' }, ident, ' Identifying Relationship'),
        h('div', { class: 'wb-form-btns' }, h('button', { class: 'lab-btn', onclick: () => { tab.model.rels = tab.model.rels.filter((x) => x !== r); selRel = null; editor.classList.add('hidden'); save(); render(); } }, 'Delete Relationship'))));
  }
  tab.render = render;
  tab.el.append(h('div', { class: 'edmx-bar wb-eer-bar' }, h('b', {}, `EER Diagram — ${model.db}`), h('div', { class: 'spacer' }),
    h('button', { class: 'lab-btn', onclick: () => synchronizeModel(conn, tab.model) }, 'Database > Synchronize Model...')),
  h('div', { class: 'eer-main' }, tools, scroll), status, editor);
  canvas.appendChild(svg);
  conn.addTab(tab);
  render();
}

/** Database > Synchronize Model... */
export async function synchronizeModel(conn, model) {
  if (!model) {
    const tab = conn.tabs.find((t) => t.eerDb);
    if (!tab) { await conn.desk.message({ title: 'Synchronize Model', text: 'Açık bir model yok. Önce Database > Reverse Engineer... ile modeli oluşturun.', icon: 'info', owner: conn.win }); return; }
    model = tab.model;
  }
  const c = conn.lab.server.getDb(model.db);
  if (!c) return;
  ensureTables(conn, model);
  const sql = syncScript(c, model);
  const changes = sql.split('\n').filter((l) => /^ALTER TABLE/.test(l)).length;
  const ok = await wizard(conn, 'Synchronize Model with Database', [
    { title: 'Connection Options', render(el) { el.append(h('div', {}, 'Set Parameters for Connecting to a DBMS'), h('div', { class: 'wb-form-row' }, h('label', {}, 'Stored Connection:'), h('select', { class: 'lab-input' }, h('option', {}, conn.conn.name)))); } },
    { title: 'Connect to DBMS', render(el, api) { api.setNext(false); taskList(el, ['Connect to DBMS', 'Retrieve Schema List from Database'], () => api.setNext(true)); } },
    { title: 'Select Schemas', render(el) { el.append(h('div', {}, 'Select the Schemata to be Synchronized:'), h('label', { class: 'wb-te-colrow' }, h('input', { type: 'checkbox', checked: true, disabled: true }), ` Model Schema: ${model.db}  →  Database Schema: ${model.db}`)); } },
    { title: 'Retrieve Objects', render(el, api) { api.setNext(false); taskList(el, ['Retrieve Objects from Selected Schemas', 'Compare Objects'], () => api.setNext(true)); } },
    {
      title: 'Choose Direction',
      render(el) {
        const changed = [...new Set([...sql.matchAll(/(?:TABLE|EXISTS) `[^`]+`\.`([^`]+)`/g)].map((x) => x[1]))];
        el.append(h('div', {}, 'Model and Database Differences'),
          changed.length ? h('table', { class: 'wb-grid' }, h('thead', {}, h('tr', {}, h('th', {}, 'Source (Model)'), h('th', {}, 'Update'), h('th', {}, 'Destination (Database)'))),
            h('tbody', {}, ...changed.map((t) => h('tr', {}, h('td', {}, model.tables[t] ? t : 'N/A'), h('td', { class: 'c' }, '➜'), h('td', {}, c.meta.tables[t] ? `${model.db}.${t}` : 'N/A'))))) : h('div', { class: 'muted' }, 'Model ile veritabanı aynı; uygulanacak değişiklik yok.'));
      },
    },
    { title: 'Review DB Changes', render(el) { const ta = h('textarea', { class: 'wb-wiz-sql', readonly: true }); ta.value = sql || '-- değişiklik yok'; el.append(h('div', {}, 'The following SQL script will be executed on the database to synchronize it with the model.'), ta); }, finishText: 'Execute >' },
  ], async () => {
    if (!sql) return true;
    const res = conn.session.execute(sql, { stopOnError: true });
    let failed = null;
    for (const r of res) {
      conn.output(r.ok, r.sql.replace(/\s+/g, ' '), r.message, r.ms);
      conn.lab.events.emit('query', { sql: r.sql, result: r, session: conn.session, connection: conn.conn });
      if (!r.ok) failed = r;
    }
    conn.refreshTree();
    if (failed) { await conn.desk.message({ title: 'Synchronize Model', text: `ERROR ${failed.error.code}: ${failed.error.message}`, detail: failed.sql, icon: 'error', owner: conn.win }); return false; }
    // model artık veritabanıyla aynı: özgün adları güncelle
    for (const t of Object.values(model.tables)) { t.orig = t.name; for (const col of t.columns) col.orig = col.name; }
    model.dropped = [];
    conn.lab.store.touch();
    await conn.desk.message({ title: 'Synchronize Model', text: 'Synchronization finished successfully.', icon: 'info', owner: conn.win });
    conn.lab.events.emit('eer-sync', { db: model.db });
    return true;
  });
  return ok;
}

/** File > New Model: boş model (Workbench varsayılanı "mydb") */
export async function newModel(conn) {
  const srv = conn.lab.server;
  let name = 'mydb';
  for (let i = 1; srv.hasDb(name) || conn.tabs.some((t) => t.eerDb === name); i++) name = 'mydb' + i;
  const input = h('input', { class: 'lab-input', value: name, spellcheck: 'false' });
  const r = await conn.desk.message({ title: 'New Model', text: 'Modelin şema (veritabanı) adı:', extra: h('div', { style: { marginTop: '8px' } }, input, h('div', { class: 'muted small' }, 'Tabloları diyagramda "Place a New Table" aracıyla ekleyin; ilişkileri 1:1 / 1:n araçlarıyla çizin. Sonra Database > Forward Engineer... ile veritabanını oluşturun.')), icon: null, buttons: [{ text: 'OK', value: 'ok', primary: true }, { text: 'Cancel', value: null }], owner: conn.win });
  if (r !== 'ok') return;
  const db = lc(input.value.trim());
  if (!/^[\p{L}\p{N}_$]{1,64}$/u.test(db)) { await conn.desk.message({ title: 'New Model', text: `Geçersiz şema adı: '${input.value}'`, icon: 'error', owner: conn.win }); return; }
  const store = conn.lab.store;
  store.state.models ??= {};
  const model = { db, pos: {}, rels: [], tables: {}, dropped: [], created: Date.now(), isNew: true };
  store.state.models[db] = model;
  store.touch();
  openEer(conn, model);
}

/** Database > Forward Engineer: modelden veritabanı oluşturma betiği */
export async function forwardEngineer(conn, model) {
  if (!model) {
    const tab = conn.tabs.find((t) => t.eerDb);
    if (!tab) { await conn.desk.message({ title: 'Forward Engineer', text: 'Açık bir model yok. Önce File > New Model ya da Database > Reverse Engineer... ile bir model açın.', icon: 'info', owner: conn.win }); return false; }
    model = tab.model;
  }
  ensureTables(conn, model);
  if (!Object.keys(model.tables).length) { await conn.desk.message({ title: 'Forward Engineer', text: 'Modelde tablo yok. Diyagrama "Place a New Table" aracıyla tablo ekleyin.', icon: 'warning', owner: conn.win }); return false; }
  let dropFirst = false;
  const build = () => {
    const empty = { meta: { tables: {} } };
    const fresh = { ...model, tables: Object.fromEntries(Object.entries(model.tables).map(([k, t]) => [k, { ...t, orig: null, columns: t.columns.map((c) => ({ ...c, orig: null })) }])), dropped: [] };
    const body = syncScript(empty, fresh);
    const drops = dropFirst ? Object.values(model.tables).map((t) => `DROP TABLE IF EXISTS ${bq(model.db)}.${bq(t.name)};`).join('\n') + '\n' : '';
    return `-- MySQL Workbench Forward Engineering\n\nSET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0;\nSET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0;\n\n-- -----------------------------------------------------\n-- Schema ${model.db}\n-- -----------------------------------------------------\nCREATE SCHEMA IF NOT EXISTS ${bq(model.db)} DEFAULT CHARACTER SET utf8mb4 ;\nUSE ${bq(model.db)} ;\n\n${drops}${body}\n\nSET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS;\nSET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS;\n`;
  };
  let sql = build();
  return wizard(conn, 'Forward Engineer to Database', [
    { title: 'Connection Options', render(el) { el.append(h('div', {}, 'Set Parameters for Connecting to a DBMS'), h('div', { class: 'wb-form-row' }, h('label', {}, 'Stored Connection:'), h('select', { class: 'lab-input' }, h('option', {}, conn.conn.name))), h('div', { class: 'wb-form-row' }, h('label', {}, 'Hostname:'), h('span', {}, conn.conn.host), h('label', {}, 'Port:'), h('span', {}, String(conn.conn.port))), h('div', { class: 'wb-form-row' }, h('label', {}, 'Username:'), h('span', {}, conn.conn.user))); } },
    {
      title: 'Options',
      render(el) {
        const cb = h('input', { type: 'checkbox', checked: dropFirst });
        cb.onchange = () => { dropFirst = cb.checked; };
        el.append(h('div', {}, 'Set Options for Database to be Created:'), h('label', { class: 'wb-te-colrow' }, cb, ' DROP objects before each CREATE object'),
          h('label', { class: 'wb-te-colrow' }, h('input', { type: 'checkbox', disabled: true }), ' Generate DROP SCHEMA'), h('label', { class: 'wb-te-colrow' }, h('input', { type: 'checkbox', disabled: true }), ' Generate INSERT statements for tables'));
      },
    },
    { title: 'Select Objects', render(el) { const n = Object.keys(model.tables).length; el.append(h('div', {}, 'Select Objects to Forward Engineer:'), h('label', { class: 'wb-te-colrow' }, h('input', { type: 'checkbox', checked: true, disabled: true }), ` Export MySQL Table Objects — ${n} Total Objects, ${n} Selected`)); } },
    { title: 'Review SQL Script', render(el) { sql = build(); const ta = h('textarea', { class: 'wb-wiz-sql', readonly: true }); ta.value = sql; el.append(h('div', {}, 'Review the SQL Script to be Executed'), ta); }, finishText: 'Next >' },
  ], async () => {
    const res = conn.session.execute(sql, { stopOnError: true });
    let failed = null;
    for (const r of res) {
      conn.output(r.ok, r.sql.replace(/\s+/g, ' '), r.message, r.ms);
      conn.lab.events.emit('query', { sql: r.sql, result: r, session: conn.session, connection: conn.conn });
      if (!r.ok) failed = r;
    }
    conn.refreshTree();
    if (failed) { await conn.desk.message({ title: 'Forward Engineer', text: `ERROR ${failed.error.code}: ${failed.error.message}`, detail: failed.sql, icon: 'error', owner: conn.win }); return false; }
    for (const t of Object.values(model.tables)) { t.orig = t.name; for (const col of t.columns) col.orig = col.name; }
    model.dropped = [];
    delete model.isNew;
    conn.lab.store.touch();
    await conn.desk.message({ title: 'Forward Engineer', text: 'Forward Engineer Finished Successfully', icon: 'info', owner: conn.win });
    conn.lab.events.emit('eer-forward', { db: model.db });
    return true;
  });
}

function sameFk(f, r) {
  return lc(f.refTable) === lc(r.parent) && f.cols.length === r.childCols.length && f.cols.every((c, i) => lc(c) === lc(r.childCols[i])) && f.refCols.every((c, i) => lc(c) === lc(r.parentCols[i]));
}

function syncScript(c, model) {
  const db = model.db;
  const T = (n) => `${bq(db)}.${bq(n)}`;
  const dropFk = [];
  const dropTables = [];
  const creates = [];
  const alters = [];
  const addFk = [];
  const modelTables = Object.values(model.tables);
  const dbName = (mt) => mt.orig; // veritabanındaki adı
  // 1) kaldırılan yabancı anahtarlar (model ilişkisi olmayan ya da silinen tablolardakiler)
  for (const m of Object.values(c.meta.tables)) {
    const mt = modelTables.find((x) => x.orig === m.name);
    const mine = mt ? model.rels.filter((r) => r.child === mt.name) : [];
    const gone = m.fks.filter((f) => !mt || !mine.some((r) => sameFkMapped(f, r, model, c)));
    if (gone.length && mt) dropFk.push(`ALTER TABLE ${T(m.name)} \n${gone.map((f) => `DROP FOREIGN KEY ${bq(f.name)}`).join(',\n')};`);
  }
  // 2) silinen tablolar
  const gone = (model.dropped || []).filter((t) => c.meta.tables[t]);
  if (gone.length) dropTables.push(`DROP TABLE IF EXISTS ${gone.map(T).join(', ')};`);
  // 3) yeni tablolar
  for (const mt of modelTables.filter((x) => !x.orig || !c.meta.tables[x.orig])) {
    const lines = mt.columns.map((col) => '  ' + colSql(col, mt.pk.some((p) => lc(p) === lc(col.name))));
    if (mt.pk.length) lines.push(`  PRIMARY KEY (${mt.pk.map(bq).join(', ')})`);
    for (const u of mt.uniques) lines.push(`  UNIQUE INDEX ${bq(u.name)} (${u.cols.map((x) => bq(x) + ' ASC').join(', ')}) VISIBLE`);
    for (const u of mt.indexes) lines.push(`  INDEX ${bq(u.name)} (${u.cols.map((x) => bq(x) + ' ASC').join(', ')}) VISIBLE`);
    creates.push(`CREATE TABLE IF NOT EXISTS ${T(mt.name)} (\n${lines.join(',\n')})\nENGINE = InnoDB;`);
  }
  // 4) var olan tablolardaki değişiklikler
  for (const mt of modelTables.filter((x) => x.orig && c.meta.tables[x.orig])) {
    const m = c.meta.tables[dbName(mt)];
    const specs = [];
    const pkChanged = m.pk.map(lc).join() !== mt.pk.map(lc).join();
    if (pkChanged && m.pk.length) specs.push('DROP PRIMARY KEY');
    for (const dc of m.columns) if (!mt.columns.some((x) => x.orig === dc.name)) specs.push(`DROP COLUMN ${bq(dc.name)}`);
    mt.columns.forEach((col, i) => {
      const after = i === 0 ? ' FIRST' : ` AFTER ${bq(mt.columns[i - 1].name)}`;
      const isPk = mt.pk.some((p) => lc(p) === lc(col.name));
      if (!col.orig || !m.columns.some((x) => x.name === col.orig)) { specs.push(`ADD COLUMN ${colSql(col, isPk)}${after}`); return; }
      const dc = m.columns.find((x) => x.name === col.orig);
      if (col.name !== col.orig || colSig({ ...col, notNull: col.notNull || isPk }) !== colSig({ ...dc, notNull: dc.notNull || m.pk.some((p) => lc(p) === lc(dc.name)) })) specs.push(`CHANGE COLUMN ${bq(col.orig)} ${colSql(col, isPk)}`);
    });
    if (pkChanged && mt.pk.length) specs.push(`ADD PRIMARY KEY (${mt.pk.map(bq).join(', ')})`);
    const sameCols = (a, b) => a.length === b.length && a.every((x, i) => lc(x) === lc(b[i]));
    for (const u of m.uniques) if (!mt.uniques.some((x) => sameCols(x.cols, u.cols.map((cn) => mt.columns.find((y) => y.orig === cn)?.name || cn)))) specs.push(`DROP INDEX ${bq(u.name)}`);
    for (const u of mt.uniques) if (!m.uniques.some((x) => sameCols(x.cols.map((cn) => mt.columns.find((y) => y.orig === cn)?.name || cn), u.cols))) specs.push(`ADD UNIQUE INDEX ${bq(u.name)} (${u.cols.map((x) => bq(x) + ' ASC').join(', ')}) VISIBLE`);
    if (mt.name !== mt.orig) specs.push(`RENAME TO ${T(mt.name)}`);
    if (specs.length) alters.push(`ALTER TABLE ${T(m.name)} \n${specs.join(' ,\n')};`);
  }
  // 5) yeni yabancı anahtarlar
  for (const mt of modelTables) {
    const m = mt.orig ? c.meta.tables[mt.orig] : null;
    const add = model.rels.filter((r) => r.child === mt.name && !(m && m.fks.some((f) => sameFkMapped(f, r, model, c))));
    if (!add.length) continue;
    const hasIdx = (r) => [mt.pk, ...mt.uniques.map((u) => u.cols), ...mt.indexes.map((u) => u.cols)].some((cols) => r.childCols.every((x, i) => cols[i] && lc(cols[i]) === lc(x)));
    const idx = add.filter((r) => !hasIdx(r));
    const specs = [
      ...idx.map((r) => `ADD INDEX ${bq(r.name + '_idx')} (${r.childCols.map((x) => bq(x) + ' ASC').join(', ')}) VISIBLE`),
      ...add.map((r) => `ADD CONSTRAINT ${bq(r.name)}\n  FOREIGN KEY (${r.childCols.map(bq).join(', ')})\n  REFERENCES ${T(r.parent)} (${r.parentCols.map(bq).join(', ')})\n  ON DELETE NO ACTION\n  ON UPDATE NO ACTION`),
    ];
    addFk.push(`ALTER TABLE ${T(mt.name)} \n${specs.join(',\n')};`);
  }
  return [...dropFk, ...dropTables, ...creates, ...alters, ...addFk].join('\n');
}

/** Veritabanındaki FK, modeldeki ilişkiyle (yeniden adlandırmalar dikkate alınarak) aynı mı? */
function sameFkMapped(f, r, model, c) {
  const parent = Object.values(model.tables).find((t) => t.name === r.parent);
  const child = Object.values(model.tables).find((t) => t.name === r.child);
  if (!parent || !child || parent.orig !== lc(f.refTable)) return false;
  const cOrig = r.childCols.map((n) => child.columns.find((x) => x.name === n)?.orig);
  const pOrig = r.parentCols.map((n) => parent.columns.find((x) => x.name === n)?.orig);
  void c;
  return f.cols.length === cOrig.length && f.cols.every((x, i) => lc(x) === lc(cOrig[i] || '')) && f.refCols.every((x, i) => lc(x) === lc(pOrig[i] || ''));
}
