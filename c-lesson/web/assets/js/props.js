// Özellikler penceresi (Properties / Events).
import { PROPS, CONTROLS, FORM_INFO, COLOR_NAMES, SYSTEM_COLORS, EVENT_DESC, DEFAULT_FONT, COLUMN_TYPES, STRIP_ITEMS, STRIP_ADDABLE, colorToCss, codeName, propDefault, eventTypes } from './catalog.js';
import { h, modal, toast } from './ui.js';
import { isIdentifier } from './templates.js';
import { FORM, maskPreview } from './designer.js';

/** Bağlanabilir özellikler (DataBindings penceresi) */
const BINDABLE = {
  CheckBox: ['CheckState', 'Checked', 'Text', 'Tag'],
  RadioButton: ['Checked', 'Text', 'Tag'],
  ComboBox: ['Text', 'SelectedValue', 'SelectedItem', 'Tag'],
  ListBox: ['SelectedValue', 'Tag'],
  NumericUpDown: ['Value', 'Tag'],
  DateTimePicker: ['Value', 'Text', 'Tag'],
  PictureBox: ['ImageLocation', 'Tag'],
  TrackBar: ['Value', 'Tag'],
  ProgressBar: ['Value', 'Tag'],
};

const SHORTCUTS = ['Ctrl+N', 'Ctrl+O', 'Ctrl+S', 'Ctrl+Shift+S', 'Ctrl+P', 'Ctrl+Z', 'Ctrl+Y', 'Ctrl+X', 'Ctrl+C', 'Ctrl+V', 'Ctrl+A', 'Ctrl+F', 'Ctrl+H', 'Ctrl+Q', 'Ctrl+W',
  'Alt+F4', 'F1', 'F2', 'F3', 'F5', 'F12', 'Delete', 'Ctrl+Delete', 'Ctrl+1', 'Ctrl+2'];
const MASKS = [
  ['Sayısal (5 basamak)', '00000'], ['Telefon (Türkiye)', '(999) 000-0000'], ['Cep telefonu', '0(500) 000 00 00'], ['Kısa tarih', '00/00/0000'],
  ['Kısa tarih ve saat', '00/00/0000 90:00'], ['Saat (24 saat)', '90:00'], ['Posta kodu', '00000'], ['T.C. kimlik no', '00000000000'],
  ['IBAN (TR)', 'TR00 0000 0000 0000 0000 0000 00'], ['Kredi kartı', '0000 0000 0000 0000'],
];

const FONT_FAMILIES = ['Segoe UI', 'Arial', 'Calibri', 'Cambria', 'Comic Sans MS', 'Consolas', 'Courier New', 'Georgia', 'Impact', 'Microsoft Sans Serif', 'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana'];

function fmtPair(v) {
  return Array.isArray(v) ? `${v[0]}; ${v[1]}` : '';
}

function fmtFont(f) {
  const st = f.style?.length ? '; ' + f.style.join(', ') : '';
  return `${f.name}; ${String(f.size).replace('.', ',')}pt${st}`;
}

function parseNumber(s) {
  const v = Number(String(s).trim().replace(',', '.'));
  return Number.isFinite(v) ? v : null;
}

export class PropertyGrid {
  constructor(host) {
    this.host = host;
    this.mode = 'props';
    this.designer = null;
    this.select = h('select', { class: 'input' });
    this.btnProps = h('button', { class: 'active', title: 'Özellikler' }, 'Özellikler');
    this.btnEvents = h('button', { title: 'Olaylar' }, '⚡ Olaylar');
    this.grid = h('div', { class: 'props-grid' });
    this.desc = h('div', { class: 'props-desc' });
    this.el = h('div', { class: 'props' },
      h('div', { class: 'props-head' }, this.select, h('div', { class: 'props-mode' }, this.btnProps, this.btnEvents)),
      this.grid, this.desc);
    this.btnProps.onclick = () => this.setMode('props');
    this.btnEvents.onclick = () => this.setMode('events');
    this.select.onchange = () => this.designer?.select([this.select.value]);
    this.clear();
  }

  setMode(mode) {
    this.mode = mode;
    this.btnProps.classList.toggle('active', mode === 'props');
    this.btnEvents.classList.toggle('active', mode === 'events');
    this.render();
  }

  clear(message = 'Özellikleri görmek için bir formu tasarım görünümünde açın.') {
    this.designer = null;
    this.select.innerHTML = '';
    this.select.disabled = true;
    this.grid.innerHTML = '';
    this.grid.appendChild(h('div', { class: 'props-empty' }, message));
    this.desc.innerHTML = '';
  }

  show(designer) {
    this.designer = designer;
    this.render();
  }

  target() {
    const d = this.designer;
    const name = d.primary;
    if (name === FORM) return { name, isForm: true, type: 'Form', info: FORM_INFO, props: d.model.props, events: d.model.events, displayName: d.formName };
    const e = d.find(name);
    if (!e?.control) return null;
    e.control.events ??= {};
    return { name, isForm: false, type: e.control.type, info: CONTROLS[e.control.type], props: e.control.props, events: e.control.events, displayName: name, component: e.component, item: e.item };
  }

