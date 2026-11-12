# Temrin CSV Şablonu

Bir temrin tek bir CSV dosyasıyla tanımlanır ve öğretmen ekranındaki **Temrinler** sekmesinden yüklenir. Dosya Excel'de açılıp düzenlenebilir: ayırıcı `;` (`,` de kabul edilir), kodlama UTF-8 (Excel'in Windows-1254 kaydı da okunur). Yükleme sırasında hatalı satırlar satır numarasıyla listelenir.

- `temrin-sablon.csv`: boş şablon
- `temrin-3-donguler.csv`: 11 Donanım B, Temrin 3 (Döngüler) ile doldurulmuş örnek
- `temrin-lab-sql-komutlari.csv`: Laboratuvar temrini (MySQL Workbench; CREATE, INSERT, UPDATE, DELETE)
- `temrin-lab-ado-net.csv`: C# + laboratuvar temrini (MySqlConnection ile listeleme ve parametreli ekleme)

## Sütunlar

| Sütun | Açıklama |
|---|---|
| `tur` | Satırın türü: `bilgi`, `arac`, `islem`, `olcut`, `kontrol`, `soru` |
| `no` | Satırın kodu (`O1`, `K1`, `S1`) ya da bilgi alanının adı |
| `olcut` | Kontrol ve soru satırlarında, puanın yazılacağı ölçütün kodu (`O5`) |
| `puan` | Ölçütün puanı ya da kontrolün/sorunun o ölçütten aldığı pay |
| `tip` | Ölçütün veya kontrolün türü (aşağıda) |
| `hedef` | Kontrolün baktığı yer: kontrol adı, olay, düğme |
| `girdi` | Çalıştırmadan önce yazılacak değerler; çıktı sorusunda kod |
| `beklenen` | Beklenen sonuç |
| `metin` | Ölçüt başlığı, soru metni ya da açıklama |
| `tespit` | Kontrol başarısız olursa temrin sayfasındaki **Tespitler** kısmına yazılacak cümle. Boş bırakılırsa sistem kendisi yazar |

## Satır türleri

**`bilgi`**: Temrin sayfasının başlığı. `no` sütununa alan adı, `metin` sütununa değer yazılır.
Alanlar: `ders`, `temrin_no` (zorunlu, dersteki temrin numarası), `baslik` (tablolarda görünen kısa ad, ör. "Döngüler"; boşsa işlem konusu kullanılır), `sinif`, `islem_konusu`, `proje_adi` (öğrencinin projesinin adı ve isim alanı), `sure_dk` (süre ölçütü için), `ogretmen`.
İsteğe bağlı puanlama alanları (yazılmazsa varsayılan geçerlidir):
- `bicim_kesintisi` (varsayılan `0`): Mantık doğru ama çıktı biçimi farklı olduğunda kesilecek puan.
- `ad_kesintisi` (varsayılan `0`): Kontrol adı farklı olup aynı işi gören kontrol bulunduğunda kesilecek puan.
- `ogretmen_onayi` (`Evet`/`Hayır`, varsayılan `Hayır`): Otomatik puan yalnızca öneri olarak gösterilir, öğretmen onaylayınca kesinleşir.

