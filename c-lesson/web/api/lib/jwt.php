<?php
// Okul portalının ürettiği giriş anahtarını (JWT, HS256) doğrular.
declare(strict_types=1);

function b64url_decode(string $s): string|false
{
    $s = strtr($s, '-_', '+/');
    $pad = strlen($s) % 4;
    if ($pad) $s .= str_repeat('=', 4 - $pad);
    return base64_decode($s, true);
}

function b64url_encode(string $s): string
{
    return rtrim(strtr(base64_encode($s), '+/', '-_'), '=');
}

function jwt_sign(array $payload, string $secret): string
{
    $header = b64url_encode(json_encode(['alg' => 'HS256', 'typ' => 'JWT']));
    $body = b64url_encode(json_encode($payload, JSON_UNESCAPED_UNICODE));
    $sig = b64url_encode(hash_hmac('sha256', "$header.$body", $secret, true));
    return "$header.$body.$sig";
}

/**
 * Anahtarı doğrular; geçerliyse içeriğini döndürür, değilse Türkçe hata mesajıyla istisna fırlatır.
 */
function jwt_verify(string $token, string $secret, int $maxAge): array
{
    $parts = explode('.', $token);
    if (count($parts) !== 3) throw new RuntimeException('Giriş anahtarı biçimi hatalı.');
    [$h, $b, $s] = $parts;
    $header = json_decode((string)b64url_decode($h), true);
    if (!is_array($header) || ($header['alg'] ?? '') !== 'HS256') throw new RuntimeException('Desteklenmeyen imza türü.');
    $expected = hash_hmac('sha256', "$h.$b", $secret, true);
    $sig = b64url_decode($s);
    if ($sig === false || !hash_equals($expected, $sig)) throw new RuntimeException('Giriş anahtarının imzası geçersiz.');
    $payload = json_decode((string)b64url_decode($b), true);
    if (!is_array($payload)) throw new RuntimeException('Giriş anahtarı okunamadı.');

    $now = time();
    $exp = (int)($payload['exp'] ?? 0);
    if ($exp <= 0) throw new RuntimeException('Giriş anahtarında geçerlilik süresi (exp) yok.');
    if ($exp < $now - 30) throw new RuntimeException('Giriş bağlantısının süresi dolmuş.');
    if ($exp > $now + $maxAge + 60) throw new RuntimeException('Giriş bağlantısının geçerlilik süresi çok uzun.');
    if (isset($payload['iat']) && (int)$payload['iat'] > $now + 60) throw new RuntimeException('Giriş anahtarının zamanı ileri tarihli.');
    if (empty($payload['jti']) || !is_string($payload['jti']) || strlen($payload['jti']) > 64) throw new RuntimeException('Giriş anahtarında tek kullanımlık kod (jti) yok.');
    if (empty($payload['uid']) || empty($payload['name'])) throw new RuntimeException('Giriş anahtarında kullanıcı bilgisi eksik.');
    return $payload;
}
