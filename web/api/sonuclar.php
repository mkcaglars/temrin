<?php
// Temrin sonuçları (oturumdaki ders).
//   Öğrenci  GET                         → kendi sonuçları, tüm temrinler, ölçüt ayrıntısıyla (temrin kapalı olsa da)
//   Öğretmen GET ?temrin_id=3            → o temrindeki tüm öğrencilerin sonuçları
//   Öğretmen GET ?temrin_id=3&okul_no=X  → tek öğrencinin ölçüt ayrıntısı
//   Öğretmen POST                        → ölçüt puanlarını ve tespitleri düzenle (eksik notları gir)
//            JSON: {"temrin_id": 3, "okul_no": "3268",
//                   "olcutler": [{"no": "O1", "alinan": 5, "tespit": ""}, {"no": "O7", "alinan": 16, "tespit": "do-while farkı eksik"}]}
//            Başlık: X-CSRF-Token. Gönderilmeyen ölçütler değişmez. "alinan": null → puanı geri al.
declare(strict_types=1);

require_once __DIR__ . '/../lib/env.php';
require_once __DIR__ . '/../lib/db.php';
require_once __DIR__ . '/../lib/sonuc.php';
require_once __DIR__ . '/../lib/oturum.php';
require_once __DIR__ . '/../lib/api.php';

$k = oturum_kullanici();
if ($k === null) json_hata(401, 'OTURUM_YOK', 'Oturum yok ya da süresi doldu. Portaldan yeniden girin.');
$ogretmen = $k['rol'] === 'ogretmen';

function dersin_temrini(int $id, string $dersId): ?array
{
    $st = db()->prepare('SELECT * FROM temrinler WHERE id = ? AND ders_id = ?');
    $st->execute([$id, $dersId]);
    return $st->fetch() ?: null;
}

try {
    $yontem = $_SERVER['REQUEST_METHOD'] ?? 'GET';

    if ($yontem === 'GET') {
        if (!$ogretmen) {
            $st = db()->prepare('SELECT s.*, t.id AS t_id, t.temrin_no, t.baslik FROM sonuclar s
                JOIN temrinler t ON t.id = s.temrin_id WHERE s.ders_id = ? AND s.okul_no = ? ORDER BY t.temrin_no, t.id');
            $st->execute([$k['ders_id'], $k['okul_no']]);
            $liste = [];
            foreach ($st as $r) $liste[] = sonuc_ozeti($r, ['id' => $r['t_id'], 'temrin_no' => $r['temrin_no'], 'baslik' => $r['baslik']], true);
            json_yanit(['durum' => 'tamam', 'sonuclar' => $liste]);
        }
        $tid = filter_var($_GET['temrin_id'] ?? null, FILTER_VALIDATE_INT);
        if ($tid === false || $tid === null) json_hata(400, 'PARAMETRE_HATALI', 'temrin_id gerekli.');
        $t = dersin_temrini($tid, $k['ders_id']);
        if (!$t) json_hata(404, 'BULUNAMADI', 'Bu derste böyle bir temrin yok.');
        $okulNo = trim((string)($_GET['okul_no'] ?? ''));
        if ($okulNo !== '') {
            $r = sonuc_getir($tid, $okulNo);
            if (!$r) json_hata(404, 'BULUNAMADI', 'Bu öğrencinin teslimi yok.');
            json_yanit(['durum' => 'tamam', 'sonuc' => sonuc_ozeti($r, $t, true)]);
        }
        $st = db()->prepare('SELECT * FROM sonuclar WHERE temrin_id = ? ORDER BY sinif, okul_no');
        $st->execute([$tid]);
        $liste = [];
        foreach ($st as $r) $liste[] = sonuc_ozeti($r, $t, false);
        json_yanit(['durum' => 'tamam', 'sonuclar' => $liste]);
    }

    if ($yontem !== 'POST') {
        header('Allow: GET, POST');
        json_hata(405, 'YONTEM_GECERSIZ', 'Yalnızca GET ve POST kullanılabilir.');
    }
    if (!$ogretmen) json_hata(403, 'YETKI_YOK', 'Puanları yalnızca öğretmen düzenleyebilir.');
    if (!hash_equals($_SESSION['csrf'] ?? '', (string)($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ''))) {
        json_hata(403, 'CSRF', 'Sayfayı yenileyip yeniden deneyin.');
    }
    $g = json_decode((string)file_get_contents('php://input'), true);
    if (!is_array($g) || !is_int($g['temrin_id'] ?? null) || !is_string($g['okul_no'] ?? null) || !is_array($g['olcutler'] ?? null)) {
        json_hata(400, 'PARAMETRE_HATALI', 'temrin_id, okul_no ve olcutler gerekli.');
    }
    $t = dersin_temrini($g['temrin_id'], $k['ders_id']);
    if (!$t) json_hata(404, 'BULUNAMADI', 'Bu derste böyle bir temrin yok.');
    $r = sonuc_getir($g['temrin_id'], $g['okul_no']);
    if (!$r) json_hata(404, 'BULUNAMADI', 'Bu öğrencinin teslimi yok.');

    $olcutler = json_decode($r['detay'], true)['olcutler'] ?? [];
    $sira = [];
    foreach ($olcutler as $i => $o) $sira[$o['no']] = $i;
    foreach ($g['olcutler'] as $d) {
        $no = is_array($d) ? ($d['no'] ?? null) : null;
        if (!is_string($no) || !isset($sira[$no])) json_hata(400, 'PARAMETRE_HATALI', 'Bilinmeyen ölçüt: ' . json_encode($no));
        $o = &$olcutler[$sira[$no]];
        if (array_key_exists('alinan', $d)) {
            $a = $d['alinan'];
            if ($a !== null && (!is_int($a) || $a < 0 || $a > (int)$o['puan'])) {
                json_hata(400, 'PARAMETRE_HATALI', "$no için puan 0 ile {$o['puan']} arasında olmalı.");
            }
            $o['alinan'] = $a;
        }
        if (array_key_exists('tespit', $d)) {
            if (!is_string($d['tespit']) || mb_strlen($d['tespit']) > 500) json_hata(400, 'PARAMETRE_HATALI', "$no için tespit en fazla 500 karakter olmalı.");
            $o['tespit'] = trim($d['tespit']);
        }
        $o['duzenleyen'] = 'ogretmen';
        unset($o);
    }
    sonuc_kaydet($g['temrin_id'], $k['ders_id'], ['okul_no' => $r['okul_no'], 'ad' => $r['ad'], 'sinif' => $r['sinif']], $olcutler);
    json_yanit(['durum' => 'tamam', 'sonuc' => sonuc_ozeti(sonuc_getir($g['temrin_id'], $g['okul_no']), $t, true)]);
} catch (Throwable $e) {
    error_log('sonuclar.php: ' . get_class($e) . ' ' . $e->getMessage());
    json_hata(500, 'SUNUCU_HATASI', 'Sunucuda bir hata oluştu.');
}
