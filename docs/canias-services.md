# CANIAS WMS Servisleri ve Parametre Dokümantasyonu

Bu doküman, Aktüel Ofis Depo Yönetim Uygulamasında (WMS) kullanılan CANIAS servislerinin güncel listesini, açıklamasını, parametrelerini ve istemci (`src/api/client.ts`) üzerindeki eşleşmelerini içermektedir.

---

## 1. Toplama Servisleri (Picking)

### 1.1. `MZYCheckUser` — Kullanıcı Kontrol
- **Açıklama**: Kullanıcı adı ve şifresini doğrulayarak giriş kontrolü yapar.
- **Parametreler**:
  - `PSUSER` (*STRING*): Kullanıcı adı.
  - `PSPASSWORD` (*STRING*): Kullanıcının şifresi.
- **WMS İstemci Karşılığı**: `api.checkUser(username, password)`

### 1.2. `MZYListingPick` — Toplama Emri Listeleri
- **Açıklama**: Giriş yapan kullanıcıya atanmış ve açık durumdaki toplama emirlerini listeler.
- **Parametreler**:
  - `PSCOMPANY` (*STRING*): Firma kodu (`"01"`).
  - `PSPLANT` (*STRING*): Tesis kodu (`"100"`).
  - `PSWORKER` (*STRING*): Giriş yapan kullanıcının adı.
  - `PISTATUS` (*INTEGER*): Filtre durumu (`3`).
  - `PIISPICK` (*INTEGER*): Toplama emri bayrağı (`1`).
  - `PDSTARTDATE` (*DATETIME*): Başlangıç tarihi (`"01.01.1975"`).
  - `PDENDDATE` (*DATETIME*): Bitiş tarihi (`"01.01.2100"`).
  - `PIISDELETE` (*INTEGER*): Silinmişler hariç (`0`).
  - `PIISSTARTED` (*INTEGER*): Başlatılmış emirler (`1`).
  - `PIORDER` (*INTEGER*): Sıralama parametresi (`0`).
- **WMS İstemci Karşılığı**: `api.getPickOrders()`

### 1.3. `MZYEnterPick` — Toplama Emrine Gir
- **Açıklama**: Seçilen toplama emrinin detaylarını ve kalemlerini getirir.
- **Parametreler**:
  - `PSCOMPANY` (*STRING*): Firma kodu (`"01"`).
  - `PSPLANT` (*STRING*): Tesis kodu (`"100"`).
  - `PSORDERNUM` (*STRING*): Seçilen toplama emri numarası.
  - `PSORDERTYPE` (*STRING*): Seçilen toplama emri tipi.
  - `PSUSER` (*STRING*): Giriş yapan kullanıcı adı.
- **WMS İstemci Karşılığı**: `api.getPickOrder(orderNum, orderType)`

### 1.4. `MZYCrtSuggestListPickFromSP` — Stok Yerinden Toplama Önerisi Oluştur
- **Açıklama**: Seçilen toplama emri kalemi için kaynak stok yeri önerilerini (FEFO/FIFO) getirir.
- **Parametreler**:
  - `PSCOMPANY` (*STRING*): Firma kodu (`"01"`).
  - `PSPLANT` (*STRING*): Tesis kodu (`"100"`).
  - `PSORDERNUM` (*STRING*): Seçilen toplama emri numarası.
  - `PSORDERTYPE` (*STRING*): Seçilen toplama emri tipi.
  - `PIITEMNO` (*INTEGER*): Seçilen toplama emrinin kalem numarası.
- **WMS İstemci Karşılığı**: `api.suggestForLine(orderNum, orderType, itemNo)`

### 1.5. `MZYReadBarcodeSP` — Raf/Konteyner Barkodu Okut
- **Açıklama**: Stok yeri / raf barkodunu okutarak raf bilgilerini veya yarım kalan toplamaları döndürür.
- **Parametreler**:
  - `PSCOMPANY` (*STRING*): Firma kodu (`"01"`).
  - `PSPLANT` (*STRING*): Tesis kodu (`"100"`).
  - `PSBARCODE` (*STRING*): Okutulan raf barkodu.
- **WMS İstemci Karşılığı**: `api.readShelfBarcode(barcode)`

