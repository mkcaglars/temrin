// WinForms kontrollerinin HTML ile çizimi.
// Bu modül hem çalışan programda (runner.js) hem de form tasarımcısında (designer.js) kullanılır.

import { createGrid, renderGrid } from './grid.js';

const ALIGN_V = { Top: 'flex-start', Middle: 'center', Bottom: 'flex-end' };
const ALIGN_H = { Left: 'flex-start', Center: 'center', Right: 'flex-end' };

export const FRAME = { title: 31, border: 1 };

/** "TopLeft" gibi ContentAlignment değerini CSS flex hizalamasına çevirir. */
export function applyContentAlign(el, value) {
  const m = /^(Top|Middle|Bottom)(Left|Center|Right)$/.exec(value || 'TopLeft');
  if (!m) return;
  el.style.alignItems = ALIGN_V[m[1]];
  el.style.justifyContent = ALIGN_H[m[2]];
  el.style.textAlign = m[2].toLowerCase();
}

/** "aile|boyutPt|kalın|italik|altıçizili|üstüçizili" biçimindeki yazı tipini uygular. */
export function applyFont(el, css) {
  if (!css) {
    el.style.fontFamily = el.style.fontSize = el.style.fontWeight = el.style.fontStyle = el.style.textDecoration = '';
    return;
  }
  const [family, size, b, i, u, s] = css.split('|');
  el.style.fontFamily = `"${family}", "Segoe UI", Tahoma, Arial, sans-serif`;
  el.style.fontSize = `${size}pt`;
  el.style.fontWeight = b === '1' ? 'bold' : 'normal';
  el.style.fontStyle = i === '1' ? 'italic' : 'normal';
  const deco = [];
  if (u === '1') deco.push('underline');
  if (s === '1') deco.push('line-through');
  el.style.textDecoration = deco.join(' ');
}

/** WinForms'taki & kısayol işaretini kaldırır (&& → &). */
export function mnemonic(text) {
  return String(text ?? '').replace(/&&|&/g, (m) => (m === '&&' ? '&' : ''));
}

let measureCanvas;
/** Metnin piksel ölçüsünü WinForms'a yakın biçimde hesaplar. */
export function measureText(text, fontCss) {
  measureCanvas ??= document.createElement('canvas');
  const ctx = measureCanvas.getContext('2d');
  const [family, size, b, i] = (fontCss || 'Segoe UI|9|0|0|0|0').split('|');
  const px = (parseFloat(size) || 9) * 96 / 72;
  ctx.font = `${i === '1' ? 'italic ' : ''}${b === '1' ? 'bold ' : ''}${px}px "${family}", "Segoe UI", Tahoma, Arial, sans-serif`;
  const lines = String(text ?? '').replace(/\r\n/g, '\n').split('\n');
  let w = 0;
  for (const line of lines) w = Math.max(w, ctx.measureText(mnemonic(line)).width);
  const lineHeight = Math.ceil(px * 1.25);
  return { w: Math.ceil(w) + 3, h: lineHeight * lines.length };
}

function div(cls) {
  const d = document.createElement('div');
  if (cls) d.className = cls;
  return d;
}

// ---------------------------------------------------------------------------
// Kontrol oluşturucular. Her biri { el, client?, ... } döndürür.
// ---------------------------------------------------------------------------

