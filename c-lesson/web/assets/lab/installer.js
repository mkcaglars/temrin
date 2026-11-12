// Kurulum simülasyonu: tarayıcıdaki indirme sayfaları, MySQL Installer 8.0 (kitap),
// MySQL 8.4 MSI + MySQL Configurator ve Workbench MSI (güncel sürüm).
import { h } from '../js/ui.js';
import { ICONS } from './icons.js';
import { DOWNLOADS, defaultConnection } from './store.js';
import { VERSIONS } from './mysql/engine.js';
import { openWorkbench } from './workbench/wb.js';

export const FILES = {
  installer: { name: `mysql-installer-community-${VERSIONS.book}.0.msi`, size: '285.3M', kind: 'installer80' },
  installerWeb: { name: `mysql-installer-web-community-${VERSIONS.book}.0.msi`, size: '2.1M', kind: 'installer80' },
  server84: { name: `mysql-${VERSIONS.new}-winx64.msi`, size: '130.0M', kind: 'server84' },
  workbench: { name: 'mysql-workbench-community-8.0.40-winx64.msi', size: '42.9M', kind: 'workbench' },
};

// ---------------------------------------------------------------- tarayıcı

export function openBrowser(lab, url = 'about:home') {
  const { desk, store } = lab;
  const w = desk.open({ title: 'İnternet Tarayıcısı', icon: ICONS.browser, width: 980, height: 640 });
  const addr = h('input', { class: 'br-addr', value: url, spellcheck: 'false' });
  const page = h('div', { class: 'br-page' });
  const dlbar = h('div', { class: 'br-dl hidden' });
  const history = [];
  const go = (u, push = true) => {
    u = u.replace(/^http:\/\//, 'https://').replace(/^https:\/\/mysql\.com/, 'https://www.mysql.com');
    if (/^https:\/\/[^/]+$/.test(u)) u += '/';
    if (push && url !== u) history.push(url);
    url = u;
    addr.value = u === 'about:home' ? '' : u;
    page.innerHTML = '';
    page.scrollTop = 0;
    const render = PAGES[u.replace(/\/$/, '') + '/'] || PAGES[u] || notFound;
    render(page, { go, download, lab });
    w.setTitle((page.dataset.title || u) + ' - İnternet Tarayıcısı');
  };
  const download = (f) => {
    const path = `${DOWNLOADS}/${f.name}`;
    dlbar.classList.remove('hidden');
    dlbar.innerHTML = '';
    const bar = h('div', { class: 'br-dl-prog' }, h('div', { class: 'br-dl-fill' }));
    const item = h('div', { class: 'br-dl-item' }, h('span', { html: ICONS.installer }), h('div', {}, h('div', { class: 'br-dl-name' }, f.name), bar));
    dlbar.append(item, h('button', { class: 'lab-btn', onclick: () => dlbar.classList.add('hidden') }, '✕'));
    let p = 0;
    const t = setInterval(() => {
      p += 12 + Math.random() * 18;
      bar.firstChild.style.width = Math.min(100, p) + '%';
      if (p >= 100) {
        clearInterval(t);
        store.writeFile(path, `MSI:${f.kind}`, 'msi');
        bar.replaceWith(h('div', { class: 'br-dl-done' }, `${f.size}B — Tamamlandı`, ' · ', h('a', { href: '#', onclick: (e) => { e.preventDefault(); desk.openFile(path); } }, 'Dosyayı aç'), ' · ', h('a', { href: '#', onclick: (e) => { e.preventDefault(); import('./desktop.js').then((m) => m.openExplorer(desk, DOWNLOADS)); } }, 'Klasörde göster')));
        lab.events.emit('download', { file: f.name, kind: f.kind });
      }
    }, 250);
  };
  addr.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    let u = addr.value.trim();
    if (!u) { go('about:home'); return; }
    if (!/^https?:\/\//.test(u)) u = /\./.test(u) && !/\s/.test(u) ? 'https://' + u : 'search:' + u;
    if (u.startsWith('search:')) go('search:');
    else go(u);
  });
  w.body.appendChild(h('div', { class: 'br' },
    h('div', { class: 'br-bar' },
      h('button', { class: 'br-btn', title: 'Geri', onclick: () => { if (history.length) go(history.pop(), false); } }, '←'),
      h('button', { class: 'br-btn', title: 'Yenile', onclick: () => go(url, false) }, '⟳'),
      h('button', { class: 'br-btn', title: 'Giriş', onclick: () => go('about:home') }, '⌂'), addr),
    page, dlbar));
  go(url, false);
  return w;
}

const link = (text, onclick, cls = 'br-link') => h('a', { href: '#', class: cls, onclick: (e) => { e.preventDefault(); onclick(); } }, text);
const note = () => h('div', { class: 'br-sim' }, 'Bu sayfa ders için hazırlanmış bir simülasyondur; gerçek internet sitesi değildir.');

function notFound(page) {
  page.dataset.title = 'Sayfa bulunamadı';
  page.append(h('div', { class: 'br-404' }, h('h2', {}, 'Bu siteye ulaşılamıyor'), h('p', {}, 'Simülasyonda yalnızca MySQL indirme sayfaları açılabilir. Adres çubuğuna mysql.com yazabilirsiniz.')));
}

function siteHead(go) {
  return h('div', { class: 'br-site-head' }, h('span', { class: 'br-site-logo', html: ICONS.mysql }), h('b', {}, 'MySQL'), h('div', { class: 'spacer' }),
    link('PRODUCTS', () => go('https://www.mysql.com/')), link('CLOUD', () => go('https://www.mysql.com/')), link('SERVICES', () => go('https://www.mysql.com/')), link('PARTNERS', () => go('https://www.mysql.com/')), link('CUSTOMERS', () => go('https://www.mysql.com/')), link('WHY MYSQL?', () => go('https://www.mysql.com/')), link('NEWS & EVENTS', () => go('https://www.mysql.com/')), link('HOW TO BUY', () => go('https://www.mysql.com/')),
    link('DOWNLOADS', () => go('https://www.mysql.com/downloads/'), 'br-link strong'));
}

function devHead(go) {
  return h('div', { class: 'br-dev-head' }, h('span', { class: 'br-site-logo', html: ICONS.mysql }), h('b', {}, 'MySQL Community Downloads'), h('div', { class: 'spacer' }), link('MySQL.com', () => go('https://www.mysql.com/')), link('Downloads', () => go('https://dev.mysql.com/downloads/')));
}

