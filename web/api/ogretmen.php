<?php
// Öğretmen uç noktası. Kapsam: oturumdaki ders_id ve oturumdaki siniflar. İstekteki sınıf listede yoksa,
// ya da istekte farklı bir ders_id/ders varsa 403.
//
//   GET  ?islem=tablo[&sinif=11 Donanım B]        → öğrenci × temrin puan tablosu ve ortalamalar
//   GET  ?islem=sonuc&temrin_id=1&okul_no=3268    → tek sonucun ölçüt ayrıntısı
//   GET  ?islem=erisim&sinif=11 Donanım B         → o sınıf için temrin erişim ayarları
//   POST {"islem": "duzelt", "temrin_id": 1, "okul_no": "3268", "olcutler": [{"no": "O1", "alinan": 5, "tespit": "..."}]}
//   POST {"islem": "erisim", "temrin_id": 1, "sinif": "11 Donanım B", "erisim_acik": true, "baslangic": "2026-11-02T09:00", "bitis": "..."}
//   GET  ?islem=temrinler                         → dersin temrinleri (teslim sayısı, hesaplanacak çıktılar)
//   GET  ?islem=temrin&temrin_id=1                 → temrin tanımının tamamı (kontroller ve cevaplar dahil)
//   GET  ?islem=teslimler&temrin_id=1[&sinif=..]   → yetkili sınıflardaki teslimler (yeniden değerlendirme için)
//   GET  ?islem=teslim&temrin_id=1&okul_no=3268    → tek teslimin projesi (öğretmen tarayıcısında değerlendirmek için)
//   POST {"islem": "temrin_yukle", "csv": "...", "uzerine_yaz": false}
//   POST {"islem": "temrin_sil", "temrin_id": 1}   (teslim yoksa)
//   POST {"islem": "cikti_kaydet", "temrin_id": 1, "ciktilar": {"S2": "1\n2\n3"}}
//   POST {"islem": "degerlendirme", "temrin_id": 1, "okul_no": "3268", "sonuc": {...motor sonucu...}}
//   POST istekleri X-CSRF-Token başlığı ister.
declare(strict_types=1);

require_once __DIR__ . '/../lib/env.php';
require_once __DIR__ . '/../lib/db.php';
require_once __DIR__ . '/../lib/sonuc.php';
require_once __DIR__ . '/../lib/tablo.php';
require_once __DIR__ . '/../lib/tanim.php';
require_once __DIR__ . '/../lib/puanla.php';
require_once __DIR__ . '/../lib/yetki.php';

$k = oturum_zorunlu('ogretmen');
$yontem = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$g = $yontem === 'POST' ? json_govde() : $_GET;
ders_istegi_kontrol($k, $_GET);
ders_istegi_kontrol($k, $g);

$metin = function (string $ad) use ($g): string {
    $v = $g[$ad] ?? '';
    if (!is_string($v) && !is_int($v)) json_hata(400, 'PARAMETRE_HATALI', "$ad metin olmalı.");
    return trim((string)$v);
};
$tamsayi = function (string $ad) use ($g): int {
    $v = filter_var($g[$ad] ?? null, FILTER_VALIDATE_INT);
    if ($v === false || $v === null) json_hata(400, 'PARAMETRE_HATALI', "$ad gerekli.");
    return $v;
};

/** Temrin oturumdaki derse ait olmalı. */
function ders_temrini(int $id, string $dersId): array
{
    $st = db()->prepare('SELECT * FROM temrinler WHERE id = ? AND ders_id = ?');
    $st->execute([$id, $dersId]);
    return $st->fetch() ?: json_hata(404, 'BULUNAMADI', 'Bu derste böyle bir temrin yok.');
}

/** Sonuç oturumdaki derse ve öğretmenin sınıflarından birine ait olmalı; değilse 403/404. */
function yetkili_sonuc(array $k, int $temrinId, string $okulNo): array
{
    $st = db()->prepare('SELECT * FROM sonuclar WHERE temrin_id = ? AND okul_no = ? AND ders_id = ?');
    $st->execute([$temrinId, $okulNo, $k['ders_id']]);
    $r = $st->fetch();
    if (!$r) json_hata(404, 'BULUNAMADI', 'Bu öğrencinin teslimi yok.');
    // Boş sınıf da dahil, kaydın sınıfı öğretmenin listesinde yoksa 403.
    if (!in_array($r['sinif'], $k['siniflar'], true)) json_hata(403, 'YETKI_YOK', 'Bu sınıf için yetkiniz yok.');
    return $r;
}

