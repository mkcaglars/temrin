<?php
// Portalın puanları sunucudan sunucuya çektiği uç nokta. Ayrıntılar: docs/PORTAL-API.md
declare(strict_types=1);

require_once __DIR__ . '/../lib/env.php';
require_once __DIR__ . '/../lib/db.php';
require_once __DIR__ . '/../lib/sonuc.php';
require_once __DIR__ . '/../lib/api.php';

const ZAMAN_TOLERANSI = 60;
const SAYFA_VARSAYILAN = 100;
const SAYFA_EN_FAZLA = 500;

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    header('Allow: GET');
    json_hata(405, 'YONTEM_GECERSIZ', 'Yalnızca GET kullanılabilir.');
}

// Tarayıcılar bu başlıkları her istekte gönderir; sunucudan sunucuya istekte bulunmazlar.
if (isset($_SERVER['HTTP_ORIGIN']) || isset($_SERVER['HTTP_SEC_FETCH_SITE']) || isset($_SERVER['HTTP_SEC_FETCH_MODE'])) {
    json_hata(403, 'TARAYICI_ERISIMI', 'Bu uç nokta tarayıcıdan çağrılamaz.');
}

$izinliIp = trim((string)env('PORTAL_IP_IZINLI', ''));
if ($izinliIp !== '') {
    $ipler = array_filter(array_map('trim', explode(',', $izinliIp)));
    if (!in_array($_SERVER['REMOTE_ADDR'] ?? '', $ipler, true)) json_hata(403, 'IP_IZINSIZ', 'Bu adresten erişim izni yok.');
}

$anahtar = portal_anahtari();
if ($anahtar === null) json_hata(503, 'AYAR_EKSIK', 'Sunucuda portal anahtarı tanımlanmamış.');

$zaman = $_SERVER['HTTP_X_ZAMAN'] ?? '';
$imza = strtolower($_SERVER['HTTP_X_IMZA'] ?? '');
if ($zaman === '' || $imza === '') json_hata(401, 'KIMLIK_EKSIK', 'X-Zaman ve X-Imza başlıkları gerekli.');
if (!preg_match('/^\d{1,12}$/', $zaman) || abs(time() - (int)$zaman) > ZAMAN_TOLERANSI) {
    json_hata(401, 'ZAMAN_GECERSIZ', 'X-Zaman sunucu saatinden 60 saniyeden fazla farklı.');
}
$sorgu = $_SERVER['QUERY_STRING'] ?? '';
$beklenen = hash_hmac('sha256', $zaman . "\n" . $sorgu, $anahtar);
if (!preg_match('/^[0-9a-f]{64}$/', $imza) || !hash_equals($beklenen, $imza)) {
    json_hata(401, 'IMZA_GECERSIZ', 'X-Imza doğrulanamadı.');
}

// --- Parametreler ---
$izinli = ['ders_id', 'okul_no', 'degisen_sonra', 'devam', 'adet', 'detay'];
foreach ($_GET as $ad => $deger) {
    if (!in_array($ad, $izinli, true)) json_hata(400, 'PARAMETRE_HATALI', "Bilinmeyen parametre: $ad");
    if (!is_string($deger)) json_hata(400, 'PARAMETRE_HATALI', "$ad tek bir değer olmalı.");
}
$p = fn(string $ad) => trim((string)($_GET[$ad] ?? ''));
$tamsayi = function (string $ad, int $varsayilan, int $min, int $max) use ($p): int {
    $v = $p($ad);
    if ($v === '') return $varsayilan;
    if (!preg_match('/^\d{1,6}$/', $v) || (int)$v < $min || (int)$v > $max) {
        json_hata(400, 'PARAMETRE_HATALI', "$ad $min ile $max arasında bir tam sayı olmalı.");
    }
    return (int)$v;
};

