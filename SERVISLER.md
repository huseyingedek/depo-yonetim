# CANIAS Servisleri — Aktüel Ofis WMS

Bu belge projede kullanılan tüm CANIAS servislerini, parametrelerini ve
uygulamada nerede çağrıldıklarını anlatır.

Son güncelleme: 21.07.2026

---

## Bağlantı

| | |
|---|---|
| WSDL | `http://192.168.22.16:8080/CaniasWS-v1/services/iasWebService?wsdl` |
| Sürüm | **v1** (`iasWebService`) |
| Uygulama sunucusu | `192.168.22.16:27499` |
| Client / Dil | `00` / `T` |
| Veritabanı | `AKTUEL` @ `CANIAS` |
| Servis kullanıcısı | `WMSWSUSER` — sadece `server/.env`, tarayıcıya asla gitmez |

### v2 neden kullanılmıyor

`CaniasWS-v2` farklı bir API. `callService` çağrısında `Parameters` alanını
**sessizce yok sayıyor** — yanlış şifreyle bile aynı cevabı döndürüyordu.
v1'e geçilince parametreler okunmaya başladı.

### Çağrı biçimi

```
login(p_strClient, p_strLanguage, p_strDBName, p_strDBServer,
      p_strAppServer, p_strUserName, p_strPassword) → sessionId
callIASService(sessionid, serviceid, args, returntype, permanent)
```

`args` alanı **XML ister**. Dokümanda "PARAMS separatedByComma" yazıyor ama
virgülle ayrık gönderim sessizce yok sayılıyor:

```xml
<PARAMETERS><PSCOMPANY>01</PSCOMPANY><PSPLANT>100</PSPLANT></PARAMETERS>
```

Parametreler **isme göre** eşleşir, sıra önemli değil.

### Parametre önek kuralı

| Önek | Tip | Örnek |
|---|---|---|
| `PS` | STRING | `PSCOMPANY` |
| `PI` | INTEGER | `PIISPICK` |
| `PD` | DATETIME | `PDSTARTDATE` |
| `PDC` | DECIMAL | `PDCQUANTITY` |

### Değer kuralları

- Boş string yerine `%` gönder
- Integer boşsa `0`
- **Tarih `GG.AA.YYYY` ve gün İKİ HANELİ olmalı.** `1.01.1975` sessizce boş
  liste döndürüyor, `01.01.1975` çalışıyor. Bu tuzağa bir kez düştük.
- CANIAS `*` değerini "belirlenmemiş / farketmez" anlamında kullanır

### Yanıt biçimi tuzağı

CANIAS'ın JSON'u bozuk geliyor: bir satırın alanları ilk dizi tipindeki alanın
içine `{"#item":{...}}` sarmalıyla tıkışıyor. `flatten()` bunu düzeltiyor
(`server/test/ortak.mjs` ve `src/api/client.ts`).

---

## Servisler

### 1. MZYCheckUser — depocu girişi

| Parametre | Tip | Değer |
|---|---|---|
| `PSUSER` | STRING | CANIAS kullanıcı adı |
| `PSPASSWORD` | STRING | şifre |

**Döner:** `TBLUSER` (CONTACTNUM, NAME, SURNAME) — doluysa giriş geçerli.
Hatada `TBLMESSAGE`.

**Uygulamada:** Giriş ekranı. Dönen kullanıcı adı `PSWORKER` olarak sonraki
çağrılarda kullanılıyor.

---

### 2. MZYListingPick — emir listesi

| Parametre | Tip | Değer | Açıklama |
|---|---|---|---|
| `PSCOMPANY` | STRING | `01` | |
| `PSPLANT` | STRING | `100` | |
| `PSWORKER` | STRING | `bsenturk` | giriş yapan depocu |
| `PISTATUS` | INTEGER | `0` | 0 açık, 1 kısmi, 2 kapalı |
| `PIISPICK` | INTEGER | `1` | **1 toplama, 0 yerleştirme** |
| `PDSTARTDATE` | DATETIME | `01.01.1975` | iki haneli gün! |
| `PDENDDATE` | DATETIME | `01.01.2100` | |
| `PIISDELETE` | INTEGER | `0` | |
| `PIISSTARTED` | INTEGER | `1` | |
| `PIORDER` | INTEGER | `0` | |

**Döner:** `TBLPOLIST` — ORDERNUM, ORDERTYPE, CUSNAME1, STEXT, DOCNUM, STATUS,
ISSTARTED, WORKER