### 1.6. `MZYReadBarcode` — Malzeme Barkodu Okut
- **Açıklama**: Malzeme veya koli barkodunu okutarak malzeme bilgilerini ve katsayısını döndürür.
- **Parametreler**:
  - `PSCOMPANY` (*STRING*): Firma kodu (`"01"`).
  - `PSPLANT` (*STRING*): Tesis kodu (`"100"`).
  - `PSBARCODE` (*STRING*): Okutulan malzeme barkodu.
  - `PSWAREHOUSE` (*STRING*): Hafızadaki depo (boş olabilir).
  - `PSSTOCKPLACE` (*STRING*): Hafızadaki stok yeri (boş olabilir).
  - `PDCQUANTITY` (*DECIMAL*): Okutulan barkodun katsayısı / miktarı (varsayılan `1`).
  - `PSBATCHNUM` (*STRING*): Parti numarası (opsiyonel).
- **WMS İstemci Karşılığı**: `api.readBarcode(barcode, warehouse, stockPlace, quantity, batchNum)`

### 1.7. `MZYCreateContainer` — Palet/Konteyner Oluştur
- **Açıklama**: Toplama veya paketleme için yeni toplama palet/konteyner numarası oluşturur.
- **Parametreler**:
  - `PSCOMPANY` (*STRING*): Firma kodu (`"01"`).
  - `PSPLANT` (*STRING*): Tesis kodu (`"100"`).
  - `PSWAREHOUSE` (*STRING*): Hedef depo (boş olabilir).
  - `PSMATERIAL` (*STRING*): Konteyner malzeme türü (örn: `"KONPAKET"`).
  - `PSORDERNUM` (*STRING*): Emir numarası (opsiyonel).
  - `PSORDERTYPE` (*STRING*): Emir tipi (opsiyonel).
- **WMS İstemci Karşılığı**: `api.placeInPackage(targetWarehouse, material, orderNum, orderType)`

### 1.8. `MZYClosePick` — Toplamadan Vazgeç
- **Açıklama**: Devam eden toplama işleminden vazgeçer ve kilidi kaldırır.
- **Parametreler**:
  - `PSCOMPANY` (*STRING*): Firma kodu (`"01"`).
  - `PSPLANT` (*STRING*): Tesis kodu (`"100"`).
  - `PSORDERNUM` (*STRING*): Toplama emri numarası.
  - `PSORDERTYPE` (*STRING*): Toplama emri tipi.
- **WMS İstemci Karşılığı**: `api.cancelPick(orderNum, orderType)`

### 1.9. `MZYSavePick` — Toplamayı Sakla / Tamamla
- **Açıklama**: Toplanan tüm kalemleri (raf, parti, miktar detaylarıyla) saklar.
- **Parametreler**:
  - `PSCOMPANY` (*STRING*): Firma kodu (`"01"`).
  - `PSPLANT` (*STRING*): Tesis kodu (`"100"`).
  - `PSUSER` (*STRING*): Toplamayı yapan kullanıcı.
  - `PSORDERNUM` (*STRING*): Toplama emri numarası.
  - `PSORDERTYPE` (*STRING*): Toplama emri tipi.
  - `PSCONTWAREHOUSE` (*STRING*): Konteynerin deposu.
  - `PSCONTSTOCKPLACE` (*STRING*): Konteynerin numarası/stok yeri.
  - `PILABELCOUNT` (*INTEGER*): Etiket baskı sayısı (`0`).
  - `PDTSTARTTIME` (*STRING*): Başlama zamanı.
  - `PSIASWMSPOITEMXML` (*ARRAY/OBJECT*): Toplanan malzemeler, raf, parti ve miktar detay tablosu.
- **WMS İstemci Karşılığı**: `api.savePick(order, containerWarehouse, containerId)`

---

## 2. Yerleştirme Servisleri (Placement / Putaway)

### 2.1. `MZYCheckUser` — Kullanıcı Kontrol
*(Bkz. 1.1)*

