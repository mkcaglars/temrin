// MySQL Workbench simülasyonu: ana pencere, giriş ekranı, bağlantı sekmeleri, Navigator ve çıktı paneli.
import { h } from '../../js/ui.js';
import { ICONS } from '../icons.js';
import { showMenu, menuButton } from '../desktop.js';
import { QueryTab } from './query.js';
import { TableEditor, SchemaEditor } from './tableeditor.js';
import { RoutineEditor } from './routineeditor.js';
import { openAdminPage } from './admin.js';
import { typeText } from '../mysql/engine.js';
import { applyScriptWizard } from './review.js';
import { reverseEngineer, synchronizeModel, newModel, forwardEngineer } from './eer.js';
import { defaultConnection } from '../store.js';

const bq = (s) => '`' + String(s).replace(/`/g, '``') + '`';

export function workbenchVersion(store) {
  return store.state.mode === 'new' ? '8.0.40' : '8.0.36';
}

/** Workbench penceresini açar (zaten açıksa öne getirir) */
export function openWorkbench(lab) {
  if (lab.workbench && !lab.workbench.win.closed) {
    lab.workbench.win.minimized ? lab.workbench.win.restore() : lab.workbench.win.focus();
    return lab.workbench;
  }
  lab.workbench = new Workbench(lab);
  return lab.workbench;
}

class Workbench {
  constructor(lab) {
    this.lab = lab;
    this.desk = lab.desk;
    this.store = lab.store;
    this.conns = [];
    this.active = null; // null = Home
    this.win = this.desk.open({ title: 'MySQL Workbench', icon: ICONS.workbench, width: 1180, height: 720, maximized: window.innerWidth < 1400, className: 'wb-win', minWidth: 640, minHeight: 400,
      onClose: () => this.confirmClose(), onResize: () => this.activeTab()?.editor?.layout() });
    this.tabbar = h('div', { class: 'wb-toptabs' });
    this.content = h('div', { class: 'wb-content' });
    this.win.body.appendChild(h('div', { class: 'wb-root' }, this.tabbar, this.content));
    this.showSplash();
  }

  showSplash() {
    const sp = h('div', { class: 'wb-splash' }, h('div', { class: 'wb-splash-logo', html: ICONS.workbench }), h('div', { class: 'wb-splash-title' }, 'MySQL Workbench'), h('div', { class: 'wb-splash-ver' }, `${workbenchVersion(this.store)} Community`), h('div', { class: 'wb-splash-load' }, 'Loading...'));
    this.content.appendChild(sp);
    setTimeout(() => { sp.remove(); this.renderTabs(); this.showHome(); }, 700);
  }

  activeTab() { return this.active?.current; }

  async confirmClose() {
    const dirty = this.conns.some((c) => c.tabs.some((t) => t instanceof QueryTab && t.dirty && t.file));
    if (dirty) {
      const r = await this.desk.message({ title: 'Close Workbench', text: 'Kaydedilmemiş SQL betikleri var. Yine de kapatılsın mı?', icon: 'warning', buttons: [{ text: 'Kapat', value: 'y', primary: true }, { text: 'İptal', value: null }], owner: this.win });
      if (r !== 'y') return false;
    }
    for (const c of this.conns) c.dispose();
    return true;
  }

  renderTabs() {
    this.tabbar.innerHTML = '';
    const home = h('button', { class: 'wb-toptab home' + (!this.active ? ' active' : ''), title: 'Home', html: '&#8962;', onclick: () => this.showHome() });
    this.tabbar.appendChild(home);
    for (const c of this.conns) {
      const t = h('div', { class: 'wb-toptab' + (this.active === c ? ' active' : '') },
        h('span', { onclick: () => this.showConn(c) }, c.conn.name), h('button', { class: 'wb-tabx', title: 'Close', onclick: (e) => { e.stopPropagation(); this.closeConn(c); } }, '×'));
      this.tabbar.appendChild(t);
    }
  }

  showHome() {
    this.active = null;
    this.renderTabs();
    this.content.innerHTML = '';
    const st = this.store.state;
    const tiles = h('div', { class: 'wb-tiles' });
    for (const c of st.connections) {
      const tile = h('div', { class: 'wb-tile', tabindex: '0', title: 'Bağlanmak için tıklayın' },
        h('div', { class: 'wb-tile-name' }, c.name),
        h('div', { class: 'wb-tile-info' }, h('span', { html: ICONS.user }), c.user),
        h('div', { class: 'wb-tile-info' }, h('span', { html: ICONS.server }), `${c.host}:${c.port}`));
      tile.addEventListener('click', () => this.connect(c));
      tile.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.connect(c); });
      tile.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showMenu(e.clientX, e.clientY, [
          ['Open Connection', () => this.connect(c)],
          ['Edit Connection...', () => this.editConnection(c)],
          null,
          ['Delete Connection...', async () => {
            const r = await this.desk.message({ title: 'Delete Connection', text: `Do you want to delete the connection '${c.name}'?`, icon: 'warning', buttons: [{ text: 'Delete', value: 'y', primary: true }, { text: 'Cancel', value: null }], owner: this.win });
            if (r === 'y') { st.connections.splice(st.connections.indexOf(c), 1); this.store.touch(); this.showHome(); }
          }],
        ]);
      });
      tiles.appendChild(tile);
    }
    this.content.appendChild(h('div', { class: 'wb-home' },
      h('div', { class: 'wb-welcome' }, 'Welcome to MySQL Workbench'),
      h('div', { class: 'wb-welcome-text' }, 'MySQL Workbench is the official graphical user interface (GUI) tool for MySQL. It allows you to design, create and browse your database schemas, work with database objects and insert data as well as design and run SQL queries to work with stored data.'),
      h('div', { class: 'wb-home-head' }, h('span', {}, 'MySQL Connections'),
        h('button', { class: 'wb-home-btn', title: 'Yeni bağlantı ekle', html: ICONS.plusConn, onclick: () => this.editConnection(null) }),
        h('button', { class: 'wb-home-btn', title: 'Bağlantıları yönet', html: ICONS.wrenchConn, onclick: () => st.connections[0] && this.editConnection(st.connections[0]) })),
      st.connections.length ? tiles : h('div', { class: 'wb-noconn' }, 'Henüz bağlantı yok. ⊕ ile "Local instance" bağlantısı ekleyin.')));
  }

  /** Setup New Connection / Manage Server Connections */
  editConnection(c) {
    const st = this.store.state;
    const isNew = !c;
    const d = c ? { ...c } : { ...defaultConnection(st), id: 'c' + Date.now(), name: '' };
    const w = this.desk.open({ title: isNew ? 'Setup New Connection' : 'Manage Server Connections', width: 620, modal: true, owner: this.win, minimizable: false });
    const f = (label, key, attrs = {}) => {
      const i = h('input', { class: 'lab-input', value: d[key] ?? '', ...attrs });
      i.oninput = () => { d[key] = attrs.type === 'number' ? Number(i.value) : i.value; };
      return h('div', { class: 'wb-form-row' }, h('label', {}, label), i);
    };
    const test = h('button', { class: 'lab-btn' }, 'Test Connection');
    test.onclick = async () => {
      const pw = await this.askPassword(d, w);
      if (pw === null) return;
      try {
        this.lab.server.connect(d.user, pw, d.host === '127.0.0.1' ? 'localhost' : d.host);
        if (!['localhost', '127.0.0.1'].includes(d.host) || Number(d.port) !== 3306) throw Object.assign(new Error(`Can't connect to MySQL server on '${d.host}:${d.port}' (10061)`), { code: 2003 });
        await this.desk.message({ title: 'MySQL Workbench', text: ['Successfully made the MySQL connection'], detail: `Information related to this connection:\n\nHost: ${d.host}\nPort: ${d.port}\nUser: ${d.user}\nSSL: enabled with TLS_AES_128_GCM_SHA256\n\nA successful MySQL connection was made with\nthe parameters defined for this connection.`, icon: 'info', owner: w });
        this.lab.events.emit('test-connection', { ok: true });
      } catch (e) {
        await this.desk.message({ title: 'Failed to Connect to MySQL at ' + `${d.host}:${d.port} with user ${d.user}`, text: [`Failed to Connect to MySQL at ${d.host}:${d.port} with user ${d.user}`], detail: e.message, icon: 'error', owner: w });
      }
    };
    w.body.appendChild(h('div', { class: 'wb-form' },
      f('Connection Name:', 'name', { placeholder: 'Type a name for the connection' }),
      h('div', { class: 'wb-form-sub' }, 'Connection Method: Standard (TCP/IP)'),
      f('Hostname:', 'host'), f('Port:', 'port', { type: 'number' }), f('Username:', 'user'),
      h('div', { class: 'wb-form-row' }, h('label', {}, 'Password:'), h('button', { class: 'lab-btn', onclick: async () => { const p = await this.askPassword(d, w, true); if (p !== null) d.password = p; } }, 'Store in Vault ...'), h('button', { class: 'lab-btn', onclick: () => { d.password = null; } }, 'Clear')),
      f('Default Schema:', 'schema', { placeholder: 'boş bırakılabilir' }),
      h('div', { class: 'wb-form-btns' }, test, h('div', { class: 'spacer' }),
        h('button', { class: 'lab-btn', onclick: () => w.close() }, 'Cancel'),
        h('button', { class: 'lab-btn primary', onclick: () => {
          if (!d.name.trim()) d.name = `${d.user}@${d.host}`;
          if (isNew) st.connections.push(d); else Object.assign(c, d);
          this.store.touch();
          w.close();
          this.showHome();
        } }, 'OK'))));
    w.center();
  }

  /** Şifre sorma penceresi. Döner: şifre ya da null */
  askPassword(c, owner, storeOnly = false) {
    if (!storeOnly && c.password != null) return Promise.resolve(c.password);
    return new Promise((resolve) => {
      let result = null;
      const w = this.desk.open({ title: storeOnly ? 'Store Password For Connection' : 'Connect to MySQL Server', width: 470, modal: true, owner: owner || this.win, minimizable: false, onClose: () => { resolve(result); return true; } });
      const pw = h('input', { class: 'lab-input', type: 'password', autocomplete: 'off' });
      const save = h('input', { type: 'checkbox' });
      const ok = () => {
        result = pw.value;
        if (save.checked || storeOnly) { c.password = pw.value; this.store.touch(); }
        w.close(true);
        resolve(result);
      };
      pw.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
      w.body.appendChild(h('div', { class: 'wb-pw' },
        h('div', { class: 'wb-pw-top' }, h('div', { class: 'wb-pw-logo', html: ICONS.workbench }), h('div', {}, 'Please enter password for the following service:')),
        h('div', { class: 'wb-pw-grid' },
          h('label', {}, 'Service:'), h('span', {}, `Mysql@${c.host}:${c.port}`),
          h('label', {}, 'User:'), h('span', {}, c.user),
          h('label', {}, 'Password:'), pw,
          h('span', {}), h('label', { class: 'wb-pw-save' }, save, ' Save password in vault')),
        h('div', { class: 'lab-msg-btns' }, h('button', { class: 'lab-btn primary', onclick: ok }, 'OK'), h('button', { class: 'lab-btn', onclick: () => w.close() }, 'Cancel'))));
      w.center();
      setTimeout(() => pw.focus(), 0);
    });
  }

  async connect(c) {
    const existing = this.conns.find((x) => x.conn === c);
    if (existing) { this.showConn(existing); return; }
    const pw = await this.askPassword(c);
    if (pw === null) return;
    let session;
    try {
      if (!['localhost', '127.0.0.1'].includes(c.host) || Number(c.port) !== 3306) throw Object.assign(new Error(`Can't connect to MySQL server on '${c.host}:${c.port}' (10061)`), { code: 2003 });
      session = this.lab.server.connect(c.user, pw, 'localhost');
    } catch (e) {
      if (c.password != null && e.code === 1045) { c.password = null; this.store.touch(); }
      await this.desk.message({
        title: 'MySQL Workbench', icon: 'error', owner: this.win,
        text: [h('b', {}, 'Cannot Connect to Database Server')],
        detail: `Your connection attempt failed for user '${c.user}' to the MySQL server at ${c.host}:${c.port}:\n  ${e.message}\n\nPlease:\n1 Check that MySQL is running on address ${c.host}\n2 Check that MySQL is reachable on port ${c.port} (note: 3306 is the default, but this can be changed)\n3 Check the user ${c.user} has rights to connect to ${c.host} from your address (MySQL rights define what clients can connect to the server and from which machines)\n4 Make sure you are both providing a password if needed and using the correct password for ${c.host} connecting from the host address you're connecting from`,
        buttons: ['Close'], width: 560,
      });
      this.lab.events.emit('connect', { ok: false, error: e });
      return;
    }
    session.safeUpdates = !!this.store.state.prefs.safeUpdates;
    if (c.schema && this.lab.server.hasDb(c.schema)) { try { session.use(c.schema); } catch { /* yok */ } }
    const conn = new WbConnection(this, c, session);
    this.conns.push(conn);
    this.showConn(conn);
    this.lab.events.emit('connect', { ok: true, connection: c, session });
  }

  showConn(c) {
    this.active = c;
    this.renderTabs();
    this.content.innerHTML = '';
    this.content.appendChild(c.el);
    c.activate();
  }

  async closeConn(c) {
    if (!(await c.confirmClose())) return;
    c.dispose();
    this.conns.splice(this.conns.indexOf(c), 1);
    if (this.active === c) this.showHome(); else this.renderTabs();
  }
}

