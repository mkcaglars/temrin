// Görsel form tasarımcısı (Visual Studio Windows Forms tasarımcısına benzer).
import { createItem, setProp, measureText } from './winui.js';
import { CONTROLS, STRIP_ITEMS, STRIP_ADDABLE, colorToCss, fontToCss, DEFAULT_FONT, propDefault } from './catalog.js';
import { stripItemsOf } from './codegen.js';
import { navigatorItems, navigatorRefs, gridColumnsFor } from './dbtemplate.js';
import { instanceName } from './datasetgen.js';

const NAV_GLYPHS = { AddNewItem: '✚', DeleteItem: '✖', MoveFirstItem: '⏮', MovePreviousItem: '◀', MoveNextItem: '▶', MoveLastItem: '⏭' };
import { h } from './ui.js';

const FORM = '$form';

/** Sekme başlığı yüksekliği (C# tarafındaki TabControl ile aynı hesap). */
export function tabHeaderHeight(font) {
  const size = font?.size || 9;
  return Math.max(21, Math.ceil(size * 96 / 72 * 1.2) + 6) + 3;
}

/** MaskedTextBox maskesinin tasarımda görünen hali (Türkçe ayraçlarla). */
export function maskPreview(mask, prompt = '_') {
  let out = '';
  for (let i = 0; i < (mask || '').length; i++) {
    const m = mask[i];
    if (m === '\\') { if (i + 1 < mask.length) out += mask[++i]; continue; }
    if ('<>|'.includes(m)) continue;
    if ('09#L?&CAa'.includes(m)) { out += prompt; continue; }
    out += { '.': ',', ',': '.', '/': '.', $: '₺' }[m] ?? m;
  }
  return out;
}
const SNAP = 6;
let clipboard = null;

function clone(o) {
  return JSON.parse(JSON.stringify(o));
}

export class FormDesigner {
  /**
   * @param {object} host  IDE (data, readonly, onDesignChanged, onSelectionChanged, openEventHandler, renameInCode, getActiveTool, clearActiveTool)
   */
  constructor(host, formName) {
    this.host = host;
    this.formName = formName;
    this.selection = [FORM];
    this.undoStack = [];
    this.redoStack = [];
    this.items = new Map();
    this.surface = h('div', { class: 'dsurface' });
    this.layer = h('div', { class: 'dlayer' });
    this.wrap = h('div', { class: 'dsurface-wrap', tabindex: '0' }, this.surface);
    this.tray = h('div', { class: 'dtray' });
    this.info = h('div', { class: 'dinfo hidden' });
    this.el = h('div', { class: 'designer' }, this.wrap, this.tray, this.info);
    this.bind();
  }

  get model() {
    return this.host.data.forms[this.formName];
  }

  get readOnly() {
    return !!this.host.readonly;
  }

  // ------------------------------------------------------------------ model yardımcıları

  /** Tüm kontroller (iç içe dahil) — [{ control, parent(list sahibi model ya da null=form), list }] */
  walk(list = this.model.controls, parent = null, out = []) {
    for (const c of list) {
      out.push({ control: c, parent, list });
      if (c.controls) this.walk(c.controls, c, out);
    }
    return out;
  }

  find(name) {
    if (name === FORM) return { control: null, parent: null, list: null };
    const comp = (this.model.components || []).find((c) => c.name === name);
    if (comp) return { control: comp, parent: null, list: this.model.components, component: true };
    return this.walk().find((e) => e.control.name === name) || this.findItem(name);
  }

  /** Menü/araç çubuğu sahipleri (kontroller ve ContextMenuStrip bileşenleri). */
  stripOwners() {
    return [...this.walk().map((e) => e.control), ...(this.model.components || [])].filter((c) => CONTROLS[c.type]?.strip);
  }

  findItem(name) {
    const search = (owner, strip) => {
      const list = owner.props?.StripItems || [];
      for (const it of list) {
        if (it.name === name) return { control: it, parent: owner, list, item: true, strip };
        const r = search(it, strip);
        if (r) return r;
      }
      return null;
    };
    for (const o of this.stripOwners()) {
      const r = search(o, o);
      if (r) return r;
    }
    return null;
  }

  childrenOf(name) {
    if (name === FORM) return this.model.controls;
    const e = this.find(name);
    return e?.control?.controls || null;
  }

  isContainer(name) {
    if (name === FORM) return true;
    const e = this.find(name);
    return !!(e?.control && CONTROLS[e.control.type]?.container);
  }

  allNames() {
    const names = new Set([this.formName]);
    for (const { control } of this.walk()) {
      names.add(control.name);
      for (const col of control.props?.Columns || []) names.add(col.name);
    }
    for (const c of this.model.components || []) names.add(c.name);
    for (const o of this.stripOwners()) for (const it of stripItemsOf(o)) names.add(it.name);
    return names;
  }

  uniqueName(prefix, reserved) {
    const names = this.allNames();
    for (let i = 1; ; i++) {
      const n = prefix + i;
      if (!names.has(n) && !reserved?.has(n)) {
        reserved?.add(n);
        return n;
      }
    }
  }

  parentName(name) {
    const e = this.find(name);
    return e?.parent ? e.parent.name : FORM;
  }

  /** Bir kontrolün etkin yazı tipi (kendi, yoksa ebeveyninin...). */
  effectiveFont(name) {
    let cur = name;
    while (cur && cur !== FORM) {
      const e = this.find(cur);
      if (e?.control?.props?.Font) return e.control.props.Font;
      cur = e?.parent ? e.parent.name : FORM;
    }
    return this.model.props.Font || DEFAULT_FONT;
  }

  autoSizeOf(c) {
    const font = fontToCss(this.effectiveFont(c.name));
    const m = measureText(c.props.Text ?? '', font);
    if (c.type === 'CheckBox' || c.type === 'RadioButton') return [m.w + 17, Math.max(m.h + 4, 19)];
    const border = c.props.BorderStyle && c.props.BorderStyle !== 'None' ? 2 : 0;
    return [m.w + border, m.h + border];
  }

  /** AutoSize özelliği açık kontrollerin boyutlarını yeniden hesaplar. */
  refreshAutoSizes() {
    for (const { control } of this.walk()) {
      if (control.props.AutoSize && ['Label', 'LinkLabel', 'CheckBox', 'RadioButton'].includes(control.type)) {
        control.props.Size = this.autoSizeOf(control);
      }
    }
  }

  /** Dock özelliği olan kontrollerin konum/boyutlarını hesaplar. */
  layoutDock(list, rect) {
    let r = { ...rect };
    for (let i = list.length - 1; i >= 0; i--) {
      const c = list[i];
      const dock = c.props.Dock;
      if (!dock || dock === 'None') continue;
      const [, , w0, h0] = [...(c.props.Location || [0, 0]), ...(c.props.Size || [0, 0])];
      let b;
      if (dock === 'Top') { b = [r.x, r.y, r.w, h0]; r.y += h0; r.h -= h0; }
      else if (dock === 'Bottom') { b = [r.x, r.y + r.h - h0, r.w, h0]; r.h -= h0; }
      else if (dock === 'Left') { b = [r.x, r.y, w0, r.h]; r.x += w0; r.w -= w0; }
      else if (dock === 'Right') { b = [r.x + r.w - w0, r.y, w0, r.h]; r.w -= w0; }
      else b = [r.x, r.y, Math.max(0, r.w), Math.max(0, r.h)];
      c.props.Location = [b[0], b[1]];
      c.props.Size = [Math.max(0, b[2]), Math.max(0, b[3])];
    }
    for (const c of list) {
      if (!c.controls) continue;
      const [w, hh] = c.props.Size;
      if (c.type === 'TabControl') {
        const top = tabHeaderHeight(this.effectiveFont(c.name));
        for (const pg of c.controls) {
          pg.props.Location = [4, top];
          pg.props.Size = [Math.max(0, w - 8), Math.max(0, hh - top - 4)];
        }
      }
      const inner = c.type === 'GroupBox' ? { x: 3, y: 19, w: w - 6, h: hh - 22 } : { x: 0, y: 0, w, h: hh };
      this.layoutDock(c.controls, inner);
    }
  }

