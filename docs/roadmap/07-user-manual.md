# ALPR Otopark Sistemi — Kullanici Kilavuzu (TR)

**Surum:** v1  
**Hedef:** Operator + Teknik Personel  
**Teslim Formati:** Markdown (kaynak) + PDF (musteri teslim)

---

## 1) Sistem Nedir?

ALPR Otopark Sistemi, arac plakasini kameradan okuyup giris/cikis surecini hizlandiran bir uygulamadir.  
Sistem; kamera, uygulama arayuzu ve bariyer kontrol akisindan olusur.

Bu kilavuzun amaci:

- Kurulumu teknik bilgisi dusuk kullanicilar icin kolaylastirmak
- Gunluk kullanimi adim adim standartlastirmak
- Sik hatalar icin net cozum yolu vermek
- Teknik ekip icin ayri bir gelismis bolum sunmak

**Kisa ozet:** Bu dokumani takip ederek sistemi kurabilir, calistirabilir ve temel sorunlari teknik destege gerek kalmadan cozmeyi deneyebilirsiniz.

---

## 2) Kurulumdan Once Gerekli Olanlar

Kuruluma baslamadan once asagidaki kontrolu yapin.

### 2.1 Donanim ve erisim

- Windows bilgisayar (uygulamanin calisacagi ana makine)
- Kamera(lar) bagli ve aktif
- Bariyer kontrol baglantisi hazir (varsa)
- Yerel yonetici (admin) yetkisi

### 2.2 Dosya ve klasor hazirligi

- Size verilen ZIP paketini bilgisayara indirin.
- Kurulum klasoru olarak kisa ve sade bir yol secin. Ornek: `C:\ALPR\`
- Masaustunde kisayol kullanilacaksa dosya adlarini degistirmeyin.

### 2.3 Baslamadan once dikkat

- Antivir / Defender uyarisi gorulebilir. Bu normaldir.
- Uygulama ilk acilista 20-60 saniye gec baslayabilir.
- Ag baglantisi zayifsa kamera gec gorunebilir.

**Kisa ozet:** Kurulumdan once ZIP dosyasi, klasor yolu, kamera baglantisi ve admin yetkisi hazir olmali.

---

## 3) Adim Adim Kurulum (Windows)

### 3.1 ZIP dosyasini cikarin

1. ZIP dosyasina sag tiklayin.
2. "Tumunu Ayikla" secenegini secin.
3. Hedef klasor olarak `C:\ALPR\` gibi sade bir yol verin.
4. Cikarma bitince klasor icinde `START.bat` ve `STOP.bat` oldugunu kontrol edin.

**Ekran goruntusu gereklidir:**  
`[Gorsel-01: ZIP ayiklama adimi]`

### 3.2 Uygulamayi baslatin

1. `START.bat` dosyasina cift tiklayin.
2. Bir terminal penceresi acilir; pencereyi kapatmayin.
3. Tarayici otomatik acilabilir.

Eger tarayici acilmazsa:

1. Tarayiciyi manuel acin.
2. Adres cubuguna `http://localhost:8000` yazin.
3. Sayfanin yuklenmesini bekleyin.

**Ekran goruntusu gereklidir:**  
`[Gorsel-02: START.bat calistirma]`  
`[Gorsel-03: localhost manuel erisim]`

### 3.3 Defender veya guvenlik uyarisi cikarsa

1. Uyari ekraninda "More info" veya "Daha fazla bilgi" secenegini acin.
2. "Run anyway" veya "Yine de calistir" secenegini secin.
3. Kurum politikasi nedeniyle engelleniyorsa yerel IT sorumlusundan onay alin.

**Ekran goruntusu gereklidir:**  
`[Gorsel-04: Defender uyari ekrani]`

### 3.4 Guvenli durdurma

1. Uygulamayi kapatmak icin `STOP.bat` dosyasina cift tiklayin.
2. Terminal penceresinin kapandigini veya durdurma mesajini dogrulayin.
3. Gerekirse 5-10 saniye bekleyin, sonra tekrar baslatin.

**Ekran goruntusu gereklidir:**  
`[Gorsel-05: STOP.bat ile durdurma]`

**Kisa ozet:** Kurulumda temel akıs ZIP ayiklama -> `START.bat` -> gerekirse `http://localhost:8000` -> kapanista `STOP.bat`.

---

## 4) Ilk Acilis ve Kontrol Listesi

Sistem acildiginda asagidaki kontrolleri sirasiyla yapin.

### 4.1 Hizli kontrol listesi

