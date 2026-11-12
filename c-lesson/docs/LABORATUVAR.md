# Laboratuvar Simülatörü (MySQL, Workbench, Setup)

`lab.html` — NTP 6. öğrenme birimi "Veri Tabanı İşlemleri" konusunu bilgisayara hiçbir şey kurmadan işlemek için sanal bir Windows masaüstü. Stüdyo'daki **Laboratuvar** bağlantısından (ya da IDE'de **Proje ▾ > Laboratuvarı aç**) açılır; aynı oturumu kullanır, her şey sunucuda saklanır.

> Bu bir **simülasyondur**: ekranlar MySQL Installer, MySQL Workbench ve Visual Studio'nun ilgili pencerelerine benzetilmiştir; arkada tarayıcıda çalışan bir SQL motoru (SQLite/sql.js) MySQL gibi davranacak şekilde çalışır.

## Kitaptaki konular ve simülatördeki karşılıkları

| Kitap | Simülatör |
|---|---|
| 6.1 MySQL kurulumu | İnternet Tarayıcısı > mysql.com > DOWNLOADS > MySQL Community (GPL) Downloads > MySQL Installer for Windows > "No thanks, just start my download." → **MySQL Installer 8.0**: Developer Default, Execute, Type and Networking, Authentication Method, Accounts and Roles (root şifresi, Add User), Windows Service, Apply Configuration, Connect To Server (Check → *Connection succeeded*), Installation Complete |
| Güncel sürüm (seçenek) | **MySQL 8.4 LTS** MSI + **MySQL Configurator**, Workbench'in ayrı MSI'ı (Simülatör Ayarları > Sürüm) |
| 6.1.4 Workbench | Bağlantı kutusu, şifre penceresi (*Save password in vault*), Navigator (Schemas / Administration), Information (Object Info / Session), sorgu sekmeleri (şimşek: tümü/seçim, imleçli şimşek: imleçteki komut), Result Grid, Action Output |
| 6.2–6.3 Veritabanı ve tablo | `CREATE DATABASE`, Create Schema, Drop/Alter Schema, Create/Alter Table (PK NN UQ B UN ZF AI G, Default), Indexes ve Foreign Keys sekmeleri, Apply → SQL inceleme → Finish |
| 6.4 SQL komutları | INSERT (çok satırlı), SELECT, WHERE, AND/OR, BETWEEN, LIKE, IN, ORDER BY, LIMIT, GROUP BY/HAVING, COUNT/SUM/AVG/MIN/MAX, UPDATE, DELETE, JOIN; **Safe Updates** (Error Code 1175) ve Edit > Preferences ayarı |
| Select Rows - Limit 1000 | Düzenlenebilir sonuç tablosu: hücreyi değiştir, yeni satır ekle, satır sil → Apply → `UPDATE \`db\`.\`tablo\` ... WHERE (...)` |
| 6.5 İlişkisel veritabanı | Foreign Keys sekmesi ya da kitaptaki yol: **Database > Reverse Engineer** → EER diyagramı → *Place a Relationship Using Existing Columns* → *Identifying Relationship* → **Database > Synchronize Model**. Diyagramda ayrıca yeni tablo yerleştirme, tablo/sütun düzenleme (başlığa çift tıklama), 1:1 ve 1:n (tanımlayıcı / tanımlayıcı olmayan; yabancı anahtar sütununu `tablo_sutun` adıyla ekler) ve n:m (ara tabloyu `a_has_b` adıyla oluşturur) araçları vardır |
| 6.6 Yedek alma / geri yükleme | Administration > **Data Export** (Self-Contained File / Dump Project Folder, Include Create Schema) ve **Data Import/Restore** (Default Target Schema, New...) — mysqldump biçiminde `.sql` dosyaları `Belgeler\dumps` klasörüne yazılır |
| 6.7 ADO.NET | Stüdyo'da **Proje ▾ > Add Reference** (MySql.Data, Connector/NET kuruluysa) ya da **Manage NuGet Packages > MySql.Data**; `MySqlConnection`, `MySqlCommand` (`ExecuteNonQuery/Scalar/Reader`, `Parameters.AddWithValue`), `MySqlDataReader`, `MySqlDataAdapter.Fill(DataTable)` → `DataGridView` |
| 6.8 Kütüphane Otomasyonu | `App.config` (Proje ▾ > App.config ekle) `connectionStrings` + `ConfigurationManager.ConnectionStrings["..."].ConnectionString` |
| 6.8.8 Setup | Proje ▾ > Extensions > Manage Extensions (**Installer Projects**) > Add > New Project (**Setup Project**): Application Folder > Add > Project Output (Primary output), Create Shortcut, User's Desktop / User's Programs Menu, Add > File (ikon), Properties (ProductName, Manufacturer...), **Build** → laboratuvar masaüstünde `setup.exe` + `.msi` → kurulum → masaüstü kısayolundan program açılır (`.exe.config` Not Defteri ile düzenlenebilir). ZIP'te ".NET Framework 4.8" seçilirse Setup projesi `.vdproj` olarak çözüme eklenir (Installer Projects eklentisiyle açılır) |
| 6.9 Entity Framework | Manage NuGet Packages > **MySql.Data.EntityFramework** → Proje ▾ > Add New Item > **ADO.NET Entity Data Model** > EF Designer from database > New Connection (MySQL Database, Test Connection) > hassas veri seçeneği > tablolar → `SirketModel.edmx`, `sirketdbEntities`, tablo sınıfları (ilişkili tablolar için gezinme özellikleri: `kitap.kitap_turleri`, `tur.kitaplar`); LINQ, `FirstOrDefault(p => ...)`, `Add/Remove`, `SaveChanges()`. ZIP'te ".NET Framework 4.8" seçilirse `.edmx` gerçek Visual Studio/EF6 ile açılır |

