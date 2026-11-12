// MySQL simülatörü motor testleri: node tests/lab/engine.test.mjs
import init from '../../node_modules/sql.js/dist/sql-wasm.js';
import { MySqlServer, displayValue } from '../../web/assets/lab/mysql/engine.js';

const SQL = await init();
let fails = 0;
let count = 0;
function ok(cond, msg) { count++; if (!cond) { fails++; console.log('✖', msg); } }
function eq(a, b, msg) { const A = JSON.stringify(a); const B = JSON.stringify(b); count++; if (A !== B) { fails++; console.log('✖', msg, '\n   beklenen', B, '\n   gelen   ', A); } }

const server = new MySqlServer(SQL, { rootPassword: 'Root.123', clock: () => new Date(2024, 4, 15, 10, 30, 0) });
let s;
try { server.connect('root', 'yanlis'); ok(false, 'yanlış şifre kabul edildi'); } catch (e) { eq(e.code, 1045, 'yanlış şifre 1045'); ok(/Access denied for user 'root'@'localhost' \(using password: YES\)/.test(e.message), e.message); }
s = server.connect('root', 'Root.123');

const run = (sql) => s.execute(sql);
const one = (sql) => { const r = run(sql); return r[r.length - 1]; };
const rows = (sql) => { const r = one(sql); if (!r.ok) console.log('   HATA', sql, r.message); return r.rows?.map((x) => x.map((v, i) => displayValue(v, r.columns[i]))); };
const errc = (sql) => { const r = one(sql); return r.ok ? 0 : r.error.code; };

eq(errc('SELECT * FROM personel'), 1046, 'veritabanı seçilmeden 1046');
eq(one('CREATE DATABASE sirketdb').message, '1 row(s) affected', 'create db');
eq(errc('CREATE DATABASE sirketdb'), 1007, 'tekrar create db');
eq(errc('USE yok'), 1049, 'use yok');
eq(one('USE sirketdb').ok, true, 'use');
const ct = one(`CREATE TABLE \`sirketdb\`.\`personel\` (
  \`personel_id\` INT NOT NULL AUTO_INCREMENT,
  \`ad_soyad\` VARCHAR(45) NOT NULL,
  \`cinsiyet\` VARCHAR(5) NOT NULL,
  \`departman\` VARCHAR(45) NOT NULL,
  \`giris_tarihi\` DATE NOT NULL,
  \`maas\` DECIMAL(7,2) NOT NULL,
  \`eposta\` VARCHAR(45) NULL,
  PRIMARY KEY (\`personel_id\`),
  UNIQUE INDEX \`eposta_UNIQUE\` (\`eposta\` ASC) VISIBLE);`);
eq(ct.ok, true, 'create table: ' + ct.message);
const ins = one(`INSERT INTO personel (ad_soyad, cinsiyet, departman, giris_tarihi, maas, eposta) VALUES
 ('Ahmet Y.', 'E', 'Bilişim Teknolojileri', '2015-03-12', 12500, 'ahmet@sirket.com'),
 ('Ayşe K.', 'K', 'Muhasebe', '2018-9-1', 9800.5, NULL),
 ('Çağrı T.', 'E', 'Üretim', '2020-01-15', 8750.555, 'cagri@sirket.com'),
 ("Zeynep A.", 'K', 'İnsan Kaynakları', 20210520, 9100, 'zeynep@sirket.com'),
 ('ismail D.', 'E', 'Üretim', '2019-11-30', 8900, 'ismail@sirket.com');`);