### 2.2. `MZYListingPlacement` — Yerleştirme Emri Listeleri
- **Açıklama**: Giriş yapan kullanıcıya atanmış ve açık durumdaki yerleştirme emirlerini listeler.
- **Parametreler**:
  - `PSCOMPANY` (*STRING*): Firma kodu (`"01"`).
  - `PSPLANT` (*STRING*): Tesis kodu (`"100"`).
  - `PSWORKER` (*STRING*): Giriş yapan kullanıcının adı.
  - `PISTATUS` (*INTEGER*): Filtre durumu (`3`).
  - `PIISPICK` (*INTEGER*): Yerleştirme bayrağı (`0`).
  - `PDSTARTDATE` (*DATETIME*): Başlangıç tarihi (`"01.01.1975"`).
  - `PDENDDATE` (*DATETIME*): Bitiş tarihi (`"01.01.2100"`).
  - `PIISDELETE` (*INTEGER*): Silinmişler hariç (`0`).
  - `PIISSTARTED` (*INTEGER*): Başlatılmış emirler (`1`).
  - `PIORDER` (*INTEGER*): Sıralama parametresi (`0`).
- **WMS İstemci Karşılığı**: `api.getPutawayOrders()`

### 2.3. `MZYEnterPlacement` — Yerleştirme Emrine Gir
- **Açıklama**: Seçilen yerleştirme emrinin detaylarını ve kalemlerini getirir.
- **Parametreler**:
  - `PSCOMPANY` (*STRING*): Firma kodu (`"01"`).
  - `PSPLANT` (*STRING*): Tesis kodu (`"100"`).
  - `PSORDERNUM` (*STRING*): Seçilen yerleştirme emri numarası.
  - `PSORDERTYPE` (*STRING*): Seçilen yerleştirme emri tipi.
- **WMS İstemci Karşılığı**: `api.enterPutaway(orderNum, orderType)`

### 2.4. `MZYCrtSuggestListPlacement` — Yerleştirme İçin Stok Yeri Önerisi Oluştur
- **Açıklama**: Seçilen yerleştirme emri kalemi için hedef stok yeri önerilerini getirir.
- **Parametreler**:
  - `PSCOMPANY` (*STRING*): Firma kodu (`"01"`).
  - `PSPLANT` (*STRING*): Tesis kodu (`"100"`).
  - `PSORDERNUM` (*STRING*): Seçilen yerleştirme emri numarası.
  - `PSORDERTYPE` (*STRING*): Seçilen yerleştirme emri tipi.
  - `PIITEMNO` (*INTEGER*): Seçilen yerleştirme emrinin kalem numarası.
- **WMS İstemci Karşılığı**: `api.suggestPlacementForLine(orderNum, orderType, itemNo)`

### 2.5. `MZYReadBarcodeSP` — Barkod Okut (Raf)
*(Bkz. 1.5)*

### 2.6. `MZYReadBarcode` — Barkod Okut (Malzeme)
*(Bkz. 1.6)*

### 2.7. `MZYClosePlacement` — Yerleştirmeden Vazgeç
- **Açıklama**: Devam eden yerleştirme işleminden vazgeçer.
- **Parametreler**:
  - `PSCOMPANY` (*STRING*): Firma kodu (`"01"`).
  - `PSPLANT` (*STRING*): Tesis kodu (`"100"`).
  - `PSORDERNUM` (*STRING*): Yerleştirme emri numarası.
  - `PSORDERTYPE` (*STRING*): Yerleştirme emri tipi.
- **WMS İstemci Karşılığı**: `api.cancelPutaway(orderNum, orderType)`

### 2.8. `MZYSavePlacement` — Yerleştirmeyi Sakla
- **Açıklama**: Yerleştirilen kalemi hedef depoya ve rafa saklar.
- **Parametreler**:
  - `PSCOMPANY` (*STRING*): Firma kodu (`"01"`).
  - `PSPLANT` (*STRING*): Tesis kodu (`"100"`).
  - `PSORDERNUM` (*STRING*): Yerleştirilen emrin numarası.
  - `PSORDERTYPE` (*STRING*): Yerleştirilen emrin tipi.
  - `PIITEMNO` (*INTEGER*): Yerleştirilen emrin sıra no'su.
  - `PSWAREHOUSE` (*STRING*): Yerleştirilen depo.
  - `PSSTOCKPLACE` (*STRING*): Yerleştirilen raf.
  - `PSMATERIAL` (*STRING*): Yerleştirilen malzeme.
  - `PSSPECIALSTOCK` (*STRING*): Özel stok tipi.
  - `PSBATCHNUM` (*STRING*): Parti numarası.
  - `PDCQUANTITY` (*DECIMAL*): Yerleştirilen miktar.
  - `PSUSER` (*STRING*): Yerleştirmeyi yapan kullanıcı.
  - `PDSTARTTIME` (*DATETIME/STRING*): Yerleştirmeye başlama zamanı.
