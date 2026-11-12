// Visual Studio'daki "Add Reference" (Reference Manager) ve "Manage NuGet Packages" pencerelerinin benzeri.
import { h, modal, toast } from './ui.js';
import { api } from './api.js';

/** Projede varsayılan olarak bulunan başvurular (Windows Forms App (.NET Framework) şablonu) */
export const DEFAULT_REFS = ['Microsoft.CSharp', 'System', 'System.Configuration', 'System.Core', 'System.Data', 'System.Data.DataSetExtensions', 'System.Deployment', 'System.Drawing', 'System.Net.Http', 'System.Windows.Forms', 'System.Xml', 'System.Xml.Linq'];

const FRAMEWORK = ['Accessibility', 'Microsoft.CSharp', 'Microsoft.VisualBasic', 'PresentationCore', 'PresentationFramework', 'System', 'System.ComponentModel.DataAnnotations', 'System.Configuration', 'System.Core', 'System.Data', 'System.Data.DataSetExtensions', 'System.Deployment', 'System.Design', 'System.Drawing', 'System.IO.Compression', 'System.Net.Http', 'System.Runtime.Serialization', 'System.Transactions', 'System.Web', 'System.Windows.Forms', 'System.Xml', 'System.Xml.Linq', 'WindowsBase'];

export const NUGET = [
  { id: 'MySql.Data', author: 'Oracle', versions: ['9.1.0', '8.4.0', '8.0.33'], downloads: '61,2M', desc: 'MySql.Data.MySqlClient .Net Core Class Library', assembly: 'MySql.Data', deps: [] },
  { id: 'EntityFramework', author: 'Microsoft', versions: ['6.5.1', '6.4.4'], downloads: '228M', desc: 'Entity Framework 6 (EF6) is a tried and tested object-relational mapper for .NET with many years of feature development and stabilization.', deps: [] },
  { id: 'MySql.Data.EntityFramework', author: 'Oracle', versions: ['9.1.0', '8.4.0', '8.0.33'], downloads: '7,4M', desc: 'MySql.Data.EntityFramework', deps: ['MySql.Data', 'EntityFramework'] },
  { id: 'MySqlConnector', author: 'Bradley Grainger', versions: ['2.4.0'], downloads: '120M', desc: 'A truly async MySQL ADO.NET provider, supporting MySQL Server, MariaDB, Percona Server, Amazon Aurora...', unsupported: true, deps: [] },
  { id: 'Newtonsoft.Json', author: 'James Newton-King', versions: ['13.0.3'], downloads: '5,1B', desc: 'Json.NET is a popular high-performance JSON framework for .NET', unsupported: true, deps: [] },
];