Laboratuvar alanları (aşağıda **Laboratuvar temrinleri**):
- `ortam`: `studyo` (C# Form Stüdyosu), `laboratuvar` (MySQL simülatörü) ya da `ikisi`. Yazılmazsa kontrollerden anlaşılır.
- `lab_kurulum` (`hazır`/`kendisi`, varsayılan `hazır`): `hazır` ise MySQL Server ve Workbench kurulu gelir. Kurulum temrini için `kendisi`.
- `lab_sifre` (varsayılan `1234`): Hazır kurulumda MySQL root şifresi.

**`arac`** ve **`islem`**: "Kullanılan Araç / Gereç…" ve "Yapılacak İşlemler" maddeleri. Sıra `no` sütunundadır.

**`olcut`**: Temrin sayfasındaki değerlendirme satırı. Ölçüt puanlarının toplamı **100** olmalıdır. `tip` değeri:

| `tip` | Puanı kim verir |
|---|---|
| `ogretmen` | Öğretmen elle girer (İSG, araç-gereç) |
| `sure` | Sistem: `sure_dk` içinde teslim edilirse tam puan |
| `otomatik` | Sistem: altındaki kontrol ve soruların toplamı |

**`kontrol`**: Öğrencinin projesi üzerinde yapılan otomatik denetim. Bir ölçütün altında birden çok kontrol olabilir. Kontrollerin `puan` toplamı ölçüt puanına eşit olmalıdır. Böylece **bir program içinde birden çok kazanım** ayrı ayrı puanlanır.

**`hazirlik`**: Laboratuvar temrininde öğrencinin laboratuvarı ilk açıldığında çalışacak SQL (başlangıç veritabanı, tablolar, kayıtlar). `metin` sütununa yazılır; birden çok satır olabilir.

**`soru`**: Programdan ayrı yazılı soru. Bir ölçütün altına bağlanır, puanı o ölçüte eklenir.

Kontrol ve sorular yalnızca `otomatik` ölçütlere bağlanabilir ve ölçüt satırından **sonra** gelmelidir. `not` türündeki satırlar yok sayılır (açıklama yazmak için).

## Kontrol tipleri

| `tip` | `hedef` | `girdi` | `beklenen` | Örnek |
|---|---|---|---|---|
| `derleme` | | | | Proje hatasız derleniyor mu |
| `kontrol_var` | Kontrol adı (birden çoksa `;` ile; puan adlara bölünür) | | Kontrol türü | `txtN` → `TextBox` |
| `kod_yapisi` | Olay (`btnFor.Click`), metot adı ya da `*` (tüm proje) | | `for`, `while`, `do` (do-while), `foreach`, `break`, `continue`, `if`, `else`, `else if`, `switch`, `try`, `return`. Birden çoksa `;` ile, hepsi aranır. Eşdeğerler `\|` ya da `veya` ile: `for\|foreach\|while` | `btnFor.Click` içinde `for` var mı |
| `kod_icerir` | Olay ya da `*` | | Aranacak kod parçası (boşluklar ve `this.` önemsenmez). Eşdeğerler alt satırda ya da ` veya ` ile; `*` herhangi bir ad | `*.Items.Clear()` |
| `calistir` | Basılacak düğmeler, sırayla (`btnFor;btnFor`) | Önce yazılacak değerler (`txtN=5; txtM=2`) | Sonuç (aşağıda) | `txtN=5` → `lstSonuc=1\|2\|3\|4\|5` |

`calistir` için `beklenen` yazımı:
- İşleç karşılaştırma biçimini seçer: `=` **esnek** (varsayılan), `==` **birebir**, `~=` **içerir**.
- `||` ile birden çok durum yazılır. `girdi` sütununda da aynı sayıda durum olmalıdır, ör. `txtN=5 || txtN=2` → `lstSonuc=1|2|3|4|5 || lstSonuc=1|2`. Puan, geçen durum sayısıyla orantılıdır.
- `lstSonuc=1|2|3`: ListBox/ComboBox öğeleri sırayla. `lstSonuc=` boş liste demektir.
- `lblSonuc=Pozitif`: Label/TextBox metni
- `MessageBox=Pozitif`: Gösterilen mesaj kutusunun metni
- `hatasiz`: Düğmeler çalışma hatası (exception) vermeden çalışmalı

Olaylar `hedef` sütununda **düğme adıyla** (`btnFor.Click`) yazılır, metot adıyla yazılmaz. Öğrenci metodun adını değiştirse de sistem tasarımcıdaki bağlantıdan doğru metodu bulur. Formun kendi olayları için `this.Load` yazılır. Olay metodunun aynı projede çağırdığı metotlar da (3 kademeye kadar) aranır; öğrenci döngüyü bir yardımcı metoda koysa da bulunur.

`calistir` nasıl çalışır:
- Her `calistir` kontrolü programı **baştan** başlatır, testler birbirini etkilemez.
- Önce `girdi` değerleri yazılır (TextBox metni, NumericUpDown değeri, CheckBox/RadioButton için `true`/`false`), sonra `hedef` düğmelerine sırayla basılır.
- Mesaj kutuları "Tamam"/"Evet" ile kapanır, InputBox varsayılan değeri döndürür.
- Bir tıklama 3 saniyeden uzun sürerse (sonsuz döngü) program durdurulur ve kontrol kalır.
- Çalışma hatası (ör. `FormatException`) olursa kontrol kalır ve hata tespite yazılır.

### Esnek karşılaştırma (mantık önce)

`=` ile yazılan beklenen değerde biçim farkları puan kırmaz:
- Boşluk, büyük-küçük harf (Türkçe İ/ı dahil) ve ayraçlar (`,` `.` `:` `-`) önemsenmez.
- Ondalık virgül ve nokta aynıdır: `72,5` = `72.5`.
- Ek metin kabul edilir: `Ortalama: 72,5` beklenirken `Sınıfın not ortalaması: 72,5 puan` geçer.
- **Sayılar her zaman birebir aynı olmalıdır.** Fazla ya da eksik sayı, yanlış sayı ya da beklenmeyen "değil" sonucu yanlış yapar.

Biçim farkı olan sonuç geçer; fark Tespit'e not olarak yazılır, `bicim_kesintisi` kadar puan kesilir. `~=` (içerir) modunda beklenen değerin çıktıda geçmesi yeter, not düşülmez. Eski davranış için `==` kullanın.

### Kontrol adları

Öğrenci kontrolün adını farklı yazarsa:
- **Yazım farkı** (`lbl_sonuc`, `LblSonuc`): kontrol bulunur, tam puan, Tespit'e not düşülür.
- **Ad farkı** (`button1`): sistem kontrolü önekten türüne, metnine, olay metodunun adına ya da formdaki tek kontrolden bulur. `calistir` ve `kod_yapisi` bulduğu kontrolle çalışır, Tespit'e "Ad farkı" yazılır, `ad_kesintisi` kadar kesilir. `kontrol_var` o ad için yarım puan verir.
- Aynı türden birden çok aday varsa sistem tahmin etmez; kontrol bulunamadı sayılır.

### Kısmi puan

Kontrolün puanı alt parçalarına bölünür: `kontrol_var`'da adlar, `kod_yapisi`'nda `;` grupları, `calistir`'da `||` durumları. Puan = kontrol puanı × geçen oranı (yuvarlanır) − kesinti. Tam puan almayan her kontrolün nedeni Tespit'e yazılır.

Derlenmeyen projede `kod_yapisi` ve `kod_icerir` yine çalışır (yalnızca kodu okurlar); `kontrol_var` ve `calistir` "derlenmediği için denetlenemedi" ile kalır.

## Laboratuvar temrinleri

C# Form Stüdyosu'nun **Laboratuvar Simülatörü** (sanal Windows masaüstü: MySQL Installer, MySQL Workbench, Command Line Client, yedekleme, Setup) temrin ortamı olarak kullanılabilir. Arka planda tarayıcıda çalışan, MySQL gibi davranan bir SQL motoru vardır.

- **Her öğrencinin her temrinde ayrı laboratuvarı vardır.** Öğrencinin başka derslerde ya da temrinlerde yaptıkları bu temrini etkilemez.
- `ortam` `laboratuvar` ise öğrenci temrini açınca laboratuvar ekranı gelir: solda sanal masaüstü, sağda görev ve sorular paneli. Teslim buradan yapılır.
- `ortam` `ikisi` ise öğrenci C# Form Stüdyosu'nda çalışır, **🧪 Laboratuvar** düğmesiyle laboratuvarı açar. Programın `MySqlConnection` ile bağlandığı veritabanı bu laboratuvardır. Teslim Stüdyo'dan yapılır.
- Laboratuvar ilk açıldığında MySQL hazır kurulur (`lab_kurulum`) ve `hazirlik` SQL'i çalışır. Bu bir kez yapılır.
- Teslimden sonra laboratuvar değiştirilemez. Veritabanları öğrencinin tarayıcısında denetlenir; **Teslimleri doğrula** öğrencinin laboratuvarını sunucudan alıp öğretmenin tarayıcısında yeniden denetler. Öğretmen öğrencinin laboratuvarını **Çalışmayı aç** ile salt okunur açar.
- C# programı test edilirken (`calistir`) her kontrol laboratuvarın teslim anındaki hâlinden başlar; programın eklediği ya da sildiği kayıtlar kaydedilmez ve sonraki kontrolü etkilemez.

### Laboratuvar kontrol tipleri

| `tip` | `hedef` | `girdi` | `beklenen` | Puanlama |
|---|---|---|---|---|
| `mysql_kurulu` | | | | MySQL kurulu ve yapılandırılmış (hizmet durmuşsa yarım puan) |
| `vt_var` | Veritabanı (`;` ile birden çok) | | | Her veritabanı ayrı puanlanır |
| `tablo_var` | `vt.tablo` (`;` ile birden çok) | | | Her tablo ayrı puanlanır |
| `sutun_var` | `vt.tablo.sutun` (`;` ile birden çok) | | Tür ve özellikler (isteğe bağlı): `int pk ai`, `varchar(50) nn`, `decimal(10,2)`. Özellikler: `pk`, `nn`, `ai`, `uq`, `un`, `null` | Sütun yoksa 0; var ama türü/özelliği farklıysa yarım puan |
| `kayit_sayisi` | `vt.tablo` | | `4`, `>=5`, `<=10`, `3-10` | |
| `iliski_var` | `vt.tablo` (yabancı anahtarın olduğu tablo) | | Başvurulan tablo (isteğe bağlı) | |
| `sql_dogru` | Veritabanı | `SELECT` sorgusu | | İlk hücre 0/boş/NULL değilse geçer: `SELECT COUNT(*) = 4 FROM personel` |
| `sql_sonuc` | Veritabanı | `SELECT` sorgusu | Beklenen satırlar, `\|` ile: `Ali 7000\|Ayşe 5500` | Satır sayısı aynı, satırlar esnek karşılaştırılır (sıra farklıysa da kabul) |
| `yedek_alindi` | `vt` ya da `vt.tablo` (boş: herhangi biri) | | | Belgeler klasöründe Data Export ile alınmış `.sql` yedeği |
| `kullanici_var` | MySQL kullanıcı adı (`;` ile birden çok) | | | |

- Denetim sorguları root olarak, öğrencinin veritabanında çalışır; öğrencinin yetkisi ya da Safe Updates ayarı etkilemez.
- `sql_sonuc` sonucu esnek karşılaştırır: `5500.00` ile `5500`, `ayşe demir` ile `Ayşe Demir` aynıdır. Sayılar birebir aynı olmalıdır.
- Mantık hatasını yakalamak için tablonun **tamamına** bakın: `UPDATE ... WHERE` unutulursa yalnızca istenen satırlara bakan sorgu bunu görmez.
- Workbench'te yapılan işlemler (hangi düğmeye basıldığı, hangi sorgunun yazıldığı) denetlenmez; yalnızca sonuç, yani veritabanının son hâli denetlenir. Kurulum adımları için `mysql_kurulu` ve `ogretmen` ölçütü kullanılır.

## Soru tipleri

| `tip` | `girdi` | `beklenen` | Puanlama |
|---|---|---|---|
| `cikti` | C# kodu (hücre içinde Alt+Enter ile alt satır). `Main` yoksa kod `Main` içine yerleştirilir | Beklenen çıktı. Boş bırakılırsa yüklemeden sonra Temrinler sekmesindeki **Çıktıları hesapla** düğmesi kodu çalıştırıp bulur | Otomatik, esnek: boşluk, büyük-küçük harf ve ayraç farkı önemsenmez; sayılar aynı olmalı |
| `coktan` | Seçenekler: `A) …\|B) …\|C) …` | Doğru seçenek harfi | Otomatik |
| `acik` | | İpucu anahtar kelimeler (`\|` ile) | Öğretmen puanlar; anahtar kelimeler öğretmene ipucu olarak gösterilir |

## Akış

1. Öğretmen CSV'yi yükler; sistem satırları ve puan toplamlarını denetler. Temrini sınıfına açar.
2. Öğrenci portaldan girer, projeyi yazar, programı istediği kadar çalıştırıp dener, soruları cevaplar.
3. **Teslim et** dendiğinde kontroller çalışır. Öğrenci sonucu ve eksiklerini görür; projeyi çalıştırmaya devam edebilir ama değiştirip yeniden teslim edemez.
4. Öğretmen `ogretmen` ölçütlerini ve `acik` soruları puanlar, teslimleri doğrular. Her öğrenci için temrin sayfası yazdırılabilir.

### Öğretmen onayı

`ogretmen_onayi` `Evet` ise (ya da Temrinler sekmesindeki **Öğretmen onayı** düğmesiyle açılırsa), otomatik puan öğrenciye ve tabloya "öneri" olarak görünür. Öğretmen puan penceresinde **Onayla** ile tek tıkla kesinleştirir ya da puanı değiştirir. Otomatik ölçütte önerilenden farklı puan için **gerekçe** zorunludur; gerekçe öğrenciye ve temrin sayfasına "Öğretmen: …" olarak yazılır. Yeniden değerlendirmede sonuç değişirse onay düşer.

Teslim almış bir temrinin tanımı değiştirilemez; düzeltme gerekiyorsa yeni bir temrin numarasıyla yükleyin ya da temrini silip yeniden yükleyin. Silmek için onay penceresine **TEMRİN SİL** yazılır; çalışmalar ve puanlar da silinir.
