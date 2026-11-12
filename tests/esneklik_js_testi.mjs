// Tarayıcıdaki karşılaştırma (studyo/esneklik.js) ortak vektörlerle aynı sonucu vermeli.
//   node tests/esneklik_js_testi.mjs
import { readFileSync } from 'node:fs';
import { uyum } from '../studyo/esneklik.js';

const { vektorler } = JSON.parse(readFileSync(new URL('./esneklik_vektorleri.json', import.meta.url), 'utf8'));
let hatali = 0;
for (const v of vektorler) {
  const s = uyum(v.beklenen, v.alinan, v.mod);
  if (s !== v.sonuc) { hatali++; console.log(`  ✗ ${JSON.stringify(v)} → ${s}`); }
}
console.log(`${vektorler.length - hatali} başarılı, ${hatali} hatalı`);
process.exit(hatali ? 1 : 0);