const creators = {
  Form() {
    const el = div('wf-window');
    el.innerHTML = `
      <div class="wf-titlebar">
        <span class="wf-icon"></span><span class="wf-title"></span>
        <span class="wf-caption-buttons">
          <button class="wf-cap wf-min" title="Simge durumuna küçült" tabindex="-1">&#8212;</button>
          <button class="wf-cap wf-max" title="Ekranı kapla" tabindex="-1">&#9744;</button>
          <button class="wf-cap wf-close" title="Kapat" tabindex="-1">&#10005;</button>
        </span>
      </div>
      <div class="wf-client"></div>
      <div class="wf-grip"></div>`;
    return { el, client: el.querySelector('.wf-client'), title: el.querySelector('.wf-title') };
  },
  Button() {
    const el = document.createElement('button');
    el.className = 'wf-ctl wf-button';
    el.type = 'button';
    const span = document.createElement('span');
    el.appendChild(span);
    return { el, textEl: span };
  },
  Label() {
    const el = div('wf-ctl wf-label');
    const span = document.createElement('span');
    el.appendChild(span);
    return { el, textEl: span };
  },
  LinkLabel() {
    const r = creators.Label();
    r.el.classList.add('wf-link');
    return r;
  },
  CheckBox() {
    const el = document.createElement('label');
    el.className = 'wf-ctl wf-check';
    el.innerHTML = '<input type="checkbox"><span></span>';
    return { el, input: el.querySelector('input'), textEl: el.querySelector('span') };
  },
  RadioButton() {
    const el = document.createElement('label');
    el.className = 'wf-ctl wf-check wf-radio';
    el.innerHTML = '<input type="radio"><span></span>';
    return { el, input: el.querySelector('input'), textEl: el.querySelector('span') };
  },
  TextBox() {
    const el = div('wf-ctl wf-textbox');
    const input = document.createElement('input');
    input.type = 'text';
    input.spellcheck = false;
    el.appendChild(input);
    return { el, input };
  },
  ComboBox() {
    const el = div('wf-ctl wf-combo');
    el.innerHTML = '<input type="text" spellcheck="false"><button type="button" tabindex="-1">&#9662;</button><div class="wf-combo-list"></div>';
    return { el, input: el.querySelector('input'), button: el.querySelector('button'), list: el.querySelector('.wf-combo-list'), items: [], sel: -1 };
  },
  ListBox() {
    const el = div('wf-ctl wf-listbox');
    el.tabIndex = 0;
    return { el, items: [], sel: [], checked: [] };
  },
  CheckedListBox() {
    const r = creators.ListBox();
    r.el.classList.add('wf-checkedlist');
    return r;
  },
  GroupBox() {
    const el = div('wf-ctl wf-groupbox');
    el.innerHTML = '<div class="wf-group-frame"></div><span class="wf-group-title"></span>';
    return { el, client: el, textEl: el.querySelector('.wf-group-title') };
  },
  Panel() {
    const el = div('wf-ctl wf-panel');
    return { el, client: el };
  },
  PictureBox() {
    const el = div('wf-ctl wf-picture');
    const img = document.createElement('img');
    img.alt = '';
    img.draggable = false;
    img.style.display = 'none';
    el.appendChild(img);
    return { el, img };
  },
  NumericUpDown() {
    const el = div('wf-ctl wf-numeric');
    el.innerHTML = '<input type="number" step="1" value="0">';
    return { el, input: el.querySelector('input'), decimals: 0 };
  },
  ProgressBar() {
    const el = div('wf-ctl wf-progress');
    el.innerHTML = '<div class="wf-progress-bar"></div>';
    return { el, bar: el.firstChild };
  },
  TrackBar() {
    const el = div('wf-ctl wf-trackbar');
    el.innerHTML = '<input type="range" min="0" max="10" value="0">';
    return { el, input: el.querySelector('input') };
  },
  DateTimePicker() {
    const el = div('wf-ctl wf-datetime');
    el.innerHTML = '<input type="date">';
    return { el, input: el.querySelector('input'), format: 'Long' };
  },
  // ---------------- Araç çubukları (ToolStrip ailesi) ----------------
  ToolStrip() {
    const el = div('wf-ctl wf-strip wf-toolstrip');
    el.innerHTML = '<span class="wf-grip-dots"></span>';
    return { el, client: el };
  },
  BindingNavigator() {
    return creators.ToolStrip();
  },
  MenuStrip() {
    const el = div('wf-ctl wf-strip wf-menustrip');
    return { el, client: el };
  },
  StatusStrip() {
    const el = div('wf-ctl wf-strip wf-statusstrip');
    return { el, client: el };
  },
  ContextMenuStrip() {
    const el = div('wf-ctxmenu wf-tsdrop');
    return { el, client: el };
  },
  TSButton() {
    const el = document.createElement('button');
    el.type = 'button';
    el.tabIndex = -1;
    el.className = 'wf-tsitem wf-tsbutton';
    el.innerHTML = '<img alt="" draggable="false"><span class="wf-tstext"></span>';
    return { el, textEl: el.querySelector('.wf-tstext'), img: el.querySelector('img') };
  },
  TSLabel() {
    const el = document.createElement('span');
    el.className = 'wf-tsitem wf-tslabel';
    el.innerHTML = '<img alt="" draggable="false"><span class="wf-tstext"></span>';
    return { el, textEl: el.querySelector('.wf-tstext'), img: el.querySelector('img') };
  },
  TSStatusLabel() {
    const r = creators.TSLabel();
    r.el.classList.add('wf-tsstatus');
    return r;
  },
  TSSeparator() {
    const el = document.createElement('span');
    el.className = 'wf-tsitem wf-tssep';
    return { el };
  },
  TSTextBox() {
    const el = document.createElement('span');
    el.className = 'wf-tsitem wf-tstextbox';
    el.innerHTML = '<input type="text" spellcheck="false">';
    return { el, input: el.querySelector('input') };
  },
  TSComboBox() {
    const el = document.createElement('span');
    el.className = 'wf-tsitem wf-tscombo';
    el.innerHTML = '<select></select>';
    return { el, select: el.querySelector('select'), items: [] };
  },
  TSProgressBar() {
    const el = document.createElement('span');
    el.className = 'wf-tsitem wf-tsprogress';
    el.innerHTML = '<span class="wf-progress-bar"></span>';
    return { el, bar: el.firstChild };
  },
  TSMenuItem() {
    const el = div('wf-tsitem wf-tsmenu');
    el.innerHTML = '<span class="wf-tsrow"><span class="wf-tscheck"></span><img alt="" draggable="false"><span class="wf-tstext"></span><span class="wf-tsshortcut"></span><span class="wf-tsarrow"></span></span><div class="wf-tsdrop"></div>';
    return { el, textEl: el.querySelector('.wf-tstext'), img: el.querySelector('img'), client: el.querySelector('.wf-tsdrop'), shortcutEl: el.querySelector('.wf-tsshortcut') };
  },
  TSDropDownButton() {
    const r = creators.TSMenuItem();
    r.el.classList.add('wf-tsddbutton');
    return r;
  },
  DataGridView() {
    return createGrid();
  },
  MaskedTextBox() {
    const r = creators.TextBox();
    r.el.classList.add('wf-masked');
    return r;
  },
  TabControl() {
    const el = div('wf-ctl wf-tabcontrol');
    el.innerHTML = '<div class="wf-tabhdr"></div><div class="wf-tabframe"></div>';
    return { el, client: el, header: el.firstChild, frame: el.lastChild, tabs: [], sel: -1 };
  },
  TabPage() {
    const el = div('wf-ctl wf-tabpage');
    return { el, client: el };
  },
  Control() {
    return { el: div('wf-ctl') };
  },
};

