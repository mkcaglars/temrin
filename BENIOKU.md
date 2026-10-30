# Temrin

Mesleki eğitimde temrin uygulamaları için web uygulaması. Öğretmen temrini bir CSV dosyasıyla tanımlar. Öğrenci C# Windows Forms projesini tarayıcıda yazar, soruları cevaplar ve teslim eder. Program otomatik test edilir, eksikleri temrin sayfasındaki "Tespitler" gibi yazılır. Öğretmen eksik notları girer ve puanları görür.

Öğrenci ve öğretmen okul portalından tek tıkla (SSO) girer. Puanlar Temrin'in kendi veritabanında tutulur; **portala puan veren bir API yoktur.**

Editör, form tasarımcısı, derleyici ve WinForms çalıştırıcısı [C# Form Stüdyosu (c-lesson)](https://github.com/mkcaglars/c-lesson) projesinden gelir. c-lesson'un dosyaları `c-lesson/` klasöründe bu depoya dahildir (alt modül değil; Hostinger alt modül indirmez). Kullanılan sürüm `c-lesson/SURUM` dosyasında yazılıdır. c-lesson'da yapılan geliştirmeler `araclar/c-lesson-guncelle.sh` ile alınır.

## Klasörler

| Klasör | İçerik |
|---|---|
| `web/` | Sitenin PHP ve ekran dosyaları |
| `web/giris.php` | Portaldan gelen SSO girişi |
| `web/index.php` | Rolüne göre öğrenci ya da öğretmen ana ekranı |
| `web/studyo/` | Temrin çalışma ekranı (editör + görev/soru/teslim paneli) |
| `web/api/ogrenci.php` | Öğrencinin temrinleri ve puanları |
| `web/api/calisma.php` | Öğrencinin çalışması: proje kaydı, cevaplar, teslim, değerlendirme |
| `web/api/ogretmen.php` | Öğretmen: puan tablosu, ölçüt düzeltme, temrin yükleme, erişim, doğrulama |
| `web/api/disa-aktar.php` | Öğretmen: puan CSV'si |
| `web/lib/` | Ortak PHP kodu (web'den açılamaz) |
| `studyo/` | Çalışma ekranının JavaScript'i ve c-lesson `api.js` uyarlaması |
| `motor/Degerlendirici/` | Test motoru (C#): CSV kontrollerini öğrenci projesine uygular |
| `motor/Motor/` | Tarayıcıda çalışan motor: c-lesson motoru + Temrin test motoru (.NET WebAssembly) |
| `motor/Testler/` | Test motorunun birim testleri |
| `c-lesson/` | C# Form Stüdyosu kopyası (sürümü `c-lesson/SURUM`; elle değiştirmeyin, güncelleme betiğiyle alın) |
| `araclar/c-lesson-guncelle.sh` | c-lesson'un yeni sürümünü GitHub'dan alıp `c-lesson/` klasörüne kopyalar |
| `sablon/` | Temrin CSV şablonu, Temrin 3 örneği ve [biçim açıklaması](sablon/README.md) |
| `tests/` | Sunucu testi (PHP) ve uçtan uca tarayıcı testi (Playwright) |
| `araclar/portal-ornek.php` | Deneme için giriş bağlantısı üretir (portaldaki `temrin-git.php` ile aynı token) |
| `belgeler/` | Temrin kılavuzu ve örnek temrin sayfası (Word) |

## Derleme ve kurulum (Hostinger)

Sunucuda yalnızca PHP 8.1+ ve MySQL gerekir. Site derlenerek `dist/` klasörü (~60 MB: PHP dosyaları, editör, motor `studyo/_framework`, Monaco editör) üretilir ve bu klasörün **içeriği** sunucuya yüklenir.

### A) GitHub + Hostinger Git ile otomatik (önerilir)

Kendi bilgisayarınıza hiçbir şey kurmanız gerekmez. Derleme GitHub'da, yayın Hostinger'ın Git özelliğiyle yapılır.

Hostinger depoyu olduğu gibi çeker, derleme yapamaz. Bu yüzden derlenmiş site ayrı bir dalda tutulur:
- **`main`:** Kaynak kod.
- **`yayin`:** Yalnızca derlenmiş site (`dist/` içeriği). Bu dala elle dokunulmaz.

`main` dalına her gönderimde GitHub Actions (`.github/workflows/yayinla.yml`):
1. Depoyu indirir (c-lesson dahil).
2. Test motoru, sunucu ve tarayıcı testlerini çalıştırır. Bir test kalırsa yayın yapılmaz.
3. `./build.sh` ile siteyi derler ve sonucu `yayin` dalına gönderir.

Hostinger `yayin` dalını `public_html`'e çeker; otomatik yayın açıksa her güncellemede kendiliğinden çeker.

İlk kurulum (sırası önemli):
1. Değişiklikleri `main` dalına birleştirin. GitHub'da **Actions** sekmesinde **Derle ve Yayınla** iş akışının yeşil bittiğini ve **`yayin`** dalının oluştuğunu görün.
2. Hostinger hPanel'de sitenin **Gelişmiş > GIT** bölümünü açın:
   - Depo: `https://github.com/mkcaglars/temrin.git`
   - Dal: **`yayin`**
   - Dizin: boş bırakın (`public_html`). Hostinger bu klasörün **boş** olmasını ister; varsa varsayılan dosyaları (ör. `default.php`) silin.
   - **Oluştur** ve ardından **Dağıt (Deploy)** deyin.
3. Aynı sayfada **Otomatik Dağıtım**'ı açın ve verilen webhook adresini kopyalayın. GitHub'da Temrin deposunun **Settings > Webhooks > Add webhook** bölümüne yapıştırın ("Just the push event"). Artık her yayından sonra Hostinger kendiliğinden çeker.
4. `.env.example` dosyasını `.env` adıyla `public_html`'in **yanına** (bir üst klasöre) koyup doldurun. Git yayını `.env`'ye dokunmaz.
5. Tarayıcıdan `https://<adres>/.git/config` ve `https://<adres>/.env` açılmamalı (403). Git yayını `public_html` içinde bir `.git` klasörü oluşturur; `.htaccess` bunu kapatır.

Her derlemenin çıktısı Actions sayfasında "site" adlı dosya olarak 7 gün indirilebilir (gerekirse elle yüklemek için).

### B) Kendi bilgisayarınızda

Gerekenler: .NET 10 SDK, Node.js 20+.

```bash
./build.sh
```

Oluşan `dist/` klasörünün **içindekileri** (gizli `.htaccess` dosyaları dahil) hPanel Dosya Yöneticisi veya FTP ile `public_html` klasörüne yükleyin. `.env` dosyasını yukarıdaki gibi `public_html`'in yanına koyun.

### Her iki yolda

- `PORTAL_SSO_ANAHTAR` portaldaki `TEMRIN_ANAHTAR` ile aynı olmalı. Portaldaki `TEMRIN_ADRES` bu sitenin adresi olmalı (sonda `/` yok).
- Site **HTTPS** üzerinden açılmalı (oturum çerezi `Secure`).
- Tablolar ilk istekte otomatik oluşur.

### c-lesson'daki değişiklikleri almak

c-lesson'da yapılan düzeltmeler Temrin'e kendiliğinden gelmez; Temrin, `c-lesson/` klasöründeki kopyayı kullanır (sürümü `c-lesson/SURUM`). Güncellemek için:

```bash
./araclar/c-lesson-guncelle.sh
```

Betik c-lesson'un `main` dalının son hâlini alır; belirli bir sürüm için commit numarası verilebilir (`./araclar/c-lesson-guncelle.sh c26ae39`). `c-lesson/` içindeki dosyaları elle değiştirmeyin; bir sonraki güncellemede silinir. Düzeltmeyi c-lesson deposunda yapıp buraya güncelleme betiğiyle alın.

Ardından değişikliği Temrin'e commit edip `main`'e gönderin; Actions test edip derler, `yayin` dalını günceller, Hostinger çeker (ya da B yolunda `./build.sh` ile yeniden derleyin). Testler, c-lesson'daki bir değişikliğin Temrin'i bozup bozmadığını yüklemeden önce yakalar.

## Akış

1. **Öğretmen** "Temrinler" sekmesinden CSV'yi yükler. Hatalı satırlar numarasıyla listelenir. Beklenen çıktısı boş bırakılmış çıktı tahmini soruları varsa **Çıktıları hesapla** düğmesiyle kodları çalıştırıp cevapları kaydeder.
2. **Öğretmen** "Temrin erişimi" sekmesinde temrini kendi sınıfına açar, isterse başlangıç–bitiş zamanı koyar.
3. **Öğrenci** ana ekranda **Temrine başla** der. Çalışma ekranı açılır: solda C# Form Stüdyosu, sağda görev, ölçütler, sorular ve kalan süre. Proje ve cevaplar otomatik kaydedilir. Süre ilk açılışta başlar.
4. **Öğrenci** **Teslim et** der. Proje ve cevaplar kilitlenir. Program öğrencinin tarayıcısında otomatik test edilir, sonuç ve tespitler panelde görünür. Öğrenci programı çalıştırmaya devam edebilir.
5. **Öğretmen** puan tablosunda puana tıklar:
   - Kontrol ve soru ayrıntılarını, açık uçlu cevapları görür.
   - Öğretmen ölçütlerini (İSG, araç-gereç) ve açık uçlu soruları puanlar, gerekirse otomatik puanı düzeltir.
   - **Projeyi aç** ile öğrencinin projesini salt okunur açıp çalıştırabilir.
6. **Öğretmen** "Temrinler" sekmesinden **Teslimleri doğrula** ile tüm teslimleri kendi tarayıcısında yeniden değerlendirir. Doğrulanan puanlar tabloda ✓ ile işaretlenir.

### Puanlama

- **Kontroller:** Geçerse tam puan, kalırsa 0. Tespit, CSV'deki `tespit` metnidir; boşsa motorun mesajıdır (ör. `lstSonuc: beklenen [1, 2, 3], bulunan [1, 2, 3, 1, 2, 3] (txtN=3)`).
- **Sorular:** Çıktı tahmini ve çoktan seçmeli sorular sunucuda puanlanır; cevap anahtarları teslimden önce öğrenciye gönderilmez. Açık uçlu soruları öğretmen puanlar.
- **Süre:** `sure_dk` içinde teslim edilirse tam puan, aşılırsa 0 ve "Süre aşıldı" tespiti. Öğretmen düzeltebilir.
- **Ölçüt puanı:** Altındaki kalemlerin toplamıdır. Puanlanmamış kalem varsa ölçüt "bekliyor" kalır ve temrin puanı **kesin** olmaz.
- **Öğretmenin girdiği puan korunur:** Öğretmen bir ölçütü elle puanladıysa, yeniden değerlendirme o ölçütün puanını değiştirmez.

### Değerlendirmenin güvenilirliği

Derleyici ve WinForms çalıştırıcısı sunucuda değil tarayıcıda çalışır (paylaşımlı hosting .NET çalıştıramaz). Bu yüzden teslimdeki otomatik değerlendirme **öğrencinin tarayıcısında** yapılır ve teknik bilgisi olan bir öğrenci sonucu değiştirip gönderebilir.

Buna karşı alınan önlemler:
- Değerlendirme teslimden sonra yalnızca bir kez gönderilebilir.
- Soru cevapları sunucuda puanlanır.
- **Teslimleri doğrula** testleri öğretmenin tarayıcısında, sunucudaki proje üzerinde yeniden çalıştırır ve öğrencinin gönderdiği sonucun yerine yazar. Puanı karneye geçmeden önce doğrulamanız önerilir; tabloda doğrulanmamış teslimlerde ✓ yoktur.

## Giriş (SSO)

`GET /giris.php?token=<JWT>`, HS256, portalın `temrin-git.php` dosyası üretir.

| Alan | Kural |
|---|---|
| `alg` | Tam olarak `HS256`; imza `hash_equals` ile karşılaştırılır |
| `exp` | Zorunlu; geçmişse red (30 sn tolerans) |
| `jti` | Zorunlu, tek kullanımlık (en fazla 64 karakter) |
| `uid`, `name`, `ders_id` | Boşsa red |
| `role` | `ogrenci` ya da `ogretmen` |
| `okul_no` | Öğrencide zorunlu; puanlar `okul_no + ders_id` ile saklanır |
| `sinif`, `ders` | Ekranda gösterilir; öğrencinin `sinif` değeri kayıtlara yazılır |
| `siniflar` | **Öğretmende zorunlu**: boş olmayan metinlerden oluşan dizi (boş dizi geçerlidir, öğretmen hiçbir öğrenci görmez). Öğrencide yok sayılır |

Başarılı girişte `session_regenerate_id(true)` çağrılır ve 8 saatlik `HttpOnly; Secure; SameSite=Lax` çerez verilir. `ders_id`, `okul_no` ve `siniflar` oturuma yazılır; uygulamada bunları değiştiren bir işlem yoktur. Anahtar `.env` dosyasından okunur, hiçbir yere yazılmaz.

## Yetki kuralları

Tüm okuma ve yazma uç noktalarında rol, ders ve sınıf yetkisi sunucuda denetlenir:

- **Öğrenci:**
  - Kimlik her zaman oturumdaki `okul_no` ve `ders_id`'dir. İstekte farklı bir `okul_no`, `ders_id`, `ders` ya da `sinif` gönderilirse **403** döner.
  - Temrin öğrencinin sınıfına kapalıysa açılamaz (teslim edilmiş çalışma her zaman açılır).
  - Teslimden sonra proje ve cevaplar değiştirilemez.
  - Öğretmen uç noktaları ve CSV öğrenciye **403** döner.
- **Öğretmen:**
  - Her sorgu `ders_id = oturumdaki ders` ve `sinif IN (oturumdaki siniflar)` ile sınırlanır.
  - İstekteki sınıf listede yoksa ya da istekte farklı bir `ders_id`/`ders` varsa **403** döner.
  - Başka sınıftaki bir öğrencinin puan ayrıntısı, düzeltmesi, projesi, doğrulaması ve erişim ayarı da 403 döner. Başka dersin temrini 404 döner.
- **Temrin tanımı** dersindir: Aynı dersin öğretmenleri temrinleri ortak kullanır. Teslim almış bir temrin değiştirilemez ve silinemez.
- **Temrin erişimi sınıf bazındadır:** Öğretmen bir temrini yalnızca kendi sınıfları için açar ya da kapatır.
- **CSRF:** Tüm yazma istekleri oturuma bağlı CSRF anahtarı ister.

## Ekranlar

**Öğrenci ana ekranı:** Açık ya da teslim edilmiş temrinler; "Temrine başla / Devam et", puan, ölçüt ayrıntısı ve tespitler, "Projeyi aç". Kesinleşmemiş puanlar "Öğretmen puanlaması bekleniyor" notuyla görünür.

**Çalışma ekranı:** C# Form Stüdyosu editörü (araç kutusu, form tasarımcısı, kod editörü, IntelliSense, çalıştırma, ZIP indirme) ve sağda temrin paneli (görev, araç-gereç, yapılacak işlemler, ölçütler, sorular, kalan süre, teslim, sonuç).

**Öğretmen:**
- **Puanlar:** Sınıf süzgeci; öğrenci × temrin tablosu; temrin, öğrenci ve sınıf ortalamaları; "bekliyor" rozeti; doğrulananlarda ✓. Puana tıklayınca ölçüt düzeltme, kalem ayrıntısı ve "Projeyi aç".
- **Temrinler:** CSV yükleme, önizleme, silme, çıktıları hesaplama, teslimleri doğrulama.
- **Temrin erişimi:** Seçilen sınıf için aç/kapat, başlangıç–bitiş zamanı.
- **CSV indir:** Ekrandaki süzgeçle aynı yetki.

Ortalamalara yalnızca kesinleşmiş puanlar girer. Sınıf ortalaması, öğrenci ortalamalarının ortalamasıdır. Teslim edilmemiş temrin ortalamaya girmez.

## Puan CSV'si

`GET /api/disa-aktar.php?sinif=<sınıf>` (boşsa öğretmenin tüm sınıfları)

- `;` ayraçlı, UTF-8 BOM'lu, `Content-Disposition: attachment`
- Dosya adı `temrin-<ders>-<sinif>.csv`: Türkçe harfler sadeleştirilir, ör. `temrin-programlama-csharp-11-donanim-b.csv`. Sınıf seçilmemişse `tum-siniflar`.
- Sütunlar: Okul No; Ad Soyad; Sınıf; her temrin (`T3 Döngüler`); Ortalama; Bekleyen (kesinleşmemiş temrinler). Son satır temrin ortalamaları ve sınıf ortalaması. Ondalık ayırıcı virgül.
- `=`, `+`, `-`, `@` ile başlayan metinlerin başına `'` eklenir (Excel formül enjeksiyonuna karşı).

## Testler

Test motoru (C#, 12 test: Temrin 3 CSV'si doğru ve hatalı çözümlere uygulanır):

```bash
dotnet test motor/Testler
```

Sunucu (PHP, 107 senaryo: giriş, yetki sınırları, CSV yükleme/doğrulama, çalışma, teslim, değerlendirme, doğrulama, puan CSV'si):

```bash
php tests/sunucu_testi.php
```

Uçtan uca tarayıcı testi (Playwright, 22 adım). Önce `./build.sh` çalıştırılmış olmalı:

```bash
node tests/tarayici_testi.js
```

Var olan bir kuruluma (ör. Apache, boş veritabanıyla) karşı çalıştırmak için `TEST_ADRES` ve `TEST_ANAHTAR` (o kurulumun `PORTAL_SSO_ANAHTAR` değeri) verilir.

Tarayıcı testinin adımları:
1. Öğretmen CSV'yi arayüzden yükler, hatalı CSV'nin reddini görür, temrini açar.
2. İki öğrenci (doğru ve hatalı çözüm) çalışıp teslim eder; test öğrenci tarayıcısında çalışır.
3. Öğretmen eksik notları girer, teslimleri doğrular, projeyi salt okunur açar, puan CSV'sini indirir ve temrin sayfalarını açar.

## Canlı deneme listesi

Canlıya aldıktan sonra sırayla deneyin:

1. **Ayar:** Portalda öğretmen olarak `temrin-git.php?tani=1` açın. Anahtar uzunluğu ve parmak izi, Temrin sunucusundaki anahtarla aynı olmalı. Şu komutun çıktısının ilk 8 karakteri parmak izine eşit olmalı: `php -r 'echo hash("sha256", "ANAHTAR");'`
2. **Öğretmen girişi:** Portaldan dersi seçip Temrin'e girin. Üstte ders adı ve adınız, sınıf süzgecinde **yalnızca bu dersi verdiğiniz sınıflar** görünmeli.
3. **Temrin yükleme:** Temrinler → `sablon/temrin-3-donguler.csv` dosyasını yükleyin. "Temrin 3 (Döngüler) yüklendi" çıkmalı. "Önizle" ile ölçütleri ve kontrolleri görün.
4. **Hatalı CSV:** Bir ölçüt puanını değiştirip yükleyin. "toplamı 100 olmalı" hatası satır bilgisiyle çıkmalı.
5. **Erişim:** Temrin erişimi → sınıf seçin → T3'ü açın.
6. **Tek kullanım ve süre:** Giriş sonrası tarayıcı geçmişinden `giris.php?token=...` adresini yeniden açın → "daha önce kullanılmış". 5 dakikadan eski bir bağlantı → "süresi dolmuş".
7. **Öğrenci çalışması:** Bir öğrenci hesabıyla girip **Temrine başla** deyin. Editör ve sağdaki panel açılmalı, alt çubukta "Hazır" yazmalı (ilk açılışta motor ~10 MB indirilir). Formu tasarlayıp kodu yazın, **Başlat** ile çalıştırın.
8. **Kayıt:** Sayfayı yenileyin ya da başka bilgisayardan girin; proje ve cevaplar yerinde olmalı.
9. **Teslim:** **Teslim et** → onay. "Programınız test ediliyor…" sonrası panelde puan ve tespitler görünmeli; proje değiştirilemez ama **Başlat** çalışmalı.
10. **Öğrenci yetkisi:** Öğrenci oturumunda `api/ogrenci.php?okul_no=<başka no>` → 403. `api/ogretmen.php?islem=tablo` → 403.
11. **Puanlama:** Öğretmen tablosunda puana tıklayın. Kalem ayrıntısı ve açık uçlu cevap görünmeli. İSG, araç-gereç ve açık sorulu ölçütü girip kaydedin → "bekliyor" kalkmalı, öğrenci ekranında puan güncellenmeli.
12. **Doğrulama:** Temrinler → **Teslimleri doğrula** → tüm teslimler değerlendirilmeli, tabloda ✓ çıkmalı, elle girdiğiniz puanlar korunmalı.
13. **Projeyi aç:** Puan penceresinde **Projeyi aç** → öğrencinin projesi salt okunur açılmalı ve çalıştırılabilmeli.
14. **Yetkisiz sınıf:** `api/ogretmen.php?islem=tablo&sinif=<vermediğiniz sınıf>` → 403. `&ders_id=<başka ders>` → 403. İki öğretmen yalnızca kendi sınıflarını görmeli; CSV'de de.
15. **Puan CSV'si:** "CSV indir" ile indirip Excel'de açın. Türkçe karakterler doğru, sütunlar ayrı olmalı.
16. **Gizli dosyalar:** `https://<adres>/.env` ve `https://<adres>/lib/db.php` açılmamalı (403/404).
17. **Çıkış:** "Çıkış" sonrası ana sayfa "Oturum yok" demeli.
