// Öğretmen ekranı: puan tablosu, ölçüt düzeltme, temrin erişimi, CSV.
'use strict';

const el = (etiket, ozellik = {}, ...cocuklar) => {
  const e = document.createElement(etiket);
  for (const [k, v] of Object.entries(ozellik)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v === true) e.setAttribute(k, '');
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const c of cocuklar.flat(Infinity)) if (c != null) e.append(c instanceof Node ? c : String(c));
  return e;
};
const csrf = document.querySelector('meta[name=csrf]').content;
const sayi = v => v == null ? '–' : String(v).replace('.', ',');
const kok = document.getElementById('uygulama');
const durum = { sinif: '', sekme: 'puanlar', siniflar: [] };

async function api(sorgu, govde) {
  const y = await fetch('api/ogretmen.php' + (govde ? '' : '?' + new URLSearchParams(sorgu)), govde ? {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify(govde),
  } : { credentials: 'same-origin' });
  const v = await y.json();
  if (!y.ok) throw Object.assign(new Error(v.mesaj || 'İşlem yapılamadı.'), { kod: v.kod, hatalar: v.hatalar });
  return v;
}

function hata(e) { kok.append(el('p', { class: 'hata' }, e.message)); }

async function goster() {
  try {
    const v = await api({ islem: 'tablo', sinif: durum.sinif });
    durum.siniflar = v.siniflar;
    durum.tablo = v;
    const govde = durum.sekme === 'puanlar' ? puanTablosu(v) : durum.sekme === 'temrinler' ? await temrinlerPaneli() : await erisimPaneli();
    kok.replaceChildren(ustBar(), govde);
  } catch (e) { kok.replaceChildren(); hata(e); }
}

function ustBar() {
  const sec = el('select', { onchange: e => { durum.sinif = e.target.value; goster(); } },
    el('option', { value: '' }, 'Tüm sınıflarım'),
    durum.siniflar.map(s => el('option', { value: s, selected: s === durum.sinif }, s)));
  const sekme = (ad, baslik) => el('button', { 'aria-selected': String(durum.sekme === ad), onclick: () => { durum.sekme = ad; goster(); } }, baslik);
  const csv = el('a', { href: 'api/disa-aktar.php?' + new URLSearchParams(durum.sinif ? { sinif: durum.sinif } : {}) }, 'CSV indir');
  if (!durum.siniflar.length) return el('div', { class: 'kart' }, el('p', { class: 'hata' }, 'Portal bu ders için size bağlı bir sınıf göndermedi.'));
  return el('div', {},
    el('div', { class: 'sekmeler' }, sekme('puanlar', 'Puanlar'), sekme('temrinler', 'Temrinler'), sekme('erisim', 'Temrin erişimi')),
    el('div', { class: 'satir kart' }, el('label', {}, 'Sınıf: ', sec), durum.sekme === 'puanlar' ? csv : null));
}

