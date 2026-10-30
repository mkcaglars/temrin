// Geliştirme ortamı: kod editörü, form tasarımcısı, çözüm gezgini, özellikler, hata listesi, çalıştırma.
import { api, formatDate } from './api.js';
import { h, modal, toast, confirmBox, promptBox, download } from './ui.js';
import { CodeEditor } from './editor.js';
import { FormDesigner, FORM } from './designer.js';
import { PropertyGrid } from './props.js';
import { CONTROLS, TOOLBOX_GROUPS, eventTypes } from './catalog.js';
import { generateDesigner } from './codegen.js';
import { addForm, classCs, isIdentifier } from './templates.js';
import { setHost } from './engine.js';
import { Desktop } from './runner.js';
import { distributeDialog } from './teacher.js';
import { DataEditor } from './dataeditor.js';
import { generateDataSet, designerFileName, databaseXml, databaseSql, dataFileName, parseDatabaseXml } from './datasetgen.js';

const SAVE_DELAY = 1500;
const CHECK_DELAY = 700;

export class Ide {
  constructor(ctx, projectId) {
    this.ctx = ctx;
    this.id = projectId;
    this.tabs = [];
    this.active = null;
    this.designers = new Map();
    this.diagnostics = [];
    this.dirty = false;
    this.saving = false;
    this.engineReady = null;
    this.activeTool = null;
    this.keyHandler = (e) => this.onKey(e);
    this.unloadHandler = (e) => this.onBeforeUnload(e);
  }

  // ------------------------------------------------------------------ yükleme

  async mount(root) {
    this.root = root;
    root.appendChild(h('div', { class: 'center-page muted' }, 'Proje yükleniyor…'));
    let p;
    try {
      p = await api.getProject(this.id);
    } catch (e) {
      root.innerHTML = '';
      root.appendChild(h('div', { class: 'center-page' }, h('div', { class: 'card' },
        h('h2', {}, 'Proje açılamadı'), h('p', {}, e.message), h('a', { class: 'btn btn-primary', href: '#/' }, 'Projelerime dön'))));
      return;
    }
    this.project = p;
    this.name = p.name;
    this.version = p.version;
    this.readonly = !!p.readonly;
    this.data = this.normalizeData(p.data);
    await this.checkLocalBackup();

    root.innerHTML = '';
    this.buildLayout(root);
    this.editor = new CodeEditor(this.docEditor, this, { readOnly: this.readonly });
    try {
      await this.editor.init();
    } catch (e) {
      toast('Kod editörü yüklenemedi: ' + e.message, 'error', 8000);
    }
    for (const f of this.data.files) this.editor.setFile(f.name, f.content, { readOnly: this.isGenerated(f.name) });
    this.renderSolution();
    this.renderToolbox();

    const firstForm = Object.keys(this.data.forms)[0];
    if (firstForm) this.openDesign(firstForm);
    else this.openCode(this.data.files[0]?.name || 'Program.cs');

    document.addEventListener('keydown', this.keyHandler);
    window.addEventListener('beforeunload', this.unloadHandler);
    this.waitEngine();
  }

  normalizeData(data) {
    const d = data && typeof data === 'object' ? data : {};
    d.format ??= 1;
    d.namespace ??= 'WinFormsApp';
    d.files ??= [];
    d.forms ??= {};
    for (const [name, form] of Object.entries(d.forms)) {
      form.name ??= name;
      form.props ??= {};
      form.events ??= {};
      form.controls ??= [];
      form.components ??= [];
      const designer = `${name}.Designer.cs`;
      let f = d.files.find((x) => x.name === designer);
      if (!f) {
        f = { name: designer, content: '' };
        d.files.push(f);
      }
      f.generated = true;
      f.content = generateDesigner(d.namespace, form, d.database);
    }
    if (d.database) {
      const name = designerFileName(d.database);
      let f = d.files.find((x) => x.name === name);
      if (!f) {
        f = { name, content: '' };
        d.files.push(f);
      }
      f.generated = true;
      f.content = generateDataSet(d.namespace, d.database);
    }
    return d;
  }

  backupKey() {
    return `csders-yedek-${this.id}`;
  }

  async checkLocalBackup() {
    if (this.readonly) return;
    let backup = null;
    try { backup = JSON.parse(localStorage.getItem(this.backupKey()) || 'null'); } catch { /* bozuk */ }
    if (!backup) return;
    if (backup.version !== this.version || JSON.stringify(backup.data) === JSON.stringify(this.data)) {
      localStorage.removeItem(this.backupKey());
      return;
    }
    const ok = await confirmBox('Kaydedilmemiş değişiklikler bulundu',
      `Bu bilgisayarda ${new Date(backup.time).toLocaleString('tr-TR')} tarihinde yapılmış ama sunucuya kaydedilememiş değişiklikler var. Geri yüklensin mi?`,
      'Geri yükle');
    if (ok) {
      this.data = this.normalizeData(backup.data);
      this.pendingDirty = true;
    } else {
      localStorage.removeItem(this.backupKey());
    }
  }

  // ------------------------------------------------------------------ yerleşim

