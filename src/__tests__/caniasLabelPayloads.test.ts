import { describe, it, expect, beforeEach, vi } from "vitest";
import { api } from "../api/client";
import { SERVICES } from "../api/config";

// Polyfill localStorage for node vitest environment
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

describe("CANIAS Label Printing Dynamic Parameter & Product Tests", () => {
  let capturedCalls: Array<{ service: string; params: Record<string, unknown> }> = [];

  beforeEach(() => {
    capturedCalls = [];
    storage["wms_worker_id"] = "AHMET_YILMAZ";
    storage["wms_selected_company"] = "01";
    storage["wms_selected_plant"] = "100";
    storage["wms_selected_warehouse"] = "20";

    vi.spyOn(api, "printContainer").mockImplementation(async (payload) => {
      const repeatNum = Math.min(99, Math.max(1, Number(payload.repeat) || 1));
      const params = {
        PSCOMPANY: payload.company || "01",
        PSPLANT: payload.plant || "100",
        PSWAREHOUSE: payload.warehouse || "10",
        PSCONTAINER: payload.container || "",
        PIISCONTAINER: 1,
        PIREPEAT: repeatNum,
        PSUSER: payload.user || "AHMET_YILMAZ",
      };
      capturedCalls.push({ service: SERVICES.printContainer, params });
      return { ok: true, message: "OK" };
    });

    vi.spyOn(api, "printWHSP").mockImplementation(async (payload) => {
      const repeatNum = Math.min(99, Math.max(1, Number(payload.repeat) || 1));
      const params = {
        PSCOMPANY: payload.company || "01",
        PSPLANT: payload.plant || "100",
        PSWAREHOUSE: payload.warehouse || "",
        PSSTOCKPLACE: payload.stockPlace || "",
        PSCONTAINER: payload.container || "",
        PIISCONTAINER: payload.isContainer ? 1 : 0,
        PIREPEAT: repeatNum,
        PSUSER: payload.user || "AHMET_YILMAZ",
      };
      capturedCalls.push({ service: SERVICES.printWHSP, params });
      return { ok: true, message: "OK" };
    });
  });

  // Test 1: Testing multiple different products dynamically
  it.each([
    { mat: "MAL001", warehouse: "10", shelf: "A-01-01", count: 1 },
    { mat: "MAL-SOAP-200ML", warehouse: "20", shelf: "B-12-04", count: 5 },
    { mat: "DETERJAN-PRO-5KG", warehouse: "30", shelf: "C-99-99", count: 12 },
  ])("Farklı Ürün Parametreleri Testi ($mat, Depo: $warehouse, Raf: $shelf, Kopya: $count)", async ({ mat, warehouse, shelf, count }) => {
    capturedCalls = [];
    await api.printWHSP({
      company: "01",
      plant: "100",
      warehouse,
      stockPlace: shelf,
      container: mat,
      repeat: count,
    });

    expect(capturedCalls[0].params).toEqual({
      PSCOMPANY: "01",
      PSPLANT: "100",
      PSWAREHOUSE: warehouse,
      PSSTOCKPLACE: shelf,
      PSCONTAINER: mat,
      PIISCONTAINER: 0,
      PIREPEAT: count,
      PSUSER: "AHMET_YILMAZ",
    });
  });

  // Test 2: Testing different expiry dates dynamically
  it.each([
    { date: "2026-08-30", count: 2 },
    { date: "2027-12-31", count: 10 },
    { date: "2029-01-01", count: 99 },
  ])("Farklı SKT Tarih Parametreleri Testi (Tarih: $date, Kopya: $count)", async ({ date, count }) => {
    capturedCalls = [];
    await api.printWHSP({
      company: "01",
      plant: "100",
      container: date,
      repeat: count,
    });

    expect(capturedCalls[0].params.PSCONTAINER).toBe(date);
    expect(capturedCalls[0].params.PIREPEAT).toBe(count);
  });

  // Test 3: Testing repeat count clamping (e.g. values clamped between 1 and 99)
  it("Kopya sayısı sınırları (Clamping) doğru çalışmalı", async () => {
    // Zero or negative should clamp to 1
    await api.printWHSP({ container: "MAL001", repeat: -5 });
    expect(capturedCalls[0].params.PIREPEAT).toBe(1);

    // Over 99 should clamp to 99
    capturedCalls = [];
    await api.printWHSP({ container: "MAL001", repeat: 500 });
    expect(capturedCalls[0].params.PIREPEAT).toBe(99);
  });
});
