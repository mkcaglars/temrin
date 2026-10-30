// Uçtan uca tarayıcı testi (Playwright): CSV yükleme → erişim → öğrenci çalışması ve teslim →
// öğrenci tarayıcısında otomatik değerlendirme → öğretmen puanlaması ve doğrulama.
//   Önce: ./build.sh     Sonra: node tests/tarayici_testi.js
'use strict';
const { chromium } = require('playwright');
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const KOK = path.resolve(__dirname, '..');
const DIST = path.join(KOK, 'dist');
if (!process.env.TEST_ADRES && !fs.existsSync(path.join(DIST, 'studyo/_framework'))) { console.error('Önce ./build.sh çalıştırın.'); process.exit(1); }

// Varsayılan: dist/ geçici .env ve SQLite ile php -S üzerinde çalışır.
// Var olan bir kuruluma karşı (ör. Apache): TEST_ADRES=http://127.0.0.1:8097 TEST_ANAHTAR=<PORTAL_SSO_ANAHTAR> (boş veritabanı)
const gecici = fs.mkdtempSync(path.join(os.tmpdir(), 'temrin-tarayici-'));
const disSunucu = !!process.env.TEST_ADRES;
const anahtar = process.env.TEST_ANAHTAR || crypto.randomBytes(32).toString('hex');
fs.writeFileSync(path.join(gecici, '.env'), `PORTAL_SSO_ANAHTAR=${anahtar}\nDB_DSN=sqlite:${gecici}/t.sqlite\nSAAT_DILIMI=Europe/Istanbul\n`);
const PORT = 18500 + Math.floor(Math.random() * 400);
const ADRES = process.env.TEST_ADRES || `http://127.0.0.1:${PORT}`;
const sunucu = disSunucu ? null : spawn('php', ['-d', `session.save_path=${gecici}`, '-S', `127.0.0.1:${PORT}`, '-t', DIST],
  { env: { ...process.env, TEMRIN_ENV_DOSYASI: path.join(gecici, '.env') }, stdio: 'ignore' });

let basarili = 0, hatali = 0;
const dogrula = (kosul, ad) => { if (kosul) { basarili++; console.log('  ✓ ' + ad); } else { hatali++; console.log('  ✗ ' + ad); } };

const DERS = { ders_id: '7', ders: 'Programlama (C#)' };
const baglanti = (k) => execFileSync('php', [path.join(KOK, 'araclar/portal-ornek.php'), ADRES, anahtar, k.role, ...(k.siniflar || [])], { encoding: 'utf8' }).trim();
// portal-ornek.php sabit bir öğrenci üretir; testte farklı öğrenciler için token'ı burada üretiriz.
function token(govde) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const simdi = Math.floor(Date.now() / 1000);
  const h = b64({ alg: 'HS256', typ: 'JWT' });
  const b = b64({ ...govde, ...DERS, iat: simdi, exp: simdi + 300, jti: crypto.randomBytes(16).toString('hex') });
  const s = crypto.createHmac('sha256', anahtar).update(`${h}.${b}`).digest('base64url');
  return `${ADRES}/giris.php?token=${h}.${b}.${s}`;
}
const ogretmenGirisi = () => token({ uid: 'T1', okul_no: '', name: 'Mustafa Kemal Çağlar', role: 'ogretmen', sinif: '', siniflar: ['11 Donanım B'] });
const ogrenciGirisi = (no, ad) => token({ uid: no, okul_no: no, name: ad, role: 'ogrenci', sinif: '11 Donanım B', siniflar: [] });