const PAGES = {
  'about:home': (p, { go }) => {
    p.dataset.title = 'Yeni Sekme';
    const q = h('input', { class: 'br-search', placeholder: 'Ara ya da adres yaz' });
    q.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(/mysql/i.test(q.value) ? 'search:mysql' : 'search:'); });
    p.append(h('div', { class: 'br-home' }, h('div', { class: 'br-home-title' }, 'İnternet Tarayıcısı'), q,
      h('div', { class: 'br-tiles' }, h('button', { class: 'br-tile', onclick: () => go('https://www.mysql.com/') }, h('span', { html: ICONS.mysql }), 'mysql.com'),
        h('button', { class: 'br-tile', onclick: () => go('https://dev.mysql.com/downloads/') }, h('span', { html: ICONS.installer }), 'MySQL Downloads')), note()));
  },
  'search:': (p, { go }) => {
    p.dataset.title = 'Arama';
    p.append(h('div', { class: 'br-results' }, h('div', { class: 'muted' }, 'Arama sonuçları (simülasyon)'),
      h('div', { class: 'br-result' }, link('MySQL', () => go('https://www.mysql.com/')), h('div', { class: 'br-url' }, 'https://www.mysql.com'), h('div', {}, 'MySQL is the world\'s most popular open source database.')),
      h('div', { class: 'br-result' }, link('MySQL :: MySQL Community Downloads', () => go('https://dev.mysql.com/downloads/')), h('div', { class: 'br-url' }, 'https://dev.mysql.com/downloads/'), h('div', {}, 'MySQL Community Server, MySQL Installer for Windows, MySQL Workbench ...'))));
  },
  'https://www.mysql.com/': (p, { go }) => {
    p.dataset.title = 'MySQL';
    p.append(siteHead(go), h('div', { class: 'br-hero' }, h('h1', {}, 'MySQL'), h('p', {}, 'The world\'s most popular open source database'), link('Downloads »', () => go('https://www.mysql.com/downloads/'), 'br-cta')), note());
  },
  'https://www.mysql.com/downloads/': (p, { go }) => {
    p.dataset.title = 'MySQL :: MySQL Downloads';
    p.append(siteHead(go), h('div', { class: 'br-content' }, h('h1', {}, 'MySQL Downloads'),
      h('div', { class: 'br-box' }, h('h3', {}, 'MySQL Enterprise Edition'), h('p', { class: 'muted' }, 'Ticari sürüm; okulda Community (ücretsiz) sürüm kullanılır.')),
      h('div', { class: 'br-box' }, h('h3', {}, 'MySQL Cluster CGE'), h('p', { class: 'muted' }, '...')),
      h('div', { class: 'br-spacer' }),
      h('div', { class: 'br-box hl' }, link('MySQL Community (GPL) Downloads »', () => go('https://dev.mysql.com/downloads/'), 'br-link big'))), note());
  },
  'https://dev.mysql.com/downloads/': (p, { go }) => {
    p.dataset.title = 'MySQL :: MySQL Community Downloads';
    const items = [['MySQL Yum Repository'], ['MySQL APT Repository'], ['MySQL SUSE Repository'], ['MySQL Community Server', 'https://dev.mysql.com/downloads/mysql/'], ['MySQL Cluster'], ['MySQL Router'], ['MySQL Shell'], ['MySQL Operator'], ['MySQL NDB Operator'], ['MySQL Workbench', 'https://dev.mysql.com/downloads/workbench/'],
      ['MySQL Installer for Windows', 'https://dev.mysql.com/downloads/installer/'], ['C API (libmysqlclient)'], ['Connector/C++'], ['Connector/J'], ['Connector/NET', 'https://dev.mysql.com/downloads/connector/net/'], ['Connector/Node.js'], ['Connector/ODBC'], ['Connector/Python'], ['MySQL Native Driver for PHP'], ['MySQL Benchmark Tool'], ['Time zone description tables'], ['Download Archives']];
    const half = Math.ceil(items.length / 2);
    const col = (list) => h('ul', { class: 'br-dl-list' }, ...list.map(([t, u]) => h('li', {}, u ? link(t, () => go(u)) : h('span', { class: 'br-dead' }, t))));
    p.append(devHead(go), h('div', { class: 'br-content' }, h('h1', {}, 'MySQL Community Downloads'), h('div', { class: 'br-cols' }, col(items.slice(0, half)), col(items.slice(half)))), note());
  },
  'https://dev.mysql.com/downloads/installer/': (p, ctx) => downloadPage(p, ctx, {
    title: 'MySQL Installer 8.0.36', crumb: 'MySQL Installer',
    info: 'Note: MySQL 8.0 is the final series with MySQL Installer. As of MySQL 8.1, use a MySQL product\'s MSI or Zip archive for installation. MySQL Server 8.1 and higher also bundle MySQL Configurator, a tool that helps configure MySQL Server.',
    os: 'Microsoft Windows',
    rows: [['Windows (x86, 32-bit), MSI Installer', '8.0.36', FILES.installerWeb], ['Windows (x86, 32-bit), MSI Installer', '8.0.36', FILES.installer]],
  }),
  'https://dev.mysql.com/downloads/mysql/': (p, ctx) => downloadPage(p, ctx, {
    title: `MySQL Community Server ${VERSIONS.new} LTS`, crumb: 'MySQL Community Server',
    info: 'Windows için "MSI Installer" paketi kurulum sihirbazını ve MySQL Configurator aracını içerir. (Kitaptaki 8.0 sürümü için "MySQL Installer for Windows" sayfasını kullanın.)',
    os: 'Microsoft Windows',
    rows: [['Windows (x86, 64-bit), MSI Installer', VERSIONS.new, FILES.server84], ['Windows (x86, 64-bit), ZIP Archive', VERSIONS.new, null]],
  }),
  'https://dev.mysql.com/downloads/workbench/': (p, ctx) => downloadPage(p, ctx, {
    title: 'MySQL Workbench 8.0.40', crumb: 'MySQL Workbench',
    info: 'MySQL Workbench, MySQL için resmî grafik arayüz aracıdır. MySQL Installer 8.0 kullanıyorsanız Workbench kurulumla birlikte gelir; ayrıca indirmeniz gerekmez.',
    os: 'Microsoft Windows',
    rows: [['Windows (x86, 64-bit), MSI Installer', '8.0.40', FILES.workbench]],
  }),
  'https://dev.mysql.com/downloads/connector/net/': (p, { go }) => {
    p.dataset.title = 'MySQL :: Download Connector/NET';
    p.append(devHead(go), h('div', { class: 'br-content' }, h('h1', {}, 'Connector/NET'), h('p', {}, 'Visual Studio projelerinde MySQL bağlantısı için bu paketi indirmek yerine NuGet ile "MySql.Data" paketini eklemeniz önerilir (Proje > Manage NuGet Packages).')), note());
  },
};

function downloadPage(p, { go, download }, o) {
  p.dataset.title = 'MySQL :: Download ' + o.crumb;
  let pending = null;
  const content = h('div', { class: 'br-content' });
  const render = () => {
    content.innerHTML = '';
    if (pending) {
      content.append(h('h1', {}, 'MySQL Community Downloads'),
        h('div', { class: 'br-box' }, h('h3', {}, 'Login Now or Sign Up for a free account.'),
          h('p', {}, 'An Oracle Web Account provides you with the following advantages: fast access to MySQL software downloads, download technical White Papers and Presentations, post messages in the MySQL Discussion Forums...'),
          h('div', { class: 'br-btns' }, h('button', { class: 'br-blue', onclick: () => {} }, 'Login »'), h('button', { class: 'br-blue', onclick: () => {} }, 'Sign Up »')),
          h('p', {}, link('No thanks, just start my download.', () => { download(pending); pending = null; render(); }, 'br-link strong'))));
      return;
    }
    const table = h('table', { class: 'br-table' });
    for (const [label, ver, file] of o.rows) {
      table.appendChild(h('tr', {}, h('td', {}, h('b', {}, label), h('div', { class: 'muted small' }, file ? `(${file.name})` : '')), h('td', {}, ver), h('td', {}, file ? file.size : '—'),
        h('td', {}, file ? h('button', { class: 'br-blue', onclick: () => { pending = file; render(); } }, 'Download') : h('span', { class: 'muted' }, 'simülasyonda yok'))));
    }
    content.append(h('h1', {}, o.title), h('div', { class: 'br-tabs' }, h('span', { class: 'active' }, 'General Availability (GA) Releases'), h('span', {}, 'Archives')),
      h('div', { class: 'br-sel' }, h('label', {}, 'Select Operating System: '), h('select', {}, h('option', {}, o.os))),
      table, h('div', { class: 'br-info' }, o.info));
  };
  render();
  p.append(devHead(go), content, note());
}

// ---------------------------------------------------------------- sihirbaz altyapısı

/**
 * Genel kurulum sihirbazı. pages: [{ id, title, render(el, wiz), next?(wiz): bool|Promise<bool>, nextText, noBack, auto }]
 */
class Wizard {
  constructor(lab, { title, icon, side, pages, width = 820, height = 600, onFinish, onCancel, className = '' }) {
    this.lab = lab;
    this.pages = pages;
    this.side = side;
    this.data = {};
    this.i = 0;
    this.onFinish = onFinish;
    this.win = lab.desk.open({ title, icon: icon || ICONS.installer, width, height, resizable: false, className: 'inst-win ' + className, onClose: () => this.cancel() });
    this.sideEl = h('div', { class: 'inst-side' });
    this.main = h('div', { class: 'inst-main' });
    this.back = h('button', { class: 'lab-btn' }, '< Back');
    this.next = h('button', { class: 'lab-btn primary' }, 'Next >');
    this.cancelBtn = h('button', { class: 'lab-btn' }, 'Cancel');
    this.back.onclick = () => this.go(this.i - 1);
    this.next.onclick = () => this.advance();
    this.cancelBtn.onclick = () => this.win.close();
    this.onCancel = onCancel;
    this.win.body.appendChild(h('div', { class: 'inst' }, side ? this.sideEl : null, h('div', { class: 'inst-right' }, this.main, h('div', { class: 'inst-foot' }, h('div', { class: 'spacer' }), this.back, this.next, this.cancelBtn))));
    this.go(0);
  }

