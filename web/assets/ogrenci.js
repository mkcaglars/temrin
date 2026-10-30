// Öğrenci ekranı: kendi temrinleri ve puanları.
'use strict';

const el = (etiket, ozellik = {}, ...cocuklar) => {
  const e = document.createElement(etiket);
  for (const [k, v] of Object.entries(ozellik)) {
    if (k === 'class') e.className = v; else e.setAttribute(k, v);
  }
  for (const c of cocuklar.flat()) if (c != null) e.append(c instanceof Node ? c : String(c));
  return e;
};
const yerelZaman = s => s ? new Date(s).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' }) : '';

async function yukle() {
  const kok = document.getElementById('uygulama');
  try {
    const y = await fetch('api/ogrenci.php', { credentials: 'same-origin' });
    const v = await y.json();
    if (!y.ok) throw new Error(v.mesaj || 'Yüklenemedi.');
    kok.replaceChildren(...ciz(v));
  } catch (e) {
    kok.replaceChildren(el('p', { class: 'hata' }, e.message));
  }
}

// Açık/kapalı tercihleri bu tarayıcıda hatırlanır (yalnızca kolaylık; okunamazsa varsayılan kullanılır).
const ACIKLIK_ANAHTARI = 'temrin-acik-kartlar';
function aciklikOku() {
  try { return JSON.parse(localStorage.getItem(ACIKLIK_ANAHTARI) || '{}') || {}; } catch { return {}; }
}
/** Yalnızca öğrenci açıp kapattığında çağrılır; varsayılan durum kaydedilmez. */
function aciklikKaydet(temrinId, acik) {
  const d = aciklikOku();
  d[temrinId] = acik;
  try { localStorage.setItem(ACIKLIK_ANAHTARI, JSON.stringify(d)); } catch { /* önemli değil */ }
}

/** Kapalıyken başlıkta görünen durum: Açık / Devam ediyor / puan. */
function ozet(t) {
  if (!t.calisma.teslim) {
    return el('span', { class: 'rozet acik' }, t.calisma.basladi ? 'Devam ediyor' : 'Açık');
  }
  if (!t.sonuc) return el('span', { class: 'rozet' }, 'Değerlendiriliyor');
  return el('span', { class: 'ozet-puan' }, el('b', {}, t.sonuc.puan ?? '–'), ' / 100',
    t.sonuc.kesin ? null : el('span', { class: 'rozet' }, 'bekliyor'));
}

function ciz(v) {
  if (!v.temrinler.length) return [el('div', { class: 'kart' }, el('p', { class: 'soluk' }, 'Şu an açık ya da puanlanmış bir temrininiz yok.'))];
  const aciklik = aciklikOku();
  const kartlar = v.temrinler.map(t => {
    // Varsayılan: üzerinde çalışılan (teslim edilmemiş) temrin açık, teslim edilenler kapalı.
    const acik = aciklik[t.temrin_id] ?? !t.calisma.teslim;
    const kart = el('details', { class: 'kart temrin' });
    kart.open = acik;
    kart.dataset.temrin = t.temrin_id;
    const baslik = el('summary', {}, el('span', { class: 'ok' }), el('h2', {}, `Temrin ${t.temrin_no} · ${t.baslik}`), ozet(t));
    // "open" koddan değişince de toggle olayı gelir; tercih yalnızca tıklamada kaydedilir (açılıp kapanma tıklamadan sonra olur).
    baslik.addEventListener('click', () => setTimeout(() => aciklikKaydet(t.temrin_id, kart.open)));
    kart.append(baslik);
    const govde = el('div', { class: 'temrin-govde' });
    kart.append(govde);
    const ekle = (...c) => govde.append(...c);
    const adres = `studyo/?temrin=${t.temrin_id}`;
    if (!t.calisma.teslim) {
      ekle(el('p', { class: 'soluk' }, t.calisma.basladi ? 'Çalışmanız kaydedildi, henüz teslim edilmedi.' : 'Henüz başlamadınız.'),
        el('a', { class: 'dugme', href: adres }, t.calisma.basladi ? 'Devam et' : 'Temrine başla'));
      return kart;
    }
    if (!t.sonuc) {
      ekle(el('p', { class: 'soluk' }, 'Teslim edildi, değerlendiriliyor.'), el('a', { href: adres }, 'Projeyi aç'));
      return kart;
    }
    const s = t.sonuc;
    const puan = el('div', { class: 'satir' }, el('span', { class: 'buyuk' }, s.puan ?? '–'), el('span', { class: 'soluk' }, '/ 100'));
    if (!s.kesin) puan.append(el('span', { class: 'rozet' }, 'Öğretmen puanlaması bekleniyor'));
    ekle(puan, el('p', { class: 'soluk' }, `Teslim: ${yerelZaman(s.teslim_zamani)} · `, el('a', { href: adres }, 'Projeyi aç'),
      ' · ', el('a', { href: `sayfa.php?temrin_id=${t.temrin_id}`, target: '_blank', rel: 'noopener' }, 'Temrin sayfası')));
    if (s.olcutler.length) {
      ekle(el('div', { class: 'kaydir' }, el('table', {},
        el('thead', {}, el('tr', {}, el('th', {}, 'Değerlendirme'), el('th', { class: 'sayi' }, 'Puanı'), el('th', { class: 'sayi' }, 'Alınan'), el('th', {}, 'Tespitler'))),
        el('tbody', {}, s.olcutler.map(o => el('tr', {},
          el('td', {}, o.baslik),
          el('td', { class: 'sayi' }, o.puan),
          el('td', { class: 'sayi' }, o.alinan ?? el('span', { class: 'rozet' }, 'bekliyor')),
          el('td', {}, o.tespit || '')))))));
    }
    return kart;
  });
  if (kartlar.length < 2) return kartlar;
  const dugme = (metin, acik) => {
    const b = el('button', { type: 'button' }, metin);
    b.addEventListener('click', () => kartlar.forEach(k => { k.open = acik; aciklikKaydet(k.dataset.temrin, acik); }));
    return b;
  };
  return [el('div', { class: 'satir arac-cubugu' }, dugme('Tümünü aç', true), dugme('Tümünü kapat', false)), ...kartlar];
}

yukle();
