using MiniWinForms;

namespace Temrin.Motor
{
    /// <summary>
    /// Değerlendirme sırasında ekrana hiçbir şey çizmeyen arayüz: mesaj kutularını, konsol çıktısını
    /// ve çalışma hatalarını kaydeder. Mesaj kutusu "Tamam"/"Evet" ile kapanır, InputBox boş döner.
    /// </summary>
    internal sealed class KayitArayuzu : IUiBackend
    {
        public readonly List<string> Mesajlar = new();
        public readonly List<string> Hatalar = new();
        public readonly System.Text.StringBuilder Cikti = new();
        public string Bitis;

        public void ApplyOps(string opsJson) { }
        public void ScheduleFlush() { }
        public string Measure(string text, string font) => ((text ?? "").Length * 7 + 2) + ",15";
        public string MessageBox(string text, string caption, string buttons, string icon)
        {
            Mesajlar.Add(text ?? "");
            return buttons is "YesNo" or "YesNoCancel" ? "Yes" : "OK";
        }
        public string InputBox(string prompt, string title, string defaultResponse) => defaultResponse ?? "";
        /// <summary>Olay metotlarındaki "await MessageBox.ShowAsync" gibi bekleyen iletişim kutuları.</summary>
        public readonly Queue<(int id, string tur, string json)> Bekleyen = new();

        public void ShowDialog(int requestId, string kind, string json)
        {
            if (kind == "messagebox")
            {
                try
                {
                    using var d = System.Text.Json.JsonDocument.Parse(json);
                    Mesajlar.Add(d.RootElement.TryGetProperty("text", out var t) ? t.GetString() ?? "" : "");
                }
                catch
                {
                    Mesajlar.Add("");
                }
            }
            Bekleyen.Enqueue((requestId, kind, json));
        }

        /// <summary>
        /// Bekleyen iletişim kutularını kullanıcı kapatmış gibi kapatır: mesaj kutusu Tamam/Evet,
        /// InputBox varsayılan değer, dosya iletişim kutuları İptal. Kapanınca açılan yenileri de kapatır.
        /// </summary>
        public void DiyaloglariKapat()
        {
            for (int i = 0; i < 200 && Bekleyen.Count > 0; i++)
            {
                var (id, tur, json) = Bekleyen.Dequeue();
                string sonuc = "Cancel";
                try
                {
                    using var d = System.Text.Json.JsonDocument.Parse(json);
                    var k = d.RootElement;
                    if (tur == "messagebox")
                    {
                        string dugmeler = k.TryGetProperty("buttons", out var b) ? b.GetString() : "OK";
                        sonuc = dugmeler is "YesNo" or "YesNoCancel" ? "Yes" : "OK";
                    }
                    else if (tur == "inputbox")
                    {
                        sonuc = k.TryGetProperty("value", out var v) ? v.GetString() ?? "" : "";
                    }
                }
                catch
                {
                    // biçim bilinmiyor: İptal
                }
                Ui.CompleteDialog(id, sonuc);
            }
        }
        public string Query(int id, string what) => "";
        public void Output(string text) => Cikti.Append(text);
        public void Error(string json)
        {
            try
            {
                using var d = System.Text.Json.JsonDocument.Parse(json);
                var k = d.RootElement;
                string mesaj = k.TryGetProperty("message", out var m) ? m.GetString() : json;
                string tur = k.TryGetProperty("type", out var t) ? t.GetString()?.Split('.').Last() : "";
                int satir = k.TryGetProperty("line", out var s) && s.TryGetInt32(out int n) ? n : 0;
                Hatalar.Add($"{tur}: {mesaj}" + (satir > 0 ? $" (satır {satir})" : ""));
            }
            catch
            {
                Hatalar.Add(json);
            }
        }
        public void ProgramEnded(string reason) => Bitis = reason;
    }
}