  async cancel() {
    if (this.done) return true;
    const r = await this.lab.desk.message({ title: this.win.title, text: 'Are you sure you want to cancel?', icon: 'question', buttons: [{ text: 'Yes', value: 'y', primary: true }, { text: 'No', value: null }], owner: this.win });
    if (r === 'y') this.onCancel?.();
    return r === 'y';
  }

  go(i) {
    if (i < 0 || i >= this.pages.length) return;
    this.i = i;
    const pg = this.pages[i];
    if (this.side) {
      this.sideEl.innerHTML = '';
      this.sideEl.appendChild(h('div', { class: 'inst-side-head' }, h('span', { html: ICONS.mysql }), h('div', {}, h('b', {}, this.side.title), h('div', {}, this.side.sub || ''))));
      const groups = this.pages.filter((p) => p.step);
      const cur = pg.step;
      for (const p of groups) this.sideEl.appendChild(h('div', { class: 'inst-step' + (p.step === cur ? ' cur' : '') }, p.step));
    }
    this.main.innerHTML = '';
    this.main.appendChild(h('div', { class: 'inst-title' }, pg.title));
    const body = h('div', { class: 'inst-body' });
    this.main.appendChild(body);
    this.back.disabled = i === 0 || !!pg.noBack;
    this.next.disabled = false;
    this.next.textContent = pg.nextText || 'Next >';
    this.cancelBtn.disabled = !!pg.noCancel;
    this.next.onclick = () => this.advance();
    this.cancelBtn.classList.toggle('hidden', !!pg.hideCancel);
    pg.render(body, this);
  }

  async advance() {
    const pg = this.pages[this.i];
    if (pg.next) {
      const ok = await pg.next(this);
      if (ok === false) return;
    }
    if (this.i === this.pages.length - 1) {
      this.done = true;
      await this.onFinish?.(this);
      this.win.close(true);
      return;
    }
    this.go(this.i + 1);
  }

  alert(text, icon = 'warning') {
    return this.lab.desk.message({ title: this.win.title, text, icon, owner: this.win });
  }

  /** Görev listesi canlandırması: steps = [metin], her biri ✓ olur. Bitince cb */
  animate(container, steps, done, speed = 450) {
    this.next.disabled = true;
    this.back.disabled = true;
    const rows = steps.map((s) => {
      const ic = h('span', { class: 'inst-tick' }, '○');
      const r = h('div', { class: 'inst-task' }, ic, h('span', {}, s));
      container.appendChild(r);
      return { r, ic };
    });
    let k = 0;
    const t = setInterval(() => {
      if (k > 0) { rows[k - 1].ic.textContent = '✔'; rows[k - 1].ic.className = 'inst-tick ok'; }
      if (k < rows.length) { rows[k].ic.textContent = '➜'; rows[k].ic.className = 'inst-tick cur'; }
      k++;
      if (k > rows.length) { clearInterval(t); this.next.disabled = false; done?.(); }
    }, speed);
  }
}

// ---------------------------------------------------------------- ortak yapılandırma sayfaları

function typeNetworkingPage(step) {
  return {
    step, title: 'Type and Networking',
    render(el, wz) {
      const d = wz.data;
      d.port ??= 3306;
      const port = h('input', { class: 'lab-input small', value: d.port });
      port.oninput = () => { d.port = Number(port.value); };
      el.append(h('div', { class: 'inst-sec' }, 'Server Configuration Type'),
        h('div', {}, 'Choose the correct server configuration type for this MySQL Server installation. This setting will define how much system resources are assigned to the MySQL Server instance.'),
        h('div', { class: 'inst-row' }, h('label', {}, 'Config Type:'), h('select', { class: 'lab-input' }, h('option', {}, 'Development Computer'), h('option', {}, 'Server Computer'), h('option', {}, 'Dedicated Computer'))),
        h('div', { class: 'inst-sec' }, 'Connectivity'),
        h('div', {}, 'Use the following controls to select how you would like to connect to this server.'),
        h('label', { class: 'inst-check' }, h('input', { type: 'checkbox', checked: true }), ' TCP/IP'), h('div', { class: 'inst-row' }, h('label', {}, 'Port:'), port, h('label', {}, 'X Protocol Port:'), h('input', { class: 'lab-input small', value: '33060' })),
        h('label', { class: 'inst-check' }, h('input', { type: 'checkbox', checked: true }), ' Open Windows Firewall ports for network access'),
        h('label', { class: 'inst-check' }, h('input', { type: 'checkbox' }), ' Named Pipe'), h('label', { class: 'inst-check' }, h('input', { type: 'checkbox' }), ' Shared Memory'),
        h('div', { class: 'inst-sec' }, 'Advanced Configuration'), h('label', { class: 'inst-check' }, h('input', { type: 'checkbox' }), ' Show Advanced and Logging Options'));
    },
    next(wz) {
      if (wz.data.port !== 3306) { wz.alert('Simülasyonda yalnızca varsayılan 3306 bağlantı noktası desteklenir. Kitaptaki gibi değiştirmeden geçin.'); wz.data.port = 3306; return false; }
      return true;
    },
  };
}

function authPage(step) {
  return {
    step, title: 'Authentication Method',
    render(el, wz) {
      wz.data.auth ??= 'strong';
      const r = (v, t, d) => {
        const i = h('input', { type: 'radio', name: 'instauth', checked: wz.data.auth === v });
        i.onchange = () => { wz.data.auth = v; };
        return h('label', { class: 'inst-opt' }, i, h('div', {}, h('b', {}, t), h('div', { class: 'muted' }, d)));
      };
      el.append(r('strong', 'Use Strong Password Encryption for Authentication (RECOMMENDED)', 'MySQL 8 supports a new authentication based on improved stronger SHA256-based password methods. It is recommended that all new MySQL Server installations use this method going forward.'),
        h('div', { class: 'inst-note' }, 'Attention: This new authentication plugin on the server side requires new versions of connectors and clients which add support for this new 8.0 default authentication (caching_sha2_password authentication).'),
        r('legacy', 'Use Legacy Authentication Method (Retain MySQL 5.x Compatibility)', 'Using the old MySQL 5.x legacy authentication method should only be considered in the following cases: If applications cannot be updated to use MySQL 8 enabled Connectors and drivers.'));
    },
  };
}