function puanTablosu(v) {
  if (!v.ogrenciler.length) return el('div', { class: 'kart' }, el('p', { class: 'soluk' }, 'Bu sınıflarda henüz giriş yapan ya da teslim eden öğrenci yok.'));
  const hucre = (o, t) => {
    const p = o.puanlar[t.temrin_id];
    if (!p) return el('td', { class: 'sayi soluk' }, '–');
    return el('td', { class: 'sayi' },
      el('button', { class: 'hucre', title: 'Ölçütleri göster / düzelt', onclick: () => duzelt(t.temrin_id, o.okul_no) }, p.puan ?? '–'),
      p.degerlendiren === 'ogretmen' ? el('span', { class: 'dogrulandi', title: 'Otomatik değerlendirme öğretmen tarafından doğrulandı' }, ' ✓') : null,
      p.kesin ? null : el('div', {}, el('span', { class: 'rozet' }, 'bekliyor')));
  };
  return el('div', { class: 'kart kaydir' }, el('table', {},
    el('thead', {}, el('tr', {}, el('th', {}, 'Okul No'), el('th', {}, 'Ad Soyad'), el('th', {}, 'Sınıf'),
      v.temrinler.map(t => el('th', { class: 'sayi', title: t.baslik }, `T${t.temrin_no}`, el('div', { class: 'soluk' }, t.baslik))),
      el('th', { class: 'sayi' }, 'Ortalama'))),
    el('tbody', {}, v.ogrenciler.map(o => el('tr', {},
      el('td', {}, o.okul_no), el('td', {}, o.ad_soyad), el('td', {}, o.sinif),
      v.temrinler.map(t => hucre(o, t)),
      el('td', { class: 'sayi' }, sayi(o.ortalama))))),
    el('tfoot', {}, el('tr', {}, el('td', { colspan: 3 }, 'Temrin ortalaması'),
      v.temrinler.map(t => el('td', { class: 'sayi' }, sayi(v.temrin_ortalamalari[t.temrin_id]))),
      el('td', { class: 'sayi', title: 'Sınıf ortalaması' }, sayi(v.sinif_ortalamasi))))),
    el('p', { class: 'soluk' }, 'Ortalamalara yalnızca kesinleşmiş puanlar girer. Sınıf ortalaması, öğrenci ortalamalarının ortalamasıdır.'));
}

async function duzelt(temrinId, okulNo) {
  let s;
  try { s = (await api({ islem: 'sonuc', temrin_id: temrinId, okul_no: okulNo })).sonuc; } catch (e) { return alert(e.message); }
  const satirlar = s.olcutler.map(o => ({ o,
    alinan: el('input', { type: 'number', min: 0, max: o.puan, step: 1, value: o.alinan ?? '' }),
    tespit: el('input', { type: 'text', maxlength: 500, value: o.tespit || '' }) }));
  const mesaj = el('p', { class: 'hata' });
  const dlg = el('dialog', {}, el('div', { class: 'kart' },
    el('h2', {}, `T${s.temrin_no} ${s.temrin_adi} · ${s.okul_no} ${s.ad_soyad}`),
    el('div', { class: 'kaydir' }, el('table', {},
      el('thead', {}, el('tr', {}, el('th', {}, 'Değerlendirme'), el('th', { class: 'sayi' }, 'Puanı'), el('th', { class: 'sayi' }, 'Alınan'), el('th', {}, 'Tespitler'))),
      el('tbody', {}, satirlar.map(r => el('tr', {},
        el('td', {}, r.o.baslik, r.o.duzenleyen === 'ogretmen' ? el('div', { class: 'soluk' }, 'öğretmen düzenledi') : null, kalemler(r.o)),
        el('td', { class: 'sayi' }, r.o.puan), el('td', { class: 'sayi' }, r.alinan), el('td', {}, r.tespit)))))),
    s.derlendi === false ? el('p', { class: 'hata' }, 'Proje derlenmedi: ', (s.derleme_hatalari || []).join(' · ')) : null,
    el('p', { class: 'soluk' }, s.degerlendiren === 'ogretmen' ? 'Otomatik değerlendirme sizin tarayıcınızda doğrulandı.'
      : s.degerlendiren === 'ogrenci' ? 'Otomatik değerlendirme öğrencinin tarayıcısında yapıldı. Temrinler sekmesinden doğrulayabilirsiniz.'
      : 'Otomatik değerlendirme henüz yapılmadı. Temrinler sekmesinden çalıştırabilirsiniz.'),
    mesaj,
    el('div', { class: 'satir' },
      el('button', { class: 'ana', onclick: kaydet }, 'Kaydet'),
      el('button', { onclick: () => dlg.close() }, 'Vazgeç'),
      el('a', { href: `studyo/?temrin=${temrinId}&ogrenci=${encodeURIComponent(okulNo)}`, target: '_blank', rel: 'noopener' }, 'Projeyi aç ↗'),
      el('a', { href: `sayfa.php?temrin_id=${temrinId}&okul_no=${encodeURIComponent(okulNo)}`, target: '_blank', rel: 'noopener' }, 'Temrin sayfası ↗'))));
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();

  async function kaydet() {
    const olcutler = [];
    for (const r of satirlar) {
      const a = r.alinan.value.trim() === '' ? null : Number(r.alinan.value);
      if (a !== null && (!Number.isInteger(a) || a < 0 || a > r.o.puan)) { mesaj.textContent = `${r.o.baslik}: 0 ile ${r.o.puan} arasında tam sayı girin.`; return; }
      if (a !== r.o.alinan || r.tespit.value.trim() !== (r.o.tespit || '')) olcutler.push({ no: r.o.no, alinan: a, tespit: r.tespit.value });
    }
    if (!olcutler.length) return dlg.close();
    try { await api(null, { islem: 'duzelt', temrin_id: temrinId, okul_no: okulNo, olcutler }); dlg.close(); goster(); }
    catch (e) { mesaj.textContent = e.message; }
  }
}

