<?php
// Öğrencinin temrin çalışması. Kimlik her zaman oturumdan; istekte farklı okul_no/ders_id/sinif → 403.
//
//   Öğrenci GET  ?temrin_id=1                      → görev, proje, cevaplar, (teslimse) sonuç
//   Öğrenci POST {"islem":"kaydet","temrin_id":1,"veri":{...},"surum":3,"force":false}  → {surum, guncellenme}; çakışmada 409
//   Öğrenci POST {"islem":"cevap","temrin_id":1,"cevaplar":{"S1":"..."}}
//   Öğrenci POST {"islem":"teslim","temrin_id":1,"veri":{...},"cevaplar":{...}}         → {kontroller, sonuc}
//   Öğrenci POST {"islem":"degerlendirme","temrin_id":1,"sonuc":{"derlendi":true,"sonuclar":[{"no":"K1","gecti":true,"mesaj":""}]}}
//   Öğretmen GET ?temrin_id=1&okul_no=3268          → öğrencinin teslim ettiği proje (salt okunur), yalnız kendi sınıfları
//
// Yazma işlemleri temrin öğrencinin sınıfına açıkken yapılabilir; teslimden sonra proje değiştirilemez.
// Değerlendirme öğrenci tarayıcısında çalışır; öğretmen doğrulaması (ogretmen.php islem=degerlendirme) onun üzerine yazar.
declare(strict_types=1);

require_once __DIR__ . '/../lib/env.php';
require_once __DIR__ . '/../lib/db.php';
require_once __DIR__ . '/../lib/sonuc.php';
require_once __DIR__ . '/../lib/tanim.php';
require_once __DIR__ . '/../lib/puanla.php';
require_once __DIR__ . '/../lib/yetki.php';

const PROJE_EN_BUYUK = 3_000_000;

$k = oturum_kullanici();
if ($k === null) json_hata(401, 'OTURUM_YOK', 'Oturum yok ya da süresi doldu. Portaldan yeniden girin.');
$yontem = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$g = $yontem === 'POST' ? json_govde() : $_GET;

/** Temrin oturumdaki derse ait olmalı; tanımı çözülmüş olarak döner. */
function calisma_temrini(string $dersId, mixed $id): array
{
    $id = filter_var($id, FILTER_VALIDATE_INT);
    if ($id === false || $id === null) json_hata(400, 'PARAMETRE_HATALI', 'temrin_id gerekli.');
    $st = db()->prepare('SELECT * FROM temrinler WHERE id = ? AND ders_id = ?');
    $st->execute([$id, $dersId]);
    $t = $st->fetch();
    if (!$t) json_hata(404, 'BULUNAMADI', 'Bu derste böyle bir temrin yok.');
    $t['tanim_dizi'] = json_decode($t['tanim'], true) ?: ['bilgi' => [], 'araclar' => [], 'islemler' => [], 'olcutler' => []];
    return $t;
}

function calisma_getir(int $temrinId, string $okulNo): ?array
{
    $st = db()->prepare('SELECT * FROM calismalar WHERE temrin_id = ? AND okul_no = ?');
    $st->execute([$temrinId, $okulNo]);
    return $st->fetch() ?: null;
}

function calisma_erisimi(int $temrinId, string $sinif): array
{
    $st = db()->prepare('SELECT * FROM temrin_erisim WHERE temrin_id = ? AND sinif = ?');
    $st->execute([$temrinId, $sinif]);
    return temrin_erisimi($st->fetch() ?: null);
}

function json_veri(mixed $v, string $ad, int $sinir): string
{
    if (!is_array($v)) json_hata(400, 'PARAMETRE_HATALI', "$ad bir JSON nesnesi olmalı.");
    $s = json_encode($v, JSON_UNESCAPED_UNICODE);
    if ($s === false || strlen($s) > $sinir) json_hata(413, 'COK_BUYUK', 'Proje çok büyük.');
    return $s;
}

function cevaplari_temizle(mixed $c, array $tanim): array
{
    if ($c === null) return [];
    if (!is_array($c)) json_hata(400, 'PARAMETRE_HATALI', 'cevaplar bir nesne olmalı.');
    $sorular = array_column(tanim_ogrenciye($tanim)['sorular'], 'no');
    $temiz = [];
    foreach ($c as $no => $v) {
        if (!in_array((string)$no, $sorular, true)) continue;
        if (!is_string($v) || mb_strlen($v) > 5000) json_hata(400, 'PARAMETRE_HATALI', "$no cevabı en fazla 5000 karakter olmalı.");
        $temiz[(string)$no] = $v;
    }
    return $temiz;
}