- [ ] Arayuz hatasiz acildi.
- [ ] Tarih/saat dogru gorunuyor.
- [ ] En az bir kamera "bagli/aktif" gorunuyor.
- [ ] Plaka okuma testinde sonuc alindi.
- [ ] Bariyer test komutu (varsa) basarili calisti.
- [ ] Lisans durumu "gecerli" gorunuyor.

### 4.2 Kamera dogrulama

1. Kamera goruntusunu acin.
2. Goruntude plaka net mi kontrol edin.
3. Gece/duşuk isikta test yapin.

**Dogru/Yanlis ornek gereklidir:**  
`[Gorsel-06-Dogru: net plaka acisi]`  
`[Gorsel-07-Yanlis: egik/uzak/plaka kesik]`

**Kisa ozet:** Ilk acilista kamera goruntusu, plaka okunurlugu, lisans ve bariyer durumu birlikte dogrulanmali.

---

## 5) Gunluk Kullanim

### 5.1 Vardiya baslangici

1. Bilgisayari acin.
2. `START.bat` ile sistemi baslatin.
3. Arayuze girip kamera ve lisans durumunu kontrol edin.

### 5.2 Giris/islem takibi

- Sistem plakayi okudugunda ilgili giris kaydini olusturur.
- Supheli okumada operator manuel kontrol yapar.
- Hata durumunda once "Sorun Giderme" bolumune gidin.

### 5.3 Cikis/islem takibi

- Cikis plaka kontrolu ile kayit tamamlanir.
- Bariyer tetigi gerektiginde sistem/operator akisi uygulanir.
- Islem gecikirse once kamera ve baglanti kontrol edilir.

### 5.4 Vardiya bitisi

1. Aktif islemlerin tamamlandigini kontrol edin.
2. `STOP.bat` ile sistemi guvenli kapatin.
3. Ertesi gun icin not edilmesi gereken hata/uyari varsa kaydedin.

**Kisa ozet:** Her vardiyada standart akıs baslat -> kontrol -> islem takibi -> guvenli kapatma seklindedir.

---

## 6) Sorun Giderme Matrisi

Asagidaki tablo en sik kritik durumlari icerir.

| Sorun | Belirti | Muhtemel Neden | Cozum Adimlari | Ne Zaman Destek |
|------|---------|----------------|----------------|-----------------|
| Uygulama acilmiyor | Arayuz gelmiyor, terminal kapanıyor | Eksik izin, bozuk cikarma, port sorunu | 1) `START.bat` yeniden calistir 2) `http://localhost:8000` dene 3) ZIP'i temiz klasore yeniden cikar 4) Antivir/Defender izinlerini kontrol et | 10 dk icinde acilmiyorsa |
| Kamera gorunmuyor | Siyah ekran / baglanti yok | Kamera IP erisimi yok, ag kopuk, cihaz kapali | 1) Kamera enerji ve kabloyu kontrol et 2) Ag erisimini test et 3) Kamera ayarini yeniden kaydet 4) Uygulamayi yeniden baslat | Kamera 2 denemede gelmezse |
| Plaka okunmuyor | Goruntu var ama okuma yok | Aci kotu, isik zayif, plaka uzak | 1) Kamera acisini duzelt 2) Isik seviyesini artir 3) Arac durma noktasini optimize et 4) Test plakasiyla tekrar dene | 15 dk optimizasyonda sonuc yoksa |
| Bariyer acilmiyor | Plaka okunuyor ama bariyer kapali | Donanim tetik sorunu, role baglantisi, izin problemi | 1) Manuel bariyer testini calistir 2) Kablo/role baglantisini kontrol et 3) Cikis tetik ayarini dogrula | Guvenlik riski olusursa hemen |
| Lisans hatasi | Lisans gecersiz / suresi doldu | Lisans dosyasi yok, cihaz kimligi uyumsuz | 1) Lisans dosyasinin yerini kontrol et 2) Cihaz/surum bilgisini dogrula 3) Guncel lisans dosyasini uygula | Dogrulama sonrasi hala gecersizse |
| Yuksek CPU / yavaslik | Gec tepki, takilma | Cok yuksek islem sikligi, cozumunluk yuksek | 1) `PROCESS_INTERVAL_SEC` degerini artir 2) `PROCESS_WIDTH` degerini dusur 3) Gereksiz uygulamalari kapat 4) Yeniden baslat ve gozlemle | 20 dk sonra iyilesme yoksa |

**Kisa ozet:** Her sorunda once belirtinin kaynagini dogrulayin, adimlari sirasiyla uygulayin, belirtilen esiklerde teknik destegi devreye alin.

---

## 7) Teknik Ek (Teknik Personel Icin)