/** Ölçütün altındaki kontrol ve sorular: hangisi geçti, öğrencinin cevabı. */
function kalemler(o) {
  if (!o.kalemler || !o.kalemler.length) return null;
  return el('details', { class: 'kalemler' }, el('summary', {}, `${o.kalemler.length} kontrol / soru`),
    el('ul', {}, o.kalemler.map(k => el('li', { class: k.alinan === null ? 'bekliyor' : k.alinan === k.puan ? 'gecti' : 'kaldi' },
      `${k.no} (${k.alinan ?? '?'}/${k.puan}) `, k.mesaj || (k.alinan === k.puan ? 'geçti' : ''),
      k.metin ? el('div', { class: 'soluk' }, k.metin) : null,
      k.cevap !== undefined ? el('pre', { class: 'cevap' }, k.cevap || '(boş)') : null,
      k.ipucu ? el('div', { class: 'soluk' }, 'Anahtar kelimeler: ' + k.ipucu.split('|').join(', ')) : null))));
}

let motorSozu = null;
/** Değerlendirme motoru (çalışma ekranıyla aynı dosyalar). İlk kullanımda ~10 MB indirilir. */
function motor() {
  // import() adresi betiğin konumuna göre çözülür; sayfaya göre vermek için tam adres kullanılır.
  motorSozu ??= import(new URL('studyo/assets/js/engine.js', document.baseURI).href).then(m => m.loadEngine());
  motorSozu.catch(() => { motorSozu = null; });
  return motorSozu;
}

/** Kaydedilmiş c-lesson proje verisinden derleyici girdisi (c-lesson Ide.projectJson ile aynı biçim). */
function projeJson(veri) {
  return JSON.stringify({ name: 'Proje', namespace: veri.namespace || 'WinFormsApp', files: (veri.files || []).map(f => ({ name: f.name, content: f.content })), dataFiles: [] });
}