function accountsPage(step) {
  return {
    step, title: 'Accounts and Roles',
    render(el, wz) {
      const d = wz.data;
      d.users ??= [];
      const pw = h('input', { class: 'lab-input', type: 'password', value: d.rootPw || '' });
      const pw2 = h('input', { class: 'lab-input', type: 'password', value: d.rootPw2 || '' });
      const strength = h('span', { class: 'inst-strength' });
      const upd = () => {
        d.rootPw = pw.value;
        d.rootPw2 = pw2.value;
        const v = pw.value;
        const score = (v.length >= 8) + /[A-Z]/.test(v) + /[a-z]/.test(v) + /\d/.test(v) + /[^A-Za-z0-9]/.test(v);
        strength.textContent = !v ? '' : `Password strength: ${score >= 5 ? 'Strong' : score >= 3 ? 'Medium' : 'Weak'}`;
        strength.className = 'inst-strength s' + score;
      };
      pw.oninput = upd;
      pw2.oninput = upd;
      upd();
      const tb = h('tbody');
      const renderUsers = () => {
        tb.innerHTML = '';
        for (const u of d.users) tb.appendChild(h('tr', {}, h('td', {}, u.user), h('td', {}, u.host === '%' ? '<All Hosts (%)>' : u.host), h('td', {}, u.role)));
      };
      renderUsers();
      const addUser = () => {
        const name = h('input', { class: 'lab-input' });
        const host = h('select', { class: 'lab-input' }, h('option', { value: '%' }, '<All Hosts (%)>'), h('option', { value: 'localhost' }, 'localhost'));
        const role = h('select', { class: 'lab-input' }, ...['DB Admin', 'DB Designer', 'Backup Admin', 'DB Manager', 'Custom'].map((x) => h('option', {}, x)));
        const p1 = h('input', { class: 'lab-input', type: 'password' });
        const p2 = h('input', { class: 'lab-input', type: 'password' });
        const w = wz.lab.desk.open({ title: 'MySQL User Account', width: 460, modal: true, owner: wz.win, minimizable: false });
        const ok = async () => {
          if (!name.value.trim()) { await wz.lab.desk.message({ title: 'MySQL User Account', text: 'User Name is required.', icon: 'error', owner: w }); return; }
          if (p1.value !== p2.value) { await wz.lab.desk.message({ title: 'MySQL User Account', text: 'Passwords do not match.', icon: 'error', owner: w }); return; }
          d.users.push({ user: name.value.trim(), host: host.value, role: role.value, password: p1.value });
          renderUsers();
          w.close(true);
        };
        w.body.appendChild(h('div', { class: 'wb-form' }, h('div', { class: 'muted' }, 'Please specify the user name, password, and database role.'),
          h('div', { class: 'wb-form-row' }, h('label', {}, 'User Name:'), name), h('div', { class: 'wb-form-row' }, h('label', {}, 'Host:'), host), h('div', { class: 'wb-form-row' }, h('label', {}, 'Role:'), role),
          h('div', { class: 'wb-form-row' }, h('label', {}, 'Authentication:'), h('span', {}, 'MySQL')), h('div', { class: 'wb-form-row' }, h('label', {}, 'Password:'), p1), h('div', { class: 'wb-form-row' }, h('label', {}, 'Confirm Password:'), p2),
          h('div', { class: 'wb-form-btns' }, h('div', { class: 'spacer' }), h('button', { class: 'lab-btn primary', onclick: ok }, 'OK'), h('button', { class: 'lab-btn', onclick: () => w.close() }, 'Cancel'))));
        w.center();
      };
      el.append(h('div', { class: 'inst-sec' }, 'Root Account Password'), h('div', {}, 'Enter the password for the root account. Please remember to store this password in a secure place.'),
        h('div', { class: 'inst-row' }, h('label', {}, 'MySQL Root Password:'), pw), h('div', { class: 'inst-row' }, h('label', {}, 'Repeat Password:'), pw2, strength),
        h('div', { class: 'inst-sec' }, 'MySQL User Accounts'), h('div', {}, 'Create MySQL user accounts for your users and applications. Assign a role to the user that consists of a set of privileges.'),
        h('div', { class: 'inst-users' }, h('table', { class: 'wb-grid' }, h('thead', {}, h('tr', {}, h('th', {}, 'MySQL User Name'), h('th', {}, 'Host'), h('th', {}, 'User Role'))), tb),
          h('div', { class: 'inst-users-btns' }, h('button', { class: 'lab-btn', onclick: addUser }, 'Add User'), h('button', { class: 'lab-btn', onclick: () => { d.users.pop(); renderUsers(); } }, 'Delete'))));
    },
    async next(wz) {
      const d = wz.data;
      if (!d.rootPw) { await wz.alert('Root şifresi boş bırakılamaz. Bu şifreyi unutmayın; Workbench ve C# bağlantılarında kullanacaksınız.'); return false; }
      if (d.rootPw !== d.rootPw2) { await wz.alert('The passwords do not match.'); return false; }
      if (d.rootPw.length < 4) { await wz.alert('Password must be at least 4 characters long.'); return false; }
      return true;
    },
  };
}

function servicePage(step) {
  return {
    step, title: 'Windows Service',
    render(el, wz) {
      const d = wz.data;
      d.service ??= 'MySQL' + (wz.data.version === VERSIONS.new ? '84' : '80');
      d.autoStart ??= true;
      const name = h('input', { class: 'lab-input', value: d.service });
      name.oninput = () => { d.service = name.value.trim(); };
      const auto = h('input', { type: 'checkbox', checked: d.autoStart });
      auto.onchange = () => { d.autoStart = auto.checked; };
      el.append(h('label', { class: 'inst-check' }, h('input', { type: 'checkbox', checked: true, disabled: true }), ' Configure MySQL Server as a Windows Service'),
        h('div', { class: 'inst-sec' }, 'Windows Service Details'), h('div', {}, 'Please specify a Windows Service name to be used for this MySQL Server instance. A unique name is required for each instance.'),
        h('div', { class: 'inst-row' }, h('label', {}, 'Windows Service Name:'), name), h('label', { class: 'inst-check' }, auto, ' Start the MySQL Server at System Startup'),
        h('div', { class: 'inst-sec' }, 'Run Windows Service as ...'), h('label', { class: 'inst-opt' }, h('input', { type: 'radio', checked: true }), h('div', {}, h('b', {}, 'Standard System Account'), h('div', { class: 'muted' }, 'Recommended for most scenarios.'))));
    },
    next(wz) { if (!/^[A-Za-z0-9_]+$/.test(wz.data.service || '')) { wz.alert('Geçerli bir hizmet adı yazın (ör. MySQL80).'); return false; } return true; },
  };
}

function applyConfigPage(step, extraSteps = []) {
  return {
    step, title: 'Apply Configuration', nextText: 'Execute',
    render(el, wz) {
      el.append(h('div', {}, 'The configuration operation has not started yet. Click [Execute] to apply the configuration to the server.'));
      wz.next.textContent = 'Execute';
      wz.data.applied = false;
      const list = h('div', { class: 'inst-tasks' });
      el.appendChild(list);
      wz.next.onclick = () => {
        if (wz.data.applied) { wz.next.onclick = () => wz.advance(); wz.advance(); return; }
        wz.cancelBtn.disabled = true;
        wz.animate(list, ['Writing configuration file', 'Updating Windows Firewall rules', 'Adjusting Windows service', 'Initializing database (may take a long time)', 'Updating Permissions for Data Folder', 'Starting the server', 'Applying security settings', ...extraSteps, 'Updating the Start menu link'], () => {
          wz.data.applied = true;
          configureServer(wz);
          el.appendChild(h('div', { class: 'inst-ok' }, 'The configuration operation has completed.'));
          wz.next.textContent = 'Finish';
        });
      };
    },
    next(wz) { return !!wz.data.applied; },
  };
}

/** Sunucuyu sihirbazdaki ayarlarla kurar */
function configureServer(wz) {
  const { lab } = wz;
  const { server, store } = lab;
  const d = wz.data;
  server.version = d.version;
  server.setRunning(true);
  server.setRootPassword(d.rootPw);
  for (const u of d.users || []) {
    if (server.users.some((x) => x.user === u.user && x.host === u.host)) continue;
    const privs = u.role === 'DB Admin' ? ['ALL PRIVILEGES'] : u.role === 'DB Designer' ? ['CREATE', 'ALTER', 'INDEX', 'CREATE VIEW', 'SHOW VIEW', 'SHOW DATABASES'] : u.role === 'Backup Admin' ? ['SELECT', 'SHOW DATABASES', 'LOCK TABLES', 'EVENT'] : ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP', 'ALTER', 'INDEX', 'REFERENCES', 'SHOW DATABASES'];
    server.users.push({ user: u.user, host: u.host, password: u.password, grants: [{ db: '*', table: '*', privs, grantOption: u.role === 'DB Admin' }] });
  }
  Object.assign(store.state.install, { mysql: true, configured: true, serviceName: d.service || 'MySQL80', autoStart: d.autoStart !== false });
  const conns = store.state.connections;
  if (!conns.some((c) => c.id === 'local')) conns.unshift(defaultConnection(store.state));
  else conns.find((c) => c.id === 'local').name = `Local instance ${store.state.install.serviceName}`;
  for (const c of conns) if (c.user === 'root') c.password = null;
  store.touch();
  server.emit({ type: 'users' });
  lab.events.emit('configured', { version: d.version, users: d.users || [] });
}

