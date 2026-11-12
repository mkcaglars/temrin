// Laboratuvar kontrolleri (studyo/lab-denetim.js): örnek temrin (sablon/temrin-lab-sql-komutlari.csv) doğru ve hatalı
// çözümlere uygulanır. MySQL simülatörü (c-lesson) Node'da çalışır.  Önce: ./build.sh   Sonra: node tests/lab_denetim_testi.mjs
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(KOK, 'dist/studyo');
if (!existsSync(path.join(DIST, 'temrin/lab-denetim.js'))) { console.error('Önce ./build.sh çalıştırın.'); process.exit(1); }

const { default: initSqlJs } = await import(path.join(KOK, 'node_modules/sql.js/dist/sql-wasm.js'));
const { MySqlServer, Session } = await import(path.join(DIST, 'assets/lab/mysql/engine.js'));
const { defaultState } = await import(path.join(DIST, 'assets/lab/store.js'));
const { labDenetle, labHazirla } = await import(path.join(DIST, 'temrin/lab-denetim.js'));

const SQL = await initSqlJs();
const php = (kod) => JSON.parse(execFileSync('php', ['-r', `require "${KOK}/web/lib/tanim.php"; ${kod}`], { encoding: 'utf8' }));
const tanim = php(`[$t] = tanim_csv_oku(file_get_contents("${KOK}/sablon/temrin-lab-sql-komutlari.csv")); echo json_encode(["k" => tanim_kontroller($t), "o" => tanim_ogrenciye($t)], JSON_UNESCAPED_UNICODE);`);
const kontroller = tanim.k;

let basarili = 0, hatali = 0;
const dogrula = (kosul, ad) => { if (kosul) { basarili++; console.log('  ✓ ' + ad); } else { hatali++; console.log('  ✗ ' + ad); } };

/** Yeni bir laboratuvar: hazır kurulum ve temrinin hazırlığı (labHazirla), sonra öğrencinin SQL'i. */
async function laboratuvar(sql) {
  const server = new MySqlServer(SQL, {});
  const store = { state: defaultState(), server, touch() {}, flush: async () => {} };
  await labHazirla(store, tanim.o);
  const s = server.connect('root', '1234');
  for (const r of s.execute(sql, { stopOnError: false })) if (!r.ok) console.log('    (SQL hatası)', r.error?.code, r.error?.message);
  return { server, store };
}
const puanla = (lab) => Object.fromEntries(labDenetle(lab, kontroller).map((r) => [r.no, r]));
const ozet = (s) => Object.entries(s).map(([no, r]) => `${no}:${r.oran}`).join(' ');

const TABLO = `CREATE DATABASE sirket; USE sirket;
CREATE TABLE personel (id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, ad VARCHAR(50) NOT NULL, bolum VARCHAR(30), maas DECIMAL(10,2));`;
const EKLE = `INSERT INTO personel (ad, bolum, maas) VALUES ('Ali Yılmaz', 'Bilgi İşlem', 7000), ('Ayşe Demir', 'Muhasebe', 5000),
  ('Mehmet Kaya', 'Satış', 4500), ('Zeynep Çelik', 'Muhasebe', 6000), ('Can Öztürk', 'Satış', 4000);`;
const GUNCELLE = `UPDATE personel SET maas = maas * 1.1 WHERE bolum = 'Muhasebe';`;
const SIL = `DELETE FROM personel WHERE ad = 'Can Öztürk';`;

