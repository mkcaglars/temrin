// Laboratuvar Simülatörü giriş noktası: oturum, sql.js, sanal masaüstü ve uygulamalar.
import { api } from '../js/api.js';
import { h, toast } from '../js/ui.js';
import { LabStore, installEverything, DOWNLOADS, DOCS } from './store.js';
import { Desktop, openExplorer, openNotepad } from './desktop.js';
import { ICONS } from './icons.js';
import { openWorkbench } from './workbench/wb.js';
import { openSettings, openServices } from './apps.js';
import { openMysqlCli } from './cli.js';
import { openBrowser, openInstallerFile } from './installer.js';
import { TaskPanel } from './tasks.js';
import { runInstalledApp } from './runapp.js';

const app = document.getElementById('app');

class Events {
  constructor() { this.map = new Map(); }
  on(type, fn) {
    if (!this.map.has(type)) this.map.set(type, new Set());
    this.map.get(type).add(fn);
    return () => this.map.get(type).delete(fn);
  }
  emit(type, data) {
    for (const fn of this.map.get(type) || []) { try { fn(data); } catch (e) { console.error(e); } }
    for (const fn of this.map.get('*') || []) { try { fn(type, data); } catch (e) { console.error(e); } }
  }
}

async function loadSqlJs() {
  if (!window.initSqlJs) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'lib/sqljs/sql-wasm.js';
      s.onload = resolve;
      s.onerror = () => reject(new Error('sql.js yüklenemedi'));
      document.head.appendChild(s);
    });
  }
  return window.initSqlJs({ locateFile: (f) => 'lib/sqljs/' + f });
}

async function boot() {
  let user;
  try {
    ({ user } = await api.me());
  } catch (e) {
    let info = {};
    try { info = await api.info(); } catch { /* yok */ }
    app.innerHTML = '';
    app.appendChild(h('div', { class: 'center-page' }, h('div', { class: 'card login-card' },
      h('h2', {}, e.status === 401 ? 'Oturum açılmamış' : 'Sunucuya bağlanılamadı'),
      h('p', {}, e.status === 401 ? 'Laboratuvara okul portalındaki bağlantı ile giriş yapılır.' : e.message),
      info.portal_url ? h('a', { class: 'btn btn-primary', href: info.portal_url }, 'Okul portalına git') : null,
      info.test_portal ? h('a', { class: 'btn', href: 'test-portal.php', style: { marginLeft: '8px' } }, 'Deneme girişi') : null)));
    return;
  }
  setBoot('Veritabanı motoru yükleniyor…');
  let SQL;
  try {
    SQL = await loadSqlJs();
  } catch (e) {
    setBoot('Veritabanı motoru yüklenemedi: ' + e.message);
    return;
  }
  setBoot('Laboratuvar verileri yükleniyor…');
  const store = new LabStore(SQL, user);
  try {
    await store.load();
    store.enableSync();
  } catch (e) {
    setBoot('Laboratuvar verileri yüklenemedi: ' + e.message);
    return;
  }
  app.innerHTML = '';
  const lab = { user, store, server: store.server, events: new Events(), SQL };
  window.__lab = lab;
  lab.desk = new Desktop(app, store);
  registerApps(lab);
  lab.tasks = new TaskPanel(lab);
  // kaydetme durumu
  const saveDot = h('div', { class: 'lab-save', title: 'Kayıt durumu' });
  lab.desk.tray.appendChild(saveDot);
  store.on((ev) => {
    if (ev.type === 'saved') { saveDot.className = 'lab-save ok'; saveDot.title = 'Tüm değişiklikler kaydedildi'; }
    if (ev.type === 'save-error') { saveDot.className = 'lab-save err'; saveDot.title = 'Kaydedilemedi: ' + (ev.error?.message || ''); toast('Laboratuvar kaydedilemedi: ' + (ev.error?.message || ''), 'error'); }
    if (ev.type === 'change' || ev.type === 'state' || ev.type === 'files') { saveDot.className = 'lab-save pending'; saveDot.title = 'Kaydediliyor…'; }
  });
  window.addEventListener('beforeunload', (e) => {
    if (store.pending) {
      store.flush({ keepalive: true }).catch(() => {});
      e.preventDefault();
      e.returnValue = '';
    }
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && store.pending) store.flush({ keepalive: true }).catch(() => {}); });
  if (!store.state.seen.welcome) welcome(lab);
}

