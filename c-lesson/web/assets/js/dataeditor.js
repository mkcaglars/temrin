// Proje veritabanı penceresi (okul.mdf): tablo tasarımı, veriler ve T-SQL betiği.
// Not: Veritabanı dosyası ekleme, veri kümesi sihirbazı ve alanları forma sürükleme Visual Studio'da (laboratuvarda) yapılır;
// burada yalnızca hazır veritabanının sütunları ve kayıtları düzenlenir.
import { h, toast, confirmBox } from './ui.js';
import { SQL_TYPE_LIST, hasLength, sqlTypeText, createTableSql, parseValue } from './datasetgen.js';
import { isIdentifier } from './templates.js';

export class DataEditor {
  /** @param host IDE: data, readonly, onDatabaseChanged(schemaChanged), renameDbColumn(table, old, new) */
  constructor(host) {
    this.host = host;
    this.view = 'data';
    this.tableIndex = 0;
    this.el = h('div', { class: 'dataed' });
  }

  get db() {
    return this.host.data.database;
  }

  get table() {
    return this.db.tables[Math.min(this.tableIndex, this.db.tables.length - 1)];
  }

  show(view) {
    if (view) this.view = view;
    this.render();
  }

  render() {
    const db = this.db;
    this.el.innerHTML = '';
    if (!db) {
      this.el.appendChild(h('div', { class: 'center-page muted' }, 'Bu projede veritabanı yok.'));
      return;
    }
    const t = this.table;
    const ro = this.host.readonly;
    const tableSel = h('select', { class: 'input dataed-table' }, db.tables.map((x, i) => h('option', { value: i, selected: i === this.tableIndex }, `dbo.${x.name}`)));
    tableSel.onchange = () => { this.tableIndex = Number(tableSel.value); this.render(); };
    const tab = (id, text) => h('button', { class: 'dataed-tab' + (this.view === id ? ' active' : ''), onclick: () => this.show(id) }, text);
    this.el.appendChild(h('div', { class: 'dataed-head' },
      h('span', { class: 'dataed-title' }, `\u{1F6E2} ${db.name}.mdf`), tableSel,
      h('div', { class: 'dataed-tabs' }, tab('data', '\u{1F4CB} Verileri Göster'), tab('design', '\u{1F527} Tablo Tasarımı'), tab('sql', 'T-SQL')),
      h('div', { class: 'spacer' }),
      h('span', { class: 'muted dataed-info' }, `${t.rows?.length || 0} kayıt · ${db.dataSet}`)));
    const body = h('div', { class: 'dataed-body' });
    this.el.appendChild(body);
    if (this.view === 'design') this.renderDesign(body, t, ro);
    else if (this.view === 'sql') body.appendChild(h('pre', { class: 'dataed-sql' }, createTableSql(t)));
    else this.renderData(body, t, ro);
  }

  // ------------------------------------------------------------------ tasarım

