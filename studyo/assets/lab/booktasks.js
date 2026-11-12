// Kitaptaki (NTP 6. Öğrenme Birimi: Veri Tabanı İşlemleri) hazır görevler.
// Her adım, denetimleri (checks) sağlanınca otomatik tamamlanır.

const PERSONEL_COLS = [
  ['personel_id', 'int', 'pk,ai'], ['ad_soyad', 'varchar', 'nn'], ['cinsiyet', 'varchar', 'nn'], ['departman', 'varchar', 'nn'],
  ['giris_tarihi', 'date', 'nn'], ['maas', 'decimal(7,2)', 'nn'], ['eposta', 'varchar', 'null'],
];

export const BOOK_TASKS = [
  {
    key: 'kitap-kurulum', book: true, title: '6.1 MySQL Kurulumu',
    intro: 'MySQL Server ve MySQL Workbench programlarını kitaptaki adımlarla kurun.',
    steps: [
      { id: 'indir', title: 'MySQL kurulum dosyasını indirin', help: 'Masaüstündeki İnternet Tarayıcısı ile mysql.com > DOWNLOADS > "MySQL Community (GPL) Downloads" > "MySQL Installer for Windows" sayfasına gidin. Büyük (285 MB) dosyanın yanındaki Download düğmesine, sonra "No thanks, just start my download." bağlantısına tıklayın. (Güncel sürüm modunda: "MySQL Community Server" sayfasından MSI Installer.)', checks: [{ type: 'download', kinds: ['installer80', 'server84'] }] },
      { id: 'urunler', title: 'Developer Default ile ürünleri kurun', help: 'İndirilen .msi dosyasını açın (Dosya Gezgini > İndirilenler). "Developer Default" seçip Next, sonra Execute ile bileşenleri kurun. (Güncel sürümde: MSI sihirbazında Typical kurulum.)', checks: [{ type: 'products', products: ['server'] }] },
      { id: 'ayarlar', title: 'Sunucu ayarlarını yapıp uygulayın', help: 'Type and Networking: değişiklik yapmadan Next. Authentication Method: "Use Strong Password Encryption". Accounts and Roles: root şifresi belirleyin (unutmayın!). Windows Service: değişiklik yapmadan Next. Apply Configuration: Execute.', checks: [{ type: 'installed' }] },
      { id: 'check', title: 'Connect To Server: "Connection succeeded"', help: 'Connect To Server ekranında root şifrenizi yazıp Check düğmesine basın. (Güncel sürümde bu ekran yoktur: Başlat menüsündeki MySQL Command Line Client ile root şifrenizle giriş yapın.)', checks: [{ type: 'any', any: [{ type: 'flag', flag: 'installer-check' }, { type: 'flag', flag: 'cli-login' }, { type: 'connected' }] }] },
      { id: 'workbench', title: 'Workbench ile sunucuya bağlanın', help: 'Kurulum bitince MySQL Workbench açılır (açılmazsa masaüstünden açın). "Local instance MySQL80" kutusuna tıklayıp root şifrenizi girin. (Güncel sürümde Workbench\'i ayrıca indirip kurun.)', checks: [{ type: 'workbench' }, { type: 'connected' }] },
    ],
  },
  {
    key: 'kitap-workbench', book: true, title: '6.1.4 Workbench Arayüzü',
    intro: 'MySQL Workbench ekranını tanıyın.',
    steps: [
      { id: 'vault', title: 'Şifreyi "Save password in vault" ile kaydedin', help: 'Workbench\'te bağlantıyı kapatıp (sekmedeki ×) Home ekranından yeniden açın. Şifre penceresinde "Save password in vault" kutusunu işaretleyin.', checks: [{ type: 'saved_password' }] },
      { id: 'status', title: 'Server Status ekranını açın', help: 'Soldaki Navigator\'ın altındaki "Administration" sekmesine geçip "Server Status"a tıklayın.', checks: [{ type: 'flag', flag: 'admin:status' }] },
      { id: 'version', title: 'Sorgu sekmesinde SELECT VERSION(); çalıştırın', help: 'Araç çubuğundaki "SQL+" simgesiyle yeni sorgu sekmesi açın, SELECT VERSION(); yazıp şimşek (Execute) simgesine tıklayın. Sonuç Result Grid\'de, işlem Output bölümünde görünür.', checks: [{ type: 'query_matches', pattern: 'select\\s+version\\s*\\(\\s*\\)' }] },
    ],
  },
  {
    key: 'kitap-veritabani', book: true, title: '6.2 Veritabanı Oluşturma',
    intro: 'SQL komutuyla ve arayüzle veritabanı (schema) oluşturun ve silin.',
    steps: [
      { id: 'create', title: 'sirketdb veritabanını oluşturun', help: 'Sorgu ekranına CREATE DATABASE sirketdb; yazıp çalıştırın. Navigator\'daki SCHEMAS yanında yenileme simgesine tıklayınca görünür.', hint: 'CREATE DATABASE sirketdb;', checks: [{ type: 'db_exists', db: 'sirketdb' }] },
      { id: 'deneme', title: 'Sıra Sizde: deneme_vt veritabanını oluşturun', help: 'Bu kez araç çubuğundaki "Create a new schema" simgesini kullanın: Name kutusuna deneme_vt yazıp Apply > Apply > Finish.', checks: [{ type: 'db_exists', db: 'deneme_vt' }] },
      { id: 'drop', title: 'deneme_vt veritabanını silin', help: 'Navigator\'da deneme_vt üzerine sağ tıklayıp "Drop Schema..." > "Drop Now" ya da DROP DATABASE deneme_vt; komutu.', checks: [{ type: 'db_not_exists', db: 'deneme_vt' }] },
      { id: 'default', title: 'sirketdb\'yi varsayılan veritabanı yapın', help: 'Navigator\'da sirketdb\'ye çift tıklayın (kalın yazılır) ya da USE sirketdb; komutunu çalıştırın.', checks: [{ type: 'query_matches', pattern: '^use\\s+`?sirketdb`?' }] },
    ],
  },
  {
    key: 'kitap-tablo', book: true, title: '6.3 Tablo Oluşturma: personel',
    intro: 'sirketdb içinde personel tablosunu oluşturup kayıt girin.',
    steps: [
      {
        id: 'personel', title: 'personel tablosunu oluşturun',
        help: 'Alanlar: personel_id (INT, PK, AI), ad_soyad (VARCHAR, NN), cinsiyet (VARCHAR, NN), departman (VARCHAR, NN), giris_tarihi (DATE, NN), maas (DECIMAL(7,2), NN), eposta (VARCHAR, boş geçilebilir). SQL ile ya da Tables > Create Table... ekranıyla oluşturabilirsiniz.',
        hint: 'CREATE TABLE personel (\n  personel_id INT NOT NULL AUTO_INCREMENT,\n  ad_soyad VARCHAR(45) NOT NULL,\n  cinsiyet VARCHAR(5) NOT NULL,\n  departman VARCHAR(45) NOT NULL,\n  giris_tarihi DATE NOT NULL,\n  maas DECIMAL(7,2) NOT NULL,\n  eposta VARCHAR(45) NULL,\n  PRIMARY KEY (personel_id));',
        checks: PERSONEL_COLS.map(([column, columnType, flags]) => ({ type: 'column', db: 'sirketdb', table: 'personel', column, columnType, flags })),
      },
      { id: 'grid', title: 'Select Rows ile en az 3 kayıt girin', help: 'personel tablosuna sağ tıklayıp "Select Rows - Limit 1000". Result Grid\'in en altındaki boş satıra çift tıklayarak kayıt girin (personel_id boş kalabilir: otomatik artar), sonra Apply > Apply > Finish.', checks: [{ type: 'row_count', db: 'sirketdb', table: 'personel', min: 3 }] },
      { id: 'musteri', title: 'Sıra Sizde: musteri tablosu', help: 'sirketdb içinde müşterinin adı, soyadı, cinsiyeti, adresi, doğum tarihi, telefonu ve şehri tutulacak "musteri" tablosunu oluşturun (doğum tarihi DATE olsun).', checks: [{ type: 'table_exists', db: 'sirketdb', table: 'musteri' }, { type: 'columns_min', db: 'sirketdb', table: 'musteri', count: 7 }, { type: 'has_type', db: 'sirketdb', table: 'musteri', colType: 'date' }] },
    ],
  },
  {
    key: 'kitap-sql', book: true, title: '6.4 SQL Komutları: INSERT ve SELECT',
    intro: 'personel tablosuna veri ekleyip sorgular yazın. Sonuçlar sizin verinize göre denetlenir.',
    steps: [
      { id: 'insert', title: 'Tek sorguda birden fazla kayıt ekleyin (en az 8 kayıt olsun)', help: 'INSERT INTO personel (ad_soyad, cinsiyet, departman, giris_tarihi, maas, eposta) VALUES (...), (...), ...; Output\'ta "n row(s) affected Records: n" görünür. Departmanlar: Bilişim Teknolojileri, Muhasebe, Üretim, Satış, İnsan Kaynakları...', checks: [{ type: 'query_matches', pattern: '^insert\\s+into\\s+`?(sirketdb`?\\.`?)?personel', minAffected: 2 }, { type: 'row_count', db: 'sirketdb', table: 'personel', min: 8 }] },
      { id: 'all', title: 'Tüm kayıtları listeleyin', help: 'SELECT * FROM personel;', checks: [{ type: 'query_result', db: 'sirketdb', sql: 'SELECT * FROM personel' }] },
      { id: 'bt', title: '"Bilişim Teknolojileri" departmanındakileri listeleyin', help: 'WHERE ile koşul yazın.', checks: [{ type: 'query_result', db: 'sirketdb', sql: "SELECT * FROM personel WHERE departman = 'Bilişim Teknolojileri'", mention: 'where' }] },
      { id: 'erkek', title: 'Sıra Sizde: Erkek personeli listeleyin', help: 'cinsiyet alanına göre koşul yazın (verinizde erkekler nasıl yazıldıysa: E ya da Erkek).', checks: [{ type: 'query_result', db: 'sirketdb', sql: "SELECT * FROM personel WHERE cinsiyet IN ('E', 'Erkek')", mention: 'cinsiyet' }] },
      { id: 'tarih', title: '2018-01-01\'den sonra işe başlayanların ad_soyad, giris_tarihi ve maas bilgileri', help: 'Tarihleri tırnak içinde \'YYYY-AA-GG\' biçiminde yazın.', checks: [{ type: 'query_result', db: 'sirketdb', sql: "SELECT ad_soyad, giris_tarihi, maas FROM personel WHERE giris_tarihi > '2018-01-01'", mention: 'giris_tarihi' }] },
      { id: 'count', title: 'Bilişim Teknolojileri departmanındaki personel sayısı (COUNT)', checks: [{ type: 'query_result', db: 'sirketdb', sql: "SELECT COUNT(*) FROM personel WHERE departman = 'Bilişim Teknolojileri'", mention: 'count' }] },
      { id: 'sum', title: 'Erkek personelin maaşları toplamı (SUM)', checks: [{ type: 'query_result', db: 'sirketdb', sql: "SELECT SUM(maas) FROM personel WHERE cinsiyet IN ('E', 'Erkek')", mention: 'sum' }] },
      { id: 'avg', title: 'Ortalama maaş (AVG)', checks: [{ type: 'query_result', db: 'sirketdb', sql: 'SELECT AVG(maas) FROM personel', mention: 'avg' }] },
      { id: 'like', title: 'ad_soyad alanı "M" harfiyle başlayanlar (LIKE)', checks: [{ type: 'query_result', db: 'sirketdb', sql: "SELECT * FROM personel WHERE ad_soyad LIKE 'M%'", mention: 'like' }] },
      { id: 'order', title: 'Personeli maaşa göre büyükten küçüğe sıralayın', checks: [{ type: 'query_result', db: 'sirketdb', sql: 'SELECT * FROM personel ORDER BY maas DESC', mention: 'order\\s+by', ordered: 'evet' }] },
    ],
  },
  {
    key: 'kitap-guncelle', book: true, title: '6.4.9–10 UPDATE ve DELETE',
    intro: 'Kayıt güncelleme ve silme; Workbench\'in güvenli güncelleme (Safe Updates) koruması.',
    steps: [
      { id: 'one', title: 'Bir personelin maaşını birincil anahtara göre güncelleyin', help: 'UPDATE personel SET maas = 9500 WHERE personel_id = 8;', checks: [{ type: 'query_matches', pattern: '^update\\s+`?(sirketdb`?\\.`?)?personel`?\\s+set\\b.*\\bwhere\\b.*personel_id', minAffected: 1 }] },
      { id: 'safe', title: 'Koşulsuz güncellemede 1175 hatasını görün', help: 'UPDATE personel SET maas = maas * 1.2; çalıştırın. Workbench, WHERE\'de anahtar sütun olmadığı için Error Code: 1175 verir.', checks: [{ type: 'error_seen', code: 1175 }] },
      { id: 'pref', title: 'Safe Updates seçeneğini kapatıp yeniden bağlanın', help: 'Edit > Preferences > SQL Editor > "Safe Updates" kutusunu kaldırın, OK. Sonra Query > Reconnect to Server.', checks: [{ type: 'safe_updates_off' }] },
      { id: 'zam', title: 'Tüm personelin maaşına %20 zam yapın', help: 'UPDATE personel SET maas = maas * 1.2;', checks: [{ type: 'query_matches', pattern: '^update\\s+`?(sirketdb`?\\.`?)?personel`?\\s+set\\s+`?maas`?\\s*=\\s*`?maas`?\\s*\\*\\s*1\\.2', minAffected: 1 }] },
      { id: 'dep', title: 'Sıra Sizde: "Bilişim Teknolojileri" adını "Bilgi Teknolojileri" yapın', checks: [{ type: 'sql_true', db: 'sirketdb', sql: "SELECT (SELECT COUNT(*) FROM personel WHERE departman = 'Bilişim Teknolojileri') = 0 AND (SELECT COUNT(*) FROM personel WHERE departman = 'Bilgi Teknolojileri') > 0" }] },
      { id: 'del', title: 'Sıra Sizde: Üretim departmanındaki personeli silin', checks: [{ type: 'query_matches', pattern: '^delete\\s+from\\s+`?(sirketdb`?\\.`?)?personel' }, { type: 'sql_true', db: 'sirketdb', sql: "SELECT COUNT(*) = 0 FROM personel WHERE departman = 'Üretim'" }] },
    ],
  },
  {
    key: 'kitap-iliskisel', book: true, title: '6.5 İlişkisel Veritabanı: kutuphane',
    intro: 'Kütüphane Otomasyonu veritabanını tablolar ve ilişkilerle oluşturun.',
    steps: [
      { id: 'db', title: 'kutuphane veritabanını oluşturun', checks: [{ type: 'db_exists', db: 'kutuphane' }] },
      { id: 'tables', title: 'kitaplar, kitap_turleri, ogrenciler ve odunc_kitaplar tablolarını oluşturun', help: 'kitaplar: kitap_id (PK, AI), kitap_adi, yazar, tur_id, sayfa_sayisi...; kitap_turleri: tur_id (PK, AI), tur_adi; ogrenciler: ogrenci_no (PK), ad, soyad, sinif...; odunc_kitaplar: odunc_id (PK, AI), ogrenci_no, kitap_id, alis_tarihi, teslim_tarihi.', checks: [{ type: 'tables_exist', db: 'kutuphane', tables: ['kitaplar', 'kitap_turleri', 'ogrenciler', 'odunc_kitaplar'] }] },
      { id: 'fk1', title: 'kitaplar.tur_id → kitap_turleri ilişkisini kurun', help: 'Kitaptaki yol: Database > Reverse Engineer... ile kutuphane şemasının EER diyagramını açın. Soldaki "Place a Relationship Using Existing Columns" aracıyla önce kitaplar.tur_id (FK), sonra kitap_turleri.tur_id (PK) sütununa tıklayın. İlişkiye çift tıklayıp "Identifying Relationship" seçin, sonra Database > Synchronize Model... ile veritabanına uygulayın. (Alternatif: Alter Table > Foreign Keys ya da ALTER TABLE ... ADD CONSTRAINT.)', checks: [{ type: 'fk_exists', db: 'kutuphane', table: 'kitaplar', ref: 'kitap_turleri' }] },
      { id: 'fk2', title: 'odunc_kitaplar → ogrenciler ve kitaplar ilişkilerini kurun', help: 'Aynı araçla önce odunc_kitaplar.ogrenci_no → ogrenciler.ogrenci_no, sonra odunc_kitaplar.kitap_id → kitaplar.kitap_id ilişkilerini çizip Synchronize Model ile uygulayın.', checks: [{ type: 'fk_exists', db: 'kutuphane', table: 'odunc_kitaplar', ref: 'ogrenciler' }, { type: 'fk_exists', db: 'kutuphane', table: 'odunc_kitaplar', ref: 'kitaplar' }] },
      { id: 'fkerr', title: 'İlişkinin korumasını görün: olmayan bir kitap türüyle kayıt ekleyince 1452 hatası', help: 'Örneğin INSERT INTO kitaplar (kitap_adi, tur_id) VALUES (\'Deneme\', 999); — tur_id 999 olan tür yoksa ekleme yapılmaz.', checks: [{ type: 'error_seen', code: 1452 }] },
    ],
  },
  {
    key: 'kitap-yedek', book: true, title: '6.6 Yedek Alma ve Geri Yükleme',
    intro: 'sirketdb veritabanının yedeğini alıp başka bir veritabanına geri yükleyin.',
    steps: [
      { id: 'export', title: 'Data Export ile sirketdb\'nin yedeğini alın', help: 'Navigator > Administration > Data Export. Tables to Export\'ta sirketdb\'yi işaretleyin, "Export to Self-Contained File" seçin, Start Export. Dosya Belgeler\\dumps klasörüne kaydedilir.', checks: [{ type: 'export_file', db: 'sirketdb', table: 'personel' }] },
      { id: 'import', title: 'Data Import/Restore ile yedeği yeni bir veritabanına yükleyin', help: 'Administration > Data Import/Restore. "Import from Self-Contained File" ile dosyayı seçin, Default Target Schema için New... ile ör. sirketdb_yedek oluşturun, Start Import.', checks: [{ type: 'import_done', table: 'personel', notDb: 'sirketdb' }] },
    ],
  },
];