eq([ins.ok, ins.affected, ins.message], [true, 5, '5 row(s) affected Records: 5  Duplicates: 0  Warnings: 0'], 'çok satırlı insert');
eq(rows('SELECT personel_id, giris_tarihi, maas FROM personel WHERE personel_id IN (2,3,4)'), [['2', '2018-09-01', '9800.50'], ['3', '2020-01-15', '8750.56'], ['4', '2021-05-20', '9100.00']], 'tarih/ondalık normalleştirme');
eq(rows("SELECT ad_soyad FROM personel ORDER BY ad_soyad"), [['Ahmet Y.'], ['Ayşe K.'], ['Çağrı T.'], ['ismail D.'], ['Zeynep A.']], 'Türkçe sıralama');
eq(rows("SELECT ad_soyad FROM personel WHERE ad_soyad LIKE 'c%'"), [['Çağrı T.']], 'LIKE aksan duyarsız');
eq(rows("SELECT count(*) FROM personel WHERE departman = 'üretim'"), [['2']], '= büyük/küçük harf duyarsız (ASCII dışı da)');
eq(one("SELECT COUNT(*), AVG(maas) ortalama, MAX(maas) FROM personel").columns.map((c) => c.name), ['COUNT(*)', 'ortalama', 'MAX(maas)'], 'sütun başlıkları');
eq(rows('SELECT 5/2, 7 DIV 2, 7 MOD 3, CONCAT("a", 1, NULL), CONCAT_WS("-", "a", NULL, "b")'), [['2.5', '3', '1', null, 'a-b']], 'işleçler');
eq(rows("SELECT YEAR(giris_tarihi), DATEDIFF('2024-05-15', giris_tarihi) FROM personel WHERE personel_id = 1"), [['2015', '3352']], 'tarih işlevleri');
eq(rows("SELECT NOW(), CURDATE(), DATE_ADD('2024-01-31', INTERVAL 1 MONTH), DATE_FORMAT('2024-05-15', '%d.%m.%Y')"), [['2024-05-15 10:30:00', '2024-05-15', '2024-02-29', '15.05.2024']], 'tarih');
eq(rows("SELECT TIMESTAMPDIFF(YEAR, giris_tarihi, CURDATE()) FROM personel WHERE personel_id = 1"), [['9']], 'timestampdiff');
eq(rows("SELECT UPPER('şule'), LOWER('İSTANBUL'), LEFT('Merhaba', 3), ROUND(2.5), ROUND(3.14159, 2), IF(1>0, 'evet', 'hayır'), IFNULL(NULL, 'x')"), [['ŞULE', 'i̇stanbul', 'Mer', '3', '3.14', 'evet', 'x']], 'dizgi');
eq(rows('SELECT VERSION(), DATABASE(), @@version'), [['8.0.36', 'sirketdb', '8.0.36']], 'sürüm');
eq(rows("SELECT departman, COUNT(*) AS kisi FROM personel GROUP BY departman HAVING COUNT(*) > 1 ORDER BY kisi DESC"), [['Üretim', '2']], 'group by');
eq(rows("SELECT ad_soyad FROM personel ORDER BY maas DESC LIMIT 2"), [['Ahmet Y.'], ['Ayşe K.']], 'limit');
eq(rows("SELECT ad_soyad FROM sirketdb.personel WHERE maas BETWEEN 9000 AND 10000 AND cinsiyet = 'k'"), [['Ayşe K.'], ['Zeynep A.']], 'between + niteleyici');
// hatalar
eq(errc("SELECT * FROM personell"), 1146, 'tablo yok');
ok(one("SELECT * FROM personell").message === "Error Code: 1146. Table 'sirketdb.personell' doesn't exist", 'mesaj 1146');
eq(errc("SELECT adsoyad FROM personel"), 1054, 'sütun yok');
const se = one("SELEC * FROM personel");
eq(se.error?.code, 1064, 'sözdizimi');
ok(/near 'SELEC \* FROM personel' at line 1/.test(se.message), se.message);
eq(one("INSERT INTO personel VALUES (1, 'X', 'E', 'D', '2020-01-01', 1, NULL)").message, "Error Code: 1062. Duplicate entry '1' for key 'personel.PRIMARY'", 'tekrar PK');
eq(one("INSERT INTO personel (ad_soyad, cinsiyet, departman, giris_tarihi, maas, eposta) VALUES ('X', 'E', 'D', '2020-01-01', 1, 'AHMET@sirket.com')").message, "Error Code: 1062. Duplicate entry 'AHMET@sirket.com' for key 'personel.eposta_UNIQUE'", 'tekrar UNIQUE (büyük/küçük harf duyarsız)');
eq(one("INSERT INTO personel (ad_soyad, cinsiyet, departman, giris_tarihi, maas) VALUES ('X', 'Erkek!', 'D', '2020-01-01', 1)").message, "Error Code: 1406. Data too long for column 'cinsiyet' at row 1", 'çok uzun');
eq(one("INSERT INTO personel (ad_soyad, cinsiyet, departman, giris_tarihi) VALUES ('X', 'E', 'D', '2020-01-01')").message, "Error Code: 1364. Field 'maas' doesn't have a default value", 'varsayılan yok');
eq(one("INSERT INTO personel (ad_soyad, cinsiyet, departman, giris_tarihi, maas) VALUES (NULL, 'E', 'D', '2020-01-01', 5)").message, "Error Code: 1048. Column 'ad_soyad' cannot be null", 'null');
eq(one("INSERT INTO personel (ad_soyad, cinsiyet, departman, giris_tarihi, maas) VALUES ('X', 'E', 'D', '2020-02-30', 5)").message, "Error Code: 1292. Incorrect date value: '2020-02-30' for column 'giris_tarihi' at row 1", 'tarih');
eq(one("INSERT INTO personel (ad_soyad, cinsiyet, departman, giris_tarihi, maas) VALUES ('X', 'E', 'D', '2020-02-03', 123456)").message, "Error Code: 1264. Out of range value for column 'maas' at row 1", 'aralık');
eq(one("INSERT INTO personel (ad_soyad, cinsiyet, departman, giris_tarihi, maas) VALUES ('X', 'E', 'D', '2020-02-03', 'abc')").message, "Error Code: 1366. Incorrect decimal value: 'abc' for column 'maas' at row 1", 'ondalık değil');
eq(errc("INSERT INTO personel VALUES (9, 'X')"), 1136, 'sütun sayısı');
// güncelleme / silme
s.safeUpdates = true;
eq(one("UPDATE personel SET maas = maas * 1.2").error?.code, 1175, 'güvenli güncelleme');
eq(one("UPDATE personel SET maas = 9500 WHERE departman = 'Muhasebe'").error?.code, 1175, 'anahtar olmayan WHERE');
const up = one("UPDATE personel SET maas = 9500 WHERE personel_id = 2");
eq([up.ok, up.message], [true, '1 row(s) affected Rows matched: 1  Changed: 1  Warnings: 0'], 'update pk');
eq(one("SET SQL_SAFE_UPDATES = 0").ok, true, 'safe updates kapat');
eq(one("UPDATE personel SET maas = maas * 1.05 WHERE maas < 10000").affected, 4, 'zam');
eq(rows("SELECT maas FROM personel WHERE personel_id = 3"), [['9188.09']], 'yuvarlama');
eq(one("DELETE FROM personel WHERE departman = 'Üretim'").affected, 2, 'delete');
eq(rows("SELECT COUNT(*) FROM personel"), [['3']], 'kalan');
const ins2 = one("INSERT INTO personel SET ad_soyad = 'Murat K.', cinsiyet = 'E', departman = 'İnsan Kaynakları', giris_tarihi = CURDATE(), maas = 10000");
eq([ins2.ok, ins2.insertId], [true, 6], 'INSERT SET + otomatik artış ' + ins2.message);
eq(rows("SELECT LAST_INSERT_ID()"), [['6']], 'last_insert_id');
// ilişkisel
run(`CREATE TABLE bolum (bolum_id INT PRIMARY KEY AUTO_INCREMENT, bolum_adi VARCHAR(50) NOT NULL UNIQUE);
CREATE TABLE ogrenci (ogrenci_id INT AUTO_INCREMENT PRIMARY KEY, ad VARCHAR(30) NOT NULL, bolum_id INT,
  CONSTRAINT fk_ogrenci_bolum FOREIGN KEY (bolum_id) REFERENCES bolum (bolum_id));
INSERT INTO bolum (bolum_adi) VALUES ('Bilişim'), ('Elektrik');
INSERT INTO ogrenci (ad, bolum_id) VALUES ('Ali', 1), ('Veli', 2), ('Can', NULL);`);
eq(rows("SELECT o.ad, b.bolum_adi FROM ogrenci o INNER JOIN bolum b ON o.bolum_id = b.bolum_id ORDER BY o.ad"), [['Ali', 'Bilişim'], ['Veli', 'Elektrik']], 'join');
eq(rows("SELECT o.ad, b.bolum_adi FROM ogrenci AS o LEFT JOIN bolum AS b ON o.bolum_id = b.bolum_id ORDER BY 1"), [['Ali', 'Bilişim'], ['Can', null], ['Veli', 'Elektrik']], 'left join');
const fk1 = one("INSERT INTO ogrenci (ad, bolum_id) VALUES ('Ece', 9)");
eq(fk1.message, 'Error Code: 1452. Cannot add or update a child row: a foreign key constraint fails (`sirketdb`.`ogrenci`, CONSTRAINT `fk_ogrenci_bolum` FOREIGN KEY (`bolum_id`) REFERENCES `bolum` (`bolum_id`))', 'fk 1452');
eq(one("DELETE FROM bolum WHERE bolum_id = 1").error?.code, 1451, 'fk 1451');
eq(one("DROP TABLE bolum").error?.code, 3730, 'drop parent');
eq(one("CREATE TABLE x (a VARCHAR(5), b INT, FOREIGN KEY (a) REFERENCES bolum(bolum_id))").error?.code, 3780, 'uyumsuz fk');
eq(one("CREATE TABLE x (a INT, FOREIGN KEY (a) REFERENCES yok(id))").error?.code, 1824, 'olmayan tablo fk');
// ALTER
eq(one("ALTER TABLE personel ADD COLUMN telefon VARCHAR(15) NULL AFTER ad_soyad").ok, true, 'add column');
eq(rows("DESCRIBE personel").map((r) => r.slice(0, 4)), [['personel_id', 'int', 'NO', 'PRI'], ['ad_soyad', 'varchar(45)', 'NO', ''], ['telefon', 'varchar(15)', 'YES', ''], ['cinsiyet', 'varchar(5)', 'NO', ''], ['departman', 'varchar(45)', 'NO', ''], ['giris_tarihi', 'date', 'NO', ''], ['maas', 'decimal(7,2)', 'NO', ''], ['eposta', 'varchar(45)', 'YES', 'UNI']], 'describe');
eq(one("ALTER TABLE personel CHANGE COLUMN telefon tel VARCHAR(20) NULL, MODIFY maas DECIMAL(9,2) NOT NULL").ok, true, 'change/modify');
eq(rows("SELECT maas FROM personel WHERE personel_id = 1"), [['12500.00']], 'veri korundu');
eq(one("ALTER TABLE personel DROP COLUMN tel").ok, true, 'drop column');
eq(one("ALTER TABLE ogrenci DROP COLUMN bolum_id").error?.code, 1828, 'fk sütunu silinemez');
eq(one("ALTER TABLE bolum RENAME TO bolumler").ok, true, 'rename table');
eq(rows("SELECT o.ad FROM ogrenci o JOIN bolumler b USING (bolum_id) WHERE b.bolum_id = 2"), [['Veli']], 'rename sonrası');
eq(one("INSERT INTO ogrenci (ad, bolum_id) VALUES ('Ece', 9)").error?.code, 1452, 'rename sonrası fk çalışıyor');
eq(one("INSERT INTO bolumler (bolum_adi) VALUES ('Makine')").insertId, 3, 'rename sonrası AI');
const sc = rows("SHOW CREATE TABLE ogrenci")[0][1];
ok(sc.includes('CONSTRAINT `fk_ogrenci_bolum` FOREIGN KEY (`bolum_id`) REFERENCES `bolumler` (`bolum_id`)') && sc.includes('AUTO_INCREMENT=4'), sc);
eq(rows("SHOW TABLES"), [['bolumler'], ['ogrenci'], ['personel']], 'show tables');
eq(rows("SHOW DATABASES"), [['information_schema'], ['mysql'], ['performance_schema'], ['sirketdb'], ['sys']], 'show databases');
// yedek / geri yükleme
const dump = s.dump('sirketdb', { includeSchema: false });
ok(dump.includes("INSERT INTO `personel` VALUES (1,'Ahmet Y.','E','Bilişim Teknolojileri','2015-03-12',12500.00,'ahmet@sirket.com')"), dump.split('\n').find((l) => l.startsWith('INSERT INTO `personel`')));
eq(one("CREATE DATABASE yedek").ok, true, 'yedek db');
eq(one("USE yedek").ok, true, 'use yedek');
const res = run(dump);
eq(res.filter((r) => !r.ok).map((r) => r.message), [], 'dump içe aktarma');
eq(rows("SELECT COUNT(*) FROM ogrenci"), [['3']], 'içe aktarılan veri');
eq(one("INSERT INTO ogrenci (ad, bolum_id) VALUES ('Ece', 9)").error?.code, 1452, 'içe aktarılan fk');
eq(rows("SELECT @@foreign_key_checks"), [['1']], 'fk kontrolü geri açıldı');
// dışa aktar / yükle
const bytes = server.exportDatabase('sirketdb');
eq(rows("SELECT COUNT(*) FROM sirketdb.personel"), [['4']], 'export sonrası işlevler');
const server2 = new MySqlServer(SQL, { rootPassword: 'x' });
server2.loadDatabase('sirketdb', bytes);
const s2 = server2.connect('root', 'x', 'localhost', { database: 'sirketdb' });
const r2 = s2.execute("SELECT ad_soyad FROM personel ORDER BY personel_id DESC LIMIT 1")[0];
eq(r2.rows, [['Murat K.']], 'yüklenen veritabanı');
eq(s2.execute("INSERT INTO personel (ad_soyad, cinsiyet, departman, giris_tarihi, maas) VALUES ('Y', 'E', 'D', '2020-2-3', 5.555)")[0].ok, true, 'yüklenen veritabanına ekleme');
// kullanıcılar
eq(one("CREATE USER 'ogrenci'@'localhost' IDENTIFIED BY '1234'").ok, true, 'create user');
eq(one("GRANT SELECT, INSERT ON sirketdb.* TO 'ogrenci'@'localhost'").ok, true, 'grant');
const so = server.connect('ogrenci', '1234');
eq(so.execute('USE sirketdb')[0].ok, true, 'öğrenci use');
eq(so.execute('SELECT COUNT(*) FROM personel')[0].rows, [[4]], 'öğrenci select');
eq(so.execute('DELETE FROM personel WHERE personel_id = 1')[0].error?.code, 1142, 'öğrenci delete yetkisiz');
eq(so.execute('USE yedek')[0].error?.code, 1044, 'öğrenci başka db');
eq(so.execute('SHOW DATABASES')[0].rows.map((r) => r[0]), ['information_schema', 'performance_schema', 'sirketdb'], 'öğrenci show databases');
// betik: hata durunca durur
s.use('sirketdb');
const multi = run("SELECT 1; SELECT * FROM yok; SELECT 2");
eq(multi.length, 2, 'hatada durma');
// düzenlenebilir sonuç
eq(one("SELECT * FROM sirketdb.personel").editable?.table, 'personel', 'düzenlenebilir');
eq(one("SELECT ad_soyad FROM personel").editable, null, 'pk yoksa düzenlenemez');
// enum, check
eq(one("CREATE TABLE musteri (id INT PRIMARY KEY, cinsiyet ENUM('E','K') NOT NULL DEFAULT 'E', yas TINYINT UNSIGNED, CHECK (yas >= 18))").ok, true, 'enum/check tablo');
eq(one("INSERT INTO musteri VALUES (1, 'k', 20)").ok, true, 'enum küçük harf');
eq(rows("SELECT cinsiyet FROM musteri"), [['K']], 'enum normalleştirme');
eq(one("INSERT INTO musteri VALUES (2, 'X', 20)").message, "Error Code: 1265. Data truncated for column 'cinsiyet' at row 1", 'enum hata');
eq(one("INSERT INTO musteri VALUES (2, 'E', 10)").message, "Error Code: 3819. Check constraint 'musteri_chk_1' is violated.", 'check');
eq(one("INSERT INTO musteri VALUES (2, 'E', 300)").error?.code, 1264, 'tinyint unsigned');
eq(one("INSERT INTO musteri (id) VALUES (3)").ok, true, 'varsayılan enum');
eq(rows("SELECT id, cinsiyet, yas FROM musteri WHERE id = 3"), [['3', 'E', null]], 'varsayılan');
eq(one("TRUNCATE TABLE musteri").ok, true, 'truncate');
eq(one("TRUNCATE TABLE bolumler").error?.code, 1701, 'truncate parent');
eq(one("DROP DATABASE yedek").message, '3 row(s) affected', 'drop database');
eq(one("CREATE VIEW v_personel AS SELECT ad_soyad, maas FROM personel WHERE maas > 10000").ok, true, 'view');
eq(rows("SELECT * FROM v_personel ORDER BY maas"), [['Ahmet Y.', '12500.00']], 'view sorgu');
eq(rows("SELECT COUNT(*) FROM personel WHERE departman <> 'insan kaynaklari'"), [['2']], 'aksan duyarsız <>');
eq(one("UPDATE personel SET departman = 'Bilgi Teknolojileri' WHERE departman = 'bilişim teknolojileri'").affected, 1, 'SET ataması bozulmadı');
eq(one("UPDATE `sirketdb`.`personel` SET `maas` = '9600' WHERE (`personel_id` = '1');").affected, 1, 'Workbench güncellemesi (sayı sütunu = metin)');
// AUTO_INCREMENT + çok sütunlu birincil anahtar (Workbench'te tanımlayıcı ilişki)
eq(one("CREATE TABLE odunc (odunc_id INT NOT NULL AUTO_INCREMENT, ogrenci_no INT NOT NULL, kitap_id INT NOT NULL, PRIMARY KEY (odunc_id, ogrenci_no, kitap_id))").ok, true, 'AI + bileşik PK');
eq(one("INSERT INTO odunc (ogrenci_no, kitap_id) VALUES (5, 7), (6, 8)").insertId, 2, 'AI bileşik PK ekleme');
eq(rows("DESCRIBE odunc").map((r) => r[3]), ['PRI', 'PRI', 'PRI'], 'bileşik PK describe');
eq(one("ALTER TABLE odunc DROP PRIMARY KEY, ADD PRIMARY KEY (odunc_id)").ok, true, 'PK daralt');
eq(one("ALTER TABLE odunc DROP PRIMARY KEY, ADD PRIMARY KEY (odunc_id, kitap_id)").ok, true, 'PK genişlet');
eq(one("INSERT INTO odunc (odunc_id, ogrenci_no, kitap_id) VALUES (1, 9, 9)").message, "Error Code: 1062. Duplicate entry '1' for key 'odunc.PRIMARY'", 'bileşik PK tekrar');
eq(one("CREATE TABLE yanlis (a INT, b INT AUTO_INCREMENT, PRIMARY KEY (a, b))").error?.code, 1075, 'AI ilk sütun değil (MySQL 1075)');

