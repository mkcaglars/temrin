<?php
// Yazdırılabilir temrin sayfası (belgeler/TEMRIN_SAYFASI_ORNEK.docx biçiminde, A4).
//   sayfa.php?temrin_id=1                    → öğrenci: kendi sayfası
//   sayfa.php?temrin_id=1&okul_no=3268       → öğretmen: kendi sınıfındaki bir öğrenci
//   sayfa.php?temrin_id=1&sinif=11 Donanım B → öğretmen: sınıftaki tüm teslimler (her biri ayrı sayfa); sinif boşsa tüm sınıfları
declare(strict_types=1);

require_once __DIR__ . '/lib/env.php';
require_once __DIR__ . '/lib/db.php';
require_once __DIR__ . '/lib/oturum.php';

$k = oturum_kullanici();
if ($k === null) html_sayfa('Oturum yok', '<p>Temrine okul portalındaki bağlantıdan girin.</p>', 401);

$temrinId = filter_var($_GET['temrin_id'] ?? null, FILTER_VALIDATE_INT);
if (!$temrinId) html_sayfa('Temrin seçilmedi', '<p><a href="./">Geri dön</a></p>', 400);
foreach (['ders_id', 'ders'] as $alan) {
    if (isset($_GET[$alan]) && (string)$_GET[$alan] !== (string)$k[$alan]) html_sayfa('Yetki yok', '<p>Bu ders için yetkiniz yok.</p>', 403);
}
$st = db()->prepare('SELECT * FROM temrinler WHERE id = ? AND ders_id = ?');
$st->execute([$temrinId, $k['ders_id']]);
$t = $st->fetch();
if (!$t) html_sayfa('Bulunamadı', '<p>Bu derste böyle bir temrin yok.</p>', 404);
$tanim = json_decode($t['tanim'], true) ?: [];

$okulNo = trim((string)($_GET['okul_no'] ?? ''));
if ($k['rol'] === 'ogrenci') {
    if (($okulNo !== '' && $okulNo !== $k['okul_no']) || isset($_GET['sinif'])) {
        html_sayfa('Yetki yok', '<p>Yalnızca kendi temrin sayfanızı görebilirsiniz.</p>', 403);
    }
    $st = db()->prepare('SELECT * FROM sonuclar WHERE temrin_id = ? AND okul_no = ? AND ders_id = ?');
    $st->execute([$temrinId, $k['okul_no'], $k['ders_id']]);
    $sonuclar = $st->fetchAll();
} elseif ($okulNo !== '') {
    $st = db()->prepare('SELECT * FROM sonuclar WHERE temrin_id = ? AND okul_no = ? AND ders_id = ?');
    $st->execute([$temrinId, $okulNo, $k['ders_id']]);
    $sonuclar = $st->fetchAll();
    if ($sonuclar && !in_array($sonuclar[0]['sinif'], $k['siniflar'], true)) html_sayfa('Yetki yok', '<p>Bu sınıf için yetkiniz yok.</p>', 403);
} else {
    $sinif = trim((string)($_GET['sinif'] ?? ''));
    if ($sinif !== '' && !in_array($sinif, $k['siniflar'], true)) html_sayfa('Yetki yok', '<p>Bu sınıf için yetkiniz yok.</p>', 403);
    $siniflar = $sinif !== '' ? [$sinif] : $k['siniflar'];
    if (!$siniflar) html_sayfa('Sınıf yok', '<p>Portal bu ders için size bağlı bir sınıf göndermedi.</p>', 403);
    $yer = implode(', ', array_fill(0, count($siniflar), '?'));
    $st = db()->prepare("SELECT * FROM sonuclar WHERE temrin_id = ? AND ders_id = ? AND sinif IN ($yer) ORDER BY sinif, okul_no");
    $st->execute(array_merge([$temrinId, $k['ders_id']], $siniflar));
    $sonuclar = $st->fetchAll();
}
if (!$sonuclar) html_sayfa('Teslim yok', '<p>Bu temrin için yazdırılacak teslim yok.</p><p><a href="./">Geri dön</a></p>', 404);

