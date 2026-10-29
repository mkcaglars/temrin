<?php
// Portalın ürettiği giriş anahtarını (JWT, HS256) doğrular.
declare(strict_types=1);

function b64url_decode(string $s): string|false
{
    if ($s === '' || preg_match('/[^A-Za-z0-9_-]/', $s)) return false;
    $s = strtr($s, '-_', '+/');
    $pad = strlen($s) % 4;
    if ($pad) $s .= str_repeat('=', 4 - $pad);
    return base64_decode($s, true);
}

function b64url_encode(string $s): string
{
    return rtrim(strtr(base64_encode($s), '+/', '-_'), '=');
}

/** Hata durumunda kullanıcıya gösterilecek Türkçe mesajla RuntimeException fırlatır. */
function jwt_dogrula(string $token, string $anahtar): array
{
    $parcalar = explode('.', $token);
    if (count($parcalar) !== 3) throw new RuntimeException('Giriş anahtarı biçimi hatalı.');
    [$h, $b, $s] = $parcalar;

    $baslik = json_decode((string)b64url_decode($h), true);
    if (!is_array($baslik) || !isset($baslik['alg']) || $baslik['alg'] !== 'HS256') {
        throw new RuntimeException('Desteklenmeyen imza türü.');
    }
    $beklenen = hash_hmac('sha256', "$h.$b", $anahtar, true);
    $imza = b64url_decode($s);
    if ($imza === false || !hash_equals($beklenen, $imza)) throw new RuntimeException('Giriş anahtarının imzası geçersiz.');

    $p = json_decode((string)b64url_decode($b), true);
    if (!is_array($p)) throw new RuntimeException('Giriş anahtarı okunamadı.');

    $simdi = time();
    if (!isset($p['exp']) || !is_int($p['exp'])) throw new RuntimeException('Giriş anahtarında geçerlilik süresi (exp) yok.');
    if ($p['exp'] < $simdi - 30) throw new RuntimeException('Giriş bağlantısının süresi dolmuş. Portaldan yeniden girin.');
    if (empty($p['jti']) || !is_string($p['jti']) || strlen($p['jti']) > 64) throw new RuntimeException('Giriş anahtarında tek kullanımlık kod (jti) yok.');

    foreach (['uid', 'name', 'ders_id'] as $alan) {
        if (!isset($p[$alan]) || !is_scalar($p[$alan]) || trim((string)$p[$alan]) === '') {
            throw new RuntimeException('Giriş anahtarında kullanıcı ya da ders bilgisi eksik.');
        }
    }
    $rol = $p['role'] ?? 'ogrenci';
    if ($rol !== 'ogrenci' && $rol !== 'ogretmen') throw new RuntimeException('Giriş anahtarındaki rol geçersiz.');
    if ($rol === 'ogrenci' && trim((string)($p['okul_no'] ?? '')) === '') throw new RuntimeException('Giriş anahtarında okul numarası yok.');

    return [
        'uid' => trim((string)$p['uid']),
        'okul_no' => trim((string)($p['okul_no'] ?? '')),
        'ad' => trim((string)$p['name']),
        'rol' => $rol,
        'sinif' => trim((string)($p['sinif'] ?? '')),
        'ders_id' => trim((string)$p['ders_id']),
        'ders' => trim((string)($p['ders'] ?? '')),
        'jti' => $p['jti'],
        'exp' => $p['exp'],
    ];
}
