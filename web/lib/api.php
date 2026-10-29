<?php
// JSON API yardımcıları.
declare(strict_types=1);

function json_yanit(array $veri, int $durum = 200): never
{
    http_response_code($durum);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($veri, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function json_hata(int $durum, string $kod, string $mesaj): never
{
    json_yanit(['durum' => 'hata', 'kod' => $kod, 'mesaj' => $mesaj], $durum);
}
