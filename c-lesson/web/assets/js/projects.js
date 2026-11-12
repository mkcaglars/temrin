// "Projelerim" sayfası: proje listesi, yeni proje, yeniden adlandırma, kopyalama, silme.
import { api, formatDate } from './api.js';
import { h, modal, toast, confirmBox, promptBox, download, asciiFileName } from './ui.js';
import { TEMPLATES, toNamespace } from './templates.js';
import { distributeDialog } from './teacher.js';
import { themeButton } from './theme.js';

export function topBar(ctx, active) {
  const u = ctx.user;
  return h('header', { class: 'topbar' },
    h('a', { class: 'brand', href: '#/' }, h('img', { class: 'brand-logo', src: 'assets/img/icon.svg', alt: '' }), h('span', {}, 'Form Stüdyosu')),
    h('nav', { class: 'topnav' },
      h('a', { href: '#/', class: active === 'projects' ? 'active' : '' }, 'Projelerim'),
      u.role === 'ogretmen' ? h('a', { href: '#/ogretmen', class: active === 'teacher' ? 'active' : '' }, 'Öğretmen Paneli') : null,
      h('a', { href: 'lab.html', target: '_blank', title: 'MySQL kurulumu, Workbench, yedekleme… (sanal bilgisayar)' }, 'Laboratuvar')),
    h('div', { class: 'spacer' }),
    h('div', { class: 'user-chip' },
      h('span', { class: 'avatar' }, initials(u.name)),
      h('span', { class: 'user-name' }, u.name),
      h('span', { class: 'badge ' + (u.role === 'ogretmen' ? 'badge-teacher' : '') }, u.role === 'ogretmen' ? 'Öğretmen' : (u.sinif || 'Öğrenci'))),
    themeButton(),
    h('a', { class: 'btn btn-ghost', href: 'cikis.php', title: 'Oturumu kapat' }, 'Çıkış'));
}

export function initials(name) {
  return String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toLocaleUpperCase('tr-TR')).join('');
}

export function sizeText(bytes) {
  if (bytes == null) return '';
  return bytes < 1024 ? bytes + ' B' : (bytes / 1024).toFixed(1).replace('.', ',') + ' KB';
}

export class ProjectsView {
  constructor(ctx) {
    this.ctx = ctx;
  }

  async mount(root) {
    this.root = root;
    root.appendChild(topBar(this.ctx, 'projects'));
    this.main = h('main', { class: 'page' });
    root.appendChild(this.main);
    await this.load();
  }

  async load() {
    this.main.innerHTML = '';
    this.main.appendChild(h('div', { class: 'page-head' },
      h('div', {}, h('h1', {}, 'Projelerim'), h('p', { class: 'muted' }, 'Projeleriniz otomatik kaydedilir; hangi bilgisayardan girerseniz girin kaldığınız yerden devam edebilirsiniz.')),
      h('div', { class: 'page-head-btns' },
        this.ctx.user.role === 'ogretmen' ? h('button', { class: 'btn btn-lg', title: 'Bilgisayarınızdaki proje dosyasını (.json) yükleyip açın', onclick: () => this.importProjects() }, '\u2B06 Proje yükle') : null,
        h('button', { class: 'btn btn-primary btn-lg', onclick: () => this.newProject() }, '+ Yeni Proje'))));
    const grid = h('div', { class: 'project-grid' }, h('div', { class: 'muted' }, 'Yükleniyor…'));
    this.main.appendChild(grid);
    let projects;
    try {
      ({ projects } = await api.listProjects());
    } catch (e) {
      grid.innerHTML = '';
      grid.appendChild(h('div', { class: 'alert alert-error' }, e.message));
      return;
    }
    grid.innerHTML = '';
    if (!projects.length) {
      grid.appendChild(h('div', { class: 'empty' },
        h('div', { class: 'empty-icon' }, '\u{1F4C1}'),
        h('h3', {}, 'Henüz projeniz yok'),
        h('p', {}, 'İlk Windows Forms uygulamanızı oluşturmak için "Yeni Proje" düğmesine tıklayın.'),
        h('button', { class: 'btn btn-primary', onclick: () => this.newProject() }, '+ Yeni Proje')));
      return;
    }
    for (const p of projects) grid.appendChild(this.card(p));
  }

