// Temrin çalışma ekranı: c-lesson editörü (Ide) + görev, sorular, teslim ve sonuç paneli.
// build.sh bu dosyayı studyo/temrin/temrin.js olarak kopyalar.
import { api, istek, calismaYukle } from '../assets/js/api.js';
import { h, toast, modal } from '../assets/js/ui.js';
import { loadEngine } from '../assets/js/engine.js';
import { Ide } from '../assets/js/ide.js';

const app = document.getElementById('app');
const ogretmenGorunumu = document.body.dataset.rol === 'ogretmen';
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
    this.titleEl.onclick = null;
    this.titleEl.title = this.name;
    this.titleEl.style.cursor = 'default';

    const t = this.durum.temrin;
    this.panel = new TemrinPaneli(this, this.durum);
    this.btnPanel = h('button', { class: 'btn', onclick: () => this.panel.ac(!this.panel.acik) }, '📋 Görev ve sorular');
    ust.insertBefore(this.btnPanel, ust.querySelector('.spacer'));
    if (this.panel.teslimEdilebilir()) {
      ust.appendChild(h('button', { class: 'btn btn-primary', onclick: () => this.panel.teslimEt() }, '✔ Teslim et'));
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
}

/** Sağdaki panel: görev, ölçütler, sorular, kalan süre, teslim ve sonuç. */
class TemrinPaneli {
  constructor(ide, durum) {
    this.ide = ide;
    this.durum = durum;
    this.cevaplar = { ...(durum.calisma.cevaplar || {}) };
    this.el = h('aside', { class: 'temrin-panel' });
    this.ciz();
  }

  teslimEdilebilir() {
    return !ogretmenGorunumu && !this.durum.calisma.teslim_zamani && this.durum.erisilebilir;
  }

  ac(acik) {
    this.acik = acik;
    this.el.classList.toggle('kapali', !acik);
    this.ide.editor?.layout?.();
  }

  ciz() {
    const { temrin: t, calisma: c, sonuc } = this.durum;
    const b = t.bilgi;
    const kilitli = !this.teslimEdilebilir();
    const bolumler = [h('div', { class: 'tp-baslik' },
      h('div', { class: 'tp-ust' }, h('b', {}, `Temrin ${b.temrin_no} · ${b.baslik}`), h('button', { class: 'tab-x', title: 'Paneli kapat', onclick: () => this.ac(false) }, '✕')),
      b.ders ? h('div', { class: 'muted' }, b.ders) : null,
      this.sureEl = h('div', { class: 'tp-sure' }))];

    if (sonuc !== undefined) bolumler.push(this.sonucBolumu());

    bolumler.push(h('section', {},
      h('h3', {}, 'İşlem konusu'), h('p', {}, b.islem_konusu || ''),
      t.araclar.length ? h('div', {}, h('h3', {}, 'Araç / gereç'), h('ul', {}, t.araclar.map((a) => h('li', {}, a)))) : null,
      t.islemler.length ? h('div', {}, h('h3', {}, 'Yapılacak işlemler'), h('ol', {}, t.islemler.map((a) => h('li', {}, a)))) : null));

    if (sonuc === undefined) {
      bolumler.push(h('section', {}, h('h3', {}, 'Değerlendirme'),
        h('table', { class: 'tp-tablo' }, h('tbody', {}, t.olcutler.map((o) => h('tr', {}, h('td', {}, o.baslik), h('td', { class: 'sayi' }, o.puan)))))));
    }

    if (t.sorular.length) {
      bolumler.push(h('section', {}, h('h3', {}, 'Sorular'), t.sorular.map((s, i) => this.soru(s, i + 1, kilitli))));
    }

    if (this.teslimEdilebilir()) {
      bolumler.push(h('section', {}, h('button', { class: 'btn btn-primary tp-teslim', onclick: () => this.teslimEt() }, '✔ Temrini teslim et'),
        h('p', { class: 'muted' }, 'Teslimden sonra proje ve cevaplar değiştirilemez. Program otomatik olarak test edilir ve sonucunuz burada görünür.')));
    }
    this.el.replaceChildren(...bolumler.filter(Boolean));
    this.sureyiBaslat();
  }

  soru(s, sira, kilitli) {
    const kaydet = (v) => { this.cevaplar[s.no] = v; this.cevapKaydet(); };
    let alan;
    if (s.tip === 'coktan') {
      alan = h('div', { class: 'tp-secenekler' }, s.secenekler.map((sec, i) => {
        const harf = String.fromCharCode(65 + i);
        return h('label', {}, h('input', { type: 'radio', name: 'soru-' + s.no, value: harf, checked: this.cevaplar[s.no] === harf, disabled: kilitli,
          onchange: () => kaydet(harf) }), ' ', sec);
      }));
    } else {
      alan = h('textarea', { class: 'input tp-cevap', rows: s.tip === 'cikti' ? 4 : 3, disabled: kilitli, spellcheck: 'false',
        placeholder: s.tip === 'cikti' ? 'Ekrana yazılacak çıktıyı satır satır yazın' : 'Cevabınız' });
      alan.value = this.cevaplar[s.no] || '';
      alan.addEventListener('input', () => kaydet(alan.value));
    }
    return h('div', { class: 'tp-soru' },
      h('div', {}, h('b', {}, `${sira}. `), s.metin, h('span', { class: 'muted' }, ` (${s.puan} puan)`)),
      s.kod ? h('pre', { class: 'tp-kod' }, s.kod) : null,
      alan);
  }

  cevapKaydet() {
    clearTimeout(this.cevapZamanlayici);
    this.cevapZamanlayici = setTimeout(async () => {
      try {
        await istek('POST', { islem: 'cevap', temrin_id: this.durum.temrin.temrin_id, cevaplar: this.cevaplar });
      } catch (e) {
        toast('Cevaplar kaydedilemedi: ' + e.message, 'error');
      }
    }, 800);
  }