/** Örnek veritabanları (Samples and Examples) */
export function createSamples(server) {
  const s = server.connect('root', server.users.find((u) => u.user === 'root')?.password || '', 'localhost');
  if (!server.hasDb('world')) {
    s.execute(`CREATE DATABASE world; USE world;
CREATE TABLE country (Code CHAR(3) NOT NULL DEFAULT '', Name CHAR(52) NOT NULL DEFAULT '', Continent ENUM('Asia','Europe','North America','Africa','Oceania','Antarctica','South America') NOT NULL DEFAULT 'Asia', Population INT NOT NULL DEFAULT 0, Capital INT DEFAULT NULL, PRIMARY KEY (Code));
CREATE TABLE city (ID INT NOT NULL AUTO_INCREMENT, Name CHAR(35) NOT NULL DEFAULT '', CountryCode CHAR(3) NOT NULL DEFAULT '', District CHAR(20) NOT NULL DEFAULT '', Population INT NOT NULL DEFAULT 0, PRIMARY KEY (ID), KEY CountryCode (CountryCode), CONSTRAINT city_ibfk_1 FOREIGN KEY (CountryCode) REFERENCES country (Code));
INSERT INTO country VALUES ('TUR','Turkey','Asia',66591000,3358),('DEU','Germany','Europe',82164700,3068),('FRA','France','Europe',59225700,2974),('JPN','Japan','Asia',126714000,1532),('BRA','Brazil','South America',170115000,211);
INSERT INTO city (Name, CountryCode, District, Population) VALUES ('Istanbul','TUR','Istanbul',8787958),('Ankara','TUR','Ankara',3038159),('Izmir','TUR','Izmir',2130359),('Berlin','DEU','Berliini',3386667),('Paris','FRA','Île-de-France',2125246),('Tokyo','JPN','Tokyo-to',7980230),('Brasília','BRA','Distrito Federal',1969868);`);
  }
  if (!server.hasDb('sakila')) {
    s.execute(`CREATE DATABASE sakila; USE sakila;
CREATE TABLE actor (actor_id SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT, first_name VARCHAR(45) NOT NULL, last_name VARCHAR(45) NOT NULL, last_update TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, PRIMARY KEY (actor_id));
CREATE TABLE film (film_id SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT, title VARCHAR(128) NOT NULL, release_year YEAR DEFAULT NULL, length SMALLINT UNSIGNED DEFAULT NULL, rating ENUM('G','PG','PG-13','R','NC-17') DEFAULT 'G', PRIMARY KEY (film_id));
INSERT INTO actor (first_name, last_name) VALUES ('PENELOPE','GUINESS'),('NICK','WAHLBERG'),('ED','CHASE'),('JENNIFER','DAVIS'),('JOHNNY','LOLLOBRIGIDA');
INSERT INTO film (title, release_year, length, rating) VALUES ('ACADEMY DINOSAUR',2006,86,'PG'),('ACE GOLDFINGER',2006,48,'G'),('ADAPTATION HOLES',2006,50,'NC-17'),('AFFAIR PREJUDICE',2006,117,'G'),('AFRICAN EGG',2006,130,'G');`);
  }
  s.close();
}

// ---------------------------------------------------------------- dosyayı çalıştır

export function openInstallerFile(lab, path) {
  let content = path ? lab.store.readFile(path) : 'MSI:installer80';
  if (String(content).startsWith('SETUPEXE:')) {
    const msi = content.slice(9);
    content = lab.store.readFile(msi);
    if (!content) { lab.desk.message({ title: 'Windows Installer', text: `This installation package could not be opened. Verify that the package exists and that you can access it.\n\n${msi.replace(/\//g, '\\')}`, icon: 'error' }); return null; }
  }
  if (String(content).startsWith('APPSETUP:')) return appSetup(lab, JSON.parse(content.slice(9)));
  const kind = String(content || '').replace(/^MSI:/, '');
  if (kind === 'installer80') return mysqlInstaller80(lab);
  if (kind === 'server84') return msi84(lab);
  if (kind === 'workbench') return workbenchMsi(lab);
  lab.desk.message({ title: 'Windows Installer', text: 'Bu yükleme paketi açılamadı.', icon: 'error' });
  return null;
}

// ---------------------------------------------------------------- öğrencinin Setup projesi (.msi)

function appSetup(lab, pkg) {
  const { store, desk } = lab;
  const d = { dir: `C:\\Program Files (x86)\\${pkg.manufacturer}\\${pkg.product}\\`, everyone: !!pkg.allUsers };
  return new Wizard(lab, {
    title: pkg.product, width: 560, height: 430, className: 'msi', icon: ICONS.installer,
    pages: [
      { title: `Welcome to the ${pkg.product} Setup Wizard`, render(el) { el.append(h('div', {}, `The installer will guide you through the steps required to install ${pkg.product} on your computer.`), h('div', { class: 'muted small' }, 'WARNING: This computer program is protected by copyright law and international treaties. Unauthorized duplication or distribution of this program, or any portion of it, may result in severe civil or criminal penalties, and will be prosecuted to the maximum extent possible under the law.')); } },
      {
        title: 'Select Installation Folder',
        render(el) {
          const dir = h('input', { class: 'lab-input', value: d.dir, style: { width: '100%' } });
          dir.oninput = () => { d.dir = dir.value; };
          const r = (v, t) => { const i = h('input', { type: 'radio', name: 'appeveryone', checked: d.everyone === v }); i.onchange = () => { d.everyone = v; }; return h('label', { class: 'inst-check' }, i, ' ', t); };
          el.append(h('div', {}, 'The installer will install the program to the following folder. To install in this folder, click "Next". To install to a different folder, enter it below or click "Browse".'), h('div', {}, 'Folder:'), dir,
            h('div', {}, `Install ${pkg.product} for yourself, or for anyone who uses this computer:`), r(true, 'Everyone'), r(false, 'Just me'));
        },
        next(wz) { if (!/^[a-z]:\\/i.test(d.dir.trim())) { wz.alert('Geçerli bir klasör yolu yazın (ör. C:\\Program Files (x86)\\...).'); return false; } return true; },
      },
      { title: 'Confirm Installation', render(el) { el.append(h('div', {}, `The installer is ready to install ${pkg.product} on your computer.`), h('div', {}, 'Click "Next" to start the installation.')); } },
      {
        title: `Installing ${pkg.product}`, noBack: true,
        render(el, wz) {
          const bar = h('div', { class: 'br-dl-prog big' }, h('div', { class: 'br-dl-fill' }));
          el.append(h('div', {}, `${pkg.product} is being installed.`), h('div', {}, 'Please wait...'), bar);
          wz.next.disabled = true;
          let p = 0;
          const t = setInterval(() => { p += 14; bar.firstChild.style.width = Math.min(100, p) + '%'; if (p >= 100) { clearInterval(t); wz.next.disabled = false; } }, 120);
        },
      },
      { title: 'Installation Complete', nextText: 'Close', noBack: true, hideCancel: true, render(el) { el.append(h('div', {}, `${pkg.product} has been successfully installed.`), h('div', {}, 'Click "Close" to exit.'), h('div', { class: 'muted small' }, 'Please use Windows Update to check for any critical updates to the .NET Framework.')); } },
    ],
    onFinish: () => installApp(lab, pkg, d.dir),
  });
}

