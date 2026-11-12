<?php
// Temrin tanımı: öğretmenin yüklediği CSV'yi okur, doğrular ve JSON'a çevirir. Biçim: sablon/README.md
declare(strict_types=1);

const TANIM_SUTUNLAR = ['tur', 'no', 'olcut', 'puan', 'tip', 'hedef', 'girdi', 'beklenen', 'metin', 'tespit'];
const TANIM_BILGI = ['ders', 'temrin_no', 'baslik', 'sinif', 'islem_konusu', 'proje_adi', 'sure_dk', 'ogretmen',
                     'bicim_kesintisi', 'ad_kesintisi', 'ogretmen_onayi', 'ortam', 'lab_kurulum', 'lab_sifre'];
// C# projesine uygulanan kontroller (motor, WebAssembly).
const PROJE_KONTROL_TIPLERI = ['derleme', 'kontrol_var', 'kod_yapisi', 'kod_icerir', 'calistir'];
// Laboratuvardaki (MySQL simülatörü) veritabanına uygulanan kontroller (studyo/lab-denetim.js).
const LAB_KONTROL_TIPLERI = ['mysql_kurulu', 'vt_var', 'tablo_var', 'sutun_var', 'kayit_sayisi', 'iliski_var', 'sql_dogru', 'sql_sonuc',
                             'yedek_alindi', 'kullanici_var'];
const KONTROL_TIPLERI = [...PROJE_KONTROL_TIPLERI, ...LAB_KONTROL_TIPLERI];
const ORTAMLAR = ['studyo', 'laboratuvar', 'ikisi'];
const SORU_TIPLERI = ['cikti', 'coktan', 'acik'];
const OLCUT_TIPLERI = ['ogretmen', 'sure', 'otomatik'];
// Motor/KodYapisi.cs ile aynı liste.
const KOD_YAPILARI = ['for', 'while', 'do', 'do-while', 'foreach', 'break', 'continue', 'if', 'else', 'else if', 'switch', 'try', 'return'];

/**
 * CSV metnini okur. [tanim, hatalar] döner; hata varsa tanim null.
 * Ayraç ; (Excel Türkçe) ya da , olabilir. UTF-8 (BOM'lu ya da BOM'suz) ya da Windows-1254 kabul edilir.
 */
