<?php
// Öğrenci: kendi temrinleri, puanları ve ölçüt ayrıntıları.
// Kimlik her zaman oturumdaki okul_no ve ders_id'den alınır. İstekte başka okul_no/ders_id/sinif varsa 403.
declare(strict_types=1);

require_once __DIR__ . '/../lib/env.php';
require_once __DIR__ . '/../lib/db.php';
require_once __DIR__ . '/../lib/sonuc.php';
require_once __DIR__ . '/../lib/yetki.php';

$k = oturum_zorunlu('ogrenci');
ogrenci_istegi_kontrol($k, $_GET);
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    header('Allow: GET');
    json_hata(405, 'YONTEM_GECERSIZ', 'Yalnızca GET kullanılabilir.');
}

try {
    $pdo = db();
    $st = $pdo->prepare('SELECT t.id, t.temrin_no, t.baslik, e.erisim_acik, e.erisim_baslangic, e.erisim_bitis
        FROM temrinler t LEFT JOIN temrin_erisim e ON e.temrin_id = t.id AND e.sinif = ?
        WHERE t.ders_id = ? ORDER BY t.temrin_no, t.id');
    $st->execute([$k['sinif'], $k['ders_id']]);
    $temrinler = $st->fetchAll();

    $st = $pdo->prepare('SELECT * FROM sonuclar WHERE ders_id = ? AND okul_no = ?');
    $st->execute([$k['ders_id'], $k['okul_no']]);
    $sonuclar = [];
    foreach ($st as $r) $sonuclar[(int)$r['temrin_id']] = $r;

    $liste = [];
    foreach ($temrinler as $t) {
        [$izin, $neden] = temrin_erisimi($t['erisim_acik'] === null ? null : $t);
        $r = $sonuclar[(int)$t['id']] ?? null;
        if (!$izin && $r === null) continue; // kapalı ve teslim edilmemiş temrin gösterilmez
        $o = ['temrin_id' => (int)$t['id'], 'temrin_no' => (int)$t['temrin_no'], 'baslik' => $t['baslik'],
              'erisilebilir' => $izin, 'neden' => $neden, 'sonuc' => null];
        if ($r !== null) {
            $s = sonuc_ozeti($r, $t, true);
            $o['sonuc'] = ['puan' => $s['puan'], 'kesin' => $s['kesin'], 'teslim_zamani' => $s['teslim_zamani'], 'olcutler' => $s['olcutler']];
        }
        $liste[] = $o;
    }
    json_yanit(['durum' => 'tamam', 'ogrenci' => ['okul_no' => $k['okul_no'], 'ad_soyad' => $k['ad'], 'sinif' => $k['sinif'], 'ders' => $k['ders']],
                'temrinler' => $liste]);
} catch (Throwable $e) {
    error_log('ogrenci.php: ' . get_class($e) . ' ' . $e->getMessage());
    json_hata(500, 'SUNUCU_HATASI', 'Sunucuda bir hata oluştu.');
}
