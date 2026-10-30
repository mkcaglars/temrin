# C# Form Stüdyosu

Derslerde kullanmak için web üzerinde çalışan bir **C# Windows Forms** geliştirme ortamı. Öğrenci tarayıcıda form tasarlar, kod yazar, derler ve programı çalıştırıp test eder. Kurulum gerekmez. Okul portalından gelen bağlantıyla otomatik giriş yapılır, projeler sunucuda saklanır ve başka bir bilgisayardan kaldığı yerden devam edilebilir.

## Özellikler

**Öğrenci**
- Visual Studio benzeri arayüz: araç kutusu, form tasarımcısı, kod editörü, çözüm gezgini, özellikler/olaylar penceresi, hata listesi
- Sürükle-bırak form tasarımı: hizalama çizgileri, boyutlandırma, GroupBox/Panel içine yerleştirme, geri al/yinele, kopyala/yapıştır
- Tasarımcı, Visual Studio ile aynı biçimde `Form1.Designer.cs` üretir. Kontrole çift tıklayınca olay metodu oluşturulur
- Kod editörü (VS Code'un editörü Monaco): renklendirme, **IntelliSense** (`textBox1.` yazınca öneriler), yazarken **Türkçe hata mesajları**
- Programı tarayıcıda çalıştırma (F5): pencereler, MessageBox, InputBox, Timer, birden çok form, `ShowDialog`, `Console.WriteLine`
- Çalışma hatalarında hangi satırda hata olduğu ve Türkçe ipucu gösterilir; sonsuz döngü ve sonsuz özyineleme yakalanır
- Birden çok proje; her projede birden çok form ve sınıf
- Otomatik kayıt; aynı proje iki yerde değiştirilirse uyarı verilir
- Projeyi **Visual Studio projesi (.zip)** olarak indirme (net8.0-windows)
- **Menü ve araç çubukları:** MenuStrip'e formda "Buraya yazın" ile öğe ekleme (VS adlandırması: `dosyaToolStripMenuItem`), öğeye çift tıklayınca `Click` metodu; ToolStrip, StatusStrip, ContextMenuStrip, kısayol tuşları
- **DataGridView:** `Rows.Add`, `Cells["ad"].Value`, `SelectedRows`, `CellClick`, `IsNewRow`, satır renkleri, sıralama, hücre düzenleme; tasarımcıda sütun düzenleyicisi. Visual Studio'daki davranışlar korunur (`Rows.Count` en alttaki yeni satırı da sayar, yeni satır silinemez...)
- **Dosya iletişim kutuları:** `OpenFileDialog` ile bilgisayardan dosya/resim seçme (`Image.FromFile(ofd.FileName)`), `SaveFileDialog` ile kaydedilen dosya "Çıktı" bölümünden indirilir
- **Veritabanı (okul.mdf yerine):** "Veritabanı Uygulaması" şablonu, Visual Studio'da veri kümesi sihirbazı ve alanları forma sürükledikten sonra oluşan formun aynısıdır: `OkulDataSet`, `ogrenciBindingSource`, `ogrenciTableAdapter.Fill(...)`, `tableAdapterManager.UpdateAll(...)`, `ogrenciBindingNavigator`, bağlı TextBox/MaskedTextBox/CheckBox ve DataGridView. Arkada gerçek `DataTable` çalışır (`Filter`, `Select`, Türkçe İ/ı karşılaştırmaları). Kayıtlar projeyle birlikte saklanır; `okul.mdf` penceresinden tablo tasarımı ve kayıtlar düzenlenir

**Öğretmen**
- Sınıf ve öğrenci listesi, son giriş ve son değişiklik tarihleri
- Tüm projeleri açma, çalıştırma ve test etme (salt okunur, öğrencinin projesi bozulmaz)
- Öğrenciye proje notu yazma; "Kopyasını al" ile kendi alanına kopyalama
- **Sınıfa gönder:** hazırladığı projeyi seçtiği sınıftaki öğrencilerin (hepsine ya da seçtiklerine) not ile birlikte kopyalama; aynı adlı projesi olan öğrenci atlanır

**Desteklenen kontroller:** Form, Button, Label, LinkLabel, TextBox, MaskedTextBox, RichTextBox, CheckBox, RadioButton, ComboBox, ListBox, CheckedListBox, GroupBox, Panel, TabControl, PictureBox, NumericUpDown, DateTimePicker, ProgressBar, TrackBar, DataGridView, MenuStrip, ToolStrip, StatusStrip, ContextMenuStrip, BindingNavigator, Timer, ToolTip, ErrorProvider, BindingSource, OpenFileDialog, SaveFileDialog, MessageBox, `Interaction.InputBox`.

**Laboratuvarda (Visual Studio'da) kalanlar:** veritabanı dosyası (okul.mdf) ekleme, veri kümesi sihirbazı ve alanları forma sürükleme. Stüdyo bu adımların *sonucunu* hazır şablon olarak verir; öğrenci kodlamaya oradan devam eder.

## Nasıl çalışır?

```
Tarayıcı                                                   Sunucu (Hostinger, PHP + MySQL)
┌────────────────────────────────────────────────────┐    ┌───────────────────────────────┐
│ Arayüz (JS): editör, tasarımcı, öğretmen paneli    │◄──►│ giris.php  token doğrulama    │
│ .NET WebAssembly motoru:                           │    │ api/       proje kaydet/yükle │
│   Roslyn derleyici → öğrenci kodu → MiniWinForms   │    │ MySQL      kullanıcı, proje   │
│   (System.Windows.Forms ile aynı API, HTML çizim)  │    └───────────────────────────────┘
└────────────────────────────────────────────────────┘
```

Gerçek WinForms yalnızca Windows'ta çalışır. Bu yüzden `src/MiniWinForms` içinde, `System.Windows.Forms` ile **aynı ad ve API'ye** sahip bir kütüphane var. Bu kütüphane kontrolleri HTML olarak çizer. Derleme ve çalıştırma öğrencinin tarayıcısında olur, sunucu yalnızca giriş ve kayıt işini yapar. Bu sayede ucuz bir paylaşımlı hosting yeterlidir ve 40 öğrenci aynı anda çalışabilir.

Öğrencinin yazdığı kod gerçek Visual Studio'da da derlenir. ZIP olarak indirilen proje doğrudan açılabilir.

## Klasörler

| Klasör | İçerik |
|---|---|
| `src/MiniWinForms` | Tarayıcıda çalışan WinForms taklidi (Form, Button, TextBox…) |
| `src/Compiler` | Roslyn ile derleme, güvenlik denetimi, sonsuz döngü koruması, IntelliSense, ZIP |
| `src/Engine` | .NET WebAssembly giriş noktası (JS ↔ .NET köprüsü) |
| `web/` | Site: `index.html`, `assets/js` (IDE, tasarımcı…), `api/` (PHP), `giris.php` |
| `tests/` | C# birim testleri (derleme, çalıştırma, kod üretici) |
| `portal-ornek/` | Okul portalına eklenecek giriş bağlantısı kodu |
| `docs/` | Kurulum ve portal entegrasyonu belgeleri |

## Geliştirme

Gerekenler: .NET 10 SDK, Node.js 20+, PHP 8.1+

```bash
npm install
./build.sh                                   # dist/ klasörünü üretir
cp web/api/config.example.php dist/api/config.php   # SQLite ve test_portal => true ile düzenleyin
cd dist && php -S localhost:8080             # http://localhost:8080/test-portal.php
dotnet test tests/Tests                      # testler
```

Belgeler:
- [Hostinger kurulumu](docs/KURULUM.md)
- [Okul portalı entegrasyonu (token sistemi)](docs/PORTAL.md)

## Bilinen sınırlar

- `ShowDialog()`, `MessageBox.Show()` ve `InputBox` bir olay metodunun içindeyse WinForms'taki gibi bekler. `FormClosing` ve `KeyPress` gibi sonucun hemen gerektiği olaylarda tarayıcının kendi pencereleri kullanılır.
- `Thread.Sleep` yerine `Timer` veya `await Task.Delay(...)` kullanılmalıdır.
- Henüz desteklenmeyenler: çizim (`Graphics`, `Paint`), `ListView`, `TreeView`, gerçek SQL Server bağlantısı (`SqlConnection`), resim sütunları (Resim alanı laboratuvarda yapılır).
- Bilgisayardaki dosyalara doğrudan yol ile (`"C:\\resim.jpg"`) erişilemez; dosya `OpenFileDialog` ile seçilir. Seçilen ve kaydedilen dosyalar sanal `C:/Users/Ogrenci/Belgeler/` klasöründe durur.
- ZIP'teki veritabanı projesi okul.mdf yerine `okul.xml` dosyasını kullanır (Visual Studio'da da çalışır); gerçek veritabanı için `okul.sql` betiği eklenir.
- Güvenlik için yansıma (reflection), ağ ve işletim sistemi API'leri öğrenci kodunda kapalıdır.
