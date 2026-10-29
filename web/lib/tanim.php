<?php
// Temrin tanımı: öğretmenin yüklediği CSV'yi okur, doğrular ve JSON'a çevirir. Biçim: sablon/README.md
declare(strict_types=1);

const TANIM_SUTUNLAR = ['tur', 'no', 'olcut', 'puan', 'tip', 'hedef', 'girdi', 'beklenen', 'metin', 'tespit'];
const TANIM_BILGI = ['ders', 'temrin_no', 'baslik', 'sinif', 'islem_konusu', 'proje_adi', 'sure_dk', 'ogretmen'];
const KONTROL_TIPLERI = ['derleme', 'kontrol_var', 'kod_yapisi', 'kod_icerir', 'calistir'];
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
    if (!$t['olcutler']) $hatalar[] = 'En az bir ölçüt satırı olmalı.';
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
            foreach (array_map('trim', explode(';', $k['beklenen'])) as $y) {
                if ($y !== '' && !in_array(strtolower($y), KOD_YAPILARI, true)) return "bilinmeyen kod yapısı '$y'. Geçerli: " . implode(', ', KOD_YAPILARI);
            }
            return null;
        case 'kod_icerir':
            return $k['beklenen'] === '' ? 'kod_icerir için beklenen (aranacak kod) gerekli' : null;
        case 'calistir':
            if ($k['hedef'] === '') return 'calistir için hedef (tıklanacak düğme) gerekli';
            if ($k['beklenen'] === '') return 'calistir için beklenen gerekli (ör. lstSonuc=1|2|3 ya da hatasiz)';
            foreach (array_filter(array_map('trim', explode(';', $k['beklenen']))) as $p) {
                if (strtolower($p) !== 'hatasiz' && !str_contains($p, '=')) return "beklenen biçimi hatalı: '$p' (ad=değer olmalı)";
            }
            foreach (array_filter(array_map('trim', explode(';', $k['girdi']))) as $p) {
                if (!str_contains($p, '=')) return "girdi biçimi hatalı: '$p' (ad=değer olmalı)";
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
    return ['bilgi' => $t['bilgi'], 'araclar' => $t['araclar'], 'islemler' => $t['islemler'], 'olcutler' => $olcutler, 'sorular' => $sorular];
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