// ---- saklı yordamlar, fonksiyonlar, tetikleyiciler
const all = (sql) => run(sql);
eq(all(`CREATE DATABASE sp; USE sp;
CREATE TABLE ogr (id INT AUTO_INCREMENT PRIMARY KEY, ad VARCHAR(30) NOT NULL, puan INT, sinif VARCHAR(5));
INSERT INTO ogr (ad, puan, sinif) VALUES ('Ali', 70, '10A'), ('Ayşe', 90, '10A'), ('Veli', 45, '10B');
DELIMITER //
CREATE PROCEDURE liste(IN p_sinif VARCHAR(5))
BEGIN
  SELECT ad, puan FROM ogr WHERE sinif = p_sinif ORDER BY puan DESC;
END //
CREATE PROCEDURE ort(IN p_sinif VARCHAR(5), OUT p_ort DECIMAL(5,2))
BEGIN
  SELECT AVG(puan) INTO p_ort FROM ogr WHERE sinif = p_sinif;
END //
DELIMITER ;`).every((r) => r.ok), true, 'CREATE PROCEDURE (DELIMITER)');
const call = run("CALL liste('10A')");
eq(call.length, 2, 'CALL: sonuç kümesi + durum');
eq(call[0].rows, [['Ayşe', 90], ['Ali', 70]], 'CALL sonuç kümesi');
eq(call[0].columns.map((c) => c.name), ['ad', 'puan'], 'CALL sütunlar');
run("CALL ort('10A', @o)");
eq(rows('SELECT @o'), [['80']], 'OUT parametresi');
eq(one('CALL liste()').error?.code, 1318, 'yanlış argüman sayısı 1318');
eq(one('CALL yok()').error?.code, 1305, 'olmayan yordam 1305');
eq(one("CREATE PROCEDURE liste() SELECT 1").error?.code, 1304, 'var olan yordam 1304');
eq(one("CREATE FUNCTION f(x INT) RETURNS INT RETURN x").error?.code, 1418, 'DETERMINISTIC olmayan fonksiyon 1418');
eq(one(`CREATE FUNCTION harf(p INT) RETURNS VARCHAR(2) DETERMINISTIC
BEGIN
  DECLARE h VARCHAR(2);
  IF p >= 85 THEN SET h = 'A'; ELSEIF p >= 70 THEN SET h = 'B'; ELSE SET h = 'F'; END IF;
  RETURN h;
END`).ok, true, 'CREATE FUNCTION (DELIMITER olmadan)');
eq(rows('SELECT ad, harf(puan) FROM ogr ORDER BY id'), [['Ali', 'B'], ['Ayşe', 'A'], ['Veli', 'F']], 'fonksiyon sorguda');
eq(one('SELECT harf(1, 2)').error?.code, 1318, 'fonksiyon argüman sayısı');
eq(one(`CREATE PROCEDURE dongu() BEGIN DECLARE i INT DEFAULT 0; DECLARE t INT DEFAULT 0;
  d: WHILE i < 10 DO SET i = i + 1; IF i = 3 THEN ITERATE d; END IF; IF i = 8 THEN LEAVE d; END IF; SET t = t + i; END WHILE d;
  SELECT i, t; END`).ok, true, 'WHILE/ITERATE/LEAVE');