  buildLayout(root) {
    const u = this.ctx.user;
    this.saveState = h('span', { class: 'ide-save' }, this.readonly ? 'Salt okunur' : 'Kaydedildi');
    this.titleEl = h('span', { class: 'ide-project-name', title: this.readonly ? this.name : 'Yeniden adlandırmak için tıklayın' }, this.name);
    if (!this.readonly) this.titleEl.onclick = () => this.renameProject();
    this.btnRun = h('button', { class: 'btn btn-run', title: 'Başlat (F5)', onclick: () => this.run() }, '▶ Başlat');
    this.btnStop = h('button', { class: 'btn btn-stop hidden', title: 'Durdur (Shift+F5)', onclick: () => this.stop() }, '■ Durdur');

    const top = h('header', { class: 'ide-top' },
      h('a', { class: 'brand', href: '#/', title: 'Projelerim' }, h('span', { class: 'brand-logo' }, 'C#')),
      h('div', { class: 'ide-project' }, this.titleEl, this.saveState),
      h('span', { class: 'ide-sep' }),
      this.btnRun, this.btnStop,
      h('button', { class: 'btn', title: 'Yalnızca derle (Ctrl+Shift+B)', onclick: () => this.build() }, 'Derle'),
      h('span', { class: 'ide-sep' }),
      this.readonly ? null : h('button', { class: 'btn btn-ghost', onclick: () => this.addFormDialog() }, '+ Form'),
      this.readonly ? null : h('button', { class: 'btn btn-ghost', onclick: () => this.addClassDialog() }, '+ Sınıf'),
      h('button', { class: 'btn btn-ghost', title: 'Visual Studio projesi olarak indir', onclick: () => this.exportZip() }, '⬇ ZIP indir'),
      h('div', { class: 'spacer' }),
      this.readonly ? h('button', { class: 'btn', onclick: () => this.copyToMine() }, 'Kopyasını al') : null,
      !this.readonly && u.role === 'ogretmen' ? h('button', { class: 'btn', title: 'Bu projeyi bir sınıftaki öğrencilerin her birine kopyala', onclick: () => this.distribute() }, '\u{1F4E4} Sınıfa gönder') : null,
      h('span', { class: 'user-chip' }, h('span', { class: 'user-name' }, u.name)),
      h('a', { class: 'btn', href: this.readonly && u.role === 'ogretmen' ? `#/ogretmen/ogrenci/${this.project.owner.id}` : '#/' }, this.readonly ? 'Geri' : 'Projelerim'));

    const banners = [];
    if (this.readonly) {
      const o = this.project.owner;
      banners.push(h('div', { class: 'ide-banner readonly' },
        h('span', {}, '\u{1F441} ', h('b', {}, `${o.name}${o.sinif ? ' (' + o.sinif + ')' : ''}`), ' adlı kullanıcının projesi — salt okunur. Çalıştırıp test edebilirsiniz.'),
        u.role === 'ogretmen' ? h('button', { class: 'btn btn-sm', onclick: () => this.editNote() }, '\u{1F4DD} Not yaz') : null,
        this.noteEl = h('span', { class: 'note-text muted' }, this.project.note ? 'Not: ' + this.project.note : '')));
    } else if (this.project.note) {
      banners.push(h('div', { class: 'ide-banner note' }, h('b', {}, '\u{1F4DD} Öğretmen notu: '), h('span', { class: 'note-text' }, this.project.note)));
    }

    this.toolbox = h('div', { class: 'toolbox' });
    this.tabBar = h('div', { class: 'tabs' });
    this.docEditor = h('div', { class: 'doc' });
    this.docDesigner = h('div', { class: 'doc' });
    this.docData = h('div', { class: 'doc hidden' });
    this.docEmpty = h('div', { class: 'doc doc-empty hidden' }, 'Açık dosya yok. Çözüm Gezgini\'nden bir dosya açın.');
    this.solution = h('div', { class: 'tree' });
    this.props = new PropertyGrid(this);

    this.errCount = h('span', { class: 'count' }, '0');
    this.warnCount = h('span', { class: 'count' }, '0');
    this.tabErrors = h('button', { class: 'bottom-tab active', onclick: () => this.showBottom('errors') }, 'Hata Listesi', this.errCount, this.warnCount);
    this.tabOutput = h('button', { class: 'bottom-tab', onclick: () => this.showBottom('output') }, 'Çıktı');
    this.errorsBody = h('div', { class: 'bottom-body' });
    this.outputPre = h('pre', { class: 'output' });
    this.outputBody = h('div', { class: 'bottom-body hidden' }, this.outputPre);
    this.bottom = h('div', { class: 'ide-bottom' },
      h('div', { class: 'bottom-tabs' }, this.tabErrors, this.tabOutput, h('div', { class: 'spacer' }),
        h('button', { class: 'tab-x', title: 'Paneli küçült/büyüt', onclick: () => this.bottom.classList.toggle('collapsed') }, '↕')),
      this.errorsBody, this.outputBody);

    this.statusText = h('span', {}, 'Derleyici yükleniyor…');
    this.statusProgress = h('div', { class: 'progress' }, h('div'));
    this.statusPos = h('span', {});
    this.status = h('div', { class: 'ide-status' }, this.statusText, this.statusProgress, h('div', { class: 'spacer' }), this.statusPos);

    this.el = h('div', { class: 'ide' },
      top, ...banners,
      h('div', { class: 'ide-main' },
        h('aside', { class: 'ide-panel ide-left' }, h('div', { class: 'ide-panel-title' }, 'Araç Kutusu'), this.toolbox),
        h('section', { class: 'ide-center' }, this.tabBar, h('div', { class: 'docs' }, this.docEditor, this.docDesigner, this.docData, this.docEmpty)),
        h('aside', { class: 'ide-panel ide-right' },
          h('div', { class: 'ide-panel-title' }, 'Çözüm Gezgini'),
          h('div', { class: 'solution' }, this.solution),
          h('div', { class: 'ide-panel-title' }, 'Özellikler'),
          this.props.el)),
      this.bottom, this.status);
    root.appendChild(this.el);
    this.renderDiagnostics();
  }

  showBottom(which) {
    this.bottom.classList.remove('collapsed');
    this.tabErrors.classList.toggle('active', which === 'errors');
    this.tabOutput.classList.toggle('active', which === 'output');
    this.errorsBody.classList.toggle('hidden', which !== 'errors');
    this.outputBody.classList.toggle('hidden', which !== 'output');
  }

  // ------------------------------------------------------------------ motor

  async waitEngine() {
    const bar = this.statusProgress.firstChild;
    const onProgress = (e) => { bar.style.width = Math.round(e.detail * 100) + '%'; };
    document.addEventListener('engine-progress', onProgress);
    const slow = setTimeout(() => {
      if (!this.engineObj) this.statusText.textContent = 'Derleyici hâlâ yükleniyor… Uzun sürerse sayfayı Ctrl+F5 ile yenileyin.';
    }, 45000);
    try {
      this.engineObj = await this.ctx.enginePromise;
      this.statusProgress.classList.add('hidden');
      this.statusText.textContent = 'Hazır';
      this.engineReady = true;
      if (this.pendingDirty) { this.pendingDirty = false; this.markDirty(); }
      setTimeout(() => {
        try { this.engineObj.Warmup(); } catch { /* önemli değil */ }
        this.check();
      }, 50);
    } catch (e) {
      this.statusText.textContent = 'Derleyici yüklenemedi: ' + (e?.message || e);
      this.engineReady = false;
    } finally {
      clearTimeout(slow);
      document.removeEventListener('engine-progress', onProgress);
    }
  }

  async engine() {
    if (this.engineObj) return this.engineObj;
    toast('Derleyici yükleniyor, lütfen bekleyin…');
    this.engineObj = await this.ctx.enginePromise;
    return this.engineObj;
  }

  projectJson(withData = false) {
    const db = this.data.database;
    return JSON.stringify({
      name: this.name,
      namespace: this.data.namespace,
      files: this.data.files.map((f) => ({ name: f.name, content: f.content })),
      dataFiles: withData && db ? [{ name: dataFileName(db), content: databaseXml(db) }, ...(withData === 'zip' ? [{ name: `${db.name}.sql`, content: databaseSql(db) }] : [])] : [],
    });
  }

