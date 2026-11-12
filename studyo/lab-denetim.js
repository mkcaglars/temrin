// Laboratuvar (MySQL simülatörü) kontrolleri: öğrencinin veritabanları temrin CSV'sindeki SQL kontrollerine göre denetlenir.
// build.sh bu dosyayı studyo/temrin/lab-denetim.js olarak kopyalar. Biçim: sablon/README.md ("Laboratuvar kontrolleri").
// Sonuç biçimi motorunkiyle aynıdır: { no, gecti, oran, mesaj, notlar, bicim }; puanlama sunucuda yapılır.
import { MySqlServer, Session, typeText, displayValue } from '../assets/lab/mysql/engine.js';
import { TaskEngine } from '../assets/lab/tasks.js';
import { installEverything } from '../assets/lab/store.js';
import { databaseXml, dataFileName } from '../assets/js/datasetgen.js';
import { uyum as uyumEsnek, belirtecler } from './esneklik.js';

export const LAB_KONTROL_TIPLERI = ['mysql_kurulu', 'vt_var', 'tablo_var', 'sutun_var', 'kayit_sayisi', 'iliski_var', 'sql_dogru', 'sql_sonuc',
  'yedek_alindi', 'kullanici_var'];
export const labKontrolu = (k) => LAB_KONTROL_TIPLERI.includes(k.tip);

const lc = (s) => String(s ?? '').trim().toLowerCase();
const hedefler = (k) => String(k.hedef || '').split(';').map((x) => x.trim()).filter(Boolean);
const parcala = (h) => h.split('.').map((x) => x.trim().replace(/^`|`$/g, ''));

/** sql.js'i yükler (sayfada yoksa). taban: lib/sqljs klasörünün adresi. */
export async function sqlJsYukle(taban = new URL('../lib/sqljs/', import.meta.url).href) {
  if (!window.initSqlJs) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = taban + 'sql-wasm.js';
      s.onload = resolve;
      s.onerror = () => reject(new Error('sql.js yüklenemedi'));
      document.head.appendChild(s);
    });
  }
  return window.initSqlJs({ locateFile: (f) => taban + f });
}

const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/**
 * Öğrencinin bu temrindeki laboratuvarını sunucudan salt okunur yükler (öğretmen doğrulaması).
 * Döner: { server, store: { state } } — sunucuya hiçbir şey yazılmaz.
 */
export async function labSaltOkunur(temrinId, okulNo, SQL) {
  const adres = (ek) => new URL('api/calisma.php?' + new URLSearchParams({ temrin_id: temrinId, okul_no: okulNo, ...ek }), document.baseURI).href;
  const al = async (ek) => {
    const r = await fetch(adres(ek), { credentials: 'same-origin' });
    const d = await r.json().catch(() => null);
    if (!r.ok) throw new Error(d?.mesaj || `Sunucu hatası (${r.status})`);
    return d;
  };
  const d = await al({ lab: 'durum' });
  const server = new MySqlServer(SQL, {});
  const state = d.state || { install: {}, files: {} };
  if (state.server) server.importState(state.server);
  for (const v of d.databases || []) {
    const x = await al({ lab_vt: v.name });
    try { server.loadDatabase(x.name, b64(x.data)); } catch (e) { console.error('Veritabanı açılamadı', v.name, e); }
  }
  state.install ??= {};
  state.files ??= {};
  state.prefs ??= {};
  return { server, store: { state } };
}

/** Kontrolleri çalıştırır. lab: { server, store } (laboratuvar sayfasındaki ya da labSaltOkunur ile yüklenen). */
export function labDenetle(lab, kontroller) {
  const motor = new TaskEngine(lab);
  return kontroller.filter(labKontrolu).map((k) => {
    let s;
    try {
      s = denetle(lab, motor, k);
    } catch (e) {
      s = { gecti: false, oran: 0, mesaj: 'Denetlenemedi: ' + (e.message || e) };
    }
    s.oran ??= s.gecti ? 1 : 0;
    s.gecti = s.oran >= 1;
    return { no: k.no, notlar: [], bicim: false, ...s };
  });
}

/** Birden çok hedefli kontrol: her hedef ayrı puanlanır (yarım puanlar dahil). */
function hedefBazli(k, tek) {
  const liste = hedefler(k);
  if (!liste.length) return { oran: 0, mesaj: 'Hedef yazılmamış.' };
  let toplam = 0;
  const mesajlar = [];
  for (const h of liste) {
    const [oran, mesaj] = tek(h);
    toplam += oran;
    if (mesaj) mesajlar.push(mesaj);
  }
  return { oran: toplam / liste.length, mesaj: mesajlar.join(' ') };
}