/** Yeni bir kontrol çizimi oluşturur. */
export function createItem(type, id) {
  const make = creators[type] || creators.Control;
  const item = make();
  item.type = creators[type] ? type : 'Control';
  item.id = id;
  item.props = {};
  item.el.dataset.wfId = id;
  item.client ??= null;
  return item;
}

function setText(item, value) {
  const t = mnemonic(value);
  if (item.type === 'Form') {
    item.title.textContent = value;
    return;
  }
  if (item.type === 'TextBox' || item.type === 'MaskedTextBox') {
    if (item.input.value !== value) item.input.value = value;
    return;
  }
  if (item.type === 'ComboBox') {
    if (item.input.value !== value) item.input.value = value;
    return;
  }
  if (item.type === 'NumericUpDown' || item.type === 'DateTimePicker' || item.type === 'TrackBar' ||
      item.type === 'ProgressBar' || item.type === 'ListBox' || item.type === 'CheckedListBox' ||
      item.type === 'PictureBox' || item.type === 'Panel' || item.type === 'TabPage' || item.type === 'TabControl') return;
  if (item.textEl) item.textEl.textContent = t;
}

function setMultiline(item, on) {
  const isArea = item.input.tagName === 'TEXTAREA';
  if (on === isArea) return;
  const old = item.input;
  const n = document.createElement(on ? 'textarea' : 'input');
  if (!on) n.type = old.type === 'password' ? 'password' : 'text';
  n.spellcheck = false;
  n.value = old.value;
  n.readOnly = old.readOnly;
  n.maxLength = old.maxLength > 0 ? old.maxLength : 32767;
  n.style.textAlign = old.style.textAlign;
  n.placeholder = old.placeholder;
  n.tabIndex = old.tabIndex;
  n.disabled = old.disabled;
  old.replaceWith(n);
  item.input = n;
  item.onInputReplaced?.(n, old);
  item.el.classList.toggle('wf-multiline', on);
}