function tanim_csv_oku(string $icerik): array
{
    if (str_starts_with($icerik, "\xEF\xBB\xBF")) $icerik = substr($icerik, 3);
    elseif (!mb_check_encoding($icerik, 'UTF-8')) $icerik = mb_convert_encoding($icerik, 'UTF-8', 'Windows-1254');
    $ilkSatir = strtok($icerik, "\n") ?: '';
    $ayrac = substr_count($ilkSatir, ';') >= substr_count($ilkSatir, ',') ? ';' : ',';

    $f = fopen('php://temp', 'r+');
    fwrite($f, $icerik);
    rewind($f);
    $baslik = fgetcsv($f, null, $ayrac, '"', '');
    if (!$baslik) return [null, ['Dosya boş.']];
    $baslik = array_map(fn($s) => strtolower(trim((string)$s)), $baslik);
    $eksik = array_diff(TANIM_SUTUNLAR, $baslik);
    if ($eksik) return [null, ['Başlık satırında eksik sütun: ' . implode(', ', $eksik) . '. Şablondaki başlık satırını kullanın.']];
    $sira = array_flip($baslik);

    $hatalar = [];
    $t = ['bilgi' => [], 'araclar' => [], 'islemler' => [], 'olcutler' => []];
    $olcutSira = [];
    $kalemNolari = [];
    $satirNo = 1;
    while (($s = fgetcsv($f, null, $ayrac, '"', '')) !== false) {
        $satirNo++;
        if ($s === [null] || implode('', $s) === '') continue;
        $h = [];
        foreach (TANIM_SUTUNLAR as $ad) $h[$ad] = trim((string)($s[$sira[$ad]] ?? ''));
        $hata = function (string $m) use (&$hatalar, $satirNo): void { $hatalar[] = "Satır $satirNo: $m"; };
        switch ($h['tur']) {
            case 'bilgi':
                if (!in_array($h['no'], TANIM_BILGI, true)) { $hata("bilinmeyen bilgi alanı '{$h['no']}'"); break; }
                $t['bilgi'][$h['no']] = $h['metin'];
                break;
            case 'arac':
                if ($h['metin'] !== '') $t['araclar'][] = $h['metin'];
                break;
            case 'islem':
                if ($h['metin'] !== '') $t['islemler'][] = $h['metin'];
                break;
            case 'olcut':
                if ($h['no'] === '' || isset($olcutSira[$h['no']])) { $hata("ölçüt kodu boş ya da tekrar ediyor ('{$h['no']}')"); break; }
                if (!in_array($h['tip'], OLCUT_TIPLERI, true)) { $hata("ölçüt tipi ogretmen, sure ya da otomatik olmalı ('{$h['tip']}')"); break; }
                if (!preg_match('/^\d+$/', $h['puan']) || (int)$h['puan'] <= 0) { $hata('ölçüt puanı pozitif tam sayı olmalı'); break; }
                if ($h['metin'] === '') { $hata('ölçüt başlığı (metin) boş'); break; }
                $olcutSira[$h['no']] = count($t['olcutler']);
                $t['olcutler'][] = ['no' => $h['no'], 'baslik' => $h['metin'], 'puan' => (int)$h['puan'], 'tip' => $h['tip'], 'kalemler' => []];
                break;
            case 'kontrol':
            case 'soru':
                $tur = $h['tur'];
                if ($h['no'] === '' || isset($kalemNolari[$h['no']])) { $hata("kod boş ya da tekrar ediyor ('{$h['no']}')"); break; }
                if (!isset($olcutSira[$h['olcut']])) { $hata("'{$h['olcut']}' ölçütü bulunamadı (ölçüt satırı kontrol ve sorulardan önce gelmeli)"); break; }
                $o = &$t['olcutler'][$olcutSira[$h['olcut']]];
                if ($o['tip'] !== 'otomatik') { $hata("kontrol ve sorular yalnızca 'otomatik' ölçütlere bağlanabilir ({$h['olcut']})"); unset($o); break; }
                if (!preg_match('/^\d+$/', $h['puan']) || (int)$h['puan'] <= 0) { $hata('puan pozitif tam sayı olmalı'); unset($o); break; }
                $kalem = ['no' => $h['no'], 'tur' => $tur, 'tip' => $h['tip'], 'puan' => (int)$h['puan'], 'hedef' => $h['hedef'],
                          'girdi' => str_replace("\r\n", "\n", $h['girdi']), 'beklenen' => str_replace("\r\n", "\n", $h['beklenen']),
                          'metin' => $h['metin'], 'tespit' => $h['tespit']];
                $e = $tur === 'kontrol' ? tanim_kontrol_hatasi($kalem) : tanim_soru_hatasi($kalem);
                if ($e !== null) { $hata($e); unset($o); break; }
                $kalemNolari[$h['no']] = true;
                $o['kalemler'][] = $kalem;
                unset($o);
                break;
            case 'hazirlik':
                // Öğrencinin laboratuvarı ilk açıldığında çalışacak SQL (başlangıç veritabanı ve kayıtlar).
                if ($h['metin'] !== '') $t['hazirlik'][] = str_replace("\r\n", "\n", $h['metin']);
                break;
            case 'not':
            case '':
                break;
            default:
                $hata("bilinmeyen satır türü '{$h['tur']}'");
        }
    }
    fclose($f);

    $b = $t['bilgi'];
    if (!isset($b['temrin_no']) || !preg_match('/^\d{1,4}$/', $b['temrin_no']) || (int)$b['temrin_no'] < 1) $hatalar[] = 'bilgi;temrin_no pozitif bir sayı olmalı.';
    if (trim($b['baslik'] ?? '') === '' && trim($b['islem_konusu'] ?? '') === '') $hatalar[] = 'bilgi;baslik (ya da islem_konusu) gerekli.';
    if (isset($b['sure_dk']) && $b['sure_dk'] !== '' && (!preg_match('/^\d+$/', $b['sure_dk']) || (int)$b['sure_dk'] < 1)) $hatalar[] = 'bilgi;sure_dk pozitif bir sayı olmalı.';
    foreach (['bicim_kesintisi', 'ad_kesintisi'] as $alan) {
        if (isset($b[$alan]) && $b[$alan] !== '' && !preg_match('/^\d{1,3}$/', $b[$alan])) $hatalar[] = "bilgi;$alan 0 ya da pozitif bir tam sayı (puan) olmalı.";
    }
    $onay = cikti_sozcuk_basit($b['ogretmen_onayi'] ?? '');
    if (!in_array($onay, ['', 'evet', 'hayir', 'acik', 'kapali', '1', '0'], true)) $hatalar[] = 'bilgi;ogretmen_onayi "evet" ya da "hayır" olmalı.';
    $ortam = cikti_sozcuk_basit($b['ortam'] ?? '');
    if ($ortam !== '' && !in_array($ortam, ORTAMLAR, true)) $hatalar[] = 'bilgi;ortam "studyo", "laboratuvar" ya da "ikisi" olmalı.';
    $kurulum = cikti_sozcuk_basit($b['lab_kurulum'] ?? '');
    if ($kurulum !== '' && !in_array($kurulum, ['hazir', 'kendisi'], true)) $hatalar[] = 'bilgi;lab_kurulum "hazır" ya da "kendisi" olmalı.';
    if (!$t['olcutler']) $hatalar[] = 'En az bir ölçüt satırı olmalı.';
    if (in_array($ortam, ['studyo', 'laboratuvar'], true)) {
        foreach ($t['olcutler'] as $o) {
            foreach ($o['kalemler'] as $k) {
                if ($k['tur'] !== 'kontrol') continue;
                $lab = in_array($k['tip'], LAB_KONTROL_TIPLERI, true);
                if ($ortam === 'studyo' && $lab) { $hatalar[] = "{$k['no']}: {$k['tip']} laboratuvar kontrolüdür; bilgi;ortam \"laboratuvar\" ya da \"ikisi\" olmalı."; break 2; }
                if ($ortam === 'laboratuvar' && !$lab) { $hatalar[] = "{$k['no']}: {$k['tip']} C# projesi kontrolüdür; bilgi;ortam \"studyo\" ya da \"ikisi\" olmalı."; break 2; }
            }
        }
    }
    $toplam = array_sum(array_column($t['olcutler'], 'puan'));
    if ($t['olcutler'] && $toplam !== 100) $hatalar[] = "Ölçüt puanlarının toplamı 100 olmalı (şu an $toplam).";
    foreach ($t['olcutler'] as $o) {
        if ($o['tip'] !== 'otomatik') continue;
        $alt = array_sum(array_column($o['kalemler'], 'puan'));
        if (!$o['kalemler']) $hatalar[] = "{$o['no']} otomatik ölçütünün altında kontrol ya da soru yok.";
        elseif ($alt !== $o['puan']) $hatalar[] = "{$o['no']} ölçütünün puanı {$o['puan']}, altındaki kontrol ve soruların toplamı $alt.";
    }
    if ($hatalar) return [null, $hatalar];

    $t['bilgi']['temrin_no'] = (int)$b['temrin_no'];
    $t['bilgi']['baslik'] = trim($b['baslik'] ?? '') !== '' ? trim($b['baslik']) : mb_substr(trim($b['islem_konusu']), 0, 80);
    $t['bilgi']['sure_dk'] = isset($b['sure_dk']) && $b['sure_dk'] !== '' ? (int)$b['sure_dk'] : null;
    $t['bilgi']['bicim_kesintisi'] = (int)($b['bicim_kesintisi'] ?? 0);
    $t['bilgi']['ad_kesintisi'] = (int)($b['ad_kesintisi'] ?? 0);
    $t['bilgi']['ogretmen_onayi'] = in_array($onay, ['evet', 'acik', '1'], true);
    if ($ortam !== '') $t['bilgi']['ortam'] = $ortam;
    else unset($t['bilgi']['ortam']);
    if (tanim_ortami($t) !== 'studyo') {
        $t['bilgi']['lab_kurulum'] = $kurulum === 'kendisi' ? 'kendisi' : 'hazir';
        $t['bilgi']['lab_sifre'] = trim($b['lab_sifre'] ?? '') !== '' ? trim($b['lab_sifre']) : '1234';
    } else {
        unset($t['bilgi']['lab_kurulum'], $t['bilgi']['lab_sifre']);
    }
    return [$t, []];
}

