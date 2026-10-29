<?php
// Oturumdaki dersin temrinleri ve erişim durumu.
//   GET                → liste (öğrenci yalnızca erişime açık olanları görür)
//   POST (öğretmen)    → erişimi aç/kapat, zaman aralığı ayarla
//        JSON: {"temrin_id": 3, "erisim_acik": true, "baslangic": "2026-11-02T09:00", "bitis": "2026-11-02T10:20"}
//        Başlık: X-CSRF-Token (oturumdaki anahtar). Zamanlar okulun saat diliminde; boş → sınırsız.
declare(strict_types=1);

require_once __DIR__ . '/../lib/env.php';
require_once __DIR__ . '/../lib/db.php';
require_once __DIR__ . '/../lib/oturum.php';
require_once __DIR__ . '/../lib/api.php';

$k = oturum_kullanici();
if ($k === null) json_hata(401, 'OTURUM_YOK', 'Oturum yok ya da süresi doldu. Portaldan yeniden girin.');
$ogretmen = $k['rol'] === 'ogretmen';

function temrin_ozeti(array $t, bool $ogretmen): array
{
    [$izin, $neden] = temrin_erisimi($t);
    $o = [
        'temrin_id' => (int)$t['id'],
        'temrin_no' => (int)$t['temrin_no'],
        'baslik' => $t['baslik'],
        'erisilebilir' => $izin,
        'neden' => $neden,
    ];
    if ($ogretmen) {
        $o['erisim_acik'] = (bool)$t['erisim_acik'];
        $o['baslangic'] = $t['erisim_baslangic'];
        $o['bitis'] = $t['erisim_bitis'];
    }
    return $o;
}

try {
    $pdo = db();
    $yontem = $_SERVER['REQUEST_METHOD'] ?? 'GET';

    if ($yontem === 'GET') {
        $st = $pdo->prepare('SELECT * FROM temrinler WHERE ders_id = ? ORDER BY temrin_no, id');
        $st->execute([$k['ders_id']]);
        $liste = [];
        foreach ($st as $t) {
            $o = temrin_ozeti($t, $ogretmen);
            if ($ogretmen || $o['erisilebilir']) $liste[] = $o;
        }
        json_yanit(['durum' => 'tamam', 'temrinler' => $liste]);
    }

    if ($yontem !== 'POST') {
        header('Allow: GET, POST');
        json_hata(405, 'YONTEM_GECERSIZ', 'Yalnızca GET ve POST kullanılabilir.');
    }
    if (!$ogretmen) json_hata(403, 'YETKI_YOK', 'Temrin erişimini yalnızca öğretmen değiştirebilir.');
    if (!hash_equals($_SESSION['csrf'] ?? '', (string)($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ''))) {
        json_hata(403, 'CSRF', 'Sayfayı yenileyip yeniden deneyin.');
    }
    $g = json_decode((string)file_get_contents('php://input'), true);
    if (!is_array($g) || !isset($g['temrin_id']) || !is_int($g['temrin_id']) || !isset($g['erisim_acik']) || !is_bool($g['erisim_acik'])) {
        json_hata(400, 'PARAMETRE_HATALI', 'temrin_id (sayı) ve erisim_acik (true/false) gerekli.');
    }
    try {
        $bas = utc_zamana_cevir($g['baslangic'] ?? null);
        $bit = utc_zamana_cevir($g['bitis'] ?? null);
    } catch (RuntimeException $e) {
        json_hata(400, 'PARAMETRE_HATALI', $e->getMessage());
    }
    if ($bas !== null && $bit !== null && $bit <= $bas) json_hata(400, 'PARAMETRE_HATALI', 'Bitiş zamanı başlangıçtan sonra olmalı.');

    // Öğretmen yalnızca oturumundaki dersin temrinlerini değiştirebilir.
    $u = $pdo->prepare('UPDATE temrinler SET erisim_acik = ?, erisim_baslangic = ?, erisim_bitis = ? WHERE id = ? AND ders_id = ?');
    $u->execute([$g['erisim_acik'] ? 1 : 0, $bas, $bit, $g['temrin_id'], $k['ders_id']]);
    $st = $pdo->prepare('SELECT * FROM temrinler WHERE id = ? AND ders_id = ?');
    $st->execute([$g['temrin_id'], $k['ders_id']]);
    $t = $st->fetch();
    if (!$t) json_hata(404, 'BULUNAMADI', 'Bu derste böyle bir temrin yok.');
    json_yanit(['durum' => 'tamam', 'temrin' => temrin_ozeti($t, true)]);
} catch (Throwable $e) {
    error_log('temrinler.php: ' . get_class($e) . ' ' . $e->getMessage());
    json_hata(500, 'SUNUCU_HATASI', 'Sunucuda bir hata oluştu.');
}