eq(run('CALL dongu()')[0].rows, [[8, 25]], 'döngü sonucu');
eq(run('CALL dongu()')[0].columns.map((c) => c.name), ['i', 't'], 'yerel değişken sütun adı');
eq(one(`CREATE PROCEDURE imlec() BEGIN
  DECLARE bitti INT DEFAULT 0; DECLARE v VARCHAR(30); DECLARE l TEXT DEFAULT '';
  DECLARE c CURSOR FOR SELECT ad FROM ogr ORDER BY id;
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET bitti = 1;
  OPEN c; oku: LOOP FETCH c INTO v; IF bitti THEN LEAVE oku; END IF; SET l = CONCAT(l, v, ';'); END LOOP; CLOSE c;
  SELECT l; END`).ok, true, 'imleç + NOT FOUND');
eq(run('CALL imlec()')[0].rows, [['Ali;Ayşe;Veli;']], 'imleç sonucu');
eq(one(`CREATE PROCEDURE ekle(IN a VARCHAR(30), IN p INT) BEGIN
  IF p NOT BETWEEN 0 AND 100 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Puan 0-100 olmalı'; END IF;
  INSERT INTO ogr (ad, puan, sinif) VALUES (a, p, '11A'); END`).ok, true, 'SIGNAL yordamı');