function tanim_kontrol_hatasi(array $k): ?string
{
    if (!in_array($k['tip'], KONTROL_TIPLERI, true)) return "kontrol tipi geçersiz ('{$k['tip']}'). Geçerli: " . implode(', ', KONTROL_TIPLERI);
    switch ($k['tip']) {
        case 'kontrol_var':
            return $k['hedef'] === '' ? 'kontrol_var için hedef (kontrol adı) gerekli' : null;
        case 'kod_yapisi':
            if ($k['beklenen'] === '') return 'kod_yapisi için beklenen (for, while, if...) gerekli';
            // ";" grupları ayırır (her biri gerekli), "|" ya da "veya" eşdeğer seçenekleri: "for|foreach; break"
            foreach (array_map('trim', explode(';', $k['beklenen'])) as $grup) {
                foreach (preg_split('/\s*\|\s*|\s+veya\s+/iu', $grup) as $y) {
                    $y = trim($y);
                    if ($y !== '' && !in_array(strtolower($y), KOD_YAPILARI, true)) return "bilinmeyen kod yapısı '$y'. Geçerli: " . implode(', ', KOD_YAPILARI);
                }
            }
            return null;
        case 'kod_icerir':
            return $k['beklenen'] === '' ? 'kod_icerir için beklenen (aranacak kod) gerekli' : null;
        case 'vt_var':
        case 'kullanici_var':
            return trim($k['hedef']) === '' ? "{$k['tip']} için hedef (" . ($k['tip'] === 'vt_var' ? 'veritabanı adı' : 'kullanıcı adı') . ') gerekli' : null;
        case 'tablo_var':
        case 'sutun_var':
        case 'kayit_sayisi':
        case 'iliski_var':
            $parca = $k['tip'] === 'sutun_var' ? 3 : 2;
            $ornek = $k['tip'] === 'sutun_var' ? 'okul.ogrenci.ad' : 'okul.ogrenci';
            $hedefler = array_filter(array_map('trim', explode(';', $k['hedef'])), 'strlen');
            if (!$hedefler) return "{$k['tip']} için hedef gerekli (ör. $ornek)";
            if ($k['tip'] !== 'tablo_var' && $k['tip'] !== 'sutun_var' && count($hedefler) > 1) return "{$k['tip']} için tek hedef yazılır";
            foreach ($hedefler as $h) {
                if (count(array_filter(explode('.', $h), fn($x) => trim($x) !== '')) !== $parca) return "hedef biçimi hatalı: '$h' (ör. $ornek)";
            }
            if ($k['tip'] === 'kayit_sayisi' && !preg_match('/^\s*(?:(>=|<=|>|<|=)?\s*\d+|\d+\s*-\s*\d+)\s*$/', $k['beklenen'])) {
                return "kayit_sayisi için beklenen bir sayı olmalı: 5, >=5, <=10 ya da 3-10";
            }
            return null;
        case 'sql_dogru':
        case 'sql_sonuc':
            if (trim($k['hedef']) === '') return "{$k['tip']} için hedef (veritabanı adı) gerekli";
            if (!preg_match('/^\s*(select|with|show)\b/i', $k['girdi'])) return "{$k['tip']} için girdi sütununa bir SELECT sorgusu yazılmalı";
            if ($k['tip'] === 'sql_sonuc' && trim($k['beklenen']) === '') return 'sql_sonuc için beklenen (sorgunun sonucu; satırlar | ile) gerekli';
            return null;
        case 'calistir':
            if ($k['hedef'] === '') return 'calistir için hedef (tıklanacak düğme) gerekli';
            if ($k['beklenen'] === '') return 'calistir için beklenen gerekli (ör. lstSonuc=1|2|3 ya da hatasiz)';
            // "||" birden çok durumu ayırır: girdi1 || girdi2 → beklenen1 || beklenen2 (her durum ayrı puanlanır)
            $bDurum = array_map('trim', explode('||', $k['beklenen']));
            $gDurum = trim($k['girdi']) === '' ? [''] : array_map('trim', explode('||', $k['girdi']));
            if (count($gDurum) > 1 && count($bDurum) > 1 && count($gDurum) !== count($bDurum)) {
                return 'girdi (' . count($gDurum) . ') ve beklenen (' . count($bDurum) . ') durum sayıları farklı; "||" ile aynı sayıda durum yazın';
            }
            foreach ($bDurum as $durum) {
                if ($durum === '') return 'boş beklenen durumu var ("||" arasında değer olmalı)';
                foreach (array_filter(array_map('trim', explode(';', $durum))) as $p) {
                    if (strtolower($p) !== 'hatasiz' && !preg_match('/^[^=~]+(==|~=|=)/u', $p)) {
                        return "beklenen biçimi hatalı: '$p' (ad=değer, ad==değer ya da ad~=değer olmalı)";
                    }
                }
            }
            foreach ($gDurum as $durum) {
                foreach (array_filter(array_map('trim', explode(';', $durum))) as $p) {
                    if (!str_contains($p, '=')) return "girdi biçimi hatalı: '$p' (ad=değer olmalı)";
                }
            }
            return null;
    }
    return null;
}