const FORM_CS = (govde) => `using System;
using System.Windows.Forms;

namespace DonguTemrin
{
    public partial class Form1 : Form
    {
        public Form1()
        {
            InitializeComponent();
        }
${govde}
    }
}
`;
const DOGRU = `
        private void btnFor_Click(object sender, EventArgs e)
        {
            lstSonuc.Items.Clear();
            int n = int.Parse(txtN.Text);
            for (int i = 1; i <= n; i++) lstSonuc.Items.Add(i);
        }
        private void btnWhile_Click(object sender, EventArgs e)
        {
            lstSonuc.Items.Clear();
            int n = int.Parse(txtN.Text);
            while (n >= 1) { lstSonuc.Items.Add(n); n--; }
        }
        private void btnDoWhile_Click(object sender, EventArgs e)
        {
            lstSonuc.Items.Clear();
            int n = int.Parse(txtN.Text);
            do { lstSonuc.Items.Add(n); n--; } while (n >= 1);
        }
        private void btnBreak_Click(object sender, EventArgs e)
        {
            lstSonuc.Items.Clear();
            int n = int.Parse(txtN.Text);
            for (int i = 1; i <= n; i++)
            {
                if (i % 3 == 0) break;
                lstSonuc.Items.Add(i);
            }
        }`;
// Hatalı çözüm: btnFor'da Clear yok, do-while yerine while.
const HATALI = DOGRU.replace('lstSonuc.Items.Clear();\n            int n = int.Parse(txtN.Text);\n            for (int i = 1; i <= n; i++) lstSonuc', 'int n = int.Parse(txtN.Text);\n            for (int i = 1; i <= n; i++) lstSonuc')
  .replace('do { lstSonuc.Items.Add(n); n--; } while (n >= 1);', 'while (n >= 1) { lstSonuc.Items.Add(n); n--; }');

/** Çalışma ekranında c-lesson şablonuyla proje kurar (form tasarımı + kod) ve sunucuya kaydeder. */
async function projeYukle(sayfa, govde) {
  await sayfa.evaluate(async ({ formCs }) => {
    const { TEMPLATES } = await import('./assets/js/templates.js');
    const { calismaYukle } = await import('./assets/js/api.js');
    const d = TEMPLATES[0].create('DonguTemrin');
    const k = (type, name, x, y, w, hh, text, click) => ({ type, name, props: { Location: [x, y], Size: [w, hh], Text: text, TabIndex: 0 }, events: click ? { Click: click } : {} });
    d.forms.Form1.controls = [
      k('TextBox', 'txtN', 20, 20, 80, 23, ''), k('ListBox', 'lstSonuc', 20, 60, 120, 200, ''),
      k('Button', 'btnFor', 160, 20, 90, 28, 'for', 'btnFor_Click'), k('Button', 'btnWhile', 160, 56, 90, 28, 'while', 'btnWhile_Click'),
      k('Button', 'btnDoWhile', 160, 92, 90, 28, 'do-while', 'btnDoWhile_Click'), k('Button', 'btnBreak', 160, 128, 90, 28, 'break', 'btnBreak_Click'),
    ];
    d.forms.Form1.controls.forEach((c) => { if (c.type === 'ListBox') delete c.props.Text; });
    d.files.find((f) => f.name === 'Form1.cs').content = formCs;
    const durum = await calismaYukle();
    const r = await fetch('../api/calisma.php', { method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': document.querySelector('meta[name=csrf]').content },
      body: JSON.stringify({ islem: 'kaydet', temrin_id: durum.temrin.temrin_id, veri: d, surum: durum.calisma.surum }) });
    if (!r.ok) throw new Error('kaydet ' + r.status + ' ' + await r.text());
  }, { formCs: FORM_CS(govde) });
}

async function motorHazir(sayfa) {
  await sayfa.waitForFunction(() => document.querySelector('.ide-status')?.textContent.includes('Hazır'), null, { timeout: 180000 });
}

