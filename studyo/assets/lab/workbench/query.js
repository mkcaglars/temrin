// Workbench sorgu sekmesi: SQL düzenleyici, araç çubuğu, sonuç tablosu (düzenlenebilir) ve uygulama.
import { h } from '../../js/ui.js';
import { ICONS } from '../icons.js';
import { createSqlEditor } from './sqleditor.js';
import { splitStatements, statementAt } from '../mysql/lexer.js';
import { displayValue } from '../mysql/engine.js';
import { applyScriptWizard } from './review.js';
import { showMenu, downloadText } from '../desktop.js';

const bq = (s) => '`' + String(s).replace(/`/g, '``') + '`';
const wbValue = (v) => (v === null ? 'NULL' : "'" + String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'");

export class QueryTab {
  constructor(conn, { title, text = '', file = null, autoRun = false } = {}) {
    this.conn = conn;
    this.title = title || conn.nextQueryTitle();
    this.file = file;
    this.dirty = false;
    this.results = [];
    this.el = h('div', { class: 'wb-query' });
    this.build(text, autoRun);
  }

  async build(text, autoRun) {
    const c = this.conn;
    const tb = (icon, title, fn, cls = '') => h('button', { class: 'wb-tool ' + cls, title, html: ICONS[icon] || icon, onclick: fn });
    this.limitSel = h('select', { class: 'wb-limit', title: 'Sorgu sonuçlarını sınırla' },
      ...[['Don\'t Limit', 0], ['Limit to 10 rows', 10], ['Limit to 50 rows', 50], ['Limit to 100 rows', 100], ['Limit to 200 rows', 200], ['Limit to 300 rows', 300], ['Limit to 500 rows', 500], ['Limit to 1000 rows', 1000], ['Limit to 2000 rows', 2000], ['Limit to 5000 rows', 5000], ['Limit to 50000 rows', 50000]]
        .map(([t, v]) => h('option', { value: v, selected: v === c.prefs.limitRows }, t)));
    this.limitSel.onchange = () => { c.prefs.limitRows = Number(this.limitSel.value); c.store.touch(); };
    this.stopBtn = tb(c.prefs.stopOnError ? 'stop' : 'stop', 'Toggle whether execution of SQL script should continue after failed statements', () => {
      c.prefs.stopOnError = !c.prefs.stopOnError;
      this.stopBtn.classList.toggle('on', c.prefs.stopOnError);
      c.store.touch();
    }, 'wb-stop-toggle' + (c.prefs.stopOnError ? ' on' : ''));
    this.toolbar = h('div', { class: 'wb-qtools' },
      tb('open', 'Open a script file in this editor', () => this.openFile()),
      tb('save', 'Save the script to a file', () => this.save()),
      h('span', { class: 'wb-sep' }),
      tb('bolt', 'Execute the selected portion of the script or everything, if there is no selection (Ctrl+Shift+Enter)', () => this.run('all')),
      tb('boltCursor', 'Execute the statement under the keyboard cursor (Ctrl+Enter)', () => this.run('current')),
      tb('explain', 'Execute the EXPLAIN command on the statement under the cursor', () => c.desk.message({ title: 'MySQL Workbench', text: 'Visual Explain bu simülatörde gösterilmiyor.', icon: 'info', owner: c.win })),
      h('span', { class: 'wb-sep' }),
      this.stopBtn,
      tb('commit', 'Commit the current transaction', () => this.exec('COMMIT')),
      tb('rollback', 'Rollback the current transaction', () => this.exec('ROLLBACK')),
      h('span', { class: 'wb-sep' }),
      this.limitSel,
      tb('beautify', 'Beautify/reformat the SQL script', () => this.beautify()),
    );
    const edHost = h('div', { class: 'wb-editor' });
    this.resultArea = h('div', { class: 'wb-results hidden' });
    const split = h('div', { class: 'wb-hsplit', title: 'Sürükleyerek boyutlandır' });
    this.el.append(this.toolbar, edHost, split, this.resultArea);
    this.splitter(split, edHost);
    this.editor = await createSqlEditor(edHost, text, {
      onChange: () => { if (!this.dirty) { this.dirty = true; c.renderTabs(); } this.saveDraft(); },
      onRun: (mode) => this.run(mode),
    });
    if (autoRun) this.run('all');
  }

  splitter(bar, top) {
    bar.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const start = e.clientY;
      const h0 = top.getBoundingClientRect().height;
      const move = (ev) => { top.style.flex = `0 0 ${Math.max(60, h0 + ev.clientY - start)}px`; this.editor?.layout(); };
      const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    });
  }

  saveDraft() {
    clearTimeout(this.draftTimer);
    this.draftTimer = setTimeout(() => {
      const st = this.conn.store.state;
      st.queryTabs[this.conn.conn.id] ??= {};
      st.queryTabs[this.conn.conn.id][this.title] = this.editor.getValue();
      this.conn.store.touch();
    }, 800);
  }

  focus() { this.editor?.focus(); this.editor?.layout(); }

  async openFile() {
    const p = await this.conn.desk.fileDialog({ mode: 'open', filter: ['sql', 'txt'], filterLabel: 'SQL Files (*.sql)', owner: this.conn.win });
    if (!p) return;
    this.conn.openQuery({ title: p.split('/').pop(), text: this.conn.store.readFile(p) || '', file: p });
  }

  async save(as = false) {
    let p = this.file;
    if (!p || as) {
      p = await this.conn.desk.fileDialog({ mode: 'save', name: (this.file ? this.file.split('/').pop() : this.title.replace(/\s+/g, '_')) + (this.file ? '' : '.sql'), filter: ['sql'], filterLabel: 'SQL Files (*.sql)', owner: this.conn.win });
      if (!p) return false;
    }
    this.file = p;
    this.conn.store.writeFile(p, this.editor.getValue());
    this.title = p.split('/').pop();
    this.dirty = false;
    this.conn.renderTabs();
    return true;
  }

  beautify() {
    const KW = ['SELECT', 'FROM', 'WHERE', 'GROUP BY', 'HAVING', 'ORDER BY', 'LIMIT', 'INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'JOIN', 'VALUES', 'SET', 'UNION'];
    const parts = splitStatements(this.editor.getValue()).map((st) => {
      let s = st.sql.replace(/\s+/g, ' ').trim();
      for (const k of KW) s = s.replace(new RegExp('\\s+' + k.replace(' ', '\\s+') + '\\b', 'gi'), '\n' + k);
      return s + ';';
    });
    this.editor.setValue(parts.join('\n\n'));
  }

  exec(sql) {
    return this.runText(sql, 0);
  }

  /** mode: 'all' (seçim ya da tümü) | 'current' (imleçteki komut) */
  run(mode) {
    if (!this.editor) return;
    let text;
    let base = 0;
    const full = this.editor.getValue();
    if (mode === 'current') {
      const st = statementAt(full, this.editor.getCursorOffset());
      if (!st) return;
      text = st.sql;
      base = st.s;
    } else {
      text = this.editor.getSelectionText() || full;
      if (text !== full) base = Math.max(0, full.indexOf(text));
    }
    if (!text.trim()) return;
    this.runText(text, base);
  }

  runText(text, base) {
    const c = this.conn;
    const s = c.session;
    if (!s) return;
    s.limitRows = Number(this.limitSel?.value ?? c.prefs.limitRows) || 0;
    const results = s.execute(text, { stopOnError: c.prefs.stopOnError });
    let schemaChanged = false;
    const grids = [];
    for (const r of results) {
      let action = r.sql.replace(/\s+/g, ' ');
      if (r.limited || (r.rows && s.limitRows && /^\s*select\b/i.test(r.sql) && !/\blimit\b/i.test(r.sql))) action += ` LIMIT 0, ${s.limitRows}`;
      c.output(r.ok, action, r.message, r.ms);
      if (r.schema) schemaChanged = true;
      if (r.useDb) c.setDefaultSchema(r.useDb, false);
      if (r.ok && r.rows) grids.push(r);
      c.lab.events.emit('query', { sql: r.sql, result: r, session: s, connection: c.conn });
    }
    const last = results[results.length - 1];
    this.editor.mark?.(last ? base + last.s : null, last?.ok);
    if (schemaChanged) c.refreshTree();
    if (grids.length) this.showResults(grids);
    else if (results.some((r) => r.ok)) this.resultArea.classList.add('hidden');
    return results;
  }

  showResults(list) {
    this.results = list;
    this.resultArea.classList.remove('hidden');
    this.resultArea.innerHTML = '';
    const tabs = h('div', { class: 'wb-rtabs' });
    const body = h('div', { class: 'wb-rbody' });
    let n = 0;
    const counts = new Map();
    const views = list.map((r) => {
      n++;
      let label = `Result ${n}`;
      if (r.editable) {
        const k = (counts.get(r.editable.table) || 0) + 1;
        counts.set(r.editable.table, k);
        label = `${r.editable.table} ${k}`;
      }
      return { r, label, grid: null };
    });
    const show = (i) => {
      tabs.querySelectorAll('.wb-rtab').forEach((t, k) => t.classList.toggle('active', k === i));
      body.innerHTML = '';
      const v = views[i];
      v.grid ??= new ResultGrid(this, v.r);
      body.appendChild(v.grid.el);
    };
    views.forEach((v, i) => tabs.appendChild(h('button', { class: 'wb-rtab', onclick: () => show(i) }, v.label)));
    this.resultArea.append(tabs, body);
    show(views.length - 1);
  }
}

/** Sonuç tablosu. Sorgu düzenlenebilirse hücreler değiştirilebilir, satır eklenip silinebilir. */
export class ResultGrid {
  constructor(tab, result) {
    this.tab = tab;
    this.conn = tab.conn;
    this.result = result;
    this.edit = result.editable;
    this.rows = result.rows.map((r) => ({ orig: r, vals: r.slice(), state: 'same' }));
    this.filter = '';
    this.el = h('div', { class: 'wb-grid-wrap' });
    this.render();
  }

  get changed() {
    return this.rows.some((r) => r.state !== 'same' || r.vals.some((v, i) => v !== r.orig?.[i]));
  }

  render() {
    const cols = this.result.columns;
    const f = h('input', { class: 'wb-grid-filter', placeholder: 'Filter Rows:', value: this.filter });
    f.oninput = () => { this.filter = f.value; this.renderBody(); };
    this.applyBtn = h('button', { class: 'lab-btn', disabled: true, onclick: () => this.apply() }, 'Apply');
    this.revertBtn = h('button', { class: 'lab-btn', disabled: true, onclick: () => { this.rows = this.result.rows.map((r) => ({ orig: r, vals: r.slice(), state: 'same' })); this.renderBody(); } }, 'Revert');
    const tools = h('div', { class: 'wb-grid-tools' },
      h('span', { class: 'wb-grid-label' }, 'Result Grid'), h('span', { class: 'wb-sep' }), f,
      this.edit ? h('span', { class: 'wb-grid-edit' }, 'Edit:',
        h('button', { class: 'wb-tool', title: 'Edit current row', html: ICONS.wrench, onclick: () => this.editSelected() }),
        h('button', { class: 'wb-tool', title: 'Insert new row', html: ICONS.tableNew, onclick: () => this.addRow() }),
        h('button', { class: 'wb-tool', title: 'Delete selected rows', html: ICONS.rollback, onclick: () => this.deleteSelected() })) : h('span', { class: 'wb-grid-ro', title: 'Sonuç kümesi düzenlenemez: tek bir tablodan, birincil anahtar sütununu da içeren bir SELECT olmalıdır.' }, 'Read Only'),
      h('span', { class: 'wb-sep' }),
      h('button', { class: 'wb-tool', title: 'Export recordset to an external file', html: ICONS.save, onclick: (e) => this.exportMenu(e) }),
      h('div', { class: 'spacer' }),
      h('button', { class: 'wb-tool wb-mode' + (this.mode !== 'form' ? ' on' : ''), title: 'Result Grid', html: ICONS.grid, onclick: () => { this.mode = 'grid'; this.render(); } }),
      h('button', { class: 'wb-tool wb-mode' + (this.mode === 'form' ? ' on' : ''), title: 'Form Editor', html: ICONS.wrench, onclick: () => { this.mode = 'form'; this.render(); } }));
    this.table = h('table', { class: 'wb-grid' });
    const head = h('tr', {}, h('th', { class: 'wb-grid-rh' }), ...cols.map((c) => h('th', { title: c.table ? `${c.table}.${c.column} (${c.type})` : c.type }, c.name)));
    this.table.appendChild(h('thead', {}, head));
    this.tbody = h('tbody');
    this.table.appendChild(this.tbody);
    this.foot = h('div', { class: 'wb-grid-foot' }, h('span', { class: 'wb-grid-count' }), h('div', { class: 'spacer' }), this.edit ? this.applyBtn : null, this.edit ? this.revertBtn : null);
    this.el.innerHTML = '';
    if (this.mode === 'form') {
      this.formHost = h('div', { class: 'wb-grid-scroll wb-form-ed' });
      this.el.append(tools, this.formHost, this.foot);
      this.renderForm();
      this.renderBody(true);
      return;
    }
    this.el.append(tools, h('div', { class: 'wb-grid-scroll' }, this.table), this.foot);
    this.renderBody();
  }

  /** Form Editor: tek kayıt, alan alan (Workbench sağdaki "Form Editor" görünümü) */
  renderForm() {
    const cols = this.result.columns;
    const list = this.rows.filter((r) => r.state !== 'deleted');
    this.formIndex = Math.min(Math.max(0, this.formIndex ?? (this.rows.findIndex((r) => r.sel) >= 0 ? list.indexOf(this.rows.find((r) => r.sel)) : 0)), Math.max(0, list.length - 1));
    const row = list[this.formIndex];
    const go = (i) => { this.formIndex = i; this.renderForm(); };
    const nav = h('div', { class: 'wb-form-nav' },
      h('button', { class: 'lab-btn', disabled: !row || this.formIndex === 0, onclick: () => go(0) }, '⏮'),
      h('button', { class: 'lab-btn', disabled: !row || this.formIndex === 0, onclick: () => go(this.formIndex - 1) }, '◀'),
      h('span', {}, row ? `${this.formIndex + 1} / ${list.length}` : '0 / 0'),
      h('button', { class: 'lab-btn', disabled: !row || this.formIndex >= list.length - 1, onclick: () => go(this.formIndex + 1) }, '▶'),
      h('button', { class: 'lab-btn', disabled: !row || this.formIndex >= list.length - 1, onclick: () => go(list.length - 1) }, '⏭'),
      this.edit ? h('button', { class: 'lab-btn', onclick: () => { this.addRow(); this.formIndex = this.rows.filter((r) => r.state !== 'deleted').length - 1; this.renderForm(); } }, 'Yeni kayıt') : null,
      this.edit && row ? h('button', { class: 'lab-btn', onclick: () => { row.sel = true; this.deleteSelected(); this.renderForm(); } }, 'Sil') : null);
    const grid = h('div', { class: 'wb-form-fields' });
    if (row) {
      cols.forEach((c, ci) => {
        const v = row.vals[ci];
        const inp = h('input', { class: 'lab-input' + (v == null ? ' null' : ''), value: v == null ? '' : displayValue(v, c), placeholder: v == null ? 'NULL' : '', readOnly: !this.edit });
        inp.onchange = () => {
          row.vals[ci] = inp.value === '' && !c.notNull ? null : inp.value;
          if (row.state === 'same') row.state = 'mod';
          this.renderBody(true);
        };
        grid.append(h('label', { title: c.table ? `${c.table}.${c.column}` : '' }, c.name + ':'), inp, h('span', { class: 'muted small' }, (c.type || '') + (c.len ? `(${c.len}${c.scale != null ? ',' + c.scale : ''})` : '')));
      });
    }
    this.formHost.innerHTML = '';
    this.formHost.append(nav, grid);
  }

  exportMenu(e) {
    const formats = [
      ['CSV', 'csv', 'CSV (*.csv)'], ['CSV (; separated)', 'csv', 'CSV (; separated) (*.csv)'], ['Tab separated', 'tsv', 'Tab separated (*.tsv)'],
      ['HTML', 'html', 'HTML (*.html)'], ['JSON', 'json', 'JSON (*.json)'], ['XML', 'xml', 'XML (*.xml)'], ['SQL INSERT statements', 'sql', 'SQL INSERT statements (*.sql)'],
    ];
    showMenu(e.clientX, e.clientY, formats.map(([label, ext, fl]) => [label, () => this.exportAs(label, ext, fl)]));
  }

  formatResult(kind) {
    const cols = this.result.columns;
    const rows = this.rows.filter((r) => r.state !== 'new' && r.state !== 'deleted').map((r) => r.vals);
    const disp = (v, i) => (v == null ? null : displayValue(v, cols[i]));
    const xmlEsc = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const table = this.edit?.table || cols.find((c) => c.table)?.table || 'result';
    switch (kind) {
      case 'CSV':
      case 'CSV (; separated)': {
        const sep = kind === 'CSV' ? ',' : ';';
        const esc = (v) => (v == null ? '' : new RegExp(`["\n${sep}]`).test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v));
        return [cols.map((c) => esc(c.name)).join(sep), ...rows.map((r) => r.map((v, i) => esc(disp(v, i))).join(sep))].join('\r\n');
      }
      case 'Tab separated':
        return [cols.map((c) => c.name).join('\t'), ...rows.map((r) => r.map((v, i) => (v == null ? 'NULL' : String(disp(v, i)).replace(/[\t\n]/g, ' '))).join('\t'))].join('\r\n');
      case 'HTML':
        return `<!DOCTYPE html>\n<html>\n<head>\n<meta charset="utf-8">\n<title>${xmlEsc(table)}</title>\n<style>table{border-collapse:collapse}th,td{border:1px solid #999;padding:3px 6px}th{background:#ddd}</style>\n</head>\n<body>\n<table>\n<tr>${cols.map((c) => `<th>${xmlEsc(c.name)}</th>`).join('')}</tr>\n${rows.map((r) => `<tr>${r.map((v, i) => `<td>${v == null ? 'NULL' : xmlEsc(disp(v, i))}</td>`).join('')}</tr>`).join('\n')}\n</table>\n</body>\n</html>\n`;
      case 'JSON':
        return JSON.stringify(rows.map((r) => Object.fromEntries(r.map((v, i) => [cols[i].name, v == null ? null : typeof v === 'number' && !['decimal'].includes(cols[i].type) ? v : disp(v, i)]))), null, 2);
      case 'XML':
        return `<?xml version="1.0" encoding="UTF-8"?>\n<DATA xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">\n${rows.map((r) => `  <ROW>\n${r.map((v, i) => (v == null ? `    <${cols[i].name} xsi:nil="true" />` : `    <${cols[i].name}>${xmlEsc(disp(v, i))}</${cols[i].name}>`)).join('\n')}\n  </ROW>`).join('\n')}\n</DATA>\n`;
      default: {
        const lit = (v, i) => (v == null ? 'NULL' : typeof v === 'number' ? disp(v, i) : `'${String(disp(v, i)).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`);
        return rows.map((r) => `INSERT INTO \`${table}\` (${cols.map((c) => '`' + c.name + '`').join(',')}) VALUES (${r.map(lit).join(',')});`).join('\n') + '\n';
      }
    }
  }

  exportAs(kind, ext, filterLabel) {
    const text = this.formatResult(kind);
    this.conn.desk.fileDialog({ mode: 'save', name: (this.edit?.table || 'result') + '.' + ext, filter: [ext], filterLabel, owner: this.conn.win }).then((p) => {
      if (!p) return;
      this.conn.store.writeFile(p, text);
      this.conn.lab.events.emit('result-export', { path: p, format: kind });
      this.conn.desk.message({ title: 'Export Resultset', text: `Kaydedildi: ${p.replace(/\//g, '\\')}`, icon: 'info', owner: this.conn.win, buttons: ['OK', { text: 'Bilgisayarıma indir', value: 'dl' }] }).then((r) => { if (r === 'dl') downloadText(p.split('/').pop(), text); });
    });
  }

  renderBody(countOnly = false) {
    const cols = this.result.columns;
    if (countOnly || this.mode === 'form') {
      const n = this.rows.filter((r) => r.state !== 'new').length;
      this.foot.querySelector('.wb-grid-count').textContent = `${cols.length} column(s), ${n} row(s)` + (this.result.limited ? ' (limited)' : '');
      this.applyBtn.disabled = !this.changed;
      this.revertBtn.disabled = !this.changed;
      if (this.mode === 'form' && !countOnly) this.renderForm();
      return;
    }
    const q = this.filter.trim().toLocaleLowerCase('tr');
    this.tbody.innerHTML = '';
    this.rows.forEach((row, ri) => {
      if (q && !row.vals.some((v) => v != null && String(v).toLocaleLowerCase('tr').includes(q))) return;
      const tr = h('tr', { class: 'wb-row ' + row.state + (row.sel ? ' sel' : '') });
      tr.appendChild(h('td', { class: 'wb-grid-rh', onclick: (e) => this.select(ri, e) }, row.state === 'new' ? '*' : row.state === 'deleted' ? '✕' : ''));
      cols.forEach((c, ci) => {
        const v = row.vals[ci];
        const changed = row.state !== 'new' && row.orig && v !== row.orig[ci];
        const td = h('td', { class: (v == null ? 'null' : '') + (changed ? ' changed' : '') + (typeof v === 'number' ? ' num' : '') }, v == null ? 'NULL' : displayValue(v, c));
        td.addEventListener('click', (e) => this.select(ri, e));
        if (this.edit && row.state !== 'deleted') td.addEventListener('dblclick', () => this.editCell(td, ri, ci));
        td.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          this.select(ri, e);
          const items = [['Copy Field', () => navigator.clipboard?.writeText(v == null ? '' : displayValue(v, c))], ['Copy Row', () => navigator.clipboard?.writeText(row.vals.map((x, i) => (x == null ? 'NULL' : displayValue(x, cols[i]))).join('\t'))]];
          if (this.edit) items.push(null, ['Set Field to NULL', () => { row.vals[ci] = null; if (row.state === 'same') row.state = 'mod'; this.renderBody(); }], ['Delete Row(s)', () => this.deleteSelected()]);
          showMenu(e.clientX, e.clientY, items);
        });
        tr.appendChild(td);
      });
      this.tbody.appendChild(tr);
    });
    if (this.edit) {
      // yeni kayıt satırı
      const tr = h('tr', { class: 'wb-row placeholder' }, h('td', { class: 'wb-grid-rh' }, '*'), ...cols.map((c, ci) => {
        const td = h('td', { class: 'null' }, 'NULL');
        td.addEventListener('dblclick', () => { const i = this.addRow(); const cell = this.tbody.rows[i]?.cells[ci + 1]; if (cell) this.editCell(cell, i, ci); });
        return td;
      }));
      this.tbody.appendChild(tr);
    }
    const n = this.rows.filter((r) => r.state !== 'new').length;
    this.foot.querySelector('.wb-grid-count').textContent = `${this.result.columns.length} column(s), ${n} row(s)` + (this.result.limited ? ' (limited)' : '');
    const ch = this.changed;
    this.applyBtn.disabled = !ch;
    this.revertBtn.disabled = !ch;
  }

  select(ri, e) {
    if (!e?.ctrlKey && !e?.shiftKey) this.rows.forEach((r) => { r.sel = false; });
    this.rows[ri].sel = !this.rows[ri].sel || !e?.ctrlKey;
    this.tbody.querySelectorAll('tr').forEach((tr, i) => tr.classList.toggle('sel', !!this.rows[i]?.sel));
  }

  editSelected() {
    const i = this.rows.findIndex((r) => r.sel);
    if (i < 0) return;
    const cell = this.tbody.rows[i]?.cells[1];
    if (cell) this.editCell(cell, i, 0);
  }

  addRow() {
    this.rows.push({ orig: null, vals: this.result.columns.map(() => null), state: 'new' });
    this.renderBody();
    return this.rows.length - 1;
  }

  deleteSelected() {
    for (let i = this.rows.length - 1; i >= 0; i--) {
      const r = this.rows[i];
      if (!r.sel) continue;
      if (r.state === 'new') this.rows.splice(i, 1);
      else r.state = 'deleted';
    }
    this.renderBody();
  }

  editCell(td, ri, ci) {
    const row = this.rows[ri];
    const col = this.result.columns[ci];
    const cur = row.vals[ci];
    const input = h('input', { class: 'wb-cell-input', value: cur == null ? '' : displayValue(cur, col) });
    td.textContent = '';
    td.appendChild(input);
    input.focus();
    input.select();
    let done = false;
    const commit = (save) => {
      if (done) return;
      done = true;
      if (save) {
        const v = input.value;
        const nv = v === '' && cur == null ? null : v;
        if (nv !== (cur == null ? null : displayValue(cur, col))) {
          row.vals[ci] = nv;
          if (row.state === 'same') row.state = 'mod';
        }
      }
      this.renderBody();
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); commit(true); }
      if (e.key === 'Escape') { e.preventDefault(); commit(false); }
      if (e.key === 'Tab') {
        e.preventDefault();
        commit(true);
        const next = ci + (e.shiftKey ? -1 : 1);
        if (next >= 0 && next < this.result.columns.length) { const cell = this.tbody.rows[ri]?.cells[next + 1]; if (cell) this.editCell(cell, ri, next); }
      }
    });
    input.addEventListener('blur', () => commit(true));
  }

  /** Değişikliklerden Workbench biçiminde SQL üretir */
  buildSql() {
    const { db, table, pk, pkIndex } = this.edit;
    const cols = this.result.columns;
    const t = `${bq(db)}.${bq(table)}`;
    const where = (row) => '(' + pk.map((p, k) => `${bq(p)} = ${wbValue(displayValue(row.orig[pkIndex[k]], cols[pkIndex[k]]))}`).join(' AND ') + ')';
    const out = [];
    for (const row of this.rows) {
      if (row.state === 'deleted') out.push(`DELETE FROM ${t} WHERE ${where(row)};`);
      else if (row.state === 'new') {
        const idx = cols.map((_, i) => i).filter((i) => row.vals[i] !== null && cols[i].column);
        if (!idx.length) continue;
        out.push(`INSERT INTO ${t} (${idx.map((i) => bq(cols[i].column)).join(', ')}) VALUES (${idx.map((i) => wbValue(row.vals[i])).join(', ')});`);
      } else if (row.state === 'mod') {
        const idx = cols.map((_, i) => i).filter((i) => row.vals[i] !== row.orig[i] && cols[i].column);
        if (!idx.length) continue;
        out.push(`UPDATE ${t} SET ${idx.map((i) => `${bq(cols[i].column)} = ${wbValue(row.vals[i])}`).join(', ')} WHERE ${where(row)};`);
      }
    }
    return out.join('\n');
  }

  async apply() {
    const sql = this.buildSql();
    if (!sql) return;
    const c = this.conn;
    const res = await applyScriptWizard(c.desk, c.win, {
      sql,
      run: (text) => {
        const results = c.session.execute(text, { stopOnError: true });
        for (const r of results) {
          c.output(r.ok, r.sql.replace(/\s+/g, ' '), r.message, r.ms);
          c.lab.events.emit('query', { sql: r.sql, result: r, session: c.session, connection: c.conn, fromGrid: true });
        }
        return results;
      },
    });
    if (res?.ok) {
      // sorguyu yeniden çalıştır
      const again = c.session.execute(this.result.sql)[0];
      if (again?.ok) {
        this.result = again;
        this.edit = again.editable;
        this.rows = again.rows.map((r) => ({ orig: r, vals: r.slice(), state: 'same' }));
        this.render();
      }
    }
  }

  exportCsv() { this.exportAs('CSV', 'csv', 'CSV (*.csv)'); }

}