console.log('Laboratuvar kontrolleri');
{
  const lab = await laboratuvar('');
  dogrula(lab.store.state.install.mysql && lab.store.state.install.workbench && lab.server.running, 'hazır kurulum: MySQL ve Workbench kurulu, hizmet çalışıyor');
  let girdi = false;
  try { lab.server.connect('root', '1234'); girdi = true; } catch { /* yanlış şifre */ }
  dogrula(girdi, 'root şifresi temrindeki lab_sifre (1234)');
  const s = puanla(lab);
  dogrula(Object.values(s).every((r) => r.oran === 0), `boş laboratuvar puan almaz (${ozet(s)})`);
  dogrula(s.K1.mesaj.includes('"sirket" veritabanı yok'), 'tespit: veritabanı yok');
}
{
  const s = puanla(await laboratuvar(TABLO + EKLE + GUNCELLE + SIL));
  dogrula(Object.values(s).every((r) => r.oran === 1 && r.gecti), `doğru çözüm tam puan (${ozet(s)})`);
  dogrula(Object.values(s).every((r) => !r.bicim), 'doğru çözümde biçim notu yok (5500.00 = 5500)');
}
{
  // Biçim farkları: büyük harf SQL, farklı yazım, "ayşe demir" küçük harf, sütun sırası farklı.
  const sql = `create database SIRKET; use sirket;
    CREATE TABLE Personel (ad varchar(50) not null, id int auto_increment, bolum varchar(30), maas decimal(10,2), primary key (id));
    insert into personel (ad, bolum, maas) values ('Ali Yılmaz','Bilgi İşlem',7000),('Ayşe Demir','Muhasebe',5000),('Mehmet Kaya','Satış',4500),('Zeynep Çelik','Muhasebe',6000),('Can Öztürk','Satış',4000);
    update personel set maas = maas + maas * 10 / 100 where bolum = 'Muhasebe';
    delete from personel where id = 5;`;
  const s = puanla(await laboratuvar(sql));
  dogrula(Object.values(s).every((r) => r.oran === 1), `farklı yazılmış doğru çözüm tam puan (${ozet(s)})`);
}
{
  const s = puanla(await laboratuvar(TABLO + EKLE + SIL));
  dogrula(s.K7.oran === 0 && s.K6.oran === 1 && s.K9.oran === 1, `UPDATE unutulmuş: yalnızca K7 kalır (${ozet(s)})`);
  dogrula(s.K7.mesaj.includes('bulunan [Ali Yılmaz 7000.00, Ayşe Demir 5000.00, Mehmet Kaya 4500.00, Zeynep Çelik 6000.00]'), 'tespit: beklenen ve bulunan sonuç');
}
{
  const s = puanla(await laboratuvar(TABLO + EKLE + `UPDATE personel SET maas = maas * 1.1;` + SIL));
  dogrula(s.K7.oran === 0, 'WHERE unutulup tüm maaşlar artırılırsa K7 kalır');
}
{
  const s = puanla(await laboratuvar(TABLO + EKLE + `UPDATE personel SET maas = maas * 1.2 WHERE bolum = 'Muhasebe';` + SIL));
  dogrula(s.K7.oran === 0, 'yanlış oranla güncelleme puan almaz');
}
{
  const s = puanla(await laboratuvar(TABLO + EKLE + GUNCELLE));
  dogrula(s.K8.oran === 0 && s.K9.oran === 0, `DELETE unutulmuş: K8 ve K9 kalır (${ozet(s)})`);
  dogrula(s.K9.mesaj.includes('4 kayıt olmalı, 5 kayıt var'), 'tespit: kayıt sayısı');
}
{
  const sql = `CREATE DATABASE sirket; USE sirket;
    CREATE TABLE personel (id INT PRIMARY KEY, ad VARCHAR(40), bolum VARCHAR(30));`;
  const s = puanla(await laboratuvar(sql));
  dogrula(s.K3.oran === 0.5 && s.K3.mesaj.includes('otomatik artan (AI)'), `AI eksik: K3 yarım puan (${s.K3.mesaj})`);
  dogrula(s.K4.oran === 0.5 && s.K4.mesaj.includes('türü varchar(50) olmalı (bulunan varchar(40))') && s.K4.mesaj.includes('boş geçilemez'), `ad türü ve NN: K4 yarım (${s.K4.mesaj})`);
  dogrula(s.K5.oran === 0.5 && s.K5.mesaj.includes('"maas" sütunu yok'), `maas yok: K5 yarım (${s.K5.mesaj})`);
  dogrula(s.K6.oran === 0 && s.K6.mesaj.includes('istenen durumda değil'), 'kayıt yok: K6 kalır');
}
{
  const s = puanla(await laboratuvar(TABLO.replace('sirket', 'sirket_db').replace('USE sirket', 'USE sirket_db') + EKLE + GUNCELLE + SIL));
  dogrula(Object.values(s).every((r) => r.oran === 0), 'farklı veritabanı adı: kontroller bulamaz (ad sözleşmesi Yapılacak İşlemler\'de)');
}
{
  // Hazırlık SQL'i ve "kendisi" kurulum.
  const server = new MySqlServer(SQL, {});
  const store = { state: defaultState(), server, touch() {}, flush: async () => {} };
  await labHazirla(store, { bilgi: { lab_kurulum: 'kendisi' }, hazirlik: 'CREATE DATABASE okul; CREATE TABLE okul.ogrenci (no INT PRIMARY KEY, ad VARCHAR(40)); INSERT INTO okul.ogrenci VALUES (1, "Ali"), (2, "Veli");' });
  dogrula(!store.state.install.mysql, '"kendisi" kurulumda MySQL kurulu gelmez');
  const r = labDenetle({ server, store }, [{ no: 'K1', tip: 'kayit_sayisi', hedef: 'okul.ogrenci', beklenen: '>=2' }, { no: 'K2', tip: 'mysql_kurulu' }]);
  dogrula(r[0].oran === 1, 'hazırlık SQL\'i başlangıç veritabanını kurar');
  dogrula(r[1].oran === 0 && r[1].mesaj.includes('kurulmamış'), 'mysql_kurulu: kurulmamış');
  dogrula(!(await labHazirla(store, { bilgi: {}, hazirlik: 'DROP DATABASE okul;' })) && server.hasDb('okul'), 'hazırlık yalnızca bir kez yapılır');
}

console.log(`\n${basarili} başarılı, ${hatali} hatalı`);
process.exit(hatali ? 1 : 0);
