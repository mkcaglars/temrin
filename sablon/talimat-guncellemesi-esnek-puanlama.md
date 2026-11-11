# Temrin oluşturma talimatı: esnek puanlama güncellemesi

Bu notu temrin hazırlayan Claude projesine yapıştırın. Önceki talimatın yerine geçmez; aşağıdaki kurallar eski kuralların üzerine yazılır. Eski CSV'ler değişiklik gerektirmeden çalışır.

**İlke:** Önemli olan mantıktır. Biçim farkları puan kırmaz; kesinti olursa nedeni Tespit'e yazılır.

1. **Çıktı karşılaştırması (`calistir` beklenen, `cikti` sorusu)**
   - `ad=değer` (varsayılan, esnek): Boşluk, büyük-küçük harf (İ/ı dahil), `,` `.` `:` `-` ayraçları ve ek metin önemsenmez. `72,5` = `72.5`. **Sayılar birebir ve aynı sırada olmalıdır.**
   - `ad==değer`: Birebir eşleşme. Yalnızca biçimin kendisi kazanımsa kullan.
   - `ad~=değer`: Beklenen değer çıktının içinde geçiyorsa yeterli.
2. **Birden çok durum:** `girdi` = `"txtN=5 || txtN=0"`, `beklenen` = `"lstSonuc=1|2|3|4|5 || lstSonuc="`. Durum sayıları eşit olmalı. Puan, geçen durum oranıyla verilir. Normal girdi ile uç girdiyi tek satırda topla.
3. **Eşdeğer yapılar:** `kod_yapisi` beklenen `"for|foreach|while;if"` (gruplar `;`, eşdeğerler `|` ya da `veya`). `kod_icerir` için alternatifler ` veya ` ile, herhangi bir ad için `*`: `"*.Items.Clear() veya *.DataSource = null"`. `this.` ve boşluklar önemsenmez. Kazanım belirli bir yapıysa (for) yalnız onu yaz.
4. **Kısmi puan:** `kontrol_var`'da adlar, `kod_yapisi`'nda `;` grupları, `calistir`'da `||` durumları puanı böler. Puan = round(puan × oran) − kesinti.
5. **Ad farkı:** Yazım farkı (`lbl_sonuc`) tam puan alır, not düşülür. Farklı ad (`button1`) türden/metinden/olay metodundan bulunur, test yine çalışır, Tespit'e "Ad farkı" yazılır.
6. **Yeni `bilgi` alanları (isteğe bağlı):**
   - `bicim_kesintisi` (varsayılan 0): Biçim farkında kesilecek puan.
   - `ad_kesintisi` (varsayılan 0): Ad farkında kesilecek puan.
   - `ogretmen_onayi` (`Evet`/`Hayır`): Otomatik puan öneri olur, öğretmen onaylar ya da gerekçeyle değiştirir.
7. **Test tasarımı:** Mantık hatasını **sayıyla** yakala (ortalama, toplam, sınır değer, öğe sayısı). Esnek karşılaştırma yalnız metin farkını affeder, yanlış sayıyı affetmez. "Geçti/Kaldı" gibi sözcük sonuçları da ayırt edilir.

Örnek satırlar:

```
bilgi;bicim_kesintisi;;;;;;;1;
bilgi;ogretmen_onayi;;;;;;;Evet;
kontrol;K2;O3;4;kod_yapisi;btnHesapla.Click;;for|foreach|while;Döngü kullanılmış;Notlar bir döngüyle toplanmamış
kontrol;K3;O3;6;calistir;btnHesapla;"txtNotlar=40 90 85 75 || txtNotlar=50 60";"lblSonuc=Ortalama: 72,5 || lblSonuc=Ortalama: 55";Ortalama doğru;Ortalama yanlış hesaplanıyor
```
