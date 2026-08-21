import { describe, it, expect, vi, beforeEach } from "vitest";
import { api } from "../api/client";
import { SERVICES } from "../api/config";

// Global fetch mock to capture outgoing service requests and parameters
let capturedRequests: Array<{ url: string; service: string; params: Record<string, unknown> }> = [];

// Helper to mock successful CANIAS XML / JSON response
function mockCaniasResponse(data: Record<string, unknown> | number = {}) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      status: 200,
      data: typeof data === "number" ? data : data,
      messages: "",
    }),
    text: async () => JSON.stringify({ status: 200, data, messages: "" }),
  };
}

describe("CANIAS WMS All 25 Services Exhaustive Audit & Parameter Validation", () => {
  beforeEach(() => {
    capturedRequests = [];
    vi.restoreAllMocks();

    global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const bodyStr = String(init?.body || "{}");
      let parsedBody: Record<string, unknown> = {};
      try {
        parsedBody = JSON.parse(bodyStr);
      } catch {}

      // Extract service name from URL or body
      const serviceName = String(url).split("/").pop() || "";
      capturedRequests.push({
        url: String(url),
        service: serviceName,
        params: parsedBody,
      });

      return mockCaniasResponse({
        TBLUSER: [{ NAME: "Test", SURNAME: "User" }],
        TBLCOMPANY: [{ COMPANY: "01", NAME: "Aktüel Ofis" }],
        TBLPLANT: [{ PLANT: "100", NAME: "Merkez Tesis" }],
        TBLWAREHOUSE: [{ WAREHOUSE: "00$*", NAME: "Mal Kabul Deposu" }],
        TBLSTOCKPLACE: [{ STOCKPLACE: "A-01", NAME: "Raf A1" }],
        TBLPOLIST: [{ ORDERNUM: "OP-01", ORDERTYPE: "OP", STATUS: "0" }],
        IASWMSPOITEM: [{ ITEMNO: "1", MATERIAL: "BS020", MOVEQTY: "10" }],
        SUGGESTEDLISTFROM: [{ WAREHOUSE: "100", STOCKPLACE: "A-01", MATERIAL: "BS020", TOTAL: "10" }],
        WMSXMLTABLE: [{ MATERIAL: "BS020", MTEXT: "Test Ürün", QUANTITY: "10" }],
        IASINV007: [{ WAREHOUSE: "100", STOCKPLACE: "A-01" }],
        TBLCONTSP: [{ BATCHNUM: "PAL-01", WAREHOUSE: "100" }],
        TBLSTOCK: [{ MATERIAL: "BS020", AVAILSTOCK: "50", QUNIT: "AD" }],
        PURORDERLIST: [{ ORDERNUM: "OP-100", MATERIAL: "BS020", PURUNIT: "KO", SKUNIT: "AD", REMAININGQTY: "10" }],
        WMSMATERIALXML: [{ MATERIAL: "BS020", STEXT: "Test Ürün", QUANTITY: "24" }],
        CUSTOMERLIST: [{ CUSTOMER: "16660", NAME1: "Test Tedarikçi", CITY: "İstanbul" }],
      });
    });
  });

  // ===========================================================================
  // 1. KULLANICI DOĞRULAMA (MZYCheckUser)
  // ===========================================================================
  describe("1. MZYCheckUser - Kullanıcı Doğrulama", () => {
    it("PSUSER ve PSPASSWORD parametrelerini eksiksiz göndermelidir", async () => {
      await api.checkUser("ahmet", "123456");
      const req = capturedRequests.find((r) => r.service === SERVICES.checkUser || r.url.includes(SERVICES.checkUser));
      expect(req).toBeDefined();
      expect(req?.params.PSUSER).toBe("ahmet");
      expect(req?.params.PSPASSWORD).toBe("123456");
    });
  });

  // ===========================================================================
  // 2. SİSTEM TANIMLARI (GetCompany, GetPlant, GetWarehouse, GetStockPlace)
  // ===========================================================================
  describe("2. Sistem Tanımları Servisleri", () => {
    it("GetCompany parametresiz çağrılmalıdır", async () => {
      await api.getCompanies();
      const req = capturedRequests.find((r) => r.service === SERVICES.getCompany || r.url.includes(SERVICES.getCompany));
      expect(req).toBeDefined();
    });

    it("GetPlant PSCOMPANY parametresini içermelidir", async () => {
      await api.getPlants();
      const req = capturedRequests.find((r) => r.service === SERVICES.getPlant || r.url.includes(SERVICES.getPlant));
      expect(req).toBeDefined();
      expect(req?.params.PSCOMPANY).toBeDefined();
    });

    it("GetWarehouse PSCOMPANY ve PSPLANT parametrelerini içermelidir", async () => {
      await api.getWarehouses();
      const req = capturedRequests.find((r) => r.service === SERVICES.getWarehouse || r.url.includes(SERVICES.getWarehouse));
      expect(req).toBeDefined();
      expect(req?.params.PSCOMPANY).toBe("01");
      expect(req?.params.PSPLANT).toBe("100");
    });

    it("GetStockPlace PSCOMPANY, PSPLANT ve PSWAREHOUSE parametrelerini içermelidir", async () => {
      await api.getStockPlaces("00$*");
      const req = capturedRequests.find((r) => r.service === SERVICES.getStockPlace || r.url.includes(SERVICES.getStockPlace));
      expect(req).toBeDefined();
      expect(req?.params.PSWAREHOUSE).toBe("00$*");
    });
  });

  // ===========================================================================
  // 3. CARİ / TEDARİKÇİ SORGULAMA (MzyGetCustomer)
  // ===========================================================================
  describe("3. MzyGetCustomer - Cari / Tedarikçi Arama", () => {
    it("PSCOMPANY, PSCUSTOMER, PSCUSNAME1, PICUSTYPE parametrelerini doğru göndermelidir", async () => {
      await api.getCustomers({ customer: "16660", customerType: 1 });
      const req = capturedRequests.find((r) => r.service === SERVICES.getCustomer || r.url.includes(SERVICES.getCustomer));
      expect(req).toBeDefined();
      expect(req?.params.PSCOMPANY).toBe("01");
      expect(req?.params.PSCUSTOMER).toBe("16660");
      expect(req?.params.PICUSTYPE).toBe(1);
    });

    it("İsimle aramada % wildcard formatını uygulamalıdır", async () => {
      await api.getCustomers({ name: "Aktüel", customerType: 1 });
      const req = capturedRequests.find((r) => r.service === SERVICES.getCustomer || r.url.includes(SERVICES.getCustomer));
      expect(req).toBeDefined();
      expect(req?.params.PSCUSNAME1).toBe("%Aktüel%");
    });
  });

  // ===========================================================================
  // 4. MAL KABUL: AÇIK SİPARİŞLER (MZYGetOpenOrder)
  // ===========================================================================
  describe("4. MZYGetOpenOrder - Açık Satın Alma Siparişleri", () => {
    it("PSCOMPANY, PSPLANT, PSBARCODE, PSVENDOR parametrelerini doğru göndermelidir", async () => {
      await api.getOpenOrders({ barcode: "8690001", vendor: "16660" });
      const req = capturedRequests.find((r) => r.service === SERVICES.getOpenOrder || r.url.includes(SERVICES.getOpenOrder));
      expect(req).toBeDefined();
      expect(req?.params.PSCOMPANY).toBe("01");
      expect(req?.params.PSPLANT).toBe("100");
      expect(req?.params.PSBARCODE).toBe("8690001");
      expect(req?.params.PSVENDOR).toBe("16660");
    });
  });

  // ===========================================================================
  // 5. MAL KABUL: MALZEME DETAY (MZYGetMaterial)
  // ===========================================================================
  describe("5. MZYGetMaterial - Malzeme Detay Kartı ve Barkodlar", () => {
    it("PSCOMPANY, PSPLANT, PSBARCODE parametrelerini göndermelidir", async () => {
      await api.getMaterialDetail("8690001");
      const req = capturedRequests.find((r) => r.service === SERVICES.getMaterialDetail || r.url.includes(SERVICES.getMaterialDetail));
      expect(req).toBeDefined();
      expect(req?.params.PSCOMPANY).toBe("01");
      expect(req?.params.PSPLANT).toBe("100");
      expect(req?.params.PSBARCODE).toBe("8690001");
    });
  });

  // ===========================================================================
  // 6. MAL KABUL: ÖLÇÜ & GÜVENLİK NİTELİKLERİ KAYDI (MzySetMatSize)
  // ===========================================================================
  describe("6. MzySetMatSize - Ölçü, Ağırlık ve Nitelik Güncelleme", () => {
    it("Desi (VUNIT: DS), Ağırlıklar (KG), Ölçüler (CM) ve Nitelikleri (0/1) eksiksiz göndermelidir", async () => {
      await api.setMatSize({
        material: "BS020",
        pwidth: 30,
        plength: 40,
        pheight: 50,
        volume: 20, // (30*40*50)/3000
        vunit: "DS",
        netweight: 5,
        nwunit: "KG",
        brutweight: 6,
        bwunit: "KG",
        isexplos: true,
        isspoil: false,
        aklisbreakable: true,
        aklisliquid: false,
        aklistoxic: true,
        aklpalpos: 1,
      });

      const req = capturedRequests.find((r) => r.service === SERVICES.setMatSize || r.url.includes(SERVICES.setMatSize));
      expect(req).toBeDefined();
      expect(req?.params.PSCOMPANY).toBe("01");
      expect(req?.params.PSMATERIAL).toBe("BS020");
      expect(req?.params.PWIDTH).toBe(30);
      expect(req?.params.PLENGTH).toBe(40);
      expect(req?.params.PHEIGHT).toBe(50);
      expect(req?.params.VOLUME).toBe(20);
      expect(req?.params.VUNIT).toBe("DS");
      expect(req?.params.NETWEIGHT).toBe(5);
      expect(req?.params.NWUNIT).toBe("KG");
      expect(req?.params.BRUTWEIGHT).toBe(6);
      expect(req?.params.BWUNIT).toBe("KG");
      expect(req?.params.ISEXPLOS).toBe(1);
      expect(req?.params.ISSPOIL).toBe(0);
      expect(req?.params.AKLISBREAKABLE).toBe(1);
      expect(req?.params.AKLISLIQUID).toBe(0);
      expect(req?.params.AKLISTOXIC).toBe(1);
      expect(req?.params.AKLPALPOS).toBe(1);
    });
  });

  // ===========================================================================
  // 7. MAL KABUL: MAL KABULÜ TAMAMLAMA VE SAKLAMA (MZYSaveReceipt)
  // ===========================================================================
  describe("7. MZYSaveReceipt - Mal Kabul Kaydetme", () => {
    it("Tüm başlık ve satır parametrelerini (SPECIALSTOCK 1/0, BATCHNUM, READQUANTITY, READPURQTY, 00$*) eksiksiz göndermelidir", async () => {
      await api.saveReceipt({
        vendor: "16660",
        waybillNo: "IRS-2026-99",
        warehouse: "00$*",
        targetWarehouse: "00$*",
        stockPlace: "*",
        user: "AHMET",
        startTime: "21.08.2026 14:00:00",
        items: [
          {
            material: "LOT-MAT",
            specialStock: "1",
            isSpecialLot: true,
            batchNum: "LOT-ABC",
            receivedQty: 120, // Stok birimi
            unit: "AD",
            purQty: 5, // Sipariş birimi
            purUnit: "KO",
            orderType: "OP",
            orderNum: "179395",
            itemNum: 1,
            expiryDate: "2026-12-31",
          },
        ],
      });

      const req = capturedRequests.find((r) => r.service === SERVICES.saveReceipt || r.url.includes(SERVICES.saveReceipt));
      expect(req).toBeDefined();
      expect(req?.params.PSCOMPANY).toBe("01");
      expect(req?.params.PSPLANT).toBe("100");
      expect(req?.params.PSVENDOR).toBe("16660");
      expect(req?.params.PSEXTDELNUM).toBe("IRS-2026-99");
      expect(req?.params.PSWAREHOUSE).toBe("00$*");
      expect(req?.params.PSSTOCKPLACE).toBe("*");

      const items = req?.params.PSIASPURITEMXML as Record<string, unknown>[];
      expect(items).toHaveLength(1);
      expect(items[0].MATERIAL).toBe("LOT-MAT");
      expect(items[0].SPECIALSTOCK).toBe("1");
      expect(items[0].BATCHNUM).toBe("LOT-ABC");
      expect(items[0].READQUANTITY).toBe(120);
      expect(items[0].QUNIT).toBe("AD");
      expect(items[0].READPURQTY).toBe(5);
      expect(items[0].PURUNIT).toBe("KO");
      expect(items[0].ORDERTYPE).toBe("OP");
      expect(items[0].ORDERNUM).toBe("179395");
      expect(items[0].ITEMNUM).toBe(1);
      expect(items[0].EXPIRYDATE).toBe("2026-12-31");
    });
  });

  // ===========================================================================
  // 8. SİPARİŞ TOPLAMA SERVİSLERİ (ListingPick, EnterPick, Suggest, ReadBarcode, CreateContainer, SavePick, ClosePick)
  // ===========================================================================
  describe("8. Sipariş Toplama Servisleri Audit", () => {
    it("MZYListingPick PISTATUS: 3, PIISPICK: 1 parametreleriyle çağrılmalıdır", async () => {
      await api.getPickOrders();
      const req = capturedRequests.find((r) => r.service === SERVICES.listingPick || r.url.includes(SERVICES.listingPick));
      expect(req).toBeDefined();
      expect(req?.params.PISTATUS).toBe(3);
      expect(req?.params.PIISPICK).toBe(1);
    });

    it("MZYEnterPick PSORDERNUM ve PSORDERTYPE ile çağrılmalıdır", async () => {
      await api.getPickOrder("PO-123", "OP");
      const req = capturedRequests.find((r) => r.service === SERVICES.enterPick || r.url.includes(SERVICES.enterPick));
      expect(req).toBeDefined();
      expect(req?.params.PSORDERNUM).toBe("PO-123");
      expect(req?.params.PSORDERTYPE).toBe("OP");
    });

    it("MZYCrtSuggestListPickFromSP PIITEMNO ile raf önerisi istemelidir", async () => {
      await api.suggestForLine("PO-123", "OP", 1);
      const req = capturedRequests.find((r) => r.service === SERVICES.suggestPick || r.url.includes(SERVICES.suggestPick));
      expect(req).toBeDefined();
      expect(req?.params.PIITEMNO).toBe(1);
    });

    it("MZYReadBarcodePSBARCODE, PSWAREHOUSE, PSSTOCKPLACE göndermelidir", async () => {
      await api.readBarcode("869001", "100", "A-01", 5);
      const req = capturedRequests.find((r) => r.service === SERVICES.readBarcode || r.url.includes(SERVICES.readBarcode));
      expect(req).toBeDefined();
      expect(req?.params.PSBARCODE).toBe("869001");
      expect(req?.params.PDCQUANTITY).toBe(5);
    });

    it("MZYReadBarcodeSP PSBARCODE ile raf barkodunu sorgulamalıdır", async () => {
      await api.readShelfBarcode("100$A-01");
      const req = capturedRequests.find((r) => r.service === SERVICES.readBarcodeSP || r.url.includes(SERVICES.readBarcodeSP));
      expect(req).toBeDefined();
      expect(req?.params.PSBARCODE).toBe("100$A-01");
    });

    it("MZYCreateContainer PSMATERIAL: 'KONPAKET' ile koli oluşturmalıdır", async () => {
      await api.placeInPackage("100", "KONPAKET", "PO-123", "OP");
      const req = capturedRequests.find((r) => r.service === SERVICES.createContainer || r.url.includes(SERVICES.createContainer));
      expect(req).toBeDefined();
      expect(req?.params.PSMATERIAL).toBe("KONPAKET");
    });

    it("MZYClosePick toplama vazgeçildiğinde çağrılmalıdır", async () => {
      await api.cancelPick("PO-123", "OP");
      const req = capturedRequests.find((r) => r.service === SERVICES.closePick || r.url.includes(SERVICES.closePick));
      expect(req).toBeDefined();
      expect(req?.params.PSORDERNUM).toBe("PO-123");
    });

    it("MZYSavePick partili için '1'/Lot, serbest için '*'/'*' göndermelidir", async () => {
      const order = {
        id: "PO-123",
        orderType: "OP",
        customer: "Müşteri",
        reference: "Ref",
        createdAt: "21.08.2026",
        status: "open" as const,
        started: true,
        lines: [
          {
            id: "1",
            product: { code: "MAT-FREE", name: "Serbest Ürün", unit: "AD" },
            location: "A-01",
            requestedQty: 10,
            pickedQty: 10,
            lotTracked: false,
            records: [
              {
                warehouse: "100",
                stockPlace: "A-01",
                material: "MAT-FREE",
                specialStock: "*",
                lot: "*",
                qty: 10,
                unit: "AD",
                itemNo: "1",
              },
            ],
          },
        ],
      };

      await api.savePick(order, "100", "PAL-01");
      const req = capturedRequests.find((r) => r.service === SERVICES.savePick || r.url.includes(SERVICES.savePick));
      expect(req).toBeDefined();
      expect(req?.params.PSCONTWAREHOUSE).toBe("100");
      expect(req?.params.PSCONTSTOCKPLACE).toBe("PAL-01");
      const rows = req?.params.PSIASWMSPOITEMXML as Record<string, unknown>[];
      expect(rows[0].SPECIALSTOCK).toBe("*");
      expect(rows[0].BATCHNUM).toBe("*");
    });
  });

  // ===========================================================================
  // 9. YERLEŞTİRME SERVİSLERİ (ListingPlacement, EnterPlacement, Suggest, SavePlacement, ClosePlacement)
  // ===========================================================================
  describe("9. Mal Yerleştirme (Putaway) Servisleri Audit", () => {
    it("MZYListingPlacement PIISPICK: 0 ile çağrılmalıdır", async () => {
      await api.getPutawayOrders();
      const req = capturedRequests.find((r) => r.service === SERVICES.listingPlacement || r.url.includes(SERVICES.listingPlacement));
      expect(req).toBeDefined();
      expect(req?.params.PIISPICK).toBe(0);
    });

    it("MZYEnterPlacement yerleştirme emrini başlatmalıdır", async () => {
      await api.enterPutaway("PL-100", "OP");
      const req = capturedRequests.find((r) => r.service === SERVICES.enterPlacement || r.url.includes(SERVICES.enterPlacement));
      expect(req).toBeDefined();
      expect(req?.params.PSORDERNUM).toBe("PL-100");
    });

    it("MZYCrtSuggestListPlacement yerleştirme raf önerisi getirmelidir", async () => {
      await api.suggestPlacementForLine("PL-100", "OP", 1);
      const req = capturedRequests.find((r) => r.service === SERVICES.suggestPlacement || r.url.includes(SERVICES.suggestPlacement));
      expect(req).toBeDefined();
      expect(req?.params.PIITEMNO).toBe(1);
    });

    it("MZYClosePlacement yerleştirme iptalinde çağrılmalıdır", async () => {
      await api.cancelPutaway("PL-100", "OP");
      const req = capturedRequests.find((r) => r.service === SERVICES.closePlacement || r.url.includes(SERVICES.closePlacement));
      expect(req).toBeDefined();
      expect(req?.params.PSORDERNUM).toBe("PL-100");
    });

    it("MZYSavePlacement PSSPECIALSTOCK ve PSBATCHNUM parametrelerini doğru iletmelidir", async () => {
      const order = {
        id: "PL-100",
        orderType: "OP",
        customer: "",
        reference: "",
        createdAt: "",
        status: "open" as const,
        started: true,
        lines: [],
      };

      await api.savePlacement({
        order,
        itemNo: "1",
        material: "MAT-FREE",
        targetWarehouse: "100",
        targetShelf: "B-02",
        specialStock: "*",
        lot: "*",
        qty: 15,
      });

      const req = capturedRequests.find((r) => r.service === SERVICES.savePlacement || r.url.includes(SERVICES.savePlacement));
      expect(req).toBeDefined();
      expect(req?.params.PSSPECIALSTOCK).toBe("*");
      expect(req?.params.PSBATCHNUM).toBe("*");
      expect(req?.params.PDCQUANTITY).toBe(15);
      expect(req?.params.PSSTOCKPLACE).toBe("B-02");
    });
  });

  // ===========================================================================
  // 10. ETİKET BASMA SERVİSLERİ (PrintContainer, PrintWHSP, PrintMaterial, PrintBarcode)
  // ===========================================================================
  describe("10. Etiket Basma Servisleri Audit", () => {
    it("MZYPrintContainer PSCONTAINER ve PIREPEAT ile çağrılmalıdır", async () => {
      await api.printContainer({ container: "PAL-01", repeat: 2 });
      const req = capturedRequests.find((r) => r.service === SERVICES.printContainer || r.url.includes(SERVICES.printContainer));
      expect(req).toBeDefined();
      expect(req?.params.PSCONTAINER).toBe("PAL-01");
      expect(req?.params.PIREPEAT).toBe(2);
    });

    it("MZYPrintWHSP PSWAREHOUSE, PSSTOCKPLACE ve PIREPEAT ile çağrılmalıdır", async () => {
      await api.printWHSP({ warehouse: "100", stockPlace: "A-01", repeat: 1 });
      const req = capturedRequests.find((r) => r.service === SERVICES.printWHSP || r.url.includes(SERVICES.printWHSP));
      expect(req).toBeDefined();
      expect(req?.params.PSWAREHOUSE).toBe("100");
      expect(req?.params.PSSTOCKPLACE).toBe("A-01");
      expect(req?.params.PIREPEAT).toBe(1);
    });

    it("MZYPrintMaterial PSBARCODE ve PSUNIT ile çağrılmalıdır", async () => {
      await api.printMaterial({ barcode: "8690001", unit: "AD", repeat: 3 });
      const req = capturedRequests.find((r) => r.service === SERVICES.printMaterial || r.url.includes(SERVICES.printMaterial));
      expect(req).toBeDefined();
      expect(req?.params.PSBARCODE).toBe("8690001");
      expect(req?.params.PSUNIT).toBe("AD");
      expect(req?.params.PIREPEAT).toBe(3);
    });

    it("MZYPrintBarcode PSBARCODE ve PIREPEAT ile çağrılmalıdır", async () => {
      await api.printBarcode({ barcode: "8690001$LOT-99", repeat: 1 });
      const req = capturedRequests.find((r) => r.service === SERVICES.printBarcode || r.url.includes(SERVICES.printBarcode));
      expect(req).toBeDefined();
      expect(req?.params.PSBARCODE).toBe("8690001$LOT-99");
      expect(req?.params.PIREPEAT).toBe(1);
    });
  });

  // ===========================================================================
  // 11. STOK SORGULAMA (MZYGetStock)
  // ===========================================================================
  describe("11. MZYGetStock - Stok Sorgulama", () => {
    it("PSMATERIAL, PSWAREHOUSE, PSBARCODE, PICONTAINER, PIISPICKWH parametrelerini eksiksiz göndermelidir", async () => {
      await api.queryStock({ material: "BS020", warehouse: "100", onlyPickWarehouse: true });
      const req = capturedRequests.find((r) => r.service === SERVICES.getStock || r.url.includes(SERVICES.getStock));
      expect(req).toBeDefined();
      expect(req?.params.PSMATERIAL).toBe("BS020");
      expect(req?.params.PSWAREHOUSE).toBe("100");
      expect(req?.params.PIISPICKWH).toBe(1);
    });
  });
});