- **WMS İstemci Karşılığı**: `api.savePlacement(input)`

---

## 3. Genel Destek ve Sorgulama Servisleri

### 3.1. `GetCompany` — Firmaları Getir
- **Açıklama**: CANIAS üzerindeki firma listesini döndürür.
- **Parametreler**: Yok (Parametresiz).
- **WMS İstemci Karşılığı**: `api.getCompanies()`

### 3.2. `GetPlant` — Tesisleri Getir
- **Açıklama**: Seçilen firmaya ait tesis listesini döndürür.
- **Parametreler**:
  - `PSCOMPANY` (*STRING*): Firma kodu (`"01"`).
- **WMS İstemci Karşılığı**: `api.getPlants()`

### 3.3. `GetWarehouse` — Depoları Getir
- **Açıklama**: Seçilen firma ve tesise ait depo listesini döndürür.
- **Parametreler**:
  - `PSCOMPANY` (*STRING*): Firma kodu (`"01"`).
  - `PSPLANT` (*STRING*): Tesis kodu (`"100"`).
- **WMS İstemci Karşılığı**: `api.getWarehouses()`

### 3.4. `GetStockPlace` — Stok Yerlerini (Rafları) Getir
- **Açıklama**: Depoya ait stok yeri / raf tanımlarını listeler.
- **Parametreler**:
  - `PSCOMPANY` (*STRING*): Firma kodu (`"01"`).
  - `PSPLANT` (*STRING*): Tesis kodu (`"100"`).
  - `PSWAREHOUSE` (*STRING*): Rafları istenen depo kodu.
- **WMS İstemci Karşılığı**: `api.getStockPlaces(warehouse)`

### 3.5. `MZYGetStock` — Stok Listesi ve Sorgulama
- **Açıklama**: Depo, raf, parti veya ürün bazlı anlık stok sorgulaması yapar.
- **Parametreler**:
  - `PSCOMPANY` (*STRING*): Firma kodu (`"01"`).
  - `PSPLANT` (*STRING*): Tesis kodu (`"100"`).
  - `PSMATERIAL` (*STRING*): Malzeme kodu (boş olabilir).
  - `PSWAREHOUSE` (*STRING*): Depo kodu (boş olabilir).
  - `PSSTOCKPLACE` (*STRING*): Stok yeri (boş olabilir).
  - `PSSPECIALSTOCK` (*STRING*): Özel stok tipi (boş olabilir).
  - `PSBATCHNUM` (*STRING*): Parti numarası (boş olabilir).
  - `PSVOPTIONS` (*STRING*): Seçenek kodu (boş olabilir).
  - `PSBARCODE` (*STRING*): Okutulan barkod (boş olabilir).
  - `PICONTAINER` (*INTEGER*): Konteynerleri de getir (`1` veya `0`).
  - `PIISPICKWH` (*INTEGER*): Sadece toplama depolarını getir (`1` varsayılan).
- **WMS İstemci Karşılığı**: `api.getStock(material, warehouse, stockPlace)`, `api.queryStock(opts)`

---

## 4. Etiket Basım Servisleri (Label Printing)

Tüm etiket basım servislerinde parametreler doğrudan servis üzerinden CANIAS proxy'ye iletilmektedir.

### 4.1. `MZYPrintContainer` — Konteyner / Palet / İrsaliye Etiketi Bas
- **Açıklama**: Palet, koli, paket veya irsaliye barkod etiketi basar.
- **Parametreler**:
  - `PSCOMPANY` (*STRING*): Firma kodu (`"01"`).
  - `PSPLANT` (*STRING*): Tesis kodu (`"100"`).
  - `PSCONTAINER` (*STRING*): Konteyner / Palet / İrsaliye numarası.
  - `PIREPEAT` (*INTEGER*): Tekrar / kopya sayısı (1 - 99).
  - `PSUSER` (*STRING*): Giriş yapan kullanıcı adı.
- **WMS İstemci Karşılığı**: `api.printContainer(payload)`

