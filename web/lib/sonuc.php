<?php
// Temrin sonucu: ölçüt bazında puanlar (detay JSON) ve toplam.
//
// detay = {"olcutler": [{"no": "O1", "baslik": "...", "puan": 5, "tip": "ogretmen|sure|otomatik",
//                        "alinan": 5 | null, "tespit": "...", "duzenleyen": "sistem|ogretmen"}, ...]}
// alinan = null → henüz puanlanmadı (öğretmen ölçütü, açık uçlu soru içeren ölçüt).
declare(strict_types=1);

require_once __DIR__ . '/db.php';

/** [toplam puan, kesin mi]. Puanlanmamış ölçüt varsa toplam yalnızca puanlananları içerir ve kesin=false. */
function sonuc_toplami(array $olcutler): array
{
    $toplam = 0;
    $kesin = true;
    foreach ($olcutler as $o) {
        if ($o['alinan'] === null) { $kesin = false; continue; }
        $toplam += (int)$o['alinan'];
    }
    return [$toplam, $kesin];
}

/** Öğrencinin sonucunu yazar (yoksa ekler). Her yazışta guncellenme_zamani yenilenir; portal bu alanla değişenleri çeker. */
function sonuc_kaydet(int $temrinId, string $dersId, array $ogrenci, array $olcutler, ?string $teslimZamani = null): void
{
    [$puan, $kesin] = sonuc_toplami($olcutler);
    $simdi = utc_simdi();
    $detay = json_encode(['olcutler' => array_values($olcutler)], JSON_UNESCAPED_UNICODE);
    $pdo = db();
    $u = $pdo->prepare('UPDATE sonuclar SET puan = ?, kesin = ?, detay = ?, guncellenme_zamani = ? WHERE temrin_id = ? AND okul_no = ?');
    $u->execute([$puan, $kesin ? 1 : 0, $detay, $simdi, $temrinId, $ogrenci['okul_no']]);
    if ($u->rowCount() === 0) {
        $pdo->prepare('INSERT INTO sonuclar (temrin_id, ders_id, okul_no, ad, sinif, puan, kesin, teslim_zamani, guncellenme_zamani, detay)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
            ->execute([$temrinId, $dersId, $ogrenci['okul_no'], $ogrenci['ad'], $ogrenci['sinif'], $puan, $kesin ? 1 : 0,
                       $teslimZamani ?? $simdi, $simdi, $detay]);
    }
}

function sonuc_getir(int $temrinId, string $okulNo): ?array
{
    $st = db()->prepare('SELECT * FROM sonuclar WHERE temrin_id = ? AND okul_no = ?');
    $st->execute([$temrinId, $okulNo]);
    return $st->fetch() ?: null;
}

/** API yanıtı için sonuç satırını biçimler. */
function sonuc_ozeti(array $r, array $t, bool $detay): array
{
    $o = [
        'temrin_id' => (int)$t['id'],
        'temrin_no' => (int)$t['temrin_no'],
        'temrin_adi' => $t['baslik'],
        'okul_no' => $r['okul_no'],
        'ad_soyad' => $r['ad'],
        'sinif' => $r['sinif'],
        'puan' => $r['puan'] === null ? null : (int)$r['puan'],
        'kesin' => (bool)$r['kesin'],
        'teslim_zamani' => $r['teslim_zamani'],
        'guncellenme_zamani' => $r['guncellenme_zamani'],
    ];
    if ($detay) {
        $d = json_decode($r['detay'], true);
        $o['olcutler'] = is_array($d['olcutler'] ?? null) ? $d['olcutler'] : [];
    }
    return $o;
}