/** Reference Manager penceresi. Döner: güncellenmiş başvuru listesi ya da null */
export async function referenceManager(ide) {
  const refs = new Set(ide.data.references || []);
  let connector = false;
  try {
    const r = await api.labState();
    connector = !!r.state?.install?.products?.includes('connector-net');
  } catch { /* yok */ }
  let cat = 'framework';
  let q = '';
  const list = h('div', { class: 'refm-list' });
  const info = h('div', { class: 'refm-info' });
  const search = h('input', { class: 'input', placeholder: 'Search Assemblies (Ctrl+E)' });
  const cats = h('div', { class: 'refm-cats' });
  const render = () => {
    cats.innerHTML = '';
    for (const [id, label] of [['framework', 'Framework'], ['extensions', 'Extensions'], ['projects', 'Projects'], ['browse', 'Browse']]) {
      cats.appendChild(h('div', { class: 'refm-cat' + (cat === id ? ' active' : ''), onclick: () => { cat = id; render(); } }, label));
    }
    list.innerHTML = '';
    let items = [];
    if (cat === 'framework') items = FRAMEWORK.map((n) => ({ name: n, version: '4.0.0.0', builtin: DEFAULT_REFS.includes(n) }));
    else if (cat === 'extensions') items = connector ? [{ name: 'MySql.Data', version: '8.0.33.0' }, { name: 'MySql.Data.EntityFramework', version: '8.0.33.0', ef: true }, { name: 'MySql.Web', version: '8.0.33.0', na: true }] : [];
    items = items.filter((x) => !q || x.name.toLowerCase().includes(q.toLowerCase()));
    if (!items.length) {
      list.appendChild(h('div', { class: 'muted refm-empty' }, cat === 'extensions' && !connector
        ? 'Bu bilgisayarda MySQL Connector/NET kurulu değil. Laboratuvarda MySQL Installer ile "Developer Default" kurulum yapın (Connector/NET de kurulur) ya da Proje menüsünden "Manage NuGet Packages" ile MySql.Data paketini ekleyin.'
        : cat === 'projects' ? 'Çözümde başka proje yok.' : cat === 'browse' ? 'Bilgisayardan .dll seçmek bu ortamda desteklenmiyor.' : 'Eşleşen başvuru yok.'));
    }
    for (const it of items) {
      const on = it.builtin || refs.has(it.name);
      const cb = h('input', { type: 'checkbox', checked: on, disabled: it.builtin || it.na });
      cb.onchange = () => { if (cb.checked) refs.add(it.name); else refs.delete(it.name); };
      const row = h('label', { class: 'refm-row' }, cb, h('span', { class: 'refm-name' }, it.name), h('span', { class: 'refm-ver' }, it.version));
      row.onmouseenter = () => { info.textContent = `Name: ${it.name}\nVersion: ${it.version}${it.builtin ? '\n(Projede zaten var)' : ''}${it.na ? '\n(Bu simülatörde desteklenmiyor)' : ''}`; };
      list.appendChild(row);
    }
  };
  search.oninput = () => { q = search.value; render(); };
  render();
  const body = h('div', { class: 'refm' }, h('div', { class: 'refm-head' }, h('b', {}, 'Assemblies'), h('div', { class: 'spacer' }), search), h('div', { class: 'refm-main' }, cats, list, info));
  const r = await modal({ title: `Reference Manager - ${ide.data.namespace}`, body, width: 760, buttons: [{ text: 'Cancel', value: null }, { text: 'OK', value: 'ok', primary: true }] });
  if (r !== 'ok') return null;
  return [...refs];
}