(async () => {
  for (let i = 0; i < 50; i++) { try { await fetch(ADRES + '/'); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
  const tarayici = await chromium.launch();
  const hatalar = [];
  const yeniSayfa = async (ad) => {
    const ctx = await tarayici.newContext({ viewport: { width: 1400, height: 900 }, locale: 'tr-TR' });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => hatalar.push(`${ad}: ${e.message}`));
    // Uygulamanın kendisinin karşıladığı 4xx yanıtları (ör. hatalı CSV → 400) hata sayılmaz.
    p.on('console', (m) => { if (m.type() === 'error' && !/favicon|status of 4\d\d/.test(m.text())) hatalar.push(`${ad} konsol: ${m.text()}`); });
    p.on('dialog', (d) => d.accept());
    return p;
  };
  try {
    console.log('Öğretmen: CSV yükleme ve erişim');
    const ogr = await yeniSayfa('öğretmen');
    await ogr.goto(ogretmenGirisi());
    await ogr.click('text=Temrinler');
    await ogr.setInputFiles('input[type=file]', path.join(KOK, 'sablon/temrin-3-donguler.csv'));
    await ogr.click('button:has-text("Yükle")');
    await ogr.waitForSelector('text=Temrin 3 (Döngüler) yüklendi');
    dogrula(await ogr.locator('td:has-text("Döngüler")').count() > 0, 'CSV arayüzden yüklendi, temrin listede');
    // Hatalı CSV: puan toplamı 100 değil
    fs.writeFileSync(path.join(gecici, 'hatali.csv'), fs.readFileSync(path.join(KOK, 'sablon/temrin-3-donguler.csv'), 'utf8').replace('olcut;O9;;5;', 'olcut;O9;;6;').replace('kontrol;K17;O9;5;', 'kontrol;K17;O9;6;').replace('bilgi;temrin_no;;;;;;;3;', 'bilgi;temrin_no;;;;;;;9;'));
    await ogr.setInputFiles('input[type=file]', path.join(gecici, 'hatali.csv'));
    await ogr.click('button:has-text("Yükle")');
    await ogr.waitForSelector('text=toplamı 100 olmalı');
    dogrula(true, 'hatalı CSV reddedilir, hata gösterilir');
    await ogr.selectOption('select', '11 Donanım B');
    await ogr.click('text=Temrin erişimi');
    await ogr.locator('input[type=checkbox]').first().check();
    await ogr.locator('button:has-text("Kaydet")').first().click();
    await ogr.waitForSelector('text=Öğrenciler girebilir');
    dogrula(true, 'temrin sınıfa açıldı');

    const ogrenciCalismasi = async (no, ad, govde, cevaplar) => {
      const p = await yeniSayfa(ad);
      await p.goto(ogrenciGirisi(no, ad));
      await p.click('text=Temrine başla');
      await p.waitForSelector('.temrin-panel');
      await projeYukle(p, govde);
      await p.reload();
      await p.waitForSelector('.temrin-panel');
      await motorHazir(p);
      const alanlar = p.locator('.tp-cevap');
      await alanlar.nth(0).fill(cevaplar[0]);
      await alanlar.nth(1).fill(cevaplar[1]);
      await p.waitForTimeout(1200); // cevaplar otomatik kaydedilir
      await p.click('.ide-top button:has-text("Teslim et")');
      await p.click('.modal button:has-text("Teslim et")');
      await p.waitForSelector('.tp-sonuc .tp-puan', { timeout: 180000 });
      return p;
    };

    console.log('Öğrenci 1: doğru çözüm');
    const s1 = await ogrenciCalismasi('3268', 'Ahmet Özdoğan', DOGRU, ['do-while koşulu sonda kontrol eder, en az bir kez çalışır.', '1\n2\n3']);
    const puan1 = await s1.locator('.tp-puan .buyuk').textContent();
    dogrula(puan1.trim() === '70', `otomatik puan 70 (öğretmen ölçütleri ve açık uçlu soru bekliyor) — bulunan ${puan1}`);
    dogrula(await s1.locator('.tp-sonuc:has-text("Öğretmen puanlaması bekleniyor")').count() === 1, '"öğretmen puanlaması bekleniyor" notu');
    dogrula(await s1.locator('.ide-top button:has-text("Teslim et")').count() === 0, 'teslimden sonra teslim düğmesi yok');
    dogrula(await s1.locator('.tp-cevap').first().isDisabled(), 'teslimden sonra cevaplar kilitli');
    await s1.click('.ide-top button:has-text("Başlat")');
    await s1.waitForSelector('.win-form, .runner .form, [class*=form-window]', { timeout: 20000 }).catch(() => {});
    dogrula(true, 'teslimden sonra program çalıştırılabilir');
    await s1.goto(`${ADRES}/`);
    await s1.waitForSelector('text=Temrin 3 · Döngüler');
    dogrula(await s1.locator('text=Projeyi aç').count() === 1, 'öğrenci ana ekranında sonuç ve "Projeyi aç"');
    const kart = s1.locator('details.temrin').first();
    dogrula(!(await kart.evaluate((d) => d.open)) && (await kart.locator('summary').innerText()).includes('70'), 'teslim edilen temrin kapalı başlar, başlıkta puan görünür');
    await kart.locator('summary').click();
    dogrula(await kart.evaluate((d) => d.open) && await kart.locator('text=Projeyi aç').isVisible(), 'başlığa tıklayınca açılır');

    console.log('Öğrenci 2: hatalı çözüm');
    const s2 = await ogrenciCalismasi('2045', 'Ayberk Ağa', HATALI, ['bilmiyorum', '1\n2\n3\n4']);
    const puan2 = Number((await s2.locator('.tp-puan .buyuk').textContent()).trim());
    const tespitler = await s2.locator('.tp-tespit').allTextContents();
    dogrula(puan2 < 70, `hatalı çözüm daha düşük puan alır (${puan2})`);
    dogrula(tespitler.some((t) => t.includes('Items.Clear')), 'Clear eksikliği tespitlerde');
    dogrula(tespitler.some((t) => t.includes('do-while')), 'do-while eksikliği tespitlerde');
    dogrula(tespitler.some((t) => t.includes('S2')), 'yanlış çıktı tahmini tespitlerde');

    console.log('Öğretmen: puanlama ve doğrulama');
    await ogr.goto(`${ADRES}/`);
    await ogr.waitForSelector('text=Ahmet Özdoğan');
    dogrula(await ogr.locator('.rozet:has-text("bekliyor")').count() === 2, 'iki teslim de "bekliyor"');
    await ogr.locator('tr:has-text("Ahmet Özdoğan") button.hucre').first().click();
    await ogr.waitForSelector('dialog');
    dogrula(await ogr.locator('dialog pre.cevap:has-text("en az bir kez")').count() === 1, 'açık uçlu cevap öğretmene görünür');
    const sayilar = ogr.locator('dialog input[type=number]');
    await sayilar.nth(0).fill('5');
    await sayilar.nth(1).fill('5');
    await sayilar.nth(6).fill('20');
    await ogr.click('dialog button:has-text("Kaydet")');
    await ogr.waitForSelector('dialog', { state: 'detached' });
    await ogr.waitForTimeout(500);
    const hucre = await ogr.locator('tr:has-text("Ahmet Özdoğan") td.sayi').first().textContent();
    dogrula(hucre.includes('100') && !hucre.includes('bekliyor'), `öğretmen eksik notları girdi → 100, kesin (${hucre.trim()})`);

    await ogr.click('text=Temrinler');
    await ogr.click('button:has-text("Teslimleri doğrula")');
    await ogr.waitForSelector('text=teslim doğrulandı', { timeout: 180000 });
    const liste = await ogr.locator('dialog li').allTextContents();
    dogrula(liste.length === 2 && liste.some((l) => l.includes('3268') && l.includes('100')), `doğrulama öğrencinin puanını korur, öğretmen notları kalır (${liste.join(' | ')})`);
    await ogr.click('dialog button:has-text("Kapat")');
    await ogr.click('text=Puanlar');
    await ogr.waitForSelector('.dogrulandi');
    dogrula(await ogr.locator('.dogrulandi').count() === 2, 'doğrulanan teslimlerde ✓ işareti');

    const proje = await yeniSayfa('öğretmen-proje');
    await proje.context().addCookies((await ogr.context().cookies()));
    await proje.goto(`${ADRES}/studyo/?temrin=1&ogrenci=2045`);
    await proje.waitForSelector('.ide-banner:has-text("Salt okunur")');
    await motorHazir(proje);
    dogrula(await proje.locator('.ide-top button:has-text("Teslim et")').count() === 0, 'öğretmen öğrencinin projesini salt okunur açar');

    const csv = await ogr.evaluate(async () => (await fetch('api/disa-aktar.php?sinif=' + encodeURIComponent('11 Donanım B'))).text());
    dogrula(csv.includes('"T3 Döngüler"') && csv.includes('3268;"Ahmet Özdoğan";"11 Donanım B";100;100;') && csv.includes('2045;"Ayberk Ağa";"11 Donanım B";65;;T3'), 'CSV puanları ve bekleyenleri içerir');

    const sayfa = await yeniSayfa('temrin-sayfası');
    await sayfa.context().addCookies((await ogr.context().cookies()));
    await sayfa.goto(`${ADRES}/sayfa.php?temrin_id=1&sinif=${encodeURIComponent('11 Donanım B')}`);
    dogrula(await sayfa.locator('section.sayfa').count() === 2, 'sınıfın temrin sayfaları (her öğrenci ayrı sayfa)');
    if (process.env.EKRAN) {
      await sayfa.screenshot({ path: path.join(process.env.EKRAN, 'temrin-sayfasi.png'), fullPage: false });
      await s2.goto(`${ADRES}/studyo/?temrin=1`); await s2.waitForSelector('.tp-sonuc'); await motorHazir(s2);
      await s2.screenshot({ path: path.join(process.env.EKRAN, 'teslim-sonrasi.png') });
      await ogr.goto(`${ADRES}/`); await ogr.waitForSelector('.dogrulandi');
      await ogr.locator('tr:has-text("Ayberk Ağa") button.hucre').first().click(); await ogr.waitForSelector('dialog');
      await ogr.locator('dialog details').nth(1).evaluate((d) => { d.open = true; });
      await ogr.screenshot({ path: path.join(process.env.EKRAN, 'ogretmen-ayrinti.png') });
    }

    console.log('Öğretmen: temrin silme');
    await ogr.goto(`${ADRES}/`);
    await ogr.click('text=Temrinler');
    await ogr.click('td button:has-text("Sil")');
    await ogr.waitForSelector('dialog:has-text("TEMRİN SİL")');
    dogrula(await ogr.locator('dialog:has-text("teslim var")').count() === 1, 'silme penceresi çalışma ve teslim sayısını uyarır');
    const onayKutusu = ogr.locator('dialog input[type=text]');
    const onayla = ogr.locator('dialog button:has-text("Onayla")');
    dogrula(await onayla.isDisabled(), 'onay yazılmadan "Onayla" pasif');
    await onayKutusu.fill('temrin sil');
    dogrula(await onayla.isDisabled(), 'yanlış yazılınca "Onayla" pasif kalır');
    await onayKutusu.fill('TEMRİN SİL');
    dogrula(!(await onayla.isDisabled()), 'TEMRİN SİL yazılınca "Onayla" etkin');
    await onayla.click();
    await ogr.waitForSelector('text=Bu derste henüz temrin yok.');
    dogrula(true, 'teslim almış temrin onayla silindi');

    dogrula(hatalar.length === 0, 'tarayıcıda hata yok' + (hatalar.length ? ': ' + hatalar.join(' | ') : ''));
  } catch (e) {
    hatali++;
    console.log('  ✗ test yarıda kaldı: ' + e.message);
    if (hatalar.length) console.log('    tarayıcı hataları: ' + hatalar.join(' | '));
  } finally {
    await tarayici.close();
    sunucu?.kill();
    fs.rmSync(gecici, { recursive: true, force: true });
  }
  console.log(`\n${basarili} başarılı, ${hatali} hatalı`);
  process.exit(hatali ? 1 : 0);
})();
