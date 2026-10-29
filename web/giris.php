<?php
// Portaldan gelen giriş: giris.php?token=<JWT>
declare(strict_types=1);

require_once __DIR__ . '/lib/env.php';
require_once __DIR__ . '/lib/jwt.php';
require_once __DIR__ . '/lib/db.php';
require_once __DIR__ . '/lib/oturum.php';

header('Referrer-Policy: no-referrer');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    header('Allow: GET');
    html_sayfa('Geçersiz istek', '<p>Bu sayfa yalnızca portal bağlantısıyla açılır.</p>', 405);
}

$anahtar = portal_anahtari();
if ($anahtar === null) {
    html_sayfa('Sunucu ayarı eksik', '<p>Portal bağlantı anahtarı tanımlanmamış. Lütfen öğretmeninize bildirin.</p>', 503);
}

$token = $_GET['token'] ?? '';
if (!is_string($token) || $token === '' || strlen($token) > 4096) {
    html_sayfa('Giriş yapılamadı', '<p>Giriş bağlantısı eksik. Lütfen okul portalından yeniden girin.</p>', 400);
}

try {
    $k = jwt_dogrula($token, $anahtar);
} catch (RuntimeException $e) {
    html_sayfa('Giriş yapılamadı', '<p>' . htmlspecialchars($e->getMessage(), ENT_QUOTES) . '</p>', 401);
}

try {
    $pdo = db();
    $simdi = time();
    $pdo->prepare('DELETE FROM kullanilan_tokenlar WHERE bitis < ?')->execute([$simdi]);
    try {
        $pdo->prepare('INSERT INTO kullanilan_tokenlar (jti, bitis) VALUES (?, ?)')
            ->execute([$k['jti'], max($k['exp'], $simdi) + 60]);
    } catch (PDOException $e) {
        if ($e->getCode() !== '23000') throw $e;
        html_sayfa('Giriş yapılamadı', '<p>Bu giriş bağlantısı daha önce kullanılmış. Lütfen okul portalından yeniden girin.</p>', 401);
    }

    $zaman = utc_simdi();
    $g = $pdo->prepare('UPDATE kullanicilar SET okul_no = ?, ad = ?, rol = ?, sinif = ?, son_giris = ? WHERE uid = ?');
    $g->execute([$k['okul_no'], $k['ad'], $k['rol'], $k['sinif'], $zaman, $k['uid']]);
    if ($g->rowCount() === 0) {
        $pdo->prepare('INSERT INTO kullanicilar (uid, okul_no, ad, rol, sinif, son_giris) VALUES (?, ?, ?, ?, ?, ?)')
            ->execute([$k['uid'], $k['okul_no'], $k['ad'], $k['rol'], $k['sinif'], $zaman]);
    }
    if ($k['rol'] === 'ogrenci') {
        $d = $pdo->prepare('UPDATE ders_ogrencileri SET ad = ?, sinif = ?, son_giris = ? WHERE ders_id = ? AND okul_no = ?');
        $d->execute([$k['ad'], $k['sinif'], $zaman, $k['ders_id'], $k['okul_no']]);
        if ($d->rowCount() === 0) {
            $pdo->prepare('INSERT INTO ders_ogrencileri (ders_id, okul_no, ad, sinif, son_giris) VALUES (?, ?, ?, ?, ?)')
                ->execute([$k['ders_id'], $k['okul_no'], $k['ad'], $k['sinif'], $zaman]);
        }
    }
} catch (Throwable $e) {
    error_log('giris.php: ' . get_class($e) . ' ' . $e->getMessage());
    html_sayfa('Giriş yapılamadı', '<p>Sunucuda bir hata oluştu. Lütfen biraz sonra yeniden deneyin.</p>', 500);
}

oturum_baslat();
session_regenerate_id(true);
$_SESSION = [
    // Ders token'daki ders_id ile, öğretmenin sınıfları token'daki siniflar ile sabitlenir;
    // uygulamada bunları değiştiren bir işlem yoktur.
    'kullanici' => [
        'uid' => $k['uid'],
        'okul_no' => $k['okul_no'],
        'ad' => $k['ad'],
        'rol' => $k['rol'],
        'sinif' => $k['sinif'],
        'ders_id' => $k['ders_id'],
        'ders' => $k['ders'],
        'siniflar' => $k['siniflar'],
    ],
    'bitis' => time() + OTURUM_SURESI,
    'csrf' => bin2hex(random_bytes(32)),
];

header('Location: ./', true, 303);
