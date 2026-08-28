import { describe, it, expect, beforeEach, vi } from "vitest";
import { api, DATE_MIN, DATE_MAX } from "../api/client";
import { SERVICES } from "../api/config";

describe("Sayım Servisleri — MZYListingAdjustment & MZYEnterAdjustment", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
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
      PSORDERNUM: "SYM-2026-001",
      PSORDERTYPE: "SYM",
      PSUSER: "depocu1",
      PITRACESTATUS: 0,
    });

    expect(result).toBeDefined();
    expect(result?.id).toBe("SYM-2026-001");
    expect(result?.docType).toBe("SYM");
    expect(result?.warehouse).toBe("01");
    expect(result?.itemCount).toBe(10);
  });
});