// ---------------------------------------------------------------- bağlantı sekmesi

export class WbConnection {
  constructor(wb, conn, session) {
    this.wb = wb;
    this.lab = wb.lab;
    this.desk = wb.desk;
    this.store = wb.store;
    this.win = wb.win;
    this.conn = conn;
    this.session = session;
    this.prefs = this.store.state.prefs;
    this.tabs = [];
    this.current = null;
    this.queryCount = 0;
    this.expanded = new Set();
    this.outputRows = [];
    this.navMode = 'schemas';
    this.selected = null;
    this.build();
    const drafts = this.store.state.queryTabs?.[conn.id];
    if (drafts && Object.keys(drafts).length) {
      for (const [title, text] of Object.entries(drafts)) this.openQuery({ title, text });
      this.queryCount = this.tabs.length;
    } else this.openQuery({});
    this.unsub = this.store.on((ev) => { if ((ev.type === 'change' && ev.schema) || ev.type === 'drop' || ev.type === 'reload') this.refreshTree(); });
  }

  dispose() {
    this.unsub?.();
    for (const t of this.tabs) t.editor?.dispose?.();
  }

  async confirmClose() {
    const dirty = this.tabs.filter((t) => t instanceof QueryTab && t.dirty && t.file);
    if (!dirty.length) return true;
    const r = await this.desk.message({ title: 'Close SQL Tab', text: 'Kaydedilmemiş değişiklikler var. Yine de kapatılsın mı?', icon: 'warning', buttons: [{ text: 'Kapat', value: 'y' }, { text: 'İptal', value: null, primary: true }], owner: this.win });
    return r === 'y';
  }

