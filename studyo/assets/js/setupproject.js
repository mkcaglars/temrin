// Visual Studio Installer Projects benzeri "Setup Project": eklenti kurulumu, File System düzenleyicisi,
// kısayollar, özellikler ve Build (setup.exe + .msi laboratuvar masaüstüne yazılır).
import { h, modal, toast } from './ui.js';
import { ensureMysql, mysqlStore } from './mysqlbridge.js';

const FOLDERS = [['app', 'Application Folder'], ['desktop', "User's Desktop"], ['programs', "User's Programs Menu"]];
const DEFAULT_LOCATION = 'C:/Users/Ogrenci/Desktop';

const extKey = (ide) => 'csharp-ders-vsext-' + (ide.ctx.user?.uid || '');
export function hasInstallerExtension(ide) {
  try { return localStorage.getItem(extKey(ide)) === '1'; } catch { return false; }
}

/** Extensions > Manage Extensions */
export async function manageExtensions(ide) {
  let installed = hasInstallerExtension(ide);
  let q = '';
  const list = h('div', { class: 'nu-left' });
  const search = h('input', { class: 'input', placeholder: 'Search (Ctrl+E)' });
  const exts = [
    { id: 'installer', name: 'Microsoft Visual Studio Installer Projects 2022', author: 'Microsoft', desc: 'This official Microsoft extension provides support for Visual Studio Installer Projects in Visual Studio.' },
    { id: 'mysqlvs', name: 'MySQL for Visual Studio', author: 'Oracle', desc: 'MySQL for Visual Studio provides access to MySQL objects and data from Visual Studio. (MySQL Installer ile kurulur)', na: true },
    { id: 'gitext', name: 'Git Extensions', author: 'Git Extensions', desc: 'Git Extensions is a toolkit to make working with Git more intuitive.', na: true },
  ];
  const render = () => {
    list.innerHTML = '';
    for (const e of exts.filter((x) => !q || (x.name + x.desc).toLowerCase().includes(q.toLowerCase()))) {
      const isInst = e.id === 'installer' && installed;
      list.appendChild(h('div', { class: 'nu-item' }, h('div', { class: 'nu-ico' }, e.name[0]),
        h('div', { class: 'nu-text' }, h('b', {}, e.name), h('div', { class: 'muted small' }, e.desc), h('div', { class: 'muted small' }, 'Created by: ' + e.author)),
        isInst ? h('span', { class: 'nu-check' }, '✔ Installed') : e.na ? h('span', { class: 'muted small' }, 'simülatörde yok') : h('button', { class: 'btn btn-primary', onclick: async () => {
          await modal({ title: 'Manage Extensions', body: 'Your download has started. Changes will be scheduled and will start when all Microsoft Visual Studio windows are closed.', buttons: [{ text: 'OK', value: 'ok', primary: true }] });
          await modal({ title: 'VSIX Installer', body: h('div', {}, h('p', {}, 'Visual Studio kapatıldı; eklenti kuruluyor...'), h('div', { class: 'progress' }, h('div', { class: 'progress-fill', style: { width: '100%' } })), h('p', {}, '✔ Modifications Complete — Microsoft Visual Studio Installer Projects 2022')), buttons: [{ text: 'Close', value: 'ok', primary: true }] });
          try { localStorage.setItem(extKey(ide), '1'); } catch { /* yok */ }
          installed = true;
          ide.log('Microsoft Visual Studio Installer Projects eklentisi kuruldu. Artık "Setup Project" eklenebilir.', 'o-ok');
          render();
        } }, 'Download')));
    }
  };
  search.oninput = () => { q = search.value; render(); };
  render();
  await modal({ title: 'Manage Extensions', width: 760, body: h('div', { class: 'nu' }, h('div', { class: 'nu-head' }, h('b', {}, 'Visual Studio Marketplace'), h('div', { class: 'spacer' }), search), list), buttons: [{ text: 'Close', value: null }] });
}

