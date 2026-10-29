<?php
// Portal tarafında kullanılacak örnek kod (PHP 8.1+). Anahtar yalnızca portal sunucusunda durur.
//
//   1) Giriş bağlantısı:
//        header('Location: ' . temrin_giris_baglantisi('https://temrin.okul.../', $anahtar, [...]));
//   2) Puanları çekme (sunucudan sunucuya):
//        $yanit = temrin_puanlari('https://temrin.okul.../', $anahtar, ['ders_id' => 'PRG-11DB']);
//
// Komut satırından deneme:
//   php araclar/portal-ornek.php token  <adres> <anahtar>            → giriş bağlantısı yazar
//   php araclar/portal-ornek.php puanlar <adres> <anahtar> [sorgu]  → puanlar.php yanıtını yazar
declare(strict_types=1);

function temrin_b64url(string $s): string
{
    return rtrim(strtr(base64_encode($s), '+/', '-_'), '=');
}

/** $k: uid, okul_no, name, role (ogrenci|ogretmen), sinif, ders_id, ders */
function temrin_giris_baglantisi(string $adres, string $anahtar, array $k): string
{
    $simdi = time();
    $govde = $k + ['iat' => $simdi, 'exp' => $simdi + 300, 'jti' => bin2hex(random_bytes(16))];
    $h = temrin_b64url(json_encode(['alg' => 'HS256', 'typ' => 'JWT']));
    $b = temrin_b64url(json_encode($govde, JSON_UNESCAPED_UNICODE));
    $s = temrin_b64url(hash_hmac('sha256', "$h.$b", $anahtar, true));
    return rtrim($adres, '/') . '/giris.php?token=' . "$h.$b.$s";
}

/** puanlar.php'yi imzalı çağırır. $parametreler: ders_id, okul_no, degisen_sonra, sayfa, adet, detay */
function temrin_puanlari(string $adres, string $anahtar, array $parametreler = []): array
{
    $sorgu = http_build_query($parametreler, '', '&', PHP_QUERY_RFC3986);
    $zaman = (string)time();
    $imza = hash_hmac('sha256', $zaman . "\n" . $sorgu, $anahtar);
    $url = rtrim($adres, '/') . '/api/puanlar.php' . ($sorgu !== '' ? '?' . $sorgu : '');
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 20,
        CURLOPT_HTTPHEADER => ["X-Zaman: $zaman", "X-Imza: $imza", 'Accept: application/json'],
    ]);
    $govde = curl_exec($ch);
    $durum = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);
    if ($govde === false) throw new RuntimeException('Temrin sunucusuna ulaşılamadı.');
    $veri = json_decode($govde, true);
    if (!is_array($veri)) throw new RuntimeException("Beklenmeyen yanıt (HTTP $durum).");
    return ['http' => $durum] + $veri;
}

if (PHP_SAPI === 'cli' && realpath($argv[0] ?? '') === __FILE__) {
    [$_, $islem, $adres, $anahtar] = array_pad($argv, 4, '');
    if ($islem === 'token') {
        echo temrin_giris_baglantisi($adres, $anahtar, [
            'uid' => 'P-3268', 'okul_no' => '3268', 'name' => 'Deneme Öğrenci', 'role' => $argv[4] ?? 'ogrenci',
            'sinif' => '11 Donanım B', 'ders_id' => 'PRG-11DB', 'ders' => 'Programlama (C#)',
        ]), "\n";
    } elseif ($islem === 'puanlar') {
        parse_str($argv[4] ?? '', $p);
        echo json_encode(temrin_puanlari($adres, $anahtar, $p), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE), "\n";
    } else {
        fwrite(STDERR, "Kullanım: php portal-ornek.php token|puanlar <adres> <anahtar> [rol|sorgu]\n");
        exit(1);
    }
}
