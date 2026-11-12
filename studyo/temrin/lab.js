// Temrin laboratuvar ekranı: c-lesson Laboratuvar Simülatörü (MySQL, Workbench, sanal masaüstü) + Temrin paneli.
// Laboratuvar bu temrine ve öğrenciye aittir (api/calisma.php lab_*). build.sh bu dosyayı studyo/temrin/lab.js olarak kopyalar.
// c-lesson'un lab/main.js dosyasının uyarlamasıdır; c-lesson'un kendi görev sistemi yerine Temrin paneli kullanılır.
import { calismaYukle, labKaydiniKapat } from '../assets/js/api.js';
import { h, toast } from '../assets/js/ui.js';
import { LabStore, DOWNLOADS, DOCS } from '../assets/lab/store.js';
import { Desktop, openExplorer, openNotepad } from '../assets/lab/desktop.js';
import { ICONS } from '../assets/lab/icons.js';
import { openWorkbench } from '../assets/lab/workbench/wb.js';
import { openSettings, openServices } from '../assets/lab/apps.js';
import { openMysqlCli } from '../assets/lab/cli.js';
import { openBrowser, openInstallerFile } from '../assets/lab/installer.js';
import { runInstalledApp } from '../assets/lab/runapp.js';
import { TemrinPaneli, ogretmenGorunumu, yarimKalaniTamamla } from './panel.js';
import { labDenetle, labHazirla, sqlJsYukle } from './lab-denetim.js';

const app = document.getElementById('app');

class Olaylar {
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

function yaz(metin) {
  const t = app.querySelector('.boot-text');
  if (t) t.textContent = metin;
}

function hata(baslik, metin) {
  app.replaceChildren(h('div', { class: 'center-page' }, h('div', { class: 'card' },
    h('h2', {}, baslik), h('p', {}, metin), h('a', { class: 'btn btn-primary', href: '../' }, 'Geri dön'))));
}

async function baslat() {
  let durum;
  try {
    durum = await calismaYukle();
  } catch (e) {
    hata('Temrin açılamadı', e.message);
    return;
  }
  const t = durum.temrin;
  if (t.bilgi.ortam === 'studyo') {
    location.replace('./' + location.search);
    return;
  }
  const c = durum.calisma;
  const saltOkunur = ogretmenGorunumu || !!c.teslim_zamani || !durum.erisilebilir;
  if (saltOkunur) labKaydiniKapat();

  yaz('Veritabanı motoru yükleniyor…');
  let SQL;
  try {
    SQL = await sqlJsYukle();
  } catch (e) {
    hata('Veritabanı motoru yüklenemedi', e.message);
    return;
  }
  yaz('Laboratuvar yükleniyor…');
  const user = { name: document.body.dataset.ad, role: document.body.dataset.rol };
  const store = new LabStore(SQL, user);
  try {
    await store.load();
    if (!saltOkunur) await labHazirla(store, t);
    store.enableSync();
  } catch (e) {
    hata('Laboratuvar yüklenemedi', e.message);
    return;
  }

  const masaustu = h('div', { class: 'temrin-lab-masaustu' });
  const sol = h('div', { class: 'temrin-lab-sol' });
  if (ogretmenGorunumu) {
    const o = c.ogrenci;
    sol.append(h('div', { class: 'ide-banner readonly' },
      `👁 ${o.okul_no} ${o.ad_soyad} (${o.sinif}) — Temrin ${t.bilgi.temrin_no} laboratuvarı. Salt okunur; denediğiniz değişiklikler kaydedilmez.`));
  } else if (c.teslim_zamani) {
    sol.append(h('div', { class: 'ide-banner note' }, '✔ Temrin teslim edildi. Laboratuvarı inceleyebilirsiniz; değişiklikler artık kaydedilmez.'));
  } else if (!durum.erisilebilir) {
    sol.append(h('div', { class: 'ide-banner readonly' }, `Temrin şu an kapalı: ${durum.neden}. Değişiklikler kaydedilmez.`));
  }
  sol.append(masaustu);
  const kapsayici = h('div', { class: 'temrin-lab' }, sol);
  app.replaceChildren(kapsayici);

  const lab = { user, store, server: store.server, events: new Olaylar(), SQL };
  lab.desk = new Desktop(masaustu, store);
  // c-lesson'un görev paneli Temrin'de yok; ayarlar penceresi "görev modu" için buna dokunur.
  lab.tasks = { toggle() {} };
  uygulamalariKaydet(lab);

  const alan = {
    teslimNotu: t.bilgi.ortam === 'ikisi' ? 'Bu temrinde C# projesi de var: temrini C# Form Stüdyosu sekmesinden teslim edin. Laboratuvardaki değişiklikler otomatik kaydedilir.' : null,
    async teslimVerisi() {
      await store.flush();
      labKaydiniKapat();
      return { veri: null };
    },
    async degerlendir(kontroller) {
      labKaydiniKapat();
      return { derlendi: true, hatalar: [], sonuclar: labDenetle(lab, kontroller) };
    },
  };
  const panel = new TemrinPaneli(alan, durum);
  kapsayici.append(panel.el);
  panel.ac(true);
  lab.desk.tray.prepend(h('button', { class: 'lab-tray-btn temrin-lab-panel-btn', title: 'Görev ve sorular', onclick: () => panel.ac(!panel.acik) }, '📋'));

  const kayitNoktasi = h('div', { class: 'lab-save', title: saltOkunur ? 'Salt okunur: değişiklikler kaydedilmez' : 'Kayıt durumu' });
  lab.desk.tray.appendChild(kayitNoktasi);
  if (!saltOkunur) {
    store.on((ev) => {
      if (ev.type === 'saved') { kayitNoktasi.className = 'lab-save ok'; kayitNoktasi.title = 'Tüm değişiklikler kaydedildi'; }
      if (ev.type === 'save-error') {
        kayitNoktasi.className = 'lab-save err';
        kayitNoktasi.title = 'Kaydedilemedi: ' + (ev.error?.message || '');
        toast('Laboratuvar kaydedilemedi: ' + (ev.error?.message || ''), 'error');
      }
      if (ev.type === 'change' || ev.type === 'state' || ev.type === 'files') { kayitNoktasi.className = 'lab-save pending'; kayitNoktasi.title = 'Kaydediliyor…'; }
    });
    window.addEventListener('beforeunload', (e) => {
      if (store.pending) {
        store.flush({ keepalive: true }).catch(() => {});
        e.preventDefault();
        e.returnValue = '';
      }
    });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && store.pending) store.flush({ keepalive: true }).catch(() => {}); });
  }
  window.__lab = lab;
  await yarimKalaniTamamla(alan, durum);
}

/** c-lesson lab/main.js'teki uygulama listesi ("Görevler" hariç). */
function uygulamalariKaydet(lab) {
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
  desk.register('settings', { label: 'Simülatör Ayarları', icon: ICONS.settings, desktop: true, start: true, open: () => openSettings(lab) });
  store.on((ev) => { if (ev.type === 'state') desk.renderIcons(); });
}

baslat();