### 4.2. `MZYPrintWHSP` — Depo Raf Etiketi Bas
- **Açıklama**: Depo raf konumu barkod etiketi basar.
- **Parametreler**:
  - `PSCOMPANY` (*STRING*): Firma kodu (`"01"`).
  - `PSPLANT` (*STRING*): Tesis kodu (`"100"`).
  - `PSWAREHOUSE` (*STRING*): Depo kodu.
  - `PSSTOCKPLACE` (*STRING*): Stok yeri / raf numarası.
  - `PIREPEAT` (*INTEGER*): Tekrar / kopya sayısı (1 - 99).
  - `PSUSER` (*STRING*): Giriş yapan kullanıcı adı.
- **WMS İstemci Karşılığı**: `api.printWHSP(payload)`

### 4.3. `MZYPrintMaterial` — Ürün / Malzeme Barkod Etiketi Bas
- **Açıklama**: Ürün / malzeme EAN/UPC barkod etiketi basar.
- **Parametreler**:
  - `PSCOMPANY` (*STRING*): Firma kodu (`"01"`).
  - `PSPLANT` (*STRING*): Tesis kodu (`"100"`).
  - `PSBARCODE` (*STRING*): Malzeme kodu veya EAN barkod numarası.
  - `PSUNIT` (*STRING*): Birim (örn: `"AD"`).
  - `PIREPEAT` (*INTEGER*): Tekrar / kopya sayısı (1 - 99).
  - `PSUSER` (*STRING*): Giriş yapan kullanıcı adı.
- **WMS İstemci Karşılığı**: `api.printMaterial(payload)`

### 4.4. `MZYPrintBarcode` — SKT / Parti Barkod Etiketi Bas
- **Açıklama**: SKT ve parti numarası içeren barkod etiketi basar.
- **Parametreler**:
  - `PSCOMPANY` (*STRING*): Firma kodu (`"01"`).
  - `PSPLANT` (*STRING*): Tesis kodu (`"100"`).
  - `PSBARCODE` (*STRING*): Barkod / SKT / Parti bilgisi stringi.
  - `PIREPEAT` (*INTEGER*): Tekrar / kopya sayısı (1 - 99).
  - `PSUSER` (*STRING*): Giriş yapan kullanıcı adı.
- **WMS İstemci Karşılığı**: `api.printBarcode(payload)`

---

## 5. Mal Kabul Servisleri (Goods Receipt)

### 5.1. `MZYGetOpenOrder` — Açık Satın Alma Siparişleri Listesi
- **Açıklama**: Okutulan malzeme barkoduna ve opsiyonel tedarikçi koduna göre açık satın alma siparişlerini listeler.
- **Parametreler**:
  - `PSCOMPANY` (*STRING*): Firma kodu (`"01"`).
  - `PSPLANT` (*STRING*): Tesis kodu (`"100"`).
  - `PSBARCODE` (*STRING*): Malzeme barkodu.
  - `PSVENDOR` (*STRING*, Opsiyonel): Seçilen tedarikçinin numarası/kodu.
- **Dönen Tablo**: `PURORDERLIST` (İçinde `VENDOR` tedarikçi kodu, `NAME1` tedarikçi adı ve açık sipariş kalemleri döner).
- **WMS İstemci Karşılığı**: `api.getOpenOrders(barcode, vendor?)`

### 5.2. `MZYGetMaterial` — Malzeme Detayı, Barkod ve Ölçü Listesi
- **Açıklama**: Malzemenin detay kartını, bağlı barkod listesini, birimlerini ve ölçü/özellik bilgilerini getirir.
- **Parametreler**:
  - `PSCOMPANY` (*STRING*): Firma kodu (`"01"`).
  - `PSPLANT` (*STRING*): Tesis kodu (`"100"`).
  - `PSBARCODE` (*STRING*): Malzeme barkodu.
- **Dönen Tablolar**:
  - `MATLIST`: Malzeme genel detay listesi
  - `BARCODELIST`: Barkod listesi
  - `MATSIZE`: Ölçü, ağırlık ve güvenlik nitelikleri tablosu
- **WMS İstemci Karşılığı**: `api.getMaterialDetail(barcode)`

