// Laboratuvarda kurulan C# programlarını (Setup ile) çalıştırır: .NET motoru yüklenir,
// program sanal bir pencerede açılır, MySQL bağlantıları laboratuvardaki sunucuya gider.
import { h } from '../js/ui.js';
import { loadEngine, setHost } from '../js/engine.js';
import { Desktop as Runner } from '../js/runner.js';
import { attachMysql } from '../js/mysqlbridge.js';
import { ICONS } from './icons.js';

let current = null;

export async function runInstalledApp(lab, exePath) {
  const { desk, store } = lab;
  const raw = store.readFile(exePath);
  if (!raw || !raw.startsWith('APP:')) {
    await desk.message({ title: exePath.split('/').pop(), text: 'Bu dosya geçerli bir Windows uygulaması değil.', icon: 'error' });
    return;
  }
  const app = JSON.parse(raw.slice(4));
  if (current && !current.win.closed) {
    const r = await desk.message({ title: app.product, text: `Zaten çalışan bir program var (${current.title}). Kapatılıp bu program açılsın mı?`, icon: 'question', buttons: [{ text: 'Evet', value: 'y', primary: true }, { text: 'Hayır', value: null }] });
    if (r !== 'y') return;
    await current.win.close(true);
  }
  const root = h('div', { class: 'lab-app-desk' });
  const status = h('div', { class: 'lab-app-status' }, '.NET çalışma zamanı yükleniyor…');
  const win = desk.open({ title: app.product, icon: app.iconData ? `<img src="${app.iconData}" style="width:18px;height:18px">` : ICONS.app, width: 900, height: 620, onClosed: () => { try { engineRef?.Stop(); } catch { /* yok */ } current = null; } });
  win.body.append(status, root);
  current = { win, title: app.product };
  let engineRef = null;
  attachMysql(store);
  let engine;
  try {
    engine = await loadEngine((l, t) => { status.textContent = `.NET çalışma zamanı yükleniyor… %${t ? Math.round((l / t) * 100) : 0}`; });
  } catch (e) {
    status.textContent = 'Program başlatılamadı: ' + e.message;
    return;
  }
  engineRef = engine;
  status.remove();
  const dir = exePath.slice(0, exePath.lastIndexOf('/'));
  const config = store.readFile(exePath + '.config');
  const runner = new Runner(root, {
    onOutput: () => {},
    onError: (info) => desk.message({ title: app.product, text: [h('b', {}, 'Uygulamada işlenmemiş bir özel durum oluştu.'), `${(info.type || '').split('.').pop()}: ${info.message}`], icon: 'error', owner: win, width: 520 }),
    onEnded: () => { if (!win.closed) win.close(true); },
    onDataFile: (name, content) => store.writeFile(`${dir}/${name}`, content),
    onDownload: () => {},
  });
  runner.attach(engine);
  runner.start();
  setHost(runner);
  const files = [...(app.dataFiles || []).map((f) => ({ name: f.name, content: store.readFile(`${dir}/${f.name}`) ?? f.content })), ...(config != null ? [{ name: 'App.config', content: config }] : [])];
  const err = engine.RunAssembly(app.asm, app.pdb || '', JSON.stringify(files));
  if (err) desk.message({ title: app.product, text: err, icon: 'error', owner: win });
}
