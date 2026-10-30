// Çalışan öğrenci programının "masaüstü"sü: pencereler, olaylar, zamanlayıcılar, iletişim kutuları.
import { createItem, setProp, clientOf, measureText, orderChildren, ICONS, BUTTON_TEXT, BUTTON_SETS } from './winui.js';
import { renderGrid, attachEditor, scrollToRow } from './grid.js';

const KEY_EVENTS = new Set(['keydown', 'keyup', 'keypress']);

export class Desktop {
  /**
   * @param {HTMLElement} root  Masaüstü öğesi
   * @param {object} hooks      { onOutput(text), onError(info), onEnded(reason) }
   */
  constructor(root, hooks = {}) {
    this.root = root;
    this.hooks = hooks;
    this.engine = null;
    root.classList.add('wf-desktop');
    root.innerHTML = '<div class="wf-windows"></div><div class="wf-modal-shade"></div><div class="wf-taskbar"></div>';
    this.windows = root.querySelector('.wf-windows');
    this.shade = root.querySelector('.wf-modal-shade');
    this.taskbar = root.querySelector('.wf-taskbar');
    this.items = new Map();
    this.timers = new Map();
    this.applying = false;
    this.running = false;
    this.z = 10;
    this.cascade = 0;
    this.flushPending = false;
    this.dialogs = [];
    this.bindDelegated();
  }

  attach(engine) {
    this.engine = engine;
  }

  // ------------------------------------------------------------------ yaşam döngüsü

  start() {
    this.clear();
    this.running = true;
  }

  stop() {
    this.running = false;
    for (const t of this.timers.values()) clearInterval(t);
    this.timers.clear();
  }

  clear() {
    this.stop();
    this.items.clear();
    this.windows.innerHTML = '';
    this.taskbar.innerHTML = '';
    for (const d of this.dialogs) d.remove();
    this.dialogs = [];
    this.cascade = 0;
    this.updateModal();
  }

  dispatch(id, evt, data = '') {
    if (this.applying || !this.running || !this.engine) return '';
    try {
      return this.engine.Dispatch(id, evt, String(data)) ?? '';
    } catch (e) {
      console.error(e);
      this.hooks.onError?.({ type: 'Motor hatası', message: String(e?.message || e), line: 0, file: 0 });
      return '';
    }
  }

  // ------------------------------------------------------------------ motorun çağırdığı fonksiyonlar

  applyOps(json) {
    const ops = JSON.parse(json);
    this.applying = true;
    try {
      for (const op of ops) {
        try {
          this.applyOp(op);
        } catch (e) {
          console.error('İşlem uygulanamadı', op, e);
        }
      }
    } finally {
      this.applying = false;
    }
    this.updateModal();
    this.renderTaskbar();
  }

  scheduleFlush() {
    if (this.flushPending) return;
    this.flushPending = true;
    setTimeout(() => {
      this.flushPending = false;
      if (this.engine && this.running) {
        try { this.engine.Flush(); } catch (e) { console.error(e); }
      }
    }, 0);
  }

  measure(text, font) {
    const m = measureText(text, font);
    return `${m.w},${m.h}`;
  }

  /** Beklemesi gereken yerlerde (ör. FormClosing) tarayıcının kendi pencereleri kullanılır. */
  messageBox(text, caption, buttons, icon) {
    const head = (ICONS[icon] ? ICONS[icon] + ' ' : '') + (caption ? caption + '\n\n' : '');
    switch (buttons) {
      case 'OK':
        window.alert(head + text);
        return 'OK';
      case 'YesNo':
      case 'YesNoCancel':
        return window.confirm(head + text + '\n\n[Tamam = Evet,  İptal = Hayır]') ? 'Yes' : 'No';
      case 'RetryCancel':
        return window.confirm(head + text + '\n\n[Tamam = Yeniden Dene]') ? 'Retry' : 'Cancel';
      case 'AbortRetryIgnore':
        return window.confirm(head + text + '\n\n[Tamam = Yeniden Dene,  İptal = Durdur]') ? 'Retry' : 'Abort';
      default:
        return window.confirm(head + text) ? 'OK' : 'Cancel';
    }
  }

  inputBox(prompt, title, def) {
    const r = window.prompt((title ? title + '\n\n' : '') + prompt, def);
    return r;
  }

  query(id, what) {
    const item = this.items.get(id);
    const input = item?.input;
    if (!input) return '0';
    if (what === 'selstart') return String(input.selectionStart ?? 0);
    if (what === 'sellength') return String((input.selectionEnd ?? 0) - (input.selectionStart ?? 0));
    return '';
  }

  output(text) {
    this.hooks.onOutput?.(text);
  }

  error(json) {
    let info;
    try { info = JSON.parse(json); } catch { info = { message: json }; }
    this.hooks.onError?.(info);
  }

  programEnded(reason) {
    this.stop();
    this.windows.innerHTML = '';
    this.taskbar.innerHTML = '';
    for (const d of this.dialogs) d.remove();
    this.dialogs = [];
    this.items.clear();
    this.updateModal();
    this.hooks.onEnded?.(reason);
  }

