<?php
// Okul portalından gelen bağlantı: giris.php?token=...
// Anahtar doğrulanır, kullanıcı oluşturulur/güncellenir ve oturum açılır.
declare(strict_types=1);
require __DIR__ . '/api/lib/bootstrap.php';
require __DIR__ . '/api/lib/jwt.php';

$config = app_config();
$token = (string)($_GET['token'] ?? '');
$portal = htmlspecialchars((string)($config['portal_url'] ?? ''), ENT_QUOTES);
$back = $portal ? "<a class=\"btn\" href=\"$portal\">Okul portalına dön</a>" : '';

if ($token === '') {
    html_page('Giriş bağlantısı eksik', '<p>Bu sayfaya okul portalındaki bağlantı ile gelinmelidir.</p>' . $back, 400);
}

$secret = (string)($config['jwt_secret'] ?? '');
if (strlen($secret) < 32 || str_contains($secret, 'BURAYA')) {
    // Örnek ayardaki anahtar herkesçe bilinir: bununla giriş kabul edilmez.
    html_page('Sunucu ayarı eksik', '<p>Giriş anahtarı (jwt_secret) ayarlanmamış ya da çok kısa. Yönetici api/config.php dosyasına en az 32 karakterlik rastgele bir anahtar yazmalıdır.</p>' . $back, 500);
}

try {
    $p = jwt_verify($token, $secret, (int)($config['token_max_age'] ?? 300));
} catch (RuntimeException $e) {
    html_page('Giriş yapılamadı', '<p>' . htmlspecialchars($e->getMessage()) . '</p><p>Lütfen okul portalından tekrar giriş yapın.</p>' . $back, 403);
}

$pdo = db();

// Tek kullanımlık: aynı bağlantı ikinci kez kullanılamaz.
$pdo->prepare('DELETE FROM used_tokens WHERE expires_at < ?')->execute([time() - 3600]);
try {
    $pdo->prepare('INSERT INTO used_tokens (jti, expires_at) VALUES (?, ?)')->execute([$p['jti'], (int)$p['exp']]);
} catch (PDOException $e) {
    html_page('Bu bağlantı daha önce kullanılmış', '<p>Güvenlik nedeniyle her giriş bağlantısı yalnızca bir kez kullanılabilir. Portaldan yeniden giriş yapın.</p>' . $back, 403);
}

$roleIn = mb_strtolower((string)($p['role'] ?? 'ogrenci'));
$role = in_array($roleIn, ['ogretmen', 'öğretmen', 'teacher', 'admin'], true) ? 'ogretmen' : 'ogrenci';
$uid = mb_substr(trim((string)$p['uid']), 0, 64);
$name = mb_substr(trim((string)$p['name']), 0, 150);
$sinif = mb_substr(trim((string)($p['sinif'] ?? $p['class'] ?? '')), 0, 50);
$now = now_str();

$st = $pdo->prepare('SELECT id FROM users WHERE uid = ?');
$st->execute([$uid]);
$id = $st->fetchColumn();
if ($id) {
    $pdo->prepare('UPDATE users SET name = ?, role = ?, sinif = ?, last_login = ? WHERE id = ?')
        ->execute([$name, $role, $sinif, $now, $id]);
} else {
    try {
        $pdo->prepare('INSERT INTO users (uid, name, role, sinif, created_at, last_login) VALUES (?, ?, ?, ?, ?, ?)')
            ->execute([$uid, $name, $role, $sinif, $now, $now]);
        $id = $pdo->lastInsertId();
    } catch (PDOException $e) {
        // Aynı anda iki giriş (ör. çift tıklama): kullanıcıyı diğer istek oluşturdu.
        $st->execute([$uid]);
        $id = $st->fetchColumn();
        if (!$id) throw $e;
    }
}

start_session();
session_regenerate_id(true);
$_SESSION['user_id'] = (int)$id;
$_SESSION['expires'] = time() + (int)($config['session_hours'] ?? 10) * 3600;

// İsteğe bağlı: portal belirli bir projeyi açtırmak isterse (?proje=ID)
$target = base_path();
if (!empty($_GET['proje']) && ctype_digit((string)$_GET['proje'])) $target .= '#/proje/' . $_GET['proje'];
header('Location: ' . $target, true, 302);