  scheduleCheck() {
    clearTimeout(this.checkTimer);
    this.checkTimer = setTimeout(() => this.check(), CHECK_DELAY);
  }

  check() {
    if (!this.engineObj) return;
    try {
      const r = JSON.parse(this.engineObj.Check(this.projectJson()));
      this.setDiagnostics(r.diagnostics);
    } catch (e) {
      console.error(e);
    }
  }

  setDiagnostics(list) {
    this.diagnostics = list || [];
    this.editor?.setDiagnostics(this.diagnostics);
    this.renderDiagnostics();
  }

  renderDiagnostics() {
    const errors = this.diagnostics.filter((d) => d.severity === 'error');
    const warnings = this.diagnostics.filter((d) => d.severity !== 'error');
    this.errCount.textContent = `✖ ${errors.length}`;
    this.errCount.className = 'count' + (errors.length ? ' err' : '');
    this.warnCount.textContent = `⚠ ${warnings.length}`;
    this.warnCount.className = 'count' + (warnings.length ? ' warn' : '');
    this.errorsBody.innerHTML = '';
    if (!this.diagnostics.length) {
      this.errorsBody.appendChild(h('div', { class: 'no-errors' }, this.engineObj ? '✔ Hata yok.' : 'Derleyici hazır olunca kod denetlenecek.'));
      return;
    }
    const tbody = h('tbody');
    for (const d of this.diagnostics) {
      tbody.appendChild(h('tr', { onclick: () => this.gotoDiagnostic(d) },
        h('td', { class: 'sev ' + (d.severity === 'error' ? 'sev-error' : 'sev-warning') }, d.severity === 'error' ? '✖' : '⚠'),
        h('td', { class: 'err-code' }, d.code),
        h('td', {}, d.message),
        h('td', {}, d.file),
        h('td', {}, d.line ? String(d.line) : '')));
    }
    this.errorsBody.appendChild(h('table', { class: 'errors' },
      h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', {}, 'Kod'), h('th', {}, 'Açıklama'), h('th', {}, 'Dosya'), h('th', {}, 'Satır'))),
      tbody));
  }

  gotoDiagnostic(d) {
    if (!d.file) return;
    this.openCode(d.file, d.line, d.col);
  }

  // ------------------------------------------------------------------ dosyalar / sekmeler

  file(name) {
    return this.data.files.find((f) => f.name === name);
  }

  isGenerated(name) {
    return /\.Designer\.cs$/i.test(name);
  }

  formOfFile(name) {
    const base = name.replace(/\.Designer\.cs$/i, '').replace(/\.cs$/i, '');
    return this.data.forms[base] ? base : null;
  }

  tabKey(kind, name) {
    return `${kind}:${name}`;
  }

  openCode(fileName, line, col) {
    if (!this.file(fileName)) return;
    const key = this.tabKey('code', fileName);
    if (!this.tabs.find((t) => t.key === key)) this.tabs.push({ key, kind: 'code', name: fileName, title: fileName });
    this.activate(key);
    if (line) setTimeout(() => this.editor.revealLine(line, col || 1), 30);
  }

  openDesign(formName) {
    if (!this.data.forms[formName]) return;
    const key = this.tabKey('design', formName);
    if (!this.tabs.find((t) => t.key === key)) this.tabs.push({ key, kind: 'design', name: formName, title: `${formName}.cs [Tasarım]` });
    let d = this.designers.get(formName);
    if (!d) {
      d = new FormDesigner(this, formName);
      d.refresh();
      this.designers.set(formName, d);
    }
    this.activate(key);
  }

  /** Veritabanı penceresi (okul.mdf). view: 'data' | 'design' | 'sql' */
  openData(view = 'data') {
    const db = this.data.database;
    if (!db) return;
    const key = this.tabKey('data', db.name);
    let tab = this.tabs.find((t) => t.key === key);
    if (!tab) {
      tab = { key, kind: 'data', name: `${db.name}.mdf`, title: `${db.name}.mdf [Veri]` };
      this.tabs.push(tab);
    }
    tab.view = view;
    this.activate(key);
  }

  activate(key) {
    const tab = this.tabs.find((t) => t.key === key);
    this.active = tab || null;
    this.renderTabs();
    this.docEmpty.classList.toggle('hidden', !!tab);
    this.docEditor.classList.toggle('hidden', tab?.kind !== 'code');
    this.docDesigner.classList.toggle('hidden', tab?.kind !== 'design');
    this.docData.classList.toggle('hidden', tab?.kind !== 'data');
    this.toolbox.classList.toggle('disabled', tab?.kind !== 'design' || this.readonly);
    if (!tab) {
      this.props.clear();
      return;
    }
    if (tab.kind === 'data') {
      this.dataEditor ??= new DataEditor(this);
      this.docData.innerHTML = '';
      this.docData.appendChild(this.dataEditor.el);
      this.dataEditor.show(tab.view);
      this.props.clear('Veritabanı penceresi: sütunları "Tablo Tasarımı", kayıtları "Verileri Göster" sekmesinde düzenleyin.');
    } else if (tab.kind === 'code') {
      this.editor.show(tab.name);
      this.props.clear(this.formOfFile(tab.name) ? 'Özellikler tasarım görünümünde düzenlenir (Shift+F7).' : 'Bu dosyanın özelliği yok.');
      this.editor.focus();
    } else {
      const d = this.designers.get(tab.name);
      this.docDesigner.innerHTML = '';
      this.docDesigner.appendChild(d.el);
      d.render();
      this.props.show(d);
      d.focus();
    }
    this.renderSolution();
  }

  closeTab(key) {
    const i = this.tabs.findIndex((t) => t.key === key);
    if (i < 0) return;
    this.tabs.splice(i, 1);
    if (this.active?.key === key) {
      const next = this.tabs[i] || this.tabs[i - 1];
      this.activate(next?.key);
    } else this.renderTabs();
  }

  renderTabs() {
    this.tabBar.innerHTML = '';
    for (const t of this.tabs) {
      const icon = t.kind === 'design' ? '\u{1F5D4}' : t.kind === 'data' ? '\u{1F6E2}' : this.isGenerated(t.name) ? '\u{1F512}' : '';
      const el = h('div', { class: 'tab' + (this.active?.key === t.key ? ' active' : ''), title: t.title },
        icon ? h('span', { class: 'tab-kind' }, icon) : null,
        h('span', { class: 'tab-label' }, t.title),
        h('button', { class: 'tab-x', title: 'Kapat', onclick: (e) => { e.stopPropagation(); this.closeTab(t.key); } }, '✕'));
      el.addEventListener('mousedown', (e) => { if (e.button === 1) { e.preventDefault(); this.closeTab(t.key); } });
      el.onclick = () => this.activate(t.key);
      this.tabBar.appendChild(el);
    }
  }

