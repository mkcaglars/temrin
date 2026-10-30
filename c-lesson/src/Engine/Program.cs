using System.Globalization;

namespace CLesson.Engine
{
    [System.Runtime.Versioning.SupportedOSPlatform("browser")]
    public static class Program
    {
        public static void Main()
        {
            // Öğrencilerin bilgisayarlarındaki Windows ile aynı davranış için Türkçe kültür.
            var tr = new CultureInfo("tr-TR");
            CultureInfo.DefaultThreadCurrentCulture = tr;
            CultureInfo.DefaultThreadCurrentUICulture = tr;
            CultureInfo.CurrentCulture = tr;
            CultureInfo.CurrentUICulture = tr;
            MiniWinForms.Ui.Backend = new JsBackend();
        }
    }
}
