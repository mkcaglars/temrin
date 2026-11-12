// Temrin çalışma ekranı: c-lesson editörü (Ide) + görev, sorular, teslim ve sonuç paneli.
// build.sh bu dosyayı studyo/temrin/temrin.js olarak kopyalar.
import { calismaYukle, labKaydiniKapat } from '../assets/js/api.js';
import { h } from '../assets/js/ui.js';
import { loadEngine } from '../assets/js/engine.js';
import { Ide } from '../assets/js/ide.js';
import { ensureMysql } from '../assets/js/mysqlbridge.js';
import { TemrinPaneli, ogretmenGorunumu, yarimKalaniTamamla } from './panel.js';
import { hepsiniDegerlendir, labKontrolu, labHazirla } from './lab-denetim.js';

const app = document.getElementById('app');
const enginePromise = loadEngine((yuklenen, toplam) =>
  document.dispatchEvent(new CustomEvent('engine-progress', { detail: toplam ? yuklenen / toplam : 0 })));

/** c-lesson editörü: kayıt ve görünüm temrine uyarlanır, sağa temrin paneli eklenir. */
class TemrinIde extends Ide {
  constructor(ctx, durum) {
    super(ctx, durum.temrin.temrin_id);
    this.durum = durum;
  }

  backupKey() {
    return `temrin-yedek-${this.id}`;
  }

  buildLayout(root) {
    super.buildLayout(root);
    const ust = this.el.querySelector('.ide-top');
    // c-lesson'a özgü öğeler: proje listesi bağlantıları, yeniden adlandırma, salt okunur bandı, "Kopyasını al".
    this.el.querySelectorAll('.ide-banner').forEach((b) => b.remove());
    ust.querySelectorAll('a.btn').forEach((a) => a.remove());
    [...ust.querySelectorAll('button')].filter((b) => /Kopyasını al|Sınıfa gönder/.test(b.textContent)).forEach((b) => b.remove());
    const marka = ust.querySelector('a.brand');
    marka.href = '../';
    marka.title = 'Temrinlerim';
    marka.querySelector('.brand-logo')?.replaceWith(h('img', { class: 'temrin-logo', src: '../assets/ikon/ikon-64.png', alt: 'Temrin', width: 28, height: 28 }));
    this.titleEl.onclick = null;
    this.titleEl.title = this.name;
    this.titleEl.style.cursor = 'default';

    const t = this.durum.temrin;
    this.panel = new TemrinPaneli(this.calismaAlani(), this.durum);
    this.btnPanel = h('button', { class: 'btn', onclick: () => this.panel.ac(!this.panel.acik) }, '📋 Görev ve sorular');
    ust.insertBefore(this.btnPanel, ust.querySelector('.spacer'));
    if (this.panel.teslimEdilebilir()) {
      ust.appendChild(h('button', { class: 'btn btn-primary', onclick: () => this.panel.teslimEt() }, '✔ Teslim et'));
    }
    if (t.bilgi.ortam === 'ikisi') {
      ust.appendChild(h('a', { class: 'btn', href: 'lab.php' + location.search, target: '_blank', title: 'MySQL, Workbench… (sanal bilgisayar)' }, '🧪 Laboratuvar'));
    }
    ust.appendChild(h('a', { class: 'btn', href: '../' }, ogretmenGorunumu ? 'Puan tablosu' : 'Temrinlerim'));

    const c = this.durum.calisma;
    if (ogretmenGorunumu) {
      const o = c.ogrenci;
      this.el.insertBefore(h('div', { class: 'ide-banner readonly' },
        `👁 ${o.okul_no} ${o.ad_soyad} (${o.sinif}) — Temrin ${t.bilgi.temrin_no} teslimi. Salt okunur; programı çalıştırıp deneyebilirsiniz.`), ust.nextSibling);
    } else if (c.teslim_zamani) {
      this.el.insertBefore(h('div', { class: 'ide-banner note' },
        '✔ Temrin teslim edildi. Proje artık değiştirilemez; programı çalıştırıp deneyebilirsiniz.'), ust.nextSibling);
    } else if (!this.durum.erisilebilir) {
      this.el.insertBefore(h('div', { class: 'ide-banner readonly' }, `Temrin şu an kapalı: ${this.durum.neden}`), ust.nextSibling);
    }
    this.el.querySelector('.ide-main').appendChild(this.panel.el);
    this.panel.ac(true);
  }

  /** Temrin panelinin kullandığı çalışma alanı: kayıt, teslim ve değerlendirme. */
  calismaAlani() {
    const ide = this;
    return {
      yerlesim: () => ide.editor?.layout?.(),
      async teslimVerisi() {
        clearTimeout(ide.saveTimer);
        ide.stop?.();
        return { veri: JSON.parse(JSON.stringify(ide.data)) };
      },
      teslimSonrasi() {
        ide.dirty = false;
        try { localStorage.removeItem(ide.backupKey()); } catch { /* önemli değil */ }
      },
      degerlendir: (kontroller) => projeyiDegerlendir(ide, kontroller),
    };
  }
}

/** Program MySQL kullanıyorsa ya da laboratuvar kontrolü varsa laboratuvar yüklenir; değerlendirme sırasında kaydedilmez. */
async function projeyiDegerlendir(ide, kontroller) {
  const motor = await enginePromise;
  let lab = null;
  if (kontroller.some(labKontrolu) || ide.usesMySql?.()) {
    labKaydiniKapat();
    lab = await ensureMysql(ide.ctx.user);
  }
  return hepsiniDegerlendir(motor, ide.projectJson(true), kontroller, lab);
}

async function baslat() {
  let durum;
  try {
    durum = await calismaYukle();
  } catch (e) {
    app.replaceChildren(h('div', { class: 'center-page' }, h('div', { class: 'card' },
      h('h2', {}, 'Temrin açılamadı'), h('p', {}, e.message), h('a', { class: 'btn btn-primary', href: '../' }, 'Geri dön'))));
    return;
  }
  // Yalnızca laboratuvarda çalışılan temrin: laboratuvar ekranı açılır.
  if (durum.temrin.bilgi.ortam === 'laboratuvar') {
    location.replace('lab.php' + location.search);
    return;
  }
  app.replaceChildren();
  const ide = new TemrinIde({ user: { name: document.body.dataset.ad, role: document.body.dataset.rol }, info: {}, enginePromise, app }, durum);
  await ide.mount(app);
  // C# + laboratuvar temrini: program laboratuvardaki MySQL'e bağlanabilsin diye laboratuvar hazırlanır (ilk açılışta bir kez).
  if (durum.temrin.bilgi.ortam === 'ikisi' && !ogretmenGorunumu && !durum.calisma.teslim_zamani && durum.erisilebilir) {
    ensureMysql(ide.ctx.user).then(({ store }) => labHazirla(store, durum.temrin)).catch((e) => console.error('Laboratuvar hazırlanamadı', e));
  }
  await yarimKalaniTamamla(ide.calismaAlani(), durum);
}

baslat();