/** Öğretmenin sınıflarındaki teslim edilmiş çalışma. */
function yetkili_teslim(array $k, int $temrinId, string $okulNo): array
{
    $st = db()->prepare('SELECT * FROM calismalar WHERE temrin_id = ? AND okul_no = ? AND ders_id = ? AND teslim_zamani IS NOT NULL');
    $st->execute([$temrinId, $okulNo, $k['ders_id']]);
    $c = $st->fetch();
    if (!$c) json_hata(404, 'BULUNAMADI', 'Bu öğrencinin teslimi yok.');
    if (!in_array($c['sinif'], $k['siniflar'], true)) json_hata(403, 'YETKI_YOK', 'Bu sınıf için yetkiniz yok.');
    return $c;
}

function teslim_sayisi(int $temrinId): int
{
    $st = db()->prepare('SELECT COUNT(*) FROM calismalar WHERE temrin_id = ? AND teslim_zamani IS NOT NULL');
    $st->execute([$temrinId]);
    return (int)$st->fetchColumn();
}

function temrin_ozeti_ogretmen(array $t): array
{
    $tanim = json_decode($t['tanim'], true) ?: [];
    return ['temrin_id' => (int)$t['id'], 'temrin_no' => (int)$t['temrin_no'], 'baslik' => $t['baslik'],
            'islem_konusu' => $tanim['bilgi']['islem_konusu'] ?? '', 'sure_dk' => $tanim['bilgi']['sure_dk'] ?? null,
            'olcut_sayisi' => count($tanim['olcutler'] ?? []), 'kontrol_sayisi' => count(tanim_kontroller($tanim)),
            'soru_sayisi' => count(tanim_ogrenciye($tanim)['sorular']), 'teslim_sayisi' => teslim_sayisi((int)$t['id']),
            'hesaplanacak_ciktilar' => tanim_hesaplanacak_ciktilar($tanim)];
}