eq(one("CALL ekle('Can', 150)").message, 'Error Code: 1644. Puan 0-100 olmalı', 'SIGNAL 1644');
eq(one("CALL ekle('Can', 50)").affected, 1, 'yordam INSERT');
eq(one(`CREATE PROCEDURE yakala() BEGIN DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN GET DIAGNOSTICS CONDITION 1 @m = MESSAGE_TEXT; SELECT 'yakalandı' AS d, @m AS m; END;
  INSERT INTO yok VALUES (1); SELECT 'gelmez'; END`).ok, true, 'EXIT HANDLER');
eq(run('CALL yakala()')[0].rows, [['yakalandı', "Table 'sp.yok' doesn't exist"]], 'hata yakalandı');
eq(one('CREATE PROCEDURE r() BEGIN RETURN 1; END').error?.code, 1313, 'yordamda RETURN 1313');
eq(one('CREATE PROCEDURE durum(p INT) BEGIN CASE p WHEN 1 THEN SELECT 1; END CASE; END').ok, true, 'CASE ifadesi');
eq(one('CALL durum(2)').error?.code, 1339, 'CASE bulunamadı 1339');
eq(rows("SHOW PROCEDURE STATUS WHERE Db = 'sp'").length, 7, 'SHOW PROCEDURE STATUS');
ok(/PROCEDURE `ort`\(IN p_sinif VARCHAR\(5\), OUT p_ort DECIMAL\(5,2\)\)/.test(rows('SHOW CREATE PROCEDURE ort')[0][2]), 'SHOW CREATE PROCEDURE');
eq(one('DROP PROCEDURE durum').ok, true, 'DROP PROCEDURE');
eq(one('DROP PROCEDURE durum').error?.code, 1305, 'DROP PROCEDURE yok');
eq(one('DROP PROCEDURE IF EXISTS durum').ok, true, 'DROP PROCEDURE IF EXISTS');
// tetikleyiciler
eq(all(`CREATE TABLE urun (id INT AUTO_INCREMENT PRIMARY KEY, ad VARCHAR(30), stok INT NOT NULL DEFAULT 0, fiyat DECIMAL(8,2));
CREATE TABLE satis (id INT AUTO_INCREMENT PRIMARY KEY, urun_id INT, adet INT, tutar DECIMAL(10,2));
CREATE TABLE log (id INT AUTO_INCREMENT PRIMARY KEY, mesaj VARCHAR(200));
INSERT INTO urun (ad, stok, fiyat) VALUES ('Kalem', 10, 5.50), ('Defter', 3, 20);
DELIMITER $$
CREATE TRIGGER satis_once BEFORE INSERT ON satis FOR EACH ROW
BEGIN
  DECLARE mevcut INT;
  SELECT stok INTO mevcut FROM urun WHERE id = NEW.urun_id;
  IF mevcut < NEW.adet THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Yetersiz stok';
  END IF;
  SET NEW.tutar = NEW.adet * (SELECT fiyat FROM urun WHERE id = NEW.urun_id);
END$$
CREATE TRIGGER satis_sonra AFTER INSERT ON satis FOR EACH ROW
BEGIN
  UPDATE urun SET stok = stok - NEW.adet WHERE id = NEW.urun_id;
  INSERT INTO log (mesaj) VALUES (CONCAT('Satış ', NEW.urun_id, ' tutar ', NEW.tutar));
END$$
DELIMITER ;`).every((r) => r.ok), true, 'CREATE TRIGGER');
eq(one('INSERT INTO satis (urun_id, adet) VALUES (1, 4)').affected, 1, 'tetikleyicili INSERT');
eq(one('INSERT INTO satis (urun_id, adet) VALUES (2, 5)').message, 'Error Code: 1644. Yetersiz stok', 'tetikleyici SIGNAL');
eq(rows('SELECT tutar FROM satis'), [['22.00']], 'SET NEW');
eq(rows('SELECT stok FROM urun ORDER BY id'), [['6'], ['3']], 'AFTER tetikleyici UPDATE');
eq(rows('SELECT mesaj FROM log'), [['Satış 1 tutar 22']], 'AFTER tetikleyici NEW (BEFORE sonrası)');
eq(one('CREATE TRIGGER satis_sonra AFTER INSERT ON satis FOR EACH ROW SET @x = 1').error?.code, 1359, 'tetikleyici var 1359');
eq(one('CREATE TRIGGER t2 AFTER INSERT ON satis FOR EACH ROW SET NEW.adet = 1').error?.code, 1362, 'AFTER içinde SET NEW 1362');
eq(one('CREATE TRIGGER t3 AFTER INSERT ON satis FOR EACH ROW SET @x = OLD.adet').error?.code, 1363, 'INSERT tetikleyicisinde OLD 1363');
eq(one('CREATE TRIGGER t4 AFTER INSERT ON log FOR EACH ROW SELECT 1').error?.code, 1415, 'tetikleyicide sonuç kümesi 1415');
eq(one('ALTER TABLE satis ADD COLUMN notu VARCHAR(20)').ok, true, 'tetikleyicili tabloyu değiştir');
eq(one('INSERT INTO satis (urun_id, adet) VALUES (1, 1)').ok, true, 'ALTER sonrası tetikleyici');
eq(rows('SELECT stok FROM urun WHERE id = 1'), [['5']], 'ALTER sonrası tetikleyici çalıştı');
eq(rows('SHOW TRIGGERS').map((r) => [r[0], r[1], r[2], r[4]]), [['satis_once', 'INSERT', 'satis', 'BEFORE'], ['satis_sonra', 'INSERT', 'satis', 'AFTER']], 'SHOW TRIGGERS');
eq(one('TRUNCATE TABLE satis').ok, true, 'TRUNCATE');
eq(one('DROP TRIGGER satis_once').ok, true, 'DROP TRIGGER');
eq(one('DROP TRIGGER satis_once').error?.code, 1360, 'DROP TRIGGER yok 1360');
eq(one('SELECT 5 INTO @b').ok, true, 'SELECT INTO @değişken');
eq(rows('SELECT @b'), [['5']], 'SELECT INTO değeri');
const dmp = s.dump('sp', { routines: true });
ok(/TRIGGER `satis_sonra` AFTER INSERT ON `satis`/.test(dmp) && /CREATE DEFINER=`root`@`localhost` FUNCTION `harf`/.test(dmp), 'dump: tetikleyici + yordamlar');