/** Sonucu (yeniden) hesaplayıp sonuclar tablosuna yazar. Öğretmenin elle girdiği ölçütler korunur. */
function calisma_puanla(array $t, array $c): void
{
    $kontrol = null;
    if ($c['degerlendirme'] !== null) {
        $d = json_decode($c['degerlendirme'], true);
        $kontrol = [];
        foreach ($d['sonuclar'] ?? [] as $s) $kontrol[(string)$s['no']] = $s;
    }
    $onceki = sonuc_getir((int)$t['id'], $c['okul_no']);
    $oncekiOlcutler = $onceki ? (json_decode($onceki['detay'], true)['olcutler'] ?? []) : [];
    $olcutler = temrin_puanla($t['tanim_dizi'], $kontrol, json_decode($c['cevaplar'] ?? '{}', true) ?: [], $c['baslama'], $c['teslim_zamani'], $oncekiOlcutler);
    sonuc_kaydet((int)$t['id'], $t['ders_id'], ['okul_no' => $c['okul_no'], 'ad' => $c['ad'], 'sinif' => $c['sinif']], $olcutler, $c['teslim_zamani']);
}

try {
    // ---------------------------------------------------------------- öğretmen: öğrencinin projesini görüntüleme
    if ($k['rol'] === 'ogretmen') {
        if ($yontem !== 'GET') json_hata(403, 'YETKI_YOK', 'Bu işlem için yetkiniz yok.');
        ders_istegi_kontrol($k, $g);
        $t = calisma_temrini($k['ders_id'], $g['temrin_id'] ?? null);
        $c = calisma_getir((int)$t['id'], trim((string)($g['okul_no'] ?? '')));
        if ($c === null || $c['ders_id'] !== $k['ders_id']) json_hata(404, 'BULUNAMADI', 'Bu öğrencinin çalışması yok.');
        if (!in_array($c['sinif'], $k['siniflar'], true)) json_hata(403, 'YETKI_YOK', 'Bu sınıf için yetkiniz yok.');
        json_yanit(['durum' => 'tamam', 'temrin' => tanim_ogrenciye($t['tanim_dizi']) + ['temrin_id' => (int)$t['id']],
            'calisma' => ['veri' => json_decode($c['veri'] ?? 'null', true), 'surum' => (int)$c['surum'], 'guncellenme' => $c['guncellenme'],
                          'cevaplar' => json_decode($c['cevaplar'] ?? '{}', true) ?: new stdClass(), 'teslim_zamani' => $c['teslim_zamani'],
                          'salt_okunur' => true, 'ogrenci' => ['okul_no' => $c['okul_no'], 'ad_soyad' => $c['ad'], 'sinif' => $c['sinif']]]]);
    }

    // ---------------------------------------------------------------- öğrenci
    ogrenci_istegi_kontrol($k, $yontem === 'POST' ? array_merge($_GET, $g) : $g);
    $t = calisma_temrini($k['ders_id'], $g['temrin_id'] ?? null);
    $tid = (int)$t['id'];
    $c = calisma_getir($tid, $k['okul_no']);
    [$izin, $neden] = calisma_erisimi($tid, $k['sinif']);
    $teslimEdildi = $c !== null && $c['teslim_zamani'] !== null;
    $pdo = db();

    if ($yontem === 'GET') {
        if (!$izin && !$teslimEdildi) json_hata(403, 'ERISIM_KAPALI', $neden);
        if ($c === null) {
            // İlk açılış: süre buradan başlar.
            $simdi = utc_simdi();
            $pdo->prepare('INSERT INTO calismalar (temrin_id, ders_id, okul_no, ad, sinif, surum, baslama, guncellenme) VALUES (?, ?, ?, ?, ?, 0, ?, ?)')
                ->execute([$tid, $k['ders_id'], $k['okul_no'], $k['ad'], $k['sinif'], $simdi, $simdi]);
            $c = calisma_getir($tid, $k['okul_no']);
        }
        $yanit = ['durum' => 'tamam', 'temrin' => tanim_ogrenciye($t['tanim_dizi']) + ['temrin_id' => $tid], 'erisilebilir' => $izin, 'neden' => $neden,
            'calisma' => ['veri' => json_decode($c['veri'] ?? 'null', true), 'surum' => (int)$c['surum'], 'guncellenme' => $c['guncellenme'],
                          'cevaplar' => json_decode($c['cevaplar'] ?? '{}', true) ?: new stdClass(), 'baslama' => $c['baslama'],
                          'teslim_zamani' => $c['teslim_zamani'], 'salt_okunur' => $teslimEdildi || !$izin, 'degerlendirildi' => $c['degerlendiren'] !== null]];
        if ($teslimEdildi) {
            $r = sonuc_getir($tid, $k['okul_no']);
            $yanit['sonuc'] = $r ? sonuc_ozeti($r, $t, true) : null;
            // Değerlendirmesi yarım kalmışsa (tarayıcı kapandıysa) öğrenci tarayıcısı yeniden çalıştırabilir.
            if ($c['degerlendiren'] === null) $yanit['kontroller'] = tanim_kontroller($t['tanim_dizi']);
        }
        json_yanit($yanit);
    }

    if ($yontem !== 'POST') {
        header('Allow: GET, POST');
        json_hata(405, 'YONTEM_GECERSIZ', 'Yalnızca GET ve POST kullanılabilir.');
    }
    csrf_kontrol();
    $islem = (string)($g['islem'] ?? '');

    if ($islem === 'degerlendirme') {
        if (!$teslimEdildi) json_hata(409, 'TESLIM_YOK', 'Önce temrini teslim edin.');
        if ($c['degerlendiren'] !== null) json_hata(409, 'DEGERLENDIRILDI', 'Bu teslim zaten değerlendirildi.');
        $sonuc = $g['sonuc'] ?? null;
        if (!is_array($sonuc) || !is_array($sonuc['sonuclar'] ?? null)) json_hata(400, 'PARAMETRE_HATALI', 'sonuc gerekli.');
        $kayit = degerlendirme_temizle($sonuc, $t['tanim_dizi']);
        $pdo->prepare('UPDATE calismalar SET degerlendirme = ?, degerlendiren = ? WHERE id = ? AND degerlendiren IS NULL')
            ->execute([$kayit, 'ogrenci', $c['id']]);
        $c = calisma_getir($tid, $k['okul_no']);
        calisma_puanla($t, $c);
        json_yanit(['durum' => 'tamam', 'sonuc' => sonuc_ozeti(sonuc_getir($tid, $k['okul_no']), $t, true)]);
    }

    if ($teslimEdildi) json_hata(409, 'TESLIM_EDILDI', 'Temrin teslim edildi; artık değiştirilemez.');
    if (!$izin) json_hata(403, 'ERISIM_KAPALI', $neden);
    if ($c === null) json_hata(409, 'CALISMA_YOK', 'Sayfayı yenileyin.');
    $simdi = utc_simdi();

    if ($islem === 'kaydet') {
        $veri = json_veri($g['veri'] ?? null, 'veri', PROJE_EN_BUYUK);
        $surum = filter_var($g['surum'] ?? null, FILTER_VALIDATE_INT);
        if ($surum === false || $surum === null) json_hata(400, 'PARAMETRE_HATALI', 'surum gerekli.');
        $force = ($g['force'] ?? false) === true;
        $u = $pdo->prepare('UPDATE calismalar SET veri = ?, surum = surum + 1, guncellenme = ? WHERE id = ? AND teslim_zamani IS NULL' . ($force ? '' : ' AND surum = ?'));
        $u->execute($force ? [$veri, $simdi, $c['id']] : [$veri, $simdi, $c['id'], $surum]);
        $c2 = calisma_getir($tid, $k['okul_no']);
        if ($u->rowCount() === 0) {
            json_yanit(['durum' => 'hata', 'kod' => 'CAKISMA', 'mesaj' => 'Proje başka bir yerde değiştirilmiş.', 'surum' => (int)$c2['surum'], 'guncellenme' => $c2['guncellenme']], 409);
        }
        json_yanit(['durum' => 'tamam', 'surum' => (int)$c2['surum'], 'guncellenme' => $c2['guncellenme']]);
    }

    if ($islem === 'cevap') {
        $cevaplar = cevaplari_temizle($g['cevaplar'] ?? null, $t['tanim_dizi']);
        $pdo->prepare('UPDATE calismalar SET cevaplar = ?, guncellenme = ? WHERE id = ? AND teslim_zamani IS NULL')
            ->execute([json_encode($cevaplar, JSON_UNESCAPED_UNICODE), $simdi, $c['id']]);
        json_yanit(['durum' => 'tamam']);
    }

    if ($islem === 'teslim') {
        $veri = json_veri($g['veri'] ?? null, 'veri', PROJE_EN_BUYUK);
        $cevaplar = cevaplari_temizle($g['cevaplar'] ?? null, $t['tanim_dizi']);
        $u = $pdo->prepare('UPDATE calismalar SET veri = ?, cevaplar = ?, surum = surum + 1, guncellenme = ?, teslim_zamani = ? WHERE id = ? AND teslim_zamani IS NULL');
        $u->execute([$veri, json_encode($cevaplar, JSON_UNESCAPED_UNICODE), $simdi, $simdi, $c['id']]);
        if ($u->rowCount() === 0) json_hata(409, 'TESLIM_EDILDI', 'Temrin zaten teslim edildi.');
        $c = calisma_getir($tid, $k['okul_no']);
        calisma_puanla($t, $c);
        json_yanit(['durum' => 'tamam', 'teslim_zamani' => $simdi, 'kontroller' => tanim_kontroller($t['tanim_dizi']),
                    'sonuc' => sonuc_ozeti(sonuc_getir($tid, $k['okul_no']), $t, true)]);
    }

    json_hata(400, 'PARAMETRE_HATALI', 'Bilinmeyen işlem.');
} catch (Throwable $e) {
    error_log('calisma.php: ' . get_class($e) . ' ' . $e->getMessage());
    json_hata(500, 'SUNUCU_HATASI', 'Sunucuda bir hata oluştu.');
}
