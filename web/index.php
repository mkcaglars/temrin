<?php
// Geçici giriş sayfası: temrin arayüzü buraya gelecek.
declare(strict_types=1);

require_once __DIR__ . '/lib/env.php';
require_once __DIR__ . '/lib/oturum.php';

$k = oturum_kullanici();
if ($k === null) {
    html_sayfa('Oturum yok', '<p>Temrine okul portalındaki bağlantıdan girin.</p>', 401);
}
$e = fn($s) => htmlspecialchars((string)$s, ENT_QUOTES);
html_sayfa('Temrin', "<p><b>{$e($k['ad'])}</b> ({$e($k['okul_no'])}, {$e($k['sinif'])})<br>Ders: {$e($k['ders'])}</p><p><a href=\"cikis.php\">Çıkış</a></p>");
