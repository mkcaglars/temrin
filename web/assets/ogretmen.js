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
  for (const c of cocuklar.flat()) if (c != null) e.append(c instanceof Node ? c : String(c));
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
  if (!y.ok) throw new Error(v.mesaj || 'İşlem yapılamadı.');
  return v;
}

function hata(e) { kok.append(el('p', { class: 'hata' }, e.message)); }

async function goster() {
  try {
    const v = await api({ islem: 'tablo', sinif: durum.sinif });
    durum.siniflar = v.siniflar;
    kok.replaceChildren(ustBar(), durum.sekme === 'puanlar' ? puanTablosu(v) : await erisimPaneli());
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
    el('div', { class: 'sekmeler' }, sekme('puanlar', 'Puanlar'), sekme('erisim', 'Temrin erişimi')),
    el('div', { class: 'satir kart' }, el('label', {}, 'Sınıf: ', sec), durum.sekme === 'puanlar' ? csv : null));
}

function puanTablosu(v) {
  if (!v.ogrenciler.length) return el('div', { class: 'kart' }, el('p', { class: 'soluk' }, 'Bu sınıflarda henüz giriş yapan ya da teslim eden öğrenci yok.'));
  const hucre = (o, t) => {
    const p = o.puanlar[t.temrin_id];
    if (!p) return el('td', { class: 'sayi soluk' }, '–');
    return el('td', { class: 'sayi' },
      el('button', { class: 'hucre', title: 'Ölçütleri göster / düzelt', onclick: () => duzelt(t.temrin_id, o.okul_no) }, p.puan ?? '–'),
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
        el('td', {}, r.o.baslik, r.o.duzenleyen === 'ogretmen' ? el('div', { class: 'soluk' }, 'öğretmen düzenledi') : null),
        el('td', { class: 'sayi' }, r.o.puan), el('td', { class: 'sayi' }, r.alinan), el('td', {}, r.tespit)))))),
    mesaj,
    el('div', { class: 'satir' },
      el('button', { class: 'ana', onclick: kaydet }, 'Kaydet'),
      el('button', { onclick: () => dlg.close() }, 'Vazgeç'))));
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
