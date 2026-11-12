// Sanal Windows masaüstü: pencere yöneticisi, görev çubuğu, başlat menüsü, ileti kutuları,
// dosya gezgini ve not defteri.
import { h } from '../js/ui.js';
import { DOCS, DESKTOP, DOWNLOADS, USER_HOME } from './store.js';
import { ICONS } from './icons.js';

let zTop = 10;

export class Desktop {
  constructor(root, store) {
    this.store = store;
    this.root = root;
    this.windows = new Set();
    this.apps = new Map(); // id → { label, icon, open, desktop: bool, start: bool }
    this.el = h('div', { class: 'lab-desktop' });
    this.iconsEl = h('div', { class: 'lab-icons' });
    this.area = h('div', { class: 'lab-windows' });
    this.taskApps = h('div', { class: 'lab-task-apps' });
    this.clock = h('div', { class: 'lab-clock' });
    this.tray = h('div', { class: 'lab-tray' });
    this.startMenu = h('div', { class: 'lab-start hidden' });
    this.taskbar = h('div', { class: 'lab-taskbar' },
      h('button', { class: 'lab-start-btn', title: 'Başlat', html: ICONS.windows, onclick: (e) => { e.stopPropagation(); this.toggleStart(); } }),
      this.taskApps, h('div', { class: 'spacer' }), this.tray, this.clock);
    this.el.append(this.iconsEl, this.area, this.startMenu, this.taskbar);
    root.appendChild(this.el);
    this.el.addEventListener('mousedown', (e) => {
      if (!this.startMenu.contains(e.target) && !e.target.closest('.lab-start-btn')) this.startMenu.classList.add('hidden');
    });
    this.tick = setInterval(() => this.updateClock(), 10000);
    this.updateClock();
    store.on((ev) => { if (ev.type === 'files' || ev.type === 'state') this.renderIcons(); });
  }

