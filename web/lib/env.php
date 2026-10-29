<?php
// .env dosyasını okur. Dosya web kök klasörünün (web/) DIŞINDA durmalıdır.
declare(strict_types=1);

function env(string $ad, ?string $varsayilan = null): ?string
{
    static $degerler = null;
    if ($degerler === null) {
        $degerler = [];
        $dosya = getenv('TEMRIN_ENV_DOSYASI') ?: dirname(__DIR__, 2) . '/.env';
        if (is_file($dosya) && is_readable($dosya)) {
            foreach (file($dosya, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $satir) {
                $satir = trim($satir);
                if ($satir === '' || $satir[0] === '#' || !str_contains($satir, '=')) continue;
                [$k, $v] = explode('=', $satir, 2);
                $v = trim($v);
                if (strlen($v) >= 2 && ($v[0] === '"' || $v[0] === "'") && $v[-1] === $v[0]) $v = substr($v, 1, -1);
                $degerler[trim($k)] = $v;
            }
        }
    }
    if (array_key_exists($ad, $degerler)) return $degerler[$ad];
    $g = getenv($ad);
    return $g === false ? $varsayilan : $g;
}

/** Portal ile paylaşılan anahtar. Yoksa ya da kısaysa null döner; değer hiçbir yerde yazdırılmaz. */
function portal_anahtari(): ?string
{
    $a = env('PORTAL_SSO_ANAHTAR');
    return ($a !== null && strlen($a) >= 32) ? $a : null;
}
