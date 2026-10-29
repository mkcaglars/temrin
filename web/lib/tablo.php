<?php
// Öğretmenin puan tablosu: öğrenci × temrin, ortalamalar. Ekran ve CSV aynı fonksiyonu kullanır.
// Kapsam her zaman ders_id = oturumdaki ders ve sinif IN (yetkili sınıflar) ile sınırlıdır.
declare(strict_types=1);

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/yetki.php';

/** Ortalamaya yalnızca kesinleşmiş puanlar girer. Hiç yoksa null. */
function ortalama(array $puanlar): ?float
{
    return $puanlar ? round(array_sum($puanlar) / count($puanlar), 1) : null;
}

function puan_tablosu(string $dersId, array $siniflar): array
{
    $pdo = db();
    $st = $pdo->prepare('SELECT id, temrin_no, baslik FROM temrinler WHERE ders_id = ? ORDER BY temrin_no, id');
    $st->execute([$dersId]);
    $temrinler = array_map(fn($t) => ['temrin_id' => (int)$t['id'], 'temrin_no' => (int)$t['temrin_no'], 'baslik' => $t['baslik']], $st->fetchAll());

    $ogrenciler = [];
    $deg = [$dersId];
    $st = $pdo->prepare('SELECT okul_no, ad, sinif FROM ders_ogrencileri WHERE ders_id = ? AND ' . in_kosulu('sinif', $siniflar, $deg));
    $st->execute($deg);
    foreach ($st as $r) $ogrenciler[$r['okul_no']] = ['okul_no' => $r['okul_no'], 'ad_soyad' => $r['ad'], 'sinif' => $r['sinif'], 'puanlar' => []];

    $deg = [$dersId];
    $st = $pdo->prepare('SELECT temrin_id, okul_no, ad, sinif, puan, kesin FROM sonuclar WHERE ders_id = ? AND ' . in_kosulu('sinif', $siniflar, $deg));
    $st->execute($deg);
    $temrinPuanlari = [];
    foreach ($st as $r) {
        $o = &$ogrenciler[$r['okul_no']];
        $o ??= ['okul_no' => $r['okul_no'], 'ad_soyad' => $r['ad'], 'sinif' => $r['sinif'], 'puanlar' => []];
        $o['puanlar'][(int)$r['temrin_id']] = ['puan' => $r['puan'] === null ? null : (int)$r['puan'], 'kesin' => (bool)$r['kesin']];
        if ($r['kesin'] && $r['puan'] !== null) $temrinPuanlari[(int)$r['temrin_id']][] = (int)$r['puan'];
        unset($o);
    }

    $ogrenciOrtalamalari = [];
    foreach ($ogrenciler as &$o) {
        $kesin = array_column(array_filter($o['puanlar'], fn($p) => $p['kesin'] && $p['puan'] !== null), 'puan');
        $o['ortalama'] = ortalama($kesin);
        $o['bekleyen'] = count(array_filter($o['puanlar'], fn($p) => !$p['kesin']));
        if ($o['ortalama'] !== null) $ogrenciOrtalamalari[] = $o['ortalama'];
    }
    unset($o);
    uasort($ogrenciler, fn($a, $b) => [$a['sinif'], $a['okul_no']] <=> [$b['sinif'], $b['okul_no']]);

    $temrinOrtalamalari = [];
    foreach ($temrinler as $t) $temrinOrtalamalari[$t['temrin_id']] = ortalama($temrinPuanlari[$t['temrin_id']] ?? []);

    return [
        'temrinler' => $temrinler,
        'ogrenciler' => array_values($ogrenciler),
        'temrin_ortalamalari' => $temrinOrtalamalari,
        // Sınıf ortalaması: öğrenci ortalamalarının ortalaması (her öğrenci eşit ağırlıkta).
        'sinif_ortalamasi' => ortalama($ogrenciOrtalamalari),
    ];
}