  updateClock() {
    const d = new Date();
    this.clock.innerHTML = '';
    this.clock.append(h('div', {}, d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })), h('div', {}, d.toLocaleDateString('tr-TR')));
  }

  dispose() {
    clearInterval(this.tick);
  }

  /** Uygulama kaydı */
  register(id, app) {
    this.apps.set(id, app);
    this.renderIcons();
  }

  renderIcons() {
    this.iconsEl.innerHTML = '';
    const add = (label, icon, open, title) => {
      const el = h('div', { class: 'lab-icon', tabindex: '0', title: title || label }, h('div', { class: 'lab-icon-img', html: icon }), h('div', { class: 'lab-icon-label' }, label));
      el.addEventListener('dblclick', open);
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(); });
      el.addEventListener('click', () => { this.iconsEl.querySelectorAll('.lab-icon.sel').forEach((x) => x.classList.remove('sel')); el.classList.add('sel'); });
      this.iconsEl.appendChild(el);
    };
    for (const [, a] of this.apps) if (a.desktop && (!a.visible || a.visible())) add(a.label, a.icon, () => a.open(), a.title);
    // Masaüstündeki dosyalar (kısayollar .lnk uzantısız ve kendi simgesiyle görünür)
    for (const f of this.store.list(DESKTOP).files) {
      if (/\.lnk$/i.test(f.name)) {
        let info = {};
        try { info = JSON.parse(String(f.content).slice(4)); } catch { /* yok */ }
        add(f.name.replace(/\.lnk$/i, ''), info.icon ? `<img src="${info.icon}" alt="">` : ICONS.app, () => this.openFile(f.path));
      } else add(f.name, fileIcon(f.name), () => this.openFile(f.path));
    }
  }

  toggleStart() {
    const m = this.startMenu;
    if (!m.classList.contains('hidden')) { m.classList.add('hidden'); return; }
    m.innerHTML = '';
    const list = h('div', { class: 'lab-start-list' });
    const items = [...this.apps.entries()].filter(([, a]) => a.start && (!a.visible || a.visible())).sort((a, b) => a[1].label.localeCompare(b[1].label, 'tr'));
    for (const [, a] of items) {
      list.appendChild(h('button', { class: 'lab-start-item', onclick: () => { m.classList.add('hidden'); a.open(); } }, h('span', { class: 'lab-start-ico', html: a.icon }), h('span', {}, a.label)));
    }
    // Setup ile kurulan programlar
    for (const p of this.store.state.programs || []) {
      list.appendChild(h('button', { class: 'lab-start-item', onclick: () => { m.classList.add('hidden'); this.openFile(p.target); } }, h('span', { class: 'lab-start-ico', html: p.icon ? `<img src="${p.icon}" alt="">` : ICONS.app }), h('span', {}, p.name)));
    }
    m.append(h('div', { class: 'lab-start-head' }, 'Tüm uygulamalar'), list,
      h('div', { class: 'lab-start-foot' }, h('span', { class: 'lab-start-user' }, '\u{1F464} ' + (this.store.user?.name || 'Öğrenci'))));
    m.classList.remove('hidden');
  }

  /** Dosyayı türüne göre açar */
  openFile(path) {
    if (/\.lnk$/i.test(path)) {
      try {
        const info = JSON.parse(String(this.store.readFile(path)).slice(4));
        if (!this.store.exists(info.target)) { this.message({ title: 'Problem with Shortcut', text: `The item '${info.target.split('/').pop()}' that this shortcut refers to has been changed or moved, so this shortcut will no longer work properly.`, icon: 'warning' }); return; }
        path = info.target;
      } catch { return; }
    }
    const name = path.split('/').pop();
    const ext = name.split('.').pop().toLowerCase();
    const handler = [...this.apps.values()].find((a) => a.opens && a.opens.includes(ext));
    if (handler && handler.openFile) handler.openFile(path);
    else openNotepad(this, path);
  }

  // ------------------------------------------------------------ pencereler

  /**
   * opts: { title, icon, width, height, x, y, resizable, maximized, modal, owner (Win), onClose(): bool|Promise, minimizable, className }
   */
  open(opts) {
    const w = new Win(this, opts);
    this.windows.add(w);
    this.renderTasks();
    return w;
  }

  renderTasks() {
    this.taskApps.innerHTML = '';
    for (const w of this.windows) {
      if (w.opts.modal || w.opts.owner) continue;
      const b = h('button', { class: 'lab-task' + (w.active ? ' active' : '') + (w.minimized ? ' min' : ''), title: w.title },
        h('span', { class: 'lab-task-ico', html: w.opts.icon || ICONS.app }), h('span', { class: 'lab-task-title' }, w.title));
      b.onclick = () => {
        if (w.minimized) w.restore();
        else if (w.active) w.minimize();
        else w.focus();
      };
      this.taskApps.appendChild(b);
    }
  }

  focusTop() {
    let best = null;
    for (const w of this.windows) if (!w.minimized && (!best || Number(w.el.style.zIndex) > Number(best.el.style.zIndex))) best = w;
    if (best) best.focus();
    else this.renderTasks();
  }

  /** Windows ileti kutusu. buttons: ['OK'] ya da [{text, value, primary}] */
  message({ title = '', text = '', detail = '', icon = 'info', buttons = ['OK'], owner = null, width = 420, extra = null }) {
    return new Promise((resolve) => {
      const btns = buttons.map((b) => (typeof b === 'string' ? { text: b, value: b } : b));
      const w = this.open({ title, width, modal: true, owner, resizable: false, minimizable: false, className: 'lab-msgbox', onClose: () => { resolve(null); return true; } });
      const body = h('div', { class: 'lab-msg' },
        h('div', { class: 'lab-msg-main' }, icon ? h('div', { class: 'lab-msg-icon', html: ICONS['msg_' + icon] || '' }) : null,
          h('div', { class: 'lab-msg-text' }, ...(Array.isArray(text) ? text : [text]).map((t) => (typeof t === 'string' ? h('div', {}, t) : t)), detail ? h('div', { class: 'lab-msg-detail' }, detail) : null, extra)),
        h('div', { class: 'lab-msg-btns' }, ...btns.map((b, i) => {
          const el = h('button', { class: 'lab-btn' + (b.primary || (i === 0 && btns.length === 1) ? ' primary' : '') }, b.text);
          el.onclick = () => { resolve(b.value); w.close(true); };
          return el;
        })));
      w.body.appendChild(body);
      setTimeout(() => (body.querySelector('.lab-btn.primary') || body.querySelector('.lab-btn'))?.focus(), 0);
      w.center();
    });
  }

  /** Dosya kaydet / aç penceresi. mode: 'save' | 'open' ; filter: ['sql'] */
  fileDialog({ mode = 'open', title, dir = DOCS, name = '', filter = null, filterLabel = 'All Files (*.*)', owner = null } = {}) {
    return new Promise((resolve) => {
      let cur = dir;
      const w = this.open({ title: title || (mode === 'save' ? 'Save As' : 'Open'), width: 640, height: 420, modal: true, owner, minimizable: false, onClose: () => { resolve(null); return true; } });
      const pathEl = h('div', { class: 'lab-fd-path' });
      const list = h('div', { class: 'lab-fd-list' });
      const nameIn = h('input', { class: 'lab-input', value: name, spellcheck: 'false' });
      const places = h('div', { class: 'lab-fd-places' },
        ...[['Masaüstü', DESKTOP], ['Belgeler', DOCS], ['İndirilenler', DOWNLOADS]].map(([l, p]) => h('button', { class: 'lab-fd-place', onclick: () => { cur = p; render(); } }, h('span', { html: ICONS.folder }), l)));
      const ok = h('button', { class: 'lab-btn primary' }, mode === 'save' ? 'Save' : 'Open');
      const cancel = h('button', { class: 'lab-btn' }, 'Cancel');
      const render = () => {
        pathEl.textContent = cur.replace(/\//g, '\\');
        list.innerHTML = '';
        if (cur !== USER_HOME && cur.startsWith(USER_HOME)) {
          list.appendChild(row('..', ICONS.folder, () => { cur = cur.slice(0, cur.lastIndexOf('/')); render(); }));
        }
        const l = this.store.list(cur);
        const extra = new Set(cur === DOCS ? ['dumps'] : []);
        for (const d of new Set([...l.dirs, ...extra])) list.appendChild(row(d, ICONS.folder, () => { cur = cur + '/' + d; render(); }));
        for (const f of l.files) {
          if (filter && !filter.includes(f.name.split('.').pop().toLowerCase())) continue;
          const r = row(f.name, fileIcon(f.name), () => { nameIn.value = f.name; done(); }, new Date(f.mtime).toLocaleString('tr-TR'));
          r.addEventListener('click', () => { nameIn.value = f.name; });
          list.appendChild(r);
        }
      };
      const row = (label, icon, open, info = '') => {
        const r = h('div', { class: 'lab-fd-row' }, h('span', { class: 'lab-fd-ico', html: icon }), h('span', { class: 'lab-fd-name' }, label), h('span', { class: 'lab-fd-info' }, info));
        r.addEventListener('dblclick', open);
        r.addEventListener('click', () => { list.querySelectorAll('.sel').forEach((x) => x.classList.remove('sel')); r.classList.add('sel'); });
        return r;
      };
      const done = async () => {
        let n = nameIn.value.trim();
        if (!n) return;
        if (/[<>:"|?*]/.test(n)) { await this.message({ title: 'Hata', text: 'Dosya adı geçersiz.', icon: 'error', owner: w }); return; }
        if (filter && mode === 'save' && !/\.[a-z0-9]+$/i.test(n)) n += '.' + filter[0];
        const path = cur + '/' + n;
        if (mode === 'open' && !this.store.exists(path)) { await this.message({ title: w.title, text: `${n}\nDosya bulunamadı.`, icon: 'warning', owner: w }); return; }
        if (mode === 'save' && this.store.exists(path)) {
          const r = await this.message({ title: 'Confirm Save As', text: `${n} already exists.\nDo you want to replace it?`, icon: 'warning', buttons: [{ text: 'Yes', value: 'yes', primary: true }, { text: 'No', value: 'no' }], owner: w });
          if (r !== 'yes') return;
        }
        resolve(path);
        w.close(true);
      };
      ok.onclick = done;
      cancel.onclick = () => w.close();
      nameIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') done(); });
      w.body.appendChild(h('div', { class: 'lab-fd' }, pathEl, h('div', { class: 'lab-fd-main' }, places, list),
        h('div', { class: 'lab-fd-foot' }, h('label', {}, 'File name:'), nameIn, h('span', { class: 'lab-fd-filter' }, filterLabel), ok, cancel)));
      render();
      w.center();
      setTimeout(() => nameIn.focus(), 0);
    });
  }
}

export class Win {
  constructor(desk, opts) {
    this.desk = desk;
    this.opts = opts;
    this.title = opts.title || '';
    this.minimized = false;
    this.maximized = false;
    const titleText = h('span', { class: 'lab-win-title' }, this.title);
    this.titleEl = titleText;
    const btns = h('div', { class: 'lab-win-btns' });
    if (opts.minimizable !== false && !opts.modal) btns.appendChild(h('button', { class: 'lab-win-btn', title: 'Simge durumuna küçült', onclick: () => this.minimize(), html: '&#x2014;' }));
    if (opts.resizable !== false && !opts.modal) btns.appendChild(h('button', { class: 'lab-win-btn', title: 'Ekranı kapla', onclick: () => this.toggleMax(), html: '&#x2610;' }));
    btns.appendChild(h('button', { class: 'lab-win-btn close', title: 'Kapat', onclick: () => this.close(), html: '&#x2715;' }));
    this.head = h('div', { class: 'lab-win-head' }, opts.icon ? h('span', { class: 'lab-win-ico', html: opts.icon }) : null, titleText, btns);
    this.body = h('div', { class: 'lab-win-body' });
    this.el = h('div', { class: 'lab-win' + (opts.className ? ' ' + opts.className : '') + (opts.modal ? ' modal' : '') }, this.head, this.body);
    if (opts.resizable !== false && !opts.modal) {
      for (const d of ['n', 'e', 's', 'w', 'ne', 'nw', 'se', 'sw']) this.el.appendChild(h('div', { class: 'lab-rz lab-rz-' + d, 'data-d': d }));
    }
    const area = desk.area.getBoundingClientRect();
    const W = Math.min(opts.width || 800, Math.max(320, area.width - 20));
    const H = opts.height ? Math.min(opts.height, Math.max(200, area.height - 20)) : null;
    Object.assign(this.el.style, { width: W + 'px', height: H ? H + 'px' : '' });
    const n = desk.windows.size;
    const x = opts.x ?? Math.max(0, Math.min(area.width - W, 60 + n * 26));
    const y = opts.y ?? Math.max(0, Math.min(area.height - (H || 300), 30 + n * 26));
    this.el.style.left = x + 'px';
    this.el.style.top = y + 'px';
    if (opts.modal) {
      this.shade = h('div', { class: 'lab-shade' });
      desk.area.appendChild(this.shade);
      this.shade.style.zIndex = ++zTop;
    }
    desk.area.appendChild(this.el);
    this.el.addEventListener('mousedown', () => this.focus(), true);
    this.dragging();
    this.head.addEventListener('dblclick', (e) => { if (!e.target.closest('.lab-win-btn') && opts.resizable !== false && !opts.modal) this.toggleMax(); });
    this.focus();
    if (opts.maximized) this.toggleMax();
  }

  setTitle(t) {
    this.title = t;
    this.titleEl.textContent = t;
    this.desk.renderTasks();
  }

  center() {
    const area = this.desk.area.getBoundingClientRect();
    const r = this.el.getBoundingClientRect();
    const owner = this.opts.owner?.el?.getBoundingClientRect();
    let x = (area.width - r.width) / 2;
    let y = (area.height - r.height) / 2.4;
    if (owner && owner.width) { x = owner.left - area.left + (owner.width - r.width) / 2; y = owner.top - area.top + (owner.height - r.height) / 2.4; }
    this.el.style.left = Math.max(0, Math.min(area.width - r.width, x)) + 'px';
    this.el.style.top = Math.max(0, Math.min(area.height - r.height, y)) + 'px';
  }

  focus() {
    if (this.active && Number(this.el.style.zIndex) === zTop) return;
    for (const w of this.desk.windows) { w.active = false; w.el.classList.remove('active'); }
    this.active = true;
    this.el.classList.add('active');
    // sahibinin önünde kalsın; modal pencere varsa ona odaklan
    this.el.style.zIndex = ++zTop;
    for (const w of this.desk.windows) {
      if (w !== this && w.opts.owner === this && !w.closed) { w.shade && (w.shade.style.zIndex = ++zTop); w.el.style.zIndex = ++zTop; }
    }
    this.desk.renderTasks();
    this.opts.onFocus?.();
  }

  minimize() {
    this.minimized = true;
    this.el.classList.add('hidden');
    this.active = false;
    this.desk.focusTop();
  }

  restore() {
    this.minimized = false;
    this.el.classList.remove('hidden');
    this.focus();
  }

  toggleMax() {
    this.maximized = !this.maximized;
    if (this.maximized) {
      this.prev = { left: this.el.style.left, top: this.el.style.top, width: this.el.style.width, height: this.el.style.height };
      this.el.classList.add('max');
    } else {
      this.el.classList.remove('max');
      Object.assign(this.el.style, this.prev || {});
    }
    this.opts.onResize?.();
  }

  async close(force = false) {
    if (this.closed) return;
    if (!force && this.opts.onClose) {
      const r = await this.opts.onClose();
      if (r === false) return;
    }
    // bu pencerenin sahip olduğu pencereler de kapanır
    for (const w of [...this.desk.windows]) if (w.opts.owner === this) await w.close(true);
    this.closed = true;
    this.el.remove();
    this.shade?.remove();
    this.desk.windows.delete(this);
    this.opts.onClosed?.();
    this.desk.focusTop();
  }

  dragging() {
    let mode = null;
    let sx; let sy; let r;
    const area = () => this.desk.area.getBoundingClientRect();
    const move = (e) => {
      if (!mode) return;
      const dx = e.clientX - sx;
      const dy = e.clientY - sy;
      const a = area();
      if (mode === 'move') {
        this.el.style.left = Math.max(-r.width + 80, Math.min(a.width - 80, r.left - a.left + dx)) + 'px';
        this.el.style.top = Math.max(0, Math.min(a.height - 30, r.top - a.top + dy)) + 'px';
        return;
      }
      const minW = this.opts.minWidth || 260;
      const minH = this.opts.minHeight || 150;
      let { left, top, width, height } = { left: r.left - a.left, top: r.top - a.top, width: r.width, height: r.height };
      if (mode.includes('e')) width = Math.max(minW, r.width + dx);
      if (mode.includes('s')) height = Math.max(minH, r.height + dy);
      if (mode.includes('w')) { width = Math.max(minW, r.width - dx); left = r.left - a.left + r.width - width; }
      if (mode.includes('n')) { height = Math.max(minH, r.height - dy); top = Math.max(0, r.top - a.top + r.height - height); }
      Object.assign(this.el.style, { left: left + 'px', top: top + 'px', width: width + 'px', height: height + 'px' });
      this.opts.onResize?.();
    };
    const up = () => {
      if (!mode) return;
      mode = null;
      document.body.classList.remove('lab-dragging');
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      this.opts.onResize?.();
    };
    this.el.addEventListener('mousedown', (e) => {
      if (e.button !== 0 || this.maximized) return;
      const rz = e.target.closest('.lab-rz');
      if (rz) mode = rz.dataset.d;
      else if (e.target.closest('.lab-win-head') && !e.target.closest('.lab-win-btn')) mode = 'move';
      else return;
      e.preventDefault();
      sx = e.clientX;
      sy = e.clientY;
      r = this.el.getBoundingClientRect();
      document.body.classList.add('lab-dragging');
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    });
  }
}

export function fileIcon(name) {
  const ext = name.split('.').pop().toLowerCase();
  if (ext === 'sql') return ICONS.sqlfile;
  if (ext === 'msi' || name.toLowerCase() === 'setup.exe') return ICONS.installer;
  if (ext === 'exe') return ICONS.app;
  if (ext === 'lnk') return ICONS.app;
  if (/^(ico|png|jpe?g|gif|bmp)$/.test(ext)) return ICONS.file;
  if (ext === 'txt' || ext === 'cnf' || ext === 'ini' || ext === 'log') return ICONS.textfile;
  return ICONS.file;
}

/** Bayt boyutunu okunur yazar */
export function fmtSize(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return Math.ceil(n / 1024) + ' KB';
  return (n / 1024 / 1024).toFixed(1) + ' MB';
}

// ------------------------------------------------------------ Not Defteri

export function openNotepad(desk, path) {
  const store = desk.store;
  const text = store.readFile(path) ?? '';
  const name = path ? path.split('/').pop() : 'Adsız';
  const ta = h('textarea', { class: 'lab-notepad', spellcheck: 'false', wrap: 'off' });
  ta.value = text;
  let dirty = false;
  let cur = path;
  const w = desk.open({ title: `${name} - Not Defteri`, icon: ICONS.notepad, width: 640, height: 440, onClose: async () => {
    if (!dirty) return true;
    const r = await desk.message({ title: 'Not Defteri', text: `${cur ? cur.split('/').pop() : 'Adsız'} dosyasındaki değişiklikleri kaydetmek istiyor musunuz?`, icon: '', buttons: [{ text: 'Kaydet', value: 'save', primary: true }, { text: 'Kaydetme', value: 'no' }, { text: 'İptal', value: null }], owner: w });
    if (r === 'save') return save();
    return r === 'no';
  } });
  ta.addEventListener('input', () => { if (!dirty) { dirty = true; w.setTitle('*' + w.title); } });
  const save = async () => {
    if (!cur) {
      cur = await desk.fileDialog({ mode: 'save', dir: DOCS, name: 'Adsız.txt', owner: w });
      if (!cur) return false;
    }
    store.writeFile(cur, ta.value);
    dirty = false;
    w.setTitle(`${cur.split('/').pop()} - Not Defteri`);
    return true;
  };
  const menu = h('div', { class: 'lab-menubar' },
    menuButton('Dosya', [['Kaydet\tCtrl+S', save], ['Farklı Kaydet...', async () => { const p = await desk.fileDialog({ mode: 'save', dir: DOCS, name: cur ? cur.split('/').pop() : 'Adsız.txt', owner: w }); if (p) { cur = p; await save(); } }], null, ['Çıkış', () => w.close()]]),
    menuButton('Düzen', [['Tümünü Seç\tCtrl+A', () => { ta.focus(); ta.select(); }]]));
  ta.addEventListener('keydown', (e) => { if (e.ctrlKey && e.key.toLowerCase() === 's') { e.preventDefault(); save(); } });
  w.body.append(h('div', { class: 'lab-col' }, menu, ta));
  setTimeout(() => ta.focus(), 0);
  return w;
}

// ------------------------------------------------------------ menüler

let openMenu = null;

/** Açılır menü: items = [[etiket, işlev, {disabled, checked}], null (ayraç), [etiket, altMenüDizisi]] */
export function showMenu(x, y, items, onClose) {
  closeMenus();
  const m = h('div', { class: 'lab-menu' });
  for (const it of items) {
    if (!it) { m.appendChild(h('div', { class: 'lab-menu-sep' })); continue; }
    const [label, act, o = {}] = it;
    const [text, key] = String(label).split('\t');
    const el = h('div', { class: 'lab-menu-item' + (o.disabled ? ' disabled' : '') + (Array.isArray(act) ? ' sub' : '') },
      h('span', { class: 'lab-menu-check' }, o.checked ? '✓' : ''), h('span', { class: 'lab-menu-text' }, text), h('span', { class: 'lab-menu-key' }, key || (Array.isArray(act) ? '›' : '')));
    if (!o.disabled) {
      if (Array.isArray(act)) {
        el.addEventListener('mouseenter', () => {
          m.querySelectorAll('.lab-menu.subm').forEach((x) => x.remove());
          const r = el.getBoundingClientRect();
          const sub = showSub(r.right - 2, r.top - 4, act);
          m.appendChild(sub);
        });
      } else {
        el.addEventListener('mouseenter', () => m.querySelectorAll('.lab-menu.subm').forEach((x) => x.remove()));
        el.addEventListener('click', (e) => { e.stopPropagation(); closeMenus(); act && act(); });
      }
    }
    m.appendChild(el);
  }
  document.body.appendChild(m);
  placeMenu(m, x, y);
  const off = (e) => { if (!m.contains(e.target)) closeMenus(); };
  setTimeout(() => document.addEventListener('mousedown', off, true), 0);
  openMenu = { el: m, off, onClose };
  return m;
}

function showSub(x, y, items) {
  const m = h('div', { class: 'lab-menu subm' });
  for (const it of items) {
    if (!it) { m.appendChild(h('div', { class: 'lab-menu-sep' })); continue; }
    const [label, act, o = {}] = it;
    const el = h('div', { class: 'lab-menu-item' + (o.disabled ? ' disabled' : '') }, h('span', { class: 'lab-menu-check' }, o.checked ? '✓' : ''), h('span', { class: 'lab-menu-text' }, label), h('span', { class: 'lab-menu-key' }));
    if (!o.disabled) el.addEventListener('click', (e) => { e.stopPropagation(); closeMenus(); act && act(); });
    m.appendChild(el);
  }
  m.style.position = 'fixed';
  setTimeout(() => placeMenu(m, x, y), 0);
  m.style.left = x + 'px';
  m.style.top = y + 'px';
  return m;
}

function placeMenu(m, x, y) {
  const r = m.getBoundingClientRect();
  const W = window.innerWidth;
  const H = window.innerHeight;
  m.style.left = Math.max(0, Math.min(x, W - r.width - 4)) + 'px';
  m.style.top = Math.max(0, Math.min(y, H - r.height - 4)) + 'px';
}

export function closeMenus() {
  if (!openMenu) return;
  document.removeEventListener('mousedown', openMenu.off, true);
  openMenu.el.remove();
  const cb = openMenu.onClose;
  openMenu = null;
  cb?.();
}

/** Menü çubuğu düğmesi */
export function menuButton(label, items) {
  const b = h('button', { class: 'lab-menubar-item' }, label);
  b.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const list = typeof items === 'function' ? items() : items;
    const r = b.getBoundingClientRect();
    b.classList.add('open');
    showMenu(r.left, r.bottom, list, () => b.classList.remove('open'));
  });
  return b;
}

