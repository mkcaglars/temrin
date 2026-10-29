# Temrin

Mesleki eğitimde temrin uygulamaları için web uygulaması. Öğrenci ve öğretmen okul portalından tek tıkla (SSO) girer. Puanlar Temrin'in kendi veritabanında tutulur; öğrenci ve öğretmen puan ekranlarını da Temrin sunar. **Portala puan veren bir API yoktur.**

> Durum: giriş, puan saklama, öğretmen/öğrenci puan ekranları, ölçüt düzeltme, sınıf bazında temrin erişimi ve CSV dışa aktarma hazır. Öğrencinin kod yazıp teslim ettiği temrin ekranı ve otomatik test motoru (C# Form Stüdyosu derleyicisiyle) sıradaki adımdır.

## Klasörler

| Klasör | İçerik |
|---|---|
| `web/` | Yayına giden site (Hostinger'da `public_html`) |
| `web/giris.php` | Portaldan gelen SSO girişi |
| `web/index.php` | Rolüne göre öğrenci ya da öğretmen ekranı |
| `web/api/ogrenci.php` | Öğrencinin kendi temrinleri ve puanları |
| `web/api/ogretmen.php` | Öğretmen: puan tablosu, ölçüt ayrıntısı/düzeltme, temrin erişimi |
| `web/api/disa-aktar.php` | Öğretmen: CSV indirme |
| `web/lib/` | Ortak kod (web'den doğrudan açılamaz) |
| `sablon/` | Temrin tanımı CSV şablonu ve Temrin 3 örneği |
| `araclar/portal-ornek.php` | Deneme için giriş bağlantısı üretir (portaldaki `temrin-git.php` ile aynı token) |
| `tests/sunucu_testi.php` | Uçtan uca test |
| `belgeler/` | Temrin kılavuzu ve örnek temrin sayfası (Word) |

## Kurulum (Hostinger)

1. `web/` klasörünün içeriğini `public_html` (ya da alt alan adının klasörü) içine yükleyin.
2. `.env.example` dosyasını `.env` adıyla `public_html`'in **yanına** (bir üst klasöre) kopyalayıp doldurun.
3. `PORTAL_SSO_ANAHTAR` portaldaki `TEMRIN_ANAHTAR` ile aynı olmalı. Portalın `.env` dosyasındaki `TEMRIN_ADRES` bu sitenin adresi olmalı (sonda `/` yok).
4. Site **HTTPS** üzerinden açılmalı (oturum çerezi `Secure`).
5. Tablolar ilk istekte otomatik oluşur.

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
| `sinif`, `ders` | Ekranda gösterilir; öğrencinin `sinif` değeri teslimde kayda yazılır |
| `siniflar` | **Öğretmende zorunlu**: boş olmayan metinlerden oluşan dizi (boş dizi geçerlidir, öğretmen hiçbir öğrenci görmez). Öğrencide yok sayılır |

Başarılı girişte `session_regenerate_id(true)` çağrılır ve 8 saatlik `HttpOnly; Secure; SameSite=Lax` çerez verilir. `ders_id`, `okul_no` ve `siniflar` oturuma yazılır; uygulamada bunları değiştiren bir işlem yoktur. Anahtar `.env` dosyasından okunur, hiçbir yere yazılmaz.

## Yetki kuralları

Tüm okuma ve yazma uç noktalarında rol, ders ve sınıf yetkisi sunucuda denetlenir:

- **Öğrenci:** Kimlik her zaman oturumdaki `okul_no` ve `ders_id`'dir. İstekte farklı bir `okul_no`, `ders_id`, `ders` ya da `sinif` gönderilirse **403** döner. Öğretmen uç noktaları ve CSV öğrenciye **403** döner.
- **Öğretmen:** Her sorgu `ders_id = oturumdaki ders` ve `sinif IN (oturumdaki siniflar)` ile sınırlanır. İstekteki sınıf listede yoksa ya da istekte farklı bir `ders_id`/`ders` varsa **403** döner. Başka sınıftaki bir öğrencinin ayrıntısı, düzeltmesi ve erişim ayarı da 403 döner. Başka dersin temrini 404 döner.
- **Temrin erişimi sınıf bazındadır:** Öğretmen bir temrini yalnızca kendi sınıfları için açar ya da kapatır, başlangıç–bitiş zamanı koyar. Aynı dersi farklı sınıflara veren iki öğretmen birbirinin ayarını değiştiremez.
- **CSRF:** Tüm yazma istekleri oturuma bağlı CSRF anahtarı ister.

## Ekranlar

**Öğrenci:** Açık ya da teslim edilmiş temrinleri, puanı ve ölçüt ayrıntısı (puan, alınan, tespit). `kesin: false` olan puanlar "Öğretmen puanlaması bekleniyor" notuyla, puanlanmamış ölçütler "bekliyor" rozetiyle görünür.

**Öğretmen:**
- **Puanlar:** Sınıf süzgeci; öğrenci × temrin tablosu; temrin ortalaması, öğrenci ortalaması, sınıf ortalaması; kesin olmayan puanlarda "bekliyor" rozeti. Puana tıklayınca ölçüt düzeltme penceresi açılır (girilen ölçüt `duzenleyen: ogretmen` olur, toplam yeniden hesaplanır).
- **Temrin erişimi:** Seçilen sınıf için her temrini aç/kapat, başlangıç–bitiş zamanı.
- **CSV indir:** Ekrandaki süzgeçle aynı yetki.

Ortalamalara yalnızca kesinleşmiş puanlar girer. Sınıf ortalaması, öğrenci ortalamalarının ortalamasıdır. Teslim edilmemiş temrin ortalamaya girmez.

## CSV

`GET /api/disa-aktar.php?sinif=<sınıf>` (boşsa öğretmenin tüm sınıfları)

- `;` ayraçlı, UTF-8 BOM'lu, `Content-Disposition: attachment`
- Dosya adı `temrin-<ders>-<sinif>.csv`: Türkçe harfler sadeleştirilir, ör. `temrin-programlama-csharp-11-donanim-b.csv`. Sınıf seçilmemişse `tum-siniflar`.
- Sütunlar: Okul No; Ad Soyad; Sınıf; her temrin (`T3 Döngüler`); Ortalama; Bekleyen (kesinleşmemiş temrinler). Son satır temrin ortalamaları ve sınıf ortalaması. Ondalık ayırıcı virgül.
- `=`, `+`, `-`, `@` ile başlayan metinlerin başına `'` eklenir (Excel formül enjeksiyonuna karşı).

## Test

```bash
php tests/sunucu_testi.php
```

Geçici `.env` ve SQLite ile yerel PHP sunucusu başlatır. 75 senaryoyu dener: geçerli/geçersiz token (yanlış anahtar, `alg=none`, `HS512`, süresi geçmiş, eksik alanlar), aynı `jti` ile ikinci kullanım, `siniflar` olmayan ya da geçersiz öğretmen, öğrencinin başka öğrencinin puanını istemesi, öğretmenin yetkisiz sınıfı istemesi, `ders_id`/`ders` değiştirme girişimi (sorgu ve gövdede), başka sınıfın puanını düzeltme, sınıf bazında erişim, CSV süzgeci, BOM ve dosya adı.

## Canlı deneme listesi

Canlıya aldıktan sonra sırayla deneyin:

1. **Ayar:** Portalda öğretmen olarak `temrin-git.php?tani=1` açın. Anahtar uzunluğu ve parmak izi, Temrin sunucusundaki anahtarla aynı olmalı. Şu komutun çıktısının ilk 8 karakteri parmak izine eşit olmalı: `php -r 'echo hash("sha256", "ANAHTAR");'`
2. **Öğretmen girişi:** Portaldan dersi seçip Temrin'e girin. Üstte ders adı ve adınız, sınıf süzgecinde **yalnızca bu dersi verdiğiniz sınıflar** görünmeli.
3. **Tek kullanım:** Giriş sonrası tarayıcı geçmişinden `giris.php?token=...` adresini yeniden açın. "daha önce kullanılmış" uyarısı çıkmalı.
4. **Süre:** Portalda bağlantıyı üretip 5 dakikadan fazla bekletin (ör. adresi kopyalayıp sonra açın). "süresi dolmuş" uyarısı çıkmalı.
5. **Çerez:** Tarayıcı geliştirici araçlarında (Uygulama → Çerezler) `TEMRIN` çerezi `HttpOnly`, `Secure`, `SameSite=Lax` olmalı, süresi yaklaşık 8 saat.
6. **Öğrenci girişi:** Bir öğrenci hesabıyla girin. Yalnızca kendi temrinleri görünmeli.
7. **Öğrenci yetkisi:** Öğrenci oturumunda adres çubuğuna `api/ogrenci.php?okul_no=<başka no>` yazın → 403. `api/ogretmen.php?islem=tablo` → 403.
8. **Temrin erişimi:** Öğretmen ekranında Temrin erişimi → sınıf seçin → bir temrini açın. Öğrenci sayfayı yenileyince temrin "Açık" görünmeli. Başlangıcı yarına alın → öğrencide kaybolmalı.
9. **Yetkisiz sınıf:** Öğretmen oturumunda `api/ogretmen.php?islem=tablo&sinif=<vermediğiniz sınıf>` → 403. `&ders_id=<başka ders>` → 403.
10. **İki öğretmen:** Aynı dersi farklı sınıflara veren iki öğretmenle girin. Her biri yalnızca kendi sınıflarını görmeli; CSV'de de yalnızca kendi sınıfları olmalı.
11. **Ölçüt düzeltme:** Bir puana tıklayıp öğretmen ölçütünü girin, kaydedin. Tablodaki "bekliyor" rozeti kalkmalı, öğrenci ekranında puan güncellenmeli.
12. **CSV:** "CSV indir" ile dosyayı indirin ve Excel'de açın. Türkçe karakterler doğru, sütunlar ayrı, dosya adı `temrin-<ders>-<sinif>.csv` olmalı.
13. **Gizli dosyalar:** Tarayıcıdan `https://<adres>/.env` ve `https://<adres>/lib/db.php` açılmamalı (403/404). `.env` zaten `public_html` dışında olmalı.
14. **Çıkış:** "Çıkış" sonrası ana sayfa "Oturum yok" demeli.
