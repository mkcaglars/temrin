# Temrin ↔ Portal Entegrasyonu

İki bağlantı vardır, ikisi de aynı gizli anahtarı kullanır (`PORTAL_SSO_ANAHTAR`, en az 32 karakter):

1. **Giriş:** Portal, kullanıcıyı imzalı bir bağlantıyla temrin sayfasına gönderir.
2. **Puan API'si:** Portal, puanları sunucudan sunucuya çeker.

Örnek portal kodu (PHP): [`araclar/portal-ornek.php`](../araclar/portal-ornek.php)

---

## 1. Giriş

```
GET https://<temrin-adresi>/giris.php?token=<JWT>
```

JWT başlığı `{"alg":"HS256","typ":"JWT"}` olmalıdır. Başka `alg` değerleri (`none`, `HS512`…) reddedilir.

| Alan | Zorunlu | Açıklama |
|---|---|---|
| `uid` | evet | Portaldaki kalıcı kullanıcı kodu |
| `okul_no` | öğrencide evet | Puanlar `okul_no + ders_id` ile saklanır |
| `name` | evet | Ad soyad |
| `role` | evet | `ogrenci` ya da `ogretmen` |
| `sinif` | hayır | Ör. `11 Donanım B` |
| `ders_id` | evet | Dersin portaldaki kodu. Oturum boyunca bu derse sabitlenir, kullanıcı değiştiremez |
| `ders` | hayır | Dersin adı (ekranda gösterilir) |
| `exp` | evet | Unix zamanı (saniye). 5 dakika önerilir. 30 saniyelik saat farkı tolere edilir |
| `jti` | evet | Rastgele, en fazla 64 karakter. Her bağlantı yalnızca bir kez kullanılabilir |
| `iat` | hayır | Üretilme zamanı |

Başarılı girişte oturum yenilenir (`session_regenerate_id`) ve 8 saatlik `HttpOnly; Secure; SameSite=Lax` çerez verilir. Hatalı ya da kullanılmış bağlantıda kullanıcıya Türkçe bir mesaj gösterilir (HTTP 401).

Bağlantıyı kullanıcı tıkladığı anda üretin. Sayfa yüklenirken önceden üretirseniz süre dolabilir.

---

## 2. Puan API'si

```
GET https://<temrin-adresi>/api/puanlar.php?<sorgu>
```

### Kimlik doğrulama

| Başlık | Değer |
|---|---|
| `X-Zaman` | Unix zamanı, saniye (ör. `1793344500`). Sunucu saatinden ±60 saniyeden fazla farklıysa reddedilir |
| `X-Imza` | `hex( HMAC-SHA256( X-Zaman + "\n" + sorgu_dizesi, PORTAL_SSO_ANAHTAR ) )`, 64 karakter |

**Sorgu dizesi,** URL'de `?` işaretinden sonra gönderdiğiniz metnin **karakteri karakterine aynısıdır.** Sorgu yoksa boş metin (`""`) kullanılır. Önce sorgu dizesini üretin, sonra aynı metni hem imzalayın hem URL'ye koyun:

```php
$sorgu = http_build_query(['ders_id' => 'PRG-11DB', 'adet' => 200], '', '&', PHP_QUERY_RFC3986);
$zaman = (string)time();
$imza  = hash_hmac('sha256', $zaman . "\n" . $sorgu, $anahtar);
// GET /api/puanlar.php?$sorgu   X-Zaman: $zaman   X-Imza: $imza
```

**Tarayıcıdan erişim kapalıdır.** `Origin` ya da `Sec-Fetch-*` başlığı taşıyan istekler reddedilir (403), CORS izni verilmez. İsteğe bağlı olarak `.env` dosyasındaki `PORTAL_IP_IZINLI` ile yalnızca portal sunucusunun IP adresi açılabilir.

### Parametreler (hepsi isteğe bağlı)

| Parametre | Açıklama |
|---|---|
| `ders_id` | Yalnızca bu dersin puanları |
| `okul_no` | Yalnızca bu öğrencinin puanları |
| `degisen_sonra` | Yalnızca bu zamanda ya da sonrasında değişen kayıtlar. Biçim: `2026-11-02T07:15:00Z` (UTC) |
| `adet` | Sayfa başına kayıt, 1–500 (varsayılan 100) |
| `devam` | Sonraki sayfa için önceki yanıttaki `devam` değeri (aynen) |
| `detay` | `1` → her kayda ölçüt ayrıntısı (`olcutler`) eklenir |

Tanınmayan bir parametre 400 döner. Bu sayede yazım hataları sessizce yok sayılmaz.

### Yanıt

