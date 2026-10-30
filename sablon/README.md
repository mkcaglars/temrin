# Temrin CSV Şablonu

Bir temrin tek bir CSV dosyasıyla tanımlanır ve öğretmen ekranındaki **Temrinler** sekmesinden yüklenir. Dosya Excel'de açılıp düzenlenebilir: ayırıcı `;` (`,` de kabul edilir), kodlama UTF-8 (Excel'in Windows-1254 kaydı da okunur). Yükleme sırasında hatalı satırlar satır numarasıyla listelenir.

- `temrin-sablon.csv`: boş şablon
- `temrin-3-donguler.csv`: 11 Donanım B, Temrin 3 (Döngüler) ile doldurulmuş örnek

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

**`arac`** ve **`islem`**: "Kullanılan Araç / Gereç…" ve "Yapılacak İşlemler" maddeleri. Sıra `no` sütunundadır.

**`olcut`**: Temrin sayfasındaki değerlendirme satırı. Ölçüt puanlarının toplamı **100** olmalıdır. `tip` değeri:

| `tip` | Puanı kim verir |
|---|---|
| `ogretmen` | Öğretmen elle girer (İSG, araç-gereç) |
| `sure` | Sistem: `sure_dk` içinde teslim edilirse tam puan |
| `otomatik` | Sistem: altındaki kontrol ve soruların toplamı |

**`kontrol`**: Öğrencinin projesi üzerinde yapılan otomatik denetim. Bir ölçütün altında birden çok kontrol olabilir. Kontrollerin `puan` toplamı ölçüt puanına eşit olmalıdır. Böylece **bir program içinde birden çok kazanım** ayrı ayrı puanlanır.

**`soru`**: Programdan ayrı yazılı soru. Bir ölçütün altına bağlanır, puanı o ölçüte eklenir.

Kontrol ve sorular yalnızca `otomatik` ölçütlere bağlanabilir ve ölçüt satırından **sonra** gelmelidir. `not` türündeki satırlar yok sayılır (açıklama yazmak için).

## Kontrol tipleri

| `tip` | `hedef` | `girdi` | `beklenen` | Örnek |
|---|---|---|---|---|
| `derleme` | | | | Proje hatasız derleniyor mu |
| `kontrol_var` | Kontrol adı (birden çoksa `;` ile) | | Kontrol türü | `txtN` → `TextBox` |
| `kod_yapisi` | Olay (`btnFor.Click`), metot adı ya da `*` (tüm proje) | | `for`, `while`, `do` (do-while), `foreach`, `break`, `continue`, `if`, `else`, `else if`, `switch`, `try`, `return`. Birden çoksa `;` ile, hepsi aranır | `btnFor.Click` içinde `for` var mı |
| `kod_icerir` | Olay ya da `*` | | Aranacak kod parçası (boşluklar önemsenmez) | `lstSonuc.Items.Clear()` |
| `calistir` | Basılacak düğmeler, sırayla (`btnFor;btnFor`) | Önce yazılacak değerler (`txtN=5; txtM=2`) | Sonuç (aşağıda) | `txtN=5` → `lstSonuc=1\|2\|3\|4\|5` |

`calistir` için `beklenen` yazımı:
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

Derlenmeyen projede `kod_yapisi` ve `kod_icerir` yine çalışır (yalnızca kodu okurlar); `kontrol_var` ve `calistir` "derlenmediği için denetlenemedi" ile kalır.

## Soru tipleri

| `tip` | `girdi` | `beklenen` | Puanlama |
|---|---|---|---|
| `cikti` | C# kodu (hücre içinde Alt+Enter ile alt satır). `Main` yoksa kod `Main` içine yerleştirilir | Beklenen çıktı. Boş bırakılırsa yüklemeden sonra Temrinler sekmesindeki **Çıktıları hesapla** düğmesi kodu çalıştırıp bulur | Otomatik: satırlar karşılaştırılır (satır sonundaki boşluklar ve sondaki boş satırlar önemsenmez) |
| `coktan` | Seçenekler: `A) …\|B) …\|C) …` | Doğru seçenek harfi | Otomatik |
| `acik` | | İpucu anahtar kelimeler (`\|` ile) | Öğretmen puanlar; anahtar kelimeler öğretmene ipucu olarak gösterilir |

## Akış

1. Öğretmen CSV'yi yükler; sistem satırları ve puan toplamlarını denetler. Temrini sınıfına açar.
2. Öğrenci portaldan girer, projeyi yazar, programı istediği kadar çalıştırıp dener, soruları cevaplar.
3. **Teslim et** dendiğinde kontroller çalışır. Öğrenci sonucu ve eksiklerini görür; projeyi çalıştırmaya devam edebilir ama değiştirip yeniden teslim edemez.
4. Öğretmen `ogretmen` ölçütlerini ve `acik` soruları puanlar, teslimleri doğrular. Her öğrenci için temrin sayfası yazdırılabilir.

Teslim almış bir temrinin tanımı değiştirilemez; düzeltme gerekiyorsa yeni bir temrin numarasıyla yükleyin ya da temrini silip yeniden yükleyin. Silmek için onay penceresine **TEMRİN SİL** yazılır; çalışmalar ve puanlar da silinir.