$dersId = $p('ders_id');
$okulNo = $p('okul_no');
$degisenSonra = $p('degisen_sonra');
$adet = $tamsayi('adet', SAYFA_VARSAYILAN, 1, SAYFA_EN_FAZLA);
$detay = $p('detay') === '1';
if (strlen($dersId) > 64 || strlen($okulNo) > 32) json_hata(400, 'PARAMETRE_HATALI', 'ders_id ya da okul_no çok uzun.');
if ($degisenSonra !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/', $degisenSonra)) {
    json_hata(400, 'PARAMETRE_HATALI', 'degisen_sonra biçimi YYYY-AA-GGTSS:DD:SSZ (UTC) olmalı.');
}
// devam: önceki sayfanın son kaydı (guncellenme_zamani|id). Kayıt sırası değişse de kayıt atlanmaz.
$devam = null;
if ($p('devam') !== '') {
    $c = base64_decode(strtr($p('devam'), '-_', '+/'), true);
    if ($c === false || !preg_match('/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)\|(\d{1,12})$/', $c, $m)) {
        json_hata(400, 'PARAMETRE_HATALI', 'devam değeri geçersiz; önceki yanıttaki değeri aynen gönderin.');
    }
    $devam = [$m[1], (int)$m[2]];
}

// --- Sorgu ---
$sunucuZamani = utc_simdi();
try {
    $kosul = [];
    $deg = [];
    if ($dersId !== '') { $kosul[] = 's.ders_id = ?'; $deg[] = $dersId; }
    if ($okulNo !== '') { $kosul[] = 's.okul_no = ?'; $deg[] = $okulNo; }
    if ($degisenSonra !== '') { $kosul[] = 's.guncellenme_zamani >= ?'; $deg[] = $degisenSonra; }
    $where = $kosul ? 'WHERE ' . implode(' AND ', $kosul) : '';
    $kosulSayfa = $kosul;
    $degSayfa = $deg;
    if ($devam !== null) {
        $kosulSayfa[] = '(s.guncellenme_zamani > ? OR (s.guncellenme_zamani = ? AND s.id > ?))';
        array_push($degSayfa, $devam[0], $devam[0], $devam[1]);
    }
    $whereSayfa = $kosulSayfa ? 'WHERE ' . implode(' AND ', $kosulSayfa) : '';

    $pdo = db();
    $say = $pdo->prepare("SELECT COUNT(*) FROM sonuclar s $where");
    $say->execute($deg);
    $toplam = (int)$say->fetchColumn();

    $st = $pdo->prepare("SELECT s.*, t.temrin_no, t.baslik
        FROM sonuclar s JOIN temrinler t ON t.id = s.temrin_id
        $whereSayfa ORDER BY s.guncellenme_zamani, s.id LIMIT " . ($adet + 1));
    $st->execute($degSayfa);

    $puanlar = [];
    $sonraki = null;
    $son = null;
    foreach ($st as $r) {
        if (count($puanlar) === $adet) {
            $sonraki = rtrim(strtr(base64_encode($son['guncellenme_zamani'] . '|' . $son['id']), '+/', '-_'), '=');
            break;
        }
        $son = $r;
        $o = ['ders_id' => $r['ders_id']] + sonuc_ozeti($r, ['id' => $r['temrin_id'], 'temrin_no' => $r['temrin_no'], 'baslik' => $r['baslik']], $detay);
        $puanlar[] = $o;
    }
} catch (Throwable $e) {
    error_log('puanlar.php: ' . get_class($e) . ' ' . $e->getMessage());
    json_hata(500, 'SUNUCU_HATASI', 'Sunucuda bir hata oluştu.');
}

json_yanit([
    'durum' => 'tamam',
    'sunucu_zamani' => $sunucuZamani,
    'puan_olcegi' => ['en_dusuk' => 0, 'en_yuksek' => 100],
    'adet' => count($puanlar),
    'toplam' => $toplam,
    'devam' => $sonraki,
    'puanlar' => $puanlar,
]);