  render() {
    const d = this.designer;
    if (!d) return;
    const t = this.target();
    if (!t) return;
    // Kontrol seçici
    this.select.disabled = false;
    this.select.innerHTML = '';
    const opts = [[FORM, `${d.formName}   System.Windows.Forms.Form`], ...d.walk().map(({ control }) => [control.name, `${control.name}   ${control.type}`]),
      ...(d.model.components || []).map((c) => [c.name, `${c.name}   ${c.type}`])];
    if (!opts.some(([v]) => v === t.name)) opts.push([t.name, `${t.name}   ${t.type}`]);
    for (const [v, text] of opts) this.select.appendChild(h('option', { value: v, selected: v === t.name }, text));
    if (d.selection.length > 1) this.select.appendChild(h('option', { value: '', selected: true, disabled: true }, `(${d.selection.length} kontrol seçili)`));

    this.grid.innerHTML = '';
    this.desc.innerHTML = '';
    if (this.mode === 'events') this.renderEvents(t);
    else this.renderProps(t);
  }

  describe(title, text) {
    this.desc.innerHTML = '';
    this.desc.appendChild(h('b', {}, title));
    if (text) this.desc.appendChild(document.createTextNode(text));
  }

  renderProps(t) {
    const names = [...t.info.props].sort((a, b) => codeName(a).localeCompare(codeName(b), 'en'));
    // Name her zaman en üstte (VS'de parantezli "(Name)")
    names.splice(names.indexOf('Name'), 1);
    names.unshift('Name');
    for (const prop of names) {
      const def = PROPS[prop];
      if (!def || def.hidden) continue;
      const label = prop === 'Name' ? '(Name)' : prop === 'DataBindings' ? '(DataBindings)' : prop === 'StripItems' && t.item ? 'DropDownItems' : codeName(prop);
      const row = h('div', { class: 'prop-row' });
      const value = this.valueOf(t, prop);
      const changed = prop !== 'Name' && prop in t.props && JSON.stringify(t.props[prop]) !== JSON.stringify(propDefault(t.type, prop));
      if (changed) row.classList.add('changed');
      row.appendChild(h('div', { class: 'prop-name', title: label }, label));
      const cell = h('div', { class: 'prop-value' });
      this.editorFor(t, prop, def, value, cell);
      row.appendChild(cell);
      row.addEventListener('focusin', () => {
        for (const r of this.grid.querySelectorAll('.prop-row.selected')) r.classList.remove('selected');
        row.classList.add('selected');
        this.describe(label, def.desc ? ' ' + def.desc : '');
      });
      this.grid.appendChild(row);
    }
    // Genişletici özellikler: "ToolTip on toolTip1"
    if (!t.isForm && !t.component && !t.item) {
      for (const tt of (this.designer.model.components || []).filter((c) => c.type === 'ToolTip')) {
        const key = 'ToolTip:' + tt.name;
        const label = `ToolTip on ${tt.name}`;
        const row = h('div', { class: 'prop-row' + (t.props[key] ? ' changed' : '') });
        row.appendChild(h('div', { class: 'prop-name', title: label }, label));
        const cell = h('div', { class: 'prop-value' });
        const inp = h('input', { value: t.props[key] ?? '', spellcheck: 'false', readonly: this.host.readonly });
        const commit = () => { if (inp.value !== (t.props[key] ?? '')) this.apply(t, key, inp.value || undefined); };
        inp.addEventListener('change', commit);
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); inp.blur(); } });
        cell.appendChild(inp);
        row.appendChild(cell);
        row.addEventListener('focusin', () => this.describe(label, ' Fare kontrolün üzerine gelince görünecek ipucu metni.'));
        this.grid.appendChild(row);
      }
    }
  }

  valueOf(t, prop) {
    if (prop === 'Name') return t.displayName;
    if (prop in t.props) return t.props[prop];
    if (prop === 'Size' && !t.isForm) return CONTROLS[t.type]?.size;
    return propDefault(t.type, prop);
  }

  apply(t, prop, value) {
    const d = this.designer;
    if (prop === 'Name') {
      if (t.isForm) return;
      if (!isIdentifier(value)) {
        toast('Geçersiz ad. Harf ile başlamalı, yalnızca harf, rakam ve _ içermelidir.', 'error');
        this.render();
        return;
      }
      const r = d.renameControl(t.name, value);
      if (r !== true) {
        toast(r, 'error');
        this.render();
      }
      return;
    }
    const names = d.selection.length > 1 ? d.selection : [t.name];
    d.setProperty(names, prop, value);
  }

  editorFor(t, prop, def, value, cell) {
    const ro = this.host.readonly;
    const input = (val, onCommit, attrs = {}) => {
      const inp = h('input', { value: val ?? '', spellcheck: 'false', readonly: ro || attrs.readonly, ...attrs });
      let committed = String(val ?? '');
      const commit = () => {
        if (inp.value === committed) return;
        committed = inp.value;
        onCommit(inp.value);
      };
      inp.addEventListener('change', commit);
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); commit(); inp.blur(); }
        if (e.key === 'Escape') { inp.value = committed; inp.blur(); }
      });
      cell.appendChild(inp);
      return inp;
    };
    const select = (values, current, onChange, labels) => {
      const sel = h('select', { disabled: ro });
      values.forEach((v, i) => sel.appendChild(h('option', { value: v, selected: String(v) === String(current) }, labels ? labels[i] : String(v))));
      sel.onchange = () => onChange(sel.value);
      cell.appendChild(sel);
      return sel;
    };
    const more = (onClick, title = 'Düzenle') => {
      if (ro) return;
      cell.appendChild(h('button', { class: 'more', title, onclick: onClick }, '…'));
    };

    switch (def.type) {
      case 'name':
        input(value, (v) => this.apply(t, prop, v.trim()), { readonly: t.isForm });
        if (t.isForm) cell.title = 'Formun adı, Çözüm Gezgini\'nden değiştirilir.';
        break;
      case 'text': {
        const inp = input(value, (v) => this.apply(t, prop, v));
        const multi = ['Label', 'Button', 'TextBox', 'RichTextBox', 'CheckBox', 'RadioButton', 'LinkLabel', 'GroupBox'].includes(t.type);
        if (multi) more(() => this.editMultiline(t, prop, inp.value), 'Çok satırlı metin');
        break;
      }
      case 'string':
        input(value, (v) => this.apply(t, prop, v));
        break;
      case 'bool':
        select(['True', 'False'], value ? 'True' : 'False', (v) => this.apply(t, prop, v === 'True'));
        break;
      case 'int':
        input(value ?? '', (v) => {
          const n = parseNumber(v);
          if (n == null || !Number.isInteger(n)) { toast('Tam sayı girin.', 'error'); this.render(); return; }
          this.apply(t, prop, n);
        });
        break;
      case 'decimal':
        input(String(value ?? 0).replace('.', ','), (v) => {
          const n = parseNumber(v);
          if (n == null) { toast('Sayı girin.', 'error'); this.render(); return; }
          this.apply(t, prop, n);
        });
        break;
      case 'percent':
        input(`${value ?? 100} %`, (v) => {
          const n = parseNumber(v.replace('%', ''));
          if (n == null || n < 0 || n > 100) { toast('0 ile 100 arasında bir değer girin.', 'error'); this.render(); return; }
          this.apply(t, prop, n);
        });
        break;
      case 'enum':
      case 'cursor':
        select(def.values, value ?? def.def, (v) => this.apply(t, prop, v === propDefault(t.type, prop) && !(prop in t.props) ? v : v));
        break;
      case 'char':
        input(value ?? '', (v) => this.apply(t, prop, v ? v[0] : ''), { maxlength: '1' });
        break;
      case 'point':
      case 'size':
        input(fmtPair(value), (v) => {
          const m = /^\s*(-?\d+)\s*[;,]\s*(-?\d+)\s*$/.exec(v);
          if (!m) { toast('Biçim: sayı; sayı (ör. 12; 34)', 'error'); this.render(); return; }
          this.apply(t, prop, [Number(m[1]), Number(m[2])]);
        });
        break;
      case 'color': {
        const sw = h('span', { class: 'swatch', style: { background: colorToCss(value) || (prop === 'BackColor' ? '#f0f0f0' : '#000') } });
        cell.appendChild(sw);
        input(value ? value.replace('SystemColors.', '') : '', (v) => {
          const val = v.trim();
          if (!val) { this.apply(t, prop, undefined); return; }
          if (/^#[0-9a-f]{6}$/i.test(val) || COLOR_NAMES.includes(val)) this.apply(t, prop, val);
          else if (SYSTEM_COLORS[val]) this.apply(t, prop, 'SystemColors.' + val);
          else { toast('Renk adı (ör. Red) ya da #RRGGBB biçiminde yazın.', 'error'); this.render(); }
        }, { placeholder: '(varsayılan)' });
        more((e) => this.colorPopup(e.target, value, (v) => this.apply(t, prop, v)), 'Renk seç');
        break;
      }
      case 'font':
        input(fmtFont(value || this.designer.effectiveFont(t.name === FORM ? '$none' : t.name) || DEFAULT_FONT), () => {}, { readonly: true });
        more(() => this.fontDialog(value || this.designer.effectiveFont(t.name), (f) => this.apply(t, prop, f)), 'Yazı tipi seç');
        break;
      case 'anchor':
        input(value || 'Top, Left', () => {}, { readonly: true });
        more((e) => this.anchorPopup(e.target, value || 'Top, Left', (v) => this.apply(t, prop, v)), 'Bağlantı kenarları');
        break;
      case 'items':
        input(`(Koleksiyon) ${(value || []).length} öğe`, () => {}, { readonly: true });
        more(() => this.itemsDialog(value || [], (v) => this.apply(t, prop, v)), 'Öğeleri düzenle');
        break;
      case 'columns':
        input(`(Koleksiyon) ${(value || []).length} sütun`, () => {}, { readonly: true });
        more(() => this.columnsDialog(t, value || [], (v) => this.apply(t, prop, v)), 'Sütunları düzenle');
        break;
      case 'mask':
        input(value ?? '', (v) => this.apply(t, prop, v || undefined), { placeholder: '(yok)' });
        more(() => this.maskDialog(value || '', (v) => this.apply(t, prop, v || undefined)), 'Maske seç');
        break;
      case 'shortcut': {
        const listId = 'sc-' + Math.random().toString(36).slice(2, 7);
        input(value ?? '', (v) => {
          const val = v.trim();
          if (val && !/^((Ctrl|Shift|Alt)\+)*([A-Z0-9]|F\d{1,2}|Delete|Insert|Home|End|PageUp|PageDown|Enter|Escape|Space|Back)$/i.test(val)) {
            toast('Kısayol biçimi: Ctrl+S, Ctrl+Shift+N, F5 ...', 'error');
            this.render();
            return;
          }
          this.apply(t, prop, val || undefined);
        }, { placeholder: '(yok)', list: listId });
        cell.appendChild(h('datalist', { id: listId }, SHORTCUTS.map((k) => h('option', { value: k }))));
        break;
      }
      case 'tsitems':
        input(`(Koleksiyon) ${(value || []).length} öğe`, () => {}, { readonly: true });
        more(() => this.stripItemsDialog(t, value || [], (v) => this.apply(t, prop, v)), 'Öğeleri düzenle');
        break;
      case 'tabpages': {
        const pages = this.designer.find(t.name)?.control?.controls || [];
        input(`(Koleksiyon) ${pages.length} sekme`, () => {}, { readonly: true });
        more(() => this.tabPagesDialog(t), 'Sekmeleri düzenle');
        break;
      }
      case 'databindings': {
        const b = value || {};
        const keys = Object.keys(b).filter((k) => b[k]);
        input(keys.length ? keys.map((k) => `${k}: ${String(b[k]).replace('.', ' - ')}`).join('; ') : '(yok)', () => {}, { readonly: true });
        more(() => this.bindingsDialog(t, b, (v) => this.apply(t, prop, Object.keys(v).length ? v : undefined)), 'Veri bağlamaları');
        break;
      }
      case 'datasource':
      case 'compref': {
        const comps = this.designer.model.components || [];
        let options;
        if (def.type === 'compref') options = comps.filter((c) => c.type === def.refType);
        else if (t.type === 'BindingSource') options = comps.filter((c) => c.name !== t.name && (c.type === 'TypedDataSet' || c.type === 'BindingSource'));
        else options = comps.filter((c) => c.type === 'BindingSource');
        const names = options.map((c) => c.name);
        select(['', ...names], value || '', (v) => {
          if (t.type === 'DataGridView') this.designer.setGridDataSource(t.name, v || undefined);
          else this.apply(t, prop, v || undefined);
        }, ['(yok)', ...names]);
        break;
      }
      case 'datamember': {
        const tables = (this.host.data.database?.tables || []).map((x) => x.name);
        select(['', ...tables], value || '', (v) => this.apply(t, prop, v || undefined), ['(yok)', ...tables]);
        break;
      }
      case 'itemref': {
        const items = (t.props.StripItems || []).map((x) => x.name);
        select(['', ...items], value || '', (v) => this.apply(t, prop, v || undefined), ['(yok)', ...items]);
        break;
      }
      case 'updateorder':
        select(['InsertUpdateDelete', 'UpdateInsertDelete'], value || 'InsertUpdateDelete', (v) => this.apply(t, prop, v));
        break;
      case 'adapterrefs': {
        const db = this.host.data.database;
        const refs = value || {};
        for (const table of db?.tables || []) {
          const key = `${table.name}TableAdapter`;
          const adapters = (this.designer.model.components || []).filter((c) => c.type === 'TableAdapter' && c.props.Table === table.name).map((c) => c.name);
          const sel = h('select', { disabled: this.host.readonly, title: key },
            [['', '(yok)'], ...adapters.map((a) => [a, a])].map(([v, l]) => h('option', { value: v, selected: v === (refs[key] || '') }, `${key}: ${l}`)));
          sel.onchange = () => this.apply(t, prop, { ...refs, [key]: sel.value || undefined });
          cell.appendChild(sel);
        }
        break;
      }
      case 'controlref': {
        const buttons = [...this.designer.walk().map((e) => e.control), ...(this.designer.model.components || [])]
          .filter((c) => c.type === (def.refType || 'Button')).map((c) => c.name);
        select(['', ...buttons], value || '', (v) => this.apply(t, prop, v || undefined), ['(yok)', ...buttons]);
        break;
      }
      default:
        input(String(value ?? ''), () => {}, { readonly: true });
    }
  }

  // ------------------------------------------------------------------ olaylar

  renderEvents(t) {
    const d = this.designer;
    const events = [...t.info.events].sort();
    const methods = this.host.listMethods(d.formName);
    for (const evt of events) {
      const [, args] = eventTypes(evt);
      const shortArgs = args.replace('System.ComponentModel.', '');
      const compatible = methods.filter((m) => m.args === shortArgs || m.args === args).map((m) => m.name);
      const listId = `ev-${evt}-${Math.random().toString(36).slice(2, 7)}`;
      const current = t.events?.[evt] || '';
      const inp = h('input', { value: current, spellcheck: 'false', list: listId, readonly: this.host.readonly, placeholder: '' });
      const dl = h('datalist', { id: listId }, compatible.map((m) => h('option', { value: m })));
      const go = (name) => this.host.openEventHandler(d, t.name, evt, name);
      inp.addEventListener('dblclick', () => go(inp.value.trim() || null));
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const v = inp.value.trim();
          if (v && !isIdentifier(v)) { toast('Geçersiz metot adı.', 'error'); return; }
          if (!v) { d.setEvent(t.name, evt, null); return; }
          go(v);
        }
      });
      inp.addEventListener('change', () => {
        const v = inp.value.trim();
        if (v === current) return;
        if (!v) d.setEvent(t.name, evt, null);
        else if (isIdentifier(v)) go(v);
      });
      const row = h('div', { class: 'prop-row' + (current ? ' changed' : '') },
        h('div', { class: 'prop-name', title: evt }, evt),
        h('div', { class: 'prop-value' }, inp, dl));
      row.addEventListener('focusin', () => this.describe(evt, ' ' + (EVENT_DESC[evt] || '') + ' — Çift tıklayarak olay metodunu oluşturun.'));
      this.grid.appendChild(row);
    }
    this.describe('Olaylar', ' Bir olayın kutusuna çift tıklayın: metodu otomatik oluşturulur ve kod açılır.');
  }

  // ------------------------------------------------------------------ düzenleyici pencereler

  async editMultiline(t, prop, current) {
    const ta = h('textarea', { class: 'input', rows: '8', style: { width: '100%', fontFamily: 'Consolas, monospace' } });
    ta.value = current;
    const r = await modal({ title: `${prop} — çok satırlı metin`, body: ta, buttons: [{ text: 'Vazgeç', value: null }, { text: 'Tamam', value: 'ok', primary: true }] });
    if (r === 'ok') this.apply(t, prop, ta.value.replace(/\r\n/g, '\n'));
  }

  /** DataGridView sütun düzenleyicisi (VS'deki "Sütunları Düzenle" penceresi). */
  async columnsDialog(t, columns, done) {
    const cols = columns.map((c) => ({ name: c.name, type: c.type || 'DataGridViewTextBoxColumn', props: { ...(c.props || {}) } }));
    const reserved = this.designer.allNames();
    for (const c of columns) reserved.delete(c.name);
    const list = h('div', { class: 'col-list' });
    const body = h('div', { class: 'col-editor' },
      h('p', { class: 'muted', style: { marginTop: 0 } }, 'Name kodda kullanılan addır (ör. colAd); HeaderText başlıkta görünen yazıdır.'),
      list);
    const typeOptions = Object.entries(COLUMN_TYPES);
    const render = () => {
      list.innerHTML = '';
      list.appendChild(h('div', { class: 'col-row col-head' },
        h('span', {}, 'Name'), h('span', {}, 'HeaderText'), h('span', {}, 'Tür'), h('span', {}, 'Genişlik'), h('span', {}, 'Salt okunur'), h('span', {}, '')));
      cols.forEach((c, i) => {
        const name = h('input', { class: 'input', value: c.name, spellcheck: 'false' });
        name.onchange = () => { c.name = name.value.trim(); };
        const head = h('input', { class: 'input', value: c.props.HeaderText ?? '' });
        head.onchange = () => { c.props.HeaderText = head.value; };
        const type = h('select', { class: 'input' }, typeOptions.map(([k, v]) => h('option', { value: k, selected: k === c.type }, v)));
        type.onchange = () => { c.type = type.value; };
        const width = h('input', { class: 'input', type: 'number', min: '6', value: c.props.Width ?? 125 });
        width.onchange = () => { c.props.Width = Number(width.value) || 125; };
        const ro = h('input', { type: 'checkbox', checked: !!c.props.ReadOnly });
        ro.onchange = () => { c.props.ReadOnly = ro.checked || undefined; };
        const up = h('button', { class: 'btn btn-small', title: 'Yukarı', disabled: i === 0 }, '▲');
        up.onclick = () => { cols.splice(i - 1, 0, cols.splice(i, 1)[0]); render(); };
        const del = h('button', { class: 'btn btn-small', title: 'Sil' }, '✕');
        del.onclick = () => { cols.splice(i, 1); render(); };
        list.appendChild(h('div', { class: 'col-row' }, name, head, type, width, h('span', { class: 'col-center' }, ro), h('span', {}, up, del)));
      });
      const add = h('button', { class: 'btn' }, '+ Sütun ekle');
      add.onclick = () => {
        const taken = new Set([...reserved, ...cols.map((c) => c.name)]);
        let n = 1;
        while (taken.has('Column' + n)) n++;
        cols.push({ name: 'Column' + n, type: 'DataGridViewTextBoxColumn', props: { HeaderText: 'Column' + n } });
        render();
        list.querySelectorAll('.col-row:not(.col-head) input.input')[(cols.length - 1) * 3]?.focus();
      };
      list.appendChild(add);
    };
    render();
    for (;;) {
      const r = await modal({ title: 'Sütunları Düzenle', body, width: 720, buttons: [{ text: 'Vazgeç', value: null }, { text: 'Tamam', value: 'ok', primary: true }] });
      if (r !== 'ok') return;
      const seen = new Set();
      const bad = cols.find((c) => {
        const bad1 = !isIdentifier(c.name) || reserved.has(c.name) || seen.has(c.name);
        seen.add(c.name);
        return bad1;
      });
      if (!bad) break;
      toast(`Geçersiz ya da kullanılmış sütun adı: "${bad.name}"`, 'error');
    }
    done(cols.map((c) => ({ name: c.name, type: c.type, props: Object.fromEntries(Object.entries(c.props).filter(([, v]) => v !== undefined && v !== '')) })));
  }

  /** (DataBindings) penceresi: özellik → BindingSource alanı */
  async bindingsDialog(t, current, done) {
    const d = this.designer;
    const db = this.host.data.database;
    const sources = (d.model.components || []).filter((c) => c.type === 'BindingSource');
    const fieldsOf = (bs) => {
      const table = db?.tables.find((x) => x.name === bs.props.DataMember);
      return table ? table.columns.map((c) => c.name) : [];
    };
    const options = [['', '(yok)']];
    for (const bs of sources) for (const f of fieldsOf(bs)) options.push([`${bs.name}.${f}`, `${bs.name} - ${f}`]);
    const props = BINDABLE[t.type] || ['Text', 'Tag'];
    const result = { ...current };
    const rows = props.map((p) => {
      const sel = h('select', { class: 'input' }, options.map(([v, l]) => h('option', { value: v, selected: v === (current[p] || '') }, l)));
      sel.onchange = () => { if (sel.value) result[p] = sel.value; else delete result[p]; };
      return h('div', { class: 'bind-row' }, h('b', {}, p), sel);
    });
    const info = sources.length ? 'Kontrolün özelliğini veri kaynağındaki bir alana bağlayın (Visual Studio: Özellikler → (DataBindings)).'
      : 'Formda BindingSource yok. Önce araç kutusundan BindingSource ekleyip DataSource ve DataMember özelliklerini ayarlayın.';
    const body = h('div', { class: 'bind-editor' }, h('p', { class: 'muted', style: { marginTop: 0 } }, info), ...rows);
    const r = await modal({ title: `${t.name} — (DataBindings)`, body, width: 480, buttons: [{ text: 'Vazgeç', value: null }, { text: 'Tamam', value: 'ok', primary: true }] });
    if (r === 'ok') done(result);
  }

  async maskDialog(current, done) {
    const preview = h('div', { class: 'mask-preview' });
    const inp = h('input', { class: 'input', value: current, spellcheck: 'false' });
    const update = () => { preview.textContent = 'Önizleme: ' + (maskPreview(inp.value, '_') || '(maske yok)'); };
    inp.oninput = update;
    const list = h('div', { class: 'mask-list' }, MASKS.map(([n, m]) => {
      const row = h('div', { class: 'mask-row' + (m === current ? ' selected' : '') }, h('span', {}, n), h('code', {}, m), h('span', { class: 'muted' }, maskPreview(m)));
      row.onclick = () => {
        list.querySelectorAll('.selected').forEach((x) => x.classList.remove('selected'));
        row.classList.add('selected');
        inp.value = m;
        update();
      };
      return row;
    }));
    update();
    const body = h('div', { class: 'mask-editor' },
      h('p', { class: 'muted', style: { marginTop: 0 } }, '0: rakam (zorunlu) · 9: rakam/boşluk · L: harf (zorunlu) · ?: harf · A: harf/rakam · &: herhangi karakter · \\: sonraki karakteri olduğu gibi yaz'),
      list, h('label', {}, 'Maske: ', inp), preview);
    const r = await modal({ title: 'Giriş Maskesi', body, width: 560, buttons: [{ text: 'Vazgeç', value: null }, { text: 'Tamam', value: 'ok', primary: true }] });
    if (r === 'ok') done(inp.value);
  }

  /** Menü / araç çubuğu öğeleri koleksiyon düzenleyicisi. */
  async stripItemsDialog(t, items, done) {
    const d = this.designer;
    const list = items.map((it) => JSON.parse(JSON.stringify(it)));
    const ownerType = t.type;
    const kind = t.item ? 'dropdown' : CONTROLS[ownerType]?.strip === 'context' ? 'dropdown' : CONTROLS[ownerType]?.strip || 'dropdown';
    const reserved = new Set();
    const rows = h('div', { class: 'col-list' });
    const typeSel = h('select', { class: 'input' }, (STRIP_ADDABLE[kind] || STRIP_ADDABLE.dropdown).map((k) => h('option', { value: k }, STRIP_ITEMS[k].label)));
    const render = () => {
      rows.innerHTML = '';
      rows.appendChild(h('div', { class: 'col-row tsi-row col-head' }, h('span', {}, 'Ad (Name)'), h('span', {}, 'Tür'), h('span', {}, 'Text'), h('span', {}, '')));
      list.forEach((it, i) => {
        const text = h('input', { class: 'input', value: it.props?.Text ?? '', disabled: it.type === 'ToolStripSeparator' });
        text.onchange = () => { it.props = { ...it.props, Text: text.value }; };
        const up = h('button', { class: 'btn btn-small', title: 'Yukarı', disabled: i === 0 }, '▲');
        up.onclick = () => { list.splice(i - 1, 0, list.splice(i, 1)[0]); render(); };
        const del = h('button', { class: 'btn btn-small', title: 'Sil' }, '✕');
        del.onclick = () => { list.splice(i, 1); render(); };
        rows.appendChild(h('div', { class: 'col-row tsi-row' }, h('code', {}, it.name), h('span', { class: 'muted' }, STRIP_ITEMS[it.type]?.label || it.type), text, h('span', {}, up, del)));
      });
      const add = h('button', { class: 'btn' }, '+ Ekle');
      add.onclick = () => {
        const type = typeSel.value;
        const name = d.uniqueName(STRIP_ITEMS[type].prefix, reserved);
        const it = { type, name, props: type === 'ToolStripSeparator' ? {} : { Text: name }, events: {} };
        list.push(it);
        render();
      };
      rows.appendChild(h('div', { class: 'tsi-add' }, typeSel, add));
    };
    render();
    const body = h('div', { class: 'col-editor' }, h('p', { class: 'muted', style: { marginTop: 0 } }, 'Alt menüleri düzenlemek için tasarımda menü öğesini seçip DropDownItems özelliğini kullanın ya da "Buraya yazın" kutusuna yazın.'), rows);
    const r = await modal({ title: 'Öğe Koleksiyonu Düzenleyicisi', body, width: 640, buttons: [{ text: 'Vazgeç', value: null }, { text: 'Tamam', value: 'ok', primary: true }] });
    if (r === 'ok') done(list);
  }

  /** TabControl sekmeleri (TabPages) düzenleyicisi. */
  async tabPagesDialog(t) {
    const d = this.designer;
    const tc = d.find(t.name)?.control;
    if (!tc) return;
    const pages = tc.controls.map((pg) => ({ page: pg, name: pg.name, text: pg.props.Text ?? '' }));
    const rows = h('div', { class: 'col-list' });
    const render = () => {
      rows.innerHTML = '';
      rows.appendChild(h('div', { class: 'col-row tsi-row col-head' }, h('span', {}, 'Ad (Name)'), h('span', {}, 'Text'), h('span', {}, 'Denetim'), h('span', {}, '')));
      pages.forEach((p, i) => {
        const text = h('input', { class: 'input', value: p.text });
        text.onchange = () => { p.text = text.value; };
        const up = h('button', { class: 'btn btn-small', title: 'Yukarı', disabled: i === 0 }, '▲');
        up.onclick = () => { pages.splice(i - 1, 0, pages.splice(i, 1)[0]); render(); };
        const del = h('button', { class: 'btn btn-small', title: 'Sil' }, '✕');
        del.onclick = () => { pages.splice(i, 1); render(); };
        const n = p.page?.controls?.length || 0;
        rows.appendChild(h('div', { class: 'col-row tsi-row' }, h('code', {}, p.name), text, h('span', { class: 'muted' }, n ? `${n} kontrol` : ''), h('span', {}, up, del)));
      });
      const add = h('button', { class: 'btn' }, '+ Sekme ekle');
      const reserved = new Set(pages.map((p) => p.name));
      add.onclick = () => {
        const name = d.uniqueName('tabPage', reserved);
        pages.push({ page: null, name, text: name });
        render();
      };
      rows.appendChild(add);
    };
    render();
    const r = await modal({ title: 'TabPage Koleksiyonu Düzenleyicisi', body: h('div', { class: 'col-editor' }, rows), width: 560, buttons: [{ text: 'Vazgeç', value: null }, { text: 'Tamam', value: 'ok', primary: true }] });
    if (r !== 'ok') return;
    d.setTabPages(t.name, pages);
  }

  async itemsDialog(items, done) {
    const ta = h('textarea', { class: 'input', rows: '12', style: { width: '100%' } });
    ta.value = items.join('\n');
    const body = h('div', {}, h('p', { class: 'muted', style: { marginTop: 0 } }, 'Her satıra bir öğe yazın.'), ta);
    const r = await modal({ title: 'Dize Koleksiyonu Düzenleyicisi', body, buttons: [{ text: 'Vazgeç', value: null }, { text: 'Tamam', value: 'ok', primary: true }] });
    if (r !== 'ok') return;
    const list = ta.value.replace(/\r\n/g, '\n').split('\n').filter((x) => x.length > 0);
    done(list);
  }

  async fontDialog(font, done) {
    const f = { name: font?.name || 'Segoe UI', size: font?.size || 9, style: [...(font?.style || [])] };
    const fam = h('select', { class: 'input', size: '8' }, FONT_FAMILIES.map((n) => h('option', { value: n, selected: n === f.name, style: { fontFamily: n } }, n)));
    if (!FONT_FAMILIES.includes(f.name)) fam.appendChild(h('option', { value: f.name, selected: true }, f.name));
    const sizes = [8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72];
    const size = h('select', { class: 'input', size: '8' }, sizes.map((s) => h('option', { value: s, selected: s === f.size }, String(s))));
    if (!sizes.includes(f.size)) size.appendChild(h('option', { value: f.size, selected: true }, String(f.size)));
    const styleBox = (key, label) => {
      const cb = h('input', { type: 'checkbox', checked: f.style.includes(key) });
      cb.onchange = () => {
        f.style = f.style.filter((x) => x !== key);
        if (cb.checked) f.style.push(key);
        update();
      };
      return h('label', { class: 'check' }, cb, label);
    };
    const sample = h('div', { class: 'font-sample' }, 'AaBbÇçĞğİıŞş 123');
    const update = () => {
      f.name = fam.value;
      f.size = Number(size.value);
      Object.assign(sample.style, {
        fontFamily: `"${f.name}"`, fontSize: f.size + 'pt', fontWeight: f.style.includes('Bold') ? 'bold' : 'normal',
        fontStyle: f.style.includes('Italic') ? 'italic' : 'normal',
        textDecoration: [f.style.includes('Underline') ? 'underline' : '', f.style.includes('Strikeout') ? 'line-through' : ''].join(' ').trim(),
      });
    };
    fam.onchange = update;
    size.onchange = update;
    const body = h('div', { class: 'font-dialog' },
      h('div', {}, h('label', { class: 'muted small' }, 'Yazı tipi'), fam),
      h('div', {}, h('label', { class: 'muted small' }, 'Boyut'), size),
      h('div', { style: { gridColumn: '1 / -1' } }, h('div', { class: 'font-styles' }, styleBox('Bold', 'Kalın'), styleBox('Italic', 'İtalik'), styleBox('Underline', 'Altı çizili'), styleBox('Strikeout', 'Üstü çizili'))),
      sample);
    update();
    const r = await modal({ title: 'Yazı Tipi', body, width: 440, buttons: [{ text: 'Vazgeç', value: null }, { text: 'Tamam', value: 'ok', primary: true }] });
    if (r === 'ok') {
      const order = ['Bold', 'Italic', 'Underline', 'Strikeout'];
      done({ name: f.name, size: f.size, style: order.filter((s) => f.style.includes(s)) });
    }
  }

  popup(anchor, content) {
    document.querySelector('.color-pop')?.remove();
    const pop = h('div', { class: 'color-pop' }, content);
    document.body.appendChild(pop);
    const r = anchor.getBoundingClientRect();
    const top = Math.min(window.innerHeight - pop.offsetHeight - 8, r.bottom + 4);
    pop.style.top = Math.max(8, top) + 'px';
    pop.style.left = Math.max(8, Math.min(window.innerWidth - pop.offsetWidth - 8, r.right - pop.offsetWidth)) + 'px';
    const close = (e) => {
      if (e && pop.contains(e.target)) return;
      pop.remove();
      document.removeEventListener('mousedown', close, true);
    };
    setTimeout(() => document.addEventListener('mousedown', close, true), 0);
    return () => close();
  }

  colorPopup(anchor, current, done) {
    let close;
    const pick = (v) => { close(); done(v); };
    const custom = h('input', { type: 'color', value: current?.startsWith('#') ? current : '#3366cc' });
    custom.onchange = () => pick(custom.value);
    const grid = h('div', { class: 'color-grid' }, COLOR_NAMES.map((n) => h('div', {
      class: 'color-cell', title: n, style: { background: colorToCss(n) === 'transparent' ? 'repeating-conic-gradient(#ccc 0 25%, #fff 0 50%) 0 0/8px 8px' : colorToCss(n) },
      onclick: () => pick(n),
    })));
    const sys = h('div', { class: 'color-sys' }, Object.keys(SYSTEM_COLORS).map((n) => h('div', { onclick: () => pick('SystemColors.' + n) },
      h('span', { class: 'swatch', style: { background: SYSTEM_COLORS[n], marginLeft: 0 } }), n)));
    const content = h('div', {},
      h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
        h('b', {}, 'Renk'), h('button', { class: 'btn btn-sm', onclick: () => pick(undefined) }, 'Varsayılan')),
      h('div', { class: 'muted small' }, 'Web renkleri'), grid,
      h('div', { class: 'muted small' }, 'Sistem renkleri'), sys,
      h('label', { class: 'check', style: { marginTop: '8px' } }, 'Özel renk: ', custom));
    close = this.popup(anchor, content);
  }

  anchorPopup(anchor, current, done) {
    const set = new Set(String(current).split(',').map((s) => s.trim()).filter(Boolean));
    const box = (k, label) => {
      const cb = h('input', { type: 'checkbox', checked: set.has(k) });
      cb.onchange = () => {
        if (cb.checked) set.add(k); else set.delete(k);
        const order = ['Top', 'Bottom', 'Left', 'Right'].filter((x) => set.has(x));
        done(order.length ? order.join(', ') : 'None');
      };
      return h('label', { class: 'check', style: { display: 'flex', margin: '4px 0' } }, cb, label);
    };
    this.popup(anchor, h('div', {},
      h('b', {}, 'Bağlantı (Anchor)'),
      h('p', { class: 'muted small', style: { margin: '4px 0 6px' } }, 'Form büyüdüğünde kontrol işaretli kenarlara olan uzaklığını korur.'),
      box('Top', 'Üst (Top)'), box('Bottom', 'Alt (Bottom)'), box('Left', 'Sol (Left)'), box('Right', 'Sağ (Right)')));
  }
}
