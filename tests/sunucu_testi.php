<?php
// Uçtan uca test: geçici .env + SQLite ile php -S başlatır; giriş, erişim, puanlama ve puan API'sini dener.
//   php tests/sunucu_testi.php
declare(strict_types=1);

require __DIR__ . '/../araclar/portal-ornek.php';

$kok = dirname(__DIR__);
$gecici = sys_get_temp_dir() . '/temrin-test-' . bin2hex(random_bytes(4));
mkdir($gecici);
$anahtar = bin2hex(random_bytes(32));
$db = "$gecici/test.sqlite";
file_put_contents("$gecici/.env", "PORTAL_SSO_ANAHTAR=$anahtar\nDB_DSN=sqlite:$db\nSAAT_DILIMI=Europe/Istanbul\n");

$port = 18000 + random_int(0, 999);
$adres = "http://127.0.0.1:$port";
$sunucu = proc_open(['php', '-d', "session.save_path=$gecici", '-S', "127.0.0.1:$port", '-t', "$kok/web"], [1 => ['file', '/dev/null', 'w'], 2 => ['file', "$gecici/sunucu.log", 'w']],
    $_, null, ['TEMRIN_ENV_DOSYASI' => "$gecici/.env"] + getenv());
register_shutdown_function(function () use ($sunucu, $gecici) {
    proc_terminate($sunucu);
    array_map('unlink', array_filter(glob("$gecici/{,.}*", GLOB_BRACE) ?: [], 'is_file'));
    @rmdir($gecici);
});
for ($i = 0; $i < 50 && !@fsockopen('127.0.0.1', $port); $i++) usleep(100000);

$basarili = 0; $hatali = 0;
function dogrula(bool $kosul, string $ad): void
{
    global $basarili, $hatali;
    if ($kosul) { $basarili++; echo "  ✓ $ad\n"; } else { $hatali++; echo "  ✗ $ad\n"; }
}

/** HTTP isteği; çerezler $kavanoz dosyasında tutulur. Secure çerezler http üzerinden de gönderilsin diye elle taşınır. */
function istek(string $url, array $se = []): array
{
    $ch = curl_init($url);
    $baslik = $se['baslik'] ?? [];
    if (!empty($se['cerez'])) $baslik[] = 'Cookie: ' . $se['cerez'];
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_HEADER => true, CURLOPT_HTTPHEADER => $baslik]);
    if (isset($se['govde'])) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($se['govde']));
    }
    if (isset($se['yontem'])) curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $se['yontem']);
    $yanit = curl_exec($ch);
    $hb = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
    $durum = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $basliklar = substr($yanit, 0, $hb);
    $govde = substr($yanit, $hb);
    preg_match_all('/^Set-Cookie:\s*([^;\r\n]+)(.*)$/mi', $basliklar, $m);
    return ['durum' => $durum, 'basliklar' => $basliklar, 'govde' => $govde, 'json' => json_decode($govde, true),
            'cerez' => $m[1][0] ?? null, 'cerez_ozellik' => $m[2][0] ?? ''];
}

$ogrenci = ['uid' => 'P-3268', 'okul_no' => '3268', 'name' => 'Ahmet Özdoğan', 'role' => 'ogrenci',
            'sinif' => '11 Donanım B', 'ders_id' => 'PRG-11DB', 'ders' => 'Programlama (C#)'];
$ogretmen = ['uid' => 'T-1', 'okul_no' => '', 'name' => 'Mustafa Kemal Çağlar', 'role' => 'ogretmen',
             'sinif' => '', 'ders_id' => 'PRG-11DB', 'ders' => 'Programlama (C#)'];

function giris(array $k): array
{
    global $adres, $anahtar;
    return istek(temrin_giris_baglantisi($adres, $anahtar, $k));
}

echo "Giriş\n";
$url = temrin_giris_baglantisi($adres, $anahtar, $ogrenci);
$g = istek($url);
dogrula($g['durum'] === 303, 'geçerli token → 303 yönlendirme');
dogrula($g['cerez'] !== null && stripos($g['cerez_ozellik'], 'HttpOnly') !== false && stripos($g['cerez_ozellik'], 'secure') !== false
        && stripos($g['cerez_ozellik'], 'SameSite=Lax') !== false, 'çerez HttpOnly; Secure; SameSite=Lax');
dogrula(preg_match('/Max-Age=28800/i', $g['cerez_ozellik']) === 1, 'oturum 8 saat');
$cerezOgrenci = $g['cerez'];
dogrula(istek($url)['durum'] === 401, 'aynı token ikinci kez → 401 (jti)');
dogrula(str_contains(istek("$adres/", ['cerez' => $cerezOgrenci])['govde'], 'Ahmet Özdoğan'), 'oturumla ana sayfa açılır');