function rootOturumu(server) {
  const root = server.users.find((u) => u.user === 'root' && u.host === 'localhost') || server.users[0];
  const s = new Session(server, root, 'localhost');
  s.close();
  return s;
}

/** Sorguyu root olarak çalıştırır: { ok, satirlar: ['1 Ali', ...], hata } */
function sorgu(server, db, sql) {
  if (!server.hasDb(db)) return { ok: false, hata: `"${db}" veritabanı yok` };
  const s = rootOturumu(server);
  s.use(db);
  const sonuclar = s.execute(sql);
  const r = sonuclar[sonuclar.length - 1];
  if (!r?.ok) return { ok: false, hata: r?.error ? `Error Code: ${r.error.code}. ${r.error.message}` : 'sorgu çalışmadı' };
  const satirlar = (r.rows || []).map((row) => row.map((v, i) => displayValue(v, r.columns?.[i]) ?? 'NULL').join(' '));
  return { ok: true, satirlar, ilk: r.rows?.[0]?.[0] };
}

/** "varchar(50) nn pk" → { tur: 'varchar(50)', ozellikler: ['nn', 'pk'] } */
function sutunBeklenen(s) {
  const ozellikler = [];
  let tur = '';
  for (const p of String(s || '').toLowerCase().replace(/\(\s*/g, '(').replace(/\s*,\s*/g, ',').replace(/\s*\)/g, ')').split(/[\s;]+/).filter(Boolean)) {
    if (['pk', 'nn', 'ai', 'uq', 'null', 'un'].includes(p)) ozellikler.push(p);
    else if (!tur) tur = p === 'integer' ? 'int' : p;
  }
  return { tur, ozellikler };
}

const OZELLIK_ADI = { pk: 'birincil anahtar (PK)', nn: 'boş geçilemez (NN)', ai: 'otomatik artan (AI)', uq: 'benzersiz (UQ)', null: 'boş geçilebilir', un: 'işaretsiz (UN)' };

