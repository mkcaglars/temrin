# Okul Portalı Entegrasyonu (Token Sistemi)

Öğrenci ve öğretmenler C# Form Stüdyosu'na şifre girmeden, okul portalındaki bir bağlantıyla girer. Portal, kullanıcının bilgilerini **gizli bir anahtarla imzalar**; C# Form Stüdyosu imzayı doğrular. Bu sayede URL'deki isim veya rol değiştirilerek başka birinin hesabına girilemez.

## Akış

```
Öğrenci portalda "C# Dersi"ne tıklar
   → Portal imzalı bağlantı üretir:  https://csharp.okul.../giris.php?token=eyJhbGciOi...
   → giris.php imzayı, süreyi ve tek kullanımlığı denetler
   → Kullanıcı ilk girişte otomatik oluşturulur, oturum açılır (varsayılan 10 saat)
   → Projelerim sayfası açılır
```

## Token biçimi

Standart **JWT (HS256)**. Herhangi bir JWT kütüphanesiyle veya aşağıdaki PHP koduyla üretilebilir.

| Alan | Zorunlu | Örnek | Açıklama |
|---|---|---|---|
| `uid` | evet | `"1001"` | Kalıcı ve benzersiz kullanıcı kodu (okul no). Projeler bu koda bağlanır. **T.C. kimlik numarası kullanmayın.** |
| `name` | evet | `"Ali Yılmaz"` | Ekranda görünen ad (her girişte güncellenir) |
| `role` | hayır | `"ogrenci"` / `"ogretmen"` | Varsayılan öğrenci |
| `sinif` | hayır | `"11-A"` | Öğretmen panelinde sınıf filtresi için |
| `exp` | evet | `1760000000` | Son geçerlilik (Unix zamanı). En fazla **5 dakika** sonrası olmalı |
| `iat` | hayır | `1759999700` | Üretilme zamanı |
| `jti` | evet | `"9f86d081884c7d65..."` | Rastgele, tek kullanımlık kod (en fazla 64 karakter) |

İmza anahtarı, C# Form Stüdyosu'ndaki ayar dosyasının `jwt_secret` değeri ile **aynı** olmalıdır.

Güvenlik kuralları:
- Süresi geçmiş (`exp`) bağlantı reddedilir. Sunucu saatleri arasındaki küçük farklar (30 sn) tolere edilir.
- Aynı `jti` ikinci kez kullanılamaz. Paylaşılan veya tarayıcı geçmişinde kalan bağlantı işe yaramaz.
- Anahtar yalnızca portal sunucusunda durmalıdır; tarayıcıya (JavaScript'e) asla gönderilmemelidir.

## PHP ile kullanım

[`portal-ornek/csharp-ders-baglanti.php`](../portal-ornek/csharp-ders-baglanti.php) dosyasını portala ekleyin, içindeki adres ve anahtarı düzenleyin:

```php
require 'csharp-ders-baglanti.php';

// Portalda giriş yapmış kullanıcının bilgileri
$url = csharp_ders_baglanti($kullanici['okul_no'], $kullanici['ad_soyad'],
                            $kullanici['ogretmen'] ? 'ogretmen' : 'ogrenci',
                            $kullanici['sinif']);
header('Location: ' . $url);
exit;
```

Portalın menüsüne bu sayfaya giden bir "C# Dersi" bağlantısı koymanız yeterlidir. Bağlantıyı sayfa yüklenirken önceden üretip HTML'e yazmak yerine, tıklanınca üreten ayrı bir sayfa kullanın. Aksi halde 5 dakikalık süre dolabilir.

İsteğe bağlı: `csharp_ders_baglanti(..., $projeId)` ile doğrudan belirli bir proje açtırılabilir (`giris.php?token=...&proje=12`).

## Deneme

Portal hazır olmadan denemek için ayarlarda `'test_portal' => true` yapıp `test-portal.php` sayfasını kullanın. Bu sayfa da aynı imzalı bağlantıyı üretir. Canlı kullanımda kapatın.
