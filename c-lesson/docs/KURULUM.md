# Hostinger'a Kurulum

Hostinger **Business** (paylaşımlı) paketi yeterlidir. Derleme öğrencinin tarayıcısında yapıldığı için sunucuda .NET gerekmez. PHP 8.1+ ve MySQL yeterlidir.

## 1. Alan adı / alt alan adı

hPanel > **Alan Adları > Alt Alan Adları** bölümünden örneğin `csharp.okulunuz.k12.tr` oluşturun. Klasörü genellikle `domains/csharp.okulunuz.k12.tr/public_html` olur.
SSL (HTTPS) sertifikasının açık olduğundan emin olun (hPanel > Güvenlik > SSL).

PHP sürümünü hPanel > **Gelişmiş > PHP Yapılandırması** bölümünden **8.2 veya üstü** seçin.

## 2. Veritabanı

hPanel > **Veritabanları > MySQL Veritabanları** bölümünden yeni bir veritabanı ve kullanıcı oluşturun. Veritabanı adı, kullanıcı adı ve şifreyi not edin. Tablolar ilk girişte otomatik oluşturulur.

## 3. Ayar dosyası

`web/api/config.example.php` dosyasını kopyalayıp düzenleyin. En güvenli yer, web'den erişilemeyen bir üst klasördür:

```
/home/u123456789/domains/csharp.okulunuz.k12.tr/csharp-ders-config.php   ← önerilen
/home/u123456789/domains/csharp.okulunuz.k12.tr/public_html/api/config.php ← alternatif
```

Uygulama önce `public_html`'in bir üstündeki `csharp-ders-config.php` dosyasını arar, bulamazsa `api/config.php` dosyasına bakar.

Düzenlenecek alanlar:

| Ayar | Açıklama |
|---|---|
| `db.dsn`, `db.user`, `db.pass` | 2. adımdaki MySQL bilgileri |
| `jwt_secret` | Portal ile paylaşılan gizli anahtar. Üretmek için: `php -r "echo bin2hex(random_bytes(32));"` |
| `portal_url` | Oturum yokken öğrencilerin yönlendirileceği portal adresi |
| `test_portal` | Yalnızca deneme için `true`. Canlıda **mutlaka `false`** |

## 4. Dosyaları yükleme

### A) GitHub Actions ile otomatik (önerilir)

Her `main` dalına gönderimde site derlenir ve FTP ile yüklenir.

1. hPanel > **Dosyalar > FTP Hesapları** bölümünden bir FTP hesabı oluşturun veya mevcut olanın bilgilerini alın.
2. GitHub deposunda **Settings > Secrets and variables > Actions** bölümüne şunları ekleyin:
   - Secrets: `FTP_SERVER` (ör. `ftp.okulunuz.k12.tr` veya IP), `FTP_USERNAME`, `FTP_PASSWORD`
   - Variables: `FTP_DIR`. FTP hesabının kök klasörüne göre site klasörünü yazın, sonunda `/` olsun (ör. `domains/csharp.okulunuz.k12.tr/public_html/`).
3. `main` dalına bir değişiklik gönderin veya Actions sekmesinden **Derle ve Yayınla** iş akışını elle çalıştırın.

`api/config.php` hiçbir zaman üzerine yazılmaz.

### B) Elle

Kendi bilgisayarınızda .NET 10 SDK ve Node.js kurulu olmalı:

```bash
npm install
./build.sh
```

Oluşan `dist/` klasörünün **içindekileri** hPanel Dosya Yöneticisi veya FTP ile `public_html` klasörüne yükleyin. Gizli `.htaccess` dosyaları da yüklenmelidir.

GitHub Actions'ta her derlemenin çıktısı "site" adlı bir artifact olarak da indirilebilir.

## 5. Deneme

1. Ayarlarda geçici olarak `'test_portal' => true` yapın.
2. `https://csharp.okulunuz.k12.tr/test-portal.php` adresinden öğrenci olarak giriş yapın ve bir proje oluşturup çalıştırın.
3. Öğretmen rolüyle giriş yapıp **Öğretmen Paneli**'ni kontrol edin.
4. Deneme bitince `'test_portal' => false` yapın.

## 6. Okul portalı

Portal tarafında yapılacaklar için [PORTAL.md](PORTAL.md) belgesine bakın.

## Sorun giderme

| Belirti | Çözüm |
|---|---|
| "Ayar dosyası bulunamadı" | 3. adım: dosya adı ve konumu |
| "Veritabanı hatası" | `db` bilgileri; hPanel'de kullanıcının veritabanına yetkisi |
| Sayfa açılıyor ama "Derleyici yüklenemedi" | `_framework` klasörü eksik yüklenmiş olabilir; `.htaccess` dosyasının yüklendiğini kontrol edin |
| "Giriş bağlantısının süresi dolmuş" | Portal ile sunucunun saati farklı olabilir; ya da bağlantı 5 dakikadan eski |
| "İmza geçersiz" | Portal ile `config.php` içindeki `jwt_secret` aynı değil |

İlk açılışta tarayıcı yaklaşık 11 MB indirir; sonraki girişlerde dosyalar tarayıcı önbelleğinden gelir.