function setBoot(text) {
  const t = app.querySelector('.boot-text');
  if (t) t.textContent = text;
}

function registerApps(lab) {
  const { desk, store } = lab;
  const inst = () => store.state.install;
  desk.register('workbench', { label: 'MySQL Workbench 8.0 CE', icon: ICONS.workbench, desktop: true, start: true, visible: () => inst().workbench, open: () => openWorkbench(lab) });
  desk.register('cli', { label: `MySQL ${store.state.mode === 'new' ? '8.4' : '8.0'} Command Line Client`, icon: ICONS.mysql, start: true, desktop: false, visible: () => inst().mysql, open: () => openMysqlCli(lab) });
  desk.register('explorer', { label: 'Dosya Gezgini', icon: ICONS.folder, desktop: true, start: true, open: () => openExplorer(desk, DOCS) });
  desk.register('downloads', { label: 'İndirilenler', icon: ICONS.folder, desktop: false, start: false, open: () => openExplorer(desk, DOWNLOADS) });
  desk.register('notepad', { label: 'Not Defteri', icon: ICONS.notepad, start: true, opens: ['txt', 'ini', 'cnf', 'log'], open: () => openNotepad(desk, null), openFile: (p) => openNotepad(desk, p) });
  desk.register('browser', { label: 'İnternet Tarayıcısı', icon: ICONS.browser, desktop: true, start: true, open: () => openBrowser(lab) });
  desk.register('app', { label: 'Uygulama', icon: ICONS.app, opens: ['exe'], openFile: (p) => {
    const c = String(store.readFile(p) || '');
    if (c.startsWith('SETUPEXE:') || c.startsWith('MSI:')) openInstallerFile(lab, p);
    else runInstalledApp(lab, p);
  } });
  desk.register('installer', { label: 'MySQL Installer - Community', icon: ICONS.installer, start: true, desktop: false, opens: ['msi'], visible: () => inst().products.length > 0 && store.state.mode === 'book', open: () => openInstallerFile(lab, null), openFile: (p) => openInstallerFile(lab, p) });
  desk.register('sqlfile', { label: 'SQL', icon: ICONS.sqlfile, opens: ['sql'], openFile: (p) => {
    if (inst().workbench) {
      const wb = openWorkbench(lab);
      const conn = wb.active || wb.conns[0];
      if (conn) conn.openQuery({ title: p.split('/').pop(), text: store.readFile(p) || '', file: p });
      else desk.message({ title: 'MySQL Workbench', text: 'Betiği açmak için önce bir bağlantı açın; ya da dosyayı Not Defteri ile açın.', icon: 'info', owner: wb.win });
    } else openNotepad(desk, p);
  } });
  desk.register('services', { label: 'Hizmetler', icon: ICONS.settings, start: true, open: () => openServices(lab) });
  desk.register('tasks', { label: 'Görevler', icon: ICONS.tasks, desktop: true, start: true, open: () => lab.tasks.toggle(true) });
  desk.register('settings', { label: 'Simülatör Ayarları', icon: ICONS.settings, desktop: true, start: true, open: () => openSettings(lab) });
  store.on((ev) => { if (ev.type === 'state') desk.renderIcons(); });
  void installEverything;
}

function welcome(lab) {
  const { desk, store } = lab;
  const text = [
    'Bu laboratuvar, kitaptaki MySQL kurulumu, MySQL Workbench, yedekleme/geri yükleme ve ilgili konuları bilgisayarınıza bir şey kurmadan denemeniz için hazırlanmış bir simülasyondur.',
    h('br'),
    '• Kuruluma başlamak için masaüstündeki "İnternet Tarayıcısı" ile MySQL indirme sayfasına gidin.',
    '• Görevler panelinden kitaptaki adımları sırayla yapabilirsiniz; adımlar otomatik denetlenir.',
    '• Serbest çalışmak isterseniz "Simülatör Ayarları"ndan görev modunu kapatabilir ya da kurulumu atlayabilirsiniz.',
    '• Yaptıklarınız (veritabanları, dosyalar) otomatik olarak kaydedilir.',
  ];
  desk.message({ title: 'Laboratuvar Simülatörü', text, icon: 'info', width: 560, buttons: [{ text: 'Başla', value: 'ok', primary: true }] }).then(() => {
    store.state.seen.welcome = true;
    store.touch();
  });
}

boot();