  renderDesign(body, t, ro) {
    const rows = t.columns.map((c, i) => {
      const name = h('input', { class: 'input', value: c.name, spellcheck: 'false', disabled: ro });
      name.onchange = () => {
        const v = name.value.trim();
        if (!isIdentifier(v) || t.columns.some((x, j) => j !== i && x.name.toLowerCase() === v.toLowerCase())) {
          toast('Geçersiz ya da kullanılan sütun adı.', 'error');
          name.value = c.name;
          return;
        }
        const old = c.name;
        c.name = v;
        this.host.renameDbColumn(t.name, old, v);
        this.changed(true);
      };
      const type = h('select', { class: 'input', disabled: ro }, SQL_TYPE_LIST.map((x) => h('option', { value: x, selected: x === c.type }, x)));
      type.onchange = () => {
        c.type = type.value;
        if (hasLength(c.type)) c.length ??= 50; else delete c.length;
        for (const r of t.rows || []) r[i] = r[i] == null ? null : parseValue(String(r[i]), c);
        this.changed(true);
        this.render();
      };
      const len = hasLength(c.type)
        ? h('input', { class: 'input', value: c.length === -1 ? 'MAX' : String(c.length ?? 50), disabled: ro, title: 'Uzunluk (MAX = sınırsız)' })
        : h('span', { class: 'muted' }, '');
      if (len.tagName === 'INPUT') {
        len.onchange = () => {
          const v = len.value.trim().toUpperCase();
          const n = v === 'MAX' ? -1 : parseInt(v, 10);
          if (!(n === -1 || (n > 0 && n <= 8000))) { toast('Uzunluk 1-8000 arası ya da MAX olmalı.', 'error'); len.value = c.length === -1 ? 'MAX' : String(c.length); return; }
          c.length = n;
          this.changed(true);
        };
      }
      const check = (prop, title, onChange) => {
        const cb = h('input', { type: 'checkbox', checked: !!(prop === 'nullable' ? c.nullable !== false && !c.pk : c[prop]), disabled: ro, title });
        cb.onchange = () => { onChange(cb.checked); this.changed(true); this.render(); };
        return h('span', { class: 'dataed-center' }, cb);
      };
      const nul = check('nullable', 'NULL değere izin ver', (v) => { c.nullable = v; });
      const pk = check('pk', 'Birincil anahtar (PRIMARY KEY)', (v) => { c.pk = v; if (v) c.nullable = false; });
      const auto = check('autoIncrement', 'DataSet\'te AutoIncrement (kayıt eklendikçe otomatik artar)', (v) => { c.autoIncrement = v; if (v) { c.seed ??= 1; c.step ??= 1; } });
      const num = (prop) => {
        const inp = h('input', { class: 'input', value: String(c[prop] ?? (prop === 'seed' ? 1 : 1)), disabled: ro || !c.autoIncrement });
        inp.onchange = () => { const n = parseInt(inp.value, 10); if (!Number.isFinite(n) || n === 0 && prop === 'step') { inp.value = String(c[prop] ?? 1); return; } c[prop] = n; this.changed(true); };
        return inp;
      };
      const del = h('button', { class: 'btn btn-small', title: 'Sütunu sil', disabled: ro }, '✕');
      del.onclick = async () => {
        if (!(await confirmBox('Sütunu sil', `"${c.name}" sütunu ve tüm kayıtlardaki değerleri silinecek. Formlardaki bağlamaları elle kaldırmanız gerekebilir.`, 'Sil', true))) return;
        t.columns.splice(i, 1);
        for (const r of t.rows || []) r.splice(i, 1);
        this.changed(true);
        this.render();
      };
      return h('div', { class: 'dataed-crow' }, name, type, len, nul, pk, auto, num('seed'), num('step'), del);
    });
    const add = h('button', { class: 'btn', disabled: ro }, '+ Sütun ekle');
    add.onclick = () => {
      let n = 1;
      while (t.columns.some((c) => c.name === 'Sutun' + n)) n++;
      t.columns.push({ name: 'Sutun' + n, type: 'varchar', length: 50 });
      for (const r of t.rows || []) r.push(null);
      this.changed(true);
      this.render();
    };
    body.appendChild(h('div', { class: 'dataed-design' },
      h('div', { class: 'dataed-crow dataed-chead' }, h('span', {}, 'Ad'), h('span', {}, 'Veri türü'), h('span', {}, 'Uzunluk'), h('span', {}, 'Null'), h('span', {}, 'Anahtar'),
        h('span', { title: 'OkulDataSet.xsd: AutoIncrement' }, 'Oto. artış'), h('span', {}, 'Seed'), h('span', {}, 'Step'), h('span', {}, '')),
      ...rows, add,
      h('p', { class: 'muted dataed-note' }, 'Oto. artış, Seed ve Step: Visual Studio\'da OkulDataSet.xsd üzerinden ayarlanan AutoIncrement, AutoIncrementSeed ve AutoIncrementStep özellikleridir. Sütun değişince veri kümesi kodu (', `${this.db.dataSet}.Designer.cs`, ') yeniden üretilir.')));
  }

