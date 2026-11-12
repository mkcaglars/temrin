// Çıktı karşılaştırması (tarayıcı): motor/Degerlendirici/Esneklik.cs ve web/lib/puanla.php ile aynı kurallar.
// Ortak test vektörleri: tests/esneklik_vektorleri.json (node tests/esneklik_js_testi.mjs).
// Sayılar birebir karşılaştırılır; boşluk, büyük-küçük harf (Türkçe), noktalama, ondalık ayırıcı ve ek metin farkı "biçim" sayılır.

const SADE = { 'ç': 'c', 'ğ': 'g', 'ı': 'i', 'ö': 'o', 'ş': 's', 'ü': 'u', 'â': 'a', 'î': 'i', 'û': 'u' };

/** "GEÇTİ", "Gecti", "GECTI" → "gecti". */
export function sozcuk(s) {
  return String(s).replace(/I/g, 'ı').replace(/İ/g, 'i').toLocaleLowerCase('tr-TR').replace(/[çğıöşüâîû]/g, (c) => SADE[c]);
}

function kanonik(tam, kesir, eksi) {
  tam = tam.replace(/^0+/, '') || '0';
  kesir = kesir.replace(/0+$/, '');
  const s = tam + (kesir ? '.' + kesir : '');
  return eksi && s !== '0' ? '-' + s : s;
}

/** "72,5" → ["72.5"]; "1,2,3" ya da "1.000" → ayrı tam sayılar. Tek ayraç ondalıktır. */
function sayilar(p) {
  const eksi = p[0] === '-';
  if (eksi) p = p.slice(1);
  const g = p.split(/[.,]/);
  if (g.length === 2) return [kanonik(g[0], g[1], eksi)];
  return g.map((x, i) => kanonik(x, '', eksi && i === 0));
}

const PARCA = /(?<![\p{L}\p{N}])-?\d+(?:[.,]\d+)*|[\p{L}_][\p{L}\p{N}_]*/gu;

export function belirtecler(metin) {
  const liste = [];
  for (const m of String(metin ?? '').normalize('NFC').matchAll(PARCA)) {
    const p = m[0];
    if (p[0] === '-' || /\d/.test(p[0])) liste.push(...sayilar(p));
    else liste.push(sozcuk(p));
  }
  return liste;
}

const sayiMi = (b) => b !== '' && (/\d/.test(b[0]) || (b[0] === '-' && b.length > 1));

function altDizi(parca, butun, uyar) {
  let j = 0;
  for (const p of parca) {
    while (j < butun.length && !uyar(p, butun[j])) j++;
    if (j === butun.length) return false;
    j++;
  }
  return true;
}

const ayni = (x, y) => x.length === y.length && x.every((v, i) => v === y[i]);

function ekMetinle(b, a, icerir) {
  if (!b.length) return false;
  const bS = b.filter(sayiMi), aS = a.filter(sayiMi);
  if (!(icerir ? altDizi(bS, aS, (x, y) => x === y) : ayni(bS, aS))) return false;
  const bW = b.filter((x) => !sayiMi(x)), aW = a.filter((x) => !sayiMi(x));
  if (aW.includes('degil') && !bW.includes('degil')) return false;
  return altDizi(bW, aW, (x, y) => x === y || ([...x].length >= 3 && y.startsWith(x)));
}

/** mod: 'esnek' (=), 'kati' (==), 'icerir' (~=). Sonuç: 'tam', 'bicim', 'kaldi'. */
export function uyum(beklenen, alinan, mod = 'esnek') {
  beklenen = String(beklenen ?? '').trim();
  alinan = String(alinan ?? '').trim();
  if (beklenen === alinan) return 'tam';
  if (mod === 'kati') return 'kaldi';
  const b = belirtecler(beklenen), a = belirtecler(alinan);
  if (ayni(b, a) || ekMetinle(b, a, mod === 'icerir')) return mod === 'icerir' ? 'tam' : 'bicim';
  return 'kaldi';
}