  normalize() {
    this.refreshAutoSizes();
    const [cw, ch] = this.model.props.ClientSize || [800, 450];
    this.layoutDock(this.model.controls, { x: 0, y: 0, w: cw, h: ch });
  }

  snapshot() {
    this.undoStack.push(JSON.stringify(this.model));
    if (this.undoStack.length > 100) this.undoStack.shift();
    this.redoStack = [];
  }

  restore(json) {
    this.host.data.forms[this.formName] = JSON.parse(json);
    const names = this.allNames();
    this.selection = this.selection.filter((n) => n === FORM || names.has(n));
    if (!this.selection.length) this.selection = [FORM];
    this.commit(false);
  }

  undo() {
    if (!this.undoStack.length || this.readOnly) return;
    this.redoStack.push(JSON.stringify(this.model));
    this.restore(this.undoStack.pop());
  }

  redo() {
    if (!this.redoStack.length || this.readOnly) return;
    this.undoStack.push(JSON.stringify(this.model));
    this.restore(this.redoStack.pop());
  }

  /** Değişikliği uygular: düzen + Designer.cs + yeniden çizim. */
  commit(notify = true) {
    this.normalize();
    this.render();
    if (notify !== null) this.host.onDesignChanged(this.formName);
    this.host.onSelectionChanged(this);
  }

  // ------------------------------------------------------------------ çizim

  render() {
    const m = this.model;
    this.surface.innerHTML = '';
    this.items.clear();
    const form = createItem('Form', FORM);
    form.el.dataset.dname = FORM;
    form.el.classList.add('wf-active');
    form.el.querySelector('.wf-grip')?.remove();
    setProp(form, 'text', m.props.Text ?? '');
    const [cw, ch] = m.props.ClientSize || [800, 450];
    setProp(form, 'bounds', `0,0,${cw},${ch}`);
    if (m.props.BackColor) setProp(form, 'back', colorToCss(m.props.BackColor));
    if (m.props.ForeColor) setProp(form, 'fore', colorToCss(m.props.ForeColor));
    if (m.props.Font) setProp(form, 'font', fontToCss(m.props.Font));
    const border = m.props.FormBorderStyle || 'Sizable';
    form.el.classList.toggle('wf-noborder', border === 'None');
    form.el.classList.toggle('wf-toolwindow', border.includes('ToolWindow'));
    const box = form.el.querySelector('.wf-caption-buttons');
    if (m.props.ControlBox === false) box.style.display = 'none';
    if (m.props.MinimizeBox === false) form.el.querySelector('.wf-min').style.display = 'none';
    if (m.props.MaximizeBox === false) form.el.querySelector('.wf-max').style.display = 'none';
    this.surface.appendChild(form.el);
    this.formItem = form;
    this.items.set(FORM, form);
    this.renderList(m.controls, form.client);
    this.renderContextEditors();
    this.surface.appendChild(this.layer);
    this.renderTray();
    this.drawSelection();
  }

  renderList(list, parentEl, parent = null) {
    list.forEach((c, i) => {
      const it = createItem(c.type, c.name);
      it.el.dataset.dname = c.name;
      it.model = c;
      this.applyProps(it, c);
      it.el.style.zIndex = String(list.length - i);
      if (parent?.type === 'TabControl' && i !== this.selectedTab(parent)) it.el.classList.add('wf-hidden');
      parentEl.appendChild(it.el);
      this.items.set(c.name, it);
      if (c.controls) this.renderList(c.controls, it.client || it.el, c);
    });
  }

  selectedTab(tc) {
    const n = tc.controls?.length || 0;
    return Math.max(0, Math.min(n - 1, Number(tc.props.SelectedIndex) || 0));
  }

  // ------------------------------------------------------------------ menü ve araç çubukları

  /** Seçili öğeler ve üst menüleri (açık gösterilecek alt menüler). */
  openPath() {
    const path = new Set();
    for (const n of this.selection) {
      let e = this.find(n);
      while (e?.item) {
        path.add(e.control.name);
        e = STRIP_ITEMS[e.parent.type] ? this.find(e.parent.name) : null;
      }
    }
    return path;
  }

  renderStrip(it, owner, kind) {
    const host = it.client || it.el;
    const path = this.openPath();
    const glyphs = {};
    if (owner.type === 'BindingNavigator') {
      for (const [k, g] of Object.entries(NAV_GLYPHS)) if (owner.props[k]) glyphs[owner.props[k]] = g;
      const byName = { SaveItem: '💾', DeleteItem: '✖', AddNewItem: '✚', MoveFirstItem: '⏮', MovePreviousItem: '◀', MoveNextItem: '▶', MoveLastItem: '⏭' };
      for (const item of owner.props.StripItems || []) {
        if (glyphs[item.name] || item.type !== 'ToolStripButton') continue;
        const k = Object.keys(byName).find((x) => item.name.endsWith(x));
        if (k) glyphs[item.name] = byName[k];
      }
    }
    for (const item of owner.props.StripItems || []) {
      const el = this.renderStripItem(item, path);
      if (glyphs[item.name]) setProp(this.items.get(item.name), 'glyph', glyphs[item.name]);
      host.appendChild(el);
    }
    if (!this.readOnly && (this.selection.includes(owner.name) || [...path].some((n) => this.find(n)?.strip === owner) || !(owner.props.StripItems || []).length)) {
      host.appendChild(this.typeHere(owner.name, kind));
    }
  }

  renderStripItem(item, path) {
    const info = STRIP_ITEMS[item.type] || STRIP_ITEMS.ToolStripButton;
    const ui = createItem(info.ui, item.name);
    ui.el.dataset.dname = item.name;
    const p = item.props;
    if (item.type !== 'ToolStripSeparator') setProp(ui, 'text', p.Text ?? '');
    if (item.type === 'ToolStripComboBox') setProp(ui, 'items', JSON.stringify(p.Items || []));
    if (p.DisplayStyle) setProp(ui, 'displaystyle', p.DisplayStyle);
    if (p.Checked) setProp(ui, 'checked', '1');
    if (p.Enabled === false) setProp(ui, 'enabled', '0');
    if (p.IsLink) setProp(ui, 'islink', '1');
    if (p.Spring) setProp(ui, 'spring', '1');
    if (p.ItemAlignment === 'Right') setProp(ui, 'alignment', 'Right');
    if (p.ShortcutKeys && p.ShowShortcutKeys !== false) setProp(ui, 'shortcuttext', p.ShortcutKeys);
    if (p.ForeColor) ui.el.style.color = colorToCss(p.ForeColor);
    if (p.BackColor) ui.el.style.backgroundColor = colorToCss(p.BackColor);
    if (p.Visible === false) ui.el.classList.add('wf-hidden-design');
    if (ui.input) ui.input.tabIndex = -1;
    if (ui.select) ui.select.tabIndex = -1;
    this.items.set(item.name, ui);
    if (info.parentOf && path.has(item.name)) {
      ui.el.classList.add('open');
      for (const ch of p.StripItems || []) ui.client.appendChild(this.renderStripItem(ch, path));
      if (!this.readOnly) ui.client.appendChild(this.typeHere(item.name, 'dropdown'));
    }
    return ui.el;
  }

