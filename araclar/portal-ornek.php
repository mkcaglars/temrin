<?php
// Giriş bağlantısı üretir (portal tarafındaki temrin-git.php ile aynı token). Deneme ve test içindir.
//
//   php araclar/portal-ornek.php <adres> <anahtar> ogrenci
//   php araclar/portal-ornek.php <adres> <anahtar> ogretmen "11 Donanım B" "11 Yazılım A"
declare(strict_types=1);

function temrin_b64url(string $s): string
{
    return rtrim(strtr(base64_encode($s), '+/', '-_'), '=');
}

function temrin_token(string $anahtar, array $govde, array $baslik = ['alg' => 'HS256', 'typ' => 'JWT']): string
{
    $h = temrin_b64url(json_encode($baslik));
    $b = temrin_b64url(json_encode($govde, JSON_UNESCAPED_UNICODE));
    return "$h.$b." . temrin_b64url(hash_hmac('sha256', "$h.$b", $anahtar, true));
}

/** $k: uid, okul_no, name, role (ogrenci|ogretmen), sinif, ders_id, ders, siniflar (öğretmen) */
function temrin_giris_baglantisi(string $adres, string $anahtar, array $k): string
{
    $simdi = time();
    $govde = $k + ['iat' => $simdi, 'exp' => $simdi + 300, 'jti' => bin2hex(random_bytes(16))];
    return rtrim($adres, '/') . '/giris.php?token=' . urlencode(temrin_token($anahtar, $govde));
}

if (PHP_SAPI === 'cli' && realpath($argv[0] ?? '') === __FILE__) {
    if ($argc < 4) {
        fwrite(STDERR, "Kullanım: php portal-ornek.php <adres> <anahtar> ogrenci|ogretmen [sınıf ...]\n");
        exit(1);
    }
    [$_, $adres, $anahtar, $rol] = $argv;
    $k = $rol === 'ogretmen'
        ? ['uid' => 'ogretmen-1', 'okul_no' => '', 'name' => 'Deneme Öğretmen', 'role' => 'ogretmen', 'sinif' => '',
           'siniflar' => array_slice($argv, 4) ?: ['11 Donanım B']]
        : ['uid' => '3268', 'okul_no' => '3268', 'name' => 'Deneme Öğrenci', 'role' => 'ogrenci', 'sinif' => '11 Donanım B', 'siniflar' => []];
    echo temrin_giris_baglantisi($adres, $anahtar, $k + ['ders_id' => '7', 'ders' => 'Programlama (C#)']), "\n";
}