/** File > Add > New Project > Setup Project */
export async function addSetupProject(ide) {
  if (ide.data.setup) { ide.openSetup(); return; }
  if (!hasInstallerExtension(ide)) {
    await modal({ title: 'Add a new project', body: 'Proje şablonlarında "Setup Project" yok. Önce Proje ▾ > Extensions > Manage Extensions penceresinden "Microsoft Visual Studio Installer Projects" eklentisini kurun.', buttons: [{ text: 'OK', value: 'ok', primary: true }] });
    return;
  }
  const name = h('input', { class: 'input', value: `${ide.data.namespace}Setup` });
  const loc = h('input', { class: 'input', value: DEFAULT_LOCATION.replace(/\//g, '\\') });
  const r = await modal({ title: 'Configure your new project', width: 560, body: h('div', { class: 'efw-col' }, h('b', {}, 'Setup Project'), h('div', { class: 'muted small' }, 'Create a Windows Installer project to which files can be added. This project type can be built into an MSI.'),
    h('div', { class: 'wb-form-row' }, h('label', {}, 'Project name'), name), h('div', { class: 'wb-form-row' }, h('label', {}, 'Location'), loc)),
  buttons: [{ text: 'Back', value: null }, { text: 'Create', value: 'ok', primary: true, validate: () => /^[A-Za-z_][\w.]*$/.test(name.value.trim()) || (toast('Geçerli bir proje adı yazın.', 'error'), false) }] });
  if (r !== 'ok') return;
  ide.data.setup = {
    name: name.value.trim(), location: loc.value.trim().replace(/\\/g, '/').replace(/\/$/, ''),
    items: [],
    props: { ProductName: name.value.trim(), Manufacturer: 'Default Company Name', Author: 'Default Company Name', Version: '1.0.0', Title: name.value.trim(), Subject: '', Description: '', Keywords: '', ManufacturerUrl: '', SupportPhone: '', SupportUrl: '', AddRemoveProgramsIcon: '(None)', DetectNewerInstalledVersion: true, InstallAllUsers: false, Localization: 'English (United States)', RemovePreviousVersions: false, TargetPlatform: 'x86' },
  };
  ide.markDirty();
  ide.renderSolution();
  ide.openSetup();
}

let uid = 1;
const newId = () => 's' + Date.now().toString(36) + (uid++);

/** Setup projesi sekmesi (File System düzenleyicisi + özellikler) */
export function renderSetup(ide, container) {
  const s = ide.data.setup;
  container.innerHTML = '';
  if (!s) return;
  let folder = ide._setupFolder || 'app';
  let sel = null;
  let showProps = !!ide._setupProps;
  const tree = h('div', { class: 'su-tree' });
  const list = h('div', { class: 'su-list' });
  const props = h('div', { class: 'su-props' });
  const outputName = (it) => (it.kind === 'output' ? `Primary output from ${ide.data.namespace} (Active)` : it.name);
  const save = () => { ide.markDirty(); render(); };
  const render = () => {
    ide._setupFolder = folder;
    tree.innerHTML = '';
    tree.appendChild(h('div', { class: 'su-node root' }, '🖥 File System on Target Machine'));
    for (const [id, label] of FOLDERS) {
      const n = h('div', { class: 'su-node' + (folder === id ? ' sel' : '') }, '📁 ' + label);
      n.onclick = () => { folder = id; sel = null; render(); };
      n.addEventListener('dragover', (e) => { e.preventDefault(); n.classList.add('drop'); });
      n.addEventListener('dragleave', () => n.classList.remove('drop'));
      n.addEventListener('drop', (e) => {
        e.preventDefault();
        const it = s.items.find((x) => x.id === e.dataTransfer.getData('text/x-setup-item'));
        if (it) {
          if (it.kind === 'output' && id !== 'app') { toast('Primary output yalnızca Application Folder içinde olabilir.', 'error'); return; }
          it.folder = id;
          save();
        }
      });
      tree.appendChild(n);
    }
    list.innerHTML = '';
    list.appendChild(h('div', { class: 'su-row head' }, h('span', {}, 'Name'), h('span', {}, 'Type')));
    const items = s.items.filter((x) => x.folder === folder);
    for (const it of items) {
      const row = h('div', { class: 'su-row' + (sel === it ? ' sel' : ''), draggable: 'true' },
        h('span', {}, it.kind === 'shortcut' ? '↪ ' : it.kind === 'output' ? '⚙ ' : '📄 ', outputName(it)),
        h('span', { class: 'muted' }, it.kind === 'output' ? 'Output' : it.kind === 'shortcut' ? 'Shortcut' : 'File'));
      row.onclick = () => { sel = it; showProps = false; render(); };
      row.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/x-setup-item', it.id));
      row.addEventListener('contextmenu', (e) => { e.preventDefault(); sel = it; render(); itemMenu(e.clientX, e.clientY, it); });
      list.appendChild(row);
    }
    if (!items.length) list.appendChild(h('div', { class: 'muted su-empty' }, folder === 'app' ? 'Boş. Sağ tıklayın: Add > Project Output... (Primary output) ve Add > File... (ikon)' : 'Boş. Application Folder\'da oluşturduğunuz kısayolu buraya sürükleyin.'));
    list.oncontextmenu = (e) => { if (e.target === list || e.target.classList.contains('su-empty')) { e.preventDefault(); folderMenu(e.clientX, e.clientY); } };
    renderProps();
  };
  const menu = (x, y, items) => {
    document.querySelector('.ide-dropdown')?.remove();
    const m = h('div', { class: 'ide-dropdown', style: { left: x + 'px', top: y + 'px' } }, ...items.map((it) => (it ? h('button', { class: 'ide-dd-item', disabled: !!it[2], onclick: () => { m.remove(); it[1](); } }, it[0]) : h('div', { class: 'ide-dd-sep' }))));
    document.body.appendChild(m);
    setTimeout(() => document.addEventListener('mousedown', function off(e) { if (!m.contains(e.target)) { m.remove(); document.removeEventListener('mousedown', off); } }), 0);
  };
  const folderMenu = (x, y) => menu(x, y, [
    ['Add > Project Output...', addOutput, folder !== 'app'],
    ['Add > File...', addFile],
    ['Add > Folder', () => toast('Alt klasör simülatörde gerekmiyor.', 'info')],
  ]);
  const itemMenu = (x, y, it) => menu(x, y, [
    [`Create Shortcut to ${outputName(it)}`, () => {
      const sc = { id: newId(), folder: it.folder, kind: 'shortcut', name: `Shortcut to ${outputName(it)}`, target: it.id, icon: null };
      s.items.push(sc);
      sel = sc;
      save();
    }, it.kind === 'shortcut'],
    ['Rename', async () => {
      const inp = h('input', { class: 'input', value: it.name || outputName(it) });
      const r = await modal({ title: 'Rename', body: inp, buttons: [{ text: 'Cancel', value: null }, { text: 'OK', value: 'ok', primary: true }] });
      if (r === 'ok' && inp.value.trim()) { it.name = inp.value.trim(); save(); }
    }, it.kind === 'output'],
    null,
    ['Delete', () => { s.items = s.items.filter((x) => x !== it && x.target !== it.id); sel = null; save(); }],
    null,
    ['Properties Window', () => { sel = it; showProps = false; render(); }],
  ]);
  const addOutput = async () => {
    const r = await modal({ title: 'Add Project Output Group', width: 440, body: h('div', { class: 'efw-col' }, h('div', { class: 'wb-form-row' }, h('label', {}, 'Project:'), h('b', {}, ide.data.namespace)),
      h('div', { class: 'efw-items' }, ...['Primary output', 'Localized resources', 'Debug Symbols', 'Content Files', 'Source Files', 'Documentation Files', 'XML Serialization Assemblies'].map((x, i) => h('div', { class: 'efw-item' + (i === 0 ? ' sel' : ' dis') }, x))),
      h('div', { class: 'wb-form-row' }, h('label', {}, 'Configuration:'), h('span', {}, '(Active)')), h('div', { class: 'muted small' }, 'Description: Contains the DLL or EXE built by the project.')),
    buttons: [{ text: 'Cancel', value: null }, { text: 'OK', value: 'ok', primary: true }] });
    if (r !== 'ok') return;
    if (s.items.some((x) => x.kind === 'output')) { toast('Primary output zaten ekli.', 'info'); return; }
    s.items.push({ id: newId(), folder: 'app', kind: 'output', name: 'Primary output' });
    ide.log(`Primary output from ${ide.data.namespace} (Active) eklendi. Bağımlılıklar (ör. MySql.Data.dll) otomatik algılandı.`, 'o-info');
    save();
  };
  const addFile = () => {
    const inp = h('input', { type: 'file', accept: '.ico,.png,.jpg,.jpeg,.bmp,.gif,.txt,.sql,.config', class: 'hidden' });
    inp.onchange = () => {
      const f = inp.files[0];
      if (!f) return;
      if (f.size > 300 * 1024) { toast('Dosya çok büyük (en fazla 300 KB).', 'error'); return; }
      const rd = new FileReader();
      rd.onload = () => { s.items.push({ id: newId(), folder, kind: 'file', name: f.name, content: rd.result }); save(); };
      rd.readAsDataURL(f);
    };
    document.body.appendChild(inp);
    inp.click();
    setTimeout(() => inp.remove(), 60000);
  };
  const renderProps = () => {
    props.innerHTML = '';
    if (showProps || !sel) {
      props.appendChild(h('div', { class: 'su-ph' }, `${s.name} — Deployment Project Properties`));
      for (const [k, v] of Object.entries(s.props)) {
        let input;
        if (typeof v === 'boolean') {
          input = h('select', { class: 'input' }, h('option', { value: 'True', selected: v }, 'True'), h('option', { value: 'False', selected: !v }, 'False'));
          input.onchange = () => { s.props[k] = input.value === 'True'; ide.markDirty(); };
        } else if (k === 'AddRemoveProgramsIcon') {
          const icons = s.items.filter((x) => x.kind === 'file' && /\.(ico|png)$/i.test(x.name));
          input = h('select', { class: 'input' }, h('option', { value: '(None)' }, '(None)'), ...icons.map((x) => h('option', { value: x.id, selected: v === x.id }, x.name)));
          input.onchange = () => { s.props[k] = input.value; ide.markDirty(); };
        } else if (k === 'Localization') {
          input = h('select', { class: 'input' }, ...['English (United States)', 'Turkish', 'German', 'French'].map((x) => h('option', { selected: v === x }, x)));
          input.onchange = () => { s.props[k] = input.value; ide.markDirty(); };
        } else if (k === 'TargetPlatform') {
          input = h('select', { class: 'input' }, ...['x86', 'x64', 'ARM64'].map((x) => h('option', { selected: v === x }, x)));
          input.onchange = () => { s.props[k] = input.value; ide.markDirty(); };
        } else {
          input = h('input', { class: 'input', value: v });
          input.oninput = () => { s.props[k] = input.value; ide.markDirty(); };
        }
        props.appendChild(h('div', { class: 'su-prop' }, h('label', {}, k), input));
      }
      return;
    }
    const it = sel;
    props.appendChild(h('div', { class: 'su-ph' }, it.kind === 'shortcut' ? 'Shortcut Properties' : it.kind === 'output' ? 'Project Output Properties' : 'File Properties'));
    const row = (k, el) => props.appendChild(h('div', { class: 'su-prop' }, h('label', {}, k), el));
    if (it.kind === 'shortcut') {
      const name = h('input', { class: 'input', value: it.name });
      name.oninput = () => { it.name = name.value; ide.markDirty(); };
      name.onchange = () => render();
      row('(Name)', name);
      const icons = s.items.filter((x) => x.kind === 'file' && x.folder === 'app' && /\.(ico|png)$/i.test(x.name));
      const icon = h('select', { class: 'input' }, h('option', { value: '' }, '(None)'), ...icons.map((x) => h('option', { value: x.id, selected: it.icon === x.id }, x.name)));
      icon.onchange = () => { it.icon = icon.value || null; ide.markDirty(); };
      row('Icon', icon);
      row('Target', h('span', {}, outputName(s.items.find((x) => x.id === it.target) || {})));
      row('Folder', h('span', {}, FOLDERS.find((f) => f[0] === it.folder)[1]));
      if (!icons.length) props.appendChild(h('div', { class: 'muted small' }, 'İkon seçebilmek için önce Application Folder\'a Add > File... ile bir .ico dosyası ekleyin.'));
    } else if (it.kind === 'file') {
      row('(Name)', h('span', {}, it.name));
      if (/^data:image/.test(it.content)) props.appendChild(h('img', { src: it.content, class: 'su-icon-prev' }));
    } else {
      row('(Name)', h('span', {}, outputName(it)));
      row('Dependencies', h('span', {}, ['.NET Framework', ...(ide.allReferences().includes('MySql.Data') ? ['MySql.Data.dll'] : []), ...(ide.allReferences().includes('EntityFramework') ? ['EntityFramework.dll'] : [])].join(', ')));
    }
  };
  const toolbar = h('div', { class: 'edmx-bar' }, h('b', {}, `${s.name} (File System)`), h('div', { class: 'spacer' }),
    h('button', { class: 'btn btn-sm', onclick: () => { showProps = true; sel = null; ide._setupProps = true; render(); } }, 'Properties'),
    h('button', { class: 'btn btn-sm btn-primary', onclick: () => buildSetup(ide) }, 'Build'),
    h('button', { class: 'btn btn-sm', onclick: async () => {
      const r = await modal({ title: 'Remove', body: `"${s.name}" setup projesi çözümden kaldırılsın mı?`, buttons: [{ text: 'Cancel', value: null }, { text: 'Remove', value: 'ok', danger: true }] });
      if (r === 'ok') { ide.data.setup = null; ide.closeTab(ide.tabKey('setup', s.name)); ide.markDirty(); ide.renderSolution(); }
    } }, 'Remove'));
  container.append(toolbar, h('div', { class: 'su' }, tree, list, props),
    h('div', { class: 'edmx-foot muted small' }, 'Kitaptaki adımlar: Application Folder > Add > Project Output > Primary output; Primary output\'a sağ tıklayıp "Create Shortcut..." (iki kez); kısayolları adlandırıp User\'s Desktop ve User\'s Programs Menu klasörlerine sürükleyin; Add > File ile ikon ekleyip kısayolların Icon özelliğinden seçin; Properties; Build.'));
  render();
}

/** Setup projesini derler: laboratuvar masaüstüne setup.exe ve .msi yazar */
export async function buildSetup(ide) {
  const s = ide.data.setup;
  if (!s) return;
  const r = await ide.build();
  if (!r?.success) { ide.log('========== Build: 0 succeeded, 1 failed ==========', 'o-err'); return; }
  const engine = await ide.engine();
  const out = JSON.parse(engine.LastBuildOutput() || '{}');
  if (!out.asm) return;
  ide.showBottom('output');
  const t0 = performance.now();
  ide.log(`------ Build started: Project: ${s.name}, Configuration: Debug ------`, 'o-info');
  const exe = `${ide.data.namespace}.exe`;
  const dir = `${s.location}/${s.name}/Debug`;
  const winDir = dir.replace(/\//g, '\\');
  ide.log(`Building file '${winDir}\\${s.name}.msi'...`);
  const hasOutput = s.items.some((x) => x.kind === 'output');
  if (!hasOutput) ide.log(`WARNING: Application Folder içinde "Primary output" yok; kurulan programda ${exe} olmayacak.`, 'o-err');
  const refs = ide.allReferences();
  const deps = [...(refs.includes('MySql.Data') ? ['MySql.Data.dll'] : []), ...(refs.includes('EntityFramework') ? ['EntityFramework.dll', 'EntityFramework.SqlServer.dll', 'MySql.Data.EntityFramework.dll'] : [])];
  if (hasOutput) for (const f of [exe, ...deps, ...(ide.data.files.some((f) => /^app\.config$/i.test(f.name)) ? [`${exe}.config`] : [])]) ide.log(`Packaging file '${f}'...`);
  for (const it of s.items.filter((x) => x.kind === 'file')) ide.log(`Packaging file '${it.name}'...`);
  const config = ide.data.files.find((f) => /^app\.config$/i.test(f.name))?.content || null;
  const pj = JSON.parse(ide.projectJson(true));
  const pkg = {
    product: s.props.ProductName || s.name, manufacturer: s.props.Manufacturer || 'Default Company Name', version: s.props.Version || '1.0.0', title: s.props.Title || s.name,
    author: s.props.Author, allUsers: !!s.props.InstallAllUsers, exe, hasOutput, deps, asm: out.asm, pdb: out.pdb, config,
    dataFiles: (pj.dataFiles || []).filter((f) => f.name !== 'App.config'),
    items: s.items.map((it) => ({ folder: it.folder, kind: it.kind, name: it.kind === 'output' ? exe : it.name, content: it.kind === 'file' ? it.content : undefined, target: it.target ? (s.items.find((x) => x.id === it.target)?.kind === 'output' ? exe : s.items.find((x) => x.id === it.target)?.name) : undefined, icon: it.icon ? s.items.find((x) => x.id === it.icon)?.name : undefined })),
    arpIcon: s.props.AddRemoveProgramsIcon !== '(None)' ? s.items.find((x) => x.id === s.props.AddRemoveProgramsIcon)?.name : null,
  };
  try {
    await ensureMysql(ide.ctx.user);
    const store = mysqlStore();
    await store.mergeFiles({
      [`${dir}/${s.name}.msi`]: { content: 'APPSETUP:' + JSON.stringify(pkg), kind: 'msi' },
      [`${dir}/setup.exe`]: { content: `SETUPEXE:${dir}/${s.name}.msi`, kind: 'msi' },
    });
  } catch (e) {
    ide.log('Setup dosyaları laboratuvara yazılamadı: ' + e.message, 'o-err');
    if (e.status === 413) ide.log('İpucu: Kurulum paketi çok büyük. Büyük resim dosyalarını çıkarın.', 'o-err');
    return;
  }
  const secs = ((performance.now() - t0) / 1000).toFixed(1).replace('.', ',');
  ide.log(`========== Build: 1 succeeded, 0 failed (${secs} sn) ==========`, 'o-ok');
  ide.log(`Kurulum dosyaları laboratuvarda: ${winDir}\\setup.exe ve ${s.name}.msi — Laboratuvarı açıp Dosya Gezgini > Masaüstü klasöründen çalıştırın.`, 'o-info');
  toast('Setup oluşturuldu: laboratuvar masaüstündeki klasörde setup.exe ve .msi var.', 'success', 6000);
}