/** NuGet paket yöneticisi. ide.installPackage / uninstallPackage çağrılır. */
export function nugetManager(ide) {
  let tab = 'browse';
  let q = '';
  let sel = NUGET[0];
  const left = h('div', { class: 'nu-left' });
  const right = h('div', { class: 'nu-right' });
  const tabs = h('div', { class: 'nu-tabs' });
  const search = h('input', { class: 'input', placeholder: 'Search (Ctrl+L)' });
  const installed = () => new Map((ide.data.packages || []).map((p) => [p.id, p.version]));
  const render = () => {
    const inst = installed();
    tabs.innerHTML = '';
    for (const [id, label] of [['browse', 'Browse'], ['installed', `Installed${inst.size ? ' ' + inst.size : ''}`], ['updates', 'Updates']]) tabs.appendChild(h('button', { class: 'nu-tab' + (tab === id ? ' active' : ''), onclick: () => { tab = id; render(); } }, label));
    left.innerHTML = '';
    let items = NUGET;
    if (tab === 'installed') items = NUGET.filter((p) => inst.has(p.id));
    if (tab === 'updates') items = NUGET.filter((p) => inst.has(p.id) && inst.get(p.id) !== p.versions[0]);
    if (q) items = items.filter((p) => (p.id + ' ' + p.desc).toLowerCase().includes(q.toLowerCase()));
    for (const p of items) {
      const row = h('div', { class: 'nu-item' + (sel === p ? ' active' : '') },
        h('div', { class: 'nu-ico' }, p.id[0]),
        h('div', { class: 'nu-text' }, h('div', {}, h('b', {}, p.id), ' by ', p.author, ', ', p.downloads, ' downloads'), h('div', { class: 'muted small' }, p.desc)),
        h('div', { class: 'nu-ver' }, inst.has(p.id) ? h('span', { class: 'nu-check' }, '✔ ' + inst.get(p.id)) : p.versions[0]));
      row.onclick = () => { sel = p; render(); };
      left.appendChild(row);
    }
    if (!items.length) left.appendChild(h('div', { class: 'muted', style: { padding: '12px' } }, tab === 'browse' ? 'Sonuç yok. "mysql" ya da "entity" yazıp arayın.' : 'Paket yok.'));
    right.innerHTML = '';
    if (sel) {
      const ver = h('select', { class: 'input' }, ...sel.versions.map((v, i) => h('option', { value: v }, v + (i === 0 ? ' (Latest stable)' : ''))));
      const isInst = inst.has(sel.id);
      right.append(h('div', { class: 'nu-title' }, h('div', { class: 'nu-ico big' }, sel.id[0]), h('b', {}, sel.id)),
        h('div', { class: 'nu-row' }, h('span', {}, isInst ? `Installed: ${inst.get(sel.id)}` : 'Version:'), ver,
          isInst ? h('button', { class: 'btn', onclick: () => { ide.uninstallPackage(sel.id); render(); } }, 'Uninstall') : null,
          h('button', { class: 'btn btn-primary', onclick: async () => { if (await install(ide, sel, ver.value)) render(); } }, isInst ? 'Update' : 'Install')),
        h('div', { class: 'nu-desc' }, h('b', {}, 'Description'), h('p', {}, sel.desc), h('div', { class: 'muted small' }, `Author(s): ${sel.author}`),
          sel.deps.length ? h('div', { class: 'small' }, h('b', {}, 'Dependencies: '), sel.deps.join(', ')) : null,
          sel.unsupported ? h('div', { class: 'nu-warn' }, 'Bu paket ders simülatöründe desteklenmiyor.') : null));
    }
  };
  search.addEventListener('keydown', (e) => { if (e.key === 'Enter') { q = search.value; render(); } });
  search.oninput = () => { q = search.value; render(); };
  render();
  const body = h('div', { class: 'nu' }, h('div', { class: 'nu-head' }, tabs, h('div', { class: 'spacer' }), search, h('span', { class: 'muted small' }, 'Package source: nuget.org')), h('div', { class: 'nu-main' }, left, right));
  return modal({ title: `NuGet - Solution: ${ide.data.namespace}`, body, width: 940, buttons: [{ text: 'Kapat', value: null }] });
}

async function install(ide, pkg, version) {
  if (pkg.unsupported) { toast(`${pkg.id} bu simülatörde desteklenmiyor.`, 'error'); return false; }
  const all = [...pkg.deps.map((d) => NUGET.find((x) => x.id === d)), pkg].filter((x) => !(ide.data.packages || []).some((p) => p.id === x.id && p.version === (x === pkg ? version : x.versions[0])));
  const preview = await modal({
    title: 'Preview Changes',
    body: h('div', {}, h('div', {}, 'Visual Studio is about to make changes to this solution. Click OK to proceed with the changes listed below.'), h('div', { class: 'nu-preview' }, h('b', {}, ide.data.namespace), ...all.map((p) => h('div', {}, `Installing: ${p.id}.${p === pkg ? version : p.versions[0]}`)))),
    buttons: [{ text: 'Cancel', value: null }, { text: 'OK', value: 'ok', primary: true }],
  });
  if (preview !== 'ok') return false;
  const lic = await modal({
    title: 'License Acceptance',
    body: h('div', {}, h('div', {}, 'The following package(s) require that you accept their license terms before installing.'), ...all.map((p) => h('div', { class: 'nu-lic' }, h('b', {}, p.id), h('div', { class: 'muted small' }, `Author(s): ${p.author}`), h('a', { href: '#', onclick: (e) => e.preventDefault() }, 'View License'))),
      h('div', { class: 'small', style: { marginTop: '8px' } }, 'By clicking "I Accept," you agree to the license terms for the package(s) listed above.')),
    buttons: [{ text: 'I Decline', value: null }, { text: 'I Accept', value: 'ok', primary: true }],
  });
  if (lic !== 'ok') return false;
  for (const p of all) ide.installPackage(p, p === pkg ? version : p.versions[0]);
  return true;
}