  renderSolution() {
    const s = this.solution;
    s.innerHTML = '';
    const activeName = this.active?.name;
    const item = (cls, icon, label, opts = {}) => {
      const actions = h('span', { class: 'ti-actions' }, ...(opts.actions || []).map(([t, title, fn]) =>
        h('button', { class: 'ti-btn', title, onclick: (e) => { e.stopPropagation(); fn(); } }, t)));
      const el = h('div', { class: `tree-item ${cls}` + (opts.active ? ' active' : ''), title: opts.title || label },
        h('span', { class: 'ti-icon' }, icon), h('span', {}, label), actions);
      if (opts.open) el.ondblclick = opts.open;
      if (opts.click) el.onclick = opts.click;
      s.appendChild(el);
      return el;
    };
    item('tree-root', '\u{1F4C1}', this.name, { title: `Ad alanı: ${this.data.namespace}` });
    const db = this.data.database;
    if (db) {
      item('tree-child', '\u{1F6E2}', `${db.name}.mdf`, { active: activeName === `${db.name}.mdf` && this.active?.view !== 'design', click: () => this.openData('data'), title: 'Veritabanı: kayıtları ve tablo tasarımını görüntüle' });
      item('tree-child', '\u{1F5C3}', `${db.dataSet}.xsd`, { active: activeName === `${db.name}.mdf` && this.active?.view === 'design', click: () => this.openData('design'), title: 'Veri kümesi (DataSet): tablo ve sütunlar' });
      const dsFile = designerFileName(db);
      item('tree-child2', '\u{1F512}', dsFile, { active: activeName === dsFile, click: () => this.openCode(dsFile), title: 'Veri kümesi sihirbazının ürettiği kod (salt okunur)' });
    }
    const files = [...this.data.files].sort((a, b) => (a.name === 'Program.cs' ? -1 : b.name === 'Program.cs' ? 1 : a.name.localeCompare(b.name)));
    for (const f of files) {
      if (this.isGenerated(f.name)) continue;
      const form = this.formOfFile(f.name);
      if (form) {
        item('tree-child', '\u{1F5D4}', f.name, {
          active: activeName === form || activeName === f.name,
          click: () => this.openDesign(form),
          title: 'Tıkla: tasarım görünümü',
          actions: [['{ }', 'Kodu görüntüle (F7)', () => this.openCode(f.name)], ...(this.readonly ? [] : [['✕', 'Formu sil', () => this.deleteForm(form)]])],
        });
        item('tree-child2', '\u{1F512}', `${form}.Designer.cs`, { active: activeName === `${form}.Designer.cs`, click: () => this.openCode(`${form}.Designer.cs`), title: 'Tasarımcının ürettiği kod (salt okunur)' });
      } else {
        const canDelete = !this.readonly && f.name !== 'Program.cs';
        if (this.data.database && f.name === designerFileName(this.data.database)) continue;
        item('tree-child', '\u{1F4C4}', f.name, {
          active: activeName === f.name,
          click: () => this.openCode(f.name),
          actions: canDelete ? [['✎', 'Yeniden adlandır', () => this.renameFile(f.name)], ['✕', 'Dosyayı sil', () => this.deleteFile(f.name)]] : [],
        });
      }
    }
  }

  renderToolbox() {
    this.toolbox.innerHTML = '';
    const groups = [...TOOLBOX_GROUPS];
    const db = this.data.database;
    if (db) {
      // VS: projeyi derleyince araç kutusunda "<Proje> Bileşenleri" altında veri kümesi ve TableAdapter'lar görünür
      groups.unshift({
        title: `${this.data.namespace} Bileşenleri`,
        items: ['TypedDataSet', ...db.tables.map((t) => `TableAdapter:${t.name}`), 'TableAdapterManager'],
        titles: { TypedDataSet: db.dataSet, ...Object.fromEntries(db.tables.map((t) => [`TableAdapter:${t.name}`, `${t.name}TableAdapter`])) },
      });
    }
    for (const g of groups) {
      this.toolbox.appendChild(h('div', { class: 'toolbox-group' }, g.title));
      for (const type of g.items) {
        const info = CONTROLS[type.split(':')[0]];
        const title = g.titles?.[type] || info.title;
        const el = h('div', { class: 'tool', draggable: 'true', title: `${title} — ${info.desc}\nSürükleyip forma bırakın ya da çift tıklayın.` },
          h('span', { class: 'tool-icon' }, info.icon), h('span', {}, title));
        el.dataset.type = type;
        el.addEventListener('dragstart', (e) => {
          e.dataTransfer.setData('text/x-wf-control', type);
          e.dataTransfer.effectAllowed = 'copy';
        });
        el.addEventListener('click', () => {
          this.activeTool = this.activeTool === type ? null : type;
          this.renderToolSelection();
        });
        el.addEventListener('dblclick', () => {
          this.activeTool = null;
          this.renderToolSelection();
          this.activeDesigner()?.addAtDefault(type);
        });
        this.toolbox.appendChild(el);
      }
    }
    this.toolbox.appendChild(h('div', { class: 'toolbox-hint' }, 'İpucu: Kontrolü forma sürükleyin, ya da tıklayıp formda yerleştirmek istediğiniz yere tıklayın.'));
  }

  renderToolSelection() {
    for (const el of this.toolbox.querySelectorAll('.tool')) el.classList.toggle('active', el.dataset.type === this.activeTool);
  }

  getActiveTool() {
    return this.activeTool;
  }

  clearActiveTool() {
    if (!this.activeTool) return;
    this.activeTool = null;
    this.renderToolSelection();
  }

  activeDesigner() {
    return this.active?.kind === 'design' ? this.designers.get(this.active.name) : null;
  }

  // ------------------------------------------------------------------ değişiklikler

  /** Editörde kod değişti. */
  onFileEdited(name, content) {
    const f = this.file(name);
    if (!f || this.readonly) return;
    f.content = content;
    this.markDirty();
    this.scheduleCheck();
  }

  /** Monaco otomatik tamamlama isteği. */
  complete(model, offset) {
    if (!this.engineObj || !model._fileName) return [];
    try {
      return JSON.parse(this.engineObj.Complete(this.projectJson(), model._fileName, offset));
    } catch (e) {
      console.error(e);
      return [];
    }
  }

  onCursor(line, col) {
    this.statusPos.textContent = `Sat ${line}, Süt ${col}`;
  }