function tanim_soru_hatasi(array $s): ?string
{
    if (!in_array($s['tip'], SORU_TIPLERI, true)) return "soru tipi geçersiz ('{$s['tip']}'). Geçerli: " . implode(', ', SORU_TIPLERI);
    if ($s['metin'] === '' && $s['tip'] !== 'cikti') return 'soru metni boş';
    if ($s['tip'] === 'cikti' && $s['girdi'] === '') return 'cikti sorusu için girdi sütununa kod yazılmalı';
    if ($s['tip'] === 'coktan') {
        $secenekler = array_filter(array_map('trim', explode('|', $s['hedef'])));
        if (count($secenekler) < 2) return 'coktan sorusu için hedef sütununa en az iki seçenek yazılmalı (A) ...|B) ...)';
        if (!preg_match('/^[A-Za-z]$/', $s['beklenen'])) return 'coktan sorusu için beklenen tek bir seçenek harfi olmalı';
        if (ord(strtoupper($s['beklenen'])) - 65 >= count($secenekler)) return 'beklenen seçenek harfi seçenek sayısını aşıyor';
    }
    return null;
}

/** "Hayır", "HAYIR", "hayir" → "hayir". */
function cikti_sozcuk_basit(string $s): string
{
    $s = mb_strtolower(strtr(trim($s), ['I' => 'ı', 'İ' => 'i']), 'UTF-8');
    return strtr($s, ['ı' => 'i', 'ş' => 's', 'ğ' => 'g', 'ü' => 'u', 'ö' => 'o', 'ç' => 'c']);
}

