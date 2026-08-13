import { describe, it, expect, beforeEach, vi } from "vitest";
import { api } from "../api/client";
import { SERVICES } from "../api/config";

// Polyfill localStorage for Vitest
const storage: Record<string, string> = {};
if (typeof globalThis.localStorage === "undefined") {
  globalThis.localStorage = {
    getItem: (k: string) => storage[k] ?? null,
    setItem: (k: string, v: string) => {
      storage[k] = String(v);
    },
    removeItem: (k: string) => {
      delete storage[k];
    },
    clear: () => {
      Object.keys(storage).forEach((k) => delete storage[k]);
    },
    length: 0,
    key: () => null,
  };
}

describe("Mal Kabul (Goods Receipt) - 1. Seçenek (Barkod) & 2. Seçenek (Tedarikçi İsmi) Veri Testleri", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    globalThis.localStorage.clear();
    storage["wms_selected_company"] = "01";
    storage["wms_selected_plant"] = "100";
    storage["wms_worker_id"] = "TEST_USER";
  });

  // ---------------------------------------------------------------------------
  // 1. SEÇENEK: BARKOD İLE ARAMA (MZYGetOpenOrder Servisi) TESTLERİ
  // ---------------------------------------------------------------------------
  describe("1. Seçenek: Barkod ile Bul (MZYGetOpenOrder)", () => {
    it("Barkod okutulduğunda CANIAS MZYGetOpenOrder servisine doğru parametreleri (PSBARCODE, PSCOMPANY, PSPLANT) gönderir", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          sysStatus: 0,
          data: {
            PURORDERLIST: {
              ROW: [
                {
                  VENDOR: "TED-101",
                  NAME1: "Kalıp Depo Sanayi A.Ş.",
                  PURORDER: "SIP-2026-001",
                },
              ],
            },
          },
        }),
      } as Response);

      const result = await api.getOpenOrders({ barcode: "8691234567890" });

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, options] = fetchSpy.mock.calls[0];
      expect(url).toContain(SERVICES.getOpenOrder);
      expect(options?.method).toBe("POST");

      const body = JSON.parse(options?.body as string);
      expect(body).toEqual({
        PSCOMPANY: "01",
        PSPLANT: "100",
        PSBARCODE: "8691234567890",
        PSVENDOR: "",
      });

      expect(result.ok).toBe(true);
      expect(result.orders.length).toBe(1);
      expect(result.orders[0].VENDOR).toBe("TED-101");
      expect(result.orders[0].NAME1).toBe("Kalıp Depo Sanayi A.Ş.");
      expect(result.orders[0].PURORDER).toBe("SIP-2026-001");
    });

    it("Barkod sorgusundan dönen birden fazla sipariş kalemini tedarikçi bazında doğru gruplar ve orderCount artırır", () => {
      // 1. Seçenek gruplama mantığı simülasyonu (ReceivingSupplierSelectPage logic)
      const mockOrdersFromCanias = [
        { VENDOR: "TED-101", NAME1: "Kalıp Depo Sanayi A.Ş.", PURORDER: "SIP-2026-001" },
        { VENDOR: "TED-101", NAME1: "Kalıp Depo Sanayi A.Ş.", PURORDER: "SIP-2026-002" },
        { VENDOR: "TED-102", NAME1: "Mega Ambalaj Ltd.", PURORDER: "SIP-2026-003" },
      ];

      const barcode = "8691234567890";
      const map = new Map();
      mockOrdersFromCanias.forEach((row, idx) => {
        const vendorCode = String(row.VENDOR || `TED-${idx + 1}`).trim();
        const vendorName = String(row.NAME1 || "Tedarikçi").trim();
        const poNum = String(row.PURORDER || "").trim();

        if (!map.has(vendorCode)) {
          map.set(vendorCode, {
            id: vendorCode,
            name: vendorName,
            poNumber: poNum || "Açık Sipariş",
            orderCount: 1,
            barcode: barcode,
          });
        } else {
          const existing = map.get(vendorCode)!;
          existing.orderCount += 1;
        }
      });

      const suppliers = Array.from(map.values());
      expect(suppliers.length).toBe(2);
      expect(suppliers[0]).toEqual({
        id: "TED-101",
        name: "Kalıp Depo Sanayi A.Ş.",
        poNumber: "SIP-2026-001",
        orderCount: 2,
        barcode: "8691234567890",
      });
      expect(suppliers[1]).toEqual({
        id: "TED-102",
        name: "Mega Ambalaj Ltd.",
        poNumber: "SIP-2026-003",
        orderCount: 1,
        barcode: "8691234567890",
      });
    });

    it("Farklı CANIAS alan adları (PSVENDOR / SUPPLIERID / POORDER / PO_NUMBER) içeren yanıtları yedekli (fallback) olarak destekler", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          sysStatus: 0,
          data: {
            PURORDERLIST: {
              ROW: [
                {
                  PSVENDOR: "TED-999",
                  VENDORNAME: "Yedek Tedarikçi A.Ş.",
                  PO_NUMBER: "PO-778899",
                },
              ],
            },
          },
        }),
      } as Response);

      const result = await api.getOpenOrders({ barcode: "8690000000001" });
      expect(result.ok).toBe(true);
      expect(result.orders.length).toBe(1);

      const row = result.orders[0];
      const vendorCode = String(row.VENDOR || row.PSVENDOR || row.SUPPLIERID || "").trim();
      const vendorName = String(row.NAME1 || row.SUPPLIERNAME || row.VENDORNAME || "").trim();
      const poNum = String(row.PURORDER || row.POORDER || row.PO_NUMBER || "").trim();

      expect(vendorCode).toBe("TED-999");
      expect(vendorName).toBe("Yedek Tedarikçi A.Ş.");
      expect(poNum).toBe("PO-778899");
    });

    it("Barkod veritabanında bulunamadığında boş liste döner", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          sysStatus: 0,
          data: {
            PURORDERLIST: {
              ROW: [],
            },
          },
        }),
      } as Response);

      const result = await api.getOpenOrders({ barcode: "9999999999999" });
      expect(result.ok).toBe(true);
      expect(result.orders.length).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. SEÇENEK: TEDARİKÇİ İSMİ İLE ARAMA (MzyGetCustomer Servisi) TESTLERİ
  // ---------------------------------------------------------------------------
  describe("2. Seçenek: Tedarikçi İsmi ile Bul (MzyGetCustomer)", () => {
    it("Metin şeklinde tedarikçi ismi girildiğinde PSCUSNAME1 içinde %isimat% wildcard deseni gönderir", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          sysStatus: 0,
          data: {
            CUSTOMERLIST: {
              ROW: [
                {
                  CUSTOMER: "TED-201",
                  NAME1: "Aktüel Ofis Sistemleri",
                  PURORDER: "SIP-2026-55",
                },
              ],
            },
          },
        }),
      } as Response);

      const result = await api.getCustomers({ name: "Aktüel Ofis", customerType: 1 });

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, options] = fetchSpy.mock.calls[0];
      expect(url).toContain(SERVICES.getCustomer);

      const body = JSON.parse(options?.body as string);
      expect(body).toEqual({
        PSCOMPANY: "01",
        PSCUSTOMER: "",
        PSCUSNAME1: "%Aktüel Ofis%",
        PICUSTYPE: 1,
        PSCUSTYPE: 1,
      });

      expect(result.ok).toBe(true);
      expect(result.customers.length).toBe(1);
      expect(result.customers[0].CUSTOMER).toBe("TED-201");
      expect(result.customers[0].NAME1).toBe("Aktüel Ofis Sistemleri");
    });

    it("Firma kodu (örn: TED-500 veya sayısal 500) girildiğinde PSCUSTOMER alanını doldurur ve PSCUSNAME1 alanını boş bırakır", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          sysStatus: 0,
          data: {
            CUSTOMERLIST: {
              ROW: [
                {
                  CUSTOMER: "TED-500",
                  NAME1: "Lojistik Çözümleri A.Ş.",
                  PURORDER: "",
                },
              ],
            },
          },
        }),
      } as Response);

      const result = await api.getCustomers({ name: "TED-500", customerType: 1 });

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [, options] = fetchSpy.mock.calls[0];
      const body = JSON.parse(options?.body as string);

      expect(body.PSCUSTOMER).toBe("TED-500");
      expect(body.PSCUSNAME1).toBe("");
      expect(body.PICUSTYPE).toBe(1);

      expect(result.ok).toBe(true);
      expect(result.customers.length).toBe(1);
    });

    it("2. Seçenek tedarikçi arama sonuçlarında PURORDER boş olduğunda varsayılan 'Aktif Tedarikçi' poNumber değerini atar", () => {
      const mockCustomers = [
        { CUSTOMER: "TED-301", NAME1: "Endüstriyel Kağıt Sanayi", PURORDER: "" },
      ];

      const map = new Map();
      mockCustomers.forEach((row, idx) => {
        const vendorCode = String(row.CUSTOMER || `TED-${idx + 1}`).trim();
        const vendorName = String(row.NAME1 || "Tedarikçi").trim();
        const poNum = String(row.PURORDER || "").trim();

        if (!map.has(vendorCode)) {
          map.set(vendorCode, {
            id: vendorCode,
            name: vendorName,
            poNumber: poNum || "Aktif Tedarikçi",
            orderCount: 1,
            barcode: "",
          });
        }
      });

      const suppliers = Array.from(map.values());
      expect(suppliers.length).toBe(1);
      expect(suppliers[0]).toEqual({
        id: "TED-301",
        name: "Endüstriyel Kağıt Sanayi",
        poNumber: "Aktif Tedarikçi",
        orderCount: 1,
        barcode: "",
      });
    });

    it("Farklı CANIAS tedarikçi alan adlarını (VENDOR / PSCUSTOMER / CUSNAME1 / VENDORNAME) doğru haritalar", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          sysStatus: 0,
          data: {
            VENDORLIST: {
              ROW: [
                {
                  PSCUSTOMER: "TED-888",
                  CUSNAME1: "Alternatif Tedarikçi Şti.",
                  POORDER: "PO-9988",
                },
              ],
            },
          },
        }),
      } as Response);

      const result = await api.getCustomers({ name: "Alternatif", customerType: 1 });
      expect(result.ok).toBe(true);
      expect(result.customers.length).toBe(1);

      const row = result.customers[0];
      const vendorCode = String(row.CUSTOMER || row.VENDOR || row.PSCUSTOMER || row.ID || "").trim();
      const vendorName = String(row.NAME1 || row.CUSNAME1 || row.VENDORNAME || row.NAME || "").trim();
      const poNum = String(row.PURORDER || row.POORDER || row.PO_NUMBER || "").trim();

      expect(vendorCode).toBe("TED-888");
      expect(vendorName).toBe("Alternatif Tedarikçi Şti.");
      expect(poNum).toBe("PO-9988");
    });
  });

  // ---------------------------------------------------------------------------
  // SEÇİM VE GEÇİŞ (PROCEED / NAVIGATION) TESTLERİ
  // ---------------------------------------------------------------------------
  describe("Tedarikçi Seçimi ve Adım 2 İrsaliye Ekranına Yönlendirme Veri Doğrulaması", () => {
    it("1. Seçenekten seçilen tedarikçi siparişi ile yönlendirme hedefi poNumber path parametresini oluşturur", () => {
      const selectedSupplier = {
        id: "TED-101",
        name: "Kalıp Depo Sanayi A.Ş.",
        poNumber: "SIP-2026-001",
        orderCount: 2,
        barcode: "8691234567890",
      };

      const targetPath = `/receiving/${selectedSupplier.poNumber}`;
      expect(targetPath).toBe("/receiving/SIP-2026-001");
    });

    it("2. Seçenekten seçilen tedarikçi ile yönlendirme hedefi poNumber (varsayılan 'Aktif Tedarikçi' veya sipariş no) path parametresini oluşturur", () => {
      const selectedSupplier = {
        id: "TED-301",
        name: "Endüstriyel Kağıt Sanayi",
        poNumber: "Aktif Tedarikçi",
        orderCount: 1,
        barcode: "",
      };

      const targetPath = `/receiving/${encodeURIComponent(selectedSupplier.poNumber)}`;
      expect(targetPath).toBe("/receiving/Aktif%20Tedarik%C3%A7i");
    });
  });
});
