<?php
declare(strict_types=1);
require __DIR__ . '/api/lib/bootstrap.php';

start_session();
$_SESSION = [];
session_destroy();
$portal = htmlspecialchars((string)(app_config()['portal_url'] ?? ''), ENT_QUOTES);
html_page('Çıkış yapıldı', '<p>Oturumunuz kapatıldı. Projeleriniz kaydedildi.</p>' . ($portal ? "<a class=\"btn\" href=\"$portal\">Okul portalına dön</a>" : ''));
