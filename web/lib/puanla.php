<?php
// Teslim edilen temrini puanlar: ölçüt bazında alınan puan, tespitler ve kalem (kontrol/soru) ayrıntısı.
declare(strict_types=1);

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/tanim.php';

/** Çıktı karşılaştırması: satır sonu farkları, satır sonundaki boşluklar ve sondaki boş satırlar önemsenmez. */
function cikti_normal(string $s): string
{
    $satirlar = array_map('rtrim', explode("\n", str_replace(["\r\n", "\r"], "\n", $s)));
    while ($satirlar && end($satirlar) === '') array_pop($satirlar);
    while ($satirlar && $satirlar[0] === '') array_shift($satirlar);
    return implode("\n", $satirlar);
}

/**
 * $kontrolSonuclari: motorun ['K1' => ['gecti' => bool, 'mesaj' => '...']] çıktısı; henüz değerlendirilmediyse null.
 * $cevaplar: ['S1' => 'öğrencinin cevabı']. $onceki: önceki ölçütler (öğretmenin girdiği puanlar korunur).
 */
function temrin_puanla(array $tanim, ?array $kontrolSonuclari, array $cevaplar, ?string $baslama, string $teslim, array $onceki = []): array
{
    $oncekiler = [];
    foreach ($onceki as $o) $oncekiler[$o['no']] = $o;
    $sonuc = [];
    foreach ($tanim['olcutler'] as $o) {
        $olcut = ['no' => $o['no'], 'baslik' => $o['baslik'], 'puan' => $o['puan'], 'tip' => $o['tip'], 'alinan' => null, 'tespit' => '',
                  'duzenleyen' => 'sistem', 'kalemler' => []];
        if ($o['tip'] === 'sure') {
            $dk = $tanim['bilgi']['sure_dk'] ?? null;
            if ($dk !== null && $baslama !== null) {
                $gecen = (int)ceil((strtotime($teslim) - strtotime($baslama)) / 60);
                $olcut['alinan'] = $gecen <= $dk ? $o['puan'] : 0;
                $olcut['tespit'] = $gecen <= $dk ? '' : "Süre aşıldı: $gecen dakika (süre $dk dakika).";
            }
        } elseif ($o['tip'] === 'otomatik') {
            $toplam = 0;
            $tamam = true;
            $tespitler = [];
            foreach ($o['kalemler'] as $k) {
                $kalem = ['no' => $k['no'], 'tur' => $k['tur'], 'tip' => $k['tip'], 'puan' => $k['puan'], 'alinan' => null, 'mesaj' => ''];
                if ($k['tur'] === 'kontrol') {
                    $r = $kontrolSonuclari[$k['no']] ?? null;
                    if ($kontrolSonuclari !== null) {
                        $gecti = is_array($r) && ($r['gecti'] ?? false) === true;
                        $kalem['alinan'] = $gecti ? $k['puan'] : 0;
                        if (!$gecti) $kalem['mesaj'] = $k['tespit'] !== '' ? $k['tespit'] : (string)($r['mesaj'] ?? 'Denetlenemedi.');
                    } else {
                        $kalem['mesaj'] = 'Otomatik değerlendirme bekleniyor.';
                    }
                } else {
                    $cevap = (string)($cevaplar[$k['no']] ?? '');
                    $kalem['metin'] = $k['metin'];
                    $kalem['cevap'] = $cevap;
                    if ($k['tip'] === 'cikti' && $k['beklenen'] !== '') {
                        $dogru = cikti_normal($cevap) === cikti_normal($k['beklenen']);
                        $kalem['alinan'] = $dogru ? $k['puan'] : 0;
                        if (!$dogru) $kalem['mesaj'] = $k['tespit'] !== '' ? $k['tespit'] : "{$k['no']} çıktı tahmini yanlış.";
                    } elseif ($k['tip'] === 'coktan') {
                        $dogru = strcasecmp(trim($cevap), $k['beklenen']) === 0;
                        $kalem['alinan'] = $dogru ? $k['puan'] : 0;
                        if (!$dogru) $kalem['mesaj'] = $k['tespit'] !== '' ? $k['tespit'] : "{$k['no']} cevabı yanlış.";
                    } else {
                        $kalem['mesaj'] = 'Öğretmen puanlaması bekleniyor.';
                        if ($k['tip'] === 'acik' && $k['beklenen'] !== '') $kalem['ipucu'] = $k['beklenen'];
                    }
                }
                if ($kalem['alinan'] === null) $tamam = false;
                else $toplam += $kalem['alinan'];
                if ($kalem['alinan'] !== null && $kalem['alinan'] < $k['puan'] && $kalem['mesaj'] !== '') $tespitler[] = $kalem['mesaj'];
                $olcut['kalemler'][] = $kalem;
            }
            $olcut['alinan'] = $tamam ? $toplam : null;
            $olcut['tespit'] = $tespitler ? implode('; ', array_map(fn($m) => rtrim($m, '. '), array_unique($tespitler))) . '.' : '';
        }
        // Öğretmen bu ölçütü elle puanladıysa onun puanı ve tespiti korunur; kalem ayrıntısı güncellenir.
        $p = $oncekiler[$o['no']] ?? null;
        if ($p !== null && ($p['duzenleyen'] ?? '') === 'ogretmen') {
            $olcut['alinan'] = $p['alinan'];
            $olcut['tespit'] = $p['tespit'];
            $olcut['duzenleyen'] = 'ogretmen';
        }
        $sonuc[] = $olcut;
    }
    return $sonuc;
}

/** Motor sonucunu yalnızca temrindeki kontroller için, beklenen biçimde saklanacak JSON'a çevirir. */
function degerlendirme_temizle(array $sonuc, array $tanim): string
{
    $gecerli = array_column(tanim_kontroller($tanim), 'no');
    $liste = [];
    foreach ($sonuc['sonuclar'] as $s) {
        if (!is_array($s) || !in_array((string)($s['no'] ?? ''), $gecerli, true)) continue;
        $liste[] = ['no' => (string)$s['no'], 'gecti' => ($s['gecti'] ?? false) === true, 'mesaj' => mb_substr((string)($s['mesaj'] ?? ''), 0, 500)];
    }
    $hatalar = array_map(fn($h) => mb_substr((string)$h, 0, 300), array_slice(is_array($sonuc['hatalar'] ?? null) ? $sonuc['hatalar'] : [], 0, 10));
    return json_encode(['derlendi' => ($sonuc['derlendi'] ?? false) === true, 'hatalar' => $hatalar, 'sonuclar' => $liste, 'zaman' => utc_simdi()], JSON_UNESCAPED_UNICODE);
}