function renderComboList(item) {
  item.list.innerHTML = '';
  item.items.forEach((text, i) => {
    const d = div('wf-combo-item' + (i === item.sel ? ' selected' : ''));
    d.textContent = text;
    d.dataset.index = i;
    item.list.appendChild(d);
  });
}

function renderListBox(item) {
  item.el.innerHTML = '';
  const checkable = item.type === 'CheckedListBox';
  item.items.forEach((text, i) => {
    const d = div('wf-list-item' + (item.sel.includes(i) ? ' selected' : ''));
    d.dataset.index = i;
    if (checkable) {
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.tabIndex = -1;
      cb.checked = item.checked.includes(i);
      cb.dataset.index = i;
      d.appendChild(cb);
    }
    const s = document.createElement('span');
    s.textContent = text;
    d.appendChild(s);
    item.el.appendChild(d);
  });
}

function parseList(value) {
  return value === '' || value == null ? [] : String(value).split(',').map(Number);
}


/** ToolStrip öğelerine özgü özellikler. İşlendiyse true döner. */
function setToolStripProp(item, prop, value) {
  const el = item.el;
  switch (prop) {
    case 'text':
      if (item.input) { if (item.input.value !== value) item.input.value = value; }
      else if (item.select) { /* seçim metni 'sel' ile */ }
      else if (item.textEl) item.textEl.textContent = mnemonic(value);
      el.classList.toggle('wf-tsempty', !value);
      return true;
    case 'enabled':
      el.classList.toggle('wf-tsdisabled', value === '0');
      if (item.input) item.input.disabled = value === '0';
      if (item.select) item.select.disabled = value === '0';
      return true;
    case 'visible':
      el.classList.toggle('wf-hidden', value === '0');
      return true;
    case 'image':
      if (item.img) {
        if (value) item.img.src = value; else item.img.removeAttribute('src');
        el.classList.toggle('wf-tshasimg', !!value);
      }
      return true;
    case 'displaystyle':
      el.dataset.display = value;
      return true;
    case 'alignment':
      el.classList.toggle('wf-tsright', value === 'Right');
      return true;
    case 'checked':
      el.classList.toggle('wf-tschecked', value === '1');
      return true;
    case 'islink':
      el.classList.toggle('wf-tslink', value === '1');
      return true;
    case 'spring':
      el.classList.toggle('wf-tsspring', value === '1');
      return true;
    case 'shortcut':
      item.shortcut = Number(value) || 0;
      return true;
    case 'shortcuttext':
      if (item.shortcutEl) item.shortcutEl.textContent = value;
      return true;
    case 'items':
      if (item.select) {
        item.items = JSON.parse(value || '[]');
        item.select.innerHTML = '';
        item.items.forEach((t, i) => { const o = document.createElement('option'); o.value = i; o.textContent = t; item.select.appendChild(o); });
        item.select.selectedIndex = item.sel ?? -1;
      }
      return true;
    case 'sel':
      if (item.select) { item.sel = Number(value); item.select.selectedIndex = item.sel; }
      return true;
    case 'tooltip':
      el.title = value;
      return true;
    case 'glyph': {
      // BindingNavigator düğmeleri: VS'deki simgelerin yerine karakter
      if (!item.glyphEl) {
        item.glyphEl = document.createElement('span');
        item.glyphEl.className = 'wf-tsglyph';
        (item.el.querySelector('.wf-tsrow') || item.el).insertBefore(item.glyphEl, item.textEl || null);
      }
      item.glyphEl.textContent = value;
      el.classList.toggle('wf-tshasglyph', !!value);
      return true;
    }
    case 'width': {
      const w = Number(value) || 0;
      el.style.width = w ? w + 'px' : '';
      if (item.input) item.input.style.width = w ? Math.max(10, w - 4) + 'px' : '';
      return true;
    }
    default:
      return false;
  }
}