async function temrinlerPaneli() {
  const v = await api({ islem: 'temrinler' });
  const dosya = el('input', { type: 'file', accept: '.csv,text/csv' });
  // Yüklemeden sonra liste yenilenir; başarı mesajı yeni çizimde gösterilsin diye saklanır.
  const mesaj = el('div', {}, durum.yuklemeMesaji ? el('p', {}, durum.yuklemeMesaji) : null);
  durum.yuklemeMesaji = null;
  const yukle = async (uzerineYaz = false) => {
    const f = dosya.files[0];
    if (!f) { mesaj.replaceChildren(el('p', { class: 'hata' }, 'Önce bir CSV dosyası seçin.')); return; }
    const csv = await f.text();
    try {
      const r = await api(null, { islem: 'temrin_yukle', csv, uzerine_yaz: uzerineYaz });
      durum.yuklemeMesaji = `✓ Temrin ${r.temrin.temrin_no} (${r.temrin.baslik}) yüklendi.`;
      goster();
    } catch (e) {
      if (e.kod === 'TEMRIN_VAR' && confirm(e.message + '\n\nÜzerine yazılsın mı?')) return yukle(true);
      mesaj.replaceChildren(el('p', { class: 'hata' }, e.message), e.hatalar ? el('ul', { class: 'hata' }, e.hatalar.map(h => el('li', {}, h))) : null);
    }
  };
  const satir = t => el('tr', {},
    el('td', {}, `T${t.temrin_no}`), el('td', {}, t.baslik, el('div', { class: 'soluk' }, t.islem_konusu)),
    el('td', { class: 'sayi' }, t.kontrol_sayisi), el('td', { class: 'sayi' }, t.soru_sayisi), el('td', { class: 'sayi' }, t.sure_dk ? t.sure_dk + ' dk' : '–'),
    el('td', { class: 'sayi' }, t.teslim_sayisi),
    el('td', {},
      el('div', { class: 'satir' },
        el('button', { onclick: () => onizle(t.temrin_id) }, 'Önizle'),
        t.hesaplanacak_ciktilar.length ? el('button', { class: 'ana', onclick: () => ciktilariHesapla(t) }, `Çıktıları hesapla (${t.hesaplanacak_ciktilar.length})`) : null,
        t.teslim_sayisi ? el('button', { onclick: () => dogrula(t) }, 'Teslimleri doğrula') : null,
        t.teslim_sayisi ? el('a', { href: `sayfa.php?${new URLSearchParams({ temrin_id: t.temrin_id, ...(durum.sinif ? { sinif: durum.sinif } : {}) })}`, target: '_blank', rel: 'noopener' }, 'Temrin sayfaları ↗') : null,
        el('button', { class: 'tehlike', onclick: () => sil(t) }, 'Sil'))));
  return el('div', {},
    el('div', { class: 'kart' }, el('h2', {}, 'Temrin yükle'),
      el('p', { class: 'soluk' }, 'Temrin CSV şablonunu doldurup yükleyin. Aynı temrin numarası varsa (teslim almamışsa) üzerine yazılabilir.'),
      el('div', { class: 'satir' }, dosya, el('button', { class: 'ana', onclick: () => yukle() }, 'Yükle')), mesaj),
    el('div', { class: 'kart kaydir' }, v.temrinler.length ? el('table', {},
      el('thead', {}, el('tr', {}, el('th', {}, 'No'), el('th', {}, 'Temrin'), el('th', { class: 'sayi' }, 'Kontrol'), el('th', { class: 'sayi' }, 'Soru'),
        el('th', { class: 'sayi' }, 'Süre'), el('th', { class: 'sayi' }, 'Teslim'), el('th', {}))),
      el('tbody', {}, v.temrinler.map(satir))) : el('p', { class: 'soluk' }, 'Bu derste henüz temrin yok.')),
    el('p', { class: 'soluk' }, '"Teslimleri doğrula", öğrencilerin kendi tarayıcısında yapılan otomatik değerlendirmeyi sizin tarayıcınızda yeniden çalıştırır ve sonucu onun yerine yazar. Elle girdiğiniz puanlar korunur.'));
}

async function onizle(temrinId) {
  const { tanim } = await api({ islem: 'temrin', temrin_id: temrinId });
  const b = tanim.bilgi;
  const dlg = el('dialog', {}, el('div', { class: 'kart' },
    el('h2', {}, `Temrin ${b.temrin_no} · ${b.baslik}`),
    el('p', {}, b.islem_konusu || ''),
    tanim.islemler.length ? el('ol', {}, tanim.islemler.map(i => el('li', {}, i))) : null,
    el('div', { class: 'kaydir' }, el('table', {},
      el('thead', {}, el('tr', {}, el('th', {}, 'Ölçüt / kalem'), el('th', { class: 'sayi' }, 'Puan'), el('th', {}, 'Tip'), el('th', {}, 'Hedef'), el('th', {}, 'Girdi'), el('th', {}, 'Beklenen'))),
      el('tbody', {}, tanim.olcutler.map(o => [
        el('tr', { class: 'olcut-satiri' }, el('td', {}, `${o.no} ${o.baslik}`), el('td', { class: 'sayi' }, o.puan), el('td', { colspan: 4 }, o.tip)),
        o.kalemler.map(k => el('tr', {}, el('td', {}, `  ${k.no} ${k.metin || ''}`), el('td', { class: 'sayi' }, k.puan), el('td', {}, `${k.tur}: ${k.tip}`),
          el('td', {}, k.hedef), el('td', {}, el('pre', { class: 'cevap' }, k.girdi)), el('td', {}, el('pre', { class: 'cevap' }, k.beklenen || (k.tip === 'cikti' ? '(hesaplanacak)' : '')))))])))),
    el('div', { class: 'satir' }, el('button', { onclick: () => dlg.close() }, 'Kapat'))));
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
}

