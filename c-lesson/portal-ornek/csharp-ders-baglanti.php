<?php
/**
 * OKUL PORTALI İÇİN ÖRNEK KOD
 * ---------------------------------------------------------------------------
 * Bu dosyayı okul portalınıza ekleyin. Giriş yapmış kullanıcı için C# Form Stüdyosu'na
 * otomatik giriş bağlantısı üretir. Ek kütüphane gerekmez (PHP 7.4+).
 *
 * Örnek kullanım (portalda bir sayfa, ör. csharp-git.php):
 *
 *     require 'csharp-ders-baglanti.php';
 *     $url = csharp_ders_baglanti(
 *         $ogrenci['okul_no'],          // uid   : kalıcı ve benzersiz kullanıcı kodu
 *         $ogrenci['ad_soyad'],         // name  : ekranda görünecek ad
 *         $ogrenci['ogretmen_mi'] ? 'ogretmen' : 'ogrenci',
 *         $ogrenci['sinif']             // sinif : ör. "11-A" (öğretmen için boş olabilir)
 *     );
 *     header('Location: ' . $url);
 *     exit;
 *
 * Portaldaki menüye "C# Dersi" bağlantısı olarak csharp-git.php'yi koyabilirsiniz.
 */

// C# Form Stüdyosu'nun adresi (sonunda / olmadan)
const CSHARP_DERS_ADRES = 'https://csharp.okulunuz.k12.tr';

// C# Form Stüdyosu'ndaki config.php dosyasındaki 'jwt_secret' ile AYNI olmalı. Kimseyle paylaşmayın.
const CSHARP_DERS_ANAHTAR = 'BURAYA-EN-AZ-32-KARAKTERLIK-RASTGELE-BIR-ANAHTAR-YAZIN';

function csharp_ders_b64url(string $s): string
{
    return rtrim(strtr(base64_encode($s), '+/', '-_'), '=');
}

/**
 * @param string $uid    Kalıcı kullanıcı kodu (okul numarası, T.C. değil!). Projeler buna bağlanır.
 * @param string $name   Ad soyad
 * @param string $role   'ogrenci' veya 'ogretmen'
 * @param string $sinif  Sınıf/şube (öğretmen panelinde filtre için)
 * @param int|null $projeId İsteğe bağlı: doğrudan açılacak proje numarası
 */
function csharp_ders_baglanti(string $uid, string $name, string $role = 'ogrenci', string $sinif = '', ?int $projeId = null): string
{
    $simdi = time();
    $payload = [
        'uid'   => $uid,
        'name'  => $name,
        'role'  => $role === 'ogretmen' ? 'ogretmen' : 'ogrenci',
        'sinif' => $sinif,
        'iat'   => $simdi,
        'exp'   => $simdi + 300,                 // 5 dakika geçerli
        'jti'   => bin2hex(random_bytes(16)),    // tek kullanımlık
    ];
    $header = csharp_ders_b64url(json_encode(['alg' => 'HS256', 'typ' => 'JWT']));
    $body   = csharp_ders_b64url(json_encode($payload, JSON_UNESCAPED_UNICODE));
    $imza   = csharp_ders_b64url(hash_hmac('sha256', "$header.$body", CSHARP_DERS_ANAHTAR, true));
    $url = CSHARP_DERS_ADRES . '/giris.php?token=' . urlencode("$header.$body.$imza");
    if ($projeId !== null) $url .= '&proje=' . $projeId;
    return $url;
}
