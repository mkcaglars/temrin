<?php
// Rolüne göre öğrenci ya da öğretmen ekranı.
declare(strict_types=1);

require_once __DIR__ . '/lib/env.php';
require_once __DIR__ . '/lib/oturum.php';

$k = oturum_kullanici();
if ($k === null) {
    html_sayfa('Oturum yok', '<p>Temrine okul portalındaki bağlantıdan girin.</p>', 401);
}
$e = fn($s) => htmlspecialchars((string)$s, ENT_QUOTES);
$ogretmen = $k['rol'] === 'ogretmen';
$betik = $ogretmen ? 'ogretmen.js' : 'ogrenci.js';
$surum = (string)@filemtime(__DIR__ . "/assets/$betik");
$alt = $ogretmen ? 'Öğretmen' : "{$e($k['okul_no'])} · {$e($k['sinif'])}";

header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store');
header("Content-Security-Policy: default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; frame-ancestors 'none'");
?>
<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="csrf" content="<?= $e($_SESSION['csrf'] ?? '') ?>">
<title>Temrin · <?= $e($k['ders']) ?></title>
<link rel="icon" href="data:,">
<link rel="stylesheet" href="assets/app.css?v=<?= $e((string)@filemtime(__DIR__ . '/assets/app.css')) ?>">
</head>
<body>
<header class="ust">
  <div><strong>Temrin</strong> · <?= $e($k['ders']) ?></div>
  <div class="kim"><?= $e($k['ad']) ?> <span class="soluk"><?= $alt ?></span> <a href="cikis.php">Çıkış</a></div>
</header>
<main id="uygulama" class="icerik"><p class="soluk">Yükleniyor…</p></main>
<script src="assets/<?= $betik ?>?v=<?= $e($surum) ?>"></script>
</body>
</html>