  card(p) {
    const open = () => { location.hash = `#/proje/${p.id}`; };
    return h('div', { class: 'project-card', ondblclick: open },
      h('div', { class: 'project-thumb', onclick: open }, h('div', { class: 'mini-window' }, h('div', { class: 'mini-title' }), h('div', { class: 'mini-body' }, h('i'), h('i'), h('b')))),
      h('div', { class: 'project-info' },
        h('div', { class: 'project-name', title: p.name }, p.name),
        h('div', { class: 'project-meta' }, 'Son değişiklik: ', formatDate(p.updated_at), ' · ', sizeText(p.size)),
        p.has_note ? h('div', { class: 'note-badge' }, '\u{1F4DD} Öğretmen notu var') : null),
      h('div', { class: 'project-actions' },
        h('button', { class: 'btn btn-primary btn-sm', onclick: open }, 'Aç'),
        h('button', { class: 'btn btn-sm', title: 'Yeniden adlandır', onclick: () => this.rename(p) }, 'Adlandır'),
        h('button', { class: 'btn btn-sm', title: 'Kopyasını oluştur', onclick: () => this.copy(p) }, 'Kopyala'),
        this.ctx.user.role === 'ogretmen' ? h('button', { class: 'btn btn-sm', title: 'Seçtiğiniz sınıftaki öğrencilerin her birine kopyala', onclick: () => distributeDialog(p) }, 'Sınıfa gönder') : null,
        this.ctx.user.role === 'ogretmen' ? h('button', { class: 'btn btn-sm', title: 'Projeyi .json dosyası olarak indir (Proje yükle ile geri yüklenebilir)', onclick: () => this.exportJson(p) }, 'JSON indir') : null,
        h('button', { class: 'btn btn-sm btn-danger-ghost', title: 'Sil', onclick: () => this.remove(p) }, 'Sil')));
  }