// ------------------------------------------------------------ Dosya Gezgini

export function openExplorer(desk, dir = DOCS) {
  const store = desk.store;
  let cur = dir;
  const list = h('div', { class: 'lab-ex-list' });
  const addr = h('div', { class: 'lab-ex-addr' });
  const status = h('div', { class: 'lab-ex-status' });
  const w = desk.open({ title: 'Dosya Gezgini', icon: ICONS.folder, width: 760, height: 460 });
  const upload = h('input', { type: 'file', class: 'hidden', multiple: true });
  upload.onchange = async () => {
    for (const f of upload.files) {
      if (f.size > 2 * 1024 * 1024) { await desk.message({ title: 'Dosya Gezgini', text: `${f.name} çok büyük (en fazla 2 MB).`, icon: 'error', owner: w }); continue; }
      store.writeFile(cur + '/' + f.name, await f.text());
    }
    upload.value = '';
    render();
  };
  const render = () => {
    w.setTitle(cur.split('/').pop() || 'Dosya Gezgini');
    addr.textContent = 'Bu bilgisayar > ' + cur.replace(USER_HOME, 'Öğrenci').split('/').join(' > ');
    list.innerHTML = '';
    list.appendChild(h('div', { class: 'lab-ex-row head' }, h('span', {}), h('span', {}, 'Ad'), h('span', {}, 'Değiştirme tarihi'), h('span', {}, 'Boyut')));
    const l = store.list(cur);
    const extra = new Set(cur === DOCS ? ['dumps'] : []);
    for (const d of new Set([...l.dirs, ...extra])) {
      const r = h('div', { class: 'lab-ex-row' }, h('span', { html: ICONS.folder }), h('span', {}, d), h('span', {}), h('span', {}));
      r.addEventListener('dblclick', () => { cur += '/' + d; render(); });
      list.appendChild(r);
    }
    for (const f of l.files) {
      const r = h('div', { class: 'lab-ex-row', tabindex: '0' }, h('span', { html: fileIcon(f.name) }), h('span', {}, f.name), h('span', {}, new Date(f.mtime).toLocaleString('tr-TR')), h('span', {}, fmtSize(new Blob([f.content || '']).size)));
      r.addEventListener('dblclick', () => desk.openFile(f.path));
      r.addEventListener('click', () => { list.querySelectorAll('.sel').forEach((x) => x.classList.remove('sel')); r.classList.add('sel'); });
      r.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        r.click();
        showMenu(e.clientX, e.clientY, [
          ['Aç', () => desk.openFile(f.path)],
          ['Not Defteri ile aç', () => openNotepad(desk, f.path)],
          null,
          ['Bilgisayarıma indir', () => downloadText(f.name, f.content)],
          null,
          ['Sil', async () => {
            const ok = await desk.message({ title: 'Dosyayı Sil', text: `"${f.name}" kalıcı olarak silinsin mi?`, icon: 'warning', buttons: [{ text: 'Evet', value: 'y', primary: true }, { text: 'Hayır', value: 'n' }], owner: w });
            if (ok === 'y') { store.deleteFile(f.path); render(); }
          }],
        ]);
      });
      list.appendChild(r);
    }
    status.textContent = `${l.files.length + l.dirs.length} öğe`;
  };
  const places = h('div', { class: 'lab-ex-nav' },
    ...[['Masaüstü', DESKTOP], ['Belgeler', DOCS], ['İndirilenler', DOWNLOADS]].map(([label, p]) => h('button', { class: 'lab-ex-place', onclick: () => { cur = p; render(); } }, h('span', { html: ICONS.folder }), label)));
  const toolbar = h('div', { class: 'lab-ex-tools' },
    h('button', { class: 'lab-btn', onclick: () => { if (cur !== USER_HOME && cur.startsWith(USER_HOME)) { cur = cur.slice(0, cur.lastIndexOf('/')); render(); } } }, '↑ Üst klasör'),
    h('button', { class: 'lab-btn', onclick: () => upload.click(), title: 'Gerçek bilgisayarınızdan bu klasöre dosya ekler' }, '⬆ Bilgisayardan yükle'),
    addr, upload);
  w.body.appendChild(h('div', { class: 'lab-col' }, toolbar, h('div', { class: 'lab-ex-main' }, places, list), status));
  const off = store.on((ev) => { if (ev.type === 'files' && !w.closed) render(); });
  w.opts.onClosed = off;
  render();
  return w;
}

export function downloadText(name, text) {
  const blob = new Blob([text ?? ''], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
