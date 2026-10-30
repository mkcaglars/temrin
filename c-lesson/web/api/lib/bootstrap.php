<?php
// Ortak başlangıç: ayarlar, veritabanı, oturum ve yardımcı fonksiyonlar.
declare(strict_types=1);

const APP_SESSION_NAME = 'CSDERS';

function app_config(): array
{
    static $config = null;
    if ($config !== null) return $config;
    $candidates = [
        dirname(__DIR__, 3) . '/csharp-ders-config.php',
        dirname(__DIR__) . '/config.php',
    ];
    foreach ($candidates as $file) {
        if (is_file($file)) {
            $config = require $file;
            return $config;
        }
    }
    http_response_code(500);
    header('Content-Type: text/plain; charset=utf-8');
    echo "Ayar dosyası bulunamadı. api/config.example.php dosyasını api/config.php olarak kopyalayıp düzenleyin.";
    exit;
}

function db(): PDO
{
    static $pdo = null;
    if ($pdo !== null) return $pdo;
    $c = app_config()['db'];
    if (str_starts_with($c['dsn'], 'sqlite:')) {
        $dir = dirname(substr($c['dsn'], 7));
        if (!is_dir($dir)) mkdir($dir, 0770, true);
    }
    $pdo = new PDO($c['dsn'], $c['user'] ?? null, $c['pass'] ?? null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    require_once __DIR__ . '/schema.php';
    schema_migrate($pdo);
    return $pdo;
}

function is_sqlite(): bool
{
    return db()->getAttribute(PDO::ATTR_DRIVER_NAME) === 'sqlite';
}

function start_session(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) return;
    $hours = (int)(app_config()['session_hours'] ?? 10);
    ini_set('session.gc_maxlifetime', (string)($hours * 3600));
    ini_set('session.use_strict_mode', '1');
    session_name(APP_SESSION_NAME);
    $secure = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
    session_set_cookie_params([
        'lifetime' => $hours * 3600,
        'path' => base_path(),
        'secure' => $secure,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_start();
}

/** Uygulamanın bulunduğu klasörün web yolu (ör. "/" veya "/csharp/"). */
function base_path(): string
{
    $script = str_replace('\\', '/', $_SERVER['SCRIPT_NAME'] ?? '/');
    $dir = dirname($script);
    if (basename($dir) === 'api') $dir = dirname($dir);
    $dir = rtrim($dir, '/');
    return $dir . '/';
}

/** Oturumdaki kullanıcı (yoksa null). */
function current_user(): ?array
{
    start_session();
    $id = $_SESSION['user_id'] ?? null;
    if (!$id) return null;
    $expires = $_SESSION['expires'] ?? 0;
    if ($expires < time()) {
        $_SESSION = [];
        return null;
    }
    $st = db()->prepare('SELECT id, uid, name, role, sinif FROM users WHERE id = ?');
    $st->execute([$id]);
    $u = $st->fetch();
    return $u ?: null;
}

function now_str(): string
{
    return gmdate('Y-m-d H:i:s');
}

function html_page(string $title, string $body, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: text/html; charset=utf-8');
    $t = htmlspecialchars($title, ENT_QUOTES);
    echo <<<HTML
<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>$t</title><link rel="icon" href="data:,">
<style>
  body{margin:0;font:15px/1.5 "Segoe UI",system-ui,sans-serif;background:#f3f5f9;color:#1d2433;display:flex;min-height:100vh;align-items:center;justify-content:center}
  .box{background:#fff;max-width:520px;margin:16px;padding:28px 32px;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,.08)}
  h1{font-size:20px;margin:0 0 12px} a.btn{display:inline-block;margin-top:12px;background:#2563eb;color:#fff;padding:8px 16px;border-radius:6px;text-decoration:none}
  code{background:#eef;padding:1px 4px;border-radius:4px}
</style></head>
<body><div class="box"><h1>$t</h1>$body</div></body></html>
HTML;
    exit;
}