  typeHere(owner, kind) {
    const el = h('div', { class: 'd-typehere', 'data-owner': owner, 'data-kind': kind },
      h('span', { class: 'd-typehere-text' }, kind === 'tool' || kind === 'status' ? '＋' : 'Buraya yazın'));
    if (STRIP_ADDABLE[kind]?.length > 1) el.appendChild(h('span', { class: 'd-typehere-more', title: 'Öğe türü seç' }, '▾'));
    return el;
  }

  /** "Buraya yazın" kutusuna tıklanınca: yazılan metinle yeni öğe oluşturulur. */
  beginTypeHere(el, e) {
    const owner = el.dataset.owner;
    const kind = el.dataset.kind;
    if (e.target.closest('.d-typehere-more') || kind === 'tool' || kind === 'status') {
      this.showAddMenu(el, owner, kind);
      return;
    }
    const input = h('input', { class: 'd-typehere-input', spellcheck: 'false' });
    el.textContent = '';
    el.appendChild(input);
    el.classList.add('editing');
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      const text = input.value.trim();
      if (ok && text) this.addStripItem(owner, text === '-' ? 'ToolStripSeparator' : 'ToolStripMenuItem', text === '-' ? null : input.value);
      else this.render();
    };
    input.addEventListener('keydown', (ev) => {
      ev.stopPropagation();
      if (ev.key === 'Enter') { ev.preventDefault(); finish(true); }
      if (ev.key === 'Escape') { ev.preventDefault(); finish(false); }
    });
    input.addEventListener('mousedown', (ev) => ev.stopPropagation());
    input.addEventListener('blur', () => finish(true));
    setTimeout(() => input.focus(), 0);
  }

  showAddMenu(anchor, owner, kind) {
    this.closeAddMenu();
    const types = STRIP_ADDABLE[kind] || STRIP_ADDABLE.dropdown;
    const menu = h('div', { class: 'd-addmenu' }, types.map((t) => {
      const row = h('div', { class: 'd-addmenu-item' }, STRIP_ITEMS[t].label + '  (' + t + ')');
      row.addEventListener('mousedown', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        this.closeAddMenu();
        this.addStripItem(owner, t, null);
      });
      return row;
    }));
    const r = anchor.getBoundingClientRect();
    menu.style.left = r.left + 'px';
    menu.style.top = r.bottom + 'px';
    document.body.appendChild(menu);
    this.addMenu = menu;
    setTimeout(() => document.addEventListener('mousedown', this.closeAddMenuBound ??= () => this.closeAddMenu(), { once: true }), 0);
  }

  closeAddMenu() {
    this.addMenu?.remove();
    this.addMenu = null;
  }

  /** VS gibi ad: "Dosya" → dosyaToolStripMenuItem */
  menuItemName(text) {
    let base = String(text).replace(/&/g, '').trim().split(/\s+/)
      .map((w, i) => (i ? w.charAt(0).toLocaleUpperCase('tr-TR') + w.slice(1) : w)).join('');
    base = base.replace(/[^\p{L}\p{N}_]/gu, '');
    if (!base || /^\p{N}/u.test(base)) return this.uniqueName('toolStripMenuItem');
    base = base.charAt(0).toLocaleLowerCase('tr-TR') + base.slice(1) + 'ToolStripMenuItem';
    return this.allNames().has(base) ? this.uniqueName(base) : base;
  }

  addStripItem(ownerName, type, text) {
    if (this.readOnly) return;
    const owner = this.find(ownerName)?.control;
    if (!owner) return;
    this.snapshot();
    owner.props.StripItems ??= [];
    const name = type === 'ToolStripMenuItem' && text ? this.menuItemName(text) : this.uniqueName(STRIP_ITEMS[type].prefix);
    const item = { type, name, props: {}, events: {} };
    if (!['ToolStripSeparator', 'ToolStripProgressBar', 'ToolStripComboBox', 'ToolStripTextBox'].includes(type)) item.props.Text = text ?? name;
    owner.props.StripItems.push(item);
    this.selection = [name];
    this.commit();
    this.wrap.focus({ preventScroll: true });
  }

  /** ContextMenuStrip seçiliyken formun üstünde menü düzenleyicisi gösterilir. */
  renderContextEditors() {
    const path = this.openPath();
    for (const c of this.model.components || []) {
      if (c.type !== 'ContextMenuStrip') continue;
      const active = this.selection.includes(c.name) || [...path].some((n) => this.find(n)?.strip === c);
      if (!active) continue;
      const box = h('div', { class: 'd-ctxedit' }, h('div', { class: 'd-ctxedit-title' }, c.name));
      const drop = h('div', { class: 'wf-tsdrop d-ctxdrop' });
      for (const item of c.props.StripItems || []) drop.appendChild(this.renderStripItem(item, path));
      if (!this.readOnly) drop.appendChild(this.typeHere(c.name, 'dropdown'));
      box.appendChild(drop);
      this.formItem.client.appendChild(box);
    }
  }

  applyProps(it, c) {
    const p = c.props;
    const t = c.type;
    const [x, y] = p.Location || [0, 0];
    const [w, hh] = p.Size || CONTROLS[t]?.size || [75, 23];
    setProp(it, 'bounds', `${x},${y},${w},${hh}`);
    if ('Text' in p && t !== 'ComboBox') setProp(it, 'text', p.Text);
    if (p.BackColor) setProp(it, 'back', colorToCss(p.BackColor));
    if (p.ForeColor) setProp(it, 'fore', colorToCss(p.ForeColor));
    if (p.Font) setProp(it, 'font', fontToCss(p.Font));
    if (p.Enabled === false) setProp(it, 'enabled', '0');
    if (p.AutoSize) setProp(it, 'autosize', '1');
    const align = p.TextAlign ?? propDefault(t, 'TextAlign');
    if (align && ['Button', 'Label', 'LinkLabel', 'CheckBox', 'RadioButton'].includes(t)) setProp(it, 'align', align);
    if (p.HAlign) setProp(it, 'align', p.HAlign);
    const bs = p.BorderStyle ?? propDefault(t, 'BorderStyle');
    if (bs && ['Label', 'Panel', 'PictureBox', 'TextBox', 'MaskedTextBox', 'RichTextBox', 'ListBox'].includes(t)) setProp(it, 'borderstyle', bs);
    if (p.FlatStyle) setProp(it, 'flat', p.FlatStyle);
    switch (t) {
      case 'TextBox':
      case 'RichTextBox':
        if (t === 'RichTextBox' || p.Multiline) setProp(it, 'multiline', '1');
        if (p.PasswordChar || p.UseSystemPasswordChar) setProp(it, 'password', '1');
        if (p.ReadOnly) setProp(it, 'readonly', '1');
        if (p.ScrollBars) setProp(it, 'scrollbars', p.ScrollBars);
        if (p.PlaceholderText) setProp(it, 'placeholder', p.PlaceholderText);
        if ('Text' in p) setProp(it, 'text', p.Text);
        break;
      case 'CheckBox':
      case 'RadioButton':
        if (p.Checked) setProp(it, 'checked', '1');
        break;
      case 'ComboBox':
        setProp(it, 'style', p.DropDownStyle || 'DropDown');
        setProp(it, 'items', JSON.stringify(p.Items || []));
        if (p.Text) setProp(it, 'text', p.Text);
        break;
      case 'ListBox':
      case 'CheckedListBox': {
        const items = p.Items?.length ? p.Items : [c.name];
        setProp(it, 'items', JSON.stringify(items));
        if (!p.Items?.length) it.el.classList.add('d-placeholder');
        break;
      }
      case 'NumericUpDown':
        setProp(it, 'range', `${p.Minimum ?? 0},${p.Maximum ?? 100},${p.Increment ?? 1},${p.DecimalPlaces ?? 0}`);
        setProp(it, 'value', String(p.Value ?? 0));
        break;
      case 'ProgressBar':
        setProp(it, 'progress', `${p.IntMinimum ?? 0},${p.IntMaximum ?? 100},${p.IntValue ?? 0},${p.ProgressStyle || 'Blocks'}`);
        break;
      case 'TrackBar':
        setProp(it, 'range', `${p.TrackMinimum ?? 0},${p.TrackMaximum ?? 10},${p.TickFrequency ?? 1},${p.Orientation || 'Horizontal'},BottomRight`);
        setProp(it, 'value', String(p.TrackValue ?? 0));
        break;
      case 'DateTimePicker': {
        const d = new Date();
        const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:00`;
        setProp(it, 'datetime', `${p.Format || 'Long'}|${iso}|1753-01-01|9998-12-31`);
        break;
      }
      case 'PictureBox':
        if (p.ImageLocation) setProp(it, 'image', p.ImageLocation);
        setProp(it, 'sizemode', p.SizeMode || 'Normal');
        if (!p.ImageLocation && (!p.BorderStyle || p.BorderStyle === 'None')) it.el.classList.add('d-outline');
        break;
      case 'Panel':
        if (!p.BorderStyle || p.BorderStyle === 'None') it.el.classList.add('d-outline');
        break;
      case 'MenuStrip':
      case 'ToolStrip':
      case 'StatusStrip':
      case 'BindingNavigator':
        this.renderStrip(it, c, CONTROLS[t].strip);
        if (p.GripStyle === 'Hidden' || t === 'MenuStrip' || t === 'StatusStrip') setProp(it, 'grip', '0');
        break;
      case 'TabControl': {
        const pages = c.controls || [];
        setProp(it, 'tabs', JSON.stringify({ t: pages.map((pg) => pg.props.Text ?? pg.name), s: this.selectedTab(c), h: tabHeaderHeight(this.effectiveFont(c.name)) }));
        if (!pages.length) it.el.classList.add('d-outline');
        break;
      }
      case 'TabPage':
        setProp(it, 'visualback', p.UseVisualStyleBackColor ? '1' : '0');
        break;
      case 'MaskedTextBox':
        setProp(it, 'text', maskPreview(p.Mask, p.PromptChar || '_'));
        if (p.ReadOnly) setProp(it, 'readonly', '1');
        if (p.HAlign) setProp(it, 'align', p.HAlign);
        break;
      case 'DataGridView': {
        const cols = (p.Columns || []).map((c) => ({
          h: c.props?.HeaderText ?? c.name, w: Number(c.props?.Width) || 125, fw: 100,
          m: (c.props?.AutoSizeMode && c.props.AutoSizeMode !== 'NotSet' ? c.props.AutoSizeMode : p.AutoSizeColumnsMode) === 'Fill' ? 'fill' : '',
          k: 'text', hid: c.props?.Visible === false ? 1 : 0,
        }));
        const grid = {
          cols, rows: [], cur: [-1, -1],
          rh: p.RowHeadersVisible === false ? 0 : (p.RowHeadersWidth ?? 41), ch: p.ColumnHeadersVisible === false ? 0 : 23,
          bg: p.BackgroundColor ? colorToCss(p.BackgroundColor) : '#ababab', gc: p.GridColor ? colorToCss(p.GridColor) : '#a0a0a0',
        };
        setProp(it, 'grid', JSON.stringify(grid));
        if (p.BorderStyle) setProp(it, 'borderstyle', p.BorderStyle);
        it.el.tabIndex = -1;
        break;
      }
      default:
    }
    if (p.Visible === false) it.el.classList.add('wf-hidden-design');
    if (it.input) it.input.tabIndex = -1;
    if (t === 'Button') it.el.tabIndex = -1;
  }

  renderTray() {
    this.tray.innerHTML = '';
    for (const c of this.model.components || []) {
      const item = h('div', { class: 'dtray-item' + (this.selection.includes(c.name) ? ' selected' : ''), 'data-dname': c.name },
        h('span', {}, CONTROLS[c.type]?.icon || '⚙'), h('span', {}, c.name));
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this.select(e.ctrlKey || e.shiftKey ? this.toggled(c.name) : [c.name]);
        this.wrap.focus();
      });
      item.addEventListener('dblclick', () => this.openDefaultEvent(c.name));
      this.tray.appendChild(item);
    }
  }

  // ------------------------------------------------------------------ seçim

  toggled(name) {
    const s = this.selection.filter((n) => n !== FORM);
    return s.includes(name) ? (s.length > 1 ? s.filter((n) => n !== name) : s) : [...s, name];
  }

  select(names) {
    const before = this.openPath();
    this.selection = names.length ? names : [FORM];
    // Gizli sekmedeki bir kontrol seçilirse o sekme açılır; seçilen menü öğesinin alt menüsü açılır.
    let rerender = this.revealTabs(this.selection);
    const after = this.openPath();
    if (before.size !== after.size || [...after].some((n) => !before.has(n))) rerender = true;
    if (this.selection.some((n) => CONTROLS[this.find(n)?.control?.type]?.strip) || [...before].length) rerender = true;
    if (rerender) {
      this.render();
      this.host.onSelectionChanged(this);
      return;
    }
    this.drawSelection();
    this.renderTraySelection();
    this.host.onSelectionChanged(this);
  }

  /** Seçilen kontrol kapalı bir sekmedeyse o sekmeyi seçer. Değişiklik olduysa true. */
  revealTabs(names) {
    let changed = false;
    for (const n of names) {
      let e = this.find(n);
      while (e?.parent) {
        const parent = e.parent;
        if (parent.type === 'TabControl') {
          const idx = parent.controls.indexOf(e.control);
          if (idx >= 0 && idx !== this.selectedTab(parent)) {
            parent.props.SelectedIndex = idx;
            changed = true;
          }
        }
        e = this.find(parent.name);
      }
      const self = this.find(n);
      if (self?.control?.type === 'TabPage' && self.parent?.type === 'TabControl') {
        const idx = self.parent.controls.indexOf(self.control);
        if (idx !== this.selectedTab(self.parent)) { self.parent.props.SelectedIndex = idx; changed = true; }
      }
    }
    if (changed) this.host.onDesignChanged(this.formName);
    return changed;
  }

  renderTraySelection() {
    for (const el of this.tray.children) el.classList.toggle('selected', this.selection.includes(el.dataset.dname));
  }

  get primary() {
    return this.selection[0] || FORM;
  }

  rectOf(name) {
    const it = this.items.get(name);
    if (!it) return null;
    const s = this.surface.getBoundingClientRect();
    const r = it.el.getBoundingClientRect();
    return { x: r.left - s.left, y: r.top - s.top, w: r.width, h: r.height };
  }

  /** Bir kapsayıcının istemci alanının yüzeye göre konumu. */
  clientOrigin(name) {
    const it = this.items.get(name);
    if (!it) return { x: 0, y: 0 };
    const s = this.surface.getBoundingClientRect();
    const r = (name === FORM ? it.client : it.el).getBoundingClientRect();
    const el = name === FORM ? it.client : it.el;
    return { x: r.left - s.left + el.clientLeft, y: r.top - s.top + el.clientTop };
  }

  handlesFor(name) {
    if (this.readOnly) return [];
    if (name === FORM) return ['e', 's', 'se'];
    const e = this.find(name);
    if (!e?.control || e.component || e.item) return [];
    const c = e.control;
    if (c.type === 'TabPage') return [];
    const dock = c.props.Dock;
    if (dock && dock !== 'None') return { Fill: [], Top: ['s'], Bottom: ['n'], Left: ['e'], Right: ['w'] }[dock] || [];
    if (c.props.AutoSize && ['Label', 'LinkLabel', 'CheckBox', 'RadioButton'].includes(c.type)) return [];
    if ((c.type === 'TextBox' && !c.props.Multiline) || c.type === 'ComboBox' || c.type === 'NumericUpDown' || c.type === 'DateTimePicker') return ['e', 'w'];
    return ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
  }

  drawSelection() {
    this.layer.innerHTML = '';
    for (const it of this.items.values()) it.el.classList.remove('d-selected');
    const names = this.selection.filter((n) => this.items.has(n));
    names.forEach((name, i) => {
      const r = this.rectOf(name);
      if (!r) return;
      const box = h('div', { class: 'dsel' + (i === 0 ? ' primary' : ''), style: { left: r.x - 1 + 'px', top: r.y - 1 + 'px', width: r.w + 2 + 'px', height: r.h + 2 + 'px' } });
      this.layer.appendChild(box);
      if (names.length === 1) {
        const all = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
        const active = this.handlesFor(name);
        const pos = { nw: [0, 0], n: [0.5, 0], ne: [1, 0], e: [1, 0.5], se: [1, 1], s: [0.5, 1], sw: [0, 1], w: [0, 0.5] };
        for (const d of all) {
          if (name === FORM && !active.includes(d)) continue;
          const [fx, fy] = pos[d];
          const hd = h('div', { class: `dhandle ${d}` + (active.includes(d) ? '' : ' disabled'), 'data-dir': active.includes(d) ? d : '' });
          hd.style.left = r.x + fx * r.w + 'px';
          hd.style.top = r.y + fy * r.h + 'px';
          this.layer.appendChild(hd);
        }
      }
    });
  }

  // ------------------------------------------------------------------ olaylar

  bind() {
    this.wrap.addEventListener('mousedown', (e) => this.onMouseDown(e));
    this.wrap.addEventListener('keydown', (e) => this.onKey(e));
    this.wrap.addEventListener('dragover', (e) => {
      if (this.readOnly || !e.dataTransfer.types.includes('text/x-wf-control')) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      this.markDropTarget(this.containerAt(e.clientX, e.clientY));
    });
    this.wrap.addEventListener('dragleave', () => this.markDropTarget(null));
    this.wrap.addEventListener('drop', (e) => {
      const type = e.dataTransfer.getData('text/x-wf-control');
      this.markDropTarget(null);
      if (!type || this.readOnly) return;
      e.preventDefault();
      this.placeAt(type, e.clientX, e.clientY);
    });
  }

  hitName(target) {
    const el = target.closest?.('[data-dname]');
    if (!el || !this.el.contains(el)) return null;
    return el.dataset.dname;
  }

  /** İşaretçinin altındaki en içteki kapsayıcı (hariç tutulanlar dışında). */
  containerAt(x, y, exclude = new Set()) {
    const els = document.elementsFromPoint(x, y);
    for (const el of els) {
      const d = el.closest?.('[data-dname]');
      if (!d || !this.surface.contains(d)) continue;
      const name = d.dataset.dname;
      if (exclude.has(name)) continue;
      if (name === FORM) {
        const it = this.items.get(FORM);
        const r = it.client.getBoundingClientRect();
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return FORM;
        return null;
      }
      if (this.isContainer(name)) {
        let blocked = false;
        for (const ex of exclude) {
          if (ex !== FORM && this.isDescendant(name, ex)) blocked = true;
        }
        if (!blocked) return name;
      }
    }
    return null;
  }

  isDescendant(name, ancestor) {
    let cur = this.parentName(name);
    while (cur && cur !== FORM) {
      if (cur === ancestor) return true;
      cur = this.parentName(cur);
    }
    return false;
  }

  markDropTarget(name) {
    for (const it of this.items.values()) it.el.classList.remove('drop-target');
    this.surface.classList.toggle('drop-target-form', name === FORM);
    if (name && name !== FORM) this.items.get(name)?.el.classList.add('drop-target');
  }

  placeAt(type, clientX, clientY, size) {
    const parent = this.containerAt(clientX, clientY) || FORM;
    const o = this.clientOrigin(parent);
    const s = this.surface.getBoundingClientRect();
    const x = Math.max(0, Math.round(clientX - s.left - o.x));
    const y = Math.max(0, Math.round(clientY - s.top - o.y));
    this.addControl(type, parent, x, y, size);
  }

  /** Araç kutusunda çift tıklanınca: seçili kapsayıcıya ya da forma ekler. */
  addAtDefault(type) {
    const sel = this.primary;
    const parent = sel !== FORM && this.isContainer(sel) ? sel : FORM;
    const count = (this.childrenOf(parent) || []).length;
    this.addControl(type, parent, 12 + (count % 10) * 12, 12 + (count % 10) * 12);
  }

  addControl(type, parent, x, y, size) {
    if (this.readOnly) return;
    let table = null;
    if (type.startsWith('TableAdapter:')) {
      table = type.substring(13);
      type = 'TableAdapter';
    }
    const info = CONTROLS[type];
    if (!info) return;
    const db = this.host.data.database;
    this.snapshot();
    let name = this.uniqueName(info.prefix);
    if (type === 'TypedDataSet' && db) name = this.allNames().has(instanceName(db.dataSet)) ? this.uniqueName(instanceName(db.dataSet)) : instanceName(db.dataSet);
    if (type === 'TableAdapter' && table) name = this.allNames().has(`${table}TableAdapter`) ? this.uniqueName(`${table}TableAdapter`) : `${table}TableAdapter`;
    if (type === 'TableAdapterManager') name = this.allNames().has('tableAdapterManager') ? this.uniqueName('tableAdapterManager') : 'tableAdapterManager';
    if (info.component) {
      this.model.components ??= [];
      const props = info.defaults(name);
      if (type === 'TypedDataSet' && db) Object.assign(props, { DataSetName: db.dataSet, SchemaSerializationMode: 'IncludeSchema' });
      if (type === 'TableAdapter') props.Table = table || db?.tables[0]?.name;
      if (type === 'TableAdapterManager') {
        props.AdapterRef = {};
        for (const c of this.model.components) if (c.type === 'TableAdapter') props.AdapterRef[`${c.props.Table}TableAdapter`] ??= c.name;
      }
      this.model.components.push({ type, name, props, events: {} });
      this.selection = [name];
      this.commit();
      this.host.clearActiveTool?.();
      return;
    }
    if (info.item) return;
    if (type === 'TabPage' && this.find(parent)?.control?.type !== 'TabControl') return;
    const list = this.childrenOf(parent);
    const tab = Math.max(-1, ...this.walk(list, null, []).filter((e) => e.list === list).map((e) => e.control.props.TabIndex ?? -1)) + 1;
    const props = { ...info.defaults(name), Location: [x, y], Size: [...(size || info.size)], TabIndex: tab };
    const c = { type, name, props, events: {} };
    if (info.container) c.controls = [];
    if (info.tabs) {
      const reserved = new Set([name]);
      c.controls = [1, 2].map((i) => {
        const pn = this.uniqueName('tabPage', reserved);
        return { type: 'TabPage', name: pn, props: { ...CONTROLS.TabPage.defaults(pn), TabIndex: i - 1 }, events: {}, controls: [] };
      });
    }
    if (type === 'BindingNavigator') {
      // VS: araç kutusundan eklenen gezgin standart öğelerle gelir
      const reserved = new Set();
      const items = navigatorItems();
      const rename = {};
      for (const it of items) {
        const n = this.allNames().has(it.name) || reserved.has(it.name) ? this.uniqueName(it.name, reserved) : it.name;
        reserved.add(n);
        rename[it.name] = n;
        it.name = n;
      }
      props.StripItems = items;
      for (const [k, v] of Object.entries(navigatorRefs())) props[k] = rename[v];
      const bs = (this.model.components || []).find((c) => c.type === 'BindingSource');
      if (bs) props.BindingSourceRef = bs.name;
    }
    if (info.strip) {
      const [cw] = parent === FORM ? (this.model.props.ClientSize || [800, 450]) : this.find(parent).control.props.Size;
      props.Location = [0, 0];
      props.Size = [cw, info.size[1]];
      if (type === 'MenuStrip' && !this.model.props.MainMenuStrip && parent === FORM) this.model.props.MainMenuStrip = name;
    }
    if (type === 'MenuStrip') list.push(c);
    else list.unshift(c);
    this.selection = [name];
    this.commit();
    this.host.clearActiveTool?.();
    this.wrap.focus();
  }

  deleteSelection() {
    if (this.readOnly) return;
    const names = this.selection.filter((n) => n !== FORM);
    if (!names.length) return;
    this.snapshot();
    for (const n of names) {
      const e = this.find(n);
      if (!e) continue;
      const idx = e.list.indexOf(e.control);
      if (idx >= 0) e.list.splice(idx, 1);
      for (const k of ['AcceptButton', 'CancelButton', 'MainMenuStrip', 'ContextMenuStrip']) if (this.model.props[k] === n) delete this.model.props[k];
      for (const { control } of this.walk()) {
        if (control.props.ContextMenuStrip === n) delete control.props.ContextMenuStrip;
        delete control.props['ToolTip:' + n];
      }
      if (e.parent?.type === 'TabControl') e.parent.props.SelectedIndex = Math.min(this.selectedTab(e.parent), Math.max(0, e.parent.controls.length - 1));
    }
    this.selection = [FORM];
    this.commit();
  }

  copySelection(cut = false) {
    const names = this.selection.filter((n) => n !== FORM);
    if (!names.length) return;
    clipboard = names.map((n) => this.find(n)).filter((e) => e && !e.item && e.control.type !== 'TabPage').map((e) => ({ control: clone(e.control), component: !!e.component }));
    if (!clipboard.length) clipboard = null;
    if (cut) this.deleteSelection();
  }

  paste() {
    if (!clipboard?.length || this.readOnly) return;
    this.snapshot();
    const sel = this.primary;
    const parent = sel !== FORM && this.isContainer(sel) && clipboard.every((c) => c.control.name !== sel) ? sel : FORM;
    const list = this.childrenOf(parent);
    const added = [];
    const reserved = new Set();
    const rename = (c) => {
      c.name = this.uniqueName(CONTROLS[c.type]?.prefix || 'control', reserved);
      for (const col of c.props?.Columns || []) col.name = this.uniqueName(col.name.replace(/\d+$/, ''), reserved);
      for (const it of stripItemsOf(c)) it.name = this.uniqueName(it.name.replace(/\d+$/, ''), reserved);
      if (c.props?.ContextMenuStrip) delete c.props.ContextMenuStrip;
      if (c.controls) c.controls.forEach(rename);
    };
    for (const item of clipboard) {
      const c = clone(item.control);
      if (item.component) {
        c.name = this.uniqueName(CONTROLS[c.type]?.prefix || 'component', reserved);
        for (const it of stripItemsOf(c)) it.name = this.uniqueName(it.name.replace(/\d+$/, ''), reserved);
        this.model.components.push(c);
        added.push(c.name);
        continue;
      }
      rename(c);
      if (c.props.Location) c.props.Location = [c.props.Location[0] + 12, c.props.Location[1] + 12];
      if (c.props.Text === item.control.name) c.props.Text = c.name;
      list.unshift(c);
      added.push(c.name);
    }
    this.selection = added;
    this.commit();
  }

  openDefaultEvent(name) {
    const isForm = name === FORM;
    const e = isForm ? null : this.find(name);
    if (!isForm && !e?.control) return;
    const type = isForm ? null : e.control.type;
    const info = CONTROLS[type];
    if (!isForm && info && info.defaultEvent === null) return;
    const evt = isForm ? 'Load' : info?.defaultEvent || 'Click';
    this.host.openEventHandler(this, isForm ? FORM : name, evt);
  }

  // ------------------------------------------------------------------ fare: seçme, taşıma, boyutlandırma

  onMouseDown(e) {
    if (e.button !== 0) return;
    this.wrap.focus({ preventScroll: true });
    // Çift tıklama: seçim sonrası yeniden çizim tarayıcının dblclick olayını bozabildiği için elle algılanır.
    const hit = !e.target.closest('.dhandle, .d-typehere, .wf-tab') ? this.hitName(e.target) : null;
    const now = performance.now();
    if (hit && this.lastDown?.name === hit && now - this.lastDown.t < 450 && Math.abs(e.clientX - this.lastDown.x) < 5 && Math.abs(e.clientY - this.lastDown.y) < 5) {
      this.lastDown = null;
      e.preventDefault();
      if (!this.host.getActiveTool?.()) this.openDefaultEvent(hit);
      return;
    }
    this.lastDown = hit ? { name: hit, t: now, x: e.clientX, y: e.clientY } : null;
    const handle = e.target.closest('.dhandle');
    if (handle) {
      if (handle.dataset.dir) this.startResize(e, handle.dataset.dir);
      e.preventDefault();
      return;
    }
    const typeHere = e.target.closest('.d-typehere');
    if (typeHere && !this.readOnly) {
      e.preventDefault();
      if (!typeHere.classList.contains('editing')) this.beginTypeHere(typeHere, e);
      return;
    }
    const tool = this.host.getActiveTool?.();
    let name = this.hitName(e.target);
    if (!name) name = FORM;
    const tab = e.target.closest('.wf-tab');
    if (tab && !tool) {
      e.preventDefault();
      const tc = this.find(name)?.control;
      if (tc?.type === 'TabControl') {
        const idx = Number(tab.dataset.tab);
        if (idx !== this.selectedTab(tc)) {
          tc.props.SelectedIndex = idx;
          this.host.onDesignChanged(this.formName);
        }
        this.selection = [name];
        this.render();
        this.host.onSelectionChanged(this);
      }
      return;
    }
    const hitEntry = name !== FORM ? this.find(name) : null;
    if (hitEntry?.item && !tool) {
      e.preventDefault();
      this.select([name]);
      return;
    }
    if (hitEntry?.control?.type === 'TabPage' && !tool && !e.ctrlKey && !e.shiftKey) {
      e.preventDefault();
      this.select([name]);
      this.startRubber(e, name);
      return;
    }
    if (tool && !this.readOnly) {
      e.preventDefault();
      this.startDrawNew(e, tool);
      return;
    }
    if (e.ctrlKey || e.shiftKey) {
      if (name !== FORM) this.select(this.toggled(name));
      e.preventDefault();
      return;
    }
    const onFormClient = name === FORM && this.items.get(FORM).client.contains(e.target);
    if (name === FORM) {
      this.select([FORM]);
      if (onFormClient) this.startRubber(e, FORM);
      e.preventDefault();
      return;
    }
    if (!this.selection.includes(name)) this.select([name]);
    else if (this.selection[0] !== name) this.select([name, ...this.selection.filter((n) => n !== name)]);
    e.preventDefault();
    if (!this.readOnly) this.startMove(e, name);
  }

  startRubber(e, container) {
    const s = this.surface.getBoundingClientRect();
    const x0 = e.clientX - s.left;
    const y0 = e.clientY - s.top;
    let box = null;
    const move = (ev) => {
      const x1 = ev.clientX - s.left;
      const y1 = ev.clientY - s.top;
      if (!box && Math.abs(x1 - x0) + Math.abs(y1 - y0) < 4) return;
      if (!box) { box = h('div', { class: 'drubber' }); this.layer.appendChild(box); }
      const r = { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
      Object.assign(box.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
      box._r = r;
    };
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      if (!box) return;
      const r = box._r;
      box.remove();
      const hits = (this.childrenOf(container) || []).filter((c) => {
        const cr = this.rectOf(c.name);
        return cr && cr.x < r.x + r.w && cr.x + cr.w > r.x && cr.y < r.y + r.h && cr.y + cr.h > r.y;
      }).map((c) => c.name);
      if (hits.length) this.select(hits);
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  }

  startDrawNew(e, type) {
    const s = this.surface.getBoundingClientRect();
    const x0 = e.clientX;
    const y0 = e.clientY;
    let box = null;
    const move = (ev) => {
      if (!box && Math.abs(ev.clientX - x0) + Math.abs(ev.clientY - y0) < 5) return;
      if (!box) { box = h('div', { class: 'drubber' }); this.layer.appendChild(box); }
      Object.assign(box.style, {
        left: Math.min(x0, ev.clientX) - s.left + 'px', top: Math.min(y0, ev.clientY) - s.top + 'px',
        width: Math.abs(ev.clientX - x0) + 'px', height: Math.abs(ev.clientY - y0) + 'px',
      });
    };
    const up = (ev) => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      let size;
      if (box) {
        box.remove();
        const w = Math.round(Math.abs(ev.clientX - x0));
        const hh = Math.round(Math.abs(ev.clientY - y0));
        if (w > 8 && hh > 8) size = [w, hh];
      }
      this.placeAt(type, Math.min(x0, ev.clientX), Math.min(y0, ev.clientY), size);
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  }

  startMove(e, name) {
    const entry = this.find(name);
    if (!entry?.control || entry.component || entry.item || entry.control.type === 'TabPage') return;
    const parent = this.parentName(name);
    // Yalnızca aynı kapsayıcıdaki ve yerleşik (dock) olmayan seçili kontroller birlikte taşınır.
    const moving = this.selection.filter((n) => n !== FORM && this.parentName(n) === parent)
      .map((n) => this.find(n)).filter((x) => x?.control && !x.component && (!x.control.props.Dock || x.control.props.Dock === 'None'));
    if (!moving.length) return;
    const starts = moving.map((m) => ({ m, x: m.control.props.Location[0], y: m.control.props.Location[1], el: this.items.get(m.control.name).el }));
    const sx = e.clientX;
    const sy = e.clientY;
    let dragging = false;
    let target = parent;
    const single = moving.length === 1;
    const exclude = new Set(moving.map((m) => m.control.name));
    const siblings = (this.childrenOf(parent) || []).filter((c) => !exclude.has(c.name));
    const primary = starts.find((s) => s.m.control.name === name) || starts[0];
    const [pw, ph] = primary.m.control.props.Size;

    const move = (ev) => {
      let dx = ev.clientX - sx;
      let dy = ev.clientY - sy;
      if (!dragging) {
        if (Math.abs(dx) + Math.abs(dy) < 4) return;
        dragging = true;
        this.layer.innerHTML = '';
      }
      // Hizalama çizgileri (yalnızca aynı kapsayıcıdaki kardeşlere göre)
      this.clearGuides();
      if (!ev.altKey && target === parent) {
        const nx = primary.x + dx;
        const ny = primary.y + dy;
        const snapX = this.snapAxis(nx, pw, siblings.map((c) => [c.props.Location[0], c.props.Size[0]]));
        const snapY = this.snapAxis(ny, ph, siblings.map((c) => [c.props.Location[1], c.props.Size[1]]));
        if (snapX != null) dx += snapX.delta;
        if (snapY != null) dy += snapY.delta;
        this.showGuides(parent, snapX, snapY, primary.x + dx, primary.y + dy, pw, ph);
      }
      for (const st of starts) {
        st.el.style.left = st.x + dx + 'px';
        st.el.style.top = st.y + dy + 'px';
      }
      if (single) {
        const t = this.containerAt(ev.clientX, ev.clientY, exclude) || parent;
        target = t;
        this.markDropTarget(t !== parent ? t : null);
      }
      this.showInfo(`${primary.x + dx}; ${primary.y + dy}`);
    };
    const up = (ev) => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      this.clearGuides();
      this.markDropTarget(null);
      this.hideInfo();
      if (!dragging) return;
      const dx = parseInt(primary.el.style.left, 10) - primary.x;
      const dy = parseInt(primary.el.style.top, 10) - primary.y;
      this.snapshot();
      if (single && target !== parent) {
        // Başka bir kapsayıcıya taşı
        const c = primary.m.control;
        const abs = this.rectOf(c.name);
        const o = this.clientOrigin(target);
        primary.m.list.splice(primary.m.list.indexOf(c), 1);
        c.props.Location = [Math.round(abs.x - o.x), Math.round(abs.y - o.y)];
        this.childrenOf(target).unshift(c);
      } else {
        for (const st of starts) st.m.control.props.Location = [st.x + dx, st.y + dy];
      }
      this.commit();
      void ev;
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  }

  /** Kenar/merkez hizalaması için en yakın yapışma noktası. */
  snapAxis(pos, size, others) {
    let best = null;
    for (const [op, os] of others) {
      const candidates = [
        [op, pos], [op + os, pos + size], [op, pos + size], [op + os, pos], [op + os / 2, pos + size / 2],
      ];
      for (const [target, mine] of candidates) {
        const d = target - mine;
        if (Math.abs(d) <= SNAP && (!best || Math.abs(d) < Math.abs(best.delta))) best = { delta: Math.round(d), line: Math.round(target) };
      }
    }
    return best;
  }

  showGuides(parent, sx, sy) {
    const o = this.clientOrigin(parent);
    const it = this.items.get(parent);
    const pr = (parent === FORM ? it.client : it.el).getBoundingClientRect();
    if (sx) this.layer.appendChild(h('div', { class: 'dguide', style: { left: o.x + sx.line + 'px', top: o.y + 'px', width: '1px', height: pr.height + 'px' } }));
    if (sy) this.layer.appendChild(h('div', { class: 'dguide', style: { left: o.x + 'px', top: o.y + sy.line + 'px', height: '1px', width: pr.width + 'px' } }));
  }

  clearGuides() {
    for (const g of this.layer.querySelectorAll('.dguide')) g.remove();
  }

  showInfo(text) {
    this.info.textContent = text;
    this.info.classList.remove('hidden');
  }

  hideInfo() {
    this.info.classList.add('hidden');
  }

  startResize(e, dir) {
    const name = this.primary;
    const isForm = name === FORM;
    const c = isForm ? null : this.find(name)?.control;
    const [x0, y0] = isForm ? [0, 0] : c.props.Location;
    const [w0, h0] = isForm ? this.model.props.ClientSize || [800, 450] : c.props.Size;
    const sx = e.clientX;
    const sy = e.clientY;
    const it = this.items.get(name);
    let rect = [x0, y0, w0, h0];
    const move = (ev) => {
      const dx = Math.round(ev.clientX - sx);
      const dy = Math.round(ev.clientY - sy);
      let [x, y, w, hh] = [x0, y0, w0, h0];
      if (dir.includes('e')) w = w0 + dx;
      if (dir.includes('s')) hh = h0 + dy;
      if (dir.includes('w')) { x = x0 + dx; w = w0 - dx; }
      if (dir.includes('n')) { y = y0 + dy; hh = h0 - dy; }
      const minW = isForm ? 120 : 4;
      const minH = isForm ? 40 : 4;
      if (w < minW) { if (dir.includes('w')) x -= minW - w; w = minW; }
      if (hh < minH) { if (dir.includes('n')) y -= minH - hh; hh = minH; }
      rect = [x, y, w, hh];
      if (isForm) {
        it.client.style.width = w + 'px';
        it.client.style.height = hh + 'px';
      } else {
        Object.assign(it.el.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: hh + 'px' });
      }
      this.drawSelection();
      this.showInfo(`${w} x ${hh}`);
    };
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      this.hideInfo();
      if (rect.join() === [x0, y0, w0, h0].join()) return;
      this.snapshot();
      if (isForm) this.model.props.ClientSize = [rect[2], rect[3]];
      else {
        c.props.Location = [rect[0], rect[1]];
        c.props.Size = [rect[2], rect[3]];
      }
      this.commit();
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  }

  // ------------------------------------------------------------------ klavye

  onKey(e) {
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.key.toLowerCase() === 'z') { e.preventDefault(); this.undo(); return; }
    if (ctrl && e.key.toLowerCase() === 'y') { e.preventDefault(); this.redo(); return; }
    if (ctrl && e.key.toLowerCase() === 'c') { e.preventDefault(); this.copySelection(); return; }
    if (ctrl && e.key.toLowerCase() === 'x') { e.preventDefault(); this.copySelection(true); return; }
    if (ctrl && e.key.toLowerCase() === 'v') { e.preventDefault(); this.paste(); return; }
    if (ctrl && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      const parent = this.primary === FORM ? FORM : this.parentName(this.primary);
      const list = this.childrenOf(parent) || [];
      if (list.length) this.select(list.map((c) => c.name));
      return;
    }
    if (e.key === 'Delete') { e.preventDefault(); this.deleteSelection(); return; }
    if (e.key === 'Escape') {
      e.preventDefault();
      this.host.clearActiveTool?.();
      const p = this.primary;
      this.select(p === FORM ? [FORM] : [this.parentName(p)]);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      this.openDefaultEvent(this.primary);
      return;
    }
    const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (arrows[e.key] && !this.readOnly) {
      e.preventDefault();
      const names = this.selection.filter((n) => n !== FORM);
      if (!names.length) return;
      const [dx, dy] = arrows[e.key];
      const step = ctrl ? 8 : 1;
      this.snapshot();
      for (const n of names) {
        const c = this.find(n)?.control;
        if (!c || this.find(n).component) continue;
        if (e.shiftKey) {
          if (!this.handlesFor(n).length) continue;
          c.props.Size = [Math.max(1, c.props.Size[0] + dx * step), Math.max(1, c.props.Size[1] + dy * step)];
        } else if (!c.props.Dock || c.props.Dock === 'None') {
          c.props.Location = [c.props.Location[0] + dx * step, c.props.Location[1] + dy * step];
        }
      }
      this.commit();
    }
  }

  // ------------------------------------------------------------------ özellikler penceresinden gelen değişiklikler

  /** Seçili kontrollere özellik değeri atar. */
  setProperty(names, prop, value) {
    if (this.readOnly) return;
    this.snapshot();
    for (const name of names) {
      const props = name === FORM ? this.model.props : this.find(name)?.control?.props;
      if (!props) continue;
      if (value === undefined || value === null) delete props[prop];
      else props[prop] = value;
      const c = name === FORM ? null : this.find(name).control;
      if (c && prop === 'Multiline' && c.type === 'TextBox' && !value) c.props.Size = [c.props.Size[0], 23];
      if (c && prop === 'AutoSize' && !value && c.type === 'Label') c.props.Size = [...c.props.Size];
    }
    this.commit();
  }

  /** Kontrolü yeniden adlandırır (kod içindeki kullanımları da günceller). */
  renameControl(oldName, newName) {
    if (this.readOnly || oldName === newName) return true;
    if (this.allNames().has(newName)) return 'Bu ad zaten kullanılıyor.';
    const e = this.find(oldName);
    if (!e?.control) return 'Kontrol bulunamadı.';
    this.snapshot();
    e.control.name = newName;
    if (e.control.props.Text === oldName) e.control.props.Text = newName;
    for (const k of ['AcceptButton', 'CancelButton', 'MainMenuStrip', 'ContextMenuStrip']) if (this.model.props[k] === oldName) this.model.props[k] = newName;
    for (const { control } of this.walk()) {
      if (control.props.ContextMenuStrip === oldName) control.props.ContextMenuStrip = newName;
      if (('ToolTip:' + oldName) in control.props) {
        control.props['ToolTip:' + newName] = control.props['ToolTip:' + oldName];
        delete control.props['ToolTip:' + oldName];
      }
    }
    this.selection = this.selection.map((n) => (n === oldName ? newName : n));
    this.commit();
    this.host.renameInCode(this.formName, oldName, newName);
    return true;
  }

  /** DataGridView'in DataSource'u seçilince sütunlar tablodan üretilir (VS'deki gibi). */
  setGridDataSource(name, bsName) {
    if (this.readOnly) return;
    const grid = this.find(name)?.control;
    if (!grid) return;
    this.snapshot();
    if (!bsName) delete grid.props.DataSource;
    else {
      grid.props.DataSource = bsName;
      const bs = (this.model.components || []).find((c) => c.name === bsName);
      const table = this.host.data.database?.tables.find((x) => x.name === bs?.props.DataMember);
      if (table && !(grid.props.Columns || []).length) {
        grid.props.Columns = gridColumnsFor(table, this.allNames());
        grid.props.AutoGenerateColumns = false;
      }
    }
    this.commit();
  }

  /** TabPages düzenleyicisinden gelen sekme listesi: [{ page (var olan model ya da null), name, text }] */
  setTabPages(name, pages) {
    if (this.readOnly) return;
    const tc = this.find(name)?.control;
    if (!tc) return;
    this.snapshot();
    tc.controls = pages.map((p, i) => {
      const pg = p.page || { type: 'TabPage', name: p.name, props: { ...CONTROLS.TabPage.defaults(p.name) }, events: {}, controls: [] };
      pg.props.Text = p.text;
      pg.props.TabIndex = i;
      return pg;
    });
    tc.props.SelectedIndex = Math.min(this.selectedTab(tc), Math.max(0, tc.controls.length - 1));
    this.selection = [name];
    this.commit();
  }

  setEvent(name, evt, handler) {
    if (this.readOnly) return;
    const target = name === FORM ? this.model : this.find(name)?.control;
    if (!target) return;
    this.snapshot();
    target.events ??= {};
    if (handler) target.events[evt] = handler;
    else delete target.events[evt];
    this.commit();
  }

  focus() {
    this.wrap.focus({ preventScroll: true });
  }

  refresh() {
    this.normalize();
    this.render();
  }
}

export { FORM };
