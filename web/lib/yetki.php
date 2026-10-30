<?php
// Rol, ders ve sınıf yetkisi. Kimlik ve kapsam her zaman oturumdan alınır; istekten gelen değerlere güvenilmez.
declare(strict_types=1);

require_once __DIR__ . '/oturum.php';
require_once __DIR__ . '/api.php';

/** Oturum yoksa 401, rol farklıysa 403. */
function oturum_zorunlu(string $rol): array
{
    $k = oturum_kullanici();
    if ($k === null) json_hata(401, 'OTURUM_YOK', 'Oturum yok ya da süresi doldu. Portaldan yeniden girin.');
    if ($k['rol'] !== $rol) json_hata(403, 'YETKI_YOK', 'Bu işlem için yetkiniz yok.');
    return $k;
}

/**
 * İstekte ders_id ya da ders gönderildiyse oturumdakiyle aynı olmalı; değilse 403.
 * (Değer kullanılmaz; yalnızca dersi değiştirme girişimi reddedilir.)
 */
function ders_istegi_kontrol(array $k, array $istek): void
{
    foreach (['ders_id' => 'ders_id', 'ders' => 'ders'] as $alan => $oturumAlani) {
        if (!array_key_exists($alan, $istek)) continue;
        if (!is_scalar($istek[$alan]) || (string)$istek[$alan] !== (string)$k[$oturumAlani]) {
            json_hata(403, 'YETKI_YOK', 'Bu ders için yetkiniz yok.');
        }
    }
}

/** Öğrenci başka bir öğrencinin ya da sınıfın verisini isteyemez: okul_no/sinif oturumdakinden farklıysa 403. */
function ogrenci_istegi_kontrol(array $k, array $istek): void
{
    ders_istegi_kontrol($k, $istek);
    foreach (['okul_no' => 'okul_no', 'sinif' => 'sinif'] as $alan => $oturumAlani) {
        if (array_key_exists($alan, $istek) && (!is_scalar($istek[$alan]) || (string)$istek[$alan] !== (string)$k[$oturumAlani])) {
            json_hata(403, 'YETKI_YOK', 'Yalnızca kendi puanlarınızı görebilirsiniz.');
        }
    }
}

/**
 * Öğretmenin bu istekte göreceği sınıflar. $sinif boşsa oturumdaki tüm sınıflar;
 * doluysa listede olmalı, değilse 403.
 */
function ogretmen_siniflari(array $k, string $sinif = ''): array
{
    if ($sinif === '') return $k['siniflar'];
    if (!in_array($sinif, $k['siniflar'], true)) json_hata(403, 'YETKI_YOK', 'Bu sınıf için yetkiniz yok.');
    return [$sinif];
}

/** "kolon IN (?, ?, ...)" üretir, değerleri $deg'e ekler. Liste boşsa hiçbir satır dönmeyen koşul. */
function in_kosulu(string $kolon, array $liste, array &$deg): string
{
    if (!$liste) return '1 = 0';
    array_push($deg, ...$liste);
    return $kolon . ' IN (' . implode(', ', array_fill(0, count($liste), '?')) . ')';
}

function json_govde(): array
{
    $g = json_decode((string)file_get_contents('php://input'), true);
    if (!is_array($g)) json_hata(400, 'PARAMETRE_HATALI', 'İstek gövdesi JSON nesnesi olmalı.');
    return $g;
}

function csrf_kontrol(): void
{
    if (!hash_equals($_SESSION['csrf'] ?? '', (string)($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ''))) {
        json_hata(403, 'CSRF', 'Sayfayı yenileyip yeniden deneyin.');
    }
}
