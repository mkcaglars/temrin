<?php
// JSON API. Kullanım: api/?r=projects, api/?r=projects/12 ...
declare(strict_types=1);
require __DIR__ . '/lib/bootstrap.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function out(mixed $data, int $status = 200): never
{
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function fail(string $message, int $status = 400, array $extra = []): never
{
    out(['error' => $message] + $extra, $status);
}

/** İstek gövdesindeki bir alanı JSON olarak, boş nesneler ({}) korunarak yeniden kodlar. */
function raw_json_field(string $name): ?string
{
    $o = json_decode(file_get_contents('php://input') ?: '');
    if (!is_object($o) || !property_exists($o, $name)) return null;
    $json = json_encode($o->$name, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    return $json === false ? null : $json;
}

function body(int $max = 0): array
{
    $raw = file_get_contents('php://input') ?: '';
    if ($max <= 0) $max = (int)(app_config()['max_project_bytes'] ?? 3000000) + 10000;
    if (strlen($raw) > $max) fail('Proje çok büyük (en fazla ' . round($max / 1000000, 1) . ' MB).', 413);
    $data = json_decode($raw, true);
    if (!is_array($data)) fail('Geçersiz istek gövdesi.');
    return $data;
}

function require_user(): array
{
    $u = current_user();
    if (!$u) fail('Oturum bulunamadı. Lütfen okul portalından giriş yapın.', 401);
    return $u;
}

function require_teacher(array $u): void
{
    if ($u['role'] !== 'ogretmen') fail('Bu işlem için öğretmen yetkisi gerekir.', 403);
}

function clean_name(mixed $name): string
{
    $n = trim(preg_replace('/\s+/u', ' ', (string)$name) ?? '');
    $n = mb_substr($n, 0, 100);
    if ($n === '') fail('Proje adı boş olamaz.');
    return $n;
}

function check_data(mixed $data): string
{
    if (!is_array($data)) fail('Proje verisi eksik.');
    $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false) fail('Proje verisi kodlanamadı.');
    if (strlen($json) > (int)(app_config()['max_project_bytes'] ?? 3000000)) fail('Proje çok büyük.', 413);
    return $json;
}

/** Projeyi getirir ve kullanıcının erişim hakkını denetler. */
function load_project(int $id, array $u, bool $write): array
{
    $st = db()->prepare('SELECT p.*, u.name AS owner_name, u.uid AS owner_uid, u.sinif AS owner_sinif
                         FROM projects p JOIN users u ON u.id = p.user_id WHERE p.id = ?');
    $st->execute([$id]);
    $p = $st->fetch();
    if (!$p) fail('Proje bulunamadı.', 404);
    $own = (int)$p['user_id'] === (int)$u['id'];
    if (!$own && $u['role'] !== 'ogretmen') fail('Bu projeye erişim izniniz yok.', 403);
    if ($write && !$own) fail('Başka bir kullanıcının projesi değiştirilemez. "Kopyasını al" ile kendi alanınıza kopyalayabilirsiniz.', 403);
    return $p;
}

function project_summary(array $p): array
{
    return [
        'id' => (int)$p['id'],
        'name' => $p['name'],
        'version' => (int)$p['version'],
        'created_at' => $p['created_at'],
        'updated_at' => $p['updated_at'],
        'size' => isset($p['size']) ? (int)$p['size'] : null,
        'has_note' => isset($p['note']) ? $p['note'] !== '' : null,
    ];
}

/** Laboratuvar veritabanı adı (MySQL kuralları: harf, rakam, _ ve $; en fazla 64) */
function lab_db_name(string $n): string
{
    $n = mb_strtolower(trim($n));
    if ($n === '' || mb_strlen($n) > 64 || !preg_match('/^[\p{L}\p{N}_$]+$/u', $n)) fail('Geçersiz veritabanı adı.');
    return $n;
}

function lab_task_out(array $t): array
{
    return [
        'id' => (int)$t['id'],
        'title' => $t['title'],
        'sinif' => $t['sinif'],
        'active' => (bool)(int)$t['active'],
        'data' => json_decode($t['data']),
        'author' => $t['author_name'] ?? null,
        'updated_at' => $t['updated_at'],
    ];
}

function user_public(array $u): array
{
    return ['id' => (int)$u['id'], 'uid' => $u['uid'], 'name' => $u['name'], 'role' => $u['role'], 'sinif' => $u['sinif']];
}

// --------------------------------------------------------------------------- yönlendirme

$method = $_SERVER['REQUEST_METHOD'];
$route = trim((string)($_GET['r'] ?? ''), '/');
$parts = $route === '' ? [] : explode('/', $route);

// Değişiklik yapan isteklerde başka sitelerden gelen istekleri engelle (CSRF).
if ($method !== 'GET' && ($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '') !== 'csharp-ders') {
    fail('Geçersiz istek kaynağı.', 403);
}

try {
    // Herkese açık bilgi
    if ($route === 'info') {
        $c = app_config();
        out(['portal_url' => $c['portal_url'] ?? '', 'test_portal' => !empty($c['test_portal'])]);
    }

    $u = require_user();
    $pdo = db();

    switch (true) {
        case $route === 'me' && $method === 'GET':
            out(['user' => user_public($u)]);

        case $route === 'projects' && $method === 'GET':
            $len = is_sqlite() ? 'LENGTH(data)' : 'CHAR_LENGTH(data)';
            $st = $pdo->prepare("SELECT id, name, version, created_at, updated_at, note, $len AS size FROM projects WHERE user_id = ? ORDER BY updated_at DESC");
            $st->execute([$u['id']]);
            out(['projects' => array_map('project_summary', $st->fetchAll())]);

        case $route === 'projects' && $method === 'POST': {
            $b = body();
            $name = clean_name($b['name'] ?? '');
            $json = check_data($b['data'] ?? null);
            $count = $pdo->prepare('SELECT COUNT(*) FROM projects WHERE user_id = ?');
            $count->execute([$u['id']]);
            if ((int)$count->fetchColumn() >= (int)(app_config()['max_projects_per_user'] ?? 200)) fail('Proje sayısı sınırına ulaştınız. Eski projelerden bazılarını silin.');
            $now = now_str();
            $pdo->prepare('INSERT INTO projects (user_id, name, data, version, note, created_at, updated_at) VALUES (?, ?, ?, 1, \'\', ?, ?)')
                ->execute([$u['id'], $name, $json, $now, $now]);
            out(['id' => (int)$pdo->lastInsertId(), 'version' => 1, 'updated_at' => $now], 201);
        }

        case count($parts) === 2 && $parts[0] === 'projects' && ctype_digit($parts[1]): {
            $id = (int)$parts[1];
            if ($method === 'GET') {
                $p = load_project($id, $u, false);
                out([
                    'id' => (int)$p['id'],
                    'name' => $p['name'],
                    'version' => (int)$p['version'],
                    'updated_at' => $p['updated_at'],
                    'note' => $p['note'],
                    'data' => json_decode($p['data'], true),
                    'readonly' => (int)$p['user_id'] !== (int)$u['id'],
                    'owner' => ['id' => (int)$p['user_id'], 'name' => $p['owner_name'], 'uid' => $p['owner_uid'], 'sinif' => $p['owner_sinif']],
                ]);
            }
            if ($method === 'PUT') {
                $p = load_project($id, $u, true);
                $b = body();
                $json = check_data($b['data'] ?? null);
                $base = (int)($b['version'] ?? 0);
                $force = !empty($b['force']);
                if (!$force && $base !== (int)$p['version']) {
                    fail('Bu proje başka bir yerde (ör. başka bir bilgisayarda) değiştirilmiş.', 409, ['version' => (int)$p['version'], 'updated_at' => $p['updated_at']]);
                }
                $name = isset($b['name']) ? clean_name($b['name']) : $p['name'];
                $now = now_str();
                $newVersion = (int)$p['version'] + 1;
                $st = $pdo->prepare('UPDATE projects SET data = ?, name = ?, version = ?, updated_at = ? WHERE id = ? AND version = ?');
                $st->execute([$json, $name, $newVersion, $now, $id, (int)$p['version']]);
                if ($st->rowCount() === 0) fail('Proje aynı anda başka yerden kaydedildi, tekrar deneyin.', 409, ['version' => (int)$p['version']]);
                out(['id' => $id, 'version' => $newVersion, 'updated_at' => $now]);
            }
            if ($method === 'DELETE') {
                load_project($id, $u, true);
                $pdo->prepare('DELETE FROM projects WHERE id = ?')->execute([$id]);
                out(['ok' => true]);
            }
            fail('Desteklenmeyen işlem.', 405);
        }

        case count($parts) === 3 && $parts[0] === 'projects' && ctype_digit($parts[1]) && $method === 'POST': {
            $id = (int)$parts[1];
            $action = $parts[2];
            if ($action === 'rename') {
                $p = load_project($id, $u, true);
                $name = clean_name(body()['name'] ?? '');
                $pdo->prepare('UPDATE projects SET name = ?, updated_at = ? WHERE id = ?')->execute([$name, now_str(), $id]);
                out(['ok' => true, 'name' => $name]);
            }
            if ($action === 'copy') {
                $p = load_project($id, $u, false);
                $b = body();
                $name = clean_name($b['name'] ?? ($p['name'] . ' - kopya'));
                $count = $pdo->prepare('SELECT COUNT(*) FROM projects WHERE user_id = ?');
                $count->execute([$u['id']]);
                if ((int)$count->fetchColumn() >= (int)(app_config()['max_projects_per_user'] ?? 200)) fail('Proje sayısı sınırına ulaştınız. Eski projelerden bazılarını silin.');
                $now = now_str();
                $pdo->prepare('INSERT INTO projects (user_id, name, data, version, note, created_at, updated_at) VALUES (?, ?, ?, 1, \'\', ?, ?)')
                    ->execute([$u['id'], $name, $p['data'], $now, $now]);
                out(['id' => (int)$pdo->lastInsertId(), 'name' => $name], 201);
            }
            if ($action === 'distribute') {
                // Öğretmen: projeyi seçilen sınıftaki öğrencilerin her birine kopyalar.
                require_teacher($u);
                $p = load_project($id, $u, false);
                if ((int)$p['user_id'] !== (int)$u['id']) fail('Yalnızca kendi projenizi sınıfa gönderebilirsiniz. Öğrenci projesini önce "Kopyasını al" ile kendi alanınıza alın.', 403);
                $b = body();
                $sinif = trim((string)($b['sinif'] ?? ''));
                if ($sinif === '') fail('Sınıf seçin.');
                $name = clean_name($b['name'] ?? $p['name']);
                $note = mb_substr(trim((string)($b['note'] ?? '')), 0, 4000);
                $skipExisting = !array_key_exists('skipExisting', $b) || !empty($b['skipExisting']);
                $only = isset($b['students']) && is_array($b['students']) ? array_map('intval', $b['students']) : null;
                $st = $pdo->prepare("SELECT id, name FROM users WHERE sinif = ? AND role = 'ogrenci' ORDER BY name");
                $st->execute([$sinif]);
                $students = array_filter($st->fetchAll(), fn($s) => $only === null || in_array((int)$s['id'], $only, true));
                if (!$students) fail('Bu sınıfta (henüz giriş yapmış) öğrenci yok.');
                $max = (int)(app_config()['max_projects_per_user'] ?? 200);
                $exists = $pdo->prepare('SELECT COUNT(*) FROM projects WHERE user_id = ? AND name = ?');
                $count = $pdo->prepare('SELECT COUNT(*) FROM projects WHERE user_id = ?');
                $ins = $pdo->prepare('INSERT INTO projects (user_id, name, data, version, note, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?, ?)');
                $now = now_str();
                $copied = [];
                $skipped = [];
                $pdo->beginTransaction();
                try {
                    foreach ($students as $s) {
                        $sid = (int)$s['id'];
                        if ($skipExisting) {
                            $exists->execute([$sid, $name]);
                            if ((int)$exists->fetchColumn() > 0) { $skipped[] = ['name' => $s['name'], 'reason' => 'aynı adlı proje var']; continue; }
                        }
                        $count->execute([$sid]);
                        if ((int)$count->fetchColumn() >= $max) { $skipped[] = ['name' => $s['name'], 'reason' => 'proje sınırı dolu']; continue; }
                        $ins->execute([$sid, $name, $p['data'], $note, $now, $now]);
                        $copied[] = $s['name'];
                    }
                    $pdo->commit();
                } catch (Throwable $e) {
                    $pdo->rollBack();
                    throw $e;
                }
                out(['copied' => $copied, 'skipped' => $skipped]);
            }
            if ($action === 'note') {
                require_teacher($u);
                load_project($id, $u, false);
                $note = mb_substr(trim((string)(body()['note'] ?? '')), 0, 4000);
                $pdo->prepare('UPDATE projects SET note = ? WHERE id = ?')->execute([$note, $id]);
                out(['ok' => true, 'note' => $note]);
            }
            fail('Bilinmeyen işlem.', 404);
        }

        // ------------------------------------------------------------- laboratuvar
        case $route === 'lab/state' && $method === 'GET': {
            $st = $pdo->prepare('SELECT data, version, updated_at FROM lab_state WHERE user_id = ?');
            $st->execute([$u['id']]);
            $row = $st->fetch();
            $dbs = $pdo->prepare('SELECT name, size, updated_at FROM lab_databases WHERE user_id = ? ORDER BY name');
            $dbs->execute([$u['id']]);
            out([
                'state' => $row ? json_decode($row['data']) : null,
                'version' => $row ? (int)$row['version'] : 0,
                'databases' => array_map(fn($d) => ['name' => $d['name'], 'size' => (int)$d['size'], 'updated_at' => $d['updated_at']], $dbs->fetchAll()),
            ]);
        }

        case $route === 'lab/state' && $method === 'PUT': {
            $b = body(1000000);
            if (!is_array($b['state'] ?? null)) fail('Durum verisi eksik.');
            $json = raw_json_field('state');
            if ($json === false || strlen($json) > 900000) fail('Laboratuvar durumu çok büyük.', 413);
            $now = now_str();
            $up = $pdo->prepare('UPDATE lab_state SET data = ?, version = version + 1, updated_at = ? WHERE user_id = ?');
            $up->execute([$json, $now, $u['id']]);
            if ($up->rowCount() === 0) {
                try {
                    $pdo->prepare('INSERT INTO lab_state (user_id, data, version, updated_at) VALUES (?, ?, 1, ?)')->execute([$u['id'], $json, $now]);
                } catch (PDOException $e) {
                    $up->execute([$json, $now, $u['id']]);
                }
            }
            out(['ok' => true, 'updated_at' => $now]);
        }

        case count($parts) >= 3 && $parts[0] === 'lab' && $parts[1] === 'databases': {
            $name = lab_db_name(rawurldecode($parts[2]));
            $action = $parts[3] ?? '';
            if ($action === '' && $method === 'GET') {
                $st = $pdo->prepare('SELECT name, data, updated_at FROM lab_databases WHERE user_id = ? AND name = ?');
                $st->execute([$u['id'], $name]);
                $d = $st->fetch();
                if (!$d) fail('Veritabanı bulunamadı.', 404);
                out(['name' => $d['name'], 'data' => $d['data'], 'updated_at' => $d['updated_at']]);
            }
            if ($action === '' && $method === 'PUT') {
                $max = (int)(app_config()['max_lab_db_bytes'] ?? 4000000);
                $b = body($max + 10000);
                $data = (string)($b['data'] ?? '');
                if ($data === '' || strlen($data) > $max || !preg_match('/^[A-Za-z0-9+\/=]+$/', $data)) fail('Veritabanı dosyası geçersiz ya da çok büyük.', 413);
                $now = now_str();
                $up = $pdo->prepare('UPDATE lab_databases SET data = ?, size = ?, updated_at = ? WHERE user_id = ? AND name = ?');
                $up->execute([$data, strlen($data), $now, $u['id'], $name]);
                if ($up->rowCount() === 0) {
                    $count = $pdo->prepare('SELECT COUNT(*) FROM lab_databases WHERE user_id = ?');
                    $count->execute([$u['id']]);
                    if ((int)$count->fetchColumn() >= (int)(app_config()['max_lab_dbs_per_user'] ?? 40)) fail('Veritabanı sayısı sınırına ulaştınız. Kullanmadıklarınızı silin (DROP DATABASE).');
                    try {
                        $pdo->prepare('INSERT INTO lab_databases (user_id, name, data, size, updated_at) VALUES (?, ?, ?, ?, ?)')->execute([$u['id'], $name, $data, strlen($data), $now]);
                    } catch (PDOException $e) {
                        $up->execute([$data, strlen($data), $now, $u['id'], $name]);
                    }
                }
                out(['ok' => true, 'updated_at' => $now]);
            }
            if ($action === '' && $method === 'DELETE') {
                $pdo->prepare('DELETE FROM lab_databases WHERE user_id = ? AND name = ?')->execute([$u['id'], $name]);
                out(['ok' => true]);
            }
            if ($action === 'distribute' && $method === 'POST') {
                // Öğretmen: kendi veritabanını sınıftaki öğrencilerin sunucusuna kopyalar.
                require_teacher($u);
                $st = $pdo->prepare('SELECT data FROM lab_databases WHERE user_id = ? AND name = ?');
                $st->execute([$u['id'], $name]);
                $data = $st->fetchColumn();
                if ($data === false) fail('Veritabanı bulunamadı. Önce laboratuvarda oluşturun.', 404);
                $b = body();
                $sinif = trim((string)($b['sinif'] ?? ''));
                if ($sinif === '') fail('Sınıf seçin.');
                $target = lab_db_name((string)($b['as'] ?? $name));
                $overwrite = !empty($b['overwrite']);
                $st = $pdo->prepare("SELECT id, name FROM users WHERE sinif = ? AND role = 'ogrenci' ORDER BY name");
                $st->execute([$sinif]);
                $students = $st->fetchAll();
                if (!$students) fail('Bu sınıfta (henüz giriş yapmış) öğrenci yok.');
                $exists = $pdo->prepare('SELECT COUNT(*) FROM lab_databases WHERE user_id = ? AND name = ?');
                $del = $pdo->prepare('DELETE FROM lab_databases WHERE user_id = ? AND name = ?');
                $ins = $pdo->prepare('INSERT INTO lab_databases (user_id, name, data, size, updated_at) VALUES (?, ?, ?, ?, ?)');
                $now = now_str();
                $copied = [];
                $skipped = [];
                $pdo->beginTransaction();
                try {
                    foreach ($students as $s) {
                        $sid = (int)$s['id'];
                        $exists->execute([$sid, $target]);
                        if ((int)$exists->fetchColumn() > 0) {
                            if (!$overwrite) { $skipped[] = ['name' => $s['name'], 'reason' => 'aynı adlı veritabanı var']; continue; }
                            $del->execute([$sid, $target]);
                        }
                        $ins->execute([$sid, $target, $data, strlen($data), $now]);
                        $copied[] = $s['name'];
                    }
                    $pdo->commit();
                } catch (Throwable $e) {
                    $pdo->rollBack();
                    throw $e;
                }
                out(['copied' => $copied, 'skipped' => $skipped]);
            }
            fail('Bilinmeyen işlem.', 404);
        }

        case $route === 'lab/tasks' && $method === 'GET': {
            if ($u['role'] === 'ogretmen') {
                $st = $pdo->prepare('SELECT t.*, u.name AS author_name FROM lab_tasks t JOIN users u ON u.id = t.author_id WHERE t.author_id = ? ORDER BY t.updated_at DESC');
                $st->execute([$u['id']]);
            } else {
                $st = $pdo->prepare("SELECT t.*, u.name AS author_name FROM lab_tasks t JOIN users u ON u.id = t.author_id WHERE t.active = 1 AND (t.sinif = '' OR t.sinif = ?) ORDER BY t.created_at");
                $st->execute([$u['sinif']]);
            }
            $tasks = array_map('lab_task_out', $st->fetchAll());
            $pr = $pdo->prepare('SELECT task_key, data, done, updated_at FROM lab_progress WHERE user_id = ?');
            $pr->execute([$u['id']]);
            $progress = [];
            foreach ($pr->fetchAll() as $r) $progress[$r['task_key']] = ['data' => json_decode($r['data']), 'done' => (bool)(int)$r['done'], 'updated_at' => $r['updated_at']];
            out(['tasks' => $tasks, 'progress' => $progress]);
        }

        case $route === 'lab/tasks' && $method === 'POST':
        case count($parts) === 3 && $parts[0] === 'lab' && $parts[1] === 'tasks' && ctype_digit($parts[2]): {
            require_teacher($u);
            $id = isset($parts[2]) ? (int)$parts[2] : 0;
            if ($id) {
                $st = $pdo->prepare('SELECT * FROM lab_tasks WHERE id = ?');
                $st->execute([$id]);
                $t = $st->fetch();
                if (!$t || (int)$t['author_id'] !== (int)$u['id']) fail('Görev bulunamadı.', 404);
                if ($method === 'DELETE') {
                    $pdo->prepare('DELETE FROM lab_tasks WHERE id = ?')->execute([$id]);
                    $pdo->prepare('DELETE FROM lab_progress WHERE task_key = ?')->execute(['t' . $id]);
                    out(['ok' => true]);
                }
                if ($method !== 'PUT') fail('Bilinmeyen işlem.', 404);
            }
            $b = body(1000000);
            $title = mb_substr(trim((string)($b['title'] ?? '')), 0, 150);
            if ($title === '') fail('Görev başlığı boş olamaz.');
            if (!is_array($b['data'] ?? null)) fail('Görev adımları eksik.');
            $json = raw_json_field('data');
            if (strlen($json) > 500000) fail('Görev çok büyük.', 413);
            $sinif = mb_substr(trim((string)($b['sinif'] ?? '')), 0, 50);
            $active = !array_key_exists('active', $b) || !empty($b['active']) ? 1 : 0;
            $now = now_str();
            if ($id) {
                $pdo->prepare('UPDATE lab_tasks SET title = ?, sinif = ?, data = ?, active = ?, updated_at = ? WHERE id = ?')->execute([$title, $sinif, $json, $active, $now, $id]);
            } else {
                $pdo->prepare('INSERT INTO lab_tasks (author_id, sinif, title, data, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')->execute([$u['id'], $sinif, $title, $json, $active, $now, $now]);
                $id = (int)$pdo->lastInsertId();
            }
            out(['id' => $id, 'updated_at' => $now], isset($parts[2]) ? 200 : 201);
        }

        case count($parts) === 3 && $parts[0] === 'lab' && $parts[1] === 'progress' && $method === 'PUT': {
            $key = $parts[2];
            if (!preg_match('/^[a-z0-9_.:-]{1,64}$/i', $key)) fail('Geçersiz görev.');
            $b = body(200000);
            $json = raw_json_field('data') ?? '{}';
            $done = !empty($b['done']) ? 1 : 0;
            $now = now_str();
            $up = $pdo->prepare('UPDATE lab_progress SET data = ?, done = ?, updated_at = ? WHERE user_id = ? AND task_key = ?');
            $up->execute([$json, $done, $now, $u['id'], $key]);
            if ($up->rowCount() === 0) {
                try {
                    $pdo->prepare('INSERT INTO lab_progress (user_id, task_key, data, done, updated_at) VALUES (?, ?, ?, ?, ?)')->execute([$u['id'], $key, $json, $done, $now]);
                } catch (PDOException $e) {
                    $up->execute([$json, $done, $now, $u['id'], $key]);
                }
            }
            out(['ok' => true]);
        }

        case $route === 'teacher/lab-progress' && $method === 'GET': {
            require_teacher($u);
            $sinif = (string)($_GET['sinif'] ?? '');
            if ($sinif === '') fail('Sınıf seçin.');
            $st = $pdo->prepare("SELECT id, uid, name, role, sinif FROM users WHERE sinif = ? AND role = 'ogrenci' ORDER BY name");
            $st->execute([$sinif]);
            $students = $st->fetchAll();
            $progress = [];
            if ($students) {
                $ids = array_map(fn($s) => (int)$s['id'], $students);
                $in = implode(',', array_fill(0, count($ids), '?'));
                $pr = $pdo->prepare("SELECT user_id, task_key, data, done, updated_at FROM lab_progress WHERE user_id IN ($in)");
                $pr->execute($ids);
                foreach ($pr->fetchAll() as $r) {
                    $progress[(int)$r['user_id']][$r['task_key']] = ['data' => json_decode($r['data']), 'done' => (bool)(int)$r['done'], 'updated_at' => $r['updated_at']];
                }
            }
            out(['students' => array_map(fn($s) => user_public($s) + ['progress' => $progress[(int)$s['id']] ?? new stdClass()], $students)]);
        }

        // ------------------------------------------------------------- öğretmen
        case $route === 'teacher/students' && $method === 'GET': {
            require_teacher($u);
            $sinif = (string)($_GET['sinif'] ?? '');
            $sql = 'SELECT u.id, u.uid, u.name, u.role, u.sinif, u.last_login,
                           COUNT(p.id) AS project_count, MAX(p.updated_at) AS last_update
                    FROM users u LEFT JOIN projects p ON p.user_id = u.id';
            $args = [];
            if ($sinif !== '') {
                $sql .= ' WHERE u.sinif = ?';
                $args[] = $sinif;
            }
            $sql .= ' GROUP BY u.id, u.uid, u.name, u.role, u.sinif, u.last_login ORDER BY u.sinif, u.name';
            $st = $pdo->prepare($sql);
            $st->execute($args);
            $rows = array_map(fn($r) => user_public($r) + [
                'last_login' => $r['last_login'],
                'project_count' => (int)$r['project_count'],
                'last_update' => $r['last_update'],
            ], $st->fetchAll());
            $classes = $pdo->query("SELECT DISTINCT sinif FROM users WHERE sinif <> '' ORDER BY sinif")->fetchAll(PDO::FETCH_COLUMN);
            out(['students' => $rows, 'classes' => $classes]);
        }

        case count($parts) === 4 && $parts[0] === 'teacher' && $parts[1] === 'students' && ctype_digit($parts[2]) && $parts[3] === 'projects' && $method === 'GET': {
            require_teacher($u);
            $sid = (int)$parts[2];
            $st = $pdo->prepare('SELECT id, uid, name, role, sinif FROM users WHERE id = ?');
            $st->execute([$sid]);
            $student = $st->fetch();
            if (!$student) fail('Öğrenci bulunamadı.', 404);
            $len = is_sqlite() ? 'LENGTH(data)' : 'CHAR_LENGTH(data)';
            $st = $pdo->prepare("SELECT id, name, version, created_at, updated_at, note, $len AS size FROM projects WHERE user_id = ? ORDER BY updated_at DESC");
            $st->execute([$sid]);
            out(['student' => user_public($student), 'projects' => array_map('project_summary', $st->fetchAll())]);
        }
    }

    fail('Bulunamadı: ' . $route, 404);
} catch (PDOException $e) {
    error_log('csharp-ders veritabanı hatası: ' . $e->getMessage());
    fail('Veritabanı hatası. Lütfen daha sonra tekrar deneyin.', 500);
}