const SIL_ONAYI = 'TEMRİN SİL';

/** Silme onayı: kutuya TEMRİN SİL yazılmadan "Onayla" düğmesi çalışmaz. */
async function sil(t) {
  const giris = el('input', { type: 'text', autocomplete: 'off', spellcheck: 'false', placeholder: SIL_ONAYI });
  const onayla = el('button', { class: 'tehlike', disabled: true }, 'Onayla');
  const mesaj = el('p', { class: 'hata' });
  const uyari = t.calisma_sayisi
    ? `Bu temrinde ${t.calisma_sayisi} öğrenci çalışması${t.teslim_sayisi ? ` ve ${t.teslim_sayisi} teslim` : ''} var. Projeler, cevaplar ve puanlar da kalıcı olarak silinir; geri alınamaz.`
    : 'Temrin kalıcı olarak silinir; geri alınamaz.';
  const dlg = el('dialog', {}, el('div', { class: 'kart' },
    el('h2', {}, `Temrin ${t.temrin_no} (${t.baslik}) silinsin mi?`),
    el('p', {}, uyari),
    el('p', {}, 'Onaylamak için kutuya ', el('b', {}, SIL_ONAYI), ' yazın:'),
    giris, mesaj,
    el('div', { class: 'satir' }, onayla, el('button', { onclick: () => dlg.close() }, 'Vazgeç'))));
  giris.addEventListener('input', () => { onayla.disabled = giris.value.trim() !== SIL_ONAYI; });
  onayla.addEventListener('click', async () => {
    try {
      await api(null, { islem: 'temrin_sil', temrin_id: t.temrin_id, onay: giris.value.trim() });
      dlg.close();
      goster();
    } catch (e) { mesaj.textContent = e.message; }
  });
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
  giris.focus();
}

/** İlerleme penceresi; iş bitince kapanır. */
function ilerleme(baslik) {
  const yazi = el('p', {}, 'Değerlendirme motoru yükleniyor…');
  const liste = el('ul', { class: 'soluk' });
  const dlg = el('dialog', {}, el('div', { class: 'kart' }, el('h2', {}, baslik), yazi, liste,
    el('div', { class: 'satir' }, el('button', { onclick: () => dlg.close() }, 'Kapat'))));
  dlg.addEventListener('close', () => { dlg.remove(); goster(); });
  document.body.append(dlg);
  dlg.showModal();
  return { yaz: m => { yazi.textContent = m; }, ekle: m => liste.append(el('li', {}, m)) };
}

async function ciktilariHesapla(t) {
  const p = ilerleme(`T${t.temrin_no} çıktı tahmini soruları`);
  try {
    const m = await motor();
    const ciktilar = {};
    for (const s of t.hesaplanacak_ciktilar) {
      const r = JSON.parse(m.CiktiHesapla(s.kod));
      if (!r.basarili) { p.ekle(`${s.no}: kod çalışmadı — ${r.hata}. CSV'deki kodu düzeltin.`); continue; }
      ciktilar[s.no] = r.cikti;
      p.ekle(`${s.no}: ${JSON.stringify(r.cikti)}`);
    }
    if (Object.keys(ciktilar).length) await api(null, { islem: 'cikti_kaydet', temrin_id: t.temrin_id, ciktilar });
    p.yaz('Tamamlandı. Hesaplanan çıktılar beklenen cevap olarak kaydedildi.');
  } catch (e) { p.yaz('Hata: ' + e.message); }
}

