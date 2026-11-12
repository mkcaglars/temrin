# Temrin oluşturma talimatı: laboratuvar güncellemesi

Bu notu temrin hazırlayan Claude projesine yapıştırın. Önceki talimatlara eklenir; C# Form Stüdyosu temrinleri değişmez. Projeye `temrin-lab-sql-komutlari.csv` ve `temrin-lab-ado-net.csv` örneklerini de ekleyin.

"Veri Tabanı İşlemleri" konularında (MySQL kurulumu, Workbench, CREATE/INSERT/UPDATE/DELETE/SELECT, ilişkiler, yedekleme, ADO.NET) öğrenci **Temrin Laboratuvarı**'nda çalışır: sanal bir Windows masaüstünde MySQL Server, MySQL Workbench ve Command Line Client. Her öğrencinin her temrinde ayrı laboratuvarı vardır; teslimde veritabanlarının **son hâli** otomatik denetlenir.

**Ortamı seç (`bilgi;ortam`):**
- `laboratuvar`: Yalnızca SQL ve Workbench çalışması (C# projesi yok). Yalnızca laboratuvar kontrolleri kullanılır.
- `ikisi`: C# programı laboratuvardaki MySQL'e bağlanır (ADO.NET, `MySqlConnection`). C# kontrolleri (`calistir`...) ve laboratuvar kontrolleri birlikte kullanılabilir. `calistir` her seferinde veritabanının teslim anındaki hâlinden başlar.
- Yazılmazsa kontrollerden anlaşılır.

**Diğer bilgi alanları:** `lab_kurulum` = `hazır` (varsayılan: MySQL ve Workbench kurulu gelir) ya da `kendisi` (kurulum temrini: öğrenci MySQL Installer ile kurar). `lab_sifre` = hazır kurulumdaki root şifresi (varsayılan `1234`); Yapılacak İşlemler'de öğrenciye söyle.

**Başlangıç verisi:** `tur=hazirlik` satırının `metin` sütununa SQL yaz (tırnak içinde, birden çok satır olabilir). Öğrencinin laboratuvarı ilk açıldığında bir kez çalışır. Öğrenci var olan bir veritabanı üzerinde çalışacaksa (UPDATE, DELETE, SELECT, ADO.NET) bunu kullan.

**Laboratuvar kontrol tipleri:**

| tip | hedef | girdi | beklenen |
|---|---|---|---|
| `mysql_kurulu` | – | – | – (kurulum temrini) |
| `vt_var` | veritabanı (`;` ile birden çok) | – | – |
| `tablo_var` | `vt.tablo` (`;` ile birden çok) | – | – |
| `sutun_var` | `vt.tablo.sutun` (`;` ile birden çok) | – | isteğe bağlı tür + özellik: `int pk ai`, `varchar(50) nn`, `decimal(10,2)`; özellikler `pk nn ai uq un null` |
| `kayit_sayisi` | `vt.tablo` | – | `4`, `>=5`, `<=10`, `3-10` |
| `iliski_var` | `vt.tablo` (yabancı anahtarın olduğu) | – | başvurulan tablo (isteğe bağlı) |
| `sql_dogru` | veritabanı | `SELECT` (ilk hücre 0 değilse geçer) | – |
| `sql_sonuc` | veritabanı | `SELECT` | beklenen satırlar `\|` ile; bir satırın hücreleri boşlukla: `Ali Yılmaz 7000\|Ayşe Demir 5500` |
| `yedek_alindi` | `vt` ya da `vt.tablo` (boş: herhangi) | – | – |
| `kullanici_var` | MySQL kullanıcı adı | – | – |

**Kurallar:**
- Kontroller **sonucu** denetler, yapılan tıklamaları ya da yazılan sorguyu denetlemez. "Workbench'te Create Schema ile oluşturur" gibi yöntem kazanımlarını `ogretmen` ölçütü yap.
- Denetim sorguları root olarak çalışır. `sql_sonuc` esnektir: `5500.00` = `5500`, büyük/küçük harf önemsiz; sayılar birebir aynı olmalı. Sorguya `ORDER BY` koy.
- **Mantık hatasını yakala:** UPDATE/DELETE için tablonun **tamamına** bak (`SELECT ad, maas FROM personel ORDER BY id`). Yalnızca istenen satırlara bakarsan WHERE'siz UPDATE de geçer.
- Veritabanı, tablo ve sütun adlarını Yapılacak İşlemler'de **aynen** ver; kontroller bu adlarla arar (büyük/küçük harf önemsiz).
- Workbench'te Safe Updates açıktır: anahtar olmayan sütunla WHERE yazan UPDATE/DELETE 1175 hatası verir. Bunu Yapılacak İşlemler'de belirt (kitaptaki gibi: Edit > Preferences > SQL Editor).
- `ikisi` temrininde bağlantı cümlesini ver: `Server=localhost;Database=…;Uid=root;Pwd=1234;` ve MySql.Data paketinin eklenmesini (Proje > Manage NuGet Packages) bir işlem maddesi yap. `calistir` ile programın veritabanından okuduğu ve yazdığı sonucu test et (ör. `btnEkle;btnListele` → `lstPersonel=…`).
- Örnekler: `sablon/temrin-lab-sql-komutlari.csv` (laboratuvar), `sablon/temrin-lab-ado-net.csv` (ikisi).
