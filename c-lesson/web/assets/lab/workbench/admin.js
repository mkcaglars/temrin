// Workbench yönetim sayfaları: Server Status, Users and Privileges, Data Export / Import,
// Startup / Shutdown, Server Logs, Options File, değişkenler, tablo denetçisi ve tercihler.
import { h } from '../../js/ui.js';
import { ICONS } from '../icons.js';
import { DOCS } from '../store.js';
import { downloadText } from '../desktop.js';
import { typeText, displayValue } from '../mysql/engine.js';

const bq = (s) => '`' + String(s).replace(/`/g, '``') + '`';
const pad = (n) => String(n).padStart(2, '0');
const winPath = (p) => p.replace(/\//g, '\\');

function stamp(d = new Date()) {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

function page(conn, key, title, icon) {
  const existing = conn.tabs.find((t) => t.adminKey === key);
  if (existing) { conn.showTab(existing); return null; }
  const p = { adminKey: key, title, icon: ICONS[icon] || ICONS.status, el: h('div', { class: 'wb-admin-page' }), focus() {} };
  return p;
}

export function openAdminPage(conn, which, arg) {
  const fn = {
    status: serverStatus, connections: clientConnections, users: usersPage, variables: variablesPage, export: exportPage, import: importPage,
    startup: startupPage, logs: logsPage, options: optionsPage, perf: perfPage, prefs: prefsDialog, inspector: inspectorPage,
  }[which];
  conn.lab.events.emit('admin', { page: which });
  if (fn) fn(conn, arg);
}

function needServer(conn) {
  if (conn.lab.server.running) return true;
  conn.desk.message({ title: 'MySQL Workbench', text: 'Sunucu çalışmıyor.', detail: 'Administration > Startup / Shutdown sayfasından sunucuyu başlatın ve Query > Reconnect to Server ile yeniden bağlanın.', icon: 'warning', owner: conn.win });
  return false;
}

// ---------------------------------------------------------------- Server Status

function serverStatus(conn) {
  const p = page(conn, 'status', 'Administration - Server Status', 'status');
  if (!p) return;
  const srv = conn.lab.server;
  const ver = srv.version;
  const major = ver.slice(0, 3);
  const up = Math.floor((Date.now() - srv.startedAt) / 1000);
  const row = (a, b) => [h('span', { class: 'wb-st-k' }, a), h('span', {}, b)];
  p.el.append(h('div', { class: 'wb-page-title' }, 'Server Status'),
    h('div', { class: 'wb-st' },
      h('div', { class: 'wb-st-box' }, h('div', { class: 'wb-st-head' }, 'Server Status'),
        h('div', { class: 'wb-st-grid' }, ...row('Host:', 'OGRENCI-PC'), ...row('Socket:', 'MySQL'), ...row('Port:', String(srv.port)), ...row('Version:', `${ver}\nMySQL Community Server - GPL`),
          ...row('Compiled For:', 'Win64 (x86_64)'), ...row('Configuration File:', `C:\\ProgramData\\MySQL\\MySQL Server ${major}\\my.ini`),
          ...row('Running Since:', srv.running ? `${new Date(srv.startedAt).toLocaleString('tr-TR')} (${Math.floor(up / 3600)}:${pad(Math.floor(up / 60) % 60)})` : '—'),
          ...row('Status:', srv.running ? 'Running' : 'Stopped'))),
      h('div', { class: 'wb-st-box' }, h('div', { class: 'wb-st-head' }, 'Available Server Features'),
        h('div', { class: 'wb-st-grid' }, ...row('Performance Schema:', 'On'), ...row('Thread Pool:', 'n/a'), ...row('SSL Availability:', 'On'), ...row('Windows Authentication:', 'Off'), ...row('Password Validation:', 'n/a'), ...row('Audit Log:', 'n/a'))),
      h('div', { class: 'wb-st-box' }, h('div', { class: 'wb-st-head' }, 'Server Directories'),
        h('div', { class: 'wb-st-grid' }, ...row('Base Directory:', `C:\\Program Files\\MySQL\\MySQL Server ${major}\\`), ...row('Data Directory:', `C:\\ProgramData\\MySQL\\MySQL Server ${major}\\Data\\`), ...row('Error Log:', `.\\OGRENCI-PC.err`))),
      h('div', { class: 'wb-st-big ' + (srv.running ? 'ok' : 'bad') }, srv.running ? '● Running' : '● Stopped')));
  conn.addTab(p);
}

function clientConnections(conn) {
  const p = page(conn, 'connections', 'Administration - Client Connections', 'conns');
  if (!p) return;
  const t = h('table', { class: 'wb-grid' }, h('thead', {}, h('tr', {}, ...['Id', 'User', 'Host', 'DB', 'Command', 'Time', 'State', 'Info'].map((x) => h('th', {}, x)))));
  const tb = h('tbody');
  for (const s of conn.lab.server.sessions) tb.appendChild(h('tr', {}, ...[s.id, s.user, `${s.host}:${52000 + s.id}`, s.db || 'NULL', s === conn.session ? 'Query' : 'Sleep', 0, s === conn.session ? 'executing' : '', s === conn.session ? 'SELECT * FROM performance_schema.threads' : 'NULL'].map((x) => h('td', {}, String(x)))));
  t.appendChild(tb);
  p.el.append(h('div', { class: 'wb-page-title' }, 'Client Connections'), h('div', { class: 'wb-grid-scroll' }, t));
  conn.addTab(p);
}

function variablesPage(conn) {
  const p = page(conn, 'variables', 'Administration - Status and System Variables', 'vars');
  if (!p) return;
  const r = conn.session.execute('SHOW VARIABLES')[0];
  const t = h('table', { class: 'wb-grid' }, h('thead', {}, h('tr', {}, h('th', {}, 'Name'), h('th', {}, 'Value'))));
  const tb = h('tbody');
  for (const row of r.rows || []) tb.appendChild(h('tr', {}, h('td', {}, row[0]), h('td', {}, row[1])));
  t.appendChild(tb);
  p.el.append(h('div', { class: 'wb-page-title' }, 'System Variables'), h('div', { class: 'wb-grid-scroll' }, t));
  conn.addTab(p);
}

function perfPage(conn) {
  const p = page(conn, 'perf', 'Administration - Performance', 'status');
  if (!p) return;
  p.el.append(h('div', { class: 'wb-page-title' }, 'Performance'), h('div', { class: 'muted' }, 'Performans raporları ve gösterge paneli bu simülatörde gösterilmiyor.'));
  conn.addTab(p);
}

// ---------------------------------------------------------------- Startup / Shutdown, Logs, Options

function startupPage(conn) {
  const p = page(conn, 'startup', 'Administration - Startup / Shutdown', 'power');
  if (!p) return;
  const srv = conn.lab.server;
  const log = h('pre', { class: 'wb-log' });
  const state = h('div', { class: 'wb-st-big' });
  const btn = h('button', { class: 'lab-btn' });
  const render = () => {
    state.className = 'wb-st-big ' + (srv.running ? 'ok' : 'bad');
    state.textContent = srv.running ? 'The database server instance is running' : 'The database server instance is stopped';
    btn.textContent = srv.running ? 'Stop Server' : 'Start Server';
  };
  const add = (t) => { log.textContent += `${new Date().toLocaleString('tr-TR')} - ${t}\n`; };
  btn.onclick = async () => {
    if (srv.running) {
      add('Shutting down server...');
      srv.setRunning(false);
      add(`Server stop done.`);
    } else {
      add('Starting server...');
      srv.setRunning(true);
      add('Server start done.');
      add('Bağlantıyı yenilemek için Query > Reconnect to Server kullanın.');
    }
    conn.lab.store.touch();
    conn.lab.events.emit('service', { running: srv.running });
    render();
    conn.refreshTree();
  };
  render();
  p.el.append(h('div', { class: 'wb-page-title' }, 'Startup / Shutdown MySQL Server'),
    h('div', { class: 'wb-box' }, h('div', { class: 'wb-st-head' }, 'Database Server Instance'), state,
      h('div', { class: 'muted' }, 'If you stop the server, neither you nor your applications can use the database and all current connections will be closed.'), btn),
    h('div', { class: 'wb-box' }, h('div', { class: 'wb-st-head' }, 'Startup Message Log'), log));
  conn.addTab(p);
}

function logsPage(conn) {
  const p = page(conn, 'logs', 'Administration - Server Logs', 'logs');
  if (!p) return;
  const srv = conn.lab.server;
  const v = srv.version;
  const t = new Date(srv.startedAt).toISOString().replace('Z', '000Z');
  const lines = [
    `${t} 0 [System] [MY-010116] [Server] C:\\Program Files\\MySQL\\MySQL Server ${v.slice(0, 3)}\\bin\\mysqld.exe (mysqld ${v}) starting as process 4120`,
    `${t} 1 [System] [MY-013576] [InnoDB] InnoDB initialization has started.`,
    `${t} 1 [System] [MY-013577] [InnoDB] InnoDB initialization has ended.`,
    `${t} 0 [Warning] [MY-010068] [Server] CA certificate ca.pem is self signed.`,
    `${t} 0 [System] [MY-011323] [Server] X Plugin ready for connections. Bind-address: '::' port: 33060`,
    `${t} 0 [System] [MY-010931] [Server] C:\\Program Files\\MySQL\\MySQL Server ${v.slice(0, 3)}\\bin\\mysqld.exe: ready for connections. Version: '${v}'  socket: ''  port: 3306  MySQL Community Server - GPL.`,
  ];
  p.el.append(h('div', { class: 'wb-page-title' }, 'Server Logs'), h('div', { class: 'wb-out-sel' }, 'Error Log File'), h('pre', { class: 'wb-log' }, lines.join('\n')));
  conn.addTab(p);
}

export function myIni(srv) {
  const major = srv.version.slice(0, 3);
  return `# Other default tuning values
# MySQL Server Instance Configuration File
# ----------------------------------------------------------------------
# Generated by the MySQL Server Instance Configuration Wizard

[client]
port=3306

[mysql]
no-beep

[mysqld]
port=3306
datadir=C:/ProgramData/MySQL/MySQL Server ${major}/Data
character-set-server=utf8mb4
default-storage-engine=INNODB
sql-mode="ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION"
log-output=FILE
general-log=0
slow-query-log=1
long_query_time=10
log-error="OGRENCI-PC.err"
server-id=1
lower_case_table_names=1
secure-file-priv="C:/ProgramData/MySQL/MySQL Server ${major}/Uploads"
max_connections=151
`;
}

function optionsPage(conn) {
  const p = page(conn, 'options', 'Administration - Options File', 'options');
  if (!p) return;
  p.el.append(h('div', { class: 'wb-page-title' }, `Options File: C:\\ProgramData\\MySQL\\MySQL Server ${conn.lab.server.version.slice(0, 3)}\\my.ini`), h('pre', { class: 'wb-log' }, myIni(conn.lab.server)));
  conn.addTab(p);
}

// ---------------------------------------------------------------- Users and Privileges

const ROLES = {
  DBA: ['ALL PRIVILEGES'],
  DBManager: ['CREATE', 'DROP', 'ALTER', 'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'INDEX', 'REFERENCES', 'CREATE VIEW', 'SHOW VIEW', 'SHOW DATABASES'],
  DBDesigner: ['CREATE', 'ALTER', 'INDEX', 'CREATE VIEW', 'SHOW VIEW', 'SHOW DATABASES'],
  BackupAdmin: ['SELECT', 'SHOW DATABASES', 'LOCK TABLES', 'EVENT'],
};
const SCHEMA_PRIVS = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'EXECUTE', 'SHOW VIEW', 'CREATE', 'ALTER', 'REFERENCES', 'INDEX', 'CREATE VIEW', 'CREATE ROUTINE', 'ALTER ROUTINE', 'EVENT', 'DROP', 'TRIGGER', 'GRANT OPTION', 'CREATE TEMPORARY TABLES', 'LOCK TABLES'];

function usersPage(conn) {
  const p = page(conn, 'users', 'Administration - Users and Privileges', 'user');
  if (!p) return;
  if (!needServer(conn)) return;
  const srv = conn.lab.server;
  let sel = null;
  let draft = null;
  let tab = 'login';
  const list = h('tbody');
  const right = h('div', { class: 'wb-up-right' });
  const isAdmin = conn.session.account.grants.some((g) => g.db === '*' && (g.privs.includes('ALL PRIVILEGES') || g.privs.includes('CREATE USER')));
  const renderList = () => {
    list.innerHTML = '';
    for (const u of [...srv.users, ...(draft && draft.isNew ? [draft] : [])]) {
      const tr = h('tr', { class: (sel === u || (draft && draft.src === u)) ? 'sel' : '' }, h('td', {}, u.user || '<new>'), h('td', {}, u.host));
      tr.onclick = () => { select(u); };
      list.appendChild(tr);
    }
  };
  const select = (u) => {
    sel = u;
    draft = u.isNew ? u : { src: u, user: u.user, host: u.host, password: '', confirm: '', grants: JSON.parse(JSON.stringify(u.grants || [])) };
    renderList();
    renderRight();
  };
  const renderRight = () => {
    right.innerHTML = '';
    if (!draft) { right.appendChild(h('div', { class: 'muted' }, 'Bir hesap seçin ya da "Add Account" ile yeni hesap ekleyin.')); return; }
    const tabs = h('div', { class: 'wb-te-subtabs top' }, ...[['login', 'Login'], ['limits', 'Account Limits'], ['roles', 'Administrative Roles'], ['schema', 'Schema Privileges']].map(([id, l]) => h('button', { class: 'wb-nav-tab' + (tab === id ? ' active' : ''), onclick: () => { tab = id; renderRight(); } }, l)));
    const body = h('div', { class: 'wb-up-body' });
    if (tab === 'login') {
      const f = (label, key, type = 'text', note = '') => {
        const i = h('input', { class: 'lab-input', type, value: draft[key] || '', autocomplete: 'off' });
        i.oninput = () => { draft[key] = i.value; };
        return h('div', { class: 'wb-form-row' }, h('label', {}, label), i, note ? h('span', { class: 'muted small' }, note) : null);
      };
      body.append(h('div', { class: 'wb-te-cols-head' }, `Details for account ${draft.user || 'newuser'}@${draft.host}`),
        f('Login Name:', 'user', 'text', 'You may create multiple accounts with the same name to connect from different hosts.'),
        h('div', { class: 'wb-form-row' }, h('label', {}, 'Authentication Type:'), h('span', {}, 'caching_sha2_password')),
        f('Limit to Hosts Matching:', 'host', 'text', '% and _ wildcards may be used'),
        f('Password:', 'password', 'password', draft.isNew ? 'Type a password to reset it.' : 'Değiştirmek için yeni şifre yazın; boş bırakılırsa değişmez.'),
        f('Confirm Password:', 'confirm', 'password', 'Enter password again to confirm.'));
    } else if (tab === 'limits') {
      body.appendChild(h('div', { class: 'muted' }, 'Hesap sınırları (saatlik sorgu sayısı vb.) 0 = sınırsız. Simülatörde uygulanmaz.'));
    } else if (tab === 'roles') {
      const global = draft.grants.find((g) => g.db === '*') || { privs: [] };
      for (const [role, privs] of Object.entries(ROLES)) {
        const cb = h('input', { type: 'checkbox', checked: privs.every((x) => global.privs.includes(x)) });
        cb.onchange = () => {
          let g = draft.grants.find((x) => x.db === '*');
          if (!g) { g = { db: '*', table: '*', privs: [], grantOption: false }; draft.grants.push(g); }
          if (cb.checked) for (const x of privs) { if (!g.privs.includes(x)) g.privs.push(x); } else g.privs = g.privs.filter((x) => !privs.includes(x));
          if (role === 'DBA') g.grantOption = cb.checked;
          if (!g.privs.length) draft.grants.splice(draft.grants.indexOf(g), 1);
        };
        body.appendChild(h('label', { class: 'wb-te-colrow' }, cb, ' ', h('b', {}, role), ' — ', role === 'DBA' ? 'grants the rights to perform all tasks' : privs.join(', ')));
      }
    } else {
      const rows = draft.grants.filter((g) => g.db !== '*');
      const t = h('table', { class: 'wb-grid' }, h('thead', {}, h('tr', {}, h('th', {}, 'Schema'), h('th', {}, 'Privileges'))));
      const tb = h('tbody');
      let cur = null;
      const privBox = h('div', { class: 'wb-up-privs' });
      const renderPriv = () => {
        privBox.innerHTML = '';
        if (!cur) return;
        for (const pr of SCHEMA_PRIVS) {
          const cb = h('input', { type: 'checkbox', checked: cur.privs.includes(pr) || cur.privs.includes('ALL PRIVILEGES') });
          cb.onchange = () => { cur.privs = cur.privs.filter((x) => x !== 'ALL PRIVILEGES' && x !== pr); if (cb.checked) cur.privs.push(pr); renderRows(); };
          privBox.appendChild(h('label', { class: 'wb-te-colrow' }, cb, ' ', pr));
        }
      };
      const renderRows = () => {
        tb.innerHTML = '';
        for (const g of rows) {
          const tr = h('tr', { class: g === cur ? 'sel' : '' }, h('td', {}, g.db), h('td', {}, g.privs.join(', ')));
          tr.onclick = () => { cur = g; renderRows(); renderPriv(); };
          tb.appendChild(tr);
        }
      };
      t.appendChild(tb);
      renderRows();
      const addEntry = async () => {
        const dbs = srv.databaseNames();
        const sel2 = h('select', { class: 'lab-input' }, ...dbs.map((d) => h('option', {}, d)));
        const r = await conn.desk.message({ title: 'New Schema Privilege Definition', text: 'Selected schema:', extra: sel2, icon: '', buttons: [{ text: 'OK', value: 'ok', primary: true }, { text: 'Cancel', value: null }], owner: conn.win });
        if (r !== 'ok' || !sel2.value) return;
        const g = { db: sel2.value, table: '*', privs: [], grantOption: false };
        draft.grants.push(g);
        rows.push(g);
        cur = g;
        renderRows();
        renderPriv();
      };
      body.append(h('div', { class: 'wb-up-schema' }, h('div', {}, h('div', { class: 'wb-grid-scroll' }, t), h('div', { class: 'wb-form-btns' },
        h('button', { class: 'lab-btn', onclick: addEntry }, 'Add Entry...'),
        h('button', { class: 'lab-btn', onclick: () => { if (!cur) return; draft.grants.splice(draft.grants.indexOf(cur), 1); rows.splice(rows.indexOf(cur), 1); cur = null; renderRows(); renderPriv(); } }, 'Delete Entry'),
        h('button', { class: 'lab-btn', onclick: () => { if (cur) { cur.privs = [...SCHEMA_PRIVS.filter((x) => x !== 'GRANT OPTION')]; renderRows(); renderPriv(); } } }, 'Select "ALL"'))), privBox));
    }
    const apply = h('button', { class: 'lab-btn primary', onclick: () => applyUser() }, 'Apply');
    const revert = h('button', { class: 'lab-btn', onclick: () => { if (draft.isNew) { draft = null; sel = null; renderList(); renderRight(); } else select(draft.src); } }, 'Revert');
    right.append(tabs, body, h('div', { class: 'wb-te-foot' }, h('div', { class: 'spacer' }), revert, apply));
  };
  const q = (s) => "'" + String(s).replace(/'/g, "\\'") + "'";
  const applyUser = async () => {
    if (!isAdmin) { await conn.desk.message({ title: 'Users and Privileges', text: 'Bu işlem için yönetici (root) yetkisi gerekir.', icon: 'error', owner: conn.win }); return; }
    if (!draft.user) { await conn.desk.message({ title: 'Users and Privileges', text: 'Login Name boş olamaz.', icon: 'error', owner: conn.win }); return; }
    if ((draft.password || draft.confirm) && draft.password !== draft.confirm) { await conn.desk.message({ title: 'Users and Privileges', text: 'The password and its confirmation do not match. Please try again.', icon: 'error', owner: conn.win }); return; }
    const acct = `${q(draft.user)}@${q(draft.host)}`;
    const stmts = [];
    if (draft.isNew) stmts.push(`CREATE USER ${acct} IDENTIFIED BY ${q(draft.password || '')}`);
    else {
      const src = draft.src;
      if (src.user !== draft.user || src.host !== draft.host) stmts.push(`RENAME USER ${q(src.user)}@${q(src.host)} TO ${acct}`);
      if (draft.password) stmts.push(`ALTER USER ${acct} IDENTIFIED BY ${q(draft.password)}`);
      for (const g of src.grants || []) {
        if (!g.privs.length) continue;
        stmts.push(`REVOKE ALL PRIVILEGES ON ${g.db === '*' ? '*' : bq(g.db)}.* FROM ${acct}`);
      }
    }
    for (const g of draft.grants) {
      const privs = g.privs.filter((x) => x !== 'GRANT OPTION');
      if (!privs.length) continue;
      stmts.push(`GRANT ${privs.join(', ')} ON ${g.db === '*' ? '*' : bq(g.db)}.* TO ${acct}${g.grantOption || g.privs.includes('GRANT OPTION') ? ' WITH GRANT OPTION' : ''}`);
    }
    for (const s of stmts) {
      const r = conn.session.execute(s)[0];
      conn.output(r.ok, s.replace(/IDENTIFIED BY '.*'/, "IDENTIFIED BY '****'"), r.message, r.ms);
      if (!r.ok) { await conn.desk.message({ title: 'Users and Privileges', text: r.message, icon: 'error', owner: conn.win }); break; }
    }
    conn.lab.events.emit('users', {});
    const u = srv.users.find((x) => x.user === draft.user && x.host === draft.host);
    draft = null;
    if (u) select(u); else { sel = null; renderList(); renderRight(); }
  };
  const addAccount = () => {
    let n = 'newuser';
    let k = 1;
    while (srv.users.some((u) => u.user === n)) n = `newuser${k++}`;
    const d = { isNew: true, user: n, host: '%', password: '', confirm: '', grants: [] };
    sel = d;
    draft = d;
    tab = 'login';
    renderList();
    renderRight();
  };
  const del = async () => {
    if (!sel || sel.isNew) return;
    if (sel.user === 'root') { await conn.desk.message({ title: 'Delete Account', text: 'root hesabı silinemez (simülatör koruması).', icon: 'warning', owner: conn.win }); return; }
    const r = await conn.desk.message({ title: 'Delete Account', text: `The account '${sel.user}'@'${sel.host}' will be permanently removed. Continue?`, icon: 'warning', buttons: [{ text: 'Delete', value: 'y', primary: true }, { text: 'Cancel', value: null }], owner: conn.win });
    if (r !== 'y') return;
    const s = `DROP USER '${sel.user}'@'${sel.host}'`;
    const res = conn.session.execute(s)[0];
    conn.output(res.ok, s, res.message, res.ms);
    sel = null;
    draft = null;
    renderList();
    renderRight();
  };
  p.el.append(h('div', { class: 'wb-page-title' }, `Users and Privileges — Local instance`),
    h('div', { class: 'wb-up' },
      h('div', { class: 'wb-up-left' }, h('div', { class: 'wb-te-cols-head' }, 'User Accounts'), h('div', { class: 'wb-grid-scroll' }, h('table', { class: 'wb-grid' }, h('thead', {}, h('tr', {}, h('th', {}, 'User'), h('th', {}, 'From Host'))), list)),
        h('div', { class: 'wb-form-btns' }, h('button', { class: 'lab-btn', onclick: addAccount }, 'Add Account'), h('button', { class: 'lab-btn', onclick: del }, 'Delete'), h('button', { class: 'lab-btn', onclick: () => { renderList(); renderRight(); } }, 'Refresh'))),
      right));
  renderList();
  renderRight();
  conn.addTab(p);
}

// ---------------------------------------------------------------- Data Export

function exportPage(conn) {
  const p = page(conn, 'export', 'Administration - Data Export', 'exportIco');
  if (!p) return;
  if (!needServer(conn)) return;
  const srv = conn.lab.server;
  const store = conn.lab.store;
  const dbs = srv.databaseNames().filter((d) => srv.canSeeDb(conn.session.account, d));
  const checked = new Map(dbs.map((d) => [d, new Set()])); // db → seçili tablolar
  let curDb = dbs[0] || null;
  let tab = 'select';
  const today = stamp();
  let folderPath = `${DOCS}/dumps/Dump${today}`;
  let filePath = `${DOCS}/dumps/Dump${today}.sql`;
  let target = 'file';
  let includeSchema = false;
  let dumpRoutines = false;
  let dumpTriggers = false;
  let what = 'both';
  const content = h('div', { class: 'wb-ex-content' });
  const progressLog = h('pre', { class: 'wb-log' });
  const render = () => {
    content.innerHTML = '';
    const tabs = h('div', { class: 'wb-te-subtabs top' }, ...[['select', 'Object Selection'], ['progress', 'Export Progress']].map(([id, l]) => h('button', { class: 'wb-nav-tab' + (tab === id ? ' active' : ''), onclick: () => { tab = id; render(); } }, l)));
    content.appendChild(tabs);
    if (tab === 'progress') { content.appendChild(h('div', { class: 'wb-box grow' }, h('div', { class: 'wb-st-head' }, 'Export Progress'), progressLog)); return; }
    // şema listesi
    const left = h('tbody');
    for (const d of dbs) {
      const set = checked.get(d);
      const ctx = srv.getDb(d);
      const all = Object.keys(ctx.meta.tables);
      const cb = h('input', { type: 'checkbox', checked: all.length > 0 && set.size === all.length });
      cb.indeterminate = set.size > 0 && set.size < all.length;
      cb.onchange = () => { set.clear(); if (cb.checked) all.forEach((t) => set.add(t)); curDb = d; render(); };
      const tr = h('tr', { class: d === curDb ? 'sel' : '' }, h('td', { class: 'c' }, cb), h('td', {}, h('span', { class: 'wb-tree-ico', html: ICONS.db }), d));
      tr.onclick = (e) => { if (e.target !== cb) { curDb = d; render(); } };
      left.appendChild(tr);
    }
    const right = h('tbody');
    if (curDb) {
      const ctx = srv.getDb(curDb);
      const set = checked.get(curDb);
      for (const t of Object.keys(ctx.meta.tables).sort()) {
        const cb = h('input', { type: 'checkbox', checked: set.has(t) });
        cb.onchange = () => { if (cb.checked) set.add(t); else set.delete(t); render(); };
        right.appendChild(h('tr', {}, h('td', { class: 'c' }, cb), h('td', {}, h('span', { class: 'wb-tree-ico', html: ICONS.table }), t)));
      }
    }
    const whatSel = h('select', { class: 'lab-input' }, h('option', { value: 'both', selected: what === 'both' }, 'Dump Structure and Data'), h('option', { value: 'data', selected: what === 'data' }, 'Dump Data Only'), h('option', { value: 'structure', selected: what === 'structure' }, 'Dump Structure Only'));
    whatSel.onchange = () => { what = whatSel.value; };
    const radio = (val, label) => {
      const r = h('input', { type: 'radio', name: 'wbexp', checked: target === val });
      r.onchange = () => { target = val; };
      return h('label', { class: 'wb-te-colrow' }, r, ' ', label);
    };
    const pathIn = (get, set, isFile) => {
      const i = h('input', { class: 'lab-input', value: winPath(get()) });
      i.oninput = () => set(i.value.replace(/\\/g, '/'));
      const b = h('button', { class: 'lab-btn', onclick: async () => {
        if (!isFile) return;
        const r = await conn.desk.fileDialog({ mode: 'save', dir: get().slice(0, get().lastIndexOf('/')), name: get().split('/').pop(), filter: ['sql'], filterLabel: 'SQL Files (*.sql)', owner: conn.win });
        if (r) { set(r); i.value = winPath(r); }
      } }, '...');
      return h('div', { class: 'wb-ex-path' }, i, b);
    };
    const incl = h('input', { type: 'checkbox', checked: includeSchema });
    incl.onchange = () => { includeSchema = incl.checked; };
    const cbR = h('input', { type: 'checkbox', checked: dumpRoutines });
    cbR.onchange = () => { dumpRoutines = cbR.checked; };
    const cbT = h('input', { type: 'checkbox', checked: dumpTriggers });
    cbT.onchange = () => { dumpTriggers = cbT.checked; };
    content.append(
      h('div', { class: 'wb-box' }, h('div', { class: 'wb-st-head' }, 'Tables to Export'),
        h('div', { class: 'wb-ex-lists' },
          h('div', { class: 'wb-grid-scroll' }, h('table', { class: 'wb-grid' }, h('thead', {}, h('tr', {}, h('th', {}, 'Exp...'), h('th', {}, 'Schema'))), left)),
          h('div', { class: 'wb-grid-scroll' }, h('table', { class: 'wb-grid' }, h('thead', {}, h('tr', {}, h('th', {}, 'Exp...'), h('th', {}, 'Schema Objects'))), right))),
        h('div', { class: 'wb-form-btns' }, h('button', { class: 'lab-btn', onclick: () => { for (const d of dbs) Object.keys(srv.getDb(d).meta.tables).forEach((t) => checked.get(d).add(t)); render(); } }, 'Select Tables'), h('button', { class: 'lab-btn', onclick: () => { checked.forEach((s) => s.clear()); render(); } }, 'Unselect All'), h('div', { class: 'spacer' }), whatSel)),
      h('div', { class: 'wb-box' }, h('div', { class: 'wb-st-head' }, 'Objects to Export'),
        h('div', { class: 'wb-te-colrow' }, h('label', {}, cbR, ' Dump Stored Procedures and Functions'), h('label', { style: { marginLeft: '18px' } }, h('input', { type: 'checkbox', disabled: true }), ' Dump Events'), h('label', { style: { marginLeft: '18px' } }, cbT, ' Dump Triggers'))),
      h('div', { class: 'wb-box' }, h('div', { class: 'wb-st-head' }, 'Export Options'),
        radio('folder', 'Export to Dump Project Folder'), pathIn(() => folderPath, (v) => { folderPath = v; }, false),
        h('div', { class: 'muted small' }, 'Each table will be exported into a separate file. This allows a selective restore, but may be slower.'),
        radio('file', 'Export to Self-Contained File'), pathIn(() => filePath, (v) => { filePath = v; }, true),
        h('div', { class: 'muted small' }, 'All selected database objects will be exported into a single, self-contained file.'),
        h('label', { class: 'wb-te-colrow' }, h('input', { type: 'checkbox', checked: true }), ' Create Dump in a Single Transaction (self-contained file only)'),
        h('label', { class: 'wb-te-colrow' }, incl, ' Include Create Schema')),
      h('div', { class: 'wb-te-foot' }, h('div', { class: 'spacer' }), h('button', { class: 'lab-btn primary', onclick: start }, 'Start Export')));
  };
  const start = async () => {
    const sel = [...checked.entries()].filter(([, s]) => s.size);
    if (!sel.length) { await conn.desk.message({ title: 'Data Export', text: 'Please select at least one table to export.', icon: 'warning', owner: conn.win }); return; }
    const opts = { includeSchema, structure: what !== 'data', data: what !== 'structure', routines: dumpRoutines, triggers: dumpTriggers };
    progressLog.textContent = '';
    const log = (t) => { progressLog.textContent += t + '\n'; };
    const now = new Date();
    const time = () => new Date().toLocaleTimeString('en-GB');
    try {
      if (target === 'file') {
        if (store.exists(filePath)) {
          const r = await conn.desk.message({ title: 'Data Export', text: `The file ${winPath(filePath)} already exists. Overwrite?`, icon: 'warning', buttons: [{ text: 'Overwrite', value: 'y', primary: true }, { text: 'Cancel', value: null }], owner: conn.win });
          if (r !== 'y') return;
        }
        log(`${time()} Dumping ${sel.map(([d]) => d).join(', ')} (${sel.map(([, s]) => [...s].join(', ')).join('; ')})`);
        const parts = sel.map(([d, s]) => {
          log(`Running: mysqldump.exe --defaults-file="C:\\Users\\Ogrenci\\AppData\\Local\\Temp\\tmpxx.cnf"  --host=localhost --port=3306 --default-character-set=utf8 --user=${conn.session.user} --protocol=tcp --single-transaction=TRUE${dumpRoutines ? ' --routines' : ''}${dumpTriggers ? '' : ' --skip-triggers'} "${d}" ${[...s].join(' ')}`);
          return conn.session.dump(d, { tables: [...s], ...opts, includeSchema: includeSchema || sel.length > 1 });
        });
        store.writeFile(filePath, parts.join('\n'));
        log(`${time()} Export of ${winPath(filePath)} has finished`);
        conn.lab.events.emit('export', { path: filePath, dbs: sel.map(([d]) => d), tables: sel.flatMap(([d, s]) => [...s].map((t) => `${d}.${t}`)), includeSchema });
      } else {
        for (const [d, s] of sel) {
          for (const t of s) {
            const path = `${folderPath}/${d}_${t}.sql`;
            log(`${time()} Dumping ${d} (${t})`);
            store.writeFile(path, conn.session.dump(d, { tables: [t], ...opts, routines: false }));
          }
          if (dumpRoutines) {
            log(`${time()} Dumping ${d} (routines)`);
            store.writeFile(`${folderPath}/${d}_routines.sql`, conn.session.dump(d, { tables: [], structure: false, data: false, routines: true }));
          }
        }
        log(`${time()} Export of ${winPath(folderPath)} has finished`);
        conn.lab.events.emit('export', { path: folderPath, folder: true, dbs: sel.map(([d]) => d), tables: sel.flatMap(([d, s]) => [...s].map((t) => `${d}.${t}`)) });
      }
      void now;
    } catch (e) {
      log(`${time()} Error: ${e.message}`);
    }
    tab = 'progress';
    render();
  };
  // varsayılan: varsayılan şemanın tüm tabloları seçili değil (Workbench gibi)
  render();
  p.el.append(h('div', { class: 'wb-page-title' }, 'Data Export'), content);
  conn.addTab(p);
}

// ---------------------------------------------------------------- Data Import / Restore

function importPage(conn) {
  const p = page(conn, 'import', 'Administration - Data Import/Restore', 'importIco');
  if (!p) return;
  if (!needServer(conn)) return;
  const srv = conn.lab.server;
  const store = conn.lab.store;
  let tab = 'import';
  let source = 'file';
  let filePath = '';
  let folderPath = `${DOCS}/dumps`;
  let targetDb = '';
  const content = h('div', { class: 'wb-ex-content' });
  const progressLog = h('pre', { class: 'wb-log' });
  const latest = Object.entries(store.state.files).filter(([k]) => k.toLowerCase().endsWith('.sql') && k.startsWith(DOCS + '/dumps/')).sort((a, b) => b[1].mtime - a[1].mtime)[0];
  if (latest) filePath = latest[0];
  const render = () => {
    content.innerHTML = '';
    const tabs = h('div', { class: 'wb-te-subtabs top' }, ...[['import', 'Import from Disk'], ['progress', 'Import Progress']].map(([id, l]) => h('button', { class: 'wb-nav-tab' + (tab === id ? ' active' : ''), onclick: () => { tab = id; render(); } }, l)));
    content.appendChild(tabs);
    if (tab === 'progress') { content.appendChild(h('div', { class: 'wb-box grow' }, h('div', { class: 'wb-st-head' }, 'Import Progress'), progressLog)); return; }
    const radio = (val, label) => {
      const r = h('input', { type: 'radio', name: 'wbimp', checked: source === val });
      r.onchange = () => { source = val; };
      return h('label', { class: 'wb-te-colrow' }, r, ' ', label);
    };
    const fileIn = h('input', { class: 'lab-input', value: winPath(filePath) });
    fileIn.oninput = () => { filePath = fileIn.value.replace(/\\/g, '/'); };
    const folderIn = h('input', { class: 'lab-input', value: winPath(folderPath) });
    folderIn.oninput = () => { folderPath = folderIn.value.replace(/\\/g, '/'); };
    const dbSel = h('select', { class: 'lab-input' }, h('option', { value: '' }, ''), ...srv.databaseNames().map((d) => h('option', { value: d, selected: d === targetDb }, d)));
    dbSel.onchange = () => { targetDb = dbSel.value; };
    content.append(
      h('div', { class: 'wb-box' }, h('div', { class: 'wb-st-head' }, 'Import Options'),
        radio('folder', 'Import from Dump Project Folder'), h('div', { class: 'wb-ex-path' }, folderIn),
        h('div', { class: 'muted small' }, 'Select the Dump Project Folder to import. You can do a selective restore.'),
        radio('file', 'Import from Self-Contained File'),
        h('div', { class: 'wb-ex-path' }, fileIn, h('button', { class: 'lab-btn', onclick: async () => {
          const r = await conn.desk.fileDialog({ mode: 'open', dir: filePath ? filePath.slice(0, filePath.lastIndexOf('/')) : DOCS + '/dumps', filter: ['sql'], filterLabel: 'SQL Files (*.sql)', owner: conn.win });
          if (r) { filePath = r; fileIn.value = winPath(r); }
        } }, '...')),
        h('div', { class: 'muted small' }, 'Select the SQL/dump file to import. Please note that the whole file will be imported.'),
        h('div', { class: 'wb-form-row' }, h('label', {}, 'Default Target Schema:'), dbSel, h('button', { class: 'lab-btn', onclick: async () => {
          const input = h('input', { class: 'lab-input', value: '' });
          const r = await conn.desk.message({ title: 'Create Schema', text: 'Name of schema to create:', extra: input, icon: '', buttons: [{ text: 'OK', value: 'ok', primary: true }, { text: 'Cancel', value: null }], owner: conn.win });
          if (r !== 'ok' || !input.value.trim()) return;
          const res = conn.runSql(`CREATE SCHEMA ${bq(input.value.trim())}`);
          if (res[0]?.ok) { targetDb = input.value.trim().toLowerCase(); render(); }
          else await conn.desk.message({ title: 'Create Schema', text: res[0].message, icon: 'error', owner: conn.win });
        } }, 'New...')),
        h('div', { class: 'muted small' }, 'The default schema to import the dump into. NOTE: this is only used if the dump file doesn\'t contain its schema, otherwise it is ignored.')),
      h('div', { class: 'wb-te-foot' }, h('div', { class: 'spacer' }), h('button', { class: 'lab-btn primary', onclick: start }, 'Start Import')));
  };
  const start = async () => {
    progressLog.textContent = '';
    const log = (t) => { progressLog.textContent += t + '\n'; };
    const time = () => new Date().toLocaleTimeString('en-GB');
    let files = [];
    if (source === 'file') {
      if (!store.exists(filePath)) { await conn.desk.message({ title: 'Data Import', text: `File ${winPath(filePath)} doesn't exist`, icon: 'error', owner: conn.win }); return; }
      files = [filePath];
    } else {
      files = store.list(folderPath).files.filter((f) => f.name.toLowerCase().endsWith('.sql')).map((f) => f.path);
      if (!files.length) { await conn.desk.message({ title: 'Data Import', text: 'Seçilen klasörde .sql dosyası yok.', icon: 'error', owner: conn.win }); return; }
    }
    const text = files.map((f) => store.readFile(f)).join('\n');
    const hasSchema = /^\s*(CREATE\s+(DATABASE|SCHEMA)|USE\s)/im.test(text);
    if (!hasSchema && !targetDb) {
      await conn.desk.message({ title: 'No Default Schema Selected', text: 'There is no default schema selected. The dump file does not contain a schema definition, so please select the target schema (or create a new one with New...).', icon: 'warning', owner: conn.win });
      return;
    }
    tab = 'progress';
    render();
    let session;
    try {
      session = srv.connect(conn.session.user, conn.session.account.password, 'localhost');
      if (targetDb) session.use(targetDb);
    } catch (e) {
      log(`ERROR ${e.code}: ${e.message}`);
      return;
    }
    let failed = null;
    for (const f of files) {
      log(`${time()} Restoring ${winPath(f)}`);
      log(`Running: mysql.exe --defaults-file="C:\\Users\\Ogrenci\\AppData\\Local\\Temp\\tmpxx.cnf"  --protocol=tcp --host=localhost --user=${session.user} --port=3306 --default-character-set=utf8 --comments ${targetDb ? `--database=${targetDb} ` : ''}< "${winPath(f)}"`);
      const src = store.readFile(f);
      const results = session.execute(src, { stopOnError: true });
      const bad = results.find((r) => !r.ok);
      if (bad) {
        const line = src.slice(0, bad.s).split('\n').length;
        log(`ERROR ${bad.error.code} (${bad.error.state}) at line ${line}: ${bad.error.message}`);
        log('');
        log(`Operation failed with exitcode 1`);
        failed = bad;
        break;
      }
    }
    session.close?.();
    log(`${time()} Import of ${winPath(source === 'file' ? filePath : folderPath)} has ${failed ? 'finished with 1 errors' : 'finished'}`);
    conn.refreshTree();
    conn.lab.events.emit('import', { ok: !failed, files, target: targetDb });
  };
  render();
  p.el.append(h('div', { class: 'wb-page-title' }, 'Data Import'), content);
  conn.addTab(p);
}

// ---------------------------------------------------------------- Tablo / şema denetçisi

function inspectorPage(conn, o) {
  const key = `inspect:${o.db}:${o.table || ''}`;
  const p = page(conn, key, o.table ? `${o.table}` : `${o.db}`, o.table ? 'table' : 'db');
  if (!p) return;
  const srv = conn.lab.server;
  const ctx = srv.getDb(o.db);
  if (!ctx) return;
  const grid = (heads, rows) => {
    const t = h('table', { class: 'wb-grid' }, h('thead', {}, h('tr', {}, ...heads.map((x) => h('th', {}, x)))));
    const tb = h('tbody');
    for (const r of rows) tb.appendChild(h('tr', {}, ...r.map((x) => h('td', { class: x == null ? 'null' : '' }, x == null ? 'NULL' : String(x)))));
    t.appendChild(tb);
    return h('div', { class: 'wb-grid-scroll' }, t);
  };
  if (!o.table) {
    const rows = Object.values(ctx.meta.tables).map((m) => {
      const n = ctx.sql.exec(`SELECT count(*) FROM "${m.name}"`)[0].values[0][0];
      return [m.name, m.engine, n, m.collation, m.comment || ''];
    });
    p.el.append(h('div', { class: 'wb-page-title' }, `Schema: ${o.db}`), h('div', { class: 'muted' }, `Default collation: ${ctx.meta.collation} — ${rows.length} table(s)`), grid(['Name', 'Engine', 'Rows', 'Collation', 'Comment'], rows));
    conn.addTab(p);
    return;
  }
  const m = ctx.meta.tables[o.table];
  if (!m) return;
  let tab = 'info';
  const body = h('div', { class: 'wb-ex-content' });
  const render = () => {
    body.innerHTML = '';
    body.appendChild(h('div', { class: 'wb-te-subtabs top' }, ...[['info', 'Info'], ['columns', 'Columns'], ['indexes', 'Indexes'], ['fks', 'Foreign keys'], ['ddl', 'DDL']].map(([id, l]) => h('button', { class: 'wb-nav-tab' + (tab === id ? ' active' : ''), onclick: () => { tab = id; render(); } }, l))));
    if (tab === 'info') {
      const n = ctx.sql.exec(`SELECT count(*) FROM "${m.name}"`)[0].values[0][0];
      body.appendChild(h('div', { class: 'wb-st-grid' }, ...[['Table name:', m.name], ['Engine:', m.engine], ['Row format:', 'Dynamic'], ['Table rows:', String(n)], ['Auto increment:', m.columns.some((c) => c.autoInc) ? String(conn.session.autoIncNext(ctx, m.name)) : 'n/a'], ['Table collation:', m.collation], ['Comments:', m.comment || '']].flatMap(([a, b]) => [h('span', { class: 'wb-st-k' }, a), h('span', {}, b)])));
    } else if (tab === 'columns') {
      const pk = new Set(m.pk.map((x) => x.toLowerCase()));
      body.appendChild(grid(['Column', 'Type', 'Default Value', 'Nullable', 'Character Set', 'Collation', 'Privileges', 'Extra', 'Comments'], m.columns.map((c) => [c.name, typeText(c), c.default ? (c.default.now ? 'CURRENT_TIMESTAMP' : c.default.value === null ? null : displayValue(c.default.value, c)) : null, c.notNull || pk.has(c.name.toLowerCase()) ? 'NO' : 'YES', /char|text|enum/.test(c.type) ? 'utf8mb4' : '', /char|text|enum/.test(c.type) ? 'utf8mb4_0900_ai_ci' : '', 'select,insert,update,references', c.autoInc ? 'auto_increment' : '', c.comment || ''])));
    } else if (tab === 'indexes') {
      const rows = [];
      if (m.pk.length) rows.push(['PRIMARY', 'BTREE', 'YES', m.pk.join(', ')]);
      for (const u of m.uniques) rows.push([u.name, 'BTREE', 'YES', u.cols.join(', ')]);
      for (const u of m.indexes) rows.push([u.name, 'BTREE', 'NO', u.cols.join(', ')]);
      body.appendChild(grid(['Key', 'Type', 'Unique', 'Columns'], rows));
    } else if (tab === 'fks') {
      body.appendChild(grid(['Name', 'Schema', 'Table', 'Column', 'Referenced Column', 'On Update', 'On Delete'], m.fks.map((f) => [f.name, o.db, f.refTable, f.cols.join(', '), f.refCols.join(', '), f.onUpdate || 'NO ACTION', f.onDelete || 'NO ACTION'])));
    } else {
      body.appendChild(h('pre', { class: 'wb-log' }, conn.session.showCreateTable(ctx, m.name)));
    }
  };
  render();
  p.el.append(h('div', { class: 'wb-page-title' }, `${o.db}.${o.table}`), body);
  conn.addTab(p);
}

// ---------------------------------------------------------------- Tercihler

function prefsDialog(conn) {
  const prefs = conn.prefs;
  const w = conn.desk.open({ title: 'Workbench Preferences', width: 620, modal: true, owner: conn.win, minimizable: false });
  const safe = h('input', { type: 'checkbox', checked: !!prefs.safeUpdates });
  const limit = h('input', { class: 'lab-input', type: 'number', value: prefs.limitRows || 1000, style: { width: '100px' } });
  const cont = h('input', { type: 'checkbox', checked: !prefs.stopOnError });
  w.body.appendChild(h('div', { class: 'wb-prefs' },
    h('div', { class: 'wb-prefs-tree' }, h('div', {}, 'General Editors'), h('div', { class: 'sel' }, 'SQL Editor'), h('div', { class: 'sub' }, 'Query Editor'), h('div', { class: 'sub' }, 'Object Editors'), h('div', { class: 'sub' }, 'SQL Execution'), h('div', {}, 'Administration'), h('div', {}, 'Modeling'), h('div', {}, 'Fonts & Colors')),
    h('div', { class: 'wb-prefs-main' },
      h('div', { class: 'wb-st-head' }, 'SQL Editor'),
      h('div', { class: 'wb-st-head small' }, 'Other'),
      h('label', { class: 'wb-te-colrow' }, safe, ' Safe Updates (rejects UPDATEs and DELETEs with no restrictions)'),
      h('div', { class: 'muted small' }, 'Prevents UPDATE and DELETE statements without a WHERE clause that uses a KEY column, or a LIMIT. Requires reconnection.'),
      h('div', { class: 'wb-st-head small' }, 'SQL Execution'),
      h('div', { class: 'wb-form-row' }, h('label', {}, 'Limit Rows Count:'), limit),
      h('label', { class: 'wb-te-colrow' }, cont, ' Continue SQL script execution on errors (by default)'),
      h('div', { class: 'wb-form-btns' }, h('div', { class: 'spacer' }),
        h('button', { class: 'lab-btn primary', onclick: () => {
          const changed = prefs.safeUpdates !== safe.checked;
          prefs.safeUpdates = safe.checked;
          prefs.limitRows = Math.max(0, Number(limit.value) || 0);
          prefs.stopOnError = !cont.checked;
          conn.lab.store.touch();
          w.close();
          if (changed) conn.desk.message({ title: 'Preferences', text: 'Safe Updates ayarı yeniden bağlanınca geçerli olur.', detail: 'Query > Reconnect to Server menüsünü kullanın.', icon: 'info', owner: conn.win });
        } }, 'OK'),
        h('button', { class: 'lab-btn', onclick: () => w.close() }, 'Cancel')))));
  w.center();
}

export { downloadText };
