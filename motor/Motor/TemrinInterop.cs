using System.Runtime.InteropServices.JavaScript;
using System.Runtime.Versioning;

namespace CLesson.Engine
{
    /// <summary>Temrin'in JavaScript'ten çağırdığı motor fonksiyonları (c-lesson Interop sınıfına eklenir).</summary>
    [SupportedOSPlatform("browser")]
    public static partial class Interop
    {
        /// <summary>Projeyi temrin kontrollerine göre değerlendirir. Açık program kapanır.</summary>
        [JSExport]
        public static string Degerlendir(string projeJson, string kontrollerJson) =>
            Temrin.Motor.Degerlendirici.DegerlendirJson(projeJson, kontrollerJson);

        /// <summary>Çıktı tahmini sorusunun kodunu çalıştırıp konsol çıktısını döndürür.</summary>
        [JSExport]
        public static string CiktiHesapla(string kod) => Temrin.Motor.Degerlendirici.CiktiHesaplaJson(kod);
    }
}
