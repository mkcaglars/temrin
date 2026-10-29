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

function ciz(v) {
  if (!v.temrinler.length) return [el('div', { class: 'kart' }, el('p', { class: 'soluk' }, 'Şu an açık ya da puanlanmış bir temrininiz yok.'))];
  return v.temrinler.map(t => {
    const kart = el('section', { class: 'kart' });
    const ust = el('div', { class: 'satir' }, el('h2', {}, `Temrin ${t.temrin_no} · ${t.baslik}`));
    if (t.erisilebilir && !t.calisma.teslim) ust.append(el('span', { class: 'rozet acik' }, 'Açık'));
    kart.append(ust);
    const adres = `studyo/?temrin=${t.temrin_id}`;
    if (!t.calisma.teslim) {
      kart.append(el('p', { class: 'soluk' }, t.calisma.basladi ? 'Çalışmanız kaydedildi, henüz teslim edilmedi.' : 'Henüz başlamadınız.'),
        el('a', { class: 'dugme', href: adres }, t.calisma.basladi ? 'Devam et' : 'Temrine başla'));
      return kart;
    }
    if (!t.sonuc) {
      kart.append(el('p', { class: 'soluk' }, 'Teslim edildi, değerlendiriliyor.'), el('a', { href: adres }, 'Projeyi aç'));
      return kart;
    }
    const s = t.sonuc;
    const puan = el('div', { class: 'satir' }, el('span', { class: 'buyuk' }, s.puan ?? '–'), el('span', { class: 'soluk' }, '/ 100'));
    if (!s.kesin) puan.append(el('span', { class: 'rozet' }, 'Öğretmen puanlaması bekleniyor'));
    kart.append(puan, el('p', { class: 'soluk' }, `Teslim: ${yerelZaman(s.teslim_zamani)} · `, el('a', { href: adres }, 'Projeyi aç'),
      ' · ', el('a', { href: `sayfa.php?temrin_id=${t.temrin_id}`, target: '_blank', rel: 'noopener' }, 'Temrin sayfası')));
    if (s.olcutler.length) {
      kart.append(el('div', { class: 'kaydir' }, el('table', {},
        el('thead', {}, el('tr', {}, el('th', {}, 'Değerlendirme'), el('th', { class: 'sayi' }, 'Puanı'), el('th', { class: 'sayi' }, 'Alınan'), el('th', {}, 'Tespitler'))),
        el('tbody', {}, s.olcutler.map(o => el('tr', {},
          el('td', {}, o.baslik),
          el('td', { class: 'sayi' }, o.puan),
          el('td', { class: 'sayi' }, o.alinan ?? el('span', { class: 'rozet' }, 'bekliyor')),
          el('td', {}, o.tespit || '')))))));
    }
    return kart;
  });
}

yukle();