/** Öğeleri koleksiyondaki sıraya göre dizer ("itemorder" özelliği). */
export function orderChildren(container, ids, lookup) {
  for (const id of ids) {
    const child = lookup(Number(id));
    if (child && child.el.parentNode === container) container.appendChild(child.el);
  }
}

/** Bir özelliği çizime uygular. Form'a özgü pencere işlemleri runner/designer'da yapılır. */
export function setProp(item, prop, value) {
  item.props[prop] = value;
  const el = item.el;
  if (item.type.startsWith('TS') && setToolStripProp(item, prop, value)) return;
  switch (prop) {
    case 'bounds': {
      const [x, y, w, h] = value.split(',').map(Number);
      if (item.type === 'Form') {
        item.client.style.width = w + 'px';
        item.client.style.height = h + 'px';
        item.clientW = w;
        item.clientH = h;
        item.x = x;
        item.y = y;
        return;
      }
      el.style.left = x + 'px';
      el.style.top = y + 'px';
      el.style.width = w + 'px';
      el.style.height = h + 'px';
      if (item.type === 'DataGridView' && item.gridJson) renderGrid(item, item.gridJson);
      if (item.errEl) placeErrorIcon(item);
      return;
    }
    case 'text': setText(item, value); return;
    case 'visible': el.classList.toggle('wf-hidden', value === '0'); return;
    case 'enabled': {
      el.classList.toggle('wf-disabled', value === '0');
      if (item.input) item.input.disabled = value === '0';
      if (item.type === 'Button') el.disabled = value === '0';
      return;
    }
    case 'back': {
      const target = item.type === 'Form' ? item.client : el;
      target.style.backgroundColor = value;
      if (item.type === 'TextBox' || item.type === 'NumericUpDown' || item.type === 'ComboBox') {
        if (item.input) item.input.style.backgroundColor = value;
      }
      el.classList.toggle('wf-has-back', !!value);
      return;
    }
    case 'fore': {
      const target = item.type === 'Form' ? item.client : el;
      target.style.color = value;
      if (item.input) item.input.style.color = value;
      return;
    }
    case 'font': applyFont(item.type === 'Form' ? item.client : el, value); return;
    case 'z': el.style.zIndex = value; return;
    case 'cursor': el.style.cursor = value; return;
    case 'tooltip': el.title = value; return;
    case 'name': el.dataset.name = value; return;
    case 'tabindex': {
      const t = Number(value) + 1;
      if (item.input) item.input.tabIndex = t;
      else if (item.type === 'Button' || item.type === 'ListBox' || item.type === 'CheckedListBox') el.tabIndex = t;
      return;
    }
    case 'tabstop': {
      if (value === '0') { if (item.input) item.input.tabIndex = -1; else el.tabIndex = -1; }
      return;
    }
    case 'autosize': el.classList.toggle('wf-autosize', value === '1'); return;
    case 'align': {
      if (item.type === 'TextBox' || item.type === 'NumericUpDown') {
        item.input.style.textAlign = value.toLowerCase();
      } else {
        applyContentAlign(el, value);
        if (item.textEl) item.textEl.style.textAlign = el.style.textAlign;
      }
      return;
    }
    case 'borderstyle': {
      el.classList.remove('wf-border-none', 'wf-border-single', 'wf-border-3d');
      el.classList.add(value === 'None' ? 'wf-border-none' : value === 'FixedSingle' ? 'wf-border-single' : 'wf-border-3d');
      return;
    }
    case 'bgimage': {
      const target = item.type === 'Form' ? item.client : el;
      target.style.backgroundImage = value ? `url("${value}")` : '';
      return;
    }
    case 'bglayout': {
      const target = item.type === 'Form' ? item.client : el;
      const map = { None: ['no-repeat', 'auto'], Tile: ['repeat', 'auto'], Center: ['no-repeat', 'auto'], Stretch: ['no-repeat', '100% 100%'], Zoom: ['no-repeat', 'contain'] };
      const [rep, size] = map[value] || map.Tile;
      target.style.backgroundRepeat = rep;
      target.style.backgroundSize = size;
      target.style.backgroundPosition = value === 'Center' || value === 'Zoom' ? 'center' : '0 0';
      return;
    }
    case 'flat': el.classList.toggle('wf-flat', value === 'Flat' || value === 'Popup'); return;
    case 'image': {
      if (item.type === 'PictureBox') {
        item.img.style.display = value ? '' : 'none';
        if (value) item.img.src = value; else item.img.removeAttribute('src');
      } else {
        el.style.backgroundImage = value ? `url("${value}")` : '';
        el.classList.toggle('wf-with-image', !!value);
      }
      return;
    }
    case 'sizemode': {
      const fit = { Normal: ['none', 'left top'], StretchImage: ['fill', 'center'], AutoSize: ['none', 'left top'], CenterImage: ['none', 'center'], Zoom: ['contain', 'center'] }[value] || ['none', 'left top'];
      item.img.style.objectFit = fit[0];
      item.img.style.objectPosition = fit[1];
      return;
    }
    case 'checked': {
      if (!item.input) return;
      item.input.checked = value === '1';
      item.input.indeterminate = value === '2';
      return;
    }
    case 'multiline': setMultiline(item, value === '1'); return;
    case 'password': if (item.input.tagName === 'INPUT') item.input.type = value === '1' ? 'password' : 'text'; return;
    case 'readonly': item.input.readOnly = value === '1'; el.classList.toggle('wf-readonly', value === '1'); return;
    case 'maxlength': item.input.maxLength = Number(value) > 0 ? Number(value) : 32767; return;
    case 'wordwrap': item.input.style.whiteSpace = value === '0' ? 'pre' : ''; item.input.wrap = value === '0' ? 'off' : 'soft'; return;
    case 'scrollbars': {
      const v = { None: 'hidden', Horizontal: 'hidden auto', Vertical: 'auto', Both: 'auto' }[value] || 'hidden';
      item.input.style.overflow = value === 'None' ? 'hidden' : 'auto';
      item.input.style.overflowY = value === 'Vertical' || value === 'Both' ? 'scroll' : 'hidden';
      item.input.style.overflowX = value === 'Horizontal' || value === 'Both' ? 'scroll' : 'hidden';
      void v;
      return;
    }
    case 'placeholder': item.input.placeholder = value; return;
    case 'items': {
      item.items = JSON.parse(value || '[]');
      if (item.type === 'ComboBox') renderComboList(item);
      else renderListBox(item);
      return;
    }
    case 'sel': {
      if (item.type === 'ComboBox') {
        item.sel = Number(value);
        renderComboList(item);
      } else {
        item.sel = parseList(value);
        for (const d of el.querySelectorAll('.wf-list-item')) d.classList.toggle('selected', item.sel.includes(Number(d.dataset.index)));
      }
      return;
    }
    case 'checkeditems': {
      item.checked = parseList(value);
      for (const cb of el.querySelectorAll('input[type=checkbox]')) cb.checked = item.checked.includes(Number(cb.dataset.index));
      return;
    }
    case 'selmode': el.dataset.selmode = value; return;
    case 'style': {
      item.input.readOnly = value === 'DropDownList';
      el.classList.toggle('wf-dropdownlist', value === 'DropDownList');
      el.classList.toggle('wf-simple', value === 'Simple');
      return;
    }
    case 'range': {
      if (item.type === 'NumericUpDown') {
        const [min, max, inc, dec] = value.split(',');
        Object.assign(item.input, { min, max, step: inc });
        item.decimals = Number(dec);
        if (item.props.value != null) item.input.value = Number(item.props.value).toFixed(item.decimals);
      } else if (item.type === 'TrackBar') {
        const [min, max, tick, orient] = value.split(',');
        Object.assign(item.input, { min, max });
        item.input.dataset.tick = tick;
        el.classList.toggle('wf-vertical', orient === 'Vertical');
      }
      return;
    }
    case 'value': {
      if (item.type === 'NumericUpDown') {
        const v = Number(value).toFixed(item.decimals || 0);
        if (item.input.value !== v) item.input.value = v;
      } else if (item.input) item.input.value = value;
      return;
    }
    case 'progress': {
      const [min, max, v, style] = value.split(',');
      const pct = Number(max) > Number(min) ? (Number(v) - Number(min)) * 100 / (Number(max) - Number(min)) : 0;
      item.bar.style.width = (style === 'Marquee' ? 30 : Math.max(0, Math.min(100, pct))) + '%';
      el.classList.toggle('wf-marquee', style === 'Marquee');
      return;
    }
    case 'grip':
      el.classList.toggle('wf-nogrip', value === '0');
      return;
    case 'grid':
      renderGrid(item, value);
      return;
    case 'mask':
      item.mask = value ? JSON.parse(value) : null;
      return;
    case 'tabs':
      renderTabs(item, value);
      return;
    case 'visualback':
      el.classList.toggle('wf-visualback', value === '1');
      return;
    case 'error':
      setErrorIcon(item, value);
      return;
    case 'datetime': {
      const [format, iso, min, max] = value.split('|');
      const type = format === 'Time' ? 'time' : 'date';
      if (item.input.type !== type) item.input.type = type;
      item.format = format;
      item.input.value = type === 'time' ? iso.substring(11, 19) : iso.substring(0, 10);
      if (type === 'date') { item.input.min = min; item.input.max = max; }
      return;
    }
    default:
      return;
  }
}