  // ------------------------------------------------------------------ veriler

  renderData(body, t, ro) {
    t.rows ??= [];
    const cols = t.columns;
    const thead = h('tr', {}, h('th', { class: 'dataed-rh' }, ''), ...cols.map((c) => h('th', { title: sqlTypeText(c) }, c.name)), h('th', {}, ''));
    const tbody = h('tbody');
    t.rows.forEach((r, ri) => {
      const tr = h('tr', {}, h('td', { class: 'dataed-rh' }, String(ri + 1)));
      cols.forEach((c, ci) => {
        let input;
        if (c.type === 'bit') {
          input = h('input', { type: 'checkbox', checked: r[ci] === true, disabled: ro });
          input.indeterminate = r[ci] === null || r[ci] === undefined;
          input.onchange = () => { r[ci] = input.checked; this.changed(false); };
        } else if (c.type === 'image' || c.type === 'varbinary') {
          input = h('span', { class: 'muted' }, r[ci] ? '<ikili veri>' : 'NULL');
        } else {
          input = h('input', { class: 'dataed-cell' + (r[ci] == null ? ' null' : ''), value: r[ci] == null ? '' : String(r[ci]), placeholder: 'NULL', disabled: ro, spellcheck: 'false' });
          input.onchange = () => {
            const v = input.value;
            const val = v === '' ? null : parseValue(v, c);
            if (v !== '' && (val === null || (typeof val === 'number' && Number.isNaN(val)))) { toast(`"${v}" bu sütun için geçersiz (${sqlTypeText(c)}).`, 'error'); input.value = r[ci] == null ? '' : String(r[ci]); return; }
            if (val === null && (c.pk || c.nullable === false)) { toast(`${c.name} boş bırakılamaz.`, 'error'); input.value = r[ci] == null ? '' : String(r[ci]); return; }
            if (c.pk && t.rows.some((x, j) => j !== ri && x[ci] === val)) { toast(`${c.name} = ${val} olan bir kayıt zaten var (birincil anahtar).`, 'error'); input.value = String(r[ci]); return; }
            if (typeof val === 'string' && c.length > 0 && val.length > c.length) { toast(`${c.name} en fazla ${c.length} karakter olabilir.`, 'error'); input.value = r[ci] == null ? '' : String(r[ci]); return; }
            r[ci] = val;
            input.classList.toggle('null', val === null);
            this.changed(false);
          };
        }
        tr.appendChild(h('td', {}, input));
      });
      const del = h('button', { class: 'btn btn-small', title: 'Kaydı sil', disabled: ro }, '✕');
      del.onclick = () => { t.rows.splice(ri, 1); this.changed(false); this.render(); };
      tr.appendChild(h('td', {}, del));
      tbody.appendChild(tr);
    });
    const add = h('button', { class: 'btn', disabled: ro }, '+ Kayıt ekle');
    add.onclick = () => {
      const row = cols.map((c, ci) => {
        if (c.pk && ['int', 'bigint', 'smallint', 'tinyint'].includes(c.type)) return t.rows.reduce((m, r) => Math.max(m, Number(r[ci]) || 0), 0) + 1;
        if (c.type === 'bit') return c.nullable === false ? false : null;
        return c.nullable === false && !c.pk ? '' : null;
      });
      t.rows.push(row);
      this.changed(false);
      this.render();
      const inputs = this.el.querySelectorAll('tbody tr:last-child input.dataed-cell');
      inputs[1]?.focus();
    };
    body.appendChild(h('div', { class: 'dataed-grid' }, h('table', {}, h('thead', {}, thead), tbody)));
    body.appendChild(h('div', { class: 'dataed-foot' }, add,
      h('span', { class: 'muted' }, ' Program çalışırken yapılan kayıt (UpdateAll) değişiklikleri de buraya ve projeye kaydedilir.')));
  }

  changed(schema) {
    this.host.onDatabaseChanged(schema);
  }
}
