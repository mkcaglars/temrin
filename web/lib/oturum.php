<?php
// Oturum: 8 saat, HttpOnly; Secure; SameSite=Lax çerez.
declare(strict_types=1);

const OTURUM_ADI = 'TEMRIN';
const OTURUM_SURESI = 8 * 3600;

function oturum_baslat(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) return;
    ini_set('session.use_strict_mode', '1');
    ini_set('session.use_only_cookies', '1');
    ini_set('session.gc_maxlifetime', (string)OTURUM_SURESI);
    session_name(OTURUM_ADI);
    session_set_cookie_params([
        'lifetime' => OTURUM_SURESI,
        'path' => '/',
        'secure' => true,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_start();
}

/** Oturumdaki kullanıcı; ders token'daki ders_id ile sabittir. Oturum yoksa ya da süresi dolduysa null. */
function oturum_kullanici(): ?array
{
    oturum_baslat();
    $k = $_SESSION['kullanici'] ?? null;
    if (!is_array($k) || ($_SESSION['bitis'] ?? 0) < time()) {
        $_SESSION = [];
        return null;
    }
    return $k;
}

function html_sayfa(string $baslik, string $govde, int $durum = 200): never
{
    http_response_code($durum);
    header('Content-Type: text/html; charset=utf-8');
    header('Cache-Control: no-store');
    $b = htmlspecialchars($baslik, ENT_QUOTES);
    // Bu sayfa hem kökten hem studyo/ altından gösterilir.
    $kok = str_contains(str_replace('\\', '/', $_SERVER['SCRIPT_NAME'] ?? ''), '/studyo/') ? '../' : '';
    echo <<<HTML
<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>$b</title><link rel="icon" type="image/png" href="{$kok}assets/ikon/ikon-32.png">
<style>
  body{margin:0;font:15px/1.5 "Segoe UI",system-ui,sans-serif;background:#f3f5f9;color:#1d2433;display:flex;min-height:100vh;align-items:center;justify-content:center}
  .kutu{background:#fff;max-width:520px;margin:16px;padding:28px 32px;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,.08)}
  h1{font-size:20px;margin:0 0 12px}
</style></head>
<body><div class="kutu"><h1><img src="{$kok}assets/ikon/ikon-64.png" alt="" width="32" height="32" style="vertical-align:middle;margin-right:8px">$b</h1>$govde</div></body></html>
HTML;
    exit;
}