// ---- çapraz veritabanı, çok tablolu UPDATE/DELETE, CREATE TABLE ... SELECT, TEMPORARY, EXPLAIN
run(`CREATE DATABASE xa; CREATE DATABASE xb;
CREATE TABLE xa.ogr (id INT PRIMARY KEY, ad VARCHAR(20), sinif_id INT, puan INT);
CREATE TABLE xb.sinif (id INT PRIMARY KEY, ad VARCHAR(10));
INSERT INTO xa.ogr VALUES (1,'Ali',1,50),(2,'Ayşe',2,60),(3,'Can',1,70);
INSERT INTO xb.sinif VALUES (1,'10A'),(2,'10B'); USE xa;`);
eq(rows('SELECT o.ad, s.ad FROM ogr o JOIN xb.sinif s ON s.id = o.sinif_id ORDER BY o.id'), [['Ali', '10A'], ['Ayşe', '10B'], ['Can', '10A']], 'iki veritabanından JOIN');
eq(one("INSERT INTO xb.sinif VALUES (3, '11A')").affected, 1, 'başka veritabanına INSERT');
eq(rows('SELECT COUNT(*) FROM xb.sinif'), [['3']], 'başka veritabanı sayım');
eq(one("UPDATE ogr o JOIN xb.sinif s ON s.id = o.sinif_id SET o.puan = o.puan + 10 WHERE s.ad = '10A'").affected, 2, 'UPDATE ... JOIN');
eq(rows('SELECT puan FROM ogr ORDER BY id'), [['60'], ['60'], ['80']], 'UPDATE JOIN sonucu');
eq(one("DELETE o FROM ogr o JOIN xb.sinif s ON s.id = o.sinif_id WHERE s.ad = '10B'").affected, 1, 'DELETE ... JOIN');
eq(rows('SELECT id FROM ogr ORDER BY id'), [['1'], ['3']], 'DELETE JOIN sonucu');
eq(one('UPDATE ogr o JOIN xb.sinif s ON s.id = o.sinif_id SET s.ad = 1').error?.code, 1235, 'ikinci tabloyu güncelleme desteklenmiyor');
eq(one('CREATE TABLE yedek AS SELECT o.ad, o.puan, o.puan * 2 AS iki FROM ogr o').message, '2 row(s) affected Records: 2  Duplicates: 0  Warnings: 0', 'CREATE TABLE ... SELECT');
ok(/`puan` int DEFAULT NULL/.test(rows('SHOW CREATE TABLE yedek')[0][1]), 'CTAS sütun türü');
eq(one('CREATE TEMPORARY TABLE gecici (x INT)').ok, true, 'CREATE TEMPORARY TABLE');
eq(rows('SHOW TABLES').map((r) => r[0]), ['ogr', 'yedek'], 'geçici tablo SHOW TABLES\'ta görünmez');
const ex = one('EXPLAIN SELECT * FROM ogr WHERE id = 1');
eq(ex.columns.map((c) => c.name), ['id', 'select_type', 'table', 'partitions', 'type', 'possible_keys', 'key', 'key_len', 'ref', 'rows', 'filtered', 'Extra'], 'EXPLAIN sütunları');
eq([ex.rows[0][4], ex.rows[0][6]], ['const', 'PRIMARY'], 'EXPLAIN birincil anahtar');
eq(one('EXPLAIN SELECT * FROM ogr').rows[0][4], 'ALL', 'EXPLAIN tam tarama');
console.log(`${count - fails}/${count} başarılı`);
process.exit(fails ? 1 : 0);
