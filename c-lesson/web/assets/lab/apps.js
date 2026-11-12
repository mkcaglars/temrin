// Simülatör ayarları ve Windows Hizmetler penceresi.
import { h } from '../js/ui.js';
import { ICONS } from './icons.js';
import { installEverything, defaultState } from './store.js';
import { api } from '../js/api.js';

export function openSettings(lab) {
  const { desk, store, server } = lab;
  if (lab.settingsWin && !lab.settingsWin.closed) { lab.settingsWin.focus(); return; }
  const w = desk.open({ title: 'Simülatör Ayarları', icon: ICONS.settings, width: 620, height: 560 });
  lab.settingsWin = w;
  const body = h('div', { class: 'lab-settings' });
  w.body.appendChild(body);
  const render = () => {
    body.innerHTML = '';
    const st = store.state;
    const installed = st.install.mysql;
    const mode = (val, title, desc) => {
      const r = h('input', { type: 'radio', name: 'labmode', checked: st.mode === val, disabled: installed });
      r.onchange = () => { st.mode = val; store.touch(); render(); desk.renderIcons(); };
      return h('label', { class: 'lab-set-opt' + (installed ? ' disabled' : '') }, r, h('div', {}, h('b', {}, title), h('div', { class: 'muted' }, desc)));
    };
    const task = h('input', { type: 'checkbox', checked: st.taskMode });
    task.onchange = () => { st.taskMode = task.checked; store.touch(); lab.tasks.toggle(task.checked); };
    const root = server.users.find((u) => u.user === 'root' && u.host === 'localhost');
    const pwSpan = h('code', { class: 'lab-pw' }, '••••••');
    let shown = false;
    body.append(
      h('h3', {}, 'Sürüm'),
      mode('book', 'Kitaptaki sürümler', 'MySQL Installer 8.0 (Developer Default), MySQL Server 8.0, Workbench 8.0, Visual Studio 2019/2022'),
      mode('new', 'Güncel sürümler', 'MySQL 8.4 LTS (MSI + MySQL Configurator), Workbench 8.0 (güncel), Visual Studio 2026'),
      installed ? h('div', { class: 'muted small' }, `Kurulu sunucu sürümü: ${server.version}. Sürümü değiştirmek için önce MySQL'i kaldırın.`) : null,
      h('h3', {}, 'Çalışma biçimi'),
      h('label', { class: 'lab-set-opt' }, task, h('div', {}, h('b', {}, 'Görev modu'), h('div', { class: 'muted' }, 'Görevler paneli açık olur; kitaptaki ve öğretmeninizin verdiği adımlar otomatik denetlenir. Kapalıyken serbest çalışırsınız.'))),
      h('h3', {}, 'MySQL'),
      installed
        ? h('div', { class: 'lab-set-row' }, h('span', {}, 'root şifresi: '), pwSpan,
          h('button', { class: 'lab-btn', onclick: () => { shown = !shown; pwSpan.textContent = shown ? (root?.password || '(boş)') : '••••••'; } }, 'Göster / Gizle'),
          h('button', { class: 'lab-btn', onclick: async () => {
            const inp = h('input', { class: 'lab-input', type: 'text' });
            const r = await desk.message({ title: 'root şifresini sıfırla', text: 'Yeni root şifresi:', extra: inp, icon: '', buttons: [{ text: 'Tamam', value: 'ok', primary: true }, { text: 'İptal', value: null }], owner: w });
            if (r !== 'ok') return;
            server.setRootPassword(inp.value);
            for (const c of st.connections) if (c.user === 'root') c.password = null;
            store.touch();
            lab.events.emit('root-reset', {});
            render();
          } }, 'Sıfırla'))
        : h('div', {}, h('div', { class: 'muted' }, 'MySQL henüz kurulmadı. Kurulumu kitaptaki gibi yapmak için masaüstündeki İnternet Tarayıcısı ile indirme sayfasına gidin.'),
          h('button', { class: 'lab-btn', onclick: async () => {
            const inp = h('input', { class: 'lab-input', type: 'text', value: '' });
            const r = await desk.message({ title: 'Kurulumu atla', text: ['MySQL Server ve Workbench kurulmuş, yapılandırılmış olarak başlatılır.', 'root şifresi belirleyin:'], extra: inp, icon: 'question', buttons: [{ text: 'Kur', value: 'ok', primary: true }, { text: 'İptal', value: null }], owner: w });
            if (r !== 'ok') return;
            installEverything(st, server, inp.value);
            store.touch();
            desk.renderIcons();
            lab.events.emit('installed', { quick: true });
            render();
          } }, 'MySQL ve Workbench\'i hazır kur')),
      installed ? h('div', { class: 'lab-set-row' }, h('button', { class: 'lab-btn', onclick: async () => {
        const r = await desk.message({ title: 'MySQL\'i kaldır', text: 'MySQL Server ve Workbench kaldırılsın mı? Veritabanlarınız (Data klasörü) silinmez.', icon: 'warning', buttons: [{ text: 'Kaldır', value: 'y', primary: true }, { text: 'İptal', value: null }], owner: w });
        if (r !== 'y') return;
        Object.assign(st.install, { mysql: false, workbench: false, shell: false, configured: false, products: [] });
        for (const c of [...desk.windows]) if (c.title.startsWith('MySQL')) c.close(true);
        store.touch();
        desk.renderIcons();
        render();
      } }, 'MySQL\'i kaldır')) : null,
      h('h3', {}, 'Laboratuvarı sıfırla'),
      h('div', { class: 'muted' }, 'Tüm veritabanları, dosyalar ve kurulum bilgileri silinir; laboratuvar ilk günkü hâline döner.'),
      h('button', { class: 'lab-btn danger', onclick: async () => {
        const r = await desk.message({ title: 'Laboratuvarı sıfırla', text: 'Her şey silinecek. Emin misiniz?', icon: 'warning', buttons: [{ text: 'Sıfırla', value: 'y', primary: true }, { text: 'İptal', value: null }], owner: w });
        if (r !== 'y') return;
        for (const name of server.databaseNames()) { server.dropDatabase(name); try { await api.deleteLabDatabase(name); } catch { /* yok */ } }
        store.state = defaultState();
        server.users = [{ user: 'root', host: 'localhost', password: '', grants: [{ db: '*', table: '*', privs: ['ALL PRIVILEGES'], grantOption: true }] }];
        server.setRunning(true);
        await api.saveLabState({ ...store.state, server: server.exportState() });
        location.reload();
      } }, 'Her şeyi sıfırla'),
    );
  };
  render();
  store.on((ev) => { if (ev.type === 'state' && !w.closed) { /* açık pencere güncel kalsın */ } });
}

