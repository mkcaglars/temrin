<?php
// C# WinForms Ders Ortamı — sunucu ayarları
//
// Bu dosyayı "config.php" adıyla kopyalayıp düzenleyin.
// Daha güvenli seçenek: dosyayı public_html'in BİR ÜST klasörüne "csharp-ders-config.php" adıyla koyun;
// uygulama önce orayı arar. Böylece ayarlar web üzerinden hiçbir şekilde erişilemez.

return [
    // Hostinger > Veritabanları > MySQL bölümünden oluşturduğunuz veritabanı bilgileri.
    'db' => [
        'dsn'  => 'mysql:host=localhost;dbname=u123456789_csharp;charset=utf8mb4',
        'user' => 'u123456789_csharp',
        'pass' => 'VERITABANI_SIFRESI',
    ],
    // Yerel deneme için SQLite da kullanılabilir:
    // 'db' => ['dsn' => 'sqlite:' . __DIR__ . '/../../data/ders.sqlite', 'user' => null, 'pass' => null],

    // Okul portalı ile paylaşılan gizli anahtar (en az 32 karakter, rastgele).
    // Üretmek için: php -r "echo bin2hex(random_bytes(32));"
    'jwt_secret' => 'BURAYA-EN-AZ-32-KARAKTERLIK-RASTGELE-BIR-ANAHTAR-YAZIN',

    // Portalın ürettiği bağlantı en fazla kaç saniye geçerli olsun.
    'token_max_age' => 300,

    // Giriş yaptıktan sonra oturum kaç saat açık kalsın.
    'session_hours' => 10,

    // Oturum yokken kullanıcının yönlendirileceği okul portalı adresi.
    'portal_url' => 'https://portal.okulunuz.k12.tr/',

    // Deneme için token üreten sayfa (test-portal.php). Canlı kullanımda MUTLAKA false olmalı.
    'test_portal' => false,

    // Sınırlar
    'max_project_bytes' => 3000000,
    'max_projects_per_user' => 200,
];