| Kitap dışı ileri konular | **Saklı yordamlar** (`CREATE PROCEDURE`, `IN/OUT/INOUT`, `CALL`, `DECLARE`, `IF/CASE/WHILE/REPEAT/LOOP`, imleçler, `DECLARE ... HANDLER`, `SIGNAL`), **saklı fonksiyonlar** (`CREATE FUNCTION ... RETURNS`, DETERMINISTIC yoksa MySQL'deki gibi hata 1418), **tetikleyiciler** (`BEFORE/AFTER INSERT/UPDATE/DELETE`, `NEW/OLD`, `SET NEW.sütun`), `DELIMITER` (Workbench, CLI, dump), Workbench'te Stored Procedures / Functions / Triggers düğümleri, Routine editor ve tablo düzenleyicinin **Triggers** sekmesi; C#'ta `CommandType.StoredProcedure` (OUT parametreleri dahil) |
| Diğer SQL | Farklı veritabanlarındaki tabloları birlikte kullanma (`SELECT ... FROM a.t JOIN b.u`), çok tablolu `UPDATE ... JOIN` ve `DELETE t FROM ... JOIN`, `CREATE TABLE ... AS SELECT`, `CREATE TEMPORARY TABLE`, `EXPLAIN` (MySQL tablo biçiminde plan), `SELECT ... INTO @değişken` |
| Workbench ek | Sonuç tablosu **Form Editor** görünümü ve dışa aktarma (CSV, `;` ile CSV, sekmeyle ayrılmış, HTML, JSON, XML, SQL INSERT); **File > New Model** ile boş modelden diyagram çizip **Database > Forward Engineer** ile veritabanı oluşturma; Data Export'ta *Dump Stored Procedures and Functions* ve *Dump Triggers* |

Ayrıca: **MySQL Command Line Client** (Başlat menüsü; `DELIMITER`, `\G` dikey çıktı), Windows **Hizmetler** (MySQL80'i durdur/başlat → bağlantı hatası 2003), Users and Privileges (yetkisiz kullanıcıyla 1142/1044 hataları), Server Status, Startup/Shutdown, Options File.

## Gerçekçilik

- **Şifre gerçek:** Workbench'te, C# bağlantı cümlesinde (`Pwd=`) ve EF bağlantısında kurulumda belirlenen root şifresi yazılmalıdır; yanlışsa MySQL'in hata mesajı gelir. Unutan öğrenci *Simülatör Ayarları* penceresinden şifreyi görebilir ya da sıfırlayabilir.
- MySQL hata kodları ve mesajları birebir: `1146 Table 'x.y' doesn't exist`, `1054 Unknown column`, `1062 Duplicate entry`, `1452/1451` yabancı anahtar, `1406 Data too long`, `1366`, `1292`, `1175`, `1064 ... near '...' at line N`...
- Türkçe karakterli karşılaştırma ve sıralama MySQL'deki `utf8mb4_0900_ai_ci` gibi büyük/küçük harf ve aksan duyarsızdır (`'üretim' = 'Üretim'`, Ç harfi C ile birlikte sıralanır).
- `DECIMAL(7,2)` iki basamaklı gösterilir ve yuvarlanır, tarihler `YYYY-AA-GG` biçimine çevrilir, `AUTO_INCREMENT`, `DEFAULT`, `ENUM`, `CHECK` çalışır.

## Görev modu

Görevler paneli (sağ üst ya da görev çubuğundaki simge) kitaptaki 8 hazır görevi gösterir; her adım öğrencinin yaptığı işlemlere göre **otomatik** işaretlenir (veritabanı/tablo/sütun var mı, sorgu sonucu doğru mu, yedek alındı mı...). *Simülatör Ayarları > Görev modu* kapatılınca serbest çalışılır; kurulum da "MySQL ve Workbench'i hazır kur" ile atlanabilir.

**Öğretmen** panelde *Öğretmen* düğmesini görür:
- **Görevlerim:** Yeni görev yazma (başlık, sınıf, adımlar, her adım için denetimler: veritabanı/tablo/sütun var, kayıt sayısı, yabancı anahtar, denetim sorgusu, öğrencinin SELECT sonucu beklenenle aynı, belirli bir komut çalıştırıldı, belirli bir hata kodu alındı, yedek dosyası alındı...). *Kendi laboratuvarımda dene* ile denetimler öğretmenin kendi verisinde sınanır.
- **Sınıf ilerlemesi:** öğrenci × görev tablosu.
- **Veritabanı dağıt:** öğretmenin laboratuvarındaki bir veritabanını (tablolar + kayıtlar) sınıftaki her öğrencinin MySQL sunucusuna kopyalar.

## Teknik notlar

- Motor: `web/assets/lab/mysql/` (lexer, işlevler, `engine.js`, saklı programlar için `routines.js`). Yordam gövdeleri JavaScript'te yorumlanır; fonksiyonlar SQLite kullanıcı işlevi olarak kaydedilir; tetikleyiciler SQLite tetikleyicilerine çevrilir (`SET NEW` içeren BEFORE tetikleyicisi satırı güncelleyen AFTER tetikleyicisine dönüşür, bu yüzden NOT NULL denetimi tetikleyiciden önce yapılır). Başka veritabanındaki tablolar sorgu sırasında SQLite `ATTACH` ile bağlanır; açık bir işlem (transaction) içinde başka veritabanına erişilemez. Geçici tablolar oturum kapanınca silinir ama simülatörde diğer oturumlardan da görülebilir. Her MySQL veritabanı ayrı bir SQLite dosyasıdır; MySQL tablo tanımları (türler, anahtarlar) veritabanının içinde `__mysql_sim_meta` tablosunda saklanır. Testler: `node tests/lab/engine.test.mjs`.
- Sunucu: `lab_state` (kurulum, dosyalar, kullanıcılar), `lab_databases` (her veritabanı base64 SQLite), `lab_tasks`, `lab_progress` tabloları — ilk istekte otomatik oluşur (şema sürümü 2).
- Ayarlar (`config.php`): `max_lab_db_bytes` (varsayılan 4 MB), `max_lab_dbs_per_user` (40).
- Stüdyo'daki C# programı (MySql.Data / EF) aynı veritabanlarını kullanır; değişiklikler sunucuya kaydedilir ve aynı tarayıcıda açık laboratuvar sekmesiyle eşitlenir.
- Kurulan programlar laboratuvarda .NET motoru yüklenerek çalıştırılır (ilk açılış ~10 MB indirme).