  nextQueryTitle() { return `Query ${++this.queryCount}`; }

  build() {
    const m = (label, items) => menuButton(label, items);
    const menubar = h('div', { class: 'lab-menubar wb-menubar' },
      m('File', () => [
        ['New Model\tCtrl+N', () => newModel(this)],
        ['New Query Tab\tCtrl+T', () => this.openQuery({})],
        ['Open SQL Script...\tCtrl+Shift+O', () => this.queryTab()?.openFile() || this.openQuery({}).openFile()],
        ['Save Script\tCtrl+S', () => this.queryTab()?.save(), { disabled: !this.queryTab() }],
        ['Save Script As...\tCtrl+Shift+S', () => this.queryTab()?.save(true), { disabled: !this.queryTab() }],
        null,
        ['Close Tab\tCtrl+W', () => this.current && this.closeTab(this.current)],
        ['Close Connection Tab', () => this.wb.closeConn(this)],
        null,
        ['Exit\tAlt+F4', () => this.win.close()],
      ]),
      m('Edit', () => [
        ['Select All\tCtrl+A', () => document.execCommand('selectAll')],
        null,
        ['Format', [['Beautify Query', () => this.queryTab()?.beautify()]]],
        null,
        ['Preferences...', () => openAdminPage(this, 'prefs')],
      ]),
      m('View', () => [
        ['Home', () => this.wb.showHome()],
        null,
        ['Panels', [['Hide Sidebar', () => this.el.classList.toggle('nosidebar'), { checked: this.el.classList.contains('nosidebar') }], ['Hide Output Area', () => this.el.classList.toggle('nooutput'), { checked: this.el.classList.contains('nooutput') }]]],
        ['Output', () => this.el.classList.remove('nooutput')],
      ]),
      m('Query', () => [
        ['Execute (All or Selection)\tCtrl+Shift+Enter', () => this.queryTab()?.run('all'), { disabled: !this.queryTab() }],
        ['Execute Current Statement\tCtrl+Enter', () => this.queryTab()?.run('current'), { disabled: !this.queryTab() }],
        null,
        ['Reconnect to Server', () => this.reconnect()],
        ['New Tab to Current Server\tCtrl+T', () => this.openQuery({})],
        null,
        ['Commit Transaction', () => this.runSql('COMMIT')],
        ['Rollback Transaction', () => this.runSql('ROLLBACK')],
        ['Auto-Commit Transactions', () => this.runSql(this.session.inTx ? 'COMMIT' : 'SET autocommit = 0'), { checked: !this.session.inTx }],
        null,
        ['Stop Script Execution on Errors', () => { this.prefs.stopOnError = !this.prefs.stopOnError; this.store.touch(); }, { checked: this.prefs.stopOnError }],
      ]),
      m('Database', () => [
        ['Connect to Database...', () => this.wb.showHome()],
        ['Manage Connections...', () => this.wb.editConnection(this.conn)],
        null,
        ['Reverse Engineer...\tCtrl+R', () => reverseEngineer(this)],
        ['Forward Engineer...\tCtrl+G', () => forwardEngineer(this), { disabled: !this.tabs.some((t) => t.eerDb) }],
        ['Synchronize Model...\tCtrl+Shift+Z', () => synchronizeModel(this), { disabled: !this.tabs.some((t) => t.eerDb) }],
      ]),
      m('Server', () => [
        ['Server Status', () => openAdminPage(this, 'status')],
        ['Client Connections', () => openAdminPage(this, 'connections')],
        ['Users and Privileges', () => openAdminPage(this, 'users')],
        ['Status and System Variables', () => openAdminPage(this, 'variables')],
        ['Data Export', () => openAdminPage(this, 'export')],
        ['Data Import', () => openAdminPage(this, 'import')],
        null,
        ['Startup/Shutdown', () => openAdminPage(this, 'startup')],
        ['Server Logs', () => openAdminPage(this, 'logs')],
        ['Options File', () => openAdminPage(this, 'options')],
      ]),
      m('Tools', () => [['Utilities', [['Start Shell for MySQL Utilities', null, { disabled: true }]]]]),
      m('Scripting', () => [['Scripting Shell...', null, { disabled: true }]]),
      m('Help', () => [['About Workbench', () => this.desk.message({ title: 'About MySQL Workbench', text: [`MySQL Workbench Community (GPL) for Windows version ${workbenchVersion(this.store)} CE build (64 bits)`, 'Bu, ders için hazırlanmış bir simülasyondur.'], icon: 'info', owner: this.win })]]),
    );
    const tool = (icon, title, fn) => h('button', { class: 'wb-tool big', title, html: ICONS[icon], onclick: fn });
    const toolbar = h('div', { class: 'wb-toolbar' },
      tool('sqlNew', 'Create a new SQL tab for executing queries', () => this.openQuery({})),
      tool('open', 'Open a SQL script file in a new query tab', () => this.openQuery({}).openFile()),
      h('span', { class: 'wb-sep' }),
      tool('info', 'Open inspector for the selected object', () => this.inspect()),
      tool('schemaNew', 'Create a new schema in the connected server', () => this.openSchemaEditor(null)),
      tool('tableNew', 'Create a new table in the active schema in connected server', () => this.openTableEditor(this.session.db, null)),
      h('span', { class: 'wb-sep' }),
      tool('refresh', 'Reconnect to DBMS', () => this.reconnect()));
    // Navigator
    this.tree = h('div', { class: 'wb-tree' });
    this.filterIn = h('input', { class: 'wb-tree-filter', placeholder: 'Filter objects' });
    this.filterIn.oninput = () => this.renderTree();
    this.navBody = h('div', { class: 'wb-nav-body' });
    this.navTabs = h('div', { class: 'wb-nav-tabs' });
    this.info = h('div', { class: 'wb-info-body' });
    this.infoTabs = h('div', { class: 'wb-nav-tabs' });
    const nav = h('div', { class: 'wb-nav' },
      h('div', { class: 'wb-panel-head' }, 'Navigator'), this.navBody, this.navTabs,
      h('div', { class: 'wb-panel-head' }, 'Information'), this.info, this.infoTabs);
    // ana alan
    this.etabs = h('div', { class: 'wb-etabs' });
    this.ebody = h('div', { class: 'wb-ebody' });
    this.outBody = h('tbody');
    const output = h('div', { class: 'wb-output' },
      h('div', { class: 'wb-panel-head' }, 'Output', h('div', { class: 'spacer' }), h('button', { class: 'wb-mini', title: 'Clear', onclick: () => { this.outputRows = []; this.outBody.innerHTML = ''; } }, 'Clear')),
      h('div', { class: 'wb-out-sel' }, 'Action Output'),
      h('div', { class: 'wb-out-scroll' }, h('table', { class: 'wb-out' }, h('thead', {}, h('tr', {}, h('th', {}), h('th', {}, '#'), h('th', {}, 'Time'), h('th', {}, 'Action'), h('th', {}, 'Message'), h('th', {}, 'Duration / Fetch'))), this.outBody)));
    const vsplit = h('div', { class: 'wb-vsplit' });
    const osplit = h('div', { class: 'wb-hsplit' });
    const main = h('div', { class: 'wb-main' }, this.etabs, this.ebody, osplit, output);
    this.el = h('div', { class: 'wb-conn' }, menubar, toolbar, h('div', { class: 'wb-split' }, nav, vsplit, main));
    this.dragSplit(vsplit, nav, 'x');
    this.dragSplit(osplit, output, 'y', true);
    this.el.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key.toLowerCase() === 't') { e.preventDefault(); this.openQuery({}); }
      if (e.ctrlKey && e.key.toLowerCase() === 's') { e.preventDefault(); this.queryTab()?.save(e.shiftKey); }
      if (e.ctrlKey && e.key.toLowerCase() === 'w') { e.preventDefault(); if (this.current) this.closeTab(this.current); }
    });
    this.renderNav();
    this.renderInfo('session');
  }

  dragSplit(bar, target, axis, invert = false) {
    bar.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const start = axis === 'x' ? e.clientX : e.clientY;
      const r = target.getBoundingClientRect();
      const s0 = axis === 'x' ? r.width : r.height;
      const move = (ev) => {
        const d = (axis === 'x' ? ev.clientX : ev.clientY) - start;
        const v = Math.max(80, s0 + (invert ? -d : d));
        target.style.flex = `0 0 ${v}px`;
        this.queryTab()?.editor?.layout();
      };
      const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    });
  }

  activate() {
    this.refreshTree();
    setTimeout(() => this.current?.focus?.(), 0);
  }

  queryTab() { return this.current instanceof QueryTab ? this.current : null; }

  // ---- düzenleyici sekmeleri

  addTab(tab) {
    this.tabs.push(tab);
    this.showTab(tab);
    return tab;
  }

  openQuery(opts) {
    return this.addTab(new QueryTab(this, opts));
  }

  showTab(tab) {
    this.current = tab;
    this.ebody.innerHTML = '';
    if (tab) this.ebody.appendChild(tab.el);
    this.renderTabs();
    setTimeout(() => tab?.focus?.(), 0);
  }

  async closeTab(tab) {
    if (tab instanceof QueryTab && tab.dirty && tab.file) {
      const r = await this.desk.message({ title: 'Close SQL Tab', text: `SQL script ${tab.title} has unsaved changes.\nWould you like to Save these changes before closing?`, icon: 'question', buttons: [{ text: 'Save', value: 'save', primary: true }, { text: "Don't Save", value: 'no' }, { text: 'Cancel', value: null }], owner: this.win });
      if (r === null) return;
      if (r === 'save' && !(await tab.save())) return;
    }
    if (tab.confirmClose && !(await tab.confirmClose())) return;
    const i = this.tabs.indexOf(tab);
    this.tabs.splice(i, 1);
    tab.editor?.dispose?.();
    if (tab instanceof QueryTab) {
      const drafts = this.store.state.queryTabs?.[this.conn.id];
      if (drafts) { delete drafts[tab.title]; this.store.touch(); }
    }
    if (this.current === tab) this.showTab(this.tabs[Math.max(0, i - 1)] || null);
    else this.renderTabs();
  }

  renderTabs() {
    this.etabs.innerHTML = '';
    for (const t of this.tabs) {
      const el = h('div', { class: 'wb-etab' + (t === this.current ? ' active' : '') },
        h('span', { class: 'wb-etab-ico', html: t.icon || ICONS.sqlfile }),
        h('span', { onclick: () => this.showTab(t) }, (t.dirty && t.file ? '*' : '') + t.title),
        h('button', { class: 'wb-tabx', onclick: (e) => { e.stopPropagation(); this.closeTab(t); } }, '×'));
      el.addEventListener('mousedown', (e) => { if (e.button === 1) { e.preventDefault(); this.closeTab(t); } });
      this.etabs.appendChild(el);
    }
  }

  // ---- çıktı

  output(ok, action, message, ms, warn = false) {
    const n = this.outputRows.length + 1;
    const time = new Date().toLocaleTimeString('en-GB');
    const dur = `${(ms / 1000).toFixed(3)} sec`;
    const fetch = /row\(s\) returned/.test(message) ? ` / 0.000 sec` : '';
    this.outputRows.push({ ok, action, message });
    const tr = h('tr', { class: ok ? '' : 'err' }, h('td', { html: ok ? (warn ? ICONS.warn : ICONS.ok) : ICONS.fail }), h('td', {}, String(n)), h('td', {}, time), h('td', { title: action }, action.length > 160 ? action.slice(0, 160) + '…' : action), h('td', { title: message }, message), h('td', {}, dur + fetch));
    this.outBody.appendChild(tr);
    tr.scrollIntoView({ block: 'nearest' });
  }

  runSql(sql) {
    const results = this.session.execute(sql, { stopOnError: true });
    let schema = false;
    for (const r of results) {
      this.output(r.ok, r.sql.replace(/\s+/g, ' '), r.message, r.ms);
      if (r.schema) schema = true;
      if (r.useDb) this.setDefaultSchema(r.useDb, false);
      this.lab.events.emit('query', { sql: r.sql, result: r, session: this.session, connection: this.conn });
    }
    if (schema) this.refreshTree();
    return results;
  }

  /** Değişiklik betiği: inceleme penceresi + çalıştırma */
  async applyScript(sql, opts = {}) {
    return applyScriptWizard(this.desk, this.win, {
      sql,
      description: opts.description,
      run: (text) => {
        const results = this.session.execute(text, { stopOnError: true });
        let schema = false;
        for (const r of results) {
          this.output(r.ok, r.sql.replace(/\s+/g, ' '), r.message, r.ms);
          if (r.schema) schema = true;
          this.lab.events.emit('query', { sql: r.sql, result: r, session: this.session, connection: this.conn });
        }
        if (schema) this.refreshTree();
        return results;
      },
    });
  }

  reconnect() {
    try {
      const pw = this.session.account.password;
      const s = this.lab.server.connect(this.conn.user, pw, 'localhost');
      s.safeUpdates = !!this.prefs.safeUpdates;
      const db = this.session.db;
      if (db && this.lab.server.hasDb(db)) s.use(db);
      this.session = s;
      this.output(true, 'Reconnect', 'Connected to server', 0);
    } catch (e) {
      this.output(false, 'Reconnect', `Error Code: ${e.code}. ${e.message}`, 0);
    }
    this.refreshTree();
  }

  setDefaultSchema(name, run = true) {
    if (run) {
      this.runSql(`USE ${bq(name)}`);
      return;
    }
    this.renderTree();
    this.renderInfo();
  }

  // ---- Navigator

  renderNav() {
    this.navTabs.innerHTML = '';
    for (const [id, label] of [['admin', 'Administration'], ['schemas', 'Schemas']]) {
      this.navTabs.appendChild(h('button', { class: 'wb-nav-tab' + (this.navMode === id ? ' active' : ''), onclick: () => { this.navMode = id; this.renderNav(); } }, label));
    }
    this.navBody.innerHTML = '';
    if (this.navMode === 'admin') {
      const item = (icon, label, page) => h('div', { class: 'wb-admin-item', onclick: () => openAdminPage(this, page) }, h('span', { html: ICONS[icon] }), label);
      this.navBody.append(h('div', { class: 'wb-admin' },
        h('div', { class: 'wb-admin-head' }, 'MANAGEMENT'),
        item('status', 'Server Status', 'status'), item('conns', 'Client Connections', 'connections'), item('user', 'Users and Privileges', 'users'),
        item('vars', 'Status and System Variables', 'variables'), item('exportIco', 'Data Export', 'export'), item('importIco', 'Data Import/Restore', 'import'),
        h('div', { class: 'wb-admin-head' }, 'INSTANCE'),
        item('power', 'Startup / Shutdown', 'startup'), item('logs', 'Server Logs', 'logs'), item('options', 'Options File', 'options'),
        h('div', { class: 'wb-admin-head' }, 'PERFORMANCE'),
        item('status', 'Dashboard', 'perf'), item('vars', 'Performance Reports', 'perf'), item('options', 'Performance Schema Setup', 'perf')));
    } else {
      const head = h('div', { class: 'wb-tree-head' }, h('span', {}, 'SCHEMAS'), h('div', { class: 'spacer' }), h('button', { class: 'wb-mini', title: 'Refresh All', html: ICONS.refresh, onclick: () => this.refreshTree() }));
      this.navBody.append(head, this.filterIn, this.tree);
      this.renderTree();
    }
  }

  refreshTree() {
    if (this.navMode === 'schemas') this.renderTree();
    this.renderInfo();
  }

  renderTree() {
    const server = this.lab.server;
    const q = this.filterIn.value.trim().toLowerCase();
    this.tree.innerHTML = '';
    if (!server.running) {
      this.tree.appendChild(h('div', { class: 'wb-tree-msg' }, 'Sunucu çalışmıyor. Administration > Startup / Shutdown ile başlatın.'));
      return;
    }
    const names = server.databaseNames().filter((d) => server.canSeeDb(this.session.account, d));
    if (this.session.account.grants.some((g) => g.db === '*')) names.push('sys');
    names.sort();
    for (const db of names) {
      const ctx = server.getDb(db);
      const tables = ctx ? Object.keys(ctx.meta.tables).filter((t) => !ctx.meta.tables[t].temporary).sort() : [];
      const views = ctx ? Object.keys(ctx.meta.views).sort() : [];
      if (q && !db.includes(q) && !tables.some((t) => t.includes(q))) continue;
      const key = 'db:' + db;
      const isDefault = this.session.db === db;
      const dbNode = this.node(0, ICONS.db, db, key, { bold: isDefault, kind: 'schema', db, hover: [['info', 'Schema Inspector', () => this.inspect({ kind: 'schema', db })], ['wrench', 'Alter Schema', () => this.openSchemaEditor(db)]] });
      this.tree.appendChild(dbNode);
      if (!this.expanded.has(key) && !q) continue;
      const tkey = key + ':tables';
      this.tree.appendChild(this.node(1, ICONS.folder, 'Tables', tkey, { kind: 'tables', db }));
      if (this.expanded.has(tkey) || q) {
        for (const t of tables.filter((x) => !q || x.includes(q) || db.includes(q))) {
          const k = `${tkey}:${t}`;
          this.tree.appendChild(this.node(2, ICONS.table, t, k, { kind: 'table', db, table: t, hover: [['info', 'Table Inspector', () => this.inspect({ kind: 'table', db, table: t })], ['wrench', 'Alter Table', () => this.openTableEditor(db, t)], ['grid', 'Select Rows - Limit 1000', () => this.selectRows(db, t)]] }));
          if (!this.expanded.has(k)) continue;
          const m = ctx.meta.tables[t];
          const ckey = k + ':cols';
          this.tree.appendChild(this.node(3, ICONS.folder, 'Columns', ckey, { kind: 'columns', db, table: t }));
          if (this.expanded.has(ckey)) {
            for (const c of m.columns) this.tree.appendChild(this.node(4, m.pk.some((x) => x.toLowerCase() === c.name.toLowerCase()) ? ICONS.key : ICONS.column, c.name, null, { kind: 'column', db, table: t, column: c.name, leaf: true }));
          }
          const ikey = k + ':idx';
          this.tree.appendChild(this.node(3, ICONS.folder, 'Indexes', ikey, { kind: 'indexes', db, table: t }));
          if (this.expanded.has(ikey)) {
            if (m.pk.length) this.tree.appendChild(this.node(4, ICONS.key, 'PRIMARY', null, { leaf: true }));
            for (const u of [...m.uniques, ...m.indexes]) this.tree.appendChild(this.node(4, ICONS.column, u.name, null, { leaf: true }));
          }
          const fkey = k + ':fk';
          this.tree.appendChild(this.node(3, ICONS.folder, 'Foreign Keys', fkey, { kind: 'fks', db, table: t }));
          if (this.expanded.has(fkey)) for (const f of m.fks) this.tree.appendChild(this.node(4, ICONS.key, f.name, null, { leaf: true }));
          const gkey = k + ':trg';
          this.tree.appendChild(this.node(3, ICONS.folder, 'Triggers', gkey, { kind: 'triggers', db, table: t }));
          if (this.expanded.has(gkey)) {
            for (const tg of Object.values(ctx.meta.triggers || {}).filter((x) => x.table === t)) {
              this.tree.appendChild(this.node(4, ICONS.column, tg.name, null, { kind: 'trigger', db, table: t, name: tg.name, leaf: true }));
            }
          }
        }
      }
      const vkey = key + ':views';
      this.tree.appendChild(this.node(1, ICONS.folder, 'Views', vkey, { kind: 'views', db }));
      if (this.expanded.has(vkey)) for (const v of views) this.tree.appendChild(this.node(2, ICONS.view, v, null, { kind: 'view', db, table: v, leaf: true, hover: [['grid', 'Select Rows - Limit 1000', () => this.selectRows(db, v)]] }));
      const pkey = key + ':procs';
      this.tree.appendChild(this.node(1, ICONS.folder, 'Stored Procedures', pkey, { kind: 'procs', db }));
      if (this.expanded.has(pkey)) {
        for (const r of Object.values(ctx?.meta.procedures || {}).sort((a, b) => a.name.localeCompare(b.name))) {
          this.tree.appendChild(this.node(2, ICONS.column, r.name, null, { kind: 'procedure', db, name: r.name, leaf: true, hover: [['wrench', 'Alter Stored Procedure', () => this.openRoutine(db, 'procedure', r.name)], ['grid', 'Execute', () => this.callRoutine(db, r)]] }));
        }
      }
      const fkey2 = key + ':funcs';
      this.tree.appendChild(this.node(1, ICONS.folder, 'Functions', fkey2, { kind: 'funcs', db }));
      if (this.expanded.has(fkey2)) {
        for (const r of Object.values(ctx?.meta.functions || {}).sort((a, b) => a.name.localeCompare(b.name))) {
          this.tree.appendChild(this.node(2, ICONS.column, r.name, null, { kind: 'function', db, name: r.name, leaf: true, hover: [['wrench', 'Alter Function', () => this.openRoutine(db, 'function', r.name)]] }));
        }
      }
    }
  }

  node(level, icon, label, key, o = {}) {
    const open = key && this.expanded.has(key);
    const arrow = h('span', { class: 'wb-tree-arrow' }, o.leaf || !key ? '' : open ? '▾' : '▸');
    const hover = h('span', { class: 'wb-tree-hover' }, ...(o.hover || []).map(([ic, title, fn]) => h('button', { class: 'wb-mini', title, html: ICONS[ic], onclick: (e) => { e.stopPropagation(); fn(); } })));
    const el = h('div', { class: 'wb-tree-node' + (o.bold ? ' bold' : '') + (this.selected && this.selected.key === (key || label + level) ? ' sel' : ''), style: { paddingLeft: 4 + level * 14 + 'px' } },
      arrow, h('span', { class: 'wb-tree-ico', html: icon }), h('span', { class: 'wb-tree-label' }, label), hover);
    const toggle = () => { if (!key || o.leaf) return; if (open) this.expanded.delete(key); else this.expanded.add(key); this.renderTree(); };
    arrow.addEventListener('click', (e) => { e.stopPropagation(); toggle(); });
    el.addEventListener('click', () => {
      this.selected = { ...o, key: key || label + level };
      this.tree.querySelectorAll('.sel').forEach((x) => x.classList.remove('sel'));
      el.classList.add('sel');
      this.renderInfo('object');
    });
    el.addEventListener('dblclick', () => {
      if (o.kind === 'schema') this.setDefaultSchema(o.db);
      else if (o.kind === 'table' || o.kind === 'column') this.queryTab()?.editor?.insert(o.kind === 'table' ? o.table : o.column);
      else toggle();
    });
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      el.click();
      const items = this.contextItems(o);
      if (items.length) showMenu(e.clientX, e.clientY, items);
    });
    return el;
  }

  contextItems(o) {
    const refresh = ['Refresh All', () => this.refreshTree()];
    const createSchema = ['Create Schema...', () => this.openSchemaEditor(null)];
    if (o.kind === 'schema') {
      return [
        ['Set as Default Schema', () => this.setDefaultSchema(o.db)],
        ['Filter to This Schema', () => { this.filterIn.value = o.db; this.renderTree(); }],
        null,
        ['Schema Inspector', () => this.inspect(o)],
        ['Copy to Clipboard', [['Name', () => navigator.clipboard?.writeText(o.db)], ['Create Statement', () => navigator.clipboard?.writeText(this.lab.server.getDb(o.db) ? this.session.showCreateDatabase(this.lab.server.getDb(o.db)) : '')]]],
        ['Send to SQL Editor', [['Name', () => this.queryTab()?.editor.insert(bq(o.db))], ['Create Statement', () => this.queryTab()?.editor.insert(this.session.showCreateDatabase(this.lab.server.getDb(o.db)) + ';\n')]]],
        null,
        createSchema,
        ['Alter Schema...', () => this.openSchemaEditor(o.db)],
        ['Drop Schema...', () => this.dropObject('schema', o.db)],
        null,
        ['Create Table...', () => this.openTableEditor(o.db, null)],
        null,
        refresh,
      ];
    }
    if (o.kind === 'tables') return [['Create Table...', () => this.openTableEditor(o.db, null)], null, refresh];
    if (o.kind === 'views') return [['Create View...', () => this.openQuery({ text: `CREATE VIEW \`${o.db}\`.\`new_view\` AS\nSELECT ...;\n` })], null, refresh];
    if (o.kind === 'table') {
      const ctx = this.lab.server.getDb(o.db);
      const m = ctx?.meta.tables[o.table];
      const t = `${bq(o.db)}.${bq(o.table)}`;
      const cols = m ? m.columns.map((c) => bq(c.name)) : [];
      const stm = {
        'Name (short)': bq(o.table),
        'Name (long)': t,
        'Select All Statement': `SELECT ${cols.join(',\n    ')}\nFROM ${t};\n`,
        'Insert Statement': `INSERT INTO ${t}\n(${cols.join(',\n')})\nVALUES\n(${cols.map((c) => '<{' + c.replace(/`/g, '') + ': }>').join(',\n')});\n`,
        'Update Statement': `UPDATE ${t}\nSET\n${cols.map((c) => `${c} = <{${c.replace(/`/g, '')}: }>`).join(',\n')}\nWHERE ${m?.pk.map((p) => `${bq(p)} = <{expr}>`).join(' AND ') || '<{where_expression}>'};\n`,
        'Delete Statement': `DELETE FROM ${t}\nWHERE ${m?.pk.map((p) => `${bq(p)} = <{expr}>`).join(' AND ') || '<{where_expression}>'};\n`,
        'Create Statement': ctx ? this.session.showCreateTable(ctx, o.table) + ';\n' : '',
      };
      const sub = (fn) => Object.entries(stm).map(([k, v]) => [k, () => fn(v)]);
      return [
        ['Select Rows - Limit 1000', () => this.selectRows(o.db, o.table)],
        ['Table Inspector', () => this.inspect(o)],
        ['Copy to Clipboard', sub((v) => navigator.clipboard?.writeText(v))],
        ['Send to SQL Editor', sub((v) => this.queryTab()?.editor.insert(v))],
        null,
        ['Create Table...', () => this.openTableEditor(o.db, null)],
        ['Create Table Like...', () => this.openQuery({ text: `CREATE TABLE \`${o.db}\`.\`${o.table}_kopya\` LIKE ${t};\n` })],
        ['Alter Table...', () => this.openTableEditor(o.db, o.table)],
        null,
        ['Drop Table...', () => this.dropObject('table', o.db, o.table)],
        ['Truncate Table...', () => this.dropObject('truncate', o.db, o.table)],
        null,
        refresh,
      ];
    }
    if (o.kind === 'procs') return [['Create Stored Procedure...', () => this.openRoutine(o.db, 'procedure', null)], null, refresh];
    if (o.kind === 'funcs') return [['Create Function...', () => this.openRoutine(o.db, 'function', null)], null, refresh];
    if (o.kind === 'triggers') return [['Create Trigger...', () => this.openRoutine(o.db, 'trigger', null, { table: o.table })], null, refresh];
    if (o.kind === 'procedure' || o.kind === 'function') {
      const ctx = this.lab.server.getDb(o.db);
      const r = (o.kind === 'procedure' ? ctx?.meta.procedures : ctx?.meta.functions)?.[o.name.toLowerCase()];
      const label = o.kind === 'procedure' ? 'Stored Procedure' : 'Function';
      return [
        ...(o.kind === 'procedure' ? [['Execute Stored Procedure...', () => this.callRoutine(o.db, r)], null] : []),
        ['Copy to Clipboard', [['Name', () => navigator.clipboard?.writeText(o.name)], ['Create Statement', () => navigator.clipboard?.writeText(r ? this.session.routineCreateSql(r) : '')]]],
        ['Send to SQL Editor', [['Name', () => this.queryTab()?.editor.insert(bq(o.name))], ['Create Statement', () => this.queryTab()?.editor.insert(r ? 'DELIMITER $$\n' + this.session.routineCreateSql(r) + '$$\nDELIMITER ;\n' : '')]]],
        null,
        [`Create ${label}...`, () => this.openRoutine(o.db, o.kind, null)],
        [`Alter ${label}...`, () => this.openRoutine(o.db, o.kind, o.name)],
        [`Drop ${label}...`, () => this.dropObject(o.kind, o.db, o.name)],
        null,
        refresh,
      ];
    }
    if (o.kind === 'trigger') return [['Alter Trigger...', () => this.openRoutine(o.db, 'trigger', o.name)], ['Drop Trigger...', () => this.dropObject('trigger', o.db, o.name)], null, refresh];
    if (o.kind === 'view') return [['Select Rows - Limit 1000', () => this.selectRows(o.db, o.table)], null, ['Drop View...', () => this.dropObject('view', o.db, o.table)], null, refresh];
    return [createSchema, refresh];
  }

  async dropObject(kind, db, table) {
    const what = { schema: ['Drop Schema', `Please confirm permanent deletion of schema '${db}' and all its objects.`, `DROP DATABASE ${bq(db)};`],
      table: ['Drop Table', `Please confirm permanent deletion of table '${table}' and its data.`, `DROP TABLE ${bq(db)}.${bq(table)};`],
      view: ['Drop View', `Please confirm permanent deletion of view '${table}'.`, `DROP VIEW ${bq(db)}.${bq(table)};`],
      truncate: ['Truncate Table', `Please confirm permanent deletion of all data in table '${table}'.`, `TRUNCATE ${bq(db)}.${bq(table)};`],
      procedure: ['Drop Stored Procedure', `Please confirm permanent deletion of stored procedure '${table}'.`, `DROP PROCEDURE ${bq(db)}.${bq(table)};`],
      function: ['Drop Function', `Please confirm permanent deletion of function '${table}'.`, `DROP FUNCTION ${bq(db)}.${bq(table)};`],
      trigger: ['Drop Trigger', `Please confirm permanent deletion of trigger '${table}'.`, `DROP TRIGGER ${bq(db)}.${bq(table)};`] }[kind];
    const r = await this.desk.message({ title: what[0], text: [h('b', {}, `${what[0]} '${table || db}'`), what[1]], icon: 'warning', owner: this.win,
      buttons: [{ text: 'Review SQL', value: 'review' }, { text: kind === 'truncate' ? 'Truncate' : 'Drop Now', value: 'now', primary: true }, { text: 'Cancel', value: null }] });
    if (r === 'review') await this.applyScript(what[2]);
    else if (r === 'now') {
      const res = this.runSql(what[2]);
      if (!res[0]?.ok) await this.desk.message({ title: what[0], text: res[0].message, icon: 'error', owner: this.win });
    }
  }

  selectRows(db, table) {
    const tab = this.openQuery({ title: table, text: `SELECT * FROM ${db}.${table};\n` });
    const wait = () => (tab.editor ? tab.run('all') : setTimeout(wait, 30));
    wait();
  }

  openTableEditor(db, table) {
    if (!db) {
      this.desk.message({ title: 'MySQL Workbench', text: 'Please select a schema first (Set as Default Schema).', detail: 'Tablo oluşturmak için önce Navigator\'da bir şemaya çift tıklayarak varsayılan şema yapın ya da şemaya sağ tıklayıp "Create Table..." seçin.', icon: 'warning', owner: this.win });
      return;
    }
    const existing = this.tabs.find((t) => t instanceof TableEditor && t.db === db && t.origName === table && table);
    if (existing) { this.showTab(existing); return; }
    this.addTab(new TableEditor(this, db, table));
  }

  openRoutine(db, kind, name, opts = {}) {
    const existing = name && this.tabs.find((t) => t instanceof RoutineEditor && t.db === db && t.kind === kind && t.origName === name);
    if (existing) { this.showTab(existing); return; }
    this.addTab(new RoutineEditor(this, db, kind, name, opts));
  }

  /** Execute Stored Procedure: parametreler için CALL betiği açar (Workbench gibi) */
  callRoutine(db, r) {
    if (!r) return;
    const outs = r.params.filter((p) => p.mode !== 'IN');
    const args = r.params.map((p) => (p.mode === 'IN' ? `<{${p.name} ${p.typeText}}>` : `@${p.name}`));
    let text = `set ${outs.length ? outs.map((p) => `@${p.name} = ${p.mode === 'INOUT' ? `<{${p.name} ${p.typeText}}>` : '0'}`).join(', ') : '@dummy = 0'};\ncall ${bq(db)}.${bq(r.name)}(${args.join(', ')});\n`;
    if (outs.length) text += `select ${outs.map((p) => '@' + p.name).join(', ')};\n`;
    if (!r.params.length) {
      const tab = this.openQuery({ title: `call ${r.name}`, text: `call ${bq(db)}.${bq(r.name)}();\n` });
      const wait = () => (tab.editor ? tab.run('all') : setTimeout(wait, 30));
      wait();
      return;
    }
    this.openQuery({ title: `call ${r.name}`, text });
  }

  openSchemaEditor(db) {
    this.addTab(new SchemaEditor(this, db));
  }

  inspect(o = this.selected) {
    if (!o || !o.db) return;
    openAdminPage(this, 'inspector', o);
  }

  renderInfo(mode) {
    if (mode) this.infoMode = mode;
    mode = this.infoMode || 'session';
    this.infoTabs.innerHTML = '';
    for (const [id, label] of [['object', 'Object Info'], ['session', 'Session']]) {
      this.infoTabs.appendChild(h('button', { class: 'wb-nav-tab' + (mode === id ? ' active' : ''), onclick: () => this.renderInfo(id) }, label));
    }
    this.info.innerHTML = '';
    if (mode === 'session') {
      const s = this.session;
      const rows = [['Connection:', this.conn.name], ['Host:', this.conn.host], ['Socket:', 'MySQL'], ['Port:', String(this.conn.port)], ['Version:', `${this.lab.server.version}\nMySQL Community Server - GPL`], ['Compiled For:', 'Win64 (x86_64)'], ['Login User:', s.user], ['Current User:', `${s.user}@${s.host}`], ['SSL:', 'enabled with TLS_AES_128_GCM_SHA256']];
      this.info.appendChild(h('div', { class: 'wb-info-grid' }, ...rows.flatMap(([a, b]) => [h('span', {}, a), h('span', {}, b)])));
      return;
    }
    const o = this.selected;
    if (!o || !o.db) { this.info.appendChild(h('div', { class: 'muted' }, 'No object selected')); return; }
    const ctx = this.lab.server.getDb(o.db);
    if (o.kind === 'schema' || !o.table) { this.info.appendChild(h('div', {}, h('b', {}, 'Schema: '), o.db)); return; }
    const m = ctx?.meta.tables[o.table];
    if (!m) { this.info.appendChild(h('div', {}, h('b', {}, 'View: '), o.table)); return; }
    this.info.appendChild(h('div', {}, h('b', {}, 'Table: '), m.name));
    this.info.appendChild(h('div', { class: 'wb-info-sub' }, 'Columns:'));
    const grid = h('div', { class: 'wb-info-cols' });
    for (const c of m.columns) {
      const flags = [c.autoInc ? 'AI' : '', m.pk.some((x) => x.toLowerCase() === c.name.toLowerCase()) ? 'PK' : '', c.notNull && !m.pk.includes(c.name) ? 'NN' : ''].filter(Boolean).join(' ');
      grid.append(h('span', { class: o.column === c.name ? 'hl' : '' }, c.name), h('span', {}, typeText(c) + (flags ? ' ' + flags : '')));
    }
    this.info.appendChild(grid);
  }
}