  /** Tasarımcıda değişiklik oldu: Designer.cs yeniden üretilir. */
  onDesignChanged(formName) {
    const model = this.data.forms[formName];
    const name = `${formName}.Designer.cs`;
    const content = generateDesigner(this.data.namespace, model, this.data.database);
    let f = this.file(name);
    if (!f) {
      f = { name, content, generated: true };
      this.data.files.push(f);
    }
    if (f.content === content) return;
    f.content = content;
    this.editor.setFile(name, content, { readOnly: true });
    this.markDirty();
    this.scheduleCheck();
  }

  /** Veri penceresinde değişiklik: şema değiştiyse veri kümesi kodu yeniden üretilir. */
  onDatabaseChanged(schema) {
    if (this.readonly) return;
    if (schema) {
      const db = this.data.database;
      const name = designerFileName(db);
      const content = generateDataSet(this.data.namespace, db);
      const f = this.file(name);
      if (f && f.content !== content) {
        f.content = content;
        this.editor.setFile(name, content, { readOnly: true });
      }
      for (const form of Object.keys(this.data.forms)) this.onDesignChanged(form);
      this.scheduleCheck();
    }
    this.markDirty();
  }

  /** Sütun adı değişince formlardaki bağlamalar ve tablo sütunları da güncellenir. */
  renameDbColumn(table, oldName, newName) {
    for (const form of Object.values(this.data.forms)) {
      const sources = new Set((form.components || []).filter((c) => c.type === 'BindingSource' && c.props.DataMember === table).map((c) => c.name));
      const walk = (list) => {
        for (const c of list || []) {
          const b = c.props?.DataBindings;
          if (b) for (const k of Object.keys(b)) {
            const [src, field] = String(b[k]).split('.');
            if (sources.has(src) && field === oldName) b[k] = `${src}.${newName}`;
          }
          if (c.type === 'DataGridView' && sources.has(c.props.DataSource)) {
            for (const col of c.props.Columns || []) {
              if (col.props?.DataPropertyName === oldName) {
                col.props.DataPropertyName = newName;
                if (col.props.HeaderText === oldName) col.props.HeaderText = newName;
              }
            }
          }
          walk(c.controls);
        }
      };
      walk(form.controls);
    }
    for (const d of this.designers.values()) d.refresh();
  }

  /** Çalışan program veritabanına kaydetti (TableAdapter.Update / UpdateAll). */
  onDataFile(name, xml) {
    const db = this.data.database;
    if (!db || name !== dataFileName(db)) return;
    const rows = parseDatabaseXml(db, xml);
    if (!rows) return;
    for (const t of db.tables) if (rows[t.name]) t.rows = rows[t.name];
    if (!this.readonly) this.markDirty();
    if (this.active?.kind === 'data') this.dataEditor?.render();
  }

  onSelectionChanged(designer) {
    if (this.activeDesigner() === designer) this.props.show(designer);
  }

  /** Form kod dosyasında olay metodu yöntemlerini listeler. */
  listMethods(formName) {
    const code = this.file(`${formName}.cs`)?.content || '';
    const re = /void\s+([A-Za-z_À-ɏ][\wÀ-ɏ]*)\s*\(\s*object\s+\w+\s*,\s*([\w.]+)\s+\w+\s*\)/g;
    const out = [];
    let m;
    while ((m = re.exec(code))) out.push({ name: m[1], args: m[2] });
    return out;
  }

  /** Olay metodunu oluşturur (yoksa) ve koda gider. */
  async openEventHandler(designer, targetName, evt, handlerName) {
    const isForm = targetName === FORM;
    const target = isForm ? designer.model : designer.find(targetName)?.control;
    if (!target) return;
    const existing = target.events?.[evt];
    const name = handlerName || existing || `${isForm ? designer.formName : targetName}_${evt}`;
    const codeFile = `${designer.formName}.cs`;
    if (this.readonly) {
      if (existing) {
        const line = (await this.engine()).FindMethodLine(this.file(codeFile).content, existing);
        this.openCode(codeFile, line || 1);
      }
      return;
    }
    if (!isIdentifier(name)) {
      toast('Geçersiz metot adı.', 'error');
      return;
    }
    const engine = await this.engine();
    const [, args] = eventTypes(evt);
    const res = JSON.parse(engine.AddEventHandler(this.file(codeFile).content, designer.formName, name, args));
    if (existing !== name) designer.setEvent(targetName, evt, name);
    this.setFileContent(codeFile, res.code);
    this.openCode(codeFile, res.line, 13);
  }

  setFileContent(name, content) {
    const f = this.file(name);
    if (!f || f.content === content) return;
    f.content = content;
    this.editor.setFile(name, content, { readOnly: this.isGenerated(name) });
    this.markDirty();
    this.scheduleCheck();
  }

  async renameInCode(formName, oldName, newName) {
    const codeFile = `${formName}.cs`;
    const f = this.file(codeFile);
    if (!f) return;
    const engine = await this.engine();
    this.setFileContent(codeFile, engine.RenameIdentifier(f.content, oldName, newName));
  }

  // ------------------------------------------------------------------ proje işlemleri

  uniqueFileBase(prefix) {
    for (let i = 1; ; i++) {
      const n = prefix + i;
      if (!this.file(n + '.cs') && !this.data.forms[n]) return n;
    }
  }

  validateNewName(v) {
    if (!isIdentifier(v)) return 'Ad harf ile başlamalı; yalnızca harf, rakam ve _ içermelidir (boşluk olmaz).';
    if (this.file(v + '.cs') || this.data.forms[v]) return 'Bu adda bir dosya zaten var.';
    if (v === this.data.namespace) return 'Ad, projenin ad alanıyla aynı olamaz.';
    return null;
  }

  async addFormDialog() {
    const name = await promptBox('Yeni Form', 'Form adı', this.uniqueFileBase('Form'), (v) => this.validateNewName(v));
    if (!name) return;
    addForm(this.data, name);
    for (const f of this.data.files) {
      if (f.name === `${name}.cs` || f.name === `${name}.Designer.cs`) this.editor.setFile(f.name, f.content, { readOnly: this.isGenerated(f.name) });
    }
    this.markDirty();
    this.openDesign(name);
    this.scheduleCheck();
    toast(`${name} eklendi. Açmak için: new ${name}().Show();`, 'success', 5000);
  }

  async addClassDialog() {
    const name = await promptBox('Yeni Sınıf', 'Sınıf adı', this.uniqueFileBase('Class'), (v) => this.validateNewName(v));
    if (!name) return;
    const f = { name: `${name}.cs`, content: classCs(this.data.namespace, name) };
    this.data.files.push(f);
    this.editor.setFile(f.name, f.content);
    this.markDirty();
    this.openCode(f.name);
    this.scheduleCheck();
  }