function installApp(lab, pkg, winDir) {
  const { store, desk } = lab;
  const dir = winDir.trim().replace(/\\/g, '/').replace(/\/+$/, '');
  const icons = Object.fromEntries((pkg.items || []).filter((x) => x.kind === 'file').map((x) => [x.name, x.content]));
  const shortcutIcon = (pkg.items || []).find((x) => x.kind === 'shortcut' && x.icon)?.icon;
  if (pkg.hasOutput) {
    store.writeFile(`${dir}/${pkg.exe}`, 'APP:' + JSON.stringify({ product: pkg.product, asm: pkg.asm, pdb: pkg.pdb, dataFiles: pkg.dataFiles, iconData: shortcutIcon ? icons[shortcutIcon] : null }), 'exe');
    if (pkg.config != null) store.writeFile(`${dir}/${pkg.exe}.config`, pkg.config);
    for (const dll of pkg.deps || []) store.writeFile(`${dir}/${dll}`, 'DLL', 'dll');
    for (const f of pkg.dataFiles || []) store.writeFile(`${dir}/${f.name}`, f.content);
  }
  for (const it of pkg.items || []) {
    if (it.kind === 'file' && it.folder === 'app') store.writeFile(`${dir}/${it.name}`, it.content, 'image');
    if (it.kind !== 'shortcut') continue;
    const lnk = 'LNK:' + JSON.stringify({ target: `${dir}/${it.target}`, icon: it.icon ? icons[it.icon] : null });
    if (it.folder === 'desktop') store.writeFile(`C:/Users/Ogrenci/Desktop/${it.name}.lnk`, lnk, 'lnk');
    else if (it.folder === 'programs') {
      store.state.programs = (store.state.programs || []).filter((p) => p.name !== it.name);
      store.state.programs.push({ name: it.name, target: `${dir}/${it.target}`, icon: it.icon ? icons[it.icon] : null });
    } else store.writeFile(`${dir}/${it.name}.lnk`, lnk, 'lnk');
  }
  store.state.installedApps = (store.state.installedApps || []).filter((a) => a.product !== pkg.product);
  store.state.installedApps.push({ product: pkg.product, version: pkg.version, manufacturer: pkg.manufacturer, dir });
  store.touch();
  desk.renderIcons();
  lab.events.emit('app-installed', { product: pkg.product, dir });
}

// ---------------------------------------------------------------- MySQL Installer 8.0 (kitap)

const PRODUCTS80 = [
  ['server', `MySQL Server ${VERSIONS.book}`], ['workbench', `MySQL Workbench ${VERSIONS.book}`], ['shell', `MySQL Shell ${VERSIONS.book}`], ['router', `MySQL Router ${VERSIONS.book}`],
  ['odbc', 'Connector/ODBC 8.0.35'], ['cpp', `Connector/C++ ${VERSIONS.book}`], ['j', `Connector/J ${VERSIONS.book}`], ['connector-net', 'Connector/NET 8.0.33'], ['python', `Connector/Python ${VERSIONS.book}`], ['docs', `MySQL Documentation ${VERSIONS.book}`], ['samples', `Samples and Examples ${VERSIONS.book}`],
];

function mysqlInstaller80(lab) {
  const { store } = lab;
  const installed = store.state.install;
  if (installed.mysql && installed.products.includes('server')) {
    // Kurulu: Installer ana ekranı
    const w = lab.desk.open({ title: 'MySQL Installer', icon: ICONS.installer, width: 760, height: 460 });
    const tb = h('tbody');
    for (const [id, name] of PRODUCTS80) if (installed.products.includes(id)) tb.appendChild(h('tr', {}, h('td', {}, name), h('td', {}, name.split(' ').pop()), h('td', {}, 'X64'), h('td', {}, 'Ready')));
    w.body.appendChild(h('div', { class: 'inst-home' }, h('div', { class: 'inst-title' }, 'MySQL Installer — Installed Products'), h('div', { class: 'wb-grid-scroll' }, h('table', { class: 'wb-grid' }, h('thead', {}, h('tr', {}, h('th', {}, 'Product'), h('th', {}, 'Version'), h('th', {}, 'Architecture'), h('th', {}, 'Quick Action'))), tb)),
      h('div', { class: 'wb-form-btns' }, h('button', { class: 'lab-btn', onclick: () => { w.close(true); reconfigure80(lab); } }, 'Reconfigure (MySQL Server)'), h('div', { class: 'spacer' }), h('button', { class: 'lab-btn', onclick: () => w.close() }, 'Close'))));
    return w;
  }
  const d = { version: VERSIONS.book, setup: 'developer' };
  const setups = {
    developer: ['Developer Default', 'Installs all products needed for MySQL development purposes.', ['server', 'workbench', 'shell', 'router', 'odbc', 'cpp', 'j', 'connector-net', 'python', 'docs', 'samples']],
    server: ['Server only', 'Installs only the MySQL Server product.', ['server']],
    client: ['Client only', 'Installs only the MySQL Client products, without a server.', ['workbench', 'shell', 'router', 'odbc', 'cpp', 'j', 'connector-net', 'python', 'docs', 'samples']],
    full: ['Full', 'Installs all included MySQL products and features.', PRODUCTS80.map((p) => p[0])],
    custom: ['Custom', 'Manually select the products that should be installed on the system.', ['server', 'workbench']],
  };
  const wiz = new Wizard(lab, {
    title: 'MySQL Installer', side: { title: 'MySQL. Installer', sub: 'Adding Community' },
    pages: [
      {
        step: 'Choosing a Setup Type', title: 'Choosing a Setup Type',
        render(el, wz) {
          wz.data = d;
          el.appendChild(h('div', {}, 'Please select the Setup Type that suits your use case.'));
          for (const [k, [t, desc]] of Object.entries(setups)) {
            const r = h('input', { type: 'radio', name: 'instsetup', checked: d.setup === k });
            r.onchange = () => { d.setup = k; };
            el.appendChild(h('label', { class: 'inst-opt' }, r, h('div', {}, h('b', {}, t), h('div', { class: 'muted' }, desc))));
          }
        },
        next() {
          d.products = setups[d.setup][2];
          lab.events.emit('installer-setup', { setup: d.setup });
          return true;
        },
      },
      {
        step: 'Installation', title: 'Installation', nextText: 'Execute',
        render(el, wz) {
          el.appendChild(h('div', {}, 'Press Execute to upgrade the following products.'));
          const tb = h('tbody');
          const rows = d.products.map((id) => {
            const name = PRODUCTS80.find((p) => p[0] === id)[1];
            const st = h('td', {}, d.installedProducts ? 'Complete' : 'Ready to Install');
            const pr = h('td', {}, '');
            tb.appendChild(h('tr', {}, h('td', {}, name), st, pr));
            return { st, pr };
          });
          el.appendChild(h('div', { class: 'wb-grid-scroll inst-grid' }, h('table', { class: 'wb-grid' }, h('thead', {}, h('tr', {}, h('th', {}, 'Product'), h('th', {}, 'Status'), h('th', {}, 'Progress'))), tb)));
          if (d.installedProducts) { wz.next.textContent = 'Next >'; return; }
          wz.next.onclick = () => {
            wz.next.disabled = true;
            wz.back.disabled = true;
            let i = 0;
            let p = 0;
            const t = setInterval(() => {
              const r = rows[i];
              p += 25 + Math.random() * 30;
              r.st.textContent = 'Installing';
              r.pr.textContent = Math.min(100, Math.round(p)) + '%';
              if (p >= 100) {
                r.st.textContent = 'Complete';
                r.pr.textContent = '';
                i++;
                p = 0;
                if (i >= rows.length) {
                  clearInterval(t);
                  d.installedProducts = true;
                  store.state.install.products = [...d.products];
                  if (d.products.includes('workbench')) store.state.install.workbench = true;
                  if (d.products.includes('shell')) store.state.install.shell = true;
                  store.touch();
                  lab.desk.renderIcons();
                  wz.next.disabled = false;
                  wz.next.textContent = 'Next >';
                  wz.next.onclick = () => wz.advance();
                  lab.events.emit('installer-installed', { products: d.products });
                }
              }
            }, 140);
          };
        },
        next() { return !!d.installedProducts; },
      },
      {
        step: 'Product Configuration', title: 'Product Configuration', noBack: true,
        render(el) {
          el.appendChild(h('div', {}, 'We\'ll now walk through a configuration wizard for each of the following products.\n\nYou can cancel at any point if you wish to leave this wizard without configuring all the products.'));
          const tb = h('tbody');
          for (const id of ['server', 'router', 'samples']) if (d.products.includes(id)) tb.appendChild(h('tr', {}, h('td', {}, PRODUCTS80.find((p) => p[0] === id)[1]), h('td', {}, 'Ready to configure')));
          el.appendChild(h('div', { class: 'wb-grid-scroll inst-grid' }, h('table', { class: 'wb-grid' }, h('thead', {}, h('tr', {}, h('th', {}, 'Product'), h('th', {}, 'Status'))), tb)));
        },
        next() {
          if (!d.products.includes('server')) { d.skipServer = true; }
          return true;
        },
      },
      typeNetworkingPage('Type and Networking'),
      authPage('Authentication Method'),
      accountsPage('Accounts and Roles'),
      servicePage('Windows Service'),
      applyConfigPage('Apply Configuration'),
      {
        step: 'Connect To Server', title: 'Connect To Server', noBack: true,
        render(el, wz) {
          const user = h('input', { class: 'lab-input', value: 'root' });
          const pw = h('input', { class: 'lab-input', type: 'password' });
          const status = h('div', { class: 'inst-connstat' });
          const check = h('button', { class: 'lab-btn' }, 'Check');
          check.onclick = () => {
            try {
              lab.server.connect(user.value, pw.value, 'localhost').close();
              status.className = 'inst-connstat ok';
              status.textContent = 'Connection succeeded.';
              d.checked = true;
              lab.events.emit('installer-check', { ok: true });
            } catch (e) {
              status.className = 'inst-connstat bad';
              status.textContent = `Connection failed. ${e.message}`;
              d.checked = false;
              lab.events.emit('installer-check', { ok: false });
            }
          };
          el.append(h('div', {}, 'Select the MySQL server instances from the list to receive sample schemas and data.'),
            h('table', { class: 'wb-grid' }, h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', {}, 'Server'), h('th', {}, 'Port'), h('th', {}, 'Arch'), h('th', {}, 'Type'), h('th', {}, 'Status'))),
              h('tbody', {}, h('tr', {}, h('td', {}, h('input', { type: 'checkbox', checked: true })), h('td', {}, `MySQL Server ${VERSIONS.book}`), h('td', {}, '3306'), h('td', {}, 'X64'), h('td', {}, 'Stand-alone Server'), h('td', {}, 'Running')))),
            h('div', { class: 'muted' }, 'Now give us the credentials for MySQL Server (root account). Click Check to ensure they work.'),
            h('div', { class: 'inst-row' }, h('label', {}, 'User name:'), user), h('div', { class: 'inst-row' }, h('label', {}, 'Password:'), pw, check), status);
          void wz;
        },
        async next(wz) { if (!d.checked) { await wz.alert('Please click Check and make sure the connection succeeds.'); return false; } return true; },
      },
      {
        step: 'Apply Configuration ', title: 'Apply Configuration', nextText: 'Execute',
        render(el, wz) {
          el.appendChild(h('div', {}, 'Click [Execute] to install the sample schemas (sakila, world) and examples.'));
          const list = h('div', { class: 'inst-tasks' });
          el.appendChild(list);
          wz.next.onclick = () => {
            if (d.samples) { wz.next.onclick = () => wz.advance(); wz.advance(); return; }
            wz.animate(list, ['Checking if there are any conflicting schemas', 'Running scripts', 'Updating Start menu links'], () => {
              createSamples(lab.server);
              d.samples = true;
              wz.next.textContent = 'Finish';
            });
          };
        },
        next() { return !!d.samples; },
      },
      {
        step: 'Installation Complete', title: 'Installation Complete', nextText: 'Finish', noBack: true, hideCancel: true,
        render(el) {
          d.startWb ??= true;
          const cb = h('input', { type: 'checkbox', checked: d.startWb });
          cb.onchange = () => { d.startWb = cb.checked; };
          el.append(h('div', {}, 'The installation procedure has been completed.'), h('div', { class: 'inst-ok' }, '✔ MySQL Server, MySQL Workbench ve diğer bileşenler kuruldu.'),
            h('button', { class: 'lab-btn', onclick: () => navigator.clipboard?.writeText('Installation log (simülasyon)') }, 'Copy Log to Clipboard'),
            h('label', { class: 'inst-check' }, cb, ' Start MySQL Workbench after setup'), h('label', { class: 'inst-check' }, h('input', { type: 'checkbox' }), ' Start MySQL Shell after setup'));
        },
      },
    ],
    onFinish: () => {
      store.state.mode = 'book';
      store.touch();
      lab.desk.renderIcons();
      lab.events.emit('installed', { version: VERSIONS.book });
      if (d.startWb && store.state.install.workbench) setTimeout(() => openWorkbench(lab), 300);
    },
  });
  // Sunucu kurulmayacaksa yapılandırma sayfalarını atla
  const origGo = wiz.go.bind(wiz);
  wiz.go = (i) => {
    const pg = wiz.pages[i];
    if (d.skipServer && pg && ['Type and Networking', 'Authentication Method', 'Accounts and Roles', 'Windows Service', 'Apply Configuration', 'Connect To Server', 'Apply Configuration '].includes(pg.step)) return origGo(wiz.pages.length - 1);
    return origGo(i);
  };
  return wiz;
}