**Uygulamada:** "Açık Siparişler" listesi.

**Not:** `PRIORITY` bu tabloda **yok**, kalem seviyesinde geliyor.

---

### 3. MZYEnterPick — emre gir ⚠ VERİ YAZAR

| Parametre | Tip |
|---|---|
| `PSCOMPANY` | STRING |
| `PSPLANT` | STRING |
| `PSORDERNUM` | STRING |
| `PSORDERTYPE` | STRING |

**Döner:** `IASWMSPOITEM` — emrin kalemleri.

**Uygulamada:** Emre tıklayınca. Emri kullanıcıya atar, `ISSTARTED=1` yapar.

**⚠ İdempotent değil.** Aynı emre ikinci girişte kalem yerine sadece
`TBLMESSAGE` dönebiliyor. React StrictMode iki kez çağırdığı için
`useRef` bekçisi konuldu.

#### Önemli alanlar

| Alan | Anlamı |
|---|---|
| `MOVEQTY` | Sipariş miktarı — toplanması gereken |
| `MOVEDQTY` | Toplanmış miktar (D = done) |
| `PRIORITY` | Toplama önceliği, **küçük olan önce** |
| `SPECIALSTOCK` | `1` → SKT'li, parti barkodu okutulur. `*` → parti yok |
| `BATCHNUM` | Parti numarası |
| `UNIT` | Birim (AD, PK, ST) |
| `WAREHOUSETA` | **Hedef depo** — CreateContainer'a bu gider |
| `TRANSAREA` | Toplamada hedef alan |
| `WAREHOUSEFA` / `FRONTAREA` | Yerleştirmede **kaynak** — nereden alınacak |

**⚠ Kritik yanlış anlaşılma:** Toplamada `TRANSAREA` ürünün alınacağı raf
**değildir**. Toplanan malın konduğu paletin bırakılacağı yerdir. Ürünün
hangi rafta olduğu bu tabloda **yok** — onu öneri servisi verir.

---

### 4. MZYCrtSuggestListPickFromSP — raf önerisi

| Parametre | Tip |
|---|---|
| `PSCOMPANY` | STRING |
| `PSPLANT` | STRING |
| `PSORDERNUM` | STRING |
| `PSORDERTYPE` | STRING |
| `PIITEMNO` | INTEGER |

**Döner:** `SUGGESTEDLISTFROM`

| Alan | Anlamı |
|---|---|
| `WAREHOUSE` + `STOCKPLACE` | Raf. Barkodu: `WAREHOUSE$STOCKPLACE` → `D3$C1` |
| `TOTAL` + `QUNIT` | O rafta bu üründen ne kadar var (96 AD) |
| `DISTANCE` | Rafın uzaklığı — küçük olan yakın |
| `ENTRYDATE` | Stoğun rafa giriş tarihi (FIFO) |
| `BATCHNUM` / `SPECIALSTOCK` | O raftaki partinin bilgisi |

**Uygulamada:** Emir açılınca her kalem için çağrılıyor, sonuç kalem
satırındaki raf seçim kutusuna dolduruluyor. Mesafeye göre sıralı.

**Not:** Stok yoksa boş döner. `MATERIAL` alanı boş geliyor (eksik atama).

---

### 5. MZYReadBarcodeSP — raf barkodu çöz

| Parametre | Tip |
|---|---|
| `PSCOMPANY` | STRING |
| `PSPLANT` | STRING |
| `PSBARCODE` | STRING — `D3$C1` |

**Döner:** `TBLWHSP` — COMPANY, PLANT, WAREHOUSE, STOCKPLACE

**Uygulamada:** Depocu rafın barkodunu okutur, "bu raftayım" bağlamı açılır.
Bağlam sabit kalır, ürün okutmak sıfırlamaz.

**⚠ Doğrulama yapmıyor.** `ZZ$YY99` gibi olmayan raf da kabul ediliyor.
Uygulamada en azından `$` kontrolü var ama gerçek doğrulama Bora'da.

---

### 6. MZYReadBarcode — ürün barkodu çöz

| Parametre | Tip | Açıklama |
|---|---|---|
| `PSCOMPANY` | STRING | |
| `PSPLANT` | STRING | |
| `PSBARCODE` | STRING | okutulan barkod (parti/özel stok BARKODUN İÇİNDE: `UD009$*$`) |
| `PSWAREHOUSE` | STRING | okutulan rafın deposu, boş olabilir |
| `PSSTOCKPLACE` | STRING | okutulan rafın stok yeri, boş olabilir |
| `PDCQUANTITY` | DECIMAL | okutulan barkodun katsayısı (kaç tane) |