function denetle(lab, motor, k) {
  const { server, store } = lab;
  const meta = (db, t) => motor.meta(db, t);
  switch (k.tip) {
    case 'mysql_kurulu': {
      const i = store.state.install || {};
      if (!i.mysql || !i.configured) return { oran: 0, mesaj: 'MySQL Server kurulmamış ya da yapılandırılmamış.' };
      if (!server.running) return { oran: 0.5, mesaj: 'MySQL kurulu ama hizmet (MySQL80) çalışmıyor.' };
      return { oran: 1 };
    }
    case 'vt_var':
      return hedefBazli(k, (h) => (server.hasDb(h) ? [1] : [0, `"${h}" veritabanı yok.`]));
    case 'tablo_var':
      return hedefBazli(k, (h) => {
        const [db, t] = parcala(h);
        if (!server.hasDb(db)) return [0, `"${db}" veritabanı yok.`];
        return meta(db, t) ? [1] : [0, `${db} veritabanında "${t}" tablosu yok.`];
      });
    case 'sutun_var': {
      const b = sutunBeklenen(k.beklenen);
      return hedefBazli(k, (h) => {
        const [db, t, c] = parcala(h);
        const m = meta(db, t);
        if (!m) return [0, `${db}.${t} tablosu yok.`];
        const col = m.columns.find((x) => lc(x.name) === lc(c));
        if (!col) return [0, `${db}.${t} tablosunda "${c}" sütunu yok.`];
        const eksik = [];
        if (b.tur) {
          const ist = /^(\w+)(?:\((\d+)(?:,(\d+))?\))?$/.exec(b.tur);
          const turTamam = ist && ist[1] === col.type && (ist[2] == null || Number(ist[2]) === Number(col.len))
            && (ist[3] == null || Number(ist[3]) === Number(col.scale ?? 0));
          if (!turTamam) eksik.push(`türü ${b.tur} olmalı (bulunan ${typeText(col)})`);
        }
        const pk = (m.pk || []).some((x) => lc(x) === lc(col.name));
        for (const o of b.ozellikler) {
          const var_ = o === 'pk' ? pk : o === 'ai' ? !!col.autoInc : o === 'nn' ? !!(col.notNull || pk) : o === 'null' ? !(col.notNull || pk)
            : o === 'un' ? !!col.unsigned : (m.uniques || []).some((u) => u.cols.length === 1 && lc(u.cols[0]) === lc(col.name)) || (pk && m.pk.length === 1);
          if (!var_) eksik.push(`${OZELLIK_ADI[o]} olmalı`);
        }
        // Sütun var ama türü/özelliği farklı: yarım puan.
        return eksik.length ? [0.5, `${t}.${col.name} sütunu: ${eksik.join(', ')}.`] : [1];
      });
    }
    case 'kayit_sayisi': {
      const [db, t] = parcala(hedefler(k)[0] || '');
      const m = meta(db, t);
      if (!m) return { oran: 0, mesaj: `${db}.${t} tablosu yok.` };
      const n = Number(server.getDb(db).sql.exec(`SELECT count(*) FROM "${m.name}"`)[0].values[0][0]);
      const e = String(k.beklenen || '').replace(/\s+/g, '');
      let tamam;
      let aralik = e;
      const ar = /^(\d+)-(\d+)$/.exec(e);
      const ks = /^(>=|<=|>|<|=)?(\d+)$/.exec(e);
      if (ar) { tamam = n >= +ar[1] && n <= +ar[2]; aralik = `${ar[1]} ile ${ar[2]} arasında`; }
      else if (ks) {
        const v = +ks[2];
        tamam = { '>=': n >= v, '<=': n <= v, '>': n > v, '<': n < v }[ks[1]] ?? n === v;
        aralik = { '>=': `en az ${v}`, '<=': `en çok ${v}`, '>': `en az ${v + 1}`, '<': `en çok ${v - 1}` }[ks[1]] ?? String(v);
      }
      return tamam ? { oran: 1 } : { oran: 0, mesaj: `${t} tablosunda ${aralik} kayıt olmalı, ${n} kayıt var.` };
    }
    case 'iliski_var': {
      const [db, t] = parcala(hedefler(k)[0] || '');
      const m = meta(db, t);
      if (!m) return { oran: 0, mesaj: `${db}.${t} tablosu yok.` };
      const ref = lc(k.beklenen);
      return (m.fks || []).some((f) => !ref || lc(f.refTable) === ref) ? { oran: 1 }
        : { oran: 0, mesaj: `${t} tablosunda ${ref ? `"${ref}" tablosuna ` : ''}yabancı anahtar (ilişki) yok.` };
    }
    case 'sql_dogru': {
      const r = sorgu(server, hedefler(k)[0] || '', k.girdi);
      if (!r.ok) return { oran: 0, mesaj: `Denetim sorgusu çalışmadı (${r.hata}).` };
      const v = r.ilk;
      return v != null && v !== 0 && v !== '0' && v !== '' ? { oran: 1 } : { oran: 0, mesaj: 'Veritabanı istenen durumda değil.' };
    }
    case 'sql_sonuc': {
      const r = sorgu(server, hedefler(k)[0] || '', k.girdi);
      if (!r.ok) return { oran: 0, mesaj: `Sorgu çalışmadı (${r.hata}).` };
      const beklenen = String(k.beklenen).split('|').map((x) => x.trim());
      if (beklenen.length === 1 && beklenen[0] === '') beklenen.length = 0;
      const ozet = `beklenen [${beklenen.join(', ')}], bulunan [${r.satirlar.join(', ')}]`;
      if (beklenen.length !== r.satirlar.length) return { oran: 0, mesaj: `Sonuç farklı: ${ozet}.` };
      const sonuc = satirlariEslestir(beklenen, r.satirlar);
      if (!sonuc) return { oran: 0, mesaj: `Sonuç farklı: ${ozet}.` };
      return sonuc === 'bicim' ? { oran: 1, bicim: true, notlar: [`Sonuç biçimi farklı: ${ozet}`] } : { oran: 1 };
    }
    case 'yedek_alindi':
      return hedefBazli({ hedef: k.hedef || '*' }, (h) => {
        const [db, t] = h === '*' ? [] : parcala(h);
        return motor.check({ type: 'export_file', db, table: t }, { flags: [] }) ? [1]
          : [0, `${db ? `"${h}" için ` : ''}yedek (.sql) dosyası Belgeler klasöründe yok.`];
      });
    case 'kullanici_var':
      return hedefBazli(k, (h) => (server.users.some((u) => lc(u.user) === lc(h)) ? [1] : [0, `"${h}" MySQL kullanıcısı yok.`]));
    default:
      return { oran: 0, mesaj: `Bilinmeyen kontrol tipi: ${k.tip}` };
  }
}

/** Satırlar sırayla (yoksa sırası önemsiz) uyuyorsa 'tam' ya da 'bicim', uymuyorsa null. */
function satirlariEslestir(beklenen, bulunan) {
  // Sorgu sonucunun gösterimi (5500.00, 2024-01-05) öğrenciden kaynaklanmaz: belirteçleri aynıysa tam sayılır.
  const uyum = (b, a) => {
    const u = uyumEsnek(b, a);
    return u === 'bicim' && belirtecler(b).join(' ') === belirtecler(a).join(' ') ? 'tam' : u;
  };
  const sirali = beklenen.map((b, i) => uyum(b, bulunan[i]));
  if (!sirali.includes('kaldi')) return sirali.includes('bicim') ? 'bicim' : 'tam';
  const kalan = [...bulunan];
  let bicim = false;
  for (const b of beklenen) {
    let i = kalan.findIndex((x) => uyum(b, x) === 'tam');
    if (i < 0) { i = kalan.findIndex((x) => uyum(b, x) === 'bicim'); bicim = true; }
    if (i < 0) return null;
    kalan.splice(i, 1);
  }
  return bicim ? 'bicim' : 'tam';
}