  async deleteForm(form) {
    if (!(await confirmBox('Formu sil', `${form} formu ve kodu (${form}.cs, ${form}.Designer.cs) silinecek. Emin misiniz?`, 'Sil', true))) return;
    for (const name of [`${form}.cs`, `${form}.Designer.cs`]) {
      this.data.files = this.data.files.filter((f) => f.name !== name);
      this.editor.removeFile(name);
      this.closeTab(this.tabKey('code', name));
    }
    delete this.data.forms[form];
    this.designers.delete(form);
    this.closeTab(this.tabKey('design', form));
    this.renderSolution();
    this.markDirty();
    this.scheduleCheck();
  }

  async deleteFile(name) {
    if (!(await confirmBox('Dosyayı sil', `${name} silinecek. Emin misiniz?`, 'Sil', true))) return;
    this.data.files = this.data.files.filter((f) => f.name !== name);
    this.editor.removeFile(name);
    this.closeTab(this.tabKey('code', name));
    this.renderSolution();
    this.markDirty();
    this.scheduleCheck();
  }

  async renameFile(name) {
    const base = name.replace(/\.cs$/i, '');
    const v = await promptBox('Dosyayı yeniden adlandır', 'Yeni ad (.cs olmadan)', base, (x) => (x === base ? null : this.validateNewName(x)));
    if (!v || v === base) return;
    const f = this.file(name);
    const newName = v + '.cs';
    const wasOpen = this.tabs.some((t) => t.key === this.tabKey('code', name));
    this.editor.removeFile(name);
    this.closeTab(this.tabKey('code', name));
    f.name = newName;
    this.editor.setFile(newName, f.content);
    this.markDirty();
    if (wasOpen) this.openCode(newName);
    else this.renderSolution();
  }