Bu bolum teknik kurulum, destek ve performans optimizasyonu icindir.

### 7.1 `.env` parametreleri (ornek)

Asagidaki parametre adlari projedeki gercek adlarla birebir kullanilmalidir:

- `DATABASE_URL`: Veritabani baglanti bilgisi
- `PROCESS_INTERVAL_SEC`: Kare/islem dongu araligi (buyudukce CPU azalir)
- `PROCESS_WIDTH`: Islenecek goruntu genisligi (dusuk deger daha hizli olabilir)
- `LICENSE_KEY` veya ilgili lisans degiskeni: Lisans dogrulama bilgisi

Not: Parametre isimleri surume gore degisebilir. Surum notlariyla birlikte kontrol edin.

### 7.2 Log okuma ve ilk analiz

1. Uygulama calisirken terminal ciktilarini takip edin.
2. Hata satirlarinda zaman damgasi ve modul adini not edin.
3. Tekrarlanabilir hata varsa adimlari yazili kaydedin.
4. Destek talebinde log parcasi + tekrar adimi + saat bilgisi paylasin.

### 7.3 Performans ayari

- CPU yuksekse: `PROCESS_INTERVAL_SEC` artir.
- Okuma kalitesi dusukse: Kamera acisi/isik duzeltildikten sonra `PROCESS_WIDTH` optimize et.
- Her degisikligi tek tek yapin; etkisini 5-10 dakika gozlemleyin.

### 7.4 Yedekleme / geri yukleme

Minimum yedek kapsamı:

- Veritabani dosyasi veya dump
- Konfigurasyon dosyalari (`.env` dahil)
- Lisans dosyalari

Temel prosedur:

1. Uygulamayi `STOP.bat` ile durdur.
2. Yedekleri tarihli klasore al.
3. Geri yuklemede once temiz klasor hazirla.
4. Dosyalari geri koy, sonra `START.bat` ile dogrula.

### 7.5 Surum guncelleme proseduru

1. Mevcut surum yedegini al.
2. Yeni paket dosyalarini ayri klasore cikar.
3. Gerekli konfigurasyonlari kontrollu tasi.
4. Ilk acilisi test et, sonra canli kullanim ac.

**Kisa ozet:** Teknik ekip degisiklikleri kontrollu yapmali, her adimi kaydetmeli ve yedeksiz islem yapmamalidir.

---

## PDF Export ve Teslim Kontrol Listesi (Editor Tabanli)

Bu bolum, Markdown dokumanindan hatasiz PDF cikisi almak icin standarttir.

### A) Export ayarlari (Editor > Print/Export to PDF)

- Kagit boyutu: A4
- Yon: Dikey (Portrait)
- Kenar bosluklari: Normal (yaklasik 1.5-2 cm)
- Scale: 100%
- Header/Footer: Kapali
- Background graphics: Kapali (dokuman sade ise)

### B) Tipografi ve okunabilirlik kontrolu

- Basliklar hiyerarsik gorunmeli (`#`, `##`, `###`).
- Govde metni ekranda ve ciktida rahat okunmali.
- Uzun paragraflar yerine kisa maddeler kullanilmali.
- Tablolarda satir kaymasi okunurlugu bozmamali.

### C) Sayfa duzeni kontrolu

- Ana bolumler yeni sayfada veya temiz gecisle baslamali.
- Sorun giderme tablosu bolunuyorsa duzen kontrol edilmeli.
- Gorsel yer tutuculari son gorsellerle birebir degistirilmeli.

### D) Teslim oncesi son QA

- [ ] Baslik: urun adi + surum + tarih dogru
- [ ] Kurulum adimlari test edilmis ve guncel
- [ ] `START.bat`, `STOP.bat`, `http://localhost:8000` bilgisi mevcut
- [ ] Defender yonlendirmesi net
- [ ] Sorun giderme matrisi tam
- [ ] Teknik ekte `.env`, log, performans, yedekleme, guncelleme mevcut
- [ ] Yazim ve imla son kontrol yapildi
- [ ] PDF dosya adi standarda uygun (ornek: `ALPR_KullaniciKilavuzu_v1_2026-04-25.pdf`)

---

## Hizli Baslangic (1 Dakika Ozeti)

1. ZIP'i `C:\ALPR\` altina cikar.
2. `START.bat` ile baslat.
3. Gerekirse `http://localhost:8000` ile manuel gir.
4. Kamera ve lisans durumunu kontrol et.
5. Is bitince `STOP.bat` ile guvenli kapat.

Bu ozet karti, egitimde tek sayfa destek dokumani olarak ayri disa aktarilabilir.
