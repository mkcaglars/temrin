<?php
// Öğretmen: puan tablosunu CSV olarak indirir. Yetki süzgeci ekranla aynıdır (oturumdaki ders ve sınıflar).
//   GET ?sinif=11 Donanım B   (boşsa öğretmenin tüm sınıfları)
declare(strict_types=1);

require_once __DIR__ . '/../lib/env.php';
require_once __DIR__ . '/../lib/tablo.php';
require_once __DIR__ . '/../lib/yetki.php';

$k = oturum_zorunlu('ogretmen');
ders_istegi_kontrol($k, $_GET);
$sinif = is_string($_GET['sinif'] ?? null) ? trim($_GET['sinif']) : '';
$siniflar = ogretmen_siniflari($k, $sinif);

/** Dosya adı için: Türkçe harfleri sadeleştirir, harf/rakam dışını tireye çevirir. */
function dosya_parcasi(string $s): string
{
    $s = strtr($s, ['ç' => 'c', 'Ç' => 'C', 'ğ' => 'g', 'Ğ' => 'G', 'ı' => 'i', 'İ' => 'I', 'ö' => 'o', 'Ö' => 'O',
                    'ş' => 's', 'Ş' => 'S', 'ü' => 'u', 'Ü' => 'U', '#' => 'sharp']);
    $s = trim((string)preg_replace('/[^A-Za-z0-9]+/', '-', $s), '-');
    return $s === '' ? 'ders' : strtolower($s);
}

/** Excel formül enjeksiyonunu önler: = + - @ ile başlayan metinlerin başına ' konur. Sayılar olduğu gibi kalır. */
function hucre(mixed $v): string
{
    if ($v === null) return '';
    if (is_int($v)) return (string)$v;
    if (is_float($v)) return str_replace('.', ',', (string)$v);
    $v = (string)$v;
    return preg_match('/^[=+\-@\t\r]/', $v) ? "'" . $v : $v;
}

try {
    $t = puan_tablosu($k['ders_id'], $siniflar);
} catch (Throwable $e) {
    error_log('disa-aktar.php: ' . get_class($e) . ' ' . $e->getMessage());
    json_hata(500, 'SUNUCU_HATASI', 'Sunucuda bir hata oluştu.');
}

$ad = 'temrin-' . dosya_parcasi($k['ders'] !== '' ? $k['ders'] : $k['ders_id']) . '-' . ($sinif === '' ? 'tum-siniflar' : dosya_parcasi($sinif)) . '.csv';
header('Content-Type: text/csv; charset=utf-8');
header('Content-Disposition: attachment; filename="' . $ad . '"');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

$f = fopen('php://output', 'w');
fwrite($f, "\xEF\xBB\xBF");
$satir = fn(array $h) => fputcsv($f, array_map('hucre', $h), ';', '"', '', "\r\n");
$baslik = ['Okul No', 'Ad Soyad', 'Sınıf'];
foreach ($t['temrinler'] as $tm) $baslik[] = 'T' . $tm['temrin_no'] . ' ' . $tm['baslik'];
array_push($baslik, 'Ortalama', 'Bekleyen');
$satir($baslik);
foreach ($t['ogrenciler'] as $o) {
    $h = [$o['okul_no'], $o['ad_soyad'], $o['sinif']];
    $bekleyen = [];
    foreach ($t['temrinler'] as $tm) {
        $p = $o['puanlar'][$tm['temrin_id']] ?? null;
        $h[] = $p['puan'] ?? null;
        if ($p !== null && !$p['kesin']) $bekleyen[] = 'T' . $tm['temrin_no'];
    }
    $h[] = $o['ortalama'];
    $h[] = implode(' ', $bekleyen);
    $satir($h);
}
$son = ['', 'Temrin ortalaması', ''];
foreach ($t['temrinler'] as $tm) $son[] = $t['temrin_ortalamalari'][$tm['temrin_id']];
array_push($son, $t['sinif_ortalamasi'], '');
$satir($son);
fclose($f);