### 5.3. `MZYSetMatSize` — Malzeme Ölçü, Ağırlık ve Güvenlik Nitelikleri Güncelleme
- **Açıklama**: Malzemenin eksik veya sıfır olan en, boy, yükseklik, ağırlık, hacim, kırılabilirlik, yanıcılık gibi ölçü ve güvenlik niteliklerini kaydeder.
- **Parametreler**:
  - `PSCOMPANY` (*STRING*): Firma kodu (`"01"`).
  - `PSMATERIAL` (*STRING*): Malzeme kodu.
  - `VOLUME` (*DECIMAL*): Desi / Hacim (`(En × Boy × Yükseklik) / 3000`).
  - `VUNIT` (*STRING*): Hacim birimi (`"DS"` - Desi).
  - `PWIDTH` (*DECIMAL*): En / Genişlik.
  - `PLENGTH` (*DECIMAL*): Boy / Uzunluk.
  - `PHEIGHT` (*DECIMAL*): Yükseklik.
  - `NETWEIGHT` (*DECIMAL*): Net Ağırlık.
  - `NWUNIT` (*STRING*): Net Ağırlık birimi (`"KG"` veya `"GR"`).
  - `BRUTWEIGHT` (*DECIMAL*): Brüt Ağırlık.
  - `BWUNIT` (*STRING*): Brüt Ağırlık birimi (`"KG"` veya `"GR"`).
  - `ISEXPLOS` (*INTEGER*): Tehlikeli / Yanıcı Madde (`0` / `1`).
  - `ISSPOIL` (*INTEGER*): Bozulabilir (`0` / `1`).
  - `AKLISBREAKABLE` (*INTEGER*): Kırılabilir (`0` / `1`).
  - `AKLISLIQUID` (*INTEGER*): Sıvı (`0` / `1`).
  - `AKLISTOXIC` (*INTEGER*): Zehirli / Kimyasal (`0` / `1`).
  - `AKLPALPOS` (*INTEGER*): Palet Pozisyonu (`1`).
### 5.4. `MzyGetCustomer` — Tedarikçi / Müşteri Arama Servisi
- **Açıklama**: Tedarikçi adı veya kodu ile CANIAS veritabanından tedarikçileri listeler.
- **Parametreler**:
  - `PSCOMPANY` (*STRING*): Firma kodu (`"01"`).
  - `PSCUSTOMER` (*STRING*, Opsiyonel): Tedarikçi/Müşteri numarası/kodu.
  - `PSCUSNAME1` (*STRING*, Opsiyonel): Tedarikçi/Müşteri adı/unvanı.
  - `PICUSTYPE` / `PSCUSTYPE` (*INTEGER*): Müşteri/Tedarikçi tipi (`0`: Hepsi, `1`: Tedarikçi, `2`: Müşteri). Mal Kabul için `1` gönderilir.
- **WMS İstemci Karşılığı**: `api.getCustomers(payload)`

### 5.5. `MZYSaveReceipt` — Mal Kabul Tamamlama ve Saklama Servisi
- **Açıklama**: Kabul edilen sipariş kalemlerini, irsaliye numarası, depo, stok yeri, başlama zamanı ve kalem bilgileriyle CANIAS satın alma/irsaliye kaydına dönüştürür.
- **Parametreler**:
  - `PSCOMPANY` (*STRING*): Firma kodu (`"01"`).
  - `PSPLANT` (*STRING*): Tesis kodu (`"100"`).
  - `PSVENDOR` (*STRING*): Tedarikçi kodu (Örn: `"16660"`).
  - `PSEXTDELNUM` (*STRING*): İrsaliye numarası.
  - `PSWAREHOUSE` (*STRING*): Mal Kabul yapılan depo kodu (Örn: `"00"` veya `"D1"`). Raf barkodu (`00$*`) girildiğinde depo ayrıştırılarak `"00"` gönderilir.
  - `PSSTOCKPLACE` (*STRING*): Mal Kabul yapılan stok yeri (Örn: `"*"` veya `"R1"`).
  - `PSUSER` (*STRING*): Login olan kullanıcı adı.
  - `PDTSTARTTIME` (*DATETIME*): Mal kabule başlama zamanı.
  - `PSIASPURITEMXML` (*TABLE / XML*): Kabul edilen malzemeler listesi:
    - `MATERIAL` (*STRING*): Malzeme Kodu.
    - `SPECIALSTOCK` (*STRING*): Özel Stok Tipi (`"0"`, `"1"` vb.).
    - `BATCHNUM` (*STRING*): Parti No (Stok Birimi bazında).
    - `READQUANTITY` (*DECIMAL*): Kabul Edilen Miktar (Stok Birimi bazında).
    - `QUNIT` (*STRING*): Kabul Edilen Miktar Birimi (`"AD"`, `"KO"`, `"KT"`).
    - `ORDERTYPE` (*STRING*): Satınalma Sipariş Belge Tipi (`"OP"` vb.).
    - `ORDERNUM` (*STRING*): Satınalma Sipariş Belge No.
    - `ITEMNUM` (*INTEGER*): Satınalma Sipariş Kalem No.