  async newProject() {
    const name = h('input', { class: 'input', value: 'WindowsFormsApp1', spellcheck: 'false' });
    const err = h('div', { class: 'field-error' });
    let selected = TEMPLATES[0].id;
    const cards = TEMPLATES.map((t) => {
      const c = h('label', { class: 'template' + (t.id === selected ? ' selected' : '') },
        h('input', { type: 'radio', name: 'tpl', value: t.id, checked: t.id === selected }),
        h('div', {}, h('b', {}, t.title), h('div', { class: 'muted' }, t.desc)));
      c.querySelector('input').onchange = () => {
        selected = t.id;
        for (const x of c.parentNode.children) x.classList.toggle('selected', x === c);
      };
      return c;
    });
    const body = h('div', {},
      h('div', { class: 'field' }, h('label', {}, 'Proje adı'), name, err),
      h('div', { class: 'field' }, h('label', {}, 'Şablon'), h('div', { class: 'templates' }, cards)));
    name.addEventListener('keydown', (e) => { if (e.key === 'Enter') body.closest('.modal').querySelector('.btn-primary').click(); });
    setTimeout(() => name.select(), 10);
    const r = await modal({
      title: 'Yeni Proje',
      body,
      width: 520,
      buttons: [{ text: 'Vazgeç', value: null }, {
        text: 'Oluştur', value: 'ok', primary: true,
        validate: () => {
          const v = name.value.trim();
          err.textContent = v ? '' : 'Proje adı yazın.';
          return !!v;
        },
      }],
    });
    if (r !== 'ok') return;
    const projectName = name.value.trim();
    const tpl = TEMPLATES.find((t) => t.id === selected);
    const data = tpl.create(toNamespace(projectName));
    try {
      const res = await api.createProject(projectName, data);
      location.hash = `#/proje/${res.id}`;
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  /** Öğretmen: .json proje dosyalarını yükler (tek proje, {name, data}, dizi ya da veritabanı satırı dışa aktarımı) */
  importProjects() {
    const input = h('input', { type: 'file', accept: '.json,application/json', multiple: true, style: { display: 'none' } });
    document.body.appendChild(input);
    input.onchange = async () => {
      const files = [...input.files];
      input.remove();
      if (!files.length) return;
      const found = [];
      const errors = [];
      for (const f of files) {
        try {
          const json = JSON.parse(await f.text());
          const list = extractProjects(json, f.name.replace(/\.json$/i, ''));
          if (!list.length) throw new Error('Dosyada proje bulunamadı (files ve forms alanları olan bir proje JSON\'u bekleniyor).');
          found.push(...list);
        } catch (e) {
          errors.push(`${f.name}: ${e.message}`);
        }
      }
      if (!found.length) { toast(errors.join('\n') || 'Proje bulunamadı.', 'error'); return; }
      // ad kontrolü ve onay
      const rows = found.map((p) => {
        const inp = h('input', { class: 'input', value: p.name, spellcheck: 'false' });
        p.input = inp;
        const forms = Object.keys(p.data.forms || {}).length;
        const cs = (p.data.files || []).filter((x) => /\.cs$/i.test(x.name)).length;
        return h('div', { class: 'field' }, h('label', {}, `${forms} form, ${cs} kod dosyası${p.data.database ? ', veritabanı' : ''}`), inp);
      });
      const r = await modal({
        title: 'Proje yükle',
        width: 520,
        body: h('div', {}, ...rows, errors.length ? h('div', { class: 'alert alert-error' }, errors.join('\n')) : null),
        buttons: [{ text: 'Vazgeç', value: null }, { text: found.length > 1 ? `${found.length} projeyi yükle` : 'Yükle ve aç', value: 'ok', primary: true }],
      });
      if (r !== 'ok') return;
      let lastId = null;
      let ok = 0;
      for (const p of found) {
        try {
          const res = await api.createProject(p.input.value.trim() || p.name, p.data);
          lastId = res.id;
          ok++;
        } catch (e) {
          toast(`${p.name}: ${e.message}`, 'error');
        }
      }
      if (ok === 1 && found.length === 1) { location.hash = `#/proje/${lastId}`; return; }
      if (ok) toast(`${ok} proje yüklendi.`, 'success');
      this.load();
    };
    input.click();
  }

  async exportJson(p) {
    try {
      const full = await api.getProject(p.id);
      const text = JSON.stringify({ name: full.name, data: full.data }, null, 2);
      download(`${asciiFileName(p.name)}.json`, new TextEncoder().encode(text), 'application/json');
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  async rename(p) {
    const name = await promptBox('Yeniden adlandır', 'Yeni proje adı', p.name);
    if (!name || name === p.name) return;
    try {
      await api.renameProject(p.id, name);
      toast('Proje adı değiştirildi.', 'success');
      this.load();
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  async copy(p) {
    const name = await promptBox('Kopyasını oluştur', 'Kopyanın adı', p.name + ' - kopya');
    if (!name) return;
    try {
      await api.copyProject(p.id, name);
      toast('Kopya oluşturuldu.', 'success');
      this.load();
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  async remove(p) {
    if (!(await confirmBox('Projeyi sil', `"${p.name}" projesi kalıcı olarak silinecek. Bu işlem geri alınamaz.`, 'Sil', true))) return;
    try {
      await api.deleteProject(p.id);
      toast('Proje silindi.', 'success');
      this.load();
    } catch (e) {
      toast(e.message, 'error');
    }
  }
}

/** Yüklenen JSON içinden projeleri çıkarır. Döner: [{ name, data }] */
export function extractProjects(json, fallbackName) {
  const out = [];
  const isData = (d) => d && typeof d === 'object' && !Array.isArray(d) && Array.isArray(d.files) && d.files.some((f) => f && typeof f.name === 'string');
  const visit = (x, name) => {
    if (x == null) return;
    if (typeof x === 'string') {
      // veritabanından dışa aktarılan satırda data alanı metin olabilir
      try { visit(JSON.parse(x), name); } catch { /* proje değil */ }
      return;
    }
    if (Array.isArray(x)) { x.forEach((y, i) => visit(y, x.length > 1 ? `${name} ${i + 1}` : name)); return; }
    if (typeof x !== 'object') return;
    if (isData(x)) { out.push({ name, data: normalizeData(x) }); return; }
    if ('data' in x) { visit(x.data, typeof x.name === 'string' && x.name.trim() ? x.name.trim() : name); return; }
    // phpMyAdmin dışa aktarımı: [{ type: 'table', name: 'projects', data: [...] }] ya da { projects: [...] }
    for (const k of ['projects', 'rows', 'items']) if (Array.isArray(x[k])) { visit(x[k], name); return; }
  };
  visit(json, fallbackName || 'Yüklenen proje');
  return out;
}

function normalizeData(d) {
  const data = JSON.parse(JSON.stringify(d));
  data.format ??= 1;
  if (!data.forms || Array.isArray(data.forms)) data.forms = {};
  // PHP json_decode boş nesneleri ({}) diziye ([]) çevirmiş olabilir
  const fix = (o) => {
    if (!o || typeof o !== 'object') return;
    for (const k of Object.keys(o)) {
      if ((k === 'props' || k === 'events') && Array.isArray(o[k]) && !o[k].length) o[k] = {};
      else fix(o[k]);
    }
  };
  fix(data.forms);
  if (!data.namespace) {
    const prog = data.files.find((f) => /namespace\s+([\w.]+)/.test(f.content || ''));
    data.namespace = prog ? /namespace\s+([\w.]+)/.exec(prog.content)[1] : 'WinFormsUygulamasi';
  }
  return data;
}