  sureyiBaslat() {
    clearInterval(this.sureZamanlayici);
    const dk = this.durum.temrin.bilgi.sure_dk;
    const c = this.durum.calisma;
    if (!this.sureEl) return;
    if (c.teslim_zamani) {
      this.sureEl.textContent = 'Teslim: ' + new Date(c.teslim_zamani).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });
      return;
    }
    if (!dk || !c.baslama || ogretmenGorunumu) return;
    const bitis = new Date(c.baslama).getTime() + dk * 60000;
    const guncelle = () => {
      const kalan = Math.round((bitis - Date.now()) / 1000);
      const m = Math.floor(Math.abs(kalan) / 60), s = Math.abs(kalan) % 60;
      this.sureEl.textContent = kalan >= 0 ? `Kalan süre: ${m}:${String(s).padStart(2, '0')}` : `Süre ${m} dk ${s} sn aşıldı`;
      this.sureEl.classList.toggle('asildi', kalan < 0);
    };
    guncelle();
    this.sureZamanlayici = setInterval(guncelle, 1000);
  }

  sonucBolumu() {
    const s = this.durum.sonuc;
    if (!s) return h('section', { class: 'tp-sonuc' }, h('p', {}, 'Değerlendiriliyor…'));
    return h('section', { class: 'tp-sonuc' },
      h('h3', {}, 'Sonuç'),
      h('div', { class: 'tp-puan' }, h('span', { class: 'buyuk' }, s.puan ?? '–'), ' / 100 ',
        s.kesin ? null : h('span', { class: 'rozet' }, 'Öğretmen puanlaması bekleniyor')),
      h('table', { class: 'tp-tablo' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Değerlendirme'), h('th', { class: 'sayi' }, 'Puan'), h('th', { class: 'sayi' }, 'Alınan'))),
        h('tbody', {}, s.olcutler.flatMap((o) => [
          h('tr', {}, h('td', {}, o.baslik), h('td', { class: 'sayi' }, o.puan), h('td', { class: 'sayi' }, o.alinan ?? h('span', { class: 'rozet' }, 'bekliyor'))),
          o.tespit ? h('tr', { class: 'tp-tespit' }, h('td', { colspan: 3 }, '↳ ' + o.tespit)) : null,
        ]))));
  }

  async teslimEt() {
    if (!this.teslimEdilebilir()) return;
    const bos = this.durum.temrin.sorular.filter((s) => !(this.cevaplar[s.no] || '').trim()).length;
    const r = await modal({
      title: 'Temrini teslim et',
      body: (bos ? `${bos} soruyu cevaplamadınız.\n\n` : '') + 'Teslimden sonra projenizi ve cevaplarınızı değiştiremezsiniz. Teslim edilsin mi?',
      buttons: [{ text: 'Vazgeç', value: null }, { text: 'Teslim et', value: 'ok', primary: true }],
    });
    if (r !== 'ok') return;
    const bekle = beklemeKutusu('Teslim ediliyor…');
    try {
      clearTimeout(this.cevapZamanlayici);
      clearTimeout(this.ide.saveTimer);
      this.ide.stop?.();
      const veri = JSON.parse(JSON.stringify(this.ide.data));
      const yanit = await istek('POST', { islem: 'teslim', temrin_id: this.durum.temrin.temrin_id, veri, cevaplar: this.cevaplar });
      this.ide.dirty = false;
      try { localStorage.removeItem(this.ide.backupKey()); } catch { /* önemli değil */ }
      bekle.yaz('Programınız test ediliyor…');
      await degerlendirVeGonder(this.ide.projectJson(), yanit.kontroller, this.durum.temrin.temrin_id);
    } catch (e) {
      bekle.kapat();
      toast(e.message, 'error', 8000);
      if (e.status !== 409) return;
    }
    location.reload();
  }
}

function beklemeKutusu(metin) {
  const yazi = h('div', {}, metin);
  const kutu = h('div', { class: 'modal-shade' }, h('div', { class: 'modal tp-bekle' }, h('div', { class: 'modal-body' }, h('div', { class: 'spinner' }), yazi)));
  document.body.appendChild(kutu);
  return { yaz: (m) => { yazi.textContent = m; }, kapat: () => kutu.remove() };
}

/** Motoru öğrenci tarayıcısında çalıştırır, sonucu sunucuya gönderir. */
async function degerlendirVeGonder(projeJson, kontroller, temrinId) {
  const motor = await enginePromise;
  const sonuc = JSON.parse(motor.Degerlendir(projeJson, JSON.stringify(kontroller)));
  await istek('POST', { islem: 'degerlendirme', temrin_id: temrinId, sonuc });
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
  app.replaceChildren();
  const ide = new TemrinIde({ user: { name: document.body.dataset.ad, role: document.body.dataset.rol }, info: {}, enginePromise, app }, durum);
  await ide.mount(app);

  // Teslim edilmiş ama değerlendirmesi yarım kalmışsa (sayfa kapandıysa) şimdi tamamla.
  if (!ogretmenGorunumu && durum.calisma.teslim_zamani && durum.kontroller) {
    const bekle = beklemeKutusu('Programınız test ediliyor…');
    try {
      await degerlendirVeGonder(ide.projectJson(), durum.kontroller, durum.temrin.temrin_id);
      location.reload();
    } catch (e) {
      bekle.kapat();
      toast('Otomatik değerlendirme yapılamadı: ' + e.message + ' Öğretmeniniz değerlendirecek.', 'error', 10000);
    }
  }
}

baslat();