/**
 * Öğrencinin bu temrindeki laboratuvarı ilk kez açıldığında: MySQL ve Workbench hazır kurulur (bilgi;lab_kurulum
 * "kendisi" değilse) ve temrinin hazırlık SQL'i (başlangıç veritabanları, kayıtlar) çalıştırılır. Bir kez yapılır.
 * store: c-lesson LabStore. Döner: hazırlık yapıldıysa true.
 */
export async function labHazirla(store, temrin) {
  const st = store.state;
  st.seen ??= {};
  if (st.seen.temrin) return false;
  const b = temrin.bilgi || {};
  if (b.lab_kurulum !== 'kendisi') {
    installEverything(st, store.server, b.lab_sifre ?? '');
    st.taskMode = false;
  }
  const sql = String(temrin.hazirlik || '').trim();
  if (sql) {
    const sonuclar = rootOturumu(store.server).execute(sql, { stopOnError: false });
    for (const r of sonuclar) if (!r.ok) console.error('Hazırlık SQL hatası:', r.error?.code, r.error?.message, r.sql);
  }
  st.seen.temrin = true;
  st.seen.welcome = true;
  store.touch();
  await store.flush();
  return true;
}

/**
 * Bir teslimin bütün kontrolleri: C# projesininkiler motorda (motor.Degerlendir), laboratuvarınkiler MySQL simülatöründe.
 * lab verilirse (program laboratuvardaki MySQL'e bağlanıyorsa) önce laboratuvar denetlenir; sonra her proje kontrolü
 * laboratuvarın o anki hâlinden başlar (programın yaptığı değişiklikler sonraki kontrolü etkilemez).
 * Döner: { derlendi, hatalar, sonuclar } (sunucunun beklediği biçim).
 */
export function hepsiniDegerlendir(motor, projeJson, kontroller, lab) {
  const labK = kontroller.filter(labKontrolu);
  const projeK = kontroller.filter((k) => !labKontrolu(k));
  const sonuc = { derlendi: true, hatalar: [], sonuclar: [] };
  if (labK.length) {
    sonuc.sonuclar.push(...(lab ? labDenetle(lab, labK) : labK.map((k) => ({ no: k.no, gecti: false, oran: 0, mesaj: 'Laboratuvar yüklenemedi.' }))));
  }
  if (!projeK.length) return sonuc;
  const anlik = lab ? lab.server.databaseNames().map((ad) => [ad, lab.server.exportDatabase(ad)]) : [];
  for (const parca of lab ? projeK.map((k) => [k]) : [projeK]) {
    for (const [ad, veri] of anlik) lab.server.loadDatabase(ad, veri);
    const r = JSON.parse(motor.Degerlendir(projeJson, JSON.stringify(parca)));
    sonuc.derlendi = r.derlendi;
    if (r.hatalar?.length) sonuc.hatalar = r.hatalar;
    sonuc.sonuclar.push(...r.sonuclar);
  }
  for (const [ad, veri] of anlik) lab.server.loadDatabase(ad, veri);
  return sonuc;
}

/** Kaydedilmiş proje verisinden derleyici girdisi: c-lesson Ide.projectJson(true) ile aynı (veri dosyası, App.config, başvurular). */
export function kayitliProjeJson(veri) {
  veri ||= {};
  const db = veri.database;
  const refs = new Set(veri.references || []);
  for (const p of veri.packages || []) {
    if (p.id === 'MySql.Data' || p.id === 'MySql.Data.EntityFramework') refs.add('MySql.Data');
    if (p.id === 'EntityFramework') refs.add('EntityFramework');
  }
  const dosyalar = veri.files || [];
  return JSON.stringify({
    name: 'Proje',
    namespace: veri.namespace || 'WinFormsApp',
    files: dosyalar.map((f) => ({ name: f.name, content: f.content })),
    dataFiles: [
      ...(db ? [{ name: dataFileName(db), content: databaseXml(db) }] : []),
      ...dosyalar.filter((f) => /^app\.config$/i.test(f.name)).map((f) => ({ name: 'App.config', content: f.content })),
    ],
    references: [...refs],
  });
}

/** Program laboratuvardaki MySQL'e bağlanıyor mu (MySql.Data başvurusu ya da paketi)? */
export const mysqlKullanir = (veri) => (veri?.references || []).includes('MySql.Data') || (veri?.packages || []).some((p) => /^MySql\.Data/.test(p.id));