function renderTabs(item, json) {
  const t = JSON.parse(json);
  item.tabs = t.t;
  item.sel = t.s;
  item.header.style.height = (t.h - 2) + 'px';
  item.frame.style.top = (t.h - 2) + 'px';
  item.header.innerHTML = '';
  t.t.forEach((text, i) => {
    const b = document.createElement('div');
    b.className = 'wf-tab' + (i === t.s ? ' selected' : '');
    b.dataset.tab = i;
    b.textContent = mnemonic(text) || '\u00a0';
    item.header.appendChild(b);
  });
}

/** ErrorProvider simgesi: kontrolün yanında kırmızı ünlem. değer: "hizalama|boşluk|yanıp sön|ileti" */
function setErrorIcon(item, value) {
  if (!value) {
    item.errEl?.remove();
    item.errEl = null;
    return;
  }
  const [align, pad, blink, ...rest] = value.split('|');
  if (!item.errEl) {
    item.errEl = document.createElement('span');
    item.errEl.className = 'wf-erricon';
    item.errEl.textContent = '!';
  }
  item.errEl.title = rest.join('|');
  item.errAlign = align;
  item.errPad = Number(pad) || 0;
  if (blink === '1') {
    item.errEl.classList.remove('wf-blink');
    void item.errEl.offsetWidth;
    item.errEl.classList.add('wf-blink');
  }
  if (item.errEl.parentElement !== item.el.parentElement && item.el.parentElement) item.el.parentElement.appendChild(item.errEl);
  placeErrorIcon(item);
}

