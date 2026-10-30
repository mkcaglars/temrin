// Monaco editörünün arka plan işçisi: c-lesson editörü sitenin kökünde varsayar; Temrin'de studyo/ altında.
// İşçi dosyasının adresi bu sayfaya göre verilir (loader.js'ten önce yüklenmeli).
(function () {
  var taban = new URL('lib/monaco/', location.href).href;
  self.MonacoEnvironment = {
    getWorkerUrl: function () {
      return 'data:text/javascript;charset=utf-8,' + encodeURIComponent(
        "self.MonacoEnvironment={baseUrl:'" + taban + "'};importScripts('" + taban + "vs/base/worker/workerMain.js');");
    },
  };
})();