export function openServices(lab) {
  const { desk, store, server } = lab;
  const w = desk.open({ title: 'Hizmetler', icon: ICONS.settings, width: 760, height: 420 });
  const tb = h('tbody');
  let sel = null;
  const status = h('div', { class: 'lab-svc-actions' });
  const render = () => {
    tb.innerHTML = '';
    const rows = [];
    if (store.state.install.mysql) rows.push({ id: 'mysql', name: store.state.install.serviceName || 'MySQL80', desc: 'MySQL Server', status: server.running ? 'Çalışıyor' : '', start: store.state.install.autoStart ? 'Otomatik' : 'El ile', logon: 'Ağ Hizmeti' });
    rows.push({ name: 'Windows Update', desc: 'Windows ve diğer programlar için güncelleştirmeleri algılar ve yükler.', status: 'Çalışıyor', start: 'El ile (Tetikleyici Başlat)', logon: 'Yerel Sistem' });
    rows.push({ name: 'Yazdırma Biriktiricisi', desc: 'Yazdırma işlerini biriktirir.', status: 'Çalışıyor', start: 'Otomatik', logon: 'Yerel Sistem' });
    for (const r of rows) {
      const tr = h('tr', { class: sel === r.id && r.id ? 'sel' : '' }, h('td', {}, r.name), h('td', {}, r.desc), h('td', {}, r.status), h('td', {}, r.start), h('td', {}, r.logon));
      tr.onclick = () => { sel = r.id || null; render(); };
      tb.appendChild(tr);
    }
    status.innerHTML = '';
    if (sel === 'mysql') {
      status.append(h('b', {}, store.state.install.serviceName || 'MySQL80'),
        h('button', { class: 'lab-btn', disabled: server.running, onclick: () => { server.setRunning(true); store.touch(); lab.events.emit('service', { running: true }); render(); } }, 'Hizmeti başlat'),
        h('button', { class: 'lab-btn', disabled: !server.running, onclick: () => { server.setRunning(false); store.touch(); lab.events.emit('service', { running: false }); render(); } }, 'Hizmeti durdur'),
        h('button', { class: 'lab-btn', disabled: !server.running, onclick: () => { server.setRunning(false); server.setRunning(true); store.touch(); lab.events.emit('service', { running: true }); render(); } }, 'Hizmeti yeniden başlat'));
    } else status.appendChild(h('span', { class: 'muted' }, 'Ayrıntılar için bir hizmet seçin.'));
  };
  w.body.appendChild(h('div', { class: 'lab-col' }, status, h('div', { class: 'wb-grid-scroll' }, h('table', { class: 'wb-grid' }, h('thead', {}, h('tr', {}, ...['Ad', 'Açıklama', 'Durum', 'Başlangıç Türü', 'Oturum Açma'].map((x) => h('th', {}, x)))), tb))));
  render();
}