try {
    $islem = $metin('islem');

    if ($yontem === 'GET' && $islem === 'temrinler') {
        $st = db()->prepare('SELECT * FROM temrinler WHERE ders_id = ? ORDER BY temrin_no, id');
        $st->execute([$k['ders_id']]);
        json_yanit(['durum' => 'tamam', 'temrinler' => array_map('temrin_ozeti_ogretmen', $st->fetchAll())]);
    }

    if ($yontem === 'GET' && $islem === 'temrin') {
        $t = ders_temrini($tamsayi('temrin_id'), $k['ders_id']);
        json_yanit(['durum' => 'tamam', 'temrin' => temrin_ozeti_ogretmen($t), 'tanim' => json_decode($t['tanim'], true)]);
    }

    if ($yontem === 'GET' && $islem === 'teslimler') {
        $t = ders_temrini($tamsayi('temrin_id'), $k['ders_id']);
        $deg = [$t['id'], $k['ders_id']];
        $st = db()->prepare('SELECT okul_no, ad, sinif, teslim_zamani, degerlendiren FROM calismalar
            WHERE temrin_id = ? AND ders_id = ? AND teslim_zamani IS NOT NULL AND ' . in_kosulu('sinif', ogretmen_siniflari($k, $metin('sinif')), $deg) . ' ORDER BY sinif, okul_no');
        $st->execute($deg);
        json_yanit(['durum' => 'tamam', 'kontroller' => tanim_kontroller(json_decode($t['tanim'], true)), 'teslimler' => $st->fetchAll()]);
    }

    if ($yontem === 'GET' && $islem === 'teslim') {
        $t = ders_temrini($tamsayi('temrin_id'), $k['ders_id']);
        $c = yetkili_teslim($k, (int)$t['id'], $metin('okul_no'));
        json_yanit(['durum' => 'tamam', 'okul_no' => $c['okul_no'], 'veri' => json_decode($c['veri'] ?? 'null', true)]);
    }

    if ($yontem === 'GET' && $islem === 'tablo') {
        $siniflar = ogretmen_siniflari($k, $metin('sinif'));
        json_yanit(['durum' => 'tamam', 'ders' => $k['ders'], 'siniflar' => $k['siniflar']] + puan_tablosu($k['ders_id'], $siniflar));
    }

    if ($yontem === 'GET' && $islem === 'sonuc') {
        $t = ders_temrini($tamsayi('temrin_id'), $k['ders_id']);
        $r = yetkili_sonuc($k, (int)$t['id'], $metin('okul_no'));
        $st = db()->prepare('SELECT degerlendiren, degerlendirme FROM calismalar WHERE temrin_id = ? AND okul_no = ?');
        $st->execute([$t['id'], $r['okul_no']]);
        $c = $st->fetch() ?: ['degerlendiren' => null, 'degerlendirme' => null];
        $d = json_decode($c['degerlendirme'] ?? 'null', true);
        json_yanit(['durum' => 'tamam', 'sonuc' => sonuc_ozeti($r, $t, true) + [
            'degerlendiren' => $c['degerlendiren'], 'derlendi' => $d['derlendi'] ?? null, 'derleme_hatalari' => $d['hatalar'] ?? []]]);
    }

    if ($yontem === 'GET' && $islem === 'erisim') {
        $sinif = $metin('sinif');
        if ($sinif === '') json_hata(400, 'PARAMETRE_HATALI', 'sinif gerekli.');
        ogretmen_siniflari($k, $sinif);
        $st = db()->prepare('SELECT t.id, t.temrin_no, t.baslik, e.erisim_acik, e.erisim_baslangic, e.erisim_bitis
            FROM temrinler t LEFT JOIN temrin_erisim e ON e.temrin_id = t.id AND e.sinif = ?
            WHERE t.ders_id = ? ORDER BY t.temrin_no, t.id');
        $st->execute([$sinif, $k['ders_id']]);
        $liste = [];
        foreach ($st as $t) {
            [$izin, $neden] = temrin_erisimi($t['erisim_acik'] === null ? null : $t);
            $liste[] = ['temrin_id' => (int)$t['id'], 'temrin_no' => (int)$t['temrin_no'], 'baslik' => $t['baslik'],
                        'erisim_acik' => (bool)$t['erisim_acik'], 'baslangic' => $t['erisim_baslangic'], 'bitis' => $t['erisim_bitis'],
                        'erisilebilir' => $izin, 'neden' => $neden];
        }
        json_yanit(['durum' => 'tamam', 'sinif' => $sinif, 'saat_dilimi' => saat_dilimi()->getName(), 'temrinler' => $liste]);
    }

    if ($yontem === 'POST') {
        csrf_kontrol();

        if ($islem === 'duzelt') {
            $t = ders_temrini($tamsayi('temrin_id'), $k['ders_id']);
            $r = yetkili_sonuc($k, (int)$t['id'], $metin('okul_no'));
            if (!is_array($g['olcutler'] ?? null)) json_hata(400, 'PARAMETRE_HATALI', 'olcutler gerekli.');
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
            sonuc_kaydet((int)$t['id'], $k['ders_id'], ['okul_no' => $r['okul_no'], 'ad' => $r['ad'], 'sinif' => $r['sinif']], $olcutler);
            json_yanit(['durum' => 'tamam', 'sonuc' => sonuc_ozeti(sonuc_getir((int)$t['id'], $r['okul_no']), $t, true)]);
        }

        if ($islem === 'temrin_yukle') {
            $csv = $g['csv'] ?? null;
            if (!is_string($csv) || $csv === '') json_hata(400, 'PARAMETRE_HATALI', 'csv gerekli.');
            if (strlen($csv) > 500_000) json_hata(413, 'COK_BUYUK', 'CSV dosyası çok büyük.');
            [$tanim, $hatalar] = tanim_csv_oku($csv);
            if ($hatalar) json_yanit(['durum' => 'hata', 'kod' => 'CSV_HATALI', 'mesaj' => 'CSV dosyasında hatalar var.', 'hatalar' => $hatalar], 400);
            $pdo = db();
            $st = $pdo->prepare('SELECT * FROM temrinler WHERE ders_id = ? AND temrin_no = ?');
            $st->execute([$k['ders_id'], $tanim['bilgi']['temrin_no']]);
            $var = $st->fetch();
            $json = json_encode($tanim, JSON_UNESCAPED_UNICODE);
            if ($var) {
                if (($g['uzerine_yaz'] ?? false) !== true) {
                    json_hata(409, 'TEMRIN_VAR', "Bu derste Temrin {$tanim['bilgi']['temrin_no']} zaten var. Üzerine yazmak için onaylayın.");
                }
                if (teslim_sayisi((int)$var['id']) > 0) {
                    json_hata(409, 'TESLIM_VAR', "Temrin {$tanim['bilgi']['temrin_no']} teslim almış; değiştirilemez. Yeni bir temrin numarası kullanın.");
                }
                $pdo->prepare('UPDATE temrinler SET baslik = ?, tanim = ? WHERE id = ?')->execute([$tanim['bilgi']['baslik'], $json, $var['id']]);
                $id = (int)$var['id'];
            } else {
                $pdo->prepare('INSERT INTO temrinler (ders_id, temrin_no, baslik, tanim, olusturma) VALUES (?, ?, ?, ?, ?)')
                    ->execute([$k['ders_id'], $tanim['bilgi']['temrin_no'], $tanim['bilgi']['baslik'], $json, utc_simdi()]);
                $id = (int)$pdo->lastInsertId();
            }
            json_yanit(['durum' => 'tamam', 'temrin' => temrin_ozeti_ogretmen(ders_temrini($id, $k['ders_id']))]);
        }

        if ($islem === 'temrin_sil') {
            $t = ders_temrini($tamsayi('temrin_id'), $k['ders_id']);
            if (teslim_sayisi((int)$t['id']) > 0) json_hata(409, 'TESLIM_VAR', 'Teslim almış temrin silinemez.');
            $pdo = db();
            foreach (['DELETE FROM calismalar WHERE temrin_id = ?', 'DELETE FROM temrin_erisim WHERE temrin_id = ?', 'DELETE FROM temrinler WHERE id = ?'] as $sql) {
                $pdo->prepare($sql)->execute([$t['id']]);
            }
            json_yanit(['durum' => 'tamam']);
        }

        if ($islem === 'cikti_kaydet') {
            $t = ders_temrini($tamsayi('temrin_id'), $k['ders_id']);
            if (!is_array($g['ciktilar'] ?? null)) json_hata(400, 'PARAMETRE_HATALI', 'ciktilar gerekli.');
            $tanim = json_decode($t['tanim'], true);
            foreach ($tanim['olcutler'] as &$o) {
                foreach ($o['kalemler'] as &$kl) {
                    $v = $g['ciktilar'][$kl['no']] ?? null;
                    if ($v === null || $kl['tur'] !== 'soru' || $kl['tip'] !== 'cikti' || $kl['beklenen'] !== '') continue;
                    if (!is_string($v) || cikti_normal($v) === '') json_hata(400, 'PARAMETRE_HATALI', "{$kl['no']} için çıktı boş olamaz.");
                    $kl['beklenen'] = cikti_normal($v);
                }
                unset($kl);
            }
            unset($o);
            db()->prepare('UPDATE temrinler SET tanim = ? WHERE id = ?')->execute([json_encode($tanim, JSON_UNESCAPED_UNICODE), $t['id']]);
            json_yanit(['durum' => 'tamam', 'temrin' => temrin_ozeti_ogretmen(ders_temrini((int)$t['id'], $k['ders_id']))]);
        }

        if ($islem === 'degerlendirme') {
            // Öğretmen tarayıcısında çalışan motorun sonucu: öğrencinin kendi değerlendirmesinin üzerine yazar.
            $t = ders_temrini($tamsayi('temrin_id'), $k['ders_id']);
            $c = yetkili_teslim($k, (int)$t['id'], $metin('okul_no'));
            $sonuc = $g['sonuc'] ?? null;
            if (!is_array($sonuc) || !is_array($sonuc['sonuclar'] ?? null)) json_hata(400, 'PARAMETRE_HATALI', 'sonuc gerekli.');
            $tanim = json_decode($t['tanim'], true);
            db()->prepare('UPDATE calismalar SET degerlendirme = ?, degerlendiren = ? WHERE id = ?')
                ->execute([degerlendirme_temizle($sonuc, $tanim), 'ogretmen', $c['id']]);
            $c['degerlendirme'] = degerlendirme_temizle($sonuc, $tanim);
            $kontrol = [];
            foreach (json_decode($c['degerlendirme'], true)['sonuclar'] as $s) $kontrol[$s['no']] = $s;
            $onceki = sonuc_getir((int)$t['id'], $c['okul_no']);
            $olcutler = temrin_puanla($tanim, $kontrol, json_decode($c['cevaplar'] ?? '{}', true) ?: [], $c['baslama'], $c['teslim_zamani'],
                $onceki ? (json_decode($onceki['detay'], true)['olcutler'] ?? []) : []);
            sonuc_kaydet((int)$t['id'], $k['ders_id'], ['okul_no' => $c['okul_no'], 'ad' => $c['ad'], 'sinif' => $c['sinif']], $olcutler, $c['teslim_zamani']);
            json_yanit(['durum' => 'tamam', 'sonuc' => sonuc_ozeti(sonuc_getir((int)$t['id'], $c['okul_no']), $t, false)]);
        }

        if ($islem === 'erisim') {
            $t = ders_temrini($tamsayi('temrin_id'), $k['ders_id']);
            $sinif = $metin('sinif');
            if ($sinif === '') json_hata(400, 'PARAMETRE_HATALI', 'sinif gerekli.');
            ogretmen_siniflari($k, $sinif);
            if (!is_bool($g['erisim_acik'] ?? null)) json_hata(400, 'PARAMETRE_HATALI', 'erisim_acik true/false olmalı.');
            try {
                $bas = utc_zamana_cevir(is_string($g['baslangic'] ?? null) ? $g['baslangic'] : null);
                $bit = utc_zamana_cevir(is_string($g['bitis'] ?? null) ? $g['bitis'] : null);
            } catch (RuntimeException $e) {
                json_hata(400, 'PARAMETRE_HATALI', $e->getMessage());
            }
            if ($bas !== null && $bit !== null && $bit <= $bas) json_hata(400, 'PARAMETRE_HATALI', 'Bitiş zamanı başlangıçtan sonra olmalı.');
            $pdo = db();
            $u = $pdo->prepare('UPDATE temrin_erisim SET erisim_acik = ?, erisim_baslangic = ?, erisim_bitis = ? WHERE temrin_id = ? AND sinif = ?');
            $u->execute([$g['erisim_acik'] ? 1 : 0, $bas, $bit, $t['id'], $sinif]);
            if ($u->rowCount() === 0) {
                $pdo->prepare('INSERT INTO temrin_erisim (temrin_id, sinif, erisim_acik, erisim_baslangic, erisim_bitis) VALUES (?, ?, ?, ?, ?)')
                    ->execute([$t['id'], $sinif, $g['erisim_acik'] ? 1 : 0, $bas, $bit]);
            }
            $e = ['erisim_acik' => $g['erisim_acik'] ? 1 : 0, 'erisim_baslangic' => $bas, 'erisim_bitis' => $bit];
            [$izin, $neden] = temrin_erisimi($e);
            json_yanit(['durum' => 'tamam', 'temrin_id' => (int)$t['id'], 'sinif' => $sinif, 'erisim_acik' => $g['erisim_acik'],
                        'baslangic' => $bas, 'bitis' => $bit, 'erisilebilir' => $izin, 'neden' => $neden]);
        }
    }

    json_hata(400, 'PARAMETRE_HATALI', 'Bilinmeyen işlem.');
} catch (Throwable $e) {
    error_log('ogretmen.php: ' . get_class($e) . ' ' . $e->getMessage());
    json_hata(500, 'SUNUCU_HATASI', 'Sunucuda bir hata oluştu.');
}
