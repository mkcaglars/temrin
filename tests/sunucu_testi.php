<?php
// Uçtan uca test: geçici .env + SQLite ile php -S başlatır; giriş, yetki sınırları, düzeltme ve CSV'yi dener.
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
$sunucu = proc_open(['php', '-d', "session.save_path=$gecici", '-S', "127.0.0.1:$port", '-t', "$kok/web"],
    [1 => ['file', '/dev/null', 'w'], 2 => ['file', "$gecici/sunucu.log", 'w']], $_, null, ['TEMRIN_ENV_DOSYASI' => "$gecici/.env"] + getenv());
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

/** HTTP isteği. Secure çerez http üzerinden de gönderilsin diye çerez elle taşınır. */
function istek(string $yol, array $se = []): array
{
    global $adres;
    $ch = curl_init(str_starts_with($yol, 'http') ? $yol : $adres . $yol);
    $baslik = $se['baslik'] ?? [];
    if (!empty($se['oturum'])) {
        $baslik[] = 'Cookie: ' . $se['oturum']['cerez'];
        if (isset($se['govde'])) $baslik[] = 'X-CSRF-Token: ' . $se['oturum']['csrf'];
    }
    if (isset($se['govde'])) { $baslik[] = 'Content-Type: application/json'; curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($se['govde'])); }
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_HEADER => true, CURLOPT_HTTPHEADER => $baslik]);
    $yanit = curl_exec($ch);
    $hb = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
    $basliklar = substr($yanit, 0, $hb);
    $govde = substr($yanit, $hb);
    preg_match('/^Set-Cookie:\s*([^;\r\n]+)(.*)$/mi', $basliklar, $m);
    return ['durum' => curl_getinfo($ch, CURLINFO_RESPONSE_CODE), 'basliklar' => $basliklar, 'govde' => $govde,
            'json' => json_decode($govde, true), 'cerez' => $m[1] ?? null, 'cerez_ozellik' => $m[2] ?? ''];
}

/** Giriş yapar; oturum çerezi ve CSRF anahtarını döndürür (başarısızsa durum kodu). */
function giris(array $k): array
{
    global $adres, $anahtar, $gecici;
    $g = istek(temrin_giris_baglantisi($adres, $anahtar, $k));
    if ($g['durum'] !== 303) return ['durum' => $g['durum']];
    $sid = explode('=', $g['cerez'], 2)[1];
    preg_match('/csrf\|s:64:"([0-9a-f]{64})"/', (string)@file_get_contents("$gecici/sess_$sid"), $m);
    return ['durum' => 303, 'cerez' => $g['cerez'], 'csrf' => $m[1] ?? ''];
}

$DERS = ['ders_id' => '7', 'ders' => 'Programlama (C#)'];
$ogr = fn(string $no, string $ad, string $sinif, array $ek = []) =>
    $ek + ['uid' => $no, 'okul_no' => $no, 'name' => $ad, 'role' => 'ogrenci', 'sinif' => $sinif, 'siniflar' => []] + $DERS;
$ogrt = fn(string $uid, mixed $siniflar, array $ek = []) =>
    $ek + ['uid' => $uid, 'okul_no' => '', 'name' => "Öğretmen $uid", 'role' => 'ogretmen', 'sinif' => '', 'siniflar' => $siniflar] + $DERS;

// ------------------------------------------------------------------
echo "Giriş (token)\n";
$url = temrin_giris_baglantisi($adres, $anahtar, $ogr('3268', 'Ahmet Özdoğan', '11 Donanım B'));
$g = istek($url);
dogrula($g['durum'] === 303, 'geçerli token → 303');
dogrula(stripos($g['cerez_ozellik'], 'HttpOnly') !== false && stripos($g['cerez_ozellik'], 'secure') !== false
        && stripos($g['cerez_ozellik'], 'SameSite=Lax') !== false && preg_match('/Max-Age=28800/i', $g['cerez_ozellik']) === 1,
        'çerez HttpOnly; Secure; SameSite=Lax; 8 saat');
dogrula(istek($url)['durum'] === 401, 'aynı jti ile ikinci kullanım → 401');

$govde = $ogr('1', 'A', '11 Donanım B') + ['exp' => time() + 300];
$imzali = fn(array $b, array $h = ['alg' => 'HS256', 'typ' => 'JWT'], ?string $k = null) =>
    istek('/giris.php?token=' . urlencode(temrin_token($k ?? $anahtar, $b + ['jti' => bin2hex(random_bytes(8))], $h)))['durum'];
