<?php
// Veritabanı tablolarını ilk kullanımda otomatik oluşturur.
declare(strict_types=1);

const SCHEMA_VERSION = 1;

function schema_migrate(PDO $pdo): void
{
    $sqlite = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'sqlite';
    // Sürüm tablosu varsa ve güncelse hiçbir şey yapma (her istekte hızlı çıkış).
    try {
        $v = (int)$pdo->query('SELECT version FROM schema_info')->fetchColumn();
        if ($v >= SCHEMA_VERSION) return;
    } catch (PDOException $e) {
        // tablo yok → oluştur
    }

    if ($sqlite) {
        $pdo->exec('CREATE TABLE IF NOT EXISTS schema_info (version INTEGER NOT NULL)');
        $pdo->exec('CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            uid TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT \'ogrenci\',
            sinif TEXT NOT NULL DEFAULT \'\',
            created_at TEXT NOT NULL,
            last_login TEXT NOT NULL)');
        $pdo->exec('CREATE TABLE IF NOT EXISTS projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            data TEXT NOT NULL,
            version INTEGER NOT NULL DEFAULT 1,
            note TEXT NOT NULL DEFAULT \'\',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL)');
        $pdo->exec('CREATE INDEX IF NOT EXISTS projects_user ON projects(user_id)');
        $pdo->exec('CREATE TABLE IF NOT EXISTS used_tokens (jti TEXT PRIMARY KEY, expires_at INTEGER NOT NULL)');
    } else {
        $opts = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci';
        $pdo->exec("CREATE TABLE IF NOT EXISTS schema_info (version INT NOT NULL) $opts");
        $pdo->exec("CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            uid VARCHAR(64) NOT NULL UNIQUE,
            name VARCHAR(150) NOT NULL,
            role VARCHAR(20) NOT NULL DEFAULT 'ogrenci',
            sinif VARCHAR(50) NOT NULL DEFAULT '',
            created_at DATETIME NOT NULL,
            last_login DATETIME NOT NULL) $opts");
        $pdo->exec("CREATE TABLE IF NOT EXISTS projects (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            name VARCHAR(150) NOT NULL,
            data MEDIUMTEXT NOT NULL,
            version INT NOT NULL DEFAULT 1,
            note TEXT NOT NULL,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL,
            INDEX projects_user (user_id),
            CONSTRAINT fk_projects_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE) $opts");
        $pdo->exec("CREATE TABLE IF NOT EXISTS used_tokens (jti VARCHAR(64) PRIMARY KEY, expires_at INT NOT NULL) $opts");
    }
    $pdo->exec('DELETE FROM schema_info');
    $pdo->prepare('INSERT INTO schema_info (version) VALUES (?)')->execute([SCHEMA_VERSION]);
}