async function dogrula(t) {
  const p = ilerleme(`T${t.temrin_no} teslimlerini doğrula`);
  try {
    const { teslimler, kontroller } = await api({ islem: 'teslimler', temrin_id: t.temrin_id, sinif: durum.sinif });
    const m = await motor();
    let i = 0;
    for (const s of teslimler) {
      p.yaz(`Değerlendiriliyor: ${++i} / ${teslimler.length}`);
      await new Promise(r => setTimeout(r, 0));
      const { veri } = await api({ islem: 'teslim', temrin_id: t.temrin_id, okul_no: s.okul_no });
      const sonuc = JSON.parse(m.Degerlendir(projeJson(veri || {}), JSON.stringify(kontroller)));
      const r = await api(null, { islem: 'degerlendirme', temrin_id: t.temrin_id, okul_no: s.okul_no, sonuc });
      p.ekle(`${s.okul_no} ${s.ad}: ${r.sonuc.puan ?? '–'}${r.sonuc.kesin ? '' : ' (bekliyor)'}`);
    }
    p.yaz(`Tamamlandı: ${teslimler.length} teslim doğrulandı.`);
  } catch (e) { p.yaz('Hata: ' + e.message); }
}

async function erisimPaneli() {
  if (!durum.sinif) return el('div', { class: 'kart' }, el('p', { class: 'soluk' }, 'Erişim ayarı için yukarıdan bir sınıf seçin.'));
  const v = await api({ islem: 'erisim', sinif: durum.sinif });
  if (!v.temrinler.length) return el('div', { class: 'kart' }, el('p', { class: 'soluk' }, 'Bu derste henüz temrin yok.'));
  const yerel = s => {
    if (!s) return '';
    const d = new Date(s), p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  return el('div', { class: 'kart kaydir' }, el('table', {},
    el('thead', {}, el('tr', {}, el('th', {}, 'Temrin'), el('th', { class: 'sayi' }, 'Açık'), el('th', {}, 'Başlangıç'), el('th', {}, 'Bitiş'), el('th', {}, 'Durum'), el('th', {}))),
    el('tbody', {}, v.temrinler.map(t => {
      const acik = el('input', { type: 'checkbox', checked: t.erisim_acik });
      const bas = el('input', { type: 'datetime-local', value: yerel(t.baslangic) });
      const bit = el('input', { type: 'datetime-local', value: yerel(t.bitis) });
      const drm = el('td', {}, t.erisilebilir ? el('span', { class: 'rozet acik' }, 'Öğrenciler girebilir') : el('span', { class: 'rozet kapali' }, t.neden));
      const kaydet = async () => {
        try {
          const r = await api(null, { islem: 'erisim', temrin_id: t.temrin_id, sinif: durum.sinif, erisim_acik: acik.checked, baslangic: bas.value, bitis: bit.value });
          drm.replaceChildren(r.erisilebilir ? el('span', { class: 'rozet acik' }, 'Öğrenciler girebilir') : el('span', { class: 'rozet kapali' }, r.neden));
        } catch (e) { drm.replaceChildren(el('span', { class: 'hata' }, e.message)); }
      };
      return el('tr', {}, el('td', {}, `T${t.temrin_no} ${t.baslik}`), el('td', { class: 'sayi' }, acik), el('td', {}, bas), el('td', {}, bit), drm,
        el('td', {}, el('button', { class: 'ana', onclick: kaydet }, 'Kaydet')));
    }))),
    el('p', { class: 'soluk' }, `Zamanlar ${v.saat_dilimi} saatine göredir. Boş bırakılan zaman sınırsız demektir.`));
}

goster();
