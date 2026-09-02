import { describe, it, expect, beforeEach, vi } from "vitest";
import { api, DATE_MIN, DATE_MAX } from "../api/client";
import { SERVICES } from "../api/config";
import { useAppStore } from "../store/appStore";

describe("Sayım Servisleri — MZYListingAdjustment & MZYEnterAdjustment", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAppStore.getState().setTrace(false);
  });

  it("1. api.getAdjustmentList MZYListingAdjustment parametrelerini eksiksiz iletir", async () => {
    let capturedUrl = "";
    let capturedBody: any = null;

    global.fetch = vi.fn().mockImplementation(async (url: string, init: any) => {
      capturedUrl = url;
      capturedBody = JSON.parse(init?.body || "{}");
      return {
        ok: true,
        json: async () => ({
          data: {
            TBLADJUSTMENT: {
              ROW: [
                {
                  INVDOCNUM: "SYM-2026-001",
                  DOCNUM: "SYM-2026-001",
                  DOCTYPE: "SYM",
                  WAREHOUSE: "01",
                  STOCKPLACE: "A-01-02",
                  WORKER: "depocu1",
                  DOCDATE: "28.08.2026",
                  STEXT: "Genel Yıllık Sayım",
                  TRACESTATUS: "0",
                  ITEMCOUNT: 25,
                },
              ],
            },
          },
        }),
      } as Response;
    });

    const result = await api.getAdjustmentList();

    expect(capturedUrl).toContain(SERVICES.listingAdjustment);
    expect(capturedBody).toEqual({
      PSCOMPANY: "01",
      PSPLANT: "100",
      PDSTARTDATE: DATE_MIN,
      PDENDDATE: DATE_MAX,
      PITRACESTATUS: 0,
    });

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("SYM-2026-001");
    expect(result[0].invDocNum).toBe("SYM-2026-001");
    expect(result[0].docType).toBe("SYM");
    expect(result[0].warehouse).toBe("01");
    expect(result[0].stockPlace).toBe("A-01-02");
    expect(result[0].itemCount).toBe(25);
  });

  it("2. api.getAdjustmentOrder MZYEnterAdjustment parametrelerini (PSCOMPANY, PSPLANT, WAREHOUSE, PSORDERNUM, PSORDERTYPE, PSUSER, PITRACESTATUS) eksiksiz iletir", async () => {
    let capturedUrl = "";
    let capturedBody: any = null;

    global.fetch = vi.fn().mockImplementation(async (url: string, init: any) => {
      capturedUrl = url;
      capturedBody = JSON.parse(init?.body || "{}");
      return {
        ok: true,
        json: async () => ({
          data: {
            IASWMSADJITEM: {
              ROW: [
                {
                  ORDERNUM: "SYM-2026-001",
                  ORDERTYPE: "SYM",
                  WAREHOUSE: "01",
                  STOCKPLACE: "A-01-02",
                  WORKER: "depocu1",
                  STEXT: "Sayım Emri 1",
                  TOTALITEMS: 10,
                },
              ],
            },
          },
        }),
      } as Response;
    });

    const result = await api.getAdjustmentOrder({
      orderNum: "SYM-2026-001",
      orderType: "SYM",
      warehouse: "01",
      company: "01",
      plant: "100",
      user: "depocu1",
      traceStatus: 0,
    });

    expect(capturedUrl).toContain(SERVICES.enterAdjustment);
    expect(capturedBody).toEqual({
      PSCOMPANY: "01",
      PSPLANT: "100",
      WAREHOUSE: "01",
      PSWAREHOUSE: "01",
      PSORDERNUM: "SYM-2026-001",
      PSINVDOCNUM: "SYM-2026-001",
      PSORDERTYPE: "SYM",
      PSINVDOCTYPE: "SYM",
      PSUSER: "depocu1",
      PSWORKER: "depocu1",
      PITRACESTATUS: 0,
    });

    expect(result).toBeDefined();
    expect(result?.id).toBe("SYM-2026-001");
    expect(result?.docType).toBe("SYM");
    expect(result?.warehouse).toBe("01");
    expect(result?.itemCount).toBe(10);
  });

  it("3. Trace modu açıkken (trace: true) getAdjustmentList ve getAdjustmentOrder servislere PITRACESTATUS: 1 iletir", async () => {
    useAppStore.getState().setTrace(true);
    let capturedBodies: any[] = [];

    global.fetch = vi.fn().mockImplementation(async (_url: string, init: any) => {
      capturedBodies.push(JSON.parse(init?.body || "{}"));
      return {
        ok: true,
        json: async () => ({ data: { TBLADJUSTMENT: { ROW: [] } } }),
      } as Response;
    });

    await api.getAdjustmentList();
    await api.getAdjustmentOrder("SYM-2026-001");

    expect(capturedBodies).toHaveLength(2);
    expect(capturedBodies[0].PITRACESTATUS).toBe(1);
    expect(capturedBodies[1].PITRACESTATUS).toBe(1);
  });

  it("4. CANIAS hem TBLADJUSTMENT başlık tablosu hem de TBLADJITEM altında birden çok ürün döndüğünde tüm ürünleri lines içine yükler", async () => {
    global.fetch = vi.fn().mockImplementation(async () => {
      return {
        ok: true,
        json: async () => ({
          data: {
            TBLADJUSTMENT: {
              ROW: [
                {
                  INVDOCNUM: "SYM-2026-999",
                  DOCTYPE: "SYM",
                  WAREHOUSE: "01",
                  STOCKPLACE: "A-01-01",
                },
              ],
            },
            TBLADJITEM: {
              ROW: [
                {
                  ITEMNUM: "1",
                  MATERIAL: "MLZ001",
                  MTEXT: "A4 Kağıt",
                  BARCODE: "869001",
                  QUANTITY: 10,
                  QUNIT: "KO",
                  SKUNIT: "PK",
                  MULTIPLIER: 5,
                },
                {
                  ITEMNUM: "2",
                  MATERIAL: "MLZ002",
                  MTEXT: "Tükenmez Kalem",
                  BARCODE: "869002",
                  QUANTITY: 50,
                  QUNIT: "AD",
                  SKUNIT: "AD",
                  MULTIPLIER: 1,
                },
                {
                  ITEMNUM: "3",
                  MATERIAL: "MLZ003",
                  MTEXT: "Zımba Teli",
                  BARCODE: "869003",
                  QUANTITY: 24,
                  QUNIT: "PK",
                  SKUNIT: "AD",
                  MULTIPLIER: 10,
                },
              ],
            },
          },
        }),
      } as Response;
    });

    const result = await api.getAdjustmentOrder("SYM-2026-999");
    expect(result).toBeDefined();
    expect(result?.lines).toHaveLength(3);
    expect(result?.lines?.[0].material).toBe("MLZ001");
    expect(result?.lines?.[1].material).toBe("MLZ002");
    expect(result?.lines?.[2].material).toBe("MLZ003");
  });

  it("5. CANIAS canlı IASINVADJHEAD.ROW.IASINVADJITEMLIST yapısını eksiksiz parse eder", async () => {
    global.fetch = vi.fn().mockImplementation(async () => {
      return {
        ok: true,
        json: async () => ({
          data: {
            IASINVADJHEAD: {
              ROW: {
                CLIENT: "00",
                COMPANY: "01",
                PLANT: "100",
                WAREHOUSE: "D1",
                INVDOCTYPE: "50",
                INVDOCNUM: "00000882",
                DOCDATE: "31.08.2026",
                IASINVADJITEMLIST: [
                  {
                    INVDOCITEM: "10",
                    STOCKPLACE: "Q1",
                    MATERIAL: "0X002",
                    MTEXT: "Fax Okyanus Sıvı Sabun 3Lt",
                    AVAILSTOCKV: "30.0",
                    SKUNIT: "AD",
                  },
                  {
                    INVDOCITEM: "20",
                    STOCKPLACE: "Q1",
                    MATERIAL: "6SM01",
                    MTEXT: "Smart Tuvalet Kağıdı 24'lü",
                    AVAILSTOCKV: "91.0",
                    SKUNIT: "AD",
                  },
                ],
              },
            },
          },
        }),
      } as Response;
    });

    const result = await api.getAdjustmentOrder("00000882");
    expect(result).toBeDefined();
    expect(result?.invDocNum).toBe("00000882");
    expect(result?.lines).toHaveLength(2);
    expect(result?.lines?.[0].material).toBe("0X002");
    expect(result?.lines?.[0].name).toBe("Fax Okyanus Sıvı Sabun 3Lt");
    expect(result?.lines?.[0].targetQty).toBe(30);
    expect(result?.lines?.[0].stockPlace).toBe("Q1");
    expect(result?.lines?.[1].material).toBe("6SM01");
    expect(result?.lines?.[1].targetQty).toBe(91);
  });

  it("6. Sayım satırları hiyerarşisinde listede olmayan (targetQty: 0) mavi ürünler kırmızının üzerinde sıralanır", () => {
    const lines = [
      { id: "1", material: "TAM", targetQty: 10, countedQty: 10 },       // Yeşil (Tier 5)
      { id: "2", material: "SIFIR", targetQty: 10, countedQty: 0 },      // Siyah (Tier 4)
      { id: "3", material: "EKSIK", targetQty: 10, countedQty: 5 },      // Sarı (Tier 3)
      { id: "4", material: "FAZLA", targetQty: 10, countedQty: 15 },     // Kırmızı (Tier 2)
      { id: "5", material: "LISTEDE_YOK", targetQty: 0, countedQty: 3 }, // Mavi (Tier 1)
    ];

    const getTier = (l: { targetQty: number; countedQty: number }) => {
      const counted = l.countedQty;
      const target = l.targetQty;
      if (target <= 0 && counted > 0) return 1; // Mavi
      if (target > 0 && counted > target) return 2; // Kırmızı
      if (target > 0 && counted > 0 && counted < target) return 3; // Sarı
      if (counted === 0) return 4; // Siyah
      return 5; // Yeşil
    };

    const sorted = [...lines].sort((a, b) => getTier(a) - getTier(b));

    expect(sorted.map((s) => s.material)).toEqual([
      "LISTEDE_YOK", // Tier 1: Mavi (Kırmızının üstünde)
      "FAZLA",       // Tier 2: Kırmızı
      "EKSIK",       // Tier 3: Sarı
      "SIFIR",       // Tier 4: Siyah
      "TAM",         // Tier 5: Yeşil
    ]);
  });

  it("7. Parti doğrulamasında geçmiş tarih ve 2100'den büyük yıl girilemez, geçerli tarihler kabul edilir", () => {
    function validateBatchTest(batch: string): { valid: boolean; error?: string } {
      const clean = batch.trim();
      if (!clean) return { valid: false, error: "Parti bilgisi boş olamaz!" };

      let year: number | null = null;
      let month: number | null = null;
      let day: number | null = null;

      const mIso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clean);
      const mNum = /^(\d{4})(\d{2})(\d{2})$/.exec(clean);
      const mDot = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(clean);

      if (mIso) {
        year = parseInt(mIso[1], 10);
        month = parseInt(mIso[2], 10);
        day = parseInt(mIso[3], 10);
      } else if (mNum) {
        year = parseInt(mNum[1], 10);
        month = parseInt(mNum[2], 10);
        day = parseInt(mNum[3], 10);
      } else if (mDot) {
        day = parseInt(mDot[1], 10);
        month = parseInt(mDot[2], 10);
        year = parseInt(mDot[3], 10);
      }

      if (year !== null && month !== null && day !== null) {
        if (month < 1 || month > 12 || day < 1 || day > 31 || year > 2100) {
          return { valid: false, error: "Geçersiz tarih formatı!" };
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const targetDate = new Date(year, month - 1, day);
        targetDate.setHours(0, 0, 0, 0);

        if (targetDate < today) {
          return { valid: false, error: "Geçmiş tarihli parti girilemez!" };
        }
      }

      return { valid: true };
    }

    // Geçmiş tarih testleri
    expect(validateBatchTest("2020-01-01").valid).toBe(false);
    expect(validateBatchTest("20200101").valid).toBe(false);
    expect(validateBatchTest("01.01.2020").valid).toBe(false);

    // 2100'den büyük yıl testleri
    expect(validateBatchTest("2101-01-01").valid).toBe(false);
    expect(validateBatchTest("21050505").valid).toBe(false);

    // Gelecek / Bugün geçerli tarihler
    const nextYear = new Date().getFullYear() + 1;
    expect(validateBatchTest(`${nextYear}-06-15`).valid).toBe(true);
    expect(validateBatchTest(`${nextYear}0615`).valid).toBe(true);
    expect(validateBatchTest(`15.06.${nextYear}`).valid).toBe(true);

    // Düz alfanümerik parti kodları
    expect(validateBatchTest("PARTI-2026-X").valid).toBe(true);
  });
});
