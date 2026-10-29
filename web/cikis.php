<?php
declare(strict_types=1);

require_once __DIR__ . '/lib/env.php';
require_once __DIR__ . '/lib/oturum.php';

oturum_baslat();
$_SESSION = [];
$p = session_get_cookie_params();
setcookie(session_name(), '', ['expires' => time() - 3600, 'path' => $p['path'], 'secure' => true, 'httponly' => true, 'samesite' => 'Lax']);
session_destroy();
html_sayfa('Çıkış yapıldı', '<p>Temrine yeniden girmek için okul portalını kullanın.</p>');