> **DİKKAT (Bora spec, 22.07):** `PSBATCHNUM` / `PSSPECIALSTOCK` **YOK**. Parti ve
> özel stok ayrı parametre değil, barkodun içinde gider. Eskiden `PSBATCHNUM`
> gönderiyorduk, servis okumuyordu (dönen `BATCHNUM` hep `*` idi).

**Döner:** `WMSXMLTABLE` — **iki farklı biçimde**

Başarılı: tek satır, `MATERIAL` dolu
```
MATERIAL=UD009  MTEXT=Uludağ Doğal Maden Suyu  UNIT=AD
QUANTITY=10  AVAILSTOCK=96  BATCHNUM=*  SKUNIT=AD
```

Başarısız: iki satır, anahtar-değer
```
FIELD=RETVALUE   VALUE=0
FIELD=SYSTEMMSG  VALUE=<hata metni>
```

Ayrım `MATERIAL` alanının varlığından yapılıyor — `RETVALUE` başarılı
yanıtta hiç gelmiyor, ona bakmak yanıltıcı olur.

| Alan | Anlamı |
|---|---|
| `QUANTITY` | Okutulan **barkodun** kaç stok birimi ettiği. 1 koli = 10 adet → `10` |
| `AVAILSTOCK` | O **raftaki** gerçek stok. Raf + ürün + parti üçü de gönderilirse dolu gelir, biri eksikse `0` |

**Barkod biçimleri:** `MALZEME$*$` (örn. `UD009$*$`) veya EAN (`8690723511208`).
Bir ürünün **birden çok barkodu** var, hepsi aynı `MATERIAL`'a çıkar.
Bu yüzden kalem eşleştirmesi **barkodla değil `MATERIAL` ile** yapılıyor.

**Uygulamada:** Ürün okutulunca. Dönen `MATERIAL` emirdeki kalemle eşleşiyorsa
kayıt açılır, `QUANTITY` kadar miktar yazılır.

---

### 7. MZYCreateContainer — palet oluştur ⚠ VERİ YAZAR

Excel'deki adı: **"Palet Oluştur"**

| Parametre | Tip | Değer |
|---|---|---|
| `PSCOMPANY` | STRING | `01` |
| `PSPLANT` | STRING | `100` |
| `PSWAREHOUSE` | STRING | **EnterPick'ten gelen `WAREHOUSETA`** (`10`) |
| `PSMATERIAL` | STRING | `KONPAKET` |

**Uygulamada:** "Pakete Yerleştir" ilk adımı. Dönen palet numarası
`SavePick`'e gider.

---

### 8. MZYSavePick — toplananı kaydet ⚠ VERİ YAZAR

Zincirin son halkası. `MOVEDQTY` bununla güncellenir.

**Parametreler (Bora spec, 22.07):**

