<?php
// DENEME AMAÇLI: okul portalı hazır olmadan giriş bağlantısı üretir.
// Ayarlarda 'test_portal' => true değilse çalışmaz. Canlı kullanımda kapalı tutun!
declare(strict_types=1);
require __DIR__ . '/api/lib/bootstrap.php';
require __DIR__ . '/api/lib/jwt.php';

$config = app_config();
if (empty($config['test_portal'])) {
    html_page('Deneme portalı kapalı', '<p>Bu sayfa yalnızca deneme için kullanılır. Açmak için ayarlarda <code>\'test_portal\' => true</code> yapın.</p>', 404);
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $payload = [
        'uid' => trim((string)($_POST['uid'] ?? '')),
        'name' => trim((string)($_POST['name'] ?? '')),
        'role' => ($_POST['role'] ?? '') === 'ogretmen' ? 'ogretmen' : 'ogrenci',
        'sinif' => trim((string)($_POST['sinif'] ?? '')),
        'iat' => time(),
        'exp' => time() + 300,
        'jti' => bin2hex(random_bytes(16)),
    ];
    if ($payload['uid'] === '' || $payload['name'] === '') {
        html_page('Eksik bilgi', '<p>Numara ve ad soyad gerekli.</p><a class="btn" href="test-portal.php">Geri</a>', 400);
    }
    $token = jwt_sign($payload, (string)$config['jwt_secret']);
    header('Location: giris.php?token=' . urlencode($token), true, 302);
    exit;
}

$form = <<<HTML
<p>Okul portalının yerine geçen deneme sayfası. Gerçek portal da aynı biçimde imzalı bir bağlantı üretir.</p>
<form method="post" style="display:grid;gap:10px">
  <label>Okul no / kullanıcı kodu<br><input name="uid" value="1001" required style="width:100%;padding:6px"></label>
  <label>Ad Soyad<br><input name="name" value="Ali Yılmaz" required style="width:100%;padding:6px"></label>
  <label>Sınıf<br><input name="sinif" value="11-A" style="width:100%;padding:6px"></label>
  <label>Rol<br><select name="role" style="width:100%;padding:6px"><option value="ogrenci">Öğrenci</option><option value="ogretmen">Öğretmen</option></select></label>
  <button style="padding:8px;background:#2563eb;color:#fff;border:0;border-radius:6px;font-size:15px">Giriş yap</button>
</form>
HTML;
html_page('Deneme portalı', $form);
