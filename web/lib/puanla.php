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

// ---------------------------------------------------------------- çıktı karşılaştırma (motor/Degerlendirici/Esneklik.cs ile aynı kurallar)

/** Türkçe küçük harf + sadeleştirme: "GEÇTİ", "Gecti", "GECTI" → "gecti". */
function cikti_sozcuk(string $s): string
{
    $s = mb_strtolower(strtr($s, ['I' => 'ı', 'İ' => 'i']), 'UTF-8');
    return strtr($s, ['ç' => 'c', 'ğ' => 'g', 'ı' => 'i', 'ö' => 'o', 'ş' => 's', 'ü' => 'u', 'â' => 'a', 'î' => 'i', 'û' => 'u']);
}

/** "72,5" → ["72.5"]; "1,2,3" ya da "1.000" → ayrı tam sayılar. Tek ayraç ondalıktır; virgül ve nokta eşdeğer. */
function cikti_sayilari(string $p): array
{
    $eksi = $p[0] === '-';
    if ($eksi) $p = substr($p, 1);
    $gruplar = preg_split('/[.,]/', $p);
    $kanonik = function (string $tam, string $kesir, bool $eksi): string {
        $tam = ltrim($tam, '0');
        if ($tam === '') $tam = '0';
        $kesir = rtrim($kesir, '0');
        $s = $tam . ($kesir !== '' ? '.' . $kesir : '');
        return ($eksi && $s !== '0') ? '-' . $s : $s;
    };
    if (count($gruplar) === 2) return [$kanonik($gruplar[0], $gruplar[1], $eksi)];
    $sonuc = [];
    foreach ($gruplar as $i => $g) $sonuc[] = $kanonik($g, '', $eksi && $i === 0);
    return $sonuc;
}

/** Metnin belirteçleri: sayılar kanonik ("72.5", "-3"), sözcükler sadeleşmiş küçük harf. Boşluk ve noktalama yok sayılır. */
function cikti_belirtecleri(string $metin): array
{
    preg_match_all('/(?<![\p{L}\p{N}])-?\d+(?:[.,]\d+)*|[\p{L}_][\p{L}\p{N}_]*/u', $metin, $m);
    $liste = [];
    foreach ($m[0] as $p) {
        if ($p[0] === '-' || ctype_digit($p[0])) array_push($liste, ...cikti_sayilari($p));
        else $liste[] = cikti_sozcuk($p);
    }
    return $liste;
}

function cikti_sayi_mi(string $b): bool
{
    return $b !== '' && (ctype_digit($b[0]) || ($b[0] === '-' && strlen($b) > 1));
}

/** $parca öğeleri $butun içinde aynı sırayla geçiyor mu (arada başka öğeler olabilir)? */
function cikti_alt_dizi(array $parca, array $butun, callable $uyar): bool
{
    $j = 0;
    $n = count($butun);
    foreach ($parca as $p) {
        while ($j < $n && !$uyar($p, $butun[$j])) $j++;
        if ($j === $n) return false;
        $j++;
    }
    return true;
}

function cikti_ek_metinle(array $b, array $a, bool $icerir): bool
{
    if (!$b) return false;
    $bSayi = array_values(array_filter($b, 'cikti_sayi_mi'));
    $aSayi = array_values(array_filter($a, 'cikti_sayi_mi'));
    $esit = fn($x, $y) => $x === $y;
    if (!($icerir ? cikti_alt_dizi($bSayi, $aSayi, $esit) : $bSayi === $aSayi)) return false;
    $bSoz = array_values(array_filter($b, fn($x) => !cikti_sayi_mi($x)));
    $aSoz = array_values(array_filter($a, fn($x) => !cikti_sayi_mi($x)));
    if (in_array('degil', $aSoz, true) && !in_array('degil', $bSoz, true)) return false;
    return cikti_alt_dizi($bSoz, $aSoz, fn($x, $y) => $x === $y || (mb_strlen($x) >= 3 && str_starts_with($y, $x)));
}

/**
 * Tek değeri karşılaştırır. $mod: 'esnek' (=), 'kati' (==), 'icerir' (~=). Sonuç: 'tam', 'bicim', 'kaldi'.
 * Sayılar birebir karşılaştırılır; boşluk, büyük-küçük harf, noktalama ve ondalık ayırıcı farkı "biçim" sayılır.
 */
function cikti_uyumu(string $beklenen, string $alinan, string $mod = 'esnek'): string
{
    $beklenen = trim($beklenen);
    $alinan = trim($alinan);
    if ($beklenen === $alinan) return 'tam';
    if ($mod === 'kati') return 'kaldi';
    $b = cikti_belirtecleri($beklenen);
    $a = cikti_belirtecleri($alinan);
    if ($b === $a || cikti_ek_metinle($b, $a, $mod === 'icerir')) return $mod === 'icerir' ? 'tam' : 'bicim';
    return 'kaldi';
}