  async renameProject() {
    const v = await promptBox('Projeyi yeniden adlandır', 'Proje adı', this.name);
    if (!v || v === this.name) return;
    try {
      await api.renameProject(this.id, v);
      this.name = v;
      this.titleEl.textContent = v;
      this.renderSolution();
      toast('Proje adı değiştirildi.', 'success');
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  async copyToMine() {
    try {
      const o = this.project.owner;
      const r = await api.copyProject(this.id, `${this.name} (${o.name})`);
      toast('Kopya kendi projelerinize eklendi.', 'success');
      location.hash = `#/proje/${r.id}`;
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  /** Öğretmen: önce kaydeder, sonra sınıfa gönderir (öğrenciler son kaydedilen hali alır). */
  async distribute() {
    if (!(await this.save({ force: false }))) {
      toast('Proje kaydedilemedi; göndermeden önce kaydın tamamlanmasını bekleyin.', 'error');
      return;
    }
    await distributeDialog({ id: this.id, name: this.name });
  }

  async editNote() {
    const ta = h('textarea', { class: 'input', rows: '6', style: { width: '100%' }, placeholder: 'Öğrencinin projeyi açınca göreceği not…' });
    ta.value = this.project.note || '';
    const r = await modal({ title: 'Öğretmen notu', body: ta, buttons: [{ text: 'Vazgeç', value: null }, { text: 'Kaydet', value: 'ok', primary: true }] });
    if (r !== 'ok') return;
    try {
      const res = await api.setNote(this.id, ta.value);
      this.project.note = res.note;
      if (this.noteEl) this.noteEl.textContent = res.note ? 'Not: ' + res.note : '';
      toast('Not kaydedildi.', 'success');
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  async exportZip() {
    try {
      const engine = await this.engine();
      const bytes = engine.ExportZip(this.projectJson('zip'));
      download(`${asciiFileName(this.name)}.zip`, bytes, 'application/zip');
    } catch (e) {
      toast('ZIP oluşturulamadı: ' + e.message, 'error');
    }
  }

  // ------------------------------------------------------------------ kaydetme

  markDirty() {
    if (this.readonly) return;
    this.dirty = true;
    this.setSaveState('Kaydediliyor…');
    try {
      localStorage.setItem(this.backupKey(), JSON.stringify({ version: this.version, time: Date.now(), data: this.data }));
    } catch { /* depolama dolu olabilir */ }
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.save(), SAVE_DELAY);
  }

  setSaveState(text, error = false) {
    this.saveState.textContent = text;
    this.saveState.classList.toggle('error', error);
  }

  async save({ force = false } = {}) {
    if (this.readonly) return true;
    clearTimeout(this.saveTimer);
    if (this.saving) {
      this.saveAgain = true;
      return this.savingPromise;
    }
    if (!this.dirty && !force) return true;
    this.saving = true;
    this.dirty = false;
    const payload = JSON.parse(JSON.stringify(this.data));
    this.savingPromise = (async () => {
      try {
        const r = await api.saveProject(this.id, payload, this.version, { force });
        this.version = r.version;
        this.setSaveState('Kaydedildi ✓ ' + formatDate(r.updated_at).replace('Bugün ', ''));
        if (!this.dirty) localStorage.removeItem(this.backupKey());
        return true;
      } catch (e) {
        this.dirty = true;
        if (e.status === 409) {
          this.setSaveState('Çakışma!', true);
          this.saving = false;
          await this.resolveConflict(e);
          return false;
        }
        this.setSaveState('Kaydedilemedi — yeniden denenecek', true);
        if (e.status !== 401 && e.status !== 403) this.saveTimer = setTimeout(() => this.save(), 5000);
        else toast(e.message, 'error', 8000);
        return false;
      } finally {
        this.saving = false;
        if (this.saveAgain) {
          this.saveAgain = false;
          if (this.dirty) this.save();
        }
      }
    })();
    return this.savingPromise;
  }

  async resolveConflict(e) {
    const r = await modal({
      title: 'Proje başka yerde değiştirilmiş',
      body: `Bu proje siz çalışırken başka bir bilgisayarda veya tarayıcı sekmesinde kaydedilmiş (${formatDate(e.data?.updated_at)}).\n\nNe yapmak istersiniz?`,
      buttons: [
        { text: 'Sunucudaki sürümü aç', value: 'reload' },
        { text: 'Benimkini kaydet (üzerine yaz)', value: 'force', primary: true },
      ],
      dismissable: false,
    });
    if (r === 'reload') {
      localStorage.removeItem(this.backupKey());
      this.dirty = false;
      location.reload();
    } else {
      this.dirty = true;
      await this.save({ force: true });
    }
  }

  onBeforeUnload(e) {
    if (this.dirty || this.saving) {
      e.preventDefault();
      e.returnValue = '';
    }
  }

  // ------------------------------------------------------------------ derleme ve çalıştırma

  log(text, cls) {
    const span = h('span', { class: cls || '' }, text + '\n');
    this.outputPre.appendChild(span);
    this.outputPre.parentNode.scrollTop = this.outputPre.parentNode.scrollHeight;
  }

  async build() {
    const engine = await this.engine();
    this.outputPre.innerHTML = '';
    this.log(`------ Derleme başladı: ${this.name} ------`, 'o-info');
    const t0 = performance.now();
    let r;
    try {
      r = JSON.parse(engine.Build(this.projectJson(true)));
    } catch (e) {
      this.log('Derleyici hatası: ' + e.message, 'o-err');
      this.showBottom('output');
      return null;
    }
    this.setDiagnostics(r.diagnostics);
    const errors = r.diagnostics.filter((d) => d.severity === 'error');
    const warnings = r.diagnostics.length - errors.length;
    for (const d of r.diagnostics) this.log(`${d.file}(${d.line},${d.col}): ${d.severity === 'error' ? 'hata' : 'uyarı'} ${d.code}: ${d.message}`, d.severity === 'error' ? 'o-err' : 'o-info');
    const secs = ((performance.now() - t0) / 1000).toFixed(1).replace('.', ',');
    if (r.success) {
      this.log(`========== Derleme: başarılı, ${warnings} uyarı (${secs} sn) ==========`, 'o-ok');
    } else {
      this.log(`========== Derleme: BAŞARISIZ — ${errors.length} hata, ${warnings} uyarı ==========`, 'o-err');
      this.showBottom('errors');
      toast(`Derleme hataları var (${errors.length}). Hata Listesi'ne bakın.`, 'error');
    }
    r.fileNames = r.files;
    return r;
  }

  async run() {
    if (this.running) await this.stop();
    const r = await this.build();
    if (!r?.success) return;
    this.lastFiles = r.fileNames || [];
    this.openRunner();
    const engine = await this.engine();
    this.desktop.start();
    this.desktop.attach(engine);
    setHost(this.desktop);
    this.running = true;
    this.btnStop.classList.remove('hidden');
    this.status.classList.add('running');
    this.statusText.textContent = 'Çalışıyor…';
    this.runState.textContent = 'Çalışıyor';
    this.runState.classList.remove('ended');
    this.runOutput.innerHTML = '';
    this.hadOutput = false;
    let err = '';
    try {
      err = engine.Run();
    } catch (e) {
      err = e.message;
    }
    if (err) {
      this.runLog(err, 'o-err');
      this.programEnded('Program başlatılamadı.');
    }
  }

  openRunner() {
    if (!this.overlay) {
      this.runState = h('span', { class: 'run-state' }, 'Çalışıyor');
      this.runOutput = h('pre');
      this.runOutputBox = h('div', { class: 'run-output collapsed' },
        h('div', { class: 'run-output-head', onclick: () => this.runOutputBox.classList.toggle('collapsed') }, 'Çıktı (Console)'),
        this.runOutput);
      const desk = h('div', { class: 'run-desktop' });
      this.overlay = h('div', { class: 'run-overlay hidden' },
        h('div', { class: 'run-bar' },
          h('span', { class: 'brand-logo' }, 'C#'),
          h('span', { class: 'run-title' }, this.name),
          this.runState,
          h('div', { class: 'spacer' }),
          h('button', { class: 'btn', title: 'Yeniden başlat', onclick: () => this.run() }, '↻ Yeniden başlat'),
          h('button', { class: 'btn btn-stop', title: 'Durdur (Shift+F5)', onclick: () => this.stop() }, '■ Durdur ve koda dön')),
        desk, this.runOutputBox);
      document.body.appendChild(this.overlay);
      this.desktop = new Desktop(desk, {
        onOutput: (text) => this.runWrite(text),
        onError: (info) => this.runtimeError(info),
        onEnded: (reason) => this.programEnded(reason),
        onDownload: (name, b64) => this.offerDownload(name, b64),
        onDataFile: (name, content) => this.onDataFile(name, content),
      });
    }
    this.overlay.classList.remove('hidden');
  }

  /** Console.Write çıktısı: metin olduğu gibi eklenir (satır sonları programdan gelir). */
  runWrite(text) {
    this.hadOutput = true;
    this.runOutputBox.classList.remove('collapsed');
    for (const pre of [this.runOutput, this.outputPre]) {
      const last = pre.lastChild;
      if (last && last.dataset?.raw === '1') last.textContent += text;
      else {
        const span = h('span', {}, text);
        span.dataset.raw = '1';
        pre.appendChild(span);
      }
    }
    this.runOutput.scrollTop = this.runOutput.scrollHeight;
  }

  /** Programın SaveFileDialog ile kaydettiği dosya: indirme bağlantısı. */
  offerDownload(name, b64) {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes]));
    this.hadOutput = true;
    this.runOutputBox.classList.remove('collapsed');
    for (const pre of [this.runOutput, this.outputPre]) {
      pre.querySelectorAll('a.o-file').forEach((a) => { if (a.dataset.name === name) a.parentElement.remove(); });
      const a = h('a', { class: 'o-file', href: url, download: name }, `⬇ ${name} indir`);
      a.dataset.name = name;
      pre.appendChild(h('span', { class: 'o-info' }, `📄 Dosya kaydedildi (${bytes.length} bayt): `, a, '\n'));
    }
    this.runOutput.scrollTop = this.runOutput.scrollHeight;
  }

  runLog(text, cls) {
    this.hadOutput = true;
    this.runOutputBox.classList.remove('collapsed');
    this.runOutput.appendChild(h('span', { class: cls }, text + '\n'));
    this.runOutput.scrollTop = this.runOutput.scrollHeight;
    this.log(text, cls);
  }

  runtimeError(info) {
    const file = typeof info.file === 'number' ? this.lastFiles?.[info.file] : info.file;
    const where = file && info.line ? `${file}, satır ${info.line}` : '';
    const type = (info.type || '').split('.').pop();
    this.runLog(`İşlenmemiş özel durum: ${info.type}: ${turkishMessage(info.type, info.message)}${where ? ' (' + where + ')' : ''}`, 'o-err');
    this.overlay.querySelector('.run-error')?.remove();
    const box = h('div', { class: 'run-error' },
      h('div', { class: 'run-error-head' }, 'Uygulamada işlenmemiş bir özel durum oluştu'),
      h('div', { class: 'run-error-body' },
        h('div', {}, 'Programınız bir hata nedeniyle bu işlemi tamamlayamadı.'),
        h('div', { class: 'msg' }, `${type}: ${turkishMessage(info.type, info.message)}`),
        where ? h('div', { class: 'where' }, '\u{1F4CD} ', h('b', {}, where)) : null,
        h('div', { class: 'muted small' }, explainException(info.type)),
        info.stack ? h('details', {}, h('summary', {}, 'Ayrıntılar'), h('pre', {}, info.stack)) : null),
      h('div', { class: 'run-error-foot' },
        h('button', { class: 'btn', onclick: () => box.remove() }, 'Devam'),
        where ? h('button', { class: 'btn', onclick: () => { this.stop(); this.openCode(file, info.line); this.editor.highlightLine(file, info.line); } }, 'Hatalı satırı göster') : null,
        h('button', { class: 'btn btn-danger', onclick: () => this.stop() }, 'Programı durdur')));
    this.overlay.querySelector('.run-desktop').appendChild(box);
  }

  programEnded(reason) {
    if (!this.running) return;
    this.running = false;
    this.btnStop.classList.add('hidden');
    this.status.classList.remove('running');
    this.statusText.textContent = 'Hazır';
    this.log(`Program sonlandı: ${reason}`, 'o-info');
    this.runState.textContent = reason;
    this.runState.classList.add('ended');
    // Form kapanınca VS'deki gibi koda dön; konsol çıktısı varsa okunabilsin diye ekran açık kalsın.
    if (!this.hadOutput && !this.overlay.querySelector('.run-error') && !/sonsuz|yanıt vermedi/.test(reason)) {
      this.closeRunner();
    } else if (/sonsuz|yanıt vermedi/.test(reason)) {
      this.runLog(reason, 'o-err');
    }
  }

  async stop() {
    if (this.engineObj) {
      try { this.engineObj.Stop(); } catch (e) { console.error(e); }
    }
    this.desktop?.clear();
    this.running = false;
    this.btnStop.classList.add('hidden');
    this.status.classList.remove('running');
    this.statusText.textContent = 'Hazır';
    this.closeRunner();
  }

  closeRunner() {
    this.overlay?.classList.add('hidden');
    this.overlay?.querySelector('.run-error')?.remove();
    this.desktop?.stop();
  }

  // ------------------------------------------------------------------ klavye

  onKey(e) {
    if (e.key === 'F5') {
      e.preventDefault();
      if (e.shiftKey) this.stop(); else this.run();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      this.save({ force: false });
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'b') {
      e.preventDefault();
      this.build();
      return;
    }
    if (e.key === 'F7' && this.active) {
      e.preventDefault();
      const form = this.active.kind === 'design' ? this.active.name : this.formOfFile(this.active.name);
      if (!form) return;
      if (e.shiftKey) this.openDesign(form);
      else this.openCode(`${form}.cs`);
    }
  }

  async dispose() {
    document.removeEventListener('keydown', this.keyHandler);
    window.removeEventListener('beforeunload', this.unloadHandler);
    clearTimeout(this.checkTimer);
    if (this.running) await this.stop();
    if (this.dirty) await this.save();
    this.overlay?.remove();
    this.editor?.dispose();
    return true;
  }
}

// .NET çalışma zamanının İngilizce hata mesajlarının Türkçe Windows'taki karşılıkları.
const TR_MESSAGES = {
  FormatException: 'Giriş dizesi doğru biçimde değildi.',
  DivideByZeroException: 'Sıfıra bölme girişiminde bulunuldu.',
  NullReferenceException: 'Nesne başvurusu bir nesnenin örneğine ayarlanmadı.',
  IndexOutOfRangeException: 'Dizin, dizi sınırlarının dışındaydı.',
  ArgumentOutOfRangeException: 'Dizin aralık dışındaydı. Negatif olmamalı ve koleksiyonun boyutundan küçük olmalıdır.',
  OverflowException: 'Değer, bu tür için çok büyük ya da çok küçüktü.',
  InvalidCastException: 'Belirtilen atama geçerli değil.',
  ArgumentNullException: 'Değer null olamaz.',
  KeyNotFoundException: 'Verilen anahtar sözlükte yoktu.',
  StackOverflowException: 'Yığın taşması oluştu.',
};

export function turkishMessage(type, message) {
  const short = String(type || '').split('.').pop();
  const tr = TR_MESSAGES[short];
  const msg = String(message || '');
  // Mesaj zaten Türkçeyse (kütüphanemizin mesajları) olduğu gibi bırak.
  if (!tr || /[çğıöşüÇĞİÖŞÜ]/.test(msg)) return msg;
  return tr;
}

/** İndirme adı: bazı tarayıcılar Türkçe karakterli adları "download" yapar. */
function asciiFileName(name) {
  const map = { ç: 'c', Ç: 'C', ğ: 'g', Ğ: 'G', ı: 'i', İ: 'I', ö: 'o', Ö: 'O', ş: 's', Ş: 'S', ü: 'u', Ü: 'U' };
  const s = String(name || 'Proje').replace(/[çÇğĞıİöÖşŞüÜ]/g, (c) => map[c])
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9 ._-]+/g, '_').trim();
  return s || 'Proje';
}

