<?php
// Veritabanı bağlantısı ve tablolar (ilk kullanımda oluşturulur).
declare(strict_types=1);

require_once __DIR__ . '/env.php';

const SEMA_SURUMU = 1;

function db(): PDO
{
    static $pdo = null;
    if ($pdo !== null) return $pdo;
    $dsn = env('DB_DSN') ?? throw new RuntimeException('DB_DSN ayarı yok.');
    if (str_starts_with($dsn, 'sqlite:')) {
        $klasor = dirname(substr($dsn, 7));
        if (!is_dir($klasor)) mkdir($klasor, 0770, true);
    }
    $pdo = new PDO($dsn, env('DB_KULLANICI'), env('DB_SIFRE'), [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    sema_guncelle($pdo);
    return $pdo;
}

function sema_guncelle(PDO $pdo): void
{
    try {
        if ((int)$pdo->query('SELECT surum FROM sema_bilgi')->fetchColumn() >= SEMA_SURUMU) return;
    } catch (PDOException) {
        // tablo yok → oluştur
    }
    $sqlite = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'sqlite';
    $id = $sqlite ? 'INTEGER PRIMARY KEY AUTOINCREMENT' : 'INT AUTO_INCREMENT PRIMARY KEY';
    $son = $sqlite ? '' : ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci';
    $metin = $sqlite ? 'TEXT' : 'MEDIUMTEXT';

    $pdo->exec("CREATE TABLE IF NOT EXISTS sema_bilgi (surum INT NOT NULL)$son");
    $pdo->exec("CREATE TABLE IF NOT EXISTS kullanicilar (
        id $id,
        uid VARCHAR(64) NOT NULL UNIQUE,
        okul_no VARCHAR(32) NOT NULL DEFAULT '',
        ad VARCHAR(150) NOT NULL,
        rol VARCHAR(10) NOT NULL,
        sinif VARCHAR(50) NOT NULL DEFAULT '',
        son_giris VARCHAR(20) NOT NULL)$son");
    $pdo->exec("CREATE TABLE IF NOT EXISTS temrinler (
        id $id,
        ders_id VARCHAR(64) NOT NULL,
        temrin_no INT NOT NULL,
        baslik VARCHAR(250) NOT NULL,
        tanim $metin NOT NULL,
        erisim_acik INT NOT NULL DEFAULT 0,
        erisim_baslangic VARCHAR(20) NULL,
        erisim_bitis VARCHAR(20) NULL,
        olusturma VARCHAR(20) NOT NULL)$son");
    // Puanlar okul_no + ders_id ile saklanır; her temrin için öğrencinin tek sonucu vardır.
    $pdo->exec("CREATE TABLE IF NOT EXISTS sonuclar (
        id $id,
        temrin_id INT NOT NULL,
        ders_id VARCHAR(64) NOT NULL,
        okul_no VARCHAR(32) NOT NULL,
        ad VARCHAR(150) NOT NULL,
        sinif VARCHAR(50) NOT NULL DEFAULT '',
        puan INT NULL,
        kesin INT NOT NULL DEFAULT 0,
        teslim_zamani VARCHAR(20) NOT NULL,
        guncellenme_zamani VARCHAR(20) NOT NULL,
        detay $metin NOT NULL,
        UNIQUE (temrin_id, okul_no))$son");
    foreach ([
        'CREATE INDEX sonuclar_ders ON sonuclar (ders_id, guncellenme_zamani, id)',
        'CREATE INDEX sonuclar_ogrenci ON sonuclar (okul_no, ders_id)',
    ] as $sql) {
        try { $pdo->exec($sql); } catch (PDOException) { /* zaten var */ }
    }
    $pdo->exec("CREATE TABLE IF NOT EXISTS kullanilan_tokenlar (jti VARCHAR(64) PRIMARY KEY, bitis INT NOT NULL)$son");

    $pdo->exec('DELETE FROM sema_bilgi');
    $pdo->prepare('INSERT INTO sema_bilgi (surum) VALUES (?)')->execute([SEMA_SURUMU]);
}

/**
 * Öğrencinin temrine girip teslim edebilmesi için: öğretmen erişimi açmış olmalı ve
 * (tanımlıysa) şu an başlangıç–bitiş aralığında olmalı. [izin, Türkçe açıklama] döner.
 */
function temrin_erisimi(array $t, ?string $simdi = null): array
{
    $simdi ??= utc_simdi();
    if (!(int)$t['erisim_acik']) return [false, 'Bu temrin öğretmen tarafından erişime kapatılmış.'];
    if (!empty($t['erisim_baslangic']) && $simdi < $t['erisim_baslangic']) {
        return [false, 'Temrin ' . yerel_zaman($t['erisim_baslangic']) . ' tarihinde başlayacak.'];
    }
    if (!empty($t['erisim_bitis']) && $simdi > $t['erisim_bitis']) {
        return [false, 'Temrinin süresi ' . yerel_zaman($t['erisim_bitis']) . ' tarihinde doldu.'];
    }
    return [true, ''];
}

function saat_dilimi(): DateTimeZone
{
    return new DateTimeZone(env('SAAT_DILIMI', 'Europe/Istanbul'));
}

/** UTC zaman damgasını okulun saat diliminde "30.10.2026 09:15" biçiminde yazar. */
function yerel_zaman(string $utc): string
{
    return (new DateTimeImmutable($utc))->setTimezone(saat_dilimi())->format('d.m.Y H:i');
}

/**
 * Öğretmen ekranından gelen zamanı UTC'ye çevirir. "2026-11-02T09:00" (okulun saat dilimi) ya da
 * saat dilimi belirtilmiş ISO 8601 kabul edilir. Boş → null. Geçersiz → RuntimeException.
 */
function utc_zamana_cevir(?string $s): ?string
{
    $s = trim((string)$s);
    if ($s === '') return null;
    if (!preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:\d{2})?$/', $s)) {
        throw new RuntimeException('Zaman biçimi hatalı: ' . $s);
    }
    return (new DateTimeImmutable($s, saat_dilimi()))->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d\TH:i:s\Z');
}

/** UTC, saniye hassasiyetinde ISO 8601 (ör. 2026-10-30T07:15:00Z). Sıralanabilir metin olarak saklanır. */
function utc_simdi(): string
{
    return gmdate('Y-m-d\TH:i:s\Z');
}
