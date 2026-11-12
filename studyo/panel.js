// Temrin paneli: görev, sorular, kalan süre, teslim ve sonuç. Stüdyo (temrin.js) ve Laboratuvar (lab.js) ekranlarında ortak.
// build.sh bu dosyayı studyo/temrin/panel.js olarak kopyalar.
import { istek } from '../assets/js/api.js';
import { h, toast, modal } from '../assets/js/ui.js';

export const ogretmenGorunumu = document.body.dataset.rol === 'ogretmen';

/**
 * Sağdaki panel: görev, ölçütler, sorular, kalan süre, teslim ve sonuç.
 * alan: çalışma alanı (Stüdyo ya da Laboratuvar). Beklenenler:
 *   yerlesim()                  panel açılıp kapanınca düzeni yeniler
 *   async teslimVerisi()        teslimden önce kaydedilmemişleri kaydeder; { veri } (laboratuvarda veri yok)
 *   teslimSonrasi()             yerel yedekleri temizler
 *   async degerlendir(k)        kontrolleri çalıştırır → { derlendi, hatalar, sonuclar }
 *   teslimNotu (isteğe bağlı)   teslim bu ekrandan yapılamıyorsa gösterilecek açıklama
 */
export class TemrinPaneli {
  constructor(alan, durum) {
    this.alan = alan;
    this.durum = durum;
    this.cevaplar = { ...(durum.calisma.cevaplar || {}) };
    this.el = h('aside', { class: 'temrin-panel' });
    this.ciz();
  }

  teslimEdilebilir() {
    return !ogretmenGorunumu && !this.durum.calisma.teslim_zamani && this.durum.erisilebilir && !this.alan.teslimNotu;
  }

  ac(acik) {
    this.acik = acik;
    this.el.classList.toggle('kapali', !acik);
    this.alan.yerlesim?.();
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
      const lab = this.durum.temrin.bilgi.ortam === 'laboratuvar';
      bolumler.push(h('section', {}, h('button', { class: 'btn btn-primary tp-teslim', onclick: () => this.teslimEt() }, '✔ Temrini teslim et'),
        h('p', { class: 'muted' }, lab
          ? 'Teslimden sonra laboratuvardaki veritabanlarınız ve cevaplarınız değiştirilemez. Veritabanlarınız otomatik olarak denetlenir ve sonucunuz burada görünür.'
          : 'Teslimden sonra proje ve cevaplar değiştirilemez. Program otomatik olarak test edilir ve sonucunuz burada görünür.')));
    } else if (this.alan.teslimNotu && !ogretmenGorunumu && !this.durum.calisma.teslim_zamani) {
      bolumler.push(h('section', {}, h('p', { class: 'muted' }, this.alan.teslimNotu)));
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
        s.kesin ? null : h('span', { class: 'rozet' }, s.onay?.gerekli && !s.onay.onaylayan && s.olcutler.every((o) => o.alinan !== null)
          ? 'Öğretmen onayı bekleniyor' : 'Öğretmen puanlaması bekleniyor')),
      h('table', { class: 'tp-tablo' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Değerlendirme'), h('th', { class: 'sayi' }, 'Puan'), h('th', { class: 'sayi' }, 'Alınan'))),
        h('tbody', {}, s.olcutler.flatMap((o) => [
          h('tr', {}, h('td', {}, o.baslik), h('td', { class: 'sayi' }, o.puan), h('td', { class: 'sayi' }, o.alinan ?? h('span', { class: 'rozet' }, 'bekliyor'))),
          o.tespit ? h('tr', { class: 'tp-tespit' }, h('td', { colspan: 3 }, '↳ ' + o.tespit)) : null,
          o.gerekce ? h('tr', { class: 'tp-tespit' }, h('td', { colspan: 3 }, '↳ Öğretmen: ' + o.gerekce)) : null,
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
      const { veri } = await this.alan.teslimVerisi();
      const yanit = await istek('POST', { islem: 'teslim', temrin_id: this.durum.temrin.temrin_id, veri: veri ?? null, cevaplar: this.cevaplar });
      this.alan.teslimSonrasi?.();
      bekle.yaz(this.durum.temrin.bilgi.ortam === 'laboratuvar' ? 'Veritabanlarınız denetleniyor…' : 'Programınız test ediliyor…');
      await degerlendirVeGonder(this.alan, yanit.kontroller, this.durum.temrin.temrin_id);
    } catch (e) {
      bekle.kapat();
      toast(e.message, 'error', 8000);
      if (e.status !== 409) return;
    }
    location.reload();
  }
}

export function beklemeKutusu(metin) {
  const yazi = h('div', {}, metin);
  const kutu = h('div', { class: 'modal-shade' }, h('div', { class: 'modal tp-bekle' }, h('div', { class: 'modal-body' }, h('div', { class: 'spinner' }), yazi)));
  document.body.appendChild(kutu);
  return { yaz: (m) => { yazi.textContent = m; }, kapat: () => kutu.remove() };
}

/** Kontrolleri çalışma alanında (öğrenci tarayıcısı) çalıştırır, sonucu sunucuya gönderir. */
export async function degerlendirVeGonder(alan, kontroller, temrinId) {
  const sonuc = await alan.degerlendir(kontroller);
  await istek('POST', { islem: 'degerlendirme', temrin_id: temrinId, sonuc });
}

/** Teslim edilmiş ama değerlendirmesi yarım kalmışsa (sayfa kapandıysa) şimdi tamamlar. */
export async function yarimKalaniTamamla(alan, durum) {
  if (ogretmenGorunumu || !durum.calisma.teslim_zamani || !durum.kontroller) return;
  const bekle = beklemeKutusu(durum.temrin.bilgi.ortam === 'laboratuvar' ? 'Veritabanlarınız denetleniyor…' : 'Programınız test ediliyor…');
  try {
    await degerlendirVeGonder(alan, durum.kontroller, durum.temrin.temrin_id);
    location.reload();
  } catch (e) {
    bekle.kapat();
    toast('Otomatik değerlendirme yapılamadı: ' + e.message + ' Öğretmeniniz değerlendirecek.', 'error', 10000);
  }
}