dogrula($imzali($govde, ['alg' => 'HS256'], str_repeat('x', 64)) === 401, 'yanlış anahtarla imza → 401');
dogrula($imzali($govde, ['alg' => 'none']) === 401, 'alg=none → 401');
dogrula($imzali($govde, ['alg' => 'HS512']) === 401, 'alg=HS512 → 401');
dogrula($imzali(['exp' => time() - 120] + $govde) === 401, 'süresi geçmiş exp → 401');
dogrula($imzali(array_diff_key($govde, ['exp' => 1])) === 401, 'exp yok → 401');
dogrula($imzali(['uid' => ''] + $govde) === 401, 'boş uid → 401');
dogrula($imzali(['name' => ' '] + $govde) === 401, 'boş name → 401');
dogrula($imzali(['role' => 'yonetici'] + $govde) === 401, 'geçersiz rol → 401');
dogrula($imzali(['okul_no' => ''] + $govde) === 401, 'okul_no olmayan öğrenci → 401');
dogrula(istek('/giris.php?token=bozuk')['durum'] === 401, 'biçimsiz token → 401');
$t = $ogrt('T9', []); unset($t['siniflar']);
dogrula(giris($t)['durum'] === 401, 'siniflar olmayan öğretmen → 401');
dogrula(giris($ogrt('T9', '11 Donanım B'))['durum'] === 401, 'siniflar dizi değil → 401');
dogrula(giris($ogrt('T9', ['11 Donanım B', '']))['durum'] === 401, 'siniflar içinde boş metin → 401');
dogrula(giris($ogrt('T9', ['11 Donanım B', 5]))['durum'] === 401, 'siniflar içinde metin olmayan → 401');
dogrula(giris($ogrt('T9', ['a' => '11 Donanım B']))['durum'] === 401, 'siniflar nesne (dizi değil) → 401');
$s = $ogr('2045', 'Ayberk Ağa', '11 Donanım B'); unset($s['siniflar']);
dogrula(giris($s)['durum'] === 303, 'siniflar olmayan öğrenci → kabul (boş sayılır)');

// ------------------------------------------------------------------
// Veri: ders 7'de iki sınıf (Donanım B → öğretmen A, Yazılım A → öğretmen B), ayrıca başka ders 8.
$OA = giris($ogrt('A', ['11 Donanım B']));
$OB = giris($ogrt('B', ['11 Yazılım A']));
$OC = giris($ogrt('C', ['11 Donanım B', '11 Yazılım A']));
$OBos = giris($ogrt('D', []));
$S1 = giris($ogr('3268', 'Ahmet Özdoğan', '11 Donanım B'));
$S2 = giris($ogr('2045', 'Ayberk Ağa', '11 Donanım B'));
$S3 = giris($ogr('5001', 'Zeynep Kaya', '11 Yazılım A'));
giris($ogr('5002', 'Teslim Etmeyen', '11 Yazılım A'));
giris($ogr('9001', 'Başka Ders', '11 Donanım B', ['ders_id' => '8', 'ders' => 'Veri Tabanı']));

