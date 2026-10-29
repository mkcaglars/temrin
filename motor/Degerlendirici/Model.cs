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
        [JsonPropertyName("gecti")] public bool Gecti { get; set; }
        /// <summary>Başarısızsa nedeni (temrin sayfasındaki tespit; CSV'de tespit yazılmamışsa bu kullanılır).</summary>
        [JsonPropertyName("mesaj")] public string Mesaj { get; set; } = "";
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