/** Temrinin kesinti ayarları (bilgi satırları); yoksa 0 = biçim ve ad farkı puan kırmaz, yalnızca not düşülür. */
function temrin_kesintileri(array $tanim): array
{
    $b = $tanim['bilgi'] ?? [];
    return ['bicim' => max(0, (int)($b['bicim_kesintisi'] ?? 0)), 'ad' => max(0, (int)($b['ad_kesintisi'] ?? 0))];
}

/** Bir kalemin kesinti açıklaması: "…; mantık doğru, 1 puan kesildi" ya da "…; mantık doğru, puan kesilmedi". */
function kesinti_notu(array $notlar, int $kesinti): string
{
    if (!$notlar) return '';
    return implode('; ', array_map(fn($n) => rtrim($n, '. '), array_unique($notlar)))
        . ($kesinti > 0 ? "; mantık doğru, $kesinti puan kesildi" : '; mantık doğru, puan kesilmedi');
}

/**
 * $kontrolSonuclari: motorun ['K1' => ['gecti' => bool, 'mesaj' => '...']] çıktısı; henüz değerlendirilmediyse null.
 * $cevaplar: ['S1' => 'öğrencinin cevabı']. $onceki: önceki ölçütler (öğretmenin girdiği puanlar korunur).
 */
function temrin_puanla(array $tanim, ?array $kontrolSonuclari, array $cevaplar, ?string $baslama, string $teslim, array $onceki = []): array
{
    $oncekiler = [];
    foreach ($onceki as $o) $oncekiler[$o['no']] = $o;
    $kesintiler = temrin_kesintileri($tanim);
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
                        [$kalem['alinan'], $kalem['mesaj']] = kontrol_puani($k, is_array($r) ? $r : null, $kesintiler);
                    } else {
                        $kalem['mesaj'] = 'Otomatik değerlendirme bekleniyor.';
                    }
                } else {
                    $cevap = (string)($cevaplar[$k['no']] ?? '');
                    $kalem['metin'] = $k['metin'];
                    $kalem['cevap'] = $cevap;
                    if ($k['tip'] === 'cikti' && $k['beklenen'] !== '') {
                        $uyum = cikti_normal($cevap) === cikti_normal($k['beklenen']) ? 'tam' : cikti_uyumu($k['beklenen'], $cevap);
                        if ($uyum === 'kaldi') {
                            $kalem['alinan'] = 0;
                            $kalem['mesaj'] = $k['tespit'] !== '' ? $k['tespit'] : "{$k['no']} çıktı tahmini yanlış.";
                        } else {
                            $kesinti = $uyum === 'bicim' ? min($k['puan'], $kesintiler['bicim']) : 0;
                            $kalem['alinan'] = $k['puan'] - $kesinti;
                            if ($uyum === 'bicim') {
                                $kalem['mesaj'] = kesinti_notu(["{$k['no']} çıktı tahmini biçimi farklı: beklenen \"" . str_replace("\n", ' / ', cikti_normal($k['beklenen']))
                                    . "\", yazılan \"" . str_replace("\n", ' / ', cikti_normal($cevap)) . "\""], $kesinti);
                            }
                        }
                    } elseif ($k['tip'] === 'coktan') {
                        // "B", "b", "B)", "b) seçenek metni" kabul edilir.
                        $dogru = preg_match('/^\s*([A-Za-z])(?:\W|$)/', $cevap, $sm) === 1 && strcasecmp($sm[1], $k['beklenen']) === 0;
                        $kalem['alinan'] = $dogru ? $k['puan'] : 0;
                        if (!$dogru) $kalem['mesaj'] = $k['tespit'] !== '' ? $k['tespit'] : "{$k['no']} cevabı yanlış.";
                    } else {
                        $kalem['mesaj'] = 'Öğretmen puanlaması bekleniyor.';
                        if ($k['tip'] === 'acik' && $k['beklenen'] !== '') $kalem['ipucu'] = $k['beklenen'];
                    }
                }
                if ($kalem['alinan'] === null) $tamam = false;
                else $toplam += $kalem['alinan'];
                if ($kalem['alinan'] !== null && $kalem['mesaj'] !== '') $tespitler[] = $kalem['mesaj'];
                $olcut['kalemler'][] = $kalem;
            }
            $olcut['alinan'] = $tamam ? $toplam : null;
            $olcut['tespit'] = $tespitler ? implode('; ', array_map(fn($m) => rtrim($m, '. '), array_unique($tespitler))) . '.' : '';
        }
        // Sistemin önerdiği puan (öğretmen değiştirse de saklanır; değişen puan için gerekçe istenir).
        $olcut['oneri'] = $olcut['alinan'];
        // Öğretmen bu ölçütü elle puanladıysa onun puanı, tespiti ve gerekçesi korunur; kalem ayrıntısı güncellenir.
        $p = $oncekiler[$o['no']] ?? null;
        if ($p !== null && ($p['duzenleyen'] ?? '') === 'ogretmen') {
            $olcut['alinan'] = $p['alinan'];
            $olcut['tespit'] = $p['tespit'];
            $olcut['duzenleyen'] = 'ogretmen';
            if (isset($p['gerekce'])) $olcut['gerekce'] = $p['gerekce'];
        }
        $sonuc[] = $olcut;
    }
    return $sonuc;
}