| Parametre | Tip | Açıklama |
|---|---|---|
| `PSCOMPANY` | STRING | 01 |
| `PSPLANT` | STRING | 100 |
| `PSCONTWAREHOUSE` | STRING | paletin (konteynerin) deposu |
| `PSCONTSTOCKPLACE` | STRING | paletin numarası (MZYCreateContainer'dan gelir) |
| `PSIASWMSPOITEMXML` | STRING/XML | toplanan malzemeler; raf, parti, miktar bilgileriyle |

`PSIASWMSPOITEMXML` her okutma satırını bir `<ROW>` olarak taşır:

```
COMPANY, PLANT, MATERIAL, WAREHOUSE, STOCKPLACE, SPECIALSTOCK,
BATCHNUM, QUANTITY, QUNIT, ORDERTYPE, ORDERNUM, ITEMNO
```

**Uygulamada:** Palet oluştuktan sonra. Palet numarası boşsa **çağrılmaz** —
hangi palete ait olduğu belirsiz kayıt CANIAS'a düşmesin diye.

---

## Akış

```
CheckUser → ListingPick → EnterPick → CrtSuggestListPickFromSP
    → ReadBarcodeSP → ReadBarcode → CreateContainer → SavePick
```

Depocunun gördüğü:

1. Giriş yapar
2. Açık emirleri görür, birine girer
3. Her kalemin altında hangi raftan alınacağı yazar (mesafeye göre sıralı)
4. O rafa gider, **raf barkodunu okutur** — raf sabitlenir
5. Ürünleri okutur — her okutma bir **kayıt** üretir
6. Parti takipliyse parti barkodunu okutur/yazar
7. Başka rafa geçerse yeni raf okutur
8. "Pakete Yerleştir" → palet oluşur → toplama kaydedilir

### Neden sayaç değil kayıt listesi

Stok, okutma kayıtlarına göre düşecek. "Miktar 3" demek yetmiyor; hangi
raftan, hangi partiden, hangi belgeye karşılık alındığı da lazım. Aynı ürün
farklı raflardan alınırsa her biri ayrı satır olarak gider.

Kayıt **silinebilir**, ama **elle artırılamaz** — artırmak yeni okutma demek.

---

## Bilinen sorunlar

### Bora'da

| Sorun | Belirti |
|---|---|
| `SavePick` yazılmadı | Boş dönüyor, toplama CANIAS'a yazılmıyor (canlı test bekliyor) |
| `CreateContainer` boş dönüyor | Palet numarası gelmiyor, 5 varyasyon denendi |
| `ReadBarcode` eksik atamalar | `CCPLANT=TXTCCPLANT`, `COSTCENTER=TXTCCENTER`, `COSTOBJECT=TXTCOBJECT`, `PROJECT=TXTPROJECT`, `VOPTIONSDESC=TXTVOPTIONSDESC` (stok dışı alanlar) |
| `ReadBarcodeSP` doğrulama yok | Olmayan raf kabul ediliyor |
| `SUGGESTEDLISTFROM.MATERIAL` boş | Eksik atama |
| `GetCompany`/`GetPlant`/`GetWarehouse` | "Web service bulunamadı" |

Bu "değişken adı basılıyor" hatası daha önce çıktı ve düzeltildi:
`prusern` (ListingPick), `TXTMATERIAL` / `PSSTOCKPLACE` (ReadBarcode). Aynı sınıftan.

**ÇÖZÜLDÜ (22.07):**
- `AVAILSTOCK` artık gerçek stoğu dönüyor (UD009→240, NC063→111, NC210→11111).
  Kural: stok `specialstock+batchnum+depo+stokyeri+firma+tesis+malzeme` anahtarının
  tamamı tutunca dönüyor. Parti/özel stok ayrı parametre değil, **barkodun içinde**.
- `MZYReadBarcode`'da `PSBATCHNUM` yokmuş; kaldırıldı.

### Bizde

- Ayarlarda firma/tesis/depo `.env`'de sabit — `Get*` servisleri gelince
  ayarlar ekranına bağlanacak
- Emirden çıkınca kilit açılmıyor — `MZYClosePick` akışı yok
- Yerleştirme (`ISPICK=0`) tarafı hiç test edilmedi
- Toplanan kayıtlar sadece bellekte — tarayıcı kapanırsa gider

### Teyit bekleyenler

- `SavePick` gerçek çağrıda stok düşürüyor mu — canlı test yapılmadı
- `PSIASWMSPOITEMXML` içindeki satır alan adları doğru mu (COMPANY, MATERIAL, ...)
- `MZYCreateContainer` palet numarasını hangi alanda dönüyor (CONTAINER/STOCKPLACE?)
- Parti barkodunun doğrulanıp doğrulanmayacağı

---

## Test scriptleri

`server/test/` altında:

| Dosya | Ne yapar |
|---|---|
| `ortak.mjs` | Ortak yardımcılar — bağlantı, çağrı, düzleştirme |
| `senaryo-toplama.mjs` | Login'den paketlemeye tüm zincir |
| `senaryo-yerlestirme.mjs` | Yerleştirme tarafı (ISPICK=0) |
| `saglik-kontrol.mjs` | Hangi servis çalışıyor, tek bakışta |

```bash
node test/saglik-kontrol.mjs
node test/senaryo-toplama.mjs bsenturk 2Akl00*
node test/senaryo-toplama.mjs bsenturk 2Akl00* --yaz          # yazma adımları da
node test/senaryo-toplama.mjs bsenturk 2Akl00* --emir=26935024
node test/senaryo-yerlestirme.mjs bsenturk
```

Veri yazan adımlar (`CreateContainer`, `SavePick`) varsayılan olarak
**atlanır**, `--yaz` ile çalışır.
