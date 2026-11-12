// Workbench tablo düzenleyicisi (Create Table / Alter Table) ve şema düzenleyicisi.
import { h } from '../../js/ui.js';
import { ICONS } from '../icons.js';
import { mysqlString } from '../mysql/engine.js';

const bq = (s) => '`' + String(s).replace(/`/g, '``') + '`';
const lc = (s) => String(s).toLowerCase();

export const DATATYPES = ['INT', 'VARCHAR(45)', 'DECIMAL(10,2)', 'DATETIME', 'DATE', 'TIME', 'TIMESTAMP', 'YEAR', 'TINYINT', 'SMALLINT', 'MEDIUMINT', 'BIGINT', 'FLOAT', 'DOUBLE', 'CHAR(1)', 'TEXT', 'TINYTEXT', 'MEDIUMTEXT', 'LONGTEXT', "ENUM('A','B')", 'BLOB', 'JSON', 'BIT(1)', 'VARBINARY(45)'];
const COLLATIONS = ['Default Collation', 'utf8mb4_0900_ai_ci', 'utf8mb4_turkish_ci', 'utf8mb4_tr_0900_ai_ci', 'utf8mb4_general_ci', 'utf8mb4_bin', 'latin1_swedish_ci'];
const FK_ACTIONS = ['NO ACTION', 'RESTRICT', 'CASCADE', 'SET NULL'];
const STRINGY = /^(VAR)?CHAR|TEXT|ENUM|SET|DATE|TIME|YEAR/i;

/** Tanımdaki türü Workbench biçiminde yazar (INT, VARCHAR(45), DECIMAL(7,2)) */
function wbType(c) {
  const t = c.type.toUpperCase();
  if (c.type === 'enum' || c.type === 'set') return `${t}(${c.values.map((v) => mysqlString(v)).join(', ')})`;
  if (c.type === 'decimal') return `${t}(${c.len ?? 10},${c.scale ?? 0})`;
  if ((c.type === 'float' || c.type === 'double') && c.len != null) return `${t}(${c.len},${c.scale ?? 0})`;
  if (['char', 'varchar', 'binary', 'varbinary', 'bit'].includes(c.type)) return `${t}(${c.len ?? 1})`;
  if (c.type === 'tinyint' && c.len === 1) return 'TINYINT(1)';
  if (c.len && c.zerofill) return `${t}(${c.len})`;
  return t;
}

function wbDefault(c) {
  if (!c.default) return '';
  if (c.default.now) return 'CURRENT_TIMESTAMP';
  if (c.default.expr) return `(${c.default.expr})`;
  if (c.default.value === null) return 'NULL';
  if (typeof c.default.value === 'number') return c.type === 'decimal' ? c.default.value.toFixed(c.scale ?? 0) : String(c.default.value);
  return mysqlString(c.default.value);
}

function colSql(c) {
  let s = `${bq(c.name)} ${c.type.trim()}`;
  if (c.un && !/UNSIGNED/i.test(c.type)) s += ' UNSIGNED';
  if (c.zf && !/ZEROFILL/i.test(c.type)) s += ' ZEROFILL';
  s += c.nn || c.pk ? ' NOT NULL' : ' NULL';
  let d = (c.def || '').trim();
  if (d) {
    if (STRINGY.test(c.type) && !/^'.*'$/s.test(d) && !/^(NULL|CURRENT_TIMESTAMP(\(\))?|NOW\(\))$/i.test(d) && !/^\(.*\)$/.test(d)) d = mysqlString(d);
    s += ' DEFAULT ' + d;
  }
  if (c.ai) s += ' AUTO_INCREMENT';
  if (c.comment) s += ' COMMENT ' + mysqlString(c.comment);
  return s;
}

export class TableEditor {
  constructor(conn, db, table) {
    this.conn = conn;
    this.db = db;
    this.origName = table;
    this.icon = ICONS.table;
    this.load();
    this.el = h('div', { class: 'wb-tabled' });
    this.sub = 'columns';
    this.render();
  }

  get title() { return `${this.name || 'new_table'} - Table`; }

  load() {
    const ctx = this.conn.lab.server.getDb(this.db);
    const m = this.origName ? ctx?.meta.tables[this.origName] : null;
    this.orig = m ? JSON.parse(JSON.stringify(m)) : null;
    if (!m) {
      let n = 'new_table';
      let k = 1;
      while (ctx?.meta.tables[n]) n = `new_table${k++}`;
      this.name = n;
      this.comment = '';
      this.collation = 'Default Collation';
      this.engine = 'InnoDB';
      this.columns = [];
      this.indexes = [];
      this.fks = [];
      this.selCol = -1;
      return;
    }
    this.name = m.name;
    this.comment = m.comment || '';
    this.collation = m.collation && m.collation !== 'utf8mb4_0900_ai_ci' ? m.collation : 'Default Collation';
    this.engine = m.engine || 'InnoDB';
    const pk = new Set(m.pk.map(lc));
    const uq = new Map(m.uniques.filter((u) => u.cols.length === 1).map((u) => [lc(u.cols[0]), u.name]));
    this.columns = m.columns.map((c) => ({
      name: c.name, orig: c.name, type: wbType(c), pk: pk.has(lc(c.name)), nn: !!c.notNull, uq: uq.has(lc(c.name)), uqName: uq.get(lc(c.name)), b: false, un: !!c.unsigned, zf: !!c.zerofill, ai: !!c.autoInc, g: false,
      def: wbDefault(c), comment: c.comment || '',
    }));
    this.indexes = [...m.uniques.filter((u) => u.cols.length > 1).map((u) => ({ name: u.name, type: 'UNIQUE', cols: u.cols.slice(), orig: u.name })),
      ...m.indexes.filter((u) => !m.fks.some((f) => f.name === u.name || `${f.name}_idx` === u.name)).map((u) => ({ name: u.name, type: 'INDEX', cols: u.cols.slice(), orig: u.name }))];
    this.fkIndexes = m.indexes.filter((u) => m.fks.some((f) => f.name === u.name || `${f.name}_idx` === u.name)).map((u) => u.name);
    this.fks = m.fks.map((f) => ({ name: f.name, refTable: f.refTable, cols: f.cols.slice(), refCols: f.refCols.slice(), onDelete: f.onDelete || 'NO ACTION', onUpdate: f.onUpdate || 'NO ACTION', orig: f.name }));
    this.selCol = -1;
  }

  focus() {}

  render() {
    this.el.innerHTML = '';
    const nameIn = h('input', { class: 'lab-input', value: this.name });
    nameIn.oninput = () => { this.name = nameIn.value.trim(); this.conn.renderTabs(); };
    const coll = h('select', { class: 'lab-input' }, ...COLLATIONS.map((c) => h('option', { selected: c === this.collation }, c)));
    coll.onchange = () => { this.collation = coll.value; };
    const eng = h('select', { class: 'lab-input' }, ...['InnoDB', 'MyISAM', 'MEMORY'].map((c) => h('option', { selected: c === this.engine }, c)));
    eng.onchange = () => { this.engine = eng.value; };
    const cm = h('textarea', { class: 'lab-input wb-te-comment' });
    cm.value = this.comment;
    cm.oninput = () => { this.comment = cm.value; };
    const head = h('div', { class: 'wb-te-head' },
      h('div', { class: 'wb-te-ico', html: ICONS.table }),
      h('div', { class: 'wb-te-form' },
        h('label', {}, 'Table Name:'), nameIn, h('label', {}, 'Schema:'), h('span', { class: 'wb-te-schema' }, this.db),
        h('label', {}, 'Charset/Collation:'), coll, h('label', {}, 'Engine:'), eng,
        h('label', {}, 'Comments:'), cm));
    const body = h('div', { class: 'wb-te-body' });
    const subTabs = h('div', { class: 'wb-te-subtabs' }, ...[['columns', 'Columns'], ['indexes', 'Indexes'], ['fks', 'Foreign Keys'], ['triggers', 'Triggers'], ['options', 'Options']].map(([id, label]) => h('button', { class: 'wb-nav-tab' + (this.sub === id ? ' active' : ''), onclick: () => { this.sub = id; this.render(); } }, label)));
    if (this.sub === 'columns') this.renderColumns(body);
    else if (this.sub === 'indexes') this.renderIndexes(body);
    else if (this.sub === 'fks') this.renderFks(body);
    else if (this.sub === 'triggers') this.renderTriggers(body);
    else body.appendChild(h('div', { class: 'wb-te-empty' }, 'Satır biçimi ve diğer seçenekler varsayılan değerlerdedir.'));
    const foot = h('div', { class: 'wb-te-foot' }, h('div', { class: 'spacer' }),
      h('button', { class: 'lab-btn primary', onclick: () => this.apply() }, 'Apply'),
      h('button', { class: 'lab-btn', onclick: () => { this.load(); this.render(); } }, 'Revert'));
    this.el.append(head, body, subTabs, foot);
  }

  renderTriggers(body) {
    if (!this.origName) { body.appendChild(h('div', { class: 'wb-te-empty' }, 'Tetikleyici eklemek için önce tabloyu oluşturun (Apply).')); return; }
    const ctx = this.conn.lab.server.getDb(this.db);
    const list = Object.values(ctx?.meta.triggers || {}).filter((t) => t.table === this.origName);
    const wrap = h('div', { class: 'wb-te-trg' });
    for (const timing of ['BEFORE', 'AFTER']) {
      for (const event of ['INSERT', 'UPDATE', 'DELETE']) {
        const items = list.filter((t) => t.timing === timing && t.event === event);
        wrap.appendChild(h('div', { class: 'wb-te-trg-group' },
          h('div', { class: 'wb-te-trg-head' }, h('span', {}, `${timing} ${event}`),
            h('button', { class: 'wb-mini', title: 'Add Trigger', onclick: () => this.conn.openRoutine(this.db, 'trigger', null, { table: this.origName, timing, event }) }, '+')),
          ...items.map((t) => h('div', { class: 'wb-te-trg-item', title: 'Düzenlemek için çift tıklayın', ondblclick: () => this.conn.openRoutine(this.db, 'trigger', t.name) }, t.name,
            h('button', { class: 'wb-mini', title: 'Delete Trigger', onclick: () => this.conn.dropObject('trigger', this.db, t.name).then(() => this.render()) }, '×')))));
      }
    }
    body.appendChild(wrap);
  }

  renderColumns(body) {
    const dl = h('datalist', { id: 'wb-types' }, ...DATATYPES.map((t) => h('option', { value: t })));
    const table = h('table', { class: 'wb-te-grid' });
    const flags = [['pk', 'PK', 'PRIMARY KEY'], ['nn', 'NN', 'NOT NULL'], ['uq', 'UQ', 'UNIQUE INDEX'], ['b', 'B', 'BINARY'], ['un', 'UN', 'UNSIGNED'], ['zf', 'ZF', 'ZEROFILL'], ['ai', 'AI', 'AUTO_INCREMENT'], ['g', 'G', 'GENERATED']];
    table.appendChild(h('thead', {}, h('tr', {}, h('th', {}, 'Column Name'), h('th', {}, 'Datatype'), ...flags.map(([, l, t]) => h('th', { title: t }, l)), h('th', {}, 'Default/Expression'))));
    const tb = h('tbody');
    this.columns.forEach((c, i) => {
      const name = h('input', { class: 'wb-te-in', value: c.name, spellcheck: 'false' });
      name.oninput = () => { c.name = name.value.trim(); if (i === this.selCol) this.renderDetail(detail); };
      const type = h('input', { class: 'wb-te-in', value: c.type, list: 'wb-types', spellcheck: 'false' });
      type.oninput = () => { c.type = type.value.trim().toUpperCase().replace(/'([^']*)'/g, (m) => m); };
      type.onchange = () => { c.type = normalizeType(type.value); type.value = c.type; };
      const def = h('input', { class: 'wb-te-in', value: c.def, spellcheck: 'false' });
      def.oninput = () => { c.def = def.value; if (i === this.selCol) this.renderDetail(detail); };
      const tr = h('tr', { class: i === this.selCol ? 'sel' : '' },
        h('td', { class: 'wb-te-name' }, h('span', { class: 'wb-te-cico', html: c.pk ? ICONS.key : ICONS.column }), name), h('td', {}, type),
        ...flags.map(([k]) => {
          const cb = h('input', { type: 'checkbox', checked: !!c[k], disabled: k === 'g' });
          cb.onchange = () => {
            c[k] = cb.checked;
            if (k === 'pk' && cb.checked) c.nn = true;
            if (k === 'ai' && cb.checked) { c.nn = true; }
            if (k === 'zf' && cb.checked) c.un = true;
            this.render();
          };
          return h('td', { class: 'c' }, cb);
        }),
        h('td', {}, def));
      tr.addEventListener('focusin', () => { if (this.selCol !== i) { this.selCol = i; tb.querySelectorAll('tr').forEach((x, k) => x.classList.toggle('sel', k === i)); this.renderDetail(detail); } });
      tr.addEventListener('mousedown', () => { if (this.selCol !== i) { this.selCol = i; tb.querySelectorAll('tr').forEach((x, k) => x.classList.toggle('sel', k === i)); this.renderDetail(detail); } });
      tr.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        import('../desktop.js').then(({ showMenu }) => showMenu(e.clientX, e.clientY, [
          ['Move Up', () => { if (i > 0) { [this.columns[i - 1], this.columns[i]] = [this.columns[i], this.columns[i - 1]]; this.selCol = i - 1; this.render(); } }],
          ['Move Down', () => { if (i < this.columns.length - 1) { [this.columns[i + 1], this.columns[i]] = [this.columns[i], this.columns[i + 1]]; this.selCol = i + 1; this.render(); } }],
          null,
          ['Delete Selected', () => { this.columns.splice(i, 1); this.selCol = -1; this.render(); }],
        ]));
      });
      tb.appendChild(tr);
    });
    // yeni sütun satırı
    const add = h('tr', { class: 'wb-te-new' }, h('td', { colspan: 11 }, h('span', { class: 'muted' }, 'click to edit — yeni sütun eklemek için tıklayın')));
    add.addEventListener('click', () => {
      const first = this.columns.length === 0;
      let n = first ? `id${this.name}` : `${this.name}col`;
      let k = 1;
      while (this.columns.some((c) => lc(c.name) === lc(n))) n = `${this.name}col${k++}`;
      this.columns.push(first ? { name: n, orig: null, type: 'INT', pk: true, nn: true, uq: false, b: false, un: false, zf: false, ai: false, g: false, def: '', comment: '' }
        : { name: n, orig: null, type: 'VARCHAR(45)', pk: false, nn: false, uq: false, b: false, un: false, zf: false, ai: false, g: false, def: '', comment: '' });
      this.selCol = this.columns.length - 1;
      this.render();
      const inputs = this.el.querySelectorAll('.wb-te-grid tbody tr');
      const inp = inputs[this.selCol]?.querySelector('input');
      inp?.focus();
      inp?.select();
    });
    tb.appendChild(add);
    table.appendChild(tb);
    const detail = h('div', { class: 'wb-te-detail' });
    this.renderDetail(detail);
    body.append(dl, h('div', { class: 'wb-te-scroll' }, table), detail);
  }

  renderDetail(detail) {
    detail.innerHTML = '';
    const c = this.columns[this.selCol];
    if (!c) { detail.appendChild(h('div', { class: 'muted' }, 'Ayrıntılar için bir sütun seçin. Sütunu silmek ya da taşımak için sağ tıklayın.')); return; }
    const cm = h('input', { class: 'lab-input', value: c.comment });
    cm.oninput = () => { c.comment = cm.value; };
    detail.append(h('div', { class: 'wb-te-dgrid' },
      h('label', {}, 'Column Name:'), h('span', {}, c.name), h('label', {}, 'Data Type:'), h('span', {}, c.type),
      h('label', {}, 'Default:'), h('span', {}, c.def || ''), h('label', {}, 'Comments:'), cm,
      h('label', {}, 'Storage:'), h('span', {}, [c.pk && 'Primary Key', (c.nn || c.pk) && 'Not Null', c.uq && 'Unique', c.un && 'Unsigned', c.zf && 'Zero Fill', c.ai && 'Auto Increment'].filter(Boolean).join(', ') || '—')));
  }

  renderIndexes(body) {
    const list = h('div', { class: 'wb-te-list' });
    const all = [];
    if (this.columns.some((c) => c.pk)) all.push({ name: 'PRIMARY', type: 'PRIMARY', cols: this.columns.filter((c) => c.pk).map((c) => c.name), fixed: true });
    for (const c of this.columns) if (c.uq) all.push({ name: c.uqName || `${c.name}_UNIQUE`, type: 'UNIQUE', cols: [c.name], fixed: true });
    for (const f of this.fks) all.push({ name: `${f.name}_idx`, type: 'INDEX', cols: f.cols, fixed: true });
    all.push(...this.indexes);
    const sel = this.selIdx ?? null;
    const t = h('table', { class: 'wb-te-grid' }, h('thead', {}, h('tr', {}, h('th', {}, 'Index Name'), h('th', {}, 'Type'))));
    const tb = h('tbody');
    for (const ix of all) {
      const name = h('input', { class: 'wb-te-in', value: ix.name, disabled: ix.fixed });
      name.oninput = () => { ix.name = name.value.trim(); };
      const type = h('select', { class: 'wb-te-in', disabled: ix.fixed }, ...['INDEX', 'UNIQUE'].concat(ix.fixed ? [ix.type] : []).map((x) => h('option', { selected: x === ix.type }, x)));
      type.onchange = () => { ix.type = type.value; };
      const tr = h('tr', { class: sel === ix ? 'sel' : '' }, h('td', {}, name), h('td', {}, type));
      tr.addEventListener('mousedown', () => { this.selIdx = ix; this.render(); });
      tb.appendChild(tr);
    }
    const add = h('tr', { class: 'wb-te-new' }, h('td', { colspan: 2 }, h('span', { class: 'muted' }, 'click to add an index')));
    add.onclick = () => { const ix = { name: `${this.name}_idx${this.indexes.length + 1}`, type: 'INDEX', cols: [], orig: null }; this.indexes.push(ix); this.selIdx = ix; this.render(); };
    tb.appendChild(add);
    t.appendChild(tb);
    const colsBox = h('div', { class: 'wb-te-cols' }, h('div', { class: 'wb-te-cols-head' }, 'Index Columns'));
    if (sel) {
      for (const c of this.columns) {
        const cb = h('input', { type: 'checkbox', checked: sel.cols.some((x) => lc(x) === lc(c.name)), disabled: sel.fixed });
        cb.onchange = () => { if (cb.checked) sel.cols.push(c.name); else sel.cols = sel.cols.filter((x) => lc(x) !== lc(c.name)); };
        colsBox.appendChild(h('label', { class: 'wb-te-colrow' }, cb, ' ', c.name));
      }
      if (!sel.fixed) colsBox.appendChild(h('button', { class: 'lab-btn', onclick: () => { this.indexes.splice(this.indexes.indexOf(sel), 1); this.selIdx = null; this.render(); } }, 'Delete Index'));
    } else colsBox.appendChild(h('div', { class: 'muted' }, 'Bir dizin seçin.'));
    list.append(h('div', { class: 'wb-te-scroll' }, t), colsBox);
    body.appendChild(list);
  }

  renderFks(body) {
    const ctx = this.conn.lab.server.getDb(this.db);
    const tables = Object.keys(ctx?.meta.tables || {}).sort();
    const sel = this.selFk ?? null;
    const t = h('table', { class: 'wb-te-grid' }, h('thead', {}, h('tr', {}, h('th', {}, 'Foreign Key Name'), h('th', {}, 'Referenced Table'))));
    const tb = h('tbody');
    for (const f of this.fks) {
      const name = h('input', { class: 'wb-te-in', value: f.name });
      name.oninput = () => { f.name = name.value.trim(); };
      const ref = h('select', { class: 'wb-te-in' }, h('option', { value: '' }, ''), ...tables.map((x) => h('option', { value: x, selected: lc(x) === lc(f.refTable) }, `\`${this.db}\`.\`${x}\``)));
      ref.onchange = () => { f.refTable = ref.value; f.refCols = f.cols.map(() => ''); this.render(); };
      const tr = h('tr', { class: sel === f ? 'sel' : '' }, h('td', {}, name), h('td', {}, ref));
      tr.addEventListener('mousedown', (e) => { if (e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT') { this.selFk = f; return; } this.selFk = f; this.render(); });
      tb.appendChild(tr);
    }
    const add = h('tr', { class: 'wb-te-new' }, h('td', { colspan: 2 }, h('span', { class: 'muted' }, 'click to add a foreign key')));
    add.onclick = () => {
      let n = `fk_${this.name}_${this.fks.length + 1}`;
      const f = { name: n, refTable: '', cols: [], refCols: [], onDelete: 'NO ACTION', onUpdate: 'NO ACTION', orig: null };
      this.fks.push(f);
      this.selFk = f;
      this.render();
    };
    tb.appendChild(add);
    t.appendChild(tb);
    const right = h('div', { class: 'wb-te-cols' });
    if (sel) {
      const parent = ctx?.meta.tables[lc(sel.refTable)];
      const map = h('table', { class: 'wb-te-grid' }, h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', {}, 'Column'), h('th', {}, 'Referenced Column'))));
      const mb = h('tbody');
      for (const c of this.columns) {
        const i = sel.cols.findIndex((x) => lc(x) === lc(c.name));
        const cb = h('input', { type: 'checkbox', checked: i >= 0 });
        const rc = h('select', { class: 'wb-te-in', disabled: i < 0 }, h('option', { value: '' }, ''), ...(parent ? parent.columns.map((p) => h('option', { value: p.name, selected: i >= 0 && lc(sel.refCols[i] || '') === lc(p.name) }, p.name)) : []));
        cb.onchange = () => {
          if (cb.checked) {
            sel.cols.push(c.name);
            const guess = parent?.columns.find((p) => lc(p.name) === lc(c.name)) || parent?.columns.find((p) => parent.pk.includes(p.name));
            sel.refCols.push(guess?.name || '');
          } else {
            const k = sel.cols.findIndex((x) => lc(x) === lc(c.name));
            sel.cols.splice(k, 1);
            sel.refCols.splice(k, 1);
          }
          this.render();
        };
        rc.onchange = () => { const k = sel.cols.findIndex((x) => lc(x) === lc(c.name)); if (k >= 0) sel.refCols[k] = rc.value; };
        mb.appendChild(h('tr', {}, h('td', { class: 'c' }, cb), h('td', {}, c.name), h('td', {}, rc)));
      }
      map.appendChild(mb);
      const act = (label, key) => {
        const s = h('select', { class: 'lab-input' }, ...FK_ACTIONS.map((a) => h('option', { selected: a === sel[key] }, a)));
        s.onchange = () => { sel[key] = s.value; };
        return h('div', { class: 'wb-form-row' }, h('label', {}, label), s);
      };
      right.append(h('div', { class: 'wb-te-cols-head' }, 'Column / Referenced Column'), map,
        h('div', { class: 'wb-te-cols-head' }, 'Foreign Key Options'), act('On Update:', 'onUpdate'), act('On Delete:', 'onDelete'),
        h('button', { class: 'lab-btn', onclick: () => { this.fks.splice(this.fks.indexOf(sel), 1); this.selFk = null; this.render(); } }, 'Delete Foreign Key'));
      if (!parent) right.appendChild(h('div', { class: 'muted' }, 'Önce başvurulan (referenced) tabloyu seçin.'));
    } else right.appendChild(h('div', { class: 'muted' }, 'Bir yabancı anahtar seçin ya da ekleyin. İlişki kurulacak tablo aynı şemada olmalıdır.'));
    body.appendChild(h('div', { class: 'wb-te-list' }, h('div', { class: 'wb-te-scroll' }, t), right));
  }

  fkSql(f) {
    return `CONSTRAINT ${bq(f.name)}\n    FOREIGN KEY (${f.cols.map(bq).join(' , ')})\n    REFERENCES ${bq(this.db)}.${bq(f.refTable)} (${f.refCols.map(bq).join(' , ')})\n    ON DELETE ${f.onDelete}\n    ON UPDATE ${f.onUpdate}`;
  }

  buildSql() {
    const t = `${bq(this.db)}.${bq(this.name)}`;
    const cols = this.columns.filter((c) => c.name);
    if (!this.orig) {
      const lines = cols.map((c) => '  ' + colSql(c));
      const pk = cols.filter((c) => c.pk);
      if (pk.length) lines.push(`  PRIMARY KEY (${pk.map((c) => bq(c.name)).join(', ')})`);
      for (const c of cols) if (c.uq) lines.push(`  UNIQUE INDEX ${bq(c.name + '_UNIQUE')} (${bq(c.name)} ASC) VISIBLE`);
      for (const ix of this.indexes) if (ix.cols.length) lines.push(`  ${ix.type === 'UNIQUE' ? 'UNIQUE INDEX' : 'INDEX'} ${bq(ix.name)} (${ix.cols.map((x) => bq(x) + ' ASC').join(', ')}) VISIBLE`);
      for (const f of this.fks) if (f.refTable && f.cols.length) lines.push(`  INDEX ${bq(f.name + '_idx')} (${f.cols.map((x) => bq(x) + ' ASC').join(', ')}) VISIBLE`);
      for (const f of this.fks) if (f.refTable && f.cols.length) lines.push('  ' + this.fkSql(f));
      let sql = `CREATE TABLE ${t} (\n${lines.join(',\n')})`;
      if (this.engine !== 'InnoDB') sql += `\nENGINE = ${this.engine}`;
      if (this.collation !== 'Default Collation') sql += `\nDEFAULT CHARACTER SET = utf8mb4\nCOLLATE = ${this.collation}`;
      if (this.comment) sql += `\nCOMMENT = ${mysqlString(this.comment)}`;
      return sql + ';\n';
    }
    // ALTER
    const o = this.orig;
    const ot = `${bq(this.db)}.${bq(o.name)}`;
    const stmts = [];
    const dropFks = o.fks.filter((f) => {
      const n = this.fks.find((x) => x.orig === f.name);
      return !n || n.name !== f.name || lc(n.refTable) !== lc(f.refTable) || n.cols.join() !== f.cols.join() || n.refCols.join() !== f.refCols.join() || n.onDelete !== (f.onDelete || 'NO ACTION') || n.onUpdate !== (f.onUpdate || 'NO ACTION');
    });
    if (dropFks.length) stmts.push(`ALTER TABLE ${ot} \n${dropFks.map((f) => `DROP FOREIGN KEY ${bq(f.name)}`).join(',\n')};`);
    const specs = [];
    const oldPk = o.pk.map(lc).join(',');
    const newPk = cols.filter((c) => c.pk).map((c) => lc(c.name)).join(',');
    if (oldPk !== newPk && o.pk.length) specs.push('DROP PRIMARY KEY');
    const origCols = new Map(o.columns.map((c) => [c.name, c]));
    const pkSet = new Set(o.pk.map(lc));
    const uqOld = new Map(o.uniques.filter((u) => u.cols.length === 1).map((u) => [lc(u.cols[0]), u.name]));
    for (const oc of o.columns) if (!cols.some((c) => c.orig === oc.name)) specs.push(`DROP COLUMN ${bq(oc.name)}`);
    const keptOld = o.columns.filter((x) => cols.some((y) => y.orig === x.name)).map((x) => x.name);
    const keptNew = cols.filter((x) => x.orig).map((x) => x.orig);
    cols.forEach((c, i) => {
      const after = i === 0 ? ' FIRST' : ` AFTER ${bq(cols[i - 1].name)}`;
      if (!c.orig) { specs.push(`ADD COLUMN ${colSql(c)}${after}`); return; }
      const oc = origCols.get(c.orig);
      const before = colSql({ name: oc.name, type: wbType(oc), pk: pkSet.has(lc(oc.name)), nn: !!oc.notNull, un: !!oc.unsigned, zf: !!oc.zerofill, ai: !!oc.autoInc, def: wbDefault(oc), comment: oc.comment || '' });
      const moved = keptOld.indexOf(c.orig) !== keptNew.indexOf(c.orig);
      if (colSql(c) !== before || c.name !== c.orig || moved) specs.push(`CHANGE COLUMN ${bq(c.orig)} ${colSql(c)}${moved ? after : ''}`);
    });
    if (oldPk !== newPk && newPk) specs.push(`ADD PRIMARY KEY (${cols.filter((c) => c.pk).map((c) => bq(c.name)).join(', ')})`);
    for (const c of cols) {
      const had = c.orig ? uqOld.get(lc(c.orig)) : null;
      if (c.uq && !had) specs.push(`ADD UNIQUE INDEX ${bq(c.name + '_UNIQUE')} (${bq(c.name)} ASC) VISIBLE`);
      if (!c.uq && had) specs.push(`DROP INDEX ${bq(had)}`);
    }
    const oldIdx = [...o.uniques.filter((u) => u.cols.length > 1), ...o.indexes.filter((u) => !(this.fkIndexes || []).includes(u.name))];
    for (const ix of oldIdx) {
      const n = this.indexes.find((x) => x.orig === ix.name);
      if (!n || n.name !== ix.name || n.cols.join() !== ix.cols.join() || (n.type === 'UNIQUE') !== o.uniques.includes(ix)) specs.push(`DROP INDEX ${bq(ix.name)}`);
    }
    for (const ix of this.indexes) {
      const old = oldIdx.find((x) => x.name === ix.orig);
      if (ix.cols.length && (!old || old.name !== ix.name || old.cols.join() !== ix.cols.join() || (ix.type === 'UNIQUE') !== o.uniques.includes(old))) specs.push(`ADD ${ix.type === 'UNIQUE' ? 'UNIQUE INDEX' : 'INDEX'} ${bq(ix.name)} (${ix.cols.map((x) => bq(x) + ' ASC').join(', ')}) VISIBLE`);
    }
    if (this.comment !== (o.comment || '')) specs.push(`COMMENT = ${mysqlString(this.comment)}`);
    if (this.name !== o.name) specs.push(`RENAME TO ${t}`);
    if (specs.length) stmts.push(`ALTER TABLE ${ot} \n${specs.join(' ,\n')};`);
    const addFks = this.fks.filter((f) => f.refTable && f.cols.length && (!f.orig || dropFks.some((d) => d.name === f.orig)));
    if (addFks.length) stmts.push(`ALTER TABLE ${t} \n${addFks.map((f) => 'ADD ' + this.fkSql(f)).join(',\n')};`);
    return stmts.join('\n');
  }

  async apply() {
    if (!this.name) { await this.conn.desk.message({ title: 'Apply', text: 'Tablo adı boş olamaz.', icon: 'error', owner: this.conn.win }); return; }
    if (!this.columns.length) { await this.conn.desk.message({ title: 'Apply', text: 'Tabloda en az bir sütun olmalıdır.', icon: 'error', owner: this.conn.win }); return; }
    const bad = this.fks.find((f) => f.cols.length && (!f.refTable || f.refCols.some((x) => !x)));
    if (bad) { await this.conn.desk.message({ title: 'Foreign Key', text: `"${bad.name}" yabancı anahtarı için başvurulan tablo ve sütunları seçin.`, icon: 'warning', owner: this.conn.win }); return; }
    const sql = this.buildSql();
    if (!sql.trim()) { await this.conn.desk.message({ title: 'Apply Changes to Object', text: 'No changes detected.', icon: 'info', owner: this.conn.win }); return; }
    const res = await this.conn.applyScript(sql);
    if (res?.ok) {
      this.origName = this.name.toLowerCase();
      this.load();
      this.render();
      this.conn.renderTabs();
    }
  }
}

function normalizeType(v) {
  let s = v.trim();
  // tırnak dışını büyük harfe çevir
  s = s.replace(/'[^']*'|[^']+/g, (m) => (m.startsWith("'") ? m : m.toUpperCase()));
  if (s === 'VARCHAR') s = 'VARCHAR(45)';
  return s;
}

export class SchemaEditor {
  constructor(conn, db) {
    this.conn = conn;
    this.db = db;
    this.icon = ICONS.db;
    const ctx = db ? conn.lab.server.getDb(db) : null;
    this.name = db || 'new_schema';
    this.collation = ctx && ctx.meta.collation !== 'utf8mb4_0900_ai_ci' ? ctx.meta.collation : 'Default Collation';
    this.el = h('div', { class: 'wb-tabled' });
    this.render();
  }

  get title() { return `${this.name} - Schema`; }
  focus() { this.el.querySelector('input')?.focus(); }

  render() {
    this.el.innerHTML = '';
    const name = h('input', { class: 'lab-input', value: this.name, disabled: !!this.db });
    name.oninput = () => { this.name = name.value.trim(); this.conn.renderTabs(); };
    const coll = h('select', { class: 'lab-input' }, ...COLLATIONS.map((c) => h('option', { selected: c === this.collation }, c)));
    coll.onchange = () => { this.collation = coll.value; };
    this.el.append(h('div', { class: 'wb-te-head' }, h('div', { class: 'wb-te-ico', html: ICONS.db }),
      h('div', { class: 'wb-te-form' }, h('label', {}, 'Name:'), name, h('label', {}, 'Charset/Collation:'), coll,
        h('div', { class: 'wb-te-note' }, this.db ? 'Şema adı değiştirilemez (MySQL\'de RENAME DATABASE yoktur).' : 'Şema (schema) MySQL\'de veritabanı ile aynı anlamdadır. Ad küçük harfe çevrilerek kaydedilir.'))),
    h('div', { class: 'spacer' }),
    h('div', { class: 'wb-te-foot' }, h('div', { class: 'spacer' }), h('button', { class: 'lab-btn primary', onclick: () => this.apply() }, 'Apply'), h('button', { class: 'lab-btn', onclick: () => this.conn.closeTab(this) }, 'Revert')));
    setTimeout(() => { if (!this.db) { name.focus(); name.select(); } }, 0);
  }

  async apply() {
    const coll = this.collation !== 'Default Collation' ? ` DEFAULT CHARACTER SET ${this.collation.split('_')[0]} COLLATE ${this.collation}` : '';
    let sql;
    if (this.db) {
      if (!coll) { await this.conn.desk.message({ title: 'Apply Changes to Object', text: 'No changes detected.', icon: 'info', owner: this.conn.win }); return; }
      sql = `ALTER SCHEMA ${bq(this.db)} ${coll.trim()} ;\n`;
    } else sql = `CREATE SCHEMA ${bq(this.name)}${coll} ;\n`;
    const res = await this.conn.applyScript(sql);
    if (res?.ok) this.conn.closeTab(this);
  }
}