/**
 * Bir kontrolün puanı ve Tespit metni. Oran (kısmi puan) motordan gelir; eski kayıtlarda yalnızca "gecti" vardır.
 * Puan = round(puan × oran) − (biçim/ad farkı kesintisi); kesinti nedeni ve kabul edilen farklar metne yazılır.
 */
function kontrol_puani(array $k, ?array $r, array $kesintiler): array
{
    if ($r === null) return [0, $k['tespit'] !== '' ? $k['tespit'] : 'Denetlenemedi.'];
    $oran = isset($r['oran']) && is_numeric($r['oran']) ? max(0.0, min(1.0, (float)$r['oran'])) : (($r['gecti'] ?? false) === true ? 1.0 : 0.0);
    $taban = (int)round($k['puan'] * $oran);
    $kesinti = 0;
    if ($taban > 0) {
        if (!empty($r['bicim'])) $kesinti += $kesintiler['bicim'];
        if (!empty($r['ad'])) $kesinti += $kesintiler['ad'];
        $kesinti = min($taban, $kesinti);
    }
    $alinan = $taban - $kesinti;
    $parcalar = [];
    if ($oran < 1) {
        $neden = $k['tespit'] !== '' ? $k['tespit'] : (string)($r['mesaj'] ?? 'Denetlenemedi.');
        $durum = (int)($r['durum'] ?? 1);
        if ($durum > 1) $neden = rtrim($neden, '. ') . " ($durum durumdan " . (int)($r['gecen'] ?? 0) . "'i geçti)";
        if ($taban > 0) $neden = rtrim($neden, '. ') . '; ' . ($k['puan'] - $taban) . ' puan kesildi';
        $parcalar[] = $neden;
    }
    $notlar = array_values(array_filter(is_array($r['notlar'] ?? null) ? $r['notlar'] : [], 'is_string'));
    if ($notlar) $parcalar[] = kesinti_notu($notlar, $kesinti);
    return [$alinan, implode('. ', array_map(fn($s) => rtrim($s, '. '), $parcalar)) . ($parcalar ? '.' : '')];
}

/** Motor sonucunu yalnızca temrindeki kontroller için, beklenen biçimde saklanacak JSON'a çevirir. */
function degerlendirme_temizle(array $sonuc, array $tanim): string
{
    $gecerli = array_column(tanim_kontroller($tanim), 'no');
    $liste = [];
    foreach ($sonuc['sonuclar'] as $s) {
        if (!is_array($s) || !in_array((string)($s['no'] ?? ''), $gecerli, true)) continue;
        $notlar = array_slice(array_values(array_filter(is_array($s['notlar'] ?? null) ? $s['notlar'] : [], 'is_string')), 0, 10);
        $liste[] = ['no' => (string)$s['no'], 'gecti' => ($s['gecti'] ?? false) === true, 'mesaj' => mb_substr((string)($s['mesaj'] ?? ''), 0, 500),
                    'oran' => isset($s['oran']) && is_numeric($s['oran']) ? max(0.0, min(1.0, (float)$s['oran'])) : (($s['gecti'] ?? false) === true ? 1.0 : 0.0),
                    'bicim' => ($s['bicim'] ?? false) === true, 'ad' => ($s['ad'] ?? false) === true,
                    'notlar' => array_map(fn($n) => mb_substr($n, 0, 300), $notlar),
                    'durum' => max(1, (int)($s['durum'] ?? 1)), 'gecen' => max(0, (int)($s['gecen'] ?? 0))];
    }
    $hatalar = array_map(fn($h) => mb_substr((string)$h, 0, 300), array_slice(is_array($sonuc['hatalar'] ?? null) ? $sonuc['hatalar'] : [], 0, 10));
    return json_encode(['derlendi' => ($sonuc['derlendi'] ?? false) === true, 'hatalar' => $hatalar, 'sonuclar' => $liste, 'zaman' => utc_simdi()], JSON_UNESCAPED_UNICODE);
}