/** Sık görülen hataları öğrencinin anlayacağı dille açıklar. */
function explainException(type) {
  const t = String(type || '');
  if (t.endsWith('FormatException')) return 'İpucu: Bir metin sayıya çevrilemedi. Örneğin TextBox boş ya da içinde harf varken Convert.ToInt32 / int.Parse kullanılmış olabilir.';
  if (t.endsWith('NullReferenceException')) return 'İpucu: Değeri olmayan (null) bir nesne kullanılmaya çalışıldı. Nesneyi "new" ile oluşturduğunuzdan emin olun.';
  if (t.endsWith('IndexOutOfRangeException') || t.endsWith('ArgumentOutOfRangeException')) return 'İpucu: Dizinin/listenin sınırları dışındaki bir elemana erişildi. Sıra numarası (indeks) 0\'dan başlar.';
  if (t.endsWith('DivideByZeroException')) return 'İpucu: Bir tam sayı sıfıra bölünmeye çalışıldı.';
  if (t.endsWith('OverflowException')) return 'İpucu: Sayı, değişken türünün alabileceği değerden büyük.';
  if (t.endsWith('InvalidCastException')) return 'İpucu: Bir değer uyumsuz bir türe dönüştürülmeye çalışıldı.';
  if (t.endsWith('ObjectDisposedException')) return 'İpucu: Kapatılmış bir form tekrar kullanılmaya çalışıldı. Yeni form için "new" kullanın.';
  if (t.endsWith('InvalidOperationException')) return 'İpucu: İşlem şu anki durumda yapılamıyor.';
  return '';
}
