using System.Text.Json;
using System.Text.Json.Serialization;

namespace Temrin.Motor
{
    /// <summary>Tek bir otomatik kontrol (temrin CSV'sindeki "kontrol" satırı).</summary>
    public sealed class Kontrol
    {
        [JsonPropertyName("no")] public string No { get; set; } = "";
        [JsonPropertyName("tip")] public string Tip { get; set; } = "";
        [JsonPropertyName("hedef")] public string Hedef { get; set; } = "";
        [JsonPropertyName("girdi")] public string Girdi { get; set; } = "";
        [JsonPropertyName("beklenen")] public string Beklenen { get; set; } = "";
    }

    public sealed class KontrolSonucu
    {
        [JsonPropertyName("no")] public string No { get; set; } = "";
        /// <summary>Tamamen geçti mi (oran = 1). Eski sürümlerle uyum için korunur.</summary>
        [JsonPropertyName("gecti")] public bool Gecti { get; set; }
        /// <summary>Başarısızsa nedeni (temrin sayfasındaki tespit; CSV'de tespit yazılmamışsa bu kullanılır).</summary>
        [JsonPropertyName("mesaj")] public string Mesaj { get; set; } = "";
        /// <summary>Kısmi puan oranı, 0–1: geçen durum / alt yapı / kontrol adı payı.</summary>
        [JsonPropertyName("oran")] public double Oran { get; set; }
        /// <summary>Çıktı mantıkça doğru ama biçimi farklı (boşluk, harf, ayraç, ek metin) kabul edildi.</summary>
        [JsonPropertyName("bicim")] public bool BicimFarki { get; set; }
        /// <summary>Kontrol adı farklı; kontrol türüne ve metnine göre bulunup kullanıldı.</summary>
        [JsonPropertyName("ad")] public bool AdFarki { get; set; }
        /// <summary>Kabul edilen farkların açıklaması (Tespit'e yazılır).</summary>
        [JsonPropertyName("notlar")] public List<string> Notlar { get; set; } = new();
        /// <summary>calistir: denenen girdi–beklenen çifti sayısı ve geçenler.</summary>
        [JsonPropertyName("durum")] public int Durum { get; set; } = 1;
        [JsonPropertyName("gecen")] public int Gecen { get; set; }
    }

    public sealed class DegerlendirmeSonucu
    {
        [JsonPropertyName("derlendi")] public bool Derlendi { get; set; }
        [JsonPropertyName("hatalar")] public List<string> Hatalar { get; set; } = new();
        [JsonPropertyName("sonuclar")] public List<KontrolSonucu> Sonuclar { get; set; } = new();
        [JsonPropertyName("ms")] public long Ms { get; set; }
    }

    public sealed class CiktiSonucu
    {
        [JsonPropertyName("basarili")] public bool Basarili { get; set; }
        [JsonPropertyName("cikti")] public string Cikti { get; set; } = "";
        [JsonPropertyName("hata")] public string Hata { get; set; } = "";
    }

    internal static class Json
    {
        public static readonly JsonSerializerOptions Ayar = new() { PropertyNameCaseInsensitive = true, Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping };
    }
}
