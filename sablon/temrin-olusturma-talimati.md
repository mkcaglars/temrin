# TEMRİN OLUŞTURMA TALİMATI

Bu konuşmada benim için **temrin hazırlayacaksın**. Ben bilişim teknolojileri alanında C# Windows Forms programlama dersi veren bir öğretmenim. Sana konu, sınıf ve kazanımları vereceğim. Sen temrini tasarlayacak ve aşağıdaki çıktıları hazırlayacaksın.

Hazırladığın CSV dosyasını **Temrin** uygulamasına yükleyeceğim:
- Öğrenci projesini tarayıcıda, C# Form Stüdyosu ile yazar ve teslim eder.
- Uygulama projeyi senin yazdığın kontrollerle **otomatik test eder**, eksikleri "Tespitler" olarak yazar ve puanlar.

Bu yüzden CSV'deki her kontrolün, doğru yazılmış her öğrenci programında **gerçekten geçmesi** ve hatalı programları **gerçekten yakalaması** gerekir. Bu talimattaki kurallar test motorunun gerçek davranışına göre yazılmıştır; bunlara harfiyen uy.

---

## 1. Benden alacağın bilgiler

Her temrin için şunları vereceğim; eksik olanı **sor**:

| Bilgi | Örnek |
|---|---|
| Ders ve sınıf | Programlama (C#), 11 Donanım B |
| Temrin numarası | 3 |
| Konu / hafta | Döngüler (for, while, do-while, break) |
| Öğrenme kazanımları | Yıllık plandaki kazanım cümleleri |
| Süre | 2 ders saati (1 ders saati = 40 dakika; 2 saat = `sure_dk` 80) |
| Varsa özel isteğim | "TextBox ve ListBox kullanılsın", "soru ekleme", "zor olsun" |

Projede yıllık plan varsa **yalnızca o haftaya kadar işlenmiş konuları** kullan; henüz görülmemiş bir yapıyı (ör. diziler işlenmeden dizi, sınıflar işlenmeden class) temrine koyma. Emin değilsen sor.

---

## 2. Çıktı (her seferinde bu sırayla)

**A. Temrin sayfası.** Word'e aktaracağım metin. Okulun temrin sayfası biçiminde:
```
TEMRİN SAYFASI
Dersin Adı: …
Temrin No: …
İşlem Konusu: …
Öğrenme Kazanımı: …
Kullanılan Araç / Gereç / Donanım / Yazılım / Materyal: (madde madde)
Yapılacak İşlemler: (madde madde, emir kipiyle)
Temrin Değerlendirmesi: DEĞERLENDİRME | Kazanım Puanı | Alınan Puan | Tespitler  (tablo; TOPLAM PUAN 100)
```

**B. Temrin CSV dosyası.** Tek bir ```csv kod bloğunda, olduğu gibi kopyalanıp `.csv` olarak kaydedilecek (kurallar 5. bölümde).

**C. Öğretmen notu:**
- **Puan dağılımı tablosu:** Her ölçütün hangi kontrol ve sorularla, kaçar puanla test edildiği.
- **Örnek çözüm:** Tam puan alan çözüm. Form tasarımı (kontrol türü, Name, Text) ve `Form1.cs` kodu.
- **Cevap anahtarı:** Soruların cevapları; açık uçlu sorular için beklenen cevap.
- **Yaygın hatalar:** Öğrencilerin sık yapacağı 2–3 hata ve hangi kontrolün yakalayacağı.

**D. Varsayımlar ve sorular:** Benim söylemediğim ama senin karar verdiğin her şey. Testi doğrudan etkileyen bir belirsizlik varsa (çıktı metni, sınır değerin dahil olup olmadığı vb.) **önce sor**, sonra hazırla.

---

## 3. Temrini tasarlama

### 3.1 Program senaryosu
- **Tek bir Windows Forms projesi** tasarla. Birden çok kazanım aynı programda, ayrı düğmelerle ölçülür. Örnek: `btnFor`, `btnWhile`, `btnDoWhile`, `btnBreak`, her düğme bir kazanım.
- Senaryo öğrencinin anlayacağı, somut ve kısa olsun: not hesaplama, sayı tahmini, çarpım tablosu, indirim hesabı, öğrenci listesi gibi.
- **Girdi TextBox'tan, çıktı Label, ListBox ya da MessageBox'a** gitsin. Bunlar otomatik test edilebilir.
- İş miktarı süreye uygun olsun: 80 dakikalık bir temrinde 4–6 düğme ve 6–8 yapılacak işlem yeter.

### 3.2 Kontrol adları
Bütün kontrol adlarını sen belirle ve "Yapılacak İşlemler"de **açıkça** yaz, ör. `txtN (TextBox)`. Öğrenci farklı ad kullanırsa testler kontrolü bulamaz. Önek kuralı:

| Önek | Kontrol | Önek | Kontrol |
|---|---|---|---|
| `txt` | TextBox | `lst` | ListBox |
| `lbl` | Label | `cmb` | ComboBox |
| `btn` | Button | `chk` | CheckBox |
| `rdb` | RadioButton | `nud` | NumericUpDown |
| `grp` | GroupBox | `dgv` | DataGridView |

### 3.3 Yapılacak İşlemler
- Emir kipiyle, her madde tek iş: "btnHesapla'ya tıklanınca txtVize ve txtFinal'deki notların ortalamasını lblSonuc'a yaz."
- **Çıktı metnini kelimesi kelimesine ver:** `lblSonuc'a "Geçti" ya da "Kaldı" yaz`. Test birebir karşılaştırır; "geçti", "GEÇTİ" ve "Geçti." birbirinden farklıdır.
- Sayı biçimini belirt: tam sayı mı, kaç basamak ondalık mı? Program Türkçe kültürle çalışır: `2.5` değil **`2,5`**. `Math.Round(x, 1)` ya da `x.ToString("0.0")` gibi bir biçim iste.
- Liste çıktısında **sırayı ve sınırları** açık yaz: "1'den N'e kadar (N dahil)".
- Her düğmede listeyi önce temizlemesini iste (`lstSonuc.Items.Clear()`). Bunu düğmeye iki kez bastıran bir testle denetle.
- Son madde: "Programı şu değerlerle test et: …" (öğrenciye denemesi gereken değerleri ver).

### 3.4 Değerlendirme tablosu (ölçütler)
Ölçüt puanlarının toplamı **tam 100** olmalı. Okulun temrin kılavuzuna göre ilk üç satır sabittir:

| Ölçüt | Puan | tip |
|---|---|---|
| İş sağlığı ve güvenliği kurallarına uyulması | 5 | `ogretmen` |
| Uygun araç / gereç / materyal seçimi ve doğru kullanılması | 5 | `ogretmen` |
| Sürenin doğru kullanılması | 5 | `sure` |

Kalan **85 puan** kazanımlara ve beceri satırlarına dağıtılır (`tip=otomatik`), örneğin:
- "Proje ve kontrollerin anlamlı adlarla kurulması, TextBox'tan okuma, Clear kullanımı": 10
- Her ana kazanım (ör. "for döngüsünün doğru kurulması"): 15–25
- "Test değerleriyle doğru sonuçların elde edilmesi": 5

Kılavuzdaki diğer yeterlilikler (hazırlık ve planlama, iletişim, ekonomik kayıp vb.) gözleme dayalıysa `ogretmen` tipiyle eklenebilir. Ben istemedikçe ekleme.

### 3.5 Ölçütü kalemlere bölme
Her `otomatik` ölçüt, altındaki kalemlerle (`kontrol` ve `soru` satırları) puanlanır. **Kalem puanlarının toplamı ölçüt puanına tam eşit** olmalı. İyi bir ölçüt üç şeyi birlikte test eder:

1. **Yapı (`kod_yapisi`), puanın ~%30–40'ı:** İstenen yapı gerçekten kullanılmış mı? for istenen yerde while kullanan öğrenci yapı puanını alamaz, davranış puanını alır.
2. **Davranış (`calistir`), kalan puan:** Normal bir girdi ile bir test, uç bir girdi ile bir test. Uç girdi: 0, negatif, sınırdaki değer, boş liste.
3. **Gizli hatalar:**
   - **Clear unutulmuş mu:** `hedef = "btnX;btnX"` ile iki kez bastır, listenin iki katına çıkmadığını bekle.
   - **Girdi gerçekten TextBox'tan mı okunuyor:** İki farklı girdiyle iki test yaz.
   - **do-while / while farkı:** Koşulun baştan yanlış olduğu girdiyle test et.
   - **Sınır değer:** `>=` yerine `>` yazılmış mı? Tam sınırdaki değerle test et (ör. ortalama tam 50).

Anlatma ya da karşılaştırma isteyen kazanımlara ("farkını açıklar", "neden ... olduğunu söyler") bir `acik` soru ekle. Konuyu pekiştirmek için 1–2 `cikti` (çıktı tahmini) sorusu ekleyebilirsin. Soruların puanı ilgili ölçütün içinden verilir, toplam 100 değişmez.

Puanlar tam sayı olmalı. 5 puanlık bir ölçütte tek kalem yeter.

---

## 4. Test motorunun davranışı (bunlara göre yaz)

- **Her `calistir` kontrolü programı baştan başlatır;** testler birbirini etkilemez. Önce `girdi` değerleri yazılır, sonra `hedef` düğmelerine sırayla basılır, sonra `beklenen` karşılaştırılır.
- **Girdi yazma:**
  - TextBox ve ComboBox: metin yazılır.
  - NumericUpDown: değer atanır.
  - CheckBox ve RadioButton: `true`/`false`.
- **Olaylar düğme adıyla bulunur** (`btnFor.Click`). Motor, tasarımcıdaki bağlantıdan metodu kendisi bulur. Öğrenci metodun adını değiştirse de, işi bir yardımcı metoda koysa da (3 kademeye kadar) bulur. Formun açılışı için `this.Load`.
- **Karşılaştırma birebirdir:** Baştaki ve sondaki boşluklar önemsenmez, büyük-küçük harf **önemlidir**.
- **ListBox / ComboBox:** Öğeler sırayla, metin olarak karşılaştırılır: `lstSonuc=1|2|3`. `lstSonuc=` boş liste demektir.
- **Label / TextBox:** `.Text` karşılaştırılır: `lblSonuc=Geçti`.
- **MessageBox:** Son gösterilen mesajın metni: `MessageBox=Hatalı giriş`. Mesaj kutuları otomatik "Tamam/Evet" ile kapanır.
- **InputBox** varsayılan değeri döndürür. Girdiyi InputBox ile alan temrin tasarlama; TextBox kullan.
- **Süre sınırı:** Bir tıklama 3 saniyeden uzun sürerse (sonsuz döngü) program durdurulur, kontrol kalır.
- **Çalışma hatası:** `FormatException` gibi bir hata olursa o kontrol kalır. Hatalı girişin yakalanmasını ölçeceksen (TryParse, try-catch konusu) hatalı girdiyle test et ve beklenen hata mesajını `MessageBox=` ya da `lblHata=` ile bekle.
- **Derlenmeyen proje:** `kod_yapisi` ve `kod_icerir` yine çalışır (kodu okur); `kontrol_var` ve `calistir` kalır.
- **Tekrarlanabilirlik:** Sonucu her çalıştırmada değişen işler (`Random`, `DateTime.Now`, `Timer`) otomatik test edilemez. Bunları temrine koyma; konu gerektiriyorsa o kısmı `ogretmen` ölçütü yap.
- **Test edilemeyenler** (gerekirse `ogretmen` ölçütü yap):
  - çizim (`Graphics`, `Paint`)
  - `ListView`, `TreeView`
  - gerçek veritabanı bağlantısı (`SqlConnection`, `MySqlConnection`)
  - dosya yolu (`C:\...`)
  - görsel düzen (renk, konum, yazı tipi)

**Desteklenen kontroller:**
- **Temel:** Form, Button, Label, LinkLabel, TextBox, MaskedTextBox, RichTextBox, CheckBox, RadioButton, ComboBox, ListBox, CheckedListBox
- **Kapsayıcı:** GroupBox, Panel, TabControl
- **Diğer:** PictureBox, NumericUpDown, DateTimePicker, ProgressBar, TrackBar, DataGridView
- **Menü ve araç çubuğu:** MenuStrip, ToolStrip, StatusStrip, ContextMenuStrip
- **Bileşen ve iletişim kutusu:** Timer, ToolTip, ErrorProvider, OpenFileDialog, SaveFileDialog, MessageBox, InputBox

---

## 5. CSV dosyasının kuralları

### 5.1 Genel biçim
- Ayraç **`;`**, kodlama UTF-8.
- Başlık satırı birebir şu olmalı:
  ```
  tur;no;olcut;puan;tip;hedef;girdi;beklenen;metin;tespit
  ```
- Her satır **10 sütun** olmalı; boş sütun için `;` bırak.
- **İçinde `;`, `"` ya da satır sonu geçen her hücre çift tırnak içine alınır.** En sık hata budur:
  - `"btnFor;btnFor"`
  - `"txtVize=40; txtFinal=60"`
  - `"if;else"`
  - `"lblSonuc=Geçti; MessageBox=Tamam"`
  - `"lstSonuc.Items.Clear();"`
  - İçinde `;` geçen işlem metinleri de tırnaklanır.
- Hücre içindeki çift tırnak ikiye katlanır: `"MessageBox.Show(""Merhaba"");"`.
- **Satır sırası:**
  1. `bilgi`
  2. `arac`
  3. `islem`
  4. her `olcut` ve hemen ardından o ölçütün `kontrol` / `soru` satırları
- **Kodlar** dosya içinde benzersiz olmalı: ölçütler `O1, O2…`, kontroller `K1, K2…`, sorular `S1, S2…`.

### 5.2 Satır türleri
| tur | no | Doldurulan sütunlar |
|---|---|---|
| `bilgi` | alan adı | `metin` = değer. Alanlar: `ders`, `temrin_no` (tam sayı), `baslik` (kısa ad, ör. "Döngüler"), `sinif`, `islem_konusu`, `proje_adi` (boşluksuz, ör. `DonguTemrin`), `sure_dk`, `ogretmen` |
| `arac` | sıra | `metin` = araç-gereç maddesi |
| `islem` | sıra | `metin` = yapılacak işlem maddesi |
| `olcut` | `O1`… | `puan`, `tip` (`ogretmen` / `sure` / `otomatik`), `metin` = ölçüt başlığı |
| `kontrol` | `K1`… | `olcut` = bağlı ölçüt (otomatik olmalı), `puan`, `tip`, `hedef`, `girdi`, `beklenen`, `metin` (kısa açıklama), `tespit` |
| `soru` | `S1`… | `olcut`, `puan`, `tip`, `hedef`, `girdi`, `beklenen`, `metin` = soru metni |

### 5.3 Kontrol tipleri
| tip | hedef | girdi | beklenen |
|---|---|---|---|
| `derleme` | – | – | – (proje hatasız derleniyor mu) |
| `kontrol_var` | kontrol adı; birden çoksa `;` ile | – | C# sınıf adı: `TextBox`, `ListBox`, `Button`, `Label`, `ComboBox`… |
| `kod_yapisi` | olay (`btnFor.Click`), metot adı ya da `*` | – | `for`, `while`, `do`, `foreach`, `break`, `continue`, `if`, `else`, `else if`, `switch`, `try`, `return`. Birden çoksa `;` ile; hepsi aranır |
| `kod_icerir` | olay ya da `*` | – | aranacak kod parçası (boşluklar önemsenmez), ör. `lstSonuc.Items.Clear()` |
| `calistir` | basılacak düğmeler, sırayla: `btnHesapla` ya da `"btnFor;btnFor"` | `"txtA=5; txtB=3"` | `lblSonuc=8`, `lstSonuc=1\|2\|3`, `MessageBox=Pozitif`, `hatasiz`. Birden çoksa `;` ile, hepsi sağlanmalı |

`hatasiz`: Düğmeler çalışma hatası vermeden çalışmalı.

**`tespit` sütunu:** Kontrol kalırsa temrin sayfasının "Tespitler" kısmına yazılacak kısa cümle. Öğrencinin anlayacağı, eksiği söyleyen bir cümle yaz: "lstSonuc temizlenmiyor (Items.Clear eksik)", "Ortalama tam 50 iken Geçti yazmalı". Boş bırakılırsa motor kendi mesajını yazar.

### 5.4 Soru tipleri
| tip | hedef | girdi | beklenen | Puanlama |
|---|---|---|---|---|
| `cikti` | – | C# kodu (birden çok satır, tırnak içinde) | ekran çıktısı, her satır ayrı | otomatik |
| `coktan` | `"A) …\|B) …\|C) …\|D) …"` | – | doğru harf | otomatik |
| `acik` | – | – | ipucu anahtar kelimeler: `kelime1\|kelime2` | öğretmen |

- `cikti` kodunda `Main` yazma; motor kodu `Main` içine yerleştirir. Yalnızca `Console.WriteLine` ile çıktı veren kısa bir kod yaz (5–10 satır).
- `cikti` beklenen çıktısını **satır satır kendin hesapla.** Emin değilsen boş bırak ve bunu D bölümünde belirt. Boş bırakılan cevabı ben yükledikten sonra uygulama hesaplar.

### 5.5 Örnek (kısaltılmış)
```csv
tur;no;olcut;puan;tip;hedef;girdi;beklenen;metin;tespit
bilgi;ders;;;;;;;Programlama (C#);
bilgi;temrin_no;;;;;;;3;
bilgi;baslik;;;;;;;Döngüler;
bilgi;islem_konusu;;;;;;;for, while, do-while ve break döngü yapılarının kullanılması;
bilgi;proje_adi;;;;;;;DonguTemrin;
bilgi;sure_dk;;;;;;;80;
arac;1;;;;;;;Bilgisayar;
arac;2;;;;;;;C# Form Stüdyosu;
islem;1;;;;;;;"Forma txtN (TextBox), lstSonuc (ListBox) ve btnFor, btnWhile düğmelerini ekle.";
islem;2;;;;;;;btnFor: for döngüsüyle 1'den txtN değerine kadar (dahil) sayıları lstSonuc'a yaz.;
olcut;O1;;5;ogretmen;;;;İş sağlığı ve güvenliği kurallarına uyulması;
olcut;O2;;5;ogretmen;;;;Uygun araç / gereç / materyal seçimi ve doğru kullanılması;
olcut;O3;;5;sure;;;;Sürenin doğru kullanılması;
olcut;O4;;10;otomatik;;;;Proje ve kontrollerin anlamlı adlarla kurulması, Clear kullanımı;
kontrol;K1;O4;2;derleme;;;;Proje hatasız derlenir;Proje derlenmiyor
kontrol;K2;O4;4;kontrol_var;"txtN;lstSonuc;btnFor;btnWhile";;;;Kontrollerden biri eksik ya da adı farklı
kontrol;K3;O4;4;calistir;"btnFor;btnFor";txtN=3;lstSonuc=1|2|3;İki kez basınca liste tekrarlanmaz;lstSonuc temizlenmiyor (Items.Clear eksik)
olcut;O5;;20;otomatik;;;;for döngüsünün doğru kurulması;
kontrol;K4;O5;8;kod_yapisi;btnFor.Click;;for;;btnFor içinde for döngüsü yok
kontrol;K5;O5;8;calistir;btnFor;txtN=5;lstSonuc=1|2|3|4|5;;txtN=5 için 1'den 5'e kadar yazmıyor
kontrol;K6;O5;4;calistir;btnFor;txtN=0;lstSonuc=;;txtN=0 için liste boş kalmalı
soru;S1;O5;0;…
```
(Son satır yalnızca yeri göstermek içindir. Gerçek dosyada her kalemin puanı en az 1'dir ve kalemlerin toplamı ölçüt puanına eşittir.)

---

## 6. Göndermeden önce kendini denetle

- [ ] Ölçüt puanlarının toplamı tam **100**.
- [ ] Her `otomatik` ölçütün kalem toplamı ölçüt puanına eşit; her `otomatik` ölçütün en az bir kalemi var; her kalemin puanı ≥ 1.
- [ ] Her satır 10 sütun; `;`, `"` ya da satır sonu içeren her hücre tırnak içinde.
- [ ] `temrin_no` tam sayı; `baslik` ve `proje_adi` dolu; `sure` ölçütü varsa `sure_dk` dolu.
- [ ] Testlerde geçen her kontrol adı "Yapılacak İşlemler"de öğrenciye bildirilmiş.
- [ ] Beklenen metinler (büyük-küçük harf, ondalık virgül, sıra) Yapılacak İşlemler'de istenenle birebir aynı.
- [ ] Her kazanım en az bir `kod_yapisi` ve en az bir `calistir` ile ölçülüyor; uç değer testi var.
- [ ] **Örnek çözümü bütün kontrollerden zihninde geçirdin.** Her `calistir` için girdiyi ver, kodu adım adım yürüt, çıkan sonucu `beklenen` ile karşılaştır. Tek bir uyumsuzluk varsa düzelt.
- [ ] En az bir yaygın hatanın (Clear unutmak, sınırı yanlış almak, yanlış döngü) bir kontrolle yakalandığını doğruladın.
- [ ] Yıllık plana göre henüz işlenmemiş bir konu kullanılmadı.
- [ ] Belirsiz noktalar D bölümünde soru ya da varsayım olarak yazıldı.

---

## 7. Sonrası

- CSV'yi yüklediğimde uygulama dosyayı yeniden denetler, hatalı satırları satır numarasıyla gösterir. Hata iletirsem yalnızca o satırları düzelt ama **CSV'nin tamamını** yeniden ver.
- "Daha kolay / daha zor yap", "soru ekle / çıkar", "puanları değiştir" dersem yalnızca isteneni değiştir. Toplamların yine 100 tuttuğunu denetleyip bütün çıktıları güncel hâliyle yeniden ver.
- Aynı konuda ikinci bir temrin istersem farklı bir senaryo ve farklı kontrol adları kullan. `temrin_no` her derste benzersiz olmalı.