$pdo = new PDO("sqlite:$db");
$simdi = gmdate('Y-m-d\TH:i:s\Z');
$pdo->exec("INSERT INTO temrinler (id, ders_id, temrin_no, baslik, tanim, olusturma) VALUES
  (1, '7', 3, 'Döngüler', '', '$simdi'), (2, '7', 4, 'Diziler', '', '$simdi'), (3, '8', 1, 'SQL', '', '$simdi')");
putenv("TEMRIN_ENV_DOSYASI=$gecici/.env");
require_once "$kok/web/lib/sonuc.php";
$olc = fn(?int $isg, int $for) => [
    ['no' => 'O1', 'baslik' => 'İSG', 'puan' => 10, 'tip' => 'ogretmen', 'alinan' => $isg, 'tespit' => '', 'duzenleyen' => 'sistem'],
    ['no' => 'O2', 'baslik' => 'for', 'puan' => 90, 'tip' => 'otomatik', 'alinan' => $for, 'tespit' => 'txtN=0 için liste boş kalmalı', 'duzenleyen' => 'sistem'],
];
sonuc_kaydet(1, '7', ['okul_no' => '3268', 'ad' => 'Ahmet Özdoğan', 'sinif' => '11 Donanım B'], $olc(10, 70));  // 80 kesin
sonuc_kaydet(2, '7', ['okul_no' => '3268', 'ad' => 'Ahmet Özdoğan', 'sinif' => '11 Donanım B'], $olc(null, 60)); // 60 bekliyor
sonuc_kaydet(1, '7', ['okul_no' => '2045', 'ad' => 'Ayberk Ağa', 'sinif' => '11 Donanım B'], $olc(10, 80));    // 90 kesin
sonuc_kaydet(1, '7', ['okul_no' => '5001', 'ad' => 'Zeynep Kaya', 'sinif' => '11 Yazılım A'], $olc(5, 40));    // 45 kesin
sonuc_kaydet(1, '7', ['okul_no' => '7777', 'ad' => 'Sınıfsız', 'sinif' => ''], $olc(10, 90));
sonuc_kaydet(3, '8', ['okul_no' => '9001', 'ad' => 'Başka Ders', 'sinif' => '11 Donanım B'], $olc(10, 90));

// ------------------------------------------------------------------
echo "Öğrenci ekranı\n";
$r = istek('/api/ogrenci.php', ['oturum' => $S1])['json'];
$puanlar = array_column(array_column($r['temrinler'], 'sonuc'), 'puan');
dogrula($r['ogrenci']['okul_no'] === '3268' && $puanlar === [80, 60], 'öğrenci yalnız kendi puanlarını görür');
dogrula($r['temrinler'][1]['sonuc']['kesin'] === false && $r['temrinler'][1]['sonuc']['olcutler'][0]['alinan'] === null, 'kesin olmayan puan ve bekleyen ölçüt işaretli');
dogrula(istek('/api/ogrenci.php?okul_no=2045', ['oturum' => $S1])['durum'] === 403, 'başka öğrencinin puanını istemek → 403');
dogrula(istek('/api/ogrenci.php?okul_no=3268', ['oturum' => $S1])['durum'] === 200, 'kendi okul_no ile istek → 200');
dogrula(istek('/api/ogrenci.php?ders_id=8', ['oturum' => $S1])['durum'] === 403, 'öğrenci ders_id değiştirmeye çalışır → 403');
dogrula(istek('/api/ogrenci.php?sinif=11+Yaz%C4%B1l%C4%B1m+A', ['oturum' => $S1])['durum'] === 403, 'öğrenci sınıf değiştirmeye çalışır → 403');
dogrula(istek('/api/ogretmen.php?islem=tablo', ['oturum' => $S1])['durum'] === 403, 'öğrenci öğretmen uç noktasına → 403');
dogrula(istek('/api/disa-aktar.php', ['oturum' => $S1])['durum'] === 403, 'öğrenci CSV indiremez → 403');
dogrula(istek('/api/ogretmen.php', ['oturum' => $S1, 'govde' => ['islem' => 'duzelt', 'temrin_id' => 1, 'okul_no' => '3268', 'olcutler' => []]])['durum'] === 403, 'öğrenci puan düzeltemez → 403');
dogrula(istek('/api/ogrenci.php')['durum'] === 401, 'oturumsuz → 401');
$r = istek('/api/ogrenci.php', ['oturum' => $S3])['json'];
dogrula(array_column(array_column($r['temrinler'], 'sonuc'), 'puan') === [45], 'diğer sınıftaki öğrenci de yalnız kendini görür');

// ------------------------------------------------------------------
echo "Öğretmen ekranı ve yetki\n";
$tA = istek('/api/ogretmen.php?islem=tablo', ['oturum' => $OA])['json'];
$noA = array_column($tA['ogrenciler'], 'okul_no');
sort($noA);
dogrula($noA === ['2045', '3268'], 'öğretmen A yalnız kendi sınıfının öğrencilerini görür');
dogrula(count($tA['temrinler']) === 2, 'yalnız oturumdaki dersin temrinleri');
$ahmet = array_values(array_filter($tA['ogrenciler'], fn($o) => $o['okul_no'] === '3268'))[0];
dogrula($ahmet['ortalama'] === 80.0 && $ahmet['bekleyen'] === 1 && $ahmet['puanlar'][2]['kesin'] === false, 'öğrenci ortalaması yalnız kesin puanlardan, bekleyen sayılır');
dogrula($tA['temrin_ortalamalari'][1] === 85.0 && $tA['sinif_ortalamasi'] === 85.0, 'temrin ve sınıf ortalaması');
$tB = istek('/api/ogretmen.php?islem=tablo', ['oturum' => $OB])['json'];
$noB = array_column($tB['ogrenciler'], 'okul_no');
sort($noB);
dogrula($noB === ['5001', '5002'], 'öğretmen B yalnız kendi sınıfını görür (teslim etmeyen dahil)');
dogrula(istek('/api/ogretmen.php?islem=tablo&sinif=' . urlencode('11 Yazılım A'), ['oturum' => $OA])['durum'] === 403, 'yetkisiz sınıfı istemek → 403');
dogrula(istek('/api/ogretmen.php?islem=tablo&sinif=' . urlencode('11 Donanım B'), ['oturum' => $OA])['durum'] === 200, 'yetkili sınıf süzgeci → 200');
$tC = istek('/api/ogretmen.php?islem=tablo&sinif=' . urlencode('11 Yazılım A'), ['oturum' => $OC])['json'];
dogrula(array_unique(array_column($tC['ogrenciler'], 'sinif')) === ['11 Yazılım A'], 'iki sınıflı öğretmende sınıf süzgeci');
dogrula(istek('/api/ogretmen.php?islem=tablo', ['oturum' => $OBos])['json']['ogrenciler'] === [], 'sınıf listesi boş öğretmen hiçbir öğrenci görmez');
dogrula(istek('/api/ogretmen.php?islem=tablo&ders_id=8', ['oturum' => $OA])['durum'] === 403, 'ders_id değiştirmeye çalışmak → 403');
dogrula(istek('/api/ogretmen.php?islem=tablo&ders=' . urlencode('Veri Tabanı'), ['oturum' => $OA])['durum'] === 403, 'ders adı değiştirmeye çalışmak → 403');
dogrula(istek('/api/ogretmen.php?islem=tablo&ders_id=7', ['oturum' => $OA])['durum'] === 200, 'oturumdaki ders_id ile istek → 200');
dogrula(!in_array('9001', $noA, true), 'başka dersin öğrencisi görünmez');
dogrula(istek('/api/ogretmen.php?islem=sonuc&temrin_id=1&okul_no=5001', ['oturum' => $OA])['durum'] === 403, 'başka sınıfın öğrencisinin ayrıntısı → 403');
dogrula(istek('/api/ogretmen.php?islem=sonuc&temrin_id=1&okul_no=7777', ['oturum' => $OA])['durum'] === 403, 'sınıfı boş kaydın ayrıntısı → 403');
dogrula(!in_array('7777', array_column(istek('/api/ogretmen.php?islem=tablo', ['oturum' => $OC])['json']['ogrenciler'], 'okul_no'), true), 'sınıfı boş kayıt tabloda görünmez');
dogrula(istek('/api/ogretmen.php?islem=sonuc&temrin_id=3&okul_no=9001', ['oturum' => $OA])['durum'] === 404, 'başka dersin temrini → 404');
dogrula(istek('/api/ogretmen.php?islem=sonuc&temrin_id=1&okul_no=3268', ['oturum' => $OA])['json']['sonuc']['puan'] === 80, 'kendi sınıfının ayrıntısı → 200');

echo "Ölçüt düzeltme\n";
$duzelt = fn(array $o, array $g) => istek('/api/ogretmen.php', ['oturum' => $o, 'govde' => ['islem' => 'duzelt'] + $g]);
dogrula($duzelt($OA, ['temrin_id' => 1, 'okul_no' => '5001', 'olcutler' => [['no' => 'O1', 'alinan' => 10]]])['durum'] === 403, 'başka sınıfın puanını düzeltmek → 403');
dogrula($duzelt($OA, ['temrin_id' => 1, 'okul_no' => '3268', 'ders_id' => '8', 'olcutler' => [['no' => 'O1', 'alinan' => 10]]])['durum'] === 403, 'gövdede ders_id değiştirmek → 403');
dogrula($duzelt(['csrf' => 'yanlis'] + $OA, ['temrin_id' => 2, 'okul_no' => '3268', 'olcutler' => [['no' => 'O1', 'alinan' => 8]]])['durum'] === 403, 'CSRF olmadan → 403');
dogrula($duzelt($OA, ['temrin_id' => 2, 'okul_no' => '3268', 'olcutler' => [['no' => 'O1', 'alinan' => 11]]])['durum'] === 400, 'ölçüt puanını aşan not → 400');
$r = $duzelt($OA, ['temrin_id' => 2, 'okul_no' => '3268', 'olcutler' => [['no' => 'O1', 'alinan' => 8, 'tespit' => 'Çalışma alanı dağınık']]]);
dogrula($r['durum'] === 200 && $r['json']['sonuc']['puan'] === 68 && $r['json']['sonuc']['kesin'] === true, 'eksik not girilir → kesin');
dogrula($r['json']['sonuc']['olcutler'][0]['duzenleyen'] === 'ogretmen' && $r['json']['sonuc']['olcutler'][1]['duzenleyen'] === 'sistem', 'düzenlenen ölçüt duzenleyen: ogretmen');
$s = istek('/api/ogrenci.php', ['oturum' => $S1])['json']['temrinler'][1]['sonuc'];
dogrula($s['puan'] === 68 && $s['kesin'] === true, 'öğrenci düzeltilmiş puanı görür');

echo "Temrin erişimi (sınıf bazında)\n";
$erisim = fn(array $o, array $g) => istek('/api/ogretmen.php', ['oturum' => $o, 'govde' => ['islem' => 'erisim', 'temrin_id' => 2] + $g]);
dogrula($erisim($OA, ['sinif' => '11 Yazılım A', 'erisim_acik' => true])['durum'] === 403, 'başka öğretmenin sınıfına temrin açmak → 403');
dogrula(istek('/api/ogretmen.php', ['oturum' => $OA, 'govde' => ['islem' => 'erisim', 'temrin_id' => 3, 'sinif' => '11 Donanım B', 'erisim_acik' => true]])['durum'] === 404, 'başka dersin temrinini açmak → 404');
dogrula(istek('/api/ogretmen.php?islem=erisim&sinif=' . urlencode('11 Yazılım A'), ['oturum' => $OA])['durum'] === 403, 'başka sınıfın erişim ayarını okumak → 403');
dogrula($erisim($OB, ['sinif' => '11 Yazılım A', 'erisim_acik' => true])['json']['erisilebilir'] === true, 'öğretmen B kendi sınıfına açar');
$gor = fn(array $o) => array_column(istek('/api/ogrenci.php', ['oturum' => $o])['json']['temrinler'], 'erisilebilir', 'temrin_no');
dogrula(($gor($S3)[4] ?? null) === true, 'Yazılım A öğrencisi açık temrini görür');
dogrula(($gor($S1)[4] ?? null) === false, 'Donanım B öğrencisinde aynı temrin kapalı kalır');
$yarin = (new DateTimeImmutable('+1 day', new DateTimeZone('Europe/Istanbul')))->format('Y-m-d\TH:i');
$r = $erisim($OB, ['sinif' => '11 Yazılım A', 'erisim_acik' => true, 'baslangic' => $yarin]);
dogrula($r['json']['erisilebilir'] === false && str_contains($r['json']['neden'], 'başlayacak'), 'başlangıç zamanı gelmeden kapalı');

echo "CSV\n";
$c = istek('/api/disa-aktar.php', ['oturum' => $OA]);
dogrula($c['durum'] === 200 && str_starts_with($c['govde'], "\xEF\xBB\xBF"), 'UTF-8 BOM');
dogrula(preg_match('/Content-Disposition: attachment; filename="temrin-programlama-csharp-tum-siniflar\.csv"/i', $c['basliklar']) === 1, 'attachment, dosya adı (tüm sınıflar)');
$satirlar = array_map(fn($s) => str_getcsv($s, ';', '"', ''), explode("\r\n", trim(substr($c['govde'], 3))));
dogrula($satirlar[0] === ['Okul No', 'Ad Soyad', 'Sınıf', 'T3 Döngüler', 'T4 Diziler', 'Ortalama', 'Bekleyen'], '; ayraçlı başlık satırı');
$csvNo = array_column(array_slice($satirlar, 1, -1), 0);
sort($csvNo);
dogrula($csvNo === ['2045', '3268'], 'CSV yalnız yetkili sınıfın öğrencileri');
dogrula(!str_contains($c['govde'], '5001') && !str_contains($c['govde'], 'Zeynep') && !str_contains($c['govde'], '9001'), 'CSV başka sınıf/ders verisi içermez');
dogrula(str_contains($c['govde'], '74') && end($satirlar)[1] === 'Temrin ortalaması', 'ortalama satırı (virgüllü ondalık)');
$c = istek('/api/disa-aktar.php?sinif=' . urlencode('11 Donanım B'), ['oturum' => $OC]);
dogrula(preg_match('/filename="temrin-programlama-csharp-11-donanim-b\.csv"/', $c['basliklar']) === 1 && !str_contains($c['govde'], '5001'), 'sınıf süzgeçli CSV ve dosya adı');
dogrula(istek('/api/disa-aktar.php?sinif=' . urlencode('11 Yazılım A'), ['oturum' => $OA])['durum'] === 403, 'yetkisiz sınıf CSV → 403');
dogrula(istek('/api/disa-aktar.php?ders_id=8', ['oturum' => $OA])['durum'] === 403, 'CSV ders_id değiştirmek → 403');

echo "Temrin CSV ve çalışma\n";
$post = fn(array $o, string $yol, array $g) => istek($yol, ['oturum' => $o, 'govde' => $g]);
$csv = file_get_contents("$kok/sablon/temrin-3-donguler.csv");
$r = $post($OA, '/api/ogretmen.php', ['islem' => 'temrin_yukle', 'csv' => str_replace('bilgi;temrin_no;;;;;;;3;', 'bilgi;temrin_no;;;;;;;30;', $csv)]);
dogrula($r['durum'] === 200 && $r['json']['temrin']['kontrol_sayisi'] === 17, 'öğretmen CSV yükler');
$TID = $r['json']['temrin']['temrin_id'];
$bozuk = str_replace(['olcut;O9;;5;', 'kod_yapisi;btnFor.Click;;for;'], ['olcut;O9;;6;', 'kod_yapisi;btnFor.Click;;fore;'], $csv);
$r = $post($OA, '/api/ogretmen.php', ['islem' => 'temrin_yukle', 'csv' => $bozuk]);
dogrula($r['durum'] === 400 && count($r['json']['hatalar']) >= 2 && str_contains(implode(' ', $r['json']['hatalar']), "bilinmeyen kod yapısı 'fore'"), 'hatalı CSV satır satır reddedilir');
dogrula($post($S1, '/api/ogretmen.php', ['islem' => 'temrin_yukle', 'csv' => $csv])['durum'] === 403, 'öğrenci temrin yükleyemez');
$r = $post($OA, '/api/ogretmen.php', ['islem' => 'temrin_yukle', 'csv' => str_replace('bilgi;temrin_no;;;;;;;3;', 'bilgi;temrin_no;;;;;;;30;', $csv)]);
dogrula($r['durum'] === 409 && $r['json']['kod'] === 'TEMRIN_VAR', 'aynı temrin numarası onaysız üzerine yazılmaz');

$cal = fn(array $o, array $g) => istek('/api/calisma.php?' . http_build_query($g), ['oturum' => $o]);
dogrula($cal($S1, ['temrin_id' => $TID])['json']['kod'] === 'ERISIM_KAPALI', 'kapalı temrin açılamaz');
$post($OA, '/api/ogretmen.php', ['islem' => 'erisim', 'temrin_id' => $TID, 'sinif' => '11 Donanım B', 'erisim_acik' => true]);
$r = $cal($S1, ['temrin_id' => $TID]);
$jsonMetin = $r['govde'];
dogrula($r['durum'] === 200 && count($r['json']['temrin']['sorular']) === 2, 'açık temrin öğrenciye görev ve soruları verir');
dogrula(!str_contains($jsonMetin, 'lstSonuc=1|2|3') && !str_contains($jsonMetin, 'en az bir kez') && !isset($r['json']['kontroller']),
    'teslimden önce kontroller ve soru cevapları öğrenciye gitmez');
dogrula(!str_contains($jsonMetin, '1\\n2\\n3'), 'çıktı sorusunun beklenen cevabı gizli');
dogrula($cal($S3, ['temrin_id' => $TID])['durum'] === 403, 'temrin başka sınıfa açılmadıkça o sınıfın öğrencisi açamaz');
dogrula($cal($S1, ['temrin_id' => $TID, 'okul_no' => '2045'])['durum'] === 403, 'öğrenci başka öğrencinin çalışmasını isteyemez');
dogrula($post($S1, '/api/calisma.php', ['islem' => 'degerlendirme', 'temrin_id' => $TID, 'sonuc' => ['sonuclar' => []]])['durum'] === 409, 'teslimden önce değerlendirme gönderilemez');
$veri = ['format' => 1, 'namespace' => 'DonguTemrin', 'files' => [['name' => 'Program.cs', 'content' => '// ...']], 'forms' => new stdClass()];
$r = $post($S1, '/api/calisma.php', ['islem' => 'kaydet', 'temrin_id' => $TID, 'veri' => $veri, 'surum' => 0]);
dogrula($r['durum'] === 200 && $r['json']['surum'] === 1, 'proje kaydedilir, sürüm artar');
dogrula($post($S1, '/api/calisma.php', ['islem' => 'kaydet', 'temrin_id' => $TID, 'veri' => $veri, 'surum' => 0])['durum'] === 409, 'eski sürümle kayıt → 409 çakışma');
$post($S1, '/api/calisma.php', ['islem' => 'cevap', 'temrin_id' => $TID, 'cevaplar' => ['S1' => 'koşul sonda', 'S2' => "1\n2\n3\n", 'S99' => 'yok sayılır']]);
$r = $post($S1, '/api/calisma.php', ['islem' => 'teslim', 'temrin_id' => $TID, 'veri' => $veri, 'cevaplar' => ['S1' => 'koşul sonda', 'S2' => "1\n2\n3\n"]]);
dogrula($r['durum'] === 200 && count($r['json']['kontroller']) === 17, 'teslim → kontroller tarayıcıya verilir');
dogrula($r['json']['sonuc']['kesin'] === false, 'değerlendirme öncesi sonuç kesin değil');
$o8 = array_values(array_filter($r['json']['sonuc']['olcutler'], fn($o) => $o['no'] === 'O8'))[0];
$s2 = array_values(array_filter($o8['kalemler'], fn($k) => $k['no'] === 'S2'))[0];
dogrula($s2['alinan'] === 3, 'çıktı tahmini sunucuda puanlanır (sondaki boş satır önemsenmez)');
dogrula($post($S1, '/api/calisma.php', ['islem' => 'kaydet', 'temrin_id' => $TID, 'veri' => $veri, 'surum' => 2])['durum'] === 409, 'teslimden sonra proje değiştirilemez');
dogrula($post($S1, '/api/calisma.php', ['islem' => 'teslim', 'temrin_id' => $TID, 'veri' => $veri])['durum'] === 409, 'ikinci teslim reddedilir');
$hepsi = fn(bool $g) => ['derlendi' => true, 'sonuclar' => array_map(fn($k) => ['no' => $k['no'], 'gecti' => $g, 'mesaj' => $g ? '' : 'motor mesajı'], $r['json']['kontroller'])];
$d = $post($S1, '/api/calisma.php', ['islem' => 'degerlendirme', 'temrin_id' => $TID, 'sonuc' => $hepsi(true)]);
dogrula($d['durum'] === 200 && $d['json']['sonuc']['puan'] === 70, 'öğrenci tarayıcısındaki değerlendirme puanlanır (70: öğretmen ölçütleri ve açık sorulu ölçüt bekliyor)');
dogrula($post($S1, '/api/calisma.php', ['islem' => 'degerlendirme', 'temrin_id' => $TID, 'sonuc' => $hepsi(true)])['durum'] === 409, 'değerlendirme ikinci kez gönderilemez');
dogrula($cal($S1, ['temrin_id' => $TID])['json']['calisma']['salt_okunur'] === true, 'teslimden sonra çalışma salt okunur açılır');
$post($OA, '/api/ogretmen.php', ['islem' => 'erisim', 'temrin_id' => $TID, 'sinif' => '11 Donanım B', 'erisim_acik' => false]);
dogrula($cal($S1, ['temrin_id' => $TID])['durum'] === 200, 'temrin kapansa da teslim edilen çalışma açılır');

dogrula(istek("/api/calisma.php?temrin_id=$TID&okul_no=3268", ['oturum' => $OA])['json']['calisma']['ogrenci']['okul_no'] === '3268', 'öğretmen kendi sınıfındaki teslimi görür');
dogrula(istek("/api/calisma.php?temrin_id=$TID&okul_no=3268", ['oturum' => $OB])['durum'] === 403, 'öğretmen başka sınıfın teslimini göremez');
dogrula(istek("/api/ogretmen.php?islem=teslim&temrin_id=$TID&okul_no=3268", ['oturum' => $OB])['durum'] === 403, 'başka sınıfın teslim projesi alınamaz');
dogrula($post($OB, '/api/ogretmen.php', ['islem' => 'degerlendirme', 'temrin_id' => $TID, 'okul_no' => '3268', 'sonuc' => $hepsi(false)])['durum'] === 403, 'başka sınıfın teslimi yeniden değerlendirilemez');
$post($OA, '/api/ogretmen.php', ['islem' => 'duzelt', 'temrin_id' => $TID, 'okul_no' => '3268', 'olcutler' => [['no' => 'O5', 'alinan' => 18, 'tespit' => 'Öğretmen notu']]]);
$d = $post($OA, '/api/ogretmen.php', ['islem' => 'degerlendirme', 'temrin_id' => $TID, 'okul_no' => '3268', 'sonuc' => $hepsi(false)]);
$ayr = istek("/api/ogretmen.php?islem=sonuc&temrin_id=$TID&okul_no=3268", ['oturum' => $OA])['json']['sonuc'];
$o5 = array_values(array_filter($ayr['olcutler'], fn($o) => $o['no'] === 'O5'))[0];
$o6 = array_values(array_filter($ayr['olcutler'], fn($o) => $o['no'] === 'O6'))[0];
dogrula($ayr['degerlendiren'] === 'ogretmen' && $o5['alinan'] === 18 && $o6['alinan'] === 0, 'öğretmen doğrulaması öğrencinin sonucunun yerine geçer, elle girilen not korunur');
dogrula(str_contains($o6['tespit'], 'btnWhile içinde while döngüsü yok'), 'CSV tespit metni sonuca yazılır');
$r = $post($OA, '/api/ogretmen.php', ['islem' => 'temrin_yukle', 'uzerine_yaz' => true, 'csv' => str_replace('bilgi;temrin_no;;;;;;;3;', 'bilgi;temrin_no;;;;;;;30;', $csv)]);
dogrula($r['durum'] === 409 && $r['json']['kod'] === 'TESLIM_VAR', 'teslim almış temrinin tanımı değiştirilemez');
$c1 = str_replace(['bilgi;temrin_no;;;;;;;3;', '"1' . "
" . '2' . "
" . '3"'], ['bilgi;temrin_no;;;;;;;31;', ''], $csv);
$r = $post($OA, '/api/ogretmen.php', ['islem' => 'temrin_yukle', 'csv' => str_replace("
", "
", $c1)]);
dogrula($r['durum'] === 200 && count($r['json']['temrin']['hesaplanacak_ciktilar']) === 1, 'beklenen çıktısı boş soru "hesaplanacak" olarak işaretlenir');
$r = $post($OA, '/api/ogretmen.php', ['islem' => 'cikti_kaydet', 'temrin_id' => $r['json']['temrin']['temrin_id'], 'ciktilar' => ['S2' => "1\n2\n3\n"]]);
dogrula($r['durum'] === 200 && $r['json']['temrin']['hesaplanacak_ciktilar'] === [], 'hesaplanan çıktı kaydedilir');

echo "Temrin sayfası\n";
$s = istek("/sayfa.php?temrin_id=$TID", ['oturum' => $S1]);
dogrula($s['durum'] === 200 && str_contains($s['govde'], 'TEMRİN SAYFASI') && str_contains($s['govde'], 'Ahmet Özdoğan') && str_contains($s['govde'], 'btnWhile içinde while döngüsü yok'), 'öğrenci kendi temrin sayfasını görür');
dogrula(istek("/sayfa.php?temrin_id=$TID&okul_no=2045", ['oturum' => $S1])['durum'] === 403, 'öğrenci başkasının temrin sayfasını göremez');
dogrula(istek("/sayfa.php?temrin_id=$TID&sinif=" . urlencode('11 Donanım B'), ['oturum' => $S1])['durum'] === 403, 'öğrenci sınıf sayfalarını göremez');
dogrula(str_contains(istek("/sayfa.php?temrin_id=$TID&okul_no=3268", ['oturum' => $OA])['govde'], 'Ahmet Özdoğan'), 'öğretmen kendi sınıfındaki öğrencinin sayfasını görür');
dogrula(istek("/sayfa.php?temrin_id=$TID&okul_no=3268", ['oturum' => $OB])['durum'] === 403, 'öğretmen başka sınıfın sayfasını göremez');
dogrula(istek("/sayfa.php?temrin_id=$TID&sinif=" . urlencode('11 Donanım B'), ['oturum' => $OB])['durum'] === 403, 'öğretmen başka sınıfın toplu sayfasını göremez');
dogrula(istek("/sayfa.php?temrin_id=$TID", ['oturum' => $OB])['durum'] === 404, 'öğretmenin sınıfında teslim yoksa sayfa yok (başka sınıf sızmaz)');
dogrula(istek("/sayfa.php?temrin_id=$TID&ders_id=8", ['oturum' => $OA])['durum'] === 403, 'temrin sayfasında ders_id değiştirmek → 403');

echo "Temrin silme\n";
$sil = fn(array $o, array $g) => $post($o, '/api/ogretmen.php', ['islem' => 'temrin_sil', 'temrin_id' => $TID] + $g);
dogrula($sil($OA, [])['json']['kod'] === 'ONAY_GEREKLI', 'onaysız silme reddedilir');
dogrula($sil($OA, ['onay' => 'temrin sil'])['json']['kod'] === 'ONAY_GEREKLI', 'yanlış yazılan onayla silinmez');
dogrula($sil($S1, ['onay' => 'TEMRİN SİL'])['durum'] === 403, 'öğrenci temrin silemez');
$r = $sil($OB, ['onay' => 'TEMRİN SİL']);
dogrula($r['durum'] === 403 && $r['json']['kod'] === 'BASKA_SINIF' && str_contains($r['json']['mesaj'], '11 Donanım B'), 'başka öğretmenin sınıfında teslim varken silinemez');
dogrula($sil($OC, ['onay' => 'TEMRİN SİL', 'ders_id' => '8'])['durum'] === 403, 'silmede ders_id değiştirmek → 403');
$r = $sil($OA, ['onay' => ' TEMRİN SİL ']);
dogrula($r['durum'] === 200, 'teslim almış temrin onayla silinir');
$say = fn(string $tablo) => (int)$pdo->query("SELECT COUNT(*) FROM $tablo WHERE " . ($tablo === 'temrinler' ? 'id' : 'temrin_id') . " = $TID")->fetchColumn();
dogrula($say('temrinler') === 0 && $say('calismalar') === 0 && $say('sonuclar') === 0 && $say('temrin_erisim') === 0, 'çalışmalar, puanlar ve erişim ayarları da silinir');
dogrula(istek("/api/calisma.php?temrin_id=$TID", ['oturum' => $S1])['durum'] === 404, 'silinen temrin öğrenciye açılmaz');
dogrula(!in_array($TID, array_column(istek('/api/ogrenci.php', ['oturum' => $S1])['json']['temrinler'], 'temrin_id'), true), 'silinen temrin öğrenci listesinde yok');

echo "Ekranlar\n";
$e = istek('/', ['oturum' => $OA]);
dogrula(str_contains($e['govde'], 'ogretmen.js') && str_contains($e['govde'], 'name="csrf"'), 'öğretmen ekranı');
dogrula(str_contains(istek('/', ['oturum' => $S1])['govde'], 'ogrenci.js'), 'öğrenci ekranı');
dogrula(istek('/api/puanlar.php')['durum'] === 404, 'eski puan API\'si kaldırıldı');
dogrula(!str_contains(file_get_contents("$gecici/sunucu.log"), $anahtar), 'anahtar sunucu günlüğünde yok');

echo "\n$basarili başarılı, $hatali hatalı\n";
exit($hatali ? 1 : 0);
