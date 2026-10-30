// DataGridView çizimi. Motor tablonun tamamını tek bir "grid" özelliği (JSON) olarak gönderir.
import { applyFont } from './winui.js';

const ALIGN = { Left: 'left', Center: 'center', Right: 'right' };
const VALIGN = { Top: 'top', Middle: 'middle', Bottom: 'bottom' };
const SEL_BACK = '#0078d7';
const SEL_FORE = '#ffffff';

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

function fontCss(css) {
  if (!css) return '';
  const [family, size, b, i, u, s] = css.split('|');
  const deco = [];
  if (u === '1') deco.push('underline');
  if (s === '1') deco.push('line-through');
  return `font-family:"${family}","Segoe UI",Tahoma,Arial,sans-serif;font-size:${size}pt;font-weight:${b === '1' ? 'bold' : 'normal'};font-style:${i === '1' ? 'italic' : 'normal'};${deco.length ? `text-decoration:${deco.join(' ')};` : ''}`;
}

/** Stil katmanlarını (tablo → sütun → satır → hücre) birleştirir. */
function merge(...styles) {
  const r = {};
  for (const s of styles) if (s) for (const k in s) if (s[k] !== '' && s[k] != null) r[k] = s[k];
  return r;
}

function alignCss(a) {
  const m = /^(Top|Middle|Bottom)(Left|Center|Right)$/.exec(a || '');
  if (!m) return '';
  return `text-align:${ALIGN[m[2]]};vertical-align:${VALIGN[m[1]]};`;
}

export function createGrid() {
  const el = document.createElement('div');
  el.className = 'wf-ctl wf-grid';
  el.tabIndex = 0;
  el.innerHTML = '<div class="wf-grid-scroll"><table class="wf-grid-table"><colgroup></colgroup><thead></thead><tbody></tbody></table></div>';
  const scroll = el.firstChild;
  const table = scroll.firstChild;
  return {
    el,
    scroll,
    table,
    colgroup: table.querySelector('colgroup'),
    thead: table.querySelector('thead'),
    tbody: table.querySelector('tbody'),
    grid: null,
    editor: null,
  };
}