  /** Beklenebilir iletişim kutusu (MessageBox / InputBox). */
  showDialog(requestId, kind, json) {
    const data = JSON.parse(json);
    if (kind === 'openfile' || kind === 'savefile') return this.showFileDialog(requestId, kind, data);
    const box = document.createElement('div');
    box.className = 'wf-window wf-dialog';
    const title = kind === 'inputbox' ? data.title : data.caption;
    box.innerHTML = `
      <div class="wf-titlebar"><span class="wf-title"></span>
        <span class="wf-caption-buttons"><button class="wf-cap wf-close" tabindex="-1">&#10005;</button></span></div>
      <div class="wf-dialog-body"><div class="wf-dialog-icon"></div><div class="wf-dialog-text"></div></div>
      <div class="wf-dialog-buttons"></div>`;
    box.querySelector('.wf-title').textContent = title || ' ';
    box.querySelector('.wf-dialog-text').textContent = kind === 'inputbox' ? data.prompt : data.text;
    const iconEl = box.querySelector('.wf-dialog-icon');
    if (kind === 'messagebox' && ICONS[data.icon]) iconEl.textContent = ICONS[data.icon];
    else iconEl.remove();

    let input = null;
    let names;
    if (kind === 'inputbox') {
      input = document.createElement('input');
      input.className = 'wf-dialog-input';
      input.value = data.value || '';
      box.querySelector('.wf-dialog-body').appendChild(input);
      names = ['OK', 'Cancel'];
    } else {
      names = BUTTON_SETS[data.buttons] || ['OK'];
    }

    const finish = (result) => {
      box.remove();
      this.dialogs = this.dialogs.filter((d) => d !== box);
      this.updateModal();
      if (!this.running || !this.engine) return;
      let value = result;
      if (kind === 'inputbox') value = result === 'OK' ? input.value : '';
      try { this.engine.CompleteDialog(requestId, value); } catch (e) { console.error(e); }
    };

    const buttons = box.querySelector('.wf-dialog-buttons');
    const def = Math.min(Number(data.default) || 0, names.length - 1);
    names.forEach((n, i) => {
      const b = document.createElement('button');
      b.className = 'wf-button wf-dialog-button';
      b.textContent = BUTTON_TEXT[n] || n;
      b.onclick = () => finish(n);
      buttons.appendChild(b);
      if (i === def && !input) setTimeout(() => b.focus(), 0);
    });
    const cancelName = names.includes('Cancel') ? 'Cancel' : names.includes('No') ? 'No' : names.length === 1 ? names[0] : null;
    box.querySelector('.wf-close').onclick = () => { if (cancelName) finish(cancelName); };
    box.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && cancelName) { e.preventDefault(); finish(cancelName); }
      if (e.key === 'Enter' && input) { e.preventDefault(); finish('OK'); }
      e.stopPropagation();
    });
    this.makeDraggable(box, null);
    this.root.appendChild(box);
    this.dialogs.push(box);
    box.style.zIndex = 100000 + this.dialogs.length;
    const r = this.root.getBoundingClientRect();
    box.style.left = Math.max(0, (r.width - box.offsetWidth) / 2) + 'px';
    box.style.top = Math.max(0, (r.height - box.offsetHeight) / 2.5) + 'px';
    if (input) setTimeout(() => { input.focus(); input.select(); }, 0);
    this.updateModal();
  }

  // ------------------------------------------------------------------ işlemler

  applyOp(op) {
    switch (op[0]) {
      case 'c': {
        const [, id, type] = op;
        const item = createItem(type, id);
        this.items.set(id, item);
        if (type === 'Form') this.setupWindow(item);
        if (type === 'ContextMenuStrip') { item.el.classList.add('wf-hidden'); this.root.appendChild(item.el); }
        return;
      }
      case 's': {
        const [, id, prop, value] = op;
        if (prop === 'timer') return this.setTimer(id, Number(value));
        const item = this.items.get(id);
        if (!item) return;
        if (item.type === 'Form') return this.setFormProp(item, prop, value);
        if (prop === 'listen') return this.setListen(item, value);
        if (prop === 'itemorder') return orderChildren(clientOf(item), value ? value.split(',') : [], (i) => this.items.get(i));
        if (prop === 'ctxmenu') { item.ctxmenu = Number(value); return; }
        if (item.type === 'ContextMenuStrip' && prop === 'visible') return;
        setProp(item, prop, value);
        return;
      }
      case 'p': {
        const [, id, parentId] = op;
        const item = this.items.get(id);
        if (!item) return;
        item.parentId = parentId;
        if (parentId === 0) {
          if (item.type === 'Form' && !item.embedded) this.windows.appendChild(item.el);
          else item.el.remove();
          return;
        }
        const parent = this.items.get(parentId);
        if (!parent) return;
        if (item.type === 'Form') {
          item.embedded = true;
          item.el.classList.add('wf-embedded');
        }
        clientOf(parent).appendChild(item.el);
        return;
      }
      case 'm': {
        const [, id, method, arg] = op;
        const item = this.items.get(id);
        if (!item) return;
        this.callMethod(item, method, arg);
        return;
      }
      case 'd': {
        const [, id] = op;
        const item = this.items.get(id);
        if (item) {
          item.el.remove();
          this.items.delete(id);
        }
        if (this.timers.has(id)) {
          clearInterval(this.timers.get(id));
          this.timers.delete(id);
        }
        return;
      }
      case 'reset':
        this.clear();
        this.running = true;
        return;
      case 'dl':
        this.hooks.onDownload?.(op[1], op[2]);
        return;
      case 'dbfile':
        this.hooks.onDataFile?.(op[1], op[2]);
        return;
      default:
    }
  }

  callMethod(item, method, arg) {
    const input = item.input;
    if (item.type === 'DataGridView') return this.gridMethod(item, method, arg);
    switch (method) {
      case 'open':
        this.openMenu(item);
        return;
      case 'close':
        if (item.type === 'ContextMenuStrip') this.closeContext();
        else this.closeMenus();
        return;
      case 'showat': {
        const [cid, x, y] = String(arg).split(',').map(Number);
        const host = cid ? this.items.get(cid) : null;
        const hr = host ? host.el.getBoundingClientRect() : this.root.getBoundingClientRect();
        this.showContext(item, hr.left + x, hr.top + y);
        return;
      }
      case 'focus':
        setTimeout(() => (input || item.el).focus?.(), 0);
        return;
      case 'selectall':
        input?.select?.();
        return;
      case 'select': {
        const [s, l] = String(arg).split(',').map(Number);
        try { input?.setSelectionRange?.(s, s + l); } catch { /* yok */ }
        return;
      }
      case 'scrollend':
        if (input) input.scrollTop = input.scrollHeight;
        return;
      case 'activate':
        if (item.type === 'Form') this.bringToFront(item);
        return;
      default:
    }
  }

  setTimer(id, interval) {
    if (this.timers.has(id)) {
      clearInterval(this.timers.get(id));
      this.timers.delete(id);
    }
    if (interval > 0) {
      this.timers.set(id, setInterval(() => this.dispatch(id, 'tick'), Math.max(interval, 10)));
    }
  }

  setListen(item, value) {
    const set = new Set(value ? value.split(',') : []);
    item.listen = set;
    for (const evt of ['mouseenter', 'mouseleave']) {
      const key = '_' + evt;
      if (set.has(evt) && !item[key]) {
        item[key] = () => { if (!this.isDisabled(item)) this.dispatch(item.id, evt); };
        item.el.addEventListener(evt, item[key]);
      } else if (!set.has(evt) && item[key]) {
        item.el.removeEventListener(evt, item[key]);
        item[key] = null;
      }
    }
  }

  // ------------------------------------------------------------------ pencereler (Form)

  setupWindow(item) {
    item.el.classList.add('wf-hidden');
    item.state = 'Normal';
    item.placed = false;
    item.props.border = 'Sizable';
    item.props.startpos = 'WindowsDefaultLocation';
    const bar = item.el.querySelector('.wf-titlebar');
    item.el.querySelector('.wf-close').onclick = () => this.dispatch(item.id, 'close');
    item.el.querySelector('.wf-max').onclick = () => this.toggleMaximize(item);
    item.el.querySelector('.wf-min').onclick = () => this.minimize(item);
    bar.addEventListener('dblclick', (e) => {
      if (e.target.closest('.wf-cap')) return;
      if (item.props.box?.[2] !== '0' && this.isSizable(item)) this.toggleMaximize(item);
    });
    item.el.addEventListener('pointerdown', () => this.activate(item), true);
    this.makeDraggable(item.el, item);
    this.makeResizable(item);
  }

  isSizable(item) {
    return item.props.border === 'Sizable' || item.props.border === 'SizableToolWindow';
  }

  setFormProp(item, prop, value) {
    switch (prop) {
      case 'bounds':
        setProp(item, prop, value);
        if (item.placed && item.state !== 'Maximized') this.positionWindow(item);
        return;
      case 'visible':
        if (value === '1') this.showWindow(item);
        else item.el.classList.add('wf-hidden');
        return;
      case 'text':
        setProp(item, prop, value);
        return;
      case 'border': {
        item.props.border = value;
        item.el.classList.toggle('wf-noborder', value === 'None');
        item.el.classList.toggle('wf-toolwindow', value.includes('ToolWindow'));
        item.el.classList.toggle('wf-fixed', !this.isSizable(item));
        return;
      }
      case 'box': {
        item.props.box = value;
        const [ctl, min, max] = value.split('');
        item.el.querySelector('.wf-caption-buttons').style.display = ctl === '0' ? 'none' : '';
        item.el.querySelector('.wf-min').style.display = min === '0' ? 'none' : '';
        item.el.querySelector('.wf-max').style.display = max === '0' ? 'none' : '';
        return;
      }
      case 'state':
        if (value === 'Maximized' && item.state !== 'Maximized') this.toggleMaximize(item, true);
        else if (value === 'Normal' && item.state === 'Maximized') this.toggleMaximize(item, true);
        else if (value === 'Minimized') this.minimize(item, true);
        else if (value === 'Normal' && item.state === 'Minimized') this.restore(item, true);
        return;
      case 'modal':
        item.modal = value === '1';
        item.el.classList.toggle('wf-modal', item.modal);
        return;
      case 'topmost':
        item.topmost = value === '1';
        this.bringToFront(item);
        return;
      case 'opacity':
        item.el.style.opacity = value;
        return;
      case 'keypreview':
        item.keypreview = value === '1';
        return;
      case 'startpos':
        item.props.startpos = value;
        return;
      case 'taskbar':
        item.props.taskbar = value;
        return;
      case 'toplevel':
        item.embedded = value === '0';
        item.el.classList.toggle('wf-embedded', item.embedded);
        return;
      case 'listen':
        this.setListen(item, value);
        return;
      default:
        setProp(item, prop, value);
    }
  }

  showWindow(item) {
    item.el.classList.remove('wf-hidden');
    if (item.embedded) {
      item.el.style.left = (item.x || 0) + 'px';
      item.el.style.top = (item.y || 0) + 'px';
      return;
    }
    if (!item.el.parentNode) this.windows.appendChild(item.el);
    if (!item.placed) {
      item.placed = true;
      const pos = item.props.startpos;
      if (pos !== 'Manual') {
        const r = this.windows.getBoundingClientRect();
        const w = item.el.offsetWidth;
        const h = item.el.offsetHeight;
        let x;
        let y;
        if (pos === 'CenterScreen' || pos === 'CenterParent') {
          x = Math.round((r.width - w) / 2);
          y = Math.round((r.height - h) / 2);
        } else {
          x = 24 + (this.cascade % 8) * 28;
          y = 16 + (this.cascade % 8) * 28;
          this.cascade++;
        }
        item.x = Math.max(0, x);
        item.y = Math.max(0, y);
        this.positionWindow(item);
        this.dispatch(item.id, 'move', `${item.x},${item.y}`);
      } else {
        this.positionWindow(item);
      }
    }
    this.bringToFront(item);
  }

  positionWindow(item) {
    item.el.style.left = (item.x || 0) + 'px';
    item.el.style.top = (item.y || 0) + 'px';
  }

  bringToFront(item) {
    item.el.style.zIndex = (item.topmost ? 50000 : 0) + (++this.z);
    for (const it of this.items.values()) {
      if (it.type === 'Form') it.el.classList.toggle('wf-active', it === item);
    }
    this.renderTaskbar();
  }

  activate(item) {
    if (item.embedded) return;
    const wasActive = item.el.classList.contains('wf-active');
    this.bringToFront(item);
    if (!wasActive) this.dispatch(item.id, 'activate');
  }

  toggleMaximize(item, fromCode = false) {
    if (item.state === 'Maximized') {
      item.state = 'Normal';
      item.el.classList.remove('wf-maximized');
      const r = item.restore;
      if (r) {
        item.x = r.x; item.y = r.y;
        this.positionWindow(item);
        this.sendResize(item, r.w, r.h);
      }
    } else {
      item.restore = { x: item.x, y: item.y, w: item.clientW, h: item.clientH };
      item.state = 'Maximized';
      item.el.classList.add('wf-maximized');
      const r = this.windows.getBoundingClientRect();
      item.x = 0; item.y = 0;
      this.positionWindow(item);
      const frameW = item.el.offsetWidth - item.client.offsetWidth;
      const frameH = item.el.offsetHeight - item.client.offsetHeight;
      this.sendResize(item, Math.floor(r.width - frameW), Math.floor(r.height - frameH));
    }
    if (!fromCode) this.dispatch(item.id, 'state', item.state);
  }

  minimize(item, fromCode = false) {
    item.prevState = item.state === 'Minimized' ? item.prevState : item.state;
    item.state = 'Minimized';
    item.el.classList.add('wf-minimized');
    if (!fromCode) this.dispatch(item.id, 'state', 'Minimized');
    this.renderTaskbar();
  }

  restore(item, fromCode = false) {
    item.el.classList.remove('wf-minimized');
    item.state = item.prevState === 'Maximized' ? 'Maximized' : 'Normal';
    if (!fromCode) this.dispatch(item.id, 'state', item.state);
    this.activate(item);
  }

  sendResize(item, w, h) {
    w = Math.max(40, Math.round(w));
    h = Math.max(10, Math.round(h));
    item.client.style.width = w + 'px';
    item.client.style.height = h + 'px';
    item.clientW = w;
    item.clientH = h;
    this.dispatch(item.id, 'resize', `${w},${h}`);
  }

  makeDraggable(el, item) {
    const bar = el.querySelector('.wf-titlebar');
    bar.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target.closest('.wf-cap')) return;
      if (item && item.state === 'Maximized') return;
      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      const ox = el.offsetLeft;
      const oy = el.offsetTop;
      bar.setPointerCapture(e.pointerId);
      const move = (ev) => {
        const nx = Math.max(-el.offsetWidth + 60, ox + ev.clientX - startX);
        const ny = Math.max(0, oy + ev.clientY - startY);
        el.style.left = nx + 'px';
        el.style.top = ny + 'px';
      };
      const up = () => {
        bar.removeEventListener('pointermove', move);
        bar.removeEventListener('pointerup', up);
        if (item) {
          item.x = el.offsetLeft;
          item.y = el.offsetTop;
          this.dispatch(item.id, 'move', `${item.x},${item.y}`);
        }
      };
      bar.addEventListener('pointermove', move);
      bar.addEventListener('pointerup', up);
    });
  }

  makeResizable(item) {
    const grip = item.el.querySelector('.wf-grip');
    grip.addEventListener('pointerdown', (e) => {
      if (!this.isSizable(item) || item.state === 'Maximized') return;
      e.preventDefault();
      e.stopPropagation();
      grip.setPointerCapture(e.pointerId);
      const sx = e.clientX;
      const sy = e.clientY;
      const w0 = item.clientW;
      const h0 = item.clientH;
      let frame = 0;
      const move = (ev) => {
        const w = w0 + ev.clientX - sx;
        const h = h0 + ev.clientY - sy;
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => this.sendResize(item, w, h));
      };
      const up = () => {
        grip.removeEventListener('pointermove', move);
        grip.removeEventListener('pointerup', up);
      };
      grip.addEventListener('pointermove', move);
      grip.addEventListener('pointerup', up);
    });
  }

  updateModal() {
    let top = null;
    for (const it of this.items.values()) {
      if (it.type === 'Form' && it.modal && !it.el.classList.contains('wf-hidden')) {
        if (!top || Number(it.el.style.zIndex) > Number(top.el.style.zIndex)) top = it;
      }
    }
    const hasDialog = this.dialogs.length > 0;
    this.shade.classList.toggle('active', !!top || hasDialog);
    this.shade.style.zIndex = hasDialog ? 99999 : top ? Number(top.el.style.zIndex) - 1 : 0;
    if (top) top.el.style.zIndex = Math.max(Number(top.el.style.zIndex), 40000 + this.z);
  }

  renderTaskbar() {
    const forms = [...this.items.values()].filter((i) => i.type === 'Form' && !i.embedded && i.placed &&
      !i.el.classList.contains('wf-hidden') && i.props.taskbar !== '0');
    this.taskbar.innerHTML = '';
    for (const f of forms) {
      const b = document.createElement('button');
      b.className = 'wf-task' + (f.el.classList.contains('wf-active') && f.state !== 'Minimized' ? ' active' : '');
      b.textContent = f.title.textContent || 'Form';
      b.onclick = () => (f.state === 'Minimized' ? this.restore(f) : f.el.classList.contains('wf-active') ? this.minimize(f) : this.activate(f));
      this.taskbar.appendChild(b);
    }
  }

  // ------------------------------------------------------------------ olaylar

  itemFrom(target) {
    const el = target?.closest?.('[data-wf-id]');
    if (!el || !this.root.contains(el)) return null;
    return this.items.get(Number(el.dataset.wfId)) || null;
  }

  formOf(item) {
    let it = item;
    while (it && it.type !== 'Form') it = this.items.get(it.parentId);
    return it;
  }

  isDisabled(item) {
    return !!item.el.closest('.wf-disabled');
  }

  listens(item, evt) {
    if (item.listen?.has(evt)) return true;
    if (KEY_EVENTS.has(evt)) {
      const f = this.formOf(item);
      return !!f?.keypreview || !!f?.listen?.has(evt);
    }
    return false;
  }

  mouseData(item, e) {
    const host = item.type === 'Form' ? item.client : item.el;
    const r = host.getBoundingClientRect();
    const btn = e.button === 2 ? 2 : e.button === 1 ? 1 : 0;
    const delta = e.type === 'wheel' ? (e.deltaY < 0 ? 120 : -120) : 0;
    return `${Math.round(e.clientX - r.left)},${Math.round(e.clientY - r.top)},${btn},${delta}`;
  }

  keyData(e) {
    let code = e.keyCode || 0;
    if (code === 0 && e.key?.length === 1) code = e.key.toUpperCase().charCodeAt(0);
    return `${code},${e.shiftKey ? 1 : 0},${e.ctrlKey ? 1 : 0},${e.altKey ? 1 : 0}`;
  }

  /** Form'un istemci alanında mı (başlık çubuğunda değil)? */
  inClient(item, target) {
    return item.type !== 'Form' || item.client.contains(target);
  }

  bindDelegated() {
    const root = this.root;
    // Araç çubuğu / menü öğeleri
    root.addEventListener('click', (e) => this.toolStripClick(e), true);
    root.addEventListener('mouseover', (e) => this.toolStripHover(e));
    root.addEventListener('change', (e) => {
      const it = this.itemFrom(e.target);
      if (it?.type === 'TSComboBox') this.dispatch(it.id, 'select', it.select.selectedIndex);
    });
    root.addEventListener('contextmenu', (e) => this.contextMenu(e), true);
    document.addEventListener('mousedown', (e) => {
      if (!e.target.closest?.('.wf-tsmenu, .wf-ctxmenu')) {
        this.closeMenus();
        this.closeContext();
      }
    });

    const mouse = (evt) => (e) => {
      const item = this.itemFrom(e.target);
      if (item?.type.startsWith('TS')) return;
      if (!item || this.isDisabled(item) || !this.inClient(item, e.target)) return;
      if (evt === 'click' && (item.type === 'CheckBox' || item.type === 'RadioButton')) return;
      if (evt === 'click' && item.type === 'Button') {
        this.dispatch(item.id, 'click', this.mouseData(item, e));
        return;
      }
      if (!this.listens(item, evt)) return;
      this.dispatch(item.id, evt, this.mouseData(item, e));
    };
    for (const evt of ['click', 'dblclick', 'mousedown', 'mouseup']) root.addEventListener(evt, mouse(evt));
    let lastMove = 0;
    root.addEventListener('mousemove', (e) => {
      const now = performance.now();
      if (now - lastMove < 15) return;
      lastMove = now;
      mouse('mousemove')(e);
    });
    root.addEventListener('wheel', mouse('wheel'), { passive: true });
    root.addEventListener('contextmenu', (e) => {
      const item = this.itemFrom(e.target);
      if (item && (this.listens(item, 'mousedown') || this.listens(item, 'mouseup') || this.listens(item, 'click'))) e.preventDefault();
    });

    root.addEventListener('keydown', (e) => {
      if (this.handleShortcut(e)) return;
      const item = this.itemFrom(e.target);
      if (!item || this.isDisabled(item)) return;
      if (item.type === 'DataGridView') { this.gridKey(item, e); return; }
      if (item.type === 'TSTextBox') {
        const r = this.dispatch(item.id, 'keydown', this.keyData(e));
        if (r === 'handled') e.preventDefault();
        return;
      }
      if (this.listens(item, 'keydown')) {
        const r = this.dispatch(item.id, 'keydown', this.keyData(e));
        if (r === 'handled' || r === 'suppress') {
          e.preventDefault();
          if (r === 'suppress') item.suppressNextPress = true;
          return;
        }
      }
      // Tarayıcı Backspace/Esc için keypress üretmez; WinForms üretir.
      if ((e.key === 'Backspace' || e.key === 'Escape') && this.listens(item, 'keypress')) {
        const r = this.dispatch(item.id, 'keypress', e.key === 'Backspace' ? '\b' : '\u001b');
        if (r === 'handled') { e.preventDefault(); return; }
      }
      const form = this.formOf(item);
      if (form && e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'BUTTON' && !e.target.closest('.wf-combo-list')) {
        if (this.dispatch(form.id, 'accept') === 'handled') e.preventDefault();
      }
      if (form && e.key === 'Escape') {
        if (this.dispatch(form.id, 'cancel') === 'handled') e.preventDefault();
      }
    });

    root.addEventListener('keypress', (e) => {
      const item = this.itemFrom(e.target);
      if (!item || this.isDisabled(item) || item.type === 'DataGridView') return;
      if (item.suppressNextPress) {
        item.suppressNextPress = false;
        e.preventDefault();
        return;
      }
      if (!this.listens(item, 'keypress')) return;
      const ch = e.key === 'Enter' ? '\r' : e.key.length === 1 ? e.key : '';
      if (!ch) return;
      const r = this.dispatch(item.id, 'keypress', ch);
      if (r === 'handled') {
        e.preventDefault();
      } else if (r.startsWith('replace:')) {
        e.preventDefault();
        const rep = r.substring(8);
        const input = item.input;
        if (input?.setRangeText) {
          input.setRangeText(rep, input.selectionStart, input.selectionEnd, 'end');
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
    });

    root.addEventListener('keyup', (e) => {
      const item = this.itemFrom(e.target);
      if (!item || this.isDisabled(item) || !this.listens(item, 'keyup')) return;
      if (this.dispatch(item.id, 'keyup', this.keyData(e)) === 'handled') e.preventDefault();
    });

    root.addEventListener('input', (e) => {
      const item = this.itemFrom(e.target);
      if (!item) return;
      if (item.type === 'DataGridView') {
        if (item.editor?.input === e.target) this.dispatch(item.id, 'edittext', e.target.value);
        return;
      }
      if (item.type === 'TextBox' || item.type === 'MaskedTextBox' || item.type === 'TSTextBox' || (item.type === 'ComboBox' && e.target === item.input)) {
        this.dispatch(item.id, 'input', e.target.value);
      } else if (item.type === 'TrackBar') {
        this.dispatch(item.id, 'input', e.target.value);
      }
    });

    root.addEventListener('change', (e) => {
      const item = this.itemFrom(e.target);
      if (!item) return;
      if ((item.type === 'CheckBox' || item.type === 'RadioButton') && e.target === item.input) {
        this.dispatch(item.id, 'change', item.input.checked ? '1' : '0');
        this.dispatch(item.id, 'click', '');
      } else if (item.type === 'NumericUpDown') {
        this.dispatch(item.id, 'input', e.target.value);
      } else if (item.type === 'DateTimePicker') {
        if (!e.target.value) return;
        this.dispatch(item.id, 'input', item.input.type === 'time' ? `2000-01-01T${e.target.value}` : e.target.value);
      }
    });

    root.addEventListener('focusin', (e) => {
      const item = this.itemFrom(e.target);
      if (!item || item.type === 'Form' || item.type === 'Panel' || item.type === 'GroupBox') return;
      if (this.lastFocus === item.id) return;
      this.lastFocus = item.id;
      this.dispatch(item.id, 'focus');
    });

    // ComboBox ve ListBox fare etkileşimleri
    root.addEventListener('mousedown', (e) => {
      const item = this.itemFrom(e.target);
      if (!item || this.isDisabled(item)) return;
      if (item.type === 'ComboBox') this.comboMouse(item, e);
      else if (item.type === 'ListBox' || item.type === 'CheckedListBox') this.listMouse(item, e);
      else if (item.type === 'DataGridView') this.gridMouse(item, e, false);
      else if (item.type === 'TabControl') {
        const tab = e.target.closest('.wf-tab');
        if (tab && item.header.contains(tab)) {
          e.preventDefault();
          this.dispatch(item.id, 'select', tab.dataset.tab);
        }
      }
    });
    // Maskeli metin kutusu: girilen karakterler maskeye göre yerleştirilir.
    root.addEventListener('beforeinput', (e) => {
      const item = this.itemFrom(e.target);
      if (item?.type !== 'MaskedTextBox' || !item.mask?.s?.length || e.target !== item.input) return;
      e.preventDefault();
      this.maskedInput(item, e);
    });
    root.addEventListener('dblclick', (e) => {
      const item = this.itemFrom(e.target);
      if (item?.type === 'DataGridView' && !this.isDisabled(item)) this.gridMouse(item, e, true);
    });
    root.addEventListener('click', (e) => {
      // Tablodaki onay kutusunu motor değiştirir; tarayıcı kendisi değiştirmesin.
      if (e.target.matches?.('.wf-grid input[type=checkbox]')) e.preventDefault();
    }, true);
    root.addEventListener('keydown', (e) => {
      const item = this.itemFrom(e.target);
      if (!item || this.isDisabled(item)) return;
      if (item.type === 'ComboBox') this.comboKey(item, e);
      else if (item.type === 'ListBox' || item.type === 'CheckedListBox') this.listKey(item, e);
    });
    document.addEventListener('mousedown', (e) => {
      for (const it of this.items.values()) {
        if (it.type === 'ComboBox' && it.open && !it.el.contains(e.target)) this.closeCombo(it);
      }
    });
  }

  comboMouse(item, e) {
    const option = e.target.closest('.wf-combo-item');
    if (option) {
      e.preventDefault();
      this.closeCombo(item);
      this.dispatch(item.id, 'select', option.dataset.index);
      return;
    }
    const style = item.el.classList.contains('wf-dropdownlist');
    if (e.target === item.button || (style && e.target === item.input)) {
      e.preventDefault();
      if (item.open) this.closeCombo(item);
      else this.openCombo(item);
      item.input.focus();
    }
  }

  openCombo(item) {
    item.open = true;
    item.el.classList.add('open');
    item.el.style.zIndex = 100000;
    this.dispatch(item.id, 'dropdown');
  }

  closeCombo(item) {
    if (!item.open) return;
    item.open = false;
    item.el.classList.remove('open');
    item.el.style.zIndex = item.props.z || '';
    this.dispatch(item.id, 'dropdownclosed');
  }

  comboKey(item, e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = item.items.length;
      if (!n) return;
      let i = item.sel + (e.key === 'ArrowDown' ? 1 : -1);
      i = Math.max(0, Math.min(n - 1, i));
      if (i !== item.sel) this.dispatch(item.id, 'select', i);
    } else if ((e.key === 'Enter' || e.key === 'Escape') && item.open) {
      e.preventDefault();
      this.closeCombo(item);
    } else if (e.key === 'F4' || (e.altKey && e.key === 'ArrowDown')) {
      e.preventDefault();
      if (item.open) this.closeCombo(item); else this.openCombo(item);
    }
  }

  listMouse(item, e) {
    const row = e.target.closest('.wf-list-item');
    if (!row) return;
    const i = Number(row.dataset.index);
    if (e.target.matches('input[type=checkbox]') || (item.type === 'CheckedListBox' && item.sel.includes(i))) {
      e.preventDefault();
      this.dispatch(item.id, 'check', i);
    }
    const mode = item.el.dataset.selmode || 'One';
    let sel;
    if (mode === 'None') return;
    if (mode === 'One') sel = [i];
    else if (mode === 'MultiSimple') sel = item.sel.includes(i) ? item.sel.filter((x) => x !== i) : [...item.sel, i];
    else if (e.ctrlKey) sel = item.sel.includes(i) ? item.sel.filter((x) => x !== i) : [...item.sel, i];
    else if (e.shiftKey && item.anchor != null) {
      const [a, b] = [Math.min(item.anchor, i), Math.max(item.anchor, i)];
      sel = [];
      for (let k = a; k <= b; k++) sel.push(k);
    } else sel = [i];
    if (!e.shiftKey) item.anchor = i;
    this.dispatch(item.id, 'select', sel.join(','));
  }

  listKey(item, e) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') {
      if (e.key === ' ' && item.type === 'CheckedListBox' && item.sel.length) {
        e.preventDefault();
        this.dispatch(item.id, 'check', item.sel[0]);
      }
      return;
    }
    e.preventDefault();
    const n = item.items.length;
    if (!n) return;
    const cur = item.sel.length ? item.sel[item.sel.length - 1] : -1;
    const i = Math.max(0, Math.min(n - 1, cur + (e.key === 'ArrowDown' ? 1 : -1)));
    this.dispatch(item.id, 'select', String(i));
    item.el.querySelector(`.wf-list-item[data-index="${i}"]`)?.scrollIntoView({ block: 'nearest' });
  }
  // ------------------------------------------------------------------ menüler ve araç çubukları

  stripOf(item) {
    let it = item;
    while (it && it.type.startsWith('TS')) it = this.items.get(it.parentId);
    return it;
  }

  isTopLevelMenu(item) {
    const parent = this.items.get(item.parentId);
    return parent && !parent.type.startsWith('TS') && parent.type !== 'ContextMenuStrip';
  }

  hasChildren(item) {
    return !!item.client && item.client.children.length > 0;
  }

  openMenu(item) {
    if (!item.client) return;
    if (this.isTopLevelMenu(item)) {
      this.closeMenus(item);
      this.menuActive = true;
    }
    if (!item.el.classList.contains('open')) {
      item.el.classList.add('open');
      // Açılır menü form kenarında kesilmesin diye ekrana göre konumlanır.
      const r = item.el.getBoundingClientRect();
      const drop = item.client;
      drop.style.position = 'fixed';
      if (this.isTopLevelMenu(item)) {
        drop.style.left = r.left + 'px';
        drop.style.top = r.bottom + 'px';
      } else {
        drop.style.left = r.right - 2 + 'px';
        drop.style.top = r.top - 3 + 'px';
      }
      this.dispatch(item.id, 'opening');
    }
  }

  closeMenus(except) {
    for (const it of this.items.values()) {
      if (it !== except && it.el.classList.contains('open') && (it.type === 'TSMenuItem' || it.type === 'TSDropDownButton')) {
        it.el.classList.remove('open');
        this.dispatch(it.id, 'closed');
      }
    }
    if (!except) this.menuActive = false;
  }

  toolStripClick(e) {
    const el = e.target.closest?.('.wf-tsitem');
    if (!el || !this.root.contains(el)) return;
    const item = this.items.get(Number(el.dataset.wfId));
    if (!item || el.classList.contains('wf-tsdisabled') || el.closest('.wf-tsdisabled, .wf-disabled')) return;
    if (item.type === 'TSTextBox' || item.type === 'TSComboBox' || item.type === 'TSSeparator') return;
    e.stopPropagation();
    const isMenu = item.type === 'TSMenuItem' || item.type === 'TSDropDownButton';
    if (isMenu && this.hasChildren(item)) {
      if (this.isTopLevelMenu(item) && item.el.classList.contains('open')) {
        this.closeMenus();
      } else {
        this.openMenu(item);
      }
      this.dispatch(item.id, 'click');
      return;
    }
    this.closeMenus();
    this.closeContext();
    this.dispatch(item.id, 'click');
  }

  toolStripHover(e) {
    const el = e.target.closest?.('.wf-tsmenu');
    if (!el) return;
    const item = this.items.get(Number(el.dataset.wfId));
    if (!item || !this.hasChildren(item)) return;
    if (this.isTopLevelMenu(item)) {
      if (this.menuActive && !item.el.classList.contains('open')) this.openMenu(item);
    } else if (!item.el.classList.contains('open')) {
      // Alt menü: kardeşlerin açık alt menülerini kapat
      for (const sib of item.el.parentNode.children) {
        if (sib !== item.el && sib.classList.contains('open')) sib.classList.remove('open');
      }
      this.openMenu(item);
    }
  }

  keysValue(e) {
    let code = e.keyCode || 0;
    if (e.shiftKey) code |= 0x10000;
    if (e.ctrlKey) code |= 0x20000;
    if (e.altKey) code |= 0x40000;
    return code;
  }

  /** Menü kısayol tuşları (ör. Ctrl+S). */
  handleShortcut(e) {
    if (!e.ctrlKey && !e.altKey && !(e.keyCode >= 112 && e.keyCode <= 123)) return false;
    const keys = this.keysValue(e);
    const from = this.itemFrom(e.target);
    const form = from ? this.formOf(from) : null;
    for (const it of this.items.values()) {
      if (!it.shortcut || it.shortcut !== keys) continue;
      if (it.el.closest('.wf-tsdisabled, .wf-hidden')) continue;
      if (form && this.formOf(it) !== form) continue;
      e.preventDefault();
      this.closeMenus();
      this.dispatch(it.id, 'click');
      return true;
    }
    return false;
  }

  contextMenu(e) {
    let it = this.itemFrom(e.target);
    while (it && !it.ctxmenu) it = this.items.get(it.parentId);
    if (!it) return;
    const menu = this.items.get(it.ctxmenu);
    if (!menu) return;
    e.preventDefault();
    e.stopPropagation();
    if (this.dispatch(menu.id, 'opening', it.id) === 'handled') return;
    this.showContext(menu, e.clientX, e.clientY);
  }

  showContext(menu, clientX, clientY) {
    this.closeContext();
    const r = this.root.getBoundingClientRect();
    menu.el.classList.remove('wf-hidden');
    menu.el.style.left = Math.max(0, clientX - r.left) + 'px';
    menu.el.style.top = Math.max(0, clientY - r.top) + 'px';
    menu.el.style.zIndex = 200000;
    this.openContext = menu;
  }

  closeContext() {
    if (!this.openContext) return;
    this.openContext.el.classList.add('wf-hidden');
    for (const o of this.openContext.el.querySelectorAll('.open')) o.classList.remove('open');
    this.openContext = null;
  }

  // ------------------------------------------------------------------ DataGridView

  gridMouse(item, e, dbl) {
    if (item.editor && item.editor.input.contains(e.target)) return;
    const cell = e.target.closest?.('td[data-r], th[data-r]');
    if (!cell || !item.el.contains(cell)) return;
    const r = Number(cell.dataset.r);
    const c = Number(cell.dataset.c);
    const content = e.target.closest('.wf-gcontent') ? 1 : 0;
    const rect = cell.getBoundingClientRect();
    const btn = e.button === 2 ? 2 : e.button === 1 ? 1 : 0;
    const data = `${r},${c},${e.ctrlKey ? 1 : 0},${e.shiftKey ? 1 : 0},${btn},${Math.round(e.clientX - rect.left)},${Math.round(e.clientY - rect.top)},${content}`;
    if (dbl) {
      this.dispatch(item.id, 'celldbl', data);
      return;
    }
    // Hücreler yeniden çizildiği için odağı tarayıcıya bırakmadan tabloya veriyoruz.
    e.preventDefault();
    if (document.activeElement !== item.el) item.el.focus({ preventScroll: true });
    this.dispatch(item.id, 'cell', data);
    if (btn === 0 && e.target.matches('input[type=checkbox]')) this.dispatch(item.id, 'check', `${r},${c}`);
  }

  gridKey(item, e) {
    const ed = item.editor;
    if (ed && e.target === ed.input) {
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        this.commitGridEditor(item);
        if (!item.editor) {
          item.el.focus({ preventScroll: true });
          this.dispatch(item.id, 'gridkey', this.keyData(e));
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        item.editor = null;
        ed.input.remove();
        renderGrid(item, item.gridJson);
        item.el.focus({ preventScroll: true });
        this.dispatch(item.id, 'canceledit');
      }
      return;
    }
    const g = item.grid;
    if (!g) return;
    if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey && e.key !== ' ' && !g.noedit && !g.ro) {
      const [r, c] = g.cur || [-1, -1];
      if (r >= 0 && c >= 0 && g.cols[c]?.k !== 'check') {
        e.preventDefault();
        this.dispatch(item.id, 'beginedit', `${r},${c}\n${e.key}`);
        return;
      }
    }
    const res = this.dispatch(item.id, 'gridkey', this.keyData(e));
    if (res === 'handled') e.preventDefault();
    else {
      const form = this.formOf(item);
      if (form && e.key === 'Escape' && this.dispatch(form.id, 'cancel') === 'handled') e.preventDefault();
    }
  }

  commitGridEditor(item) {
    const ed = item.editor;
    if (!ed) return;
    item.editor = null;
    ed.input.remove();
    renderGrid(item, item.gridJson);
    this.dispatch(item.id, 'commit', `${ed.r},${ed.c}\n${ed.input.value}`);
  }

  gridMethod(item, method, arg) {
    switch (method) {
      case 'edit': {
        const nl = arg.indexOf('\n');
        const [r, c, typed] = arg.substring(0, nl).split(',').map(Number);
        if (item.editor) item.editor.input.remove();
        const input = document.createElement('input');
        input.type = 'text';
        input.spellcheck = false;
        input.className = 'wf-geditor';
        input.value = arg.substring(nl + 1);
        input.addEventListener('blur', () => {
          if (item.editor?.input !== input) return;
          setTimeout(() => { if (item.editor?.input === input) this.commitGridEditor(item); }, 0);
        });
        item.editor = { r, c, typed: typed === 1, input, focusNext: true };
        attachEditor(item);
        return;
      }
      case 'closeeditor': {
        const ed = item.editor;
        if (!ed) return;
        const hadFocus = document.activeElement === ed.input;
        item.editor = null;
        ed.input.remove();
        renderGrid(item, item.gridJson);
        if (hadFocus) item.el.focus({ preventScroll: true });
        return;
      }
      case 'scrollto':
        setTimeout(() => scrollToRow(item, Number(arg)), 0);
        return;
      case 'focus':
        setTimeout(() => item.el.focus(), 0);
        return;
      default:
    }
  }

  // ------------------------------------------------------------------ Dosya Aç / Kaydet iletişim kutuları

  showFileDialog(requestId, kind, data) {
    const open = kind === 'openfile';
    const box = document.createElement('div');
    box.className = 'wf-window wf-dialog wf-filedialog';
    box.innerHTML = `
      <div class="wf-titlebar"><span class="wf-title"></span>
        <span class="wf-caption-buttons"><button class="wf-cap wf-close" tabindex="-1">&#10005;</button></span></div>
      <div class="wf-fd-path">🖥 Bu bilgisayar › 📁 Belgeler</div>
      <div class="wf-fd-list" tabindex="0"></div>
      <div class="wf-fd-row"><label>Dosya adı:</label><input class="wf-fd-name" spellcheck="false"><select class="wf-fd-filter"></select></div>
      <div class="wf-fd-note"></div>
      <div class="wf-dialog-buttons"><button class="wf-button wf-dialog-button wf-fd-pick" type="button">💻 Bilgisayardan seç…</button><span style="flex:1"></span>
        <button class="wf-button wf-dialog-button wf-fd-ok" type="button"></button><button class="wf-button wf-dialog-button wf-fd-cancel" type="button">İptal</button></div>`;
    box.querySelector('.wf-title').textContent = data.title || (open ? 'Aç' : 'Farklı Kaydet');
    box.querySelector('.wf-fd-ok').textContent = open ? 'Aç' : 'Kaydet';
    const list = box.querySelector('.wf-fd-list');
    const nameInput = box.querySelector('.wf-fd-name');
    const filterSel = box.querySelector('.wf-fd-filter');
    const note = box.querySelector('.wf-fd-note');
    const pick = box.querySelector('.wf-fd-pick');
    if (!open) pick.remove();
    const filters = data.filters?.length ? data.filters : [{ n: 'Tüm Dosyalar', p: '*.*' }];
    filters.forEach((f, i) => filterSel.appendChild(new Option(`${f.n}`, String(i))));
    filterSel.value = String(Math.min(filters.length, data.index || 1) - 1);
    nameInput.value = data.fileName || '';
    note.textContent = open
      ? 'Web ortamında bilgisayarınızdaki dosyayı "Bilgisayardan seç" ile açın. Daha önce açılan/kaydedilen dosyalar yukarıda listelenir.'
      : 'Kaydedilen dosya program yazdıktan sonra "Çıktı" bölümünde indirme bağlantısı olarak görünür.';

    const patterns = () => filters[Number(filterSel.value)]?.p.split(';').map((x) => x.trim().toLowerCase()).filter(Boolean) || ['*.*'];
    const matches = (name) => patterns().some((p) => {
      if (p === '*.*' || p === '*') return true;
      const re = new RegExp('^' + p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i');
      return re.test(name);
    });
    const fmtSize = (n) => (n < 1024 ? `${n} B` : n < 1048576 ? `${Math.ceil(n / 1024)} KB` : `${(n / 1048576).toFixed(1)} MB`);
    const renderList = () => {
      list.innerHTML = '';
      const files = (data.files || []).filter((f) => matches(f.n));
      if (!files.length) list.innerHTML = '<div class="wf-fd-empty">Bu klasörde dosya yok.</div>';
      for (const f of files) {
        const row = document.createElement('div');
        row.className = 'wf-fd-item';
        row.innerHTML = '<span class="wf-fd-icon">📄</span><span class="wf-fd-fname"></span><span class="wf-fd-size"></span>';
        row.querySelector('.wf-fd-fname').textContent = f.n;
        row.querySelector('.wf-fd-size').textContent = fmtSize(f.s);
        row.onclick = () => {
          list.querySelectorAll('.wf-fd-item.selected').forEach((x) => x.classList.remove('selected'));
          row.classList.add('selected');
          nameInput.value = f.n;
        };
        row.ondblclick = () => ok();
        list.appendChild(row);
      }
    };
    filterSel.onchange = renderList;
    renderList();

    const finish = (result) => {
      box.remove();
      this.dialogs = this.dialogs.filter((d) => d !== box);
      this.updateModal();
      if (!this.running || !this.engine) return;
      try { this.engine.CompleteDialog(requestId, result); } catch (e) { console.error(e); }
    };
    const head = () => `OK${Number(filterSel.value) + 1}`;
    const exists = (n) => (data.files || []).some((f) => f.n.toLowerCase() === n.toLowerCase());
    const ok = () => {
      let n = nameInput.value.trim().replace(/^.*[\\/]/, '');
      if (!n) { nameInput.focus(); return; }
      if (/[<>:"|?*]/.test(n)) { note.textContent = 'Dosya adı şu karakterleri içeremez: < > : " | ? *'; return; }
      if (open) {
        const found = (data.files || []).find((f) => f.n.toLowerCase() === n.toLowerCase());
        if (!found) { note.textContent = `"${n}" bulunamadı. Bilgisayarınızdaki bir dosya için "Bilgisayardan seç" düğmesini kullanın.`; return; }
        finish(`${head()}\n${found.n}\t`);
        return;
      }
      if (!/\.[^.]+$/.test(n)) {
        const p = patterns()[0] || '';
        const ext = data.ext ? data.ext.replace(/^\./, '') : /^\*\.[a-z0-9]+$/i.test(p) ? p.substring(2) : '';
        if (ext) n += '.' + ext;
      }
      if (data.overwrite && exists(n) && !window.confirm(`${n} zaten var.\nDeğiştirmek istiyor musunuz?`)) return;
      finish(`${head()}\n${n}`);
    };
    box.querySelector('.wf-fd-ok').onclick = ok;
    box.querySelector('.wf-fd-cancel').onclick = () => finish('');
    box.querySelector('.wf-close').onclick = () => finish('');
    if (open) {
      pick.onclick = () => {
        const input = document.createElement('input');
        input.type = 'file';
        if (data.multi) input.multiple = true;
        const acc = patterns().filter((p) => p !== '*.*' && p !== '*').map((p) => p.replace(/^\*/, ''));
        if (acc.length) input.accept = acc.join(',');
        input.onchange = async () => {
          const files = [...input.files];
          if (!files.length) return;
          const big = files.find((f) => f.size > 8 * 1048576);
          if (big) { note.textContent = `${big.name} çok büyük (en fazla 8 MB).`; return; }
          const parts = await Promise.all(files.map((f) => new Promise((resolve) => {
            const r = new FileReader();
            r.onload = () => resolve(`${f.name.replace(/[\t\n]/g, ' ')}\t${String(r.result).split(',')[1] || ''}`);
            r.onerror = () => resolve('');
            r.readAsDataURL(f);
          })));
          finish(`${head()}\n${parts.filter(Boolean).join('\n')}`);
        };
        input.click();
      };
    }
    box.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); finish(''); }
      if (e.key === 'Enter' && e.target.tagName !== 'BUTTON') { e.preventDefault(); ok(); }
      e.stopPropagation();
    });
    this.makeDraggable(box, null);
    this.root.appendChild(box);
    this.dialogs.push(box);
    box.style.zIndex = 100000 + this.dialogs.length;
    const r = this.root.getBoundingClientRect();
    box.style.left = Math.max(0, (r.width - box.offsetWidth) / 2) + 'px';
    box.style.top = Math.max(0, (r.height - box.offsetHeight) / 3) + 'px';
    setTimeout(() => (open ? pick : nameInput).focus(), 0);
    this.updateModal();
  }

  // ------------------------------------------------------------------ MaskedTextBox

  maskedInput(item, e) {
    const { s: slots, p: prompt } = item.mask;
    const input = item.input;
    if (input.readOnly) return;
    const chars = [...input.value.padEnd(slots.length, prompt)].slice(0, slots.length);
    for (let i = 0; i < slots.length; i++) if (slots[i].l != null) chars[i] = slots[i].l;
    let start = input.selectionStart ?? 0;
    let end = input.selectionEnd ?? start;
    const clear = (a, b) => { for (let i = a; i < b && i < slots.length; i++) if (slots[i].k) chars[i] = prompt; };
    const accepts = (k, ch) => {
      switch (k) {
        case '0': return /\d/.test(ch);
        case '9': return /[\d ]/.test(ch);
        case '#': return /[\d +-]/.test(ch);
        case 'L': return /\p{L}/u.test(ch);
        case '?': return /[\p{L} ]/u.test(ch);
        case '&': return ch !== ' ' && !/\p{C}/u.test(ch);
        case 'C': return !/\p{C}/u.test(ch);
        case 'A': return /[\p{L}\d]/u.test(ch);
        case 'a': return /[\p{L}\d ]/u.test(ch);
        default: return false;
      }
    };
    const caseOf = (slot, ch) => (slot.c === 'U' ? ch.toLocaleUpperCase('tr-TR') : slot.c === 'L' ? ch.toLocaleLowerCase('tr-TR') : ch);
    const nextEdit = (i) => { while (i < slots.length && !slots[i].k) i++; return i; };
    let caret = start;
    let rejected = -1;
    const type = e.inputType;
    if (type === 'deleteContentBackward') {
      if (end > start) clear(start, end);
      else {
        let i = start - 1;
        while (i >= 0 && !slots[i].k) i--;
        if (i >= 0) { chars[i] = prompt; caret = i; }
      }
      if (end > start) caret = start;
    } else if (type === 'deleteContentForward' || type === 'deleteByCut' || type === 'deleteWordBackward' || type === 'deleteWordForward') {
      if (end > start) clear(start, end);
      else { const i = nextEdit(start); if (i < slots.length) chars[i] = prompt; }
      caret = start;
    } else if (type.startsWith('insert')) {
      const text = (e.data ?? e.dataTransfer?.getData('text/plain') ?? '').replace(/\r?\n/g, '');
      if (end > start) clear(start, end);
      let pos = start;
      for (const ch of text) {
        if (pos >= slots.length) break;
        if (slots[pos].l != null && slots[pos].l === ch) { pos++; continue; }
        const i = nextEdit(pos);
        if (i >= slots.length) break;
        if (ch === prompt) { chars[i] = prompt; pos = i + 1; continue; }
        if (accepts(slots[i].k, ch)) { chars[i] = caseOf(slots[i], ch); pos = i + 1; } else if (rejected < 0) rejected = i;
      }
      caret = nextEdit(pos);
      if (caret > slots.length) caret = slots.length;
    } else return;
    const value = chars.join('');
    if (value !== input.value) {
      input.value = value;
      this.dispatch(item.id, 'input', value);
    }
    input.setSelectionRange(caret, caret);
    if (rejected >= 0) this.dispatch(item.id, 'reject', String(rejected));
  }
}
