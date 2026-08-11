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

## 5. Özet Tablo: Servis İsimleri ve Kullanım Yerleri

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