[$h, $b, $s] = explode('.', explode('token=', temrin_giris_baglantisi($adres, $anahtar, $ogrenci))[1]);
dogrula(istek("$adres/giris.php?token=$h.$b." . strrev($s))['durum'] === 401, 'bozuk imza → 401');
$none = temrin_b64url(json_encode(['alg' => 'none'])) . ".$b.";
dogrula(istek("$adres/giris.php?token=$none")['durum'] === 401, 'alg=none → 401');
$hs512 = temrin_b64url(json_encode(['alg' => 'HS512', 'typ' => 'JWT']));
dogrula(istek("$adres/giris.php?token=$hs512.$b.$s")['durum'] === 401, 'alg=HS512 → 401');
dogrula(giris(['name' => 'X', 'okul_no' => '1', 'ders_id' => 'D'] + ['uid' => ''])['durum'] === 401, 'boş uid → 401');
dogrula(giris(['uid' => 'U', 'okul_no' => '1', 'ders_id' => 'D', 'name' => '  '])['durum'] === 401, 'boş name → 401');
dogrula(giris(['uid' => 'U', 'okul_no' => '1', 'name' => 'A'])['durum'] === 401, 'ders_id yok → 401');
$eski = (function () use ($adres, $anahtar, $ogrenci) {
    $p = $ogrenci + ['exp' => time() - 120, 'jti' => bin2hex(random_bytes(8))];
    $h = temrin_b64url(json_encode(['alg' => 'HS256'])); $b = temrin_b64url(json_encode($p));
    return "$adres/giris.php?token=$h.$b." . temrin_b64url(hash_hmac('sha256', "$h.$b", $anahtar, true));
})();
dogrula(istek($eski)['durum'] === 401, 'süresi geçmiş exp → 401');