function placeErrorIcon(item) {
  const [x, y, w, h] = String(item.props.bounds || '0,0,0,0').split(',').map(Number);
  const a = item.errAlign || 'MiddleRight';
  const left = a.endsWith('Left') ? x - 16 - item.errPad - 2 : x + w + item.errPad + 2;
  const top = a.startsWith('Top') ? y : a.startsWith('Bottom') ? y + h - 16 : y + Math.round((h - 16) / 2);
  item.errEl.style.left = left + 'px';
  item.errEl.style.top = top + 'px';
  if (!item.errEl.parentElement && item.el.parentElement) item.el.parentElement.appendChild(item.errEl);
}

/** Bir kontrolün çocuklarını yerleştireceği öğe. */
export function clientOf(item) {
  return item.client || item.el;
}

export const ICONS = {
  Error: '⛔', Hand: '⛔', Stop: '⛔',
  Warning: '⚠️', Exclamation: '⚠️',
  Information: 'ℹ️', Asterisk: 'ℹ️',
  Question: '❓',
};

export const BUTTON_TEXT = {
  OK: 'Tamam', Cancel: 'İptal', Yes: 'Evet', No: 'Hayır', Abort: 'Durdur', Retry: 'Yeniden Dene', Ignore: 'Yoksay',
  TryAgain: 'Yeniden Dene', Continue: 'Devam',
};

export const BUTTON_SETS = {
  OK: ['OK'], OKCancel: ['OK', 'Cancel'], AbortRetryIgnore: ['Abort', 'Retry', 'Ignore'],
  YesNoCancel: ['Yes', 'No', 'Cancel'], YesNo: ['Yes', 'No'], RetryCancel: ['Retry', 'Cancel'],
  CancelTryContinue: ['Cancel', 'TryAgain', 'Continue'],
};