- **WMS İstemci Karşılığı**: `api.saveReceipt(payload)`

---

## 6. Stok Transfer Servisleri (Stock Transfer)

### 6.1. `MZYStockTransfer` — Malzemeleri Transfer Etme
- **Açıklama**: Kaynak depo ve stok yerinden hedef depo ve stok yerine malzeme/parti transferi gerçekleştirir.
- **Parametreler**:
  - `PSCOMPANY` (*STRING*): Firma kodu (`"01"`).
  - `PSPLANT` (*STRING*): Tesis kodu (`"100"`).
  - `PSSRCWAREHOUSE` (*STRING*): Transfer edilen malzemenin alındığı depo.
  - `PSSRCSTOCKPLACE` (*STRING*): Transfer edilen malzemenin alındığı stok yeri / raf.
  - `PSUSER` (*STRING*): Login olan kullanıcı kodu.
  - `PSTARWAREHOUSE` (*STRING*): Transfer edilen malzemenin konulduğu yeni depo.
  - `PSTARSTOCKPLACE` (*STRING*): Transfer edilen malzemenin konulduğu yeni stok yeri / raf.
  - `PSTRANSFERTABLEXML` (*TABLE / XML*): Transfer edilen malzemelerin bilgileri:
    - `MATERIAL` (*STRING*): Malzeme Kodu.
    - `SPECIALSTOCK` (*STRING*): Özel Stok Tipi (`"1"` = Partili, `"*"` = Partisiz).
    - `BATCHNUM` (*STRING*): Parti No (Partisiz ise `"*"`).
    - `QUANTITY` (*DECIMAL*): Transfer Edilen Miktar (Stok Birimi bazında).
    - `QUNIT` (*STRING*): Birim (Stok Birimi bazında, örn: `"AD"`).
- **Dönen Değer**: `TRANSFERID` / `DOCNUM` (Transfer Belge Numarası) ve `SYSTEMMSG`.
- **WMS İstemci Karşılığı**: `api.createStockTransfer(payload)`

---

## 7. Sayım Servisleri (Stock Count / Adjustment)

### 7.1. `MZYListingAdjustment` — Sayım Belgelerini Listele
- **Açıklama**: Açık sayım belgelerini listeler.
- **Parametreler**:
  - `PSCOMPANY` (*STRING*): Firma kodu (`"01"`).
  - `PSPLANT` (*STRING*): Tesis kodu (`"100"`).
  - `PDSTARTDATE` (*DATETIME / DATE*): Başlangıç Tarihi.
  - `PDENDDATE` (*DATETIME / DATE*): Bitiş Tarihi.
  - `PITRACESTATUS` (*INTEGER*): Trace Durumu (Öndeğer `0` gönderilecek).
- **WMS İstemci Karşılığı**: `api.getAdjustmentList(params?)`

### 7.2. `MZYEnterAdjustment` — Sayım Emrine Gir
- **Açıklama**: Seçilen sayım emrinin detaylarını ve sayılacak kalemlerini getirir.
- **Parametreler**:
  - `PSCOMPANY` (*STRING*): Firma kodu (`"01"`).
  - `PSPLANT` (*STRING*): Tesis kodu (`"100"`).
  - `WAREHOUSE` (*STRING*): Depo kodu.
  - `PSORDERNUM` (*STRING*): Sipariş / Sayım Belge Numarası.
  - `PSORDERTYPE` (*STRING*): Sipariş / Sayım Belge Tipi.
  - `PSUSER` (*STRING*): Giriş yapan kullanıcı adı.
  - `PITRACESTATUS` (*INTEGER*): Trace Durumu (Öndeğer `0` gönderilecek).