function reconfigure80(lab) {
  const d = { version: lab.server.version };
  return new Wizard(lab, {
    title: 'MySQL Server Configuration', side: { title: 'MySQL. Installer', sub: `MySQL Server ${lab.server.version}` },
    pages: [typeNetworkingPage('Type and Networking'), authPage('Authentication Method'), accountsPage('Accounts and Roles'), servicePage('Windows Service'), applyConfigPage('Apply Configuration')].map((p, i) => (i === 0 ? { ...p, render: (el, wz) => { wz.data = d; p.render(el, wz); } } : p)),
    onFinish: () => lab.events.emit('installed', { reconfigure: true }),
  });
}

// ---------------------------------------------------------------- MySQL 8.4 MSI + Configurator (güncel)

function msi84(lab) {
  const { store } = lab;
  if (store.state.install.mysql) {
    lab.desk.message({ title: `MySQL Server ${VERSIONS.new} Setup`, text: 'MySQL Server zaten kurulu. Yeniden yapılandırmak için Başlat menüsünden "MySQL Configurator" çalıştırın.', icon: 'info' });
    return null;
  }
  const d = { version: VERSIONS.new, accept: false, runConfigurator: true };
  return new Wizard(lab, {
    title: `MySQL Server ${VERSIONS.new} Setup`, width: 560, height: 430, className: 'msi',
    pages: [
      { title: `Welcome to the MySQL Server ${VERSIONS.new} Setup Wizard`, render(el, wz) { wz.data = d; el.append(h('div', { class: 'msi-art', html: ICONS.mysql }), h('div', {}, `The Setup Wizard will install MySQL Server ${VERSIONS.new} on your computer. Click Next to continue or Cancel to exit the Setup Wizard.`)); } },
      {
        title: 'End-User License Agreement',
        render(el) {
          const cb = h('input', { type: 'checkbox', checked: d.accept });
          cb.onchange = () => { d.accept = cb.checked; };
          el.append(h('div', {}, 'Please read the following license agreement carefully'), h('div', { class: 'msi-eula' }, 'GNU GENERAL PUBLIC LICENSE\nVersion 2, June 1991\n\n(Lisans metni simülasyonda kısaltılmıştır.)'), h('label', { class: 'inst-check' }, cb, ' I accept the terms in the License Agreement'));
        },
        async next(wz) { if (!d.accept) { await wz.alert('Devam etmek için lisans sözleşmesini kabul edin.'); return false; } return true; },
      },
      { title: 'Choose Setup Type', render(el) { d.type ??= 'typical'; for (const [k, t, desc] of [['typical', 'Typical', 'Installs the most common program features. Recommended for most users.'], ['custom', 'Custom', 'Allows users to choose which program features will be installed and where they will be installed.'], ['complete', 'Complete', 'All program features will be installed. Requires the most disk space.']]) { const r = h('input', { type: 'radio', name: 'msitype', checked: d.type === k }); r.onchange = () => { d.type = k; }; el.appendChild(h('label', { class: 'inst-opt' }, r, h('div', {}, h('b', {}, t), h('div', { class: 'muted' }, desc)))); } } },
      { title: `Ready to install MySQL Server ${VERSIONS.new}`, nextText: 'Install', render(el) { el.appendChild(h('div', {}, 'Click Install to begin the installation. Click Back to review or change any of your installation settings. Click Cancel to exit the wizard.')); } },
      {
        title: `Installing MySQL Server ${VERSIONS.new}`, noBack: true,
        render(el, wz) {
          const bar = h('div', { class: 'br-dl-prog big' }, h('div', { class: 'br-dl-fill' }));
          el.append(h('div', {}, 'Please wait while the Setup Wizard installs MySQL Server.'), h('div', {}, 'Status: Copying new files'), bar);
          wz.next.disabled = true;
          let p = 0;
          const t = setInterval(() => { p += 8; bar.firstChild.style.width = Math.min(100, p) + '%'; if (p >= 100) { clearInterval(t); wz.next.disabled = false; store.state.install.products = ['server']; store.touch(); } }, 120);
        },
      },
      {
        title: `Completed the MySQL Server ${VERSIONS.new} Setup Wizard`, nextText: 'Finish', noBack: true, hideCancel: true,
        render(el) {
          const cb = h('input', { type: 'checkbox', checked: d.runConfigurator });
          cb.onchange = () => { d.runConfigurator = cb.checked; };
          el.append(h('div', {}, 'Click the Finish button to exit the Setup Wizard.'), h('label', { class: 'inst-check' }, cb, ' Run MySQL Configurator'));
        },
      },
    ],
    onFinish: () => {
      store.state.mode = 'new';
      store.state.install.configuratorPending = true;
      store.touch();
      lab.desk.register('configurator', { label: 'MySQL Configurator', icon: ICONS.mysql, start: true, visible: () => store.state.install.products.includes('server'), open: () => configurator84(lab) });
      lab.events.emit('msi-installed', { product: 'server' });
      if (d.runConfigurator) setTimeout(() => configurator84(lab), 300);
    },
  });
}