```json
{
  "durum": "tamam",
  "sunucu_zamani": "2026-11-02T07:20:05Z",
  "puan_olcegi": { "en_dusuk": 0, "en_yuksek": 100 },
  "adet": 1,
  "toplam": 1,
  "devam": null,
  "puanlar": [
    {
      "ders_id": "PRG-11DB",
      "temrin_id": 12,
      "temrin_no": 3,
      "temrin_adi": "Döngüler",
      "okul_no": "3268",
      "ad_soyad": "Ahmet Özdoğan",
      "sinif": "11 Donanım B",
      "puan": 85,
      "kesin": true,
      "teslim_zamani": "2026-11-02T07:05:41Z",
      "guncellenme_zamani": "2026-11-02T07:18:10Z",
      "olcutler": [
        { "no": "O1", "baslik": "İş sağlığı ve güvenliği kurallarına uyulması", "puan": 5, "tip": "ogretmen",
          "alinan": 5, "tespit": "", "duzenleyen": "ogretmen" },
        { "no": "O5", "baslik": "for döngüsünün doğru kurulması", "puan": 20, "tip": "otomatik",
          "alinan": 16, "tespit": "txtN=0 için liste boş kalmalı", "duzenleyen": "sistem" }
      ]
    }
  ]
}
```

| Alan | Açıklama |
|---|---|
| `puan` | Temrin puanı, **0–100 tam sayı**. Her öğrencinin her temrin için tek kaydı vardır (`okul_no + temrin_id`) |
| `kesin` | `false`: öğretmenin puanlayacağı ölçütler henüz girilmedi. `puan` yalnızca puanlanmış ölçütlerin toplamıdır. **Karneye yalnızca `kesin: true` olanları alın** |
| `olcutler[].alinan` | `null` → bu ölçüt henüz puanlanmadı |
| `olcutler[].duzenleyen` | `sistem` (otomatik test) ya da `ogretmen` (öğretmen girdi ya da düzeltti) |
| Tüm zamanlar | ISO 8601, UTC, saniye hassasiyetinde (`Z` ile biter) |
| `toplam` | Süzgeçlere uyan kayıt sayısı (`devam` hariç) |
| `devam` | Daha fazla kayıt varsa sonraki sayfa için anahtar, yoksa `null` |

Kayıtlar `guncellenme_zamani` sırasına göre gelir. Öğretmen bir notu düzelttiğinde kaydın `guncellenme_zamani` yenilenir.

### Önerilen eşitleme

1. İlk seferde `degisen_sonra` olmadan, `devam` null olana kadar sayfaları çekin.
2. **İlk sayfanın** `sunucu_zamani` değerini saklayın.
3. Sonraki eşitlemede `degisen_sonra=<saklanan değer>` ile yine `devam` null olana kadar çekin, yeni `sunucu_zamani` değerini saklayın.
4. Kayıtları `okul_no + temrin_id` anahtarıyla **güncelleyerek ekleyin (upsert).** Aynı kayıt iki kez gelebilir; bu kayıp olmaması için bilerek böyledir.

`devam` anahtarı son alınan kayıttan devam eder. Sayfalama sürerken bir not değişse de kayıt atlanmaz.

### Hata yanıtları

```json
{ "durum": "hata", "kod": "IMZA_GECERSIZ", "mesaj": "X-Imza doğrulanamadı." }
```

| HTTP | `kod` | Anlamı |
|---|---|---|
| 400 | `PARAMETRE_HATALI` | Bilinmeyen parametre, hatalı biçim, `adet` aralık dışı, geçersiz `devam` |
| 401 | `KIMLIK_EKSIK` | `X-Zaman` ya da `X-Imza` yok |
| 401 | `ZAMAN_GECERSIZ` | `X-Zaman` sunucu saatinden ±60 saniyeden fazla farklı (sunucu saatlerini NTP ile eşitleyin) |
| 401 | `IMZA_GECERSIZ` | İmza tutmuyor (anahtar ya da imzalanan sorgu dizesi farklı) |
| 403 | `TARAYICI_ERISIMI` | İstek tarayıcıdan geldi |
| 403 | `IP_IZINSIZ` | `PORTAL_IP_IZINLI` tanımlı ve istek başka bir IP'den geldi |
| 405 | `YONTEM_GECERSIZ` | GET dışında yöntem |
| 500 | `SUNUCU_HATASI` | Sunucu hatası; ayrıntı sunucu günlüğünde (anahtar günlüğe yazılmaz) |
| 503 | `AYAR_EKSIK` | Sunucuda `PORTAL_SSO_ANAHTAR` tanımlı değil ya da 32 karakterden kısa |

---

## Deneme

```bash
php araclar/portal-ornek.php token   https://<temrin-adresi> <anahtar> [ogrenci|ogretmen]
php araclar/portal-ornek.php puanlar https://<temrin-adresi> <anahtar> "ders_id=PRG-11DB&detay=1"
```

Uçtan uca test (yerel PHP sunucusu ve geçici SQLite ile):

```bash
php tests/sunucu_testi.php
```