- **WMS İstemci Karşılığı**: `api.getAdjustmentOrder(orderNum, orderType, warehouse)`

---

## 8. Özet Tablo: Servis İsimleri ve Kullanım Yerleri

| Servis Adı | CANIAS Servisi | İstemci Metodu | Dosya Konumu |
| :--- | :--- | :--- | :--- |
| **Kullanıcı Doğrulama** | `MZYCheckUser` | `api.checkUser` | `src/api/client.ts` |
| **Toplama Listesi** | `MZYListingPick` | `api.getPickOrders` | `src/api/client.ts` |
| **Toplama Emri Giriş** | `MZYEnterPick` | `api.getPickOrder` | `src/api/client.ts` |
| **Toplama Önerisi** | `MZYCrtSuggestListPickFromSP` | `api.suggestForLine` | `src/api/client.ts` |
| **Raf Barkod Okutma** | `MZYReadBarcodeSP` | `api.readShelfBarcode` | `src/api/client.ts` |
| **Malzeme Barkod Okutma** | `MZYReadBarcode` | `api.readBarcode` | `src/api/client.ts` |
| **Palet/Konteyner Oluştur** | `MZYCreateContainer` | `api.placeInPackage` | `src/api/client.ts` |
| **Toplama Vazgeç** | `MZYClosePick` | `api.cancelPick` | `src/api/client.ts` |
| **Toplama Sakla** | `MZYSavePick` | `api.savePick` | `src/api/client.ts` |
| **Yerleştirme Listesi** | `MZYListingPlacement` | `api.getPutawayOrders` | `src/api/client.ts` |
| **Yerleştirme Giriş** | `MZYEnterPlacement` | `api.enterPutaway` | `src/api/client.ts` |
| **Yerleştirme Önerisi** | `MZYCrtSuggestListPlacement` | `api.suggestPlacementForLine` | `src/api/client.ts` |
| **Yerleştirme Vazgeç** | `MZYClosePlacement` | `api.cancelPutaway` | `src/api/client.ts` |
| **Yerleştirme Sakla** | `MZYSavePlacement` | `api.savePlacement` | `src/api/client.ts` |
| **Firma Listesi** | `GetCompany` | `api.getCompanies` | `src/api/client.ts` |
| **Tesis Listesi** | `GetPlant` | `api.getPlants` | `src/api/client.ts` |
| **Depo Listesi** | `GetWarehouse` | `api.getWarehouses` | `src/api/client.ts` |
| **Stok Yeri Listesi** | `GetStockPlace` | `api.getStockPlaces` | `src/api/client.ts` |
| **Stok Sorgulama** | `MZYGetStock` | `api.getStock`, `api.queryStock` | `src/api/client.ts` |
| **Konteyner Etiket Bas** | `MZYPrintContainer` | `api.printContainer` | `src/api/client.ts` |
| **Raf Etiket Bas** | `MZYPrintWHSP` | `api.printWHSP` | `src/api/client.ts` |
| **Ürün Etiket Bas** | `MZYPrintMaterial` | `api.printMaterial` | `src/api/client.ts` |
| **SKT Etiket Bas** | `MZYPrintBarcode` | `api.printBarcode` | `src/api/client.ts` |
| **Açık Sipariş Listesi** | `MZYGetOpenOrder` | `api.getOpenOrders` | `src/api/client.ts` |
| **Malzeme Detayı & Ölçü** | `MZYGetMaterial` | `api.getMaterialDetail` | `src/api/client.ts` |
| **Malzeme Ölçü Kaydı** | `MzySetMatSize` | `api.setMatSize` | `src/api/client.ts` |
| **Tedarikçi Arama** | `MzyGetCustomer` | `api.getCustomers` | `src/api/client.ts` |
| **Mal Kabul Sakla / Bitir** | `MZYSAVEINVPURORDER` | `api.saveReceipt` | `src/api/client.ts` |
| **Serbest Stok Transferi** | `MZYStockTransfer` | `api.createStockTransfer` | `src/api/client.ts` |
| **Sayım Belgeleri Listesi** | `MZYListingAdjustment` | `api.getAdjustmentList` | `src/api/client.ts` |
| **Sayım Emri Giriş** | `MZYEnterAdjustment` | `api.getAdjustmentOrder` | `src/api/client.ts` |
