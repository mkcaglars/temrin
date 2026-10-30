<?php
// Temrin çalışma ekranı: C# Form Stüdyosu (c-lesson) editörü + görev, sorular ve teslim paneli.
//   Öğrenci:  studyo/?temrin=1
//   Öğretmen: studyo/?temrin=1&ogrenci=3268   (öğrencinin teslim ettiği proje, salt okunur)
// Motor ve editör dosyaları (assets/, _framework/, lib/monaco) build.sh ile bu klasöre kopyalanır.
declare(strict_types=1);

require_once __DIR__ . '/../lib/env.php';
require_once __DIR__ . '/../lib/oturum.php';

$k = oturum_kullanici();
if ($k === null) html_sayfa('Oturum yok', '<p>Temrine okul portalındaki bağlantıdan girin.</p>', 401);
$temrin = filter_var($_GET['temrin'] ?? null, FILTER_VALIDATE_INT);
if (!$temrin) html_sayfa('Temrin seçilmedi', '<p><a href="../">Temrinlerime dön</a></p>', 400);
$ogrenci = $k['rol'] === 'ogretmen' ? trim((string)($_GET['ogrenci'] ?? '')) : '';
if ($k['rol'] === 'ogretmen' && $ogrenci === '') html_sayfa('Öğrenci seçilmedi', '<p><a href="../">Geri dön</a></p>', 400);
if (!is_file(__DIR__ . '/assets/js/ide.js')) {
    html_sayfa('Kurulum eksik', '<p>Editör dosyaları bulunamadı. Siteyi <code>build.sh</code> ile üretilen <code>dist/</code> klasöründen yükleyin.</p>', 500);
}
$e = fn($s) => htmlspecialchars((string)$s, ENT_QUOTES);
$v = $e((string)@filemtime(__DIR__ . '/temrin/temrin.js'));

header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store');
header('Referrer-Policy: same-origin');
?>
<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="csrf" content="<?= $e($_SESSION['csrf'] ?? '') ?>">
  <title>Temrin · <?= $e($k['ders']) ?></title>
  <link rel="icon" href="data:,">
  <link rel="stylesheet" href="assets/css/app.css?v=<?= $v ?>">
  <link rel="stylesheet" href="assets/css/winforms.css?v=<?= $v ?>">
  <link rel="stylesheet" href="temrin/temrin.css?v=<?= $v ?>">
</head>
<body data-temrin="<?= (int)$temrin ?>" data-ogrenci="<?= $e($ogrenci) ?>" data-rol="<?= $e($k['rol']) ?>" data-ad="<?= $e($k['ad']) ?>">
  <div id="app"><div class="boot"><div class="boot-logo">C#</div><div class="boot-text">Yükleniyor…</div></div></div>
  <noscript>Bu uygulama için JavaScript gereklidir.</noscript>
  <script src="temrin/monaco-ortam.js?v=<?= $v ?>"></script>
  <script src="lib/monaco/vs/loader.js"></script>
  <script type="module" src="temrin/temrin.js?v=<?= $v ?>"></script>
</body>
</html>