// Test verisi: iki temrin, biri kapalı
$pdo = new PDO("sqlite:$db");
$simdi = gmdate('Y-m-d\TH:i:s\Z');
$pdo->exec("INSERT INTO temrinler (ders_id, temrin_no, baslik, tanim, erisim_acik, olusturma) VALUES
  ('PRG-11DB', 3, 'Döngüler', '', 0, '$simdi'), ('PRG-11DB', 4, 'Diziler', '', 0, '$simdi'), ('BASKA', 1, 'Başka ders', '', 1, '$simdi')");

echo "Temrin erişimi\n";
$go = giris($ogretmen);
$cerezOgretmen = $go['cerez'];
dogrula(count(istek("$adres/api/temrinler.php", ['cerez' => $cerezOgrenci])['json']['temrinler']) === 0, 'öğrenci kapalı temrinleri görmez');
$ogt = istek("$adres/api/temrinler.php", ['cerez' => $cerezOgretmen])['json']['temrinler'];
dogrula(count($ogt) === 2, 'öğretmen yalnızca kendi dersinin temrinlerini görür');

// Arayüz henüz yok; CSRF anahtarı test sunucusunun oturum dosyasından okunur.
$oturumNo = explode('=', $cerezOgretmen, 2)[1];
preg_match('/csrf\|s:64:"([0-9a-f]{64})"/', (string)file_get_contents("$gecici/sess_$oturumNo"), $m);
$csrf = $m[1] ?? '';
dogrula($csrf !== '', 'oturumda CSRF anahtarı var');
$ayarla = fn(array $govde, ?string $cerez = null, ?string $c = null) => istek("$adres/api/temrinler.php",
    ['yontem' => 'POST', 'govde' => $govde, 'cerez' => $cerez ?? $cerezOgretmen, 'baslik' => ['X-CSRF-Token: ' . ($c ?? $csrf)]]);
dogrula($ayarla(['temrin_id' => 1, 'erisim_acik' => true], $cerezOgrenci)['durum'] === 403, 'öğrenci erişimi değiştiremez');
dogrula($ayarla(['temrin_id' => 1, 'erisim_acik' => true], null, 'yanlis')['durum'] === 403, 'CSRF anahtarı olmadan değiştirilemez');
dogrula($ayarla(['temrin_id' => 3, 'erisim_acik' => true])['durum'] === 404, 'başka dersin temrini değiştirilemez');
$r = $ayarla(['temrin_id' => 1, 'erisim_acik' => true]);
dogrula($r['durum'] === 200 && $r['json']['temrin']['erisilebilir'] === true, 'öğretmen temrini açar');
dogrula(count(istek("$adres/api/temrinler.php", ['cerez' => $cerezOgrenci])['json']['temrinler']) === 1, 'öğrenci açık temrini görür');
$yarin = (new DateTimeImmutable('+1 day', new DateTimeZone('Europe/Istanbul')))->format('Y-m-d\TH:i');
$r = $ayarla(['temrin_id' => 1, 'erisim_acik' => true, 'baslangic' => $yarin]);
dogrula($r['json']['temrin']['erisilebilir'] === false && str_contains($r['json']['temrin']['neden'], 'başlayacak'), 'başlangıç gelmeden erişilemez');
$dun = (new DateTimeImmutable('-1 day', new DateTimeZone('Europe/Istanbul')))->format('Y-m-d\TH:i');
$r = $ayarla(['temrin_id' => 1, 'erisim_acik' => true, 'baslangic' => $dun, 'bitis' => $yarin]);
dogrula($r['json']['temrin']['erisilebilir'] === true, 'aralık içinde erişilebilir');
dogrula($ayarla(['temrin_id' => 1, 'erisim_acik' => true, 'baslangic' => $yarin, 'bitis' => $dun])['durum'] === 400, 'bitiş başlangıçtan önce → 400');

echo "Teslim sonrası öğretmen puanlaması\n";
require_once "$kok/web/lib/sonuc.php";
putenv("TEMRIN_ENV_DOSYASI=$gecici/.env");
$olcutler = [
    ['no' => 'O1', 'baslik' => 'İSG', 'puan' => 5, 'tip' => 'ogretmen', 'alinan' => null, 'tespit' => '', 'duzenleyen' => 'sistem'],
    ['no' => 'O3', 'baslik' => 'Süre', 'puan' => 5, 'tip' => 'sure', 'alinan' => 5, 'tespit' => '', 'duzenleyen' => 'sistem'],
    ['no' => 'O5', 'baslik' => 'for', 'puan' => 20, 'tip' => 'otomatik', 'alinan' => 12, 'tespit' => 'txtN=0 için liste boş kalmalı', 'duzenleyen' => 'sistem'],
];
sonuc_kaydet(1, 'PRG-11DB', ['okul_no' => '3268', 'ad' => 'Ahmet Özdoğan', 'sinif' => '11 Donanım B'], $olcutler);
$s = istek("$adres/api/sonuclar.php", ['cerez' => $cerezOgrenci])['json']['sonuclar'];
dogrula(count($s) === 1 && $s[0]['puan'] === 17 && $s[0]['kesin'] === false, 'öğrenci sonucunu görür (eksik not varken kesin değil)');
$ayarla(['temrin_id' => 1, 'erisim_acik' => false]);
dogrula(count(istek("$adres/api/sonuclar.php", ['cerez' => $cerezOgrenci])['json']['sonuclar']) === 1, 'temrin kapansa da öğrenci sonucunu görür');
$puanla = fn(array $govde, ?string $cerez = null) => istek("$adres/api/sonuclar.php",
    ['yontem' => 'POST', 'govde' => $govde, 'cerez' => $cerez ?? $cerezOgretmen, 'baslik' => ['X-CSRF-Token: ' . $csrf]]);
dogrula($puanla(['temrin_id' => 1, 'okul_no' => '3268', 'olcutler' => [['no' => 'O1', 'alinan' => 5]]], $cerezOgrenci)['durum'] === 403, 'öğrenci puan değiştiremez');
dogrula($puanla(['temrin_id' => 1, 'okul_no' => '3268', 'olcutler' => [['no' => 'O1', 'alinan' => 6]]])['durum'] === 400, 'ölçüt puanını aşan not → 400');
dogrula($puanla(['temrin_id' => 1, 'okul_no' => '3268', 'olcutler' => [['no' => 'O9', 'alinan' => 1]]])['durum'] === 400, 'bilinmeyen ölçüt → 400');
$r = $puanla(['temrin_id' => 1, 'okul_no' => '3268', 'olcutler' => [
    ['no' => 'O1', 'alinan' => 4, 'tespit' => 'Çalışma alanı dağınık'], ['no' => 'O5', 'alinan' => 15]]]);
dogrula($r['durum'] === 200 && $r['json']['sonuc']['puan'] === 24 && $r['json']['sonuc']['kesin'] === true, 'öğretmen eksik notu girer, otomatik puanı düzeltir → kesin');
$o5 = array_values(array_filter($r['json']['sonuc']['olcutler'], fn($o) => $o['no'] === 'O5'))[0];
dogrula($o5['tespit'] === 'txtN=0 için liste boş kalmalı' && $o5['duzenleyen'] === 'ogretmen', 'gönderilmeyen tespit korunur, düzenleyen işaretlenir');
$liste = istek("$adres/api/sonuclar.php?temrin_id=1", ['cerez' => $cerezOgretmen])['json']['sonuclar'];
dogrula(count($liste) === 1 && !isset($liste[0]['olcutler']), 'öğretmen temrinin sınıf listesini görür');

echo "Puan API'si (portal)\n";
$api = fn(array $p) => temrin_puanlari($adres, $anahtar, $p);
$r = $api(['ders_id' => 'PRG-11DB', 'detay' => '1']);
dogrula($r['http'] === 200 && $r['toplam'] === 1 && $r['puanlar'][0]['puan'] === 24 && count($r['puanlar'][0]['olcutler']) === 3, 'imzalı istek → puanlar');
dogrula($api(['okul_no' => '3268'])['toplam'] === 1 && $api(['okul_no' => '9999'])['toplam'] === 0, 'okul_no süzgeci');
dogrula($api(['degisen_sonra' => gmdate('Y-m-d\TH:i:s\Z', time() + 5)])['toplam'] === 0, 'degisen_sonra süzgeci');
for ($i = 1; $i <= 4; $i++) {
    sonuc_kaydet(2, 'PRG-11DB', ['okul_no' => "10$i", 'ad' => "Öğrenci $i", 'sinif' => '11 Donanım B'], $olcutler);
}
$ilk = $api(['ders_id' => 'PRG-11DB', 'adet' => '2']);
dogrula($ilk['toplam'] === 5 && count($ilk['puanlar']) === 2 && $ilk['devam'] !== null, 'sayfalama: ilk sayfa ve devam anahtarı');
// Sayfalama sürerken ilk sayfadaki bir kaydın notu değişir: kayıt sona kayar, hiçbir kayıt atlanmaz.
sonuc_kaydet(1, 'PRG-11DB', ['okul_no' => '3268', 'ad' => 'Ahmet Özdoğan', 'sinif' => '11 Donanım B'], $olcutler);
$gorulen = array_column($ilk['puanlar'], 'okul_no');
$devam = $ilk['devam'];
while ($devam !== null) {
    $s = $api(['ders_id' => 'PRG-11DB', 'adet' => '2', 'devam' => $devam]);
    $gorulen = array_merge($gorulen, array_column($s['puanlar'], 'okul_no'));
    $devam = $s['devam'];
}
dogrula(count(array_unique($gorulen)) === 5, 'sayfalama sırasında değişen kayıt yüzünden kayıt atlanmaz');
dogrula($api(['devam' => 'bozuk!'])['http'] === 400, 'geçersiz devam → 400');
dogrula($api(['degisen_sonra' => $ilk['sunucu_zamani']])['toplam'] >= 1, 'degisen_sonra = önceki sunucu_zamani → değişen kayıt gelir');
dogrula($api(['bilinmeyen' => '1'])['http'] === 400, 'bilinmeyen parametre → 400');
dogrula($api(['adet' => '1000'])['http'] === 400, 'adet > 500 → 400');
$zaman = (string)(time() - 61);
$r = istek("$adres/api/puanlar.php", ['baslik' => ["X-Zaman: $zaman", 'X-Imza: ' . hash_hmac('sha256', "$zaman\n", $anahtar)]]);
dogrula($r['durum'] === 401 && $r['json']['kod'] === 'ZAMAN_GECERSIZ', '61 saniyelik zaman → 401');
$zaman = (string)time();
$r = istek("$adres/api/puanlar.php?ders_id=PRG-11DB", ['baslik' => ["X-Zaman: $zaman", 'X-Imza: ' . hash_hmac('sha256', "$zaman\nders_id=BASKA", $anahtar)]]);
dogrula($r['durum'] === 401 && $r['json']['kod'] === 'IMZA_GECERSIZ', 'sorgu değiştirilirse imza tutmaz');
dogrula(istek("$adres/api/puanlar.php")['json']['kod'] === 'KIMLIK_EKSIK', 'başlıksız → 401');
$r = istek("$adres/api/puanlar.php", ['baslik' => ['Origin: https://kotu.site', "X-Zaman: $zaman", 'X-Imza: ' . hash_hmac('sha256', "$zaman\n", $anahtar)]]);
dogrula($r['durum'] === 403 && !str_contains($r['basliklar'], 'Access-Control-Allow'), 'tarayıcıdan (Origin) → 403, CORS yok');
dogrula(istek("$adres/api/puanlar.php", ['yontem' => 'POST'])['durum'] === 405, 'POST → 405');
dogrula(!str_contains(file_get_contents("$gecici/sunucu.log"), $anahtar), 'anahtar sunucu günlüğünde yok');

echo "\n$basarili başarılı, $hatali hatalı\n";
exit($hatali ? 1 : 0);