export function configurator84(lab) {
  const d = { version: VERSIONS.new };
  return new Wizard(lab, {
    title: 'MySQL Configurator', side: { title: 'MySQL. Configurator', sub: `MySQL Server ${VERSIONS.new}` },
    pages: [
      { step: 'Welcome', title: 'Welcome', render(el, wz) { wz.data = d; el.append(h('div', {}, `MySQL Configurator will configure MySQL Server ${VERSIONS.new} as a new server instance.`), h('div', { class: 'muted' }, 'Bu araç, MySQL 8.1 ve sonrasında eski MySQL Installer\'ın yapılandırma adımlarının yerini alır.')); } },
      { step: 'Data Directory', title: 'Data Directory', render(el) { el.append(h('div', {}, 'Please specify the location of the data directory.'), h('div', { class: 'inst-row' }, h('label', {}, 'Data Directory:'), h('input', { class: 'lab-input', value: 'C:\\ProgramData\\MySQL\\MySQL Server 8.4\\', readonly: true }))); } },
      typeNetworkingPage('Type and Networking'),
      accountsPage('Accounts and Roles'),
      servicePage('Windows Service'),
      { step: 'Server File Permissions', title: 'Server File Permissions', render(el) { el.append(h('div', {}, 'MySQL Configurator can secure the server\'s data directory by updating the permissions of files and folders located at: C:\\ProgramData\\MySQL\\MySQL Server 8.4\\Data'), h('label', { class: 'inst-opt' }, h('input', { type: 'radio', checked: true, name: 'perm' }), h('div', {}, 'Yes, grant full access to the user running the Windows Service (if applicable) and the administrators group only.'))); } },
      {
        step: 'Sample Databases', title: 'Sample Databases',
        render(el) {
          d.sakila ??= true;
          d.world ??= true;
          const a = h('input', { type: 'checkbox', checked: d.sakila });
          a.onchange = () => { d.sakila = a.checked; };
          const b = h('input', { type: 'checkbox', checked: d.world });
          b.onchange = () => { d.world = b.checked; };
          el.append(h('div', {}, 'Select sample databases to install.'), h('label', { class: 'inst-check' }, a, ' Create Sakila database'), h('label', { class: 'inst-check' }, b, ' Create World database'));
        },
      },
      applyConfigPage('Apply Configuration', ['Creating sample databases']),
      { step: 'Configuration Complete', title: 'Configuration Complete', nextText: 'Finish', noBack: true, hideCancel: true, render(el) { el.append(h('div', { class: 'inst-ok' }, 'MySQL Configurator has completed the configuration of MySQL Server.'), h('div', { class: 'muted' }, 'Workbench\'i ayrıca indirip kurmanız gerekir (dev.mysql.com/downloads/workbench).')); } },
    ],
    onFinish: () => {
      if (d.sakila || d.world) createSamples(lab.server);
      lab.store.state.install.configuratorPending = false;
      lab.store.touch();
      lab.desk.renderIcons();
      lab.events.emit('installed', { version: VERSIONS.new });
    },
  });
}

function workbenchMsi(lab) {
  const { store } = lab;
  const d = { launch: true };
  return new Wizard(lab, {
    title: 'MySQL Workbench 8.0 CE - Setup Wizard', width: 560, height: 430, className: 'msi',
    pages: [
      { title: 'Welcome to the Setup Wizard for MySQL Workbench 8.0', render(el) { el.append(h('div', { class: 'msi-art', html: ICONS.workbench }), h('div', {}, 'The Setup Wizard will install MySQL Workbench 8.0 CE on your computer. To continue, click Next.')); } },
      { title: 'Destination Folder', render(el) { el.append(h('div', {}, 'Click Next to install to this folder, or click Change to install to a different folder.'), h('div', { class: 'inst-row' }, h('label', {}, 'Install MySQL Workbench 8.0 CE to:'), h('code', {}, 'C:\\Program Files\\MySQL\\MySQL Workbench 8.0 CE\\'))); } },
      { title: 'Setup Type', render(el) { el.append(h('label', { class: 'inst-opt' }, h('input', { type: 'radio', checked: true, name: 'wbt' }), h('div', {}, h('b', {}, 'Complete'), h('div', { class: 'muted' }, 'All program features will be installed.'))), h('label', { class: 'inst-opt' }, h('input', { type: 'radio', name: 'wbt' }), h('div', {}, h('b', {}, 'Custom'), h('div', { class: 'muted' }, 'Choose which program features you want installed.')))); } },
      { title: 'Ready to Install the Program', nextText: 'Install', render(el) { el.appendChild(h('div', {}, 'The wizard is ready to begin installation. Click Install to begin the installation.')); } },
      {
        title: 'Installing MySQL Workbench 8.0 CE', noBack: true,
        render(el, wz) {
          const bar = h('div', { class: 'br-dl-prog big' }, h('div', { class: 'br-dl-fill' }));
          el.append(h('div', {}, 'Please wait while the Setup Wizard installs MySQL Workbench 8.0 CE.'), bar);
          wz.next.disabled = true;
          let p = 0;
          const t = setInterval(() => { p += 10; bar.firstChild.style.width = Math.min(100, p) + '%'; if (p >= 100) { clearInterval(t); wz.next.disabled = false; } }, 120);
        },
      },
      { title: 'Setup Wizard Completed', nextText: 'Finish', noBack: true, hideCancel: true, render(el) { const cb = h('input', { type: 'checkbox', checked: d.launch }); cb.onchange = () => { d.launch = cb.checked; }; el.append(h('div', {}, 'The Setup Wizard has successfully installed MySQL Workbench 8.0 CE. Click Finish to exit the wizard.'), h('label', { class: 'inst-check' }, cb, ' Launch MySQL Workbench now')); } },
    ],
    onFinish: () => {
      store.state.install.workbench = true;
      if (!store.state.install.products.includes('workbench')) store.state.install.products.push('workbench');
      if (store.state.install.mysql && !store.state.connections.some((c) => c.id === 'local')) store.state.connections.unshift(defaultConnection(store.state));
      store.touch();
      lab.desk.renderIcons();
      lab.events.emit('msi-installed', { product: 'workbench' });
      if (d.launch) setTimeout(() => openWorkbench(lab), 300);
    },
  });
}