/** Öğrenciye gösterilecek kısım: kontrollerin ayrıntısı ve soruların cevapları yoktur. */
function tanim_ogrenciye(array $t): array
{
    $sorular = [];
    $olcutler = [];
    foreach ($t['olcutler'] as $o) {
        $olcutler[] = ['no' => $o['no'], 'baslik' => $o['baslik'], 'puan' => $o['puan']];
        foreach ($o['kalemler'] as $k) {
            if ($k['tur'] !== 'soru') continue;
            $s = ['no' => $k['no'], 'tip' => $k['tip'], 'puan' => $k['puan'], 'metin' => $k['metin'] !== '' ? $k['metin'] : 'Aşağıdaki kod çalıştığında ekrana ne yazar?'];
            if ($k['tip'] === 'cikti') $s['kod'] = $k['girdi'];
            if ($k['tip'] === 'coktan') $s['secenekler'] = array_values(array_filter(array_map('trim', explode('|', $k['hedef']))));
            $sorular[] = $s;
        }
    }
    return ['bilgi' => $t['bilgi'] + ['ortam' => tanim_ortami($t)], 'araclar' => $t['araclar'], 'islemler' => $t['islemler'], 'olcutler' => $olcutler,
            'sorular' => $sorular, 'hazirlik' => implode("\n", $t['hazirlik'] ?? [])];
}

/**
 * Öğrencinin çalışacağı yer: "studyo" (C# Form Stüdyosu), "laboratuvar" (MySQL simülatörü) ya da "ikisi".
 * bilgi;ortam yazılmamışsa kontrollerden anlaşılır.
 */
function tanim_ortami(array $t): string
{
    $o = $t['bilgi']['ortam'] ?? '';
    if (in_array($o, ORTAMLAR, true)) return $o;
    $lab = $proje = false;
    foreach ($t['olcutler'] as $olcut) {
        foreach ($olcut['kalemler'] as $k) {
            if ($k['tur'] !== 'kontrol') continue;
            if (in_array($k['tip'], LAB_KONTROL_TIPLERI, true)) $lab = true;
            else $proje = true;
        }
    }
    return $lab ? ($proje ? 'ikisi' : 'laboratuvar') : 'studyo';
}

/** Motorun çalıştıracağı kontroller (teslimden sonra öğrenci tarayıcısına, doğrulamada öğretmen tarayıcısına gider). */
function tanim_kontroller(array $t): array
{
    $liste = [];
    foreach ($t['olcutler'] as $o) {
        foreach ($o['kalemler'] as $k) {
            if ($k['tur'] === 'kontrol') $liste[] = ['no' => $k['no'], 'tip' => $k['tip'], 'hedef' => $k['hedef'], 'girdi' => $k['girdi'], 'beklenen' => $k['beklenen']];
        }
    }
    return $liste;
}

/** Beklenen çıktısı boş bırakılmış çıktı tahmini soruları (öğretmen tarayıcısında hesaplanır). */
function tanim_hesaplanacak_ciktilar(array $t): array
{
    $liste = [];
    foreach ($t['olcutler'] as $o) {
        foreach ($o['kalemler'] as $k) {
            if ($k['tur'] === 'soru' && $k['tip'] === 'cikti' && $k['beklenen'] === '') $liste[] = ['no' => $k['no'], 'kod' => $k['girdi']];
        }
    }
    return $liste;
}