export function renderGrid(item, json) {
  let g;
  try { g = JSON.parse(json); } catch { return; }
  item.grid = g;
  item.gridJson = json;
  const cols = g.cols;
  const vis = [];
  cols.forEach((c, i) => { if (!c.hid) vis.push(i); });
  const rh = g.rh || 0;
  const anyFill = vis.some((i) => cols[i].m === 'fill');
  const anyAuto = vis.some((i) => cols[i].m === 'auto');
  const ds = g.ds || {};

  item.scroll.style.background = g.bg || '#ababab';
  item.el.style.setProperty('--grid-line', g.gc || '#a0a0a0');
  item.el.classList.toggle('wf-grid-flat', !!g.flat);
  item.el.classList.toggle('wf-grid-full', !!g.full);
  item.table.style.tableLayout = anyAuto ? 'auto' : 'fixed';
  item.table.style.width = anyFill ? '100%' : '';

  // Sütun genişlikleri
  let colHtml = rh ? `<col style="width:${rh}px">` : '';
  let fixedTotal = rh;
  const fillWeight = vis.reduce((t, i) => t + (cols[i].m === 'fill' ? (cols[i].fw || 100) : 0), 0);
  for (const i of vis) {
    const c = cols[i];
    if (c.m === 'fill') colHtml += '<col data-fill="' + (c.fw || 100) + '">';
    else if (c.m === 'auto') colHtml += '<col>';
    else { colHtml += `<col style="width:${c.w}px">`; fixedTotal += c.w; }
  }
  item.colgroup.innerHTML = colHtml;
  if (anyFill) {
    // Doldurma (Fill) sütunları kalan genişliği ağırlıklarına göre paylaşır.
    const avail = Math.max(0, (parseInt(item.el.style.width, 10) || item.el.clientWidth || 240) - 2 - fixedTotal - (needsScroll(item, g) ? 17 : 0));
    item.colgroup.querySelectorAll('col[data-fill]').forEach((col) => {
      col.style.width = Math.max(20, Math.floor(avail * Number(col.dataset.fill) / (fillWeight || 1))) + 'px';
    });
    if (!anyAuto) item.table.style.width = '';
  } else if (!anyAuto) {
    item.table.style.width = fixedTotal + 'px';
  }

  // Başlık
  const hs = g.hs || {};
  if (g.ch) {
    const hstyle = (g.flat && hs.b ? `background:${hs.b};` : '') + (hs.f ? `color:${hs.f};` : '') + fontCss(hs.font || ds.font);
    let h = `<tr style="height:${g.ch}px">`;
    if (rh) h += `<th class="wf-gh wf-gcorner" data-r="-1" data-c="-1" style="${hstyle}"></th>`;
    for (const i of vis) {
      const c = cols[i];
      const glyph = c.sg === 1 ? '<span class="wf-gsort">▲</span>' : c.sg === 2 ? '<span class="wf-gsort">▼</span>' : '';
      h += `<th class="wf-gh" data-r="-1" data-c="${i}" style="${hstyle}${alignCss(hs.a)}"><span class="wf-gtext">${esc(c.h)}</span>${glyph}</th>`;
    }
    item.thead.innerHTML = h + '</tr>';
  } else item.thead.innerHTML = '';

  // Satırlar
  const [curR, curC] = g.cur || [-1, -1];
  const rs = g.rs || {};
  const rhStyle = (g.flat && rs.b ? `background:${rs.b};` : '') + (rs.f ? `color:${rs.f};` : '');
  const parts = [];
  g.rows.forEach((row, r) => {
    if (row.hid) return;
    parts.push(`<tr data-r="${r}"${row.ht ? ` style="height:${row.ht}px"` : ''}${row.n ? ' class="wf-gnew"' : ''}>`);
    if (rh) {
      const mark = r === curR ? (item.editor && item.editor.r === r ? '✎' : '►') : row.n ? '*' : '';
      const sel = row.sel ? ' wf-gsel' : '';
      parts.push(`<th class="wf-grh${sel}" data-r="${r}" data-c="-1" style="${rhStyle}">${row.hd ? esc(row.hd) : mark}</th>`);
    }
    const sc = row.sc || [];
    for (const i of vis) {
      const c = cols[i];
      const st = merge(ds, c.st, row.st, row.cs?.[i]);
      const selected = row.sel || sc.includes(i);
      const back = selected ? (st.sb || SEL_BACK) : (st.b || '');
      const fore = selected ? (st.sf || SEL_FORE) : (st.f || '');
      let css = (back ? `background:${back};` : '') + (fore ? `color:${fore};` : '') + fontCss(st.font) + alignCss(st.a);
      if (st.w === '1') css += 'white-space:normal;';
      const v = row.v[i] ?? '';
      let inner;
      switch (c.k) {
        case 'check':
          inner = row.n ? '' : `<input type="checkbox" class="wf-gcontent" tabindex="-1"${v === '1' ? ' checked' : ''}${v === '2' ? ' data-ind="1"' : ''}>`;
          css += 'text-align:center;';
          break;
        case 'button':
          inner = `<button type="button" class="wf-gbutton wf-gcontent" tabindex="-1">${esc(v)}</button>`;
          break;
        case 'link':
          inner = `<a class="wf-glink wf-gcontent">${esc(v)}</a>`;
          break;
        case 'image':
          inner = '';
          break;
        default:
          inner = v === '' ? '' : `<span class="wf-gcontent">${esc(v)}</span>`;
      }
      const cls = 'wf-gc' + (r === curR && i === curC ? ' wf-gcur' : '') + (c.k === 'combo' ? ' wf-gcombo' : '');
      parts.push(`<td class="${cls}" data-r="${r}" data-c="${i}" style="${css}">${inner}</td>`);
    }
    parts.push('</tr>');
  });
  item.tbody.innerHTML = parts.join('');
  item.tbody.querySelectorAll('input[data-ind]').forEach((x) => { x.indeterminate = true; });
  item.el.style.setProperty('--grid-font', '');
  if (ds.font) applyFont(item.table, ds.font);

  // Açık düzenleyici yeni çizime taşınır
  if (item.editor) attachEditor(item);
}

function needsScroll(item, g) {
  const h = parseInt(item.el.style.height, 10) || item.el.clientHeight || 150;
  let total = g.ch || 0;
  for (const r of g.rows) if (!r.hid) total += r.ht || 22;
  return total > h - 2;
}

/** Hücre düzenleyicisini (metin kutusu) ilgili hücreye yerleştirir. */
export function attachEditor(item) {
  const ed = item.editor;
  const td = item.tbody.querySelector(`td[data-r="${ed.r}"][data-c="${ed.c}"]`);
  if (!td) return;
  const hadFocus = document.activeElement === ed.input;
  td.textContent = '';
  td.classList.add('wf-gediting');
  td.appendChild(ed.input);
  if (hadFocus || ed.focusNext) {
    ed.focusNext = false;
    ed.input.focus();
    if (ed.typed) {
      const n = ed.input.value.length;
      ed.input.setSelectionRange(n, n);
    } else ed.input.select();
  }
}

/** Görünür satır/hücreyi kaydırarak gösterir. */
export function scrollToRow(item, r) {
  const tr = item.tbody.querySelector(`tr[data-r="${r}"]`);
  if (!tr) return;
  const head = item.thead.offsetHeight;
  const top = tr.offsetTop;
  const sc = item.scroll;
  if (top - head < sc.scrollTop) sc.scrollTop = top - head;
  else if (top + tr.offsetHeight > sc.scrollTop + sc.clientHeight) sc.scrollTop = top + tr.offsetHeight - sc.clientHeight;
}