$e = fn($s) => htmlspecialchars((string)$s, ENT_QUOTES);
$b = $tanim['bilgi'] ?? [];
$ders = ($b['ders'] ?? '') !== '' ? $b['ders'] : $k['ders'];
$ogretmenAdi = $k['rol'] === 'ogretmen' ? $k['ad'] : ($b['ogretmen'] ?? '');

header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store');
header("Content-Security-Policy: default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'");  // frame-ancestors .htaccess'te: yalnızca portal çerçeveleyebilir
?>
<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Temrin <?= (int)$t['temrin_no'] ?> · <?= $e($t['baslik']) ?></title>
<link rel="icon" href="data:,">
<link rel="stylesheet" href="assets/sayfa.css?v=<?= $e((string)@filemtime(__DIR__ . '/assets/sayfa.css')) ?>">
</head>
<body>
<div class="arac yazdirma">
  <button id="yazdir">Yazdır / PDF</button>
  <span><?= count($sonuclar) ?> sayfa</span>
  <a href="./">Geri dön</a>
</div>
<?php foreach ($sonuclar as $r):
    $d = json_decode($r['detay'], true);
    $olcutler = $d['olcutler'] ?? [];
?>
<section class="sayfa">
  <h1>TEMRİN SAYFASI</h1>
  <p><b>Dersin Adı:</b> <?= $e($ders) ?></p>
  <p><b>Temrin No:</b> <?= (int)$t['temrin_no'] ?></p>
  <p><b>İşlem Konusu:</b> <?= $e($b['islem_konusu'] ?? $t['baslik']) ?></p>
  <?php if (!empty($tanim['araclar'])): ?>
  <p><b>Kullanılan Araç / Gereç / Donanım / Yazılım / Materyal:</b></p>
  <ul><?php foreach ($tanim['araclar'] as $a): ?><li><?= $e($a) ?></li><?php endforeach ?></ul>
  <?php endif ?>
  <?php if (!empty($tanim['islemler'])): ?>
  <p><b>Yapılacak İşlemler:</b></p>
  <ul><?php foreach ($tanim['islemler'] as $a): ?><li><?= $e($a) ?></li><?php endforeach ?></ul>
  <?php endif ?>
  <p class="altcizgi"><b>Temrin Değerlendirmesi:</b></p>
  <table>
    <thead><tr><th>DEĞERLENDİRME</th><th class="sayi">Kazanım Puanı</th><th class="sayi">Alınan Puan</th><th class="tespit">Tespitler</th></tr></thead>
    <tbody>
    <?php foreach ($olcutler as $o): ?>
      <tr><td><?= $e($o['baslik']) ?></td><td class="sayi"><?= (int)$o['puan'] ?></td>
          <td class="sayi"><?= $o['alinan'] === null ? '' : (int)$o['alinan'] ?></td><td class="tespit"><?= $e($o['tespit'] ?? '') ?></td></tr>
    <?php endforeach ?>
      <tr class="toplam"><td>TOPLAM PUAN</td><td class="sayi">100</td><td class="sayi"><?= $r['puan'] === null ? '' : (int)$r['puan'] ?></td>
          <td class="tespit"><?= $r['kesin'] ? '' : 'Puanlanmamış ölçüt var; toplam kesin değil.' ?></td></tr>
    </tbody>
  </table>
  <div class="imza">
    <div>
      <p><b>Öğrenci No:</b> <?= $e($r['okul_no']) ?></p>
      <p><b>Öğrenci Ad Soyad:</b> <?= $e($r['ad']) ?></p>
      <p><b>Öğrenci Sınıf-Şube:</b> <?= $e($r['sinif']) ?></p>
    </div>
    <div>
      <p><b>Öğretmenin İmzası:</b></p>
      <p><b>Öğretmenin Adı Soyadı:</b> <?= $e($ogretmenAdi) ?></p>
      <p><b>Tarih:</b> <?= $e((new DateTimeImmutable($r['teslim_zamani']))->setTimezone(saat_dilimi())->format('d.m.Y')) ?></p>
    </div>
  </div>
</section>
<?php endforeach ?>
<script src="assets/sayfa.js"></script>
</body>
</html>
