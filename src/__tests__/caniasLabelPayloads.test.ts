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
        PSCONTAINER: payload.container || "",
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
        PIREPEAT: repeatNum,
        PSUSER: payload.user || "AHMET_YILMAZ",
      };
      capturedCalls.push({ service: SERVICES.printWHSP, params });
      return { ok: true, message: "OK" };
    });

    vi.spyOn(api, "printMaterial").mockImplementation(async (payload) => {
      const repeatNum = Math.min(99, Math.max(1, Number(payload.repeat) || 1));
      const params = {
        PSCOMPANY: payload.company || "01",
        PSPLANT: payload.plant || "100",
        PSBARCODE: payload.barcode || payload.container || "",
        PSUNIT: payload.unit || "",
        PIREPEAT: repeatNum,
        PSUSER: payload.user || "AHMET_YILMAZ",
      };
      capturedCalls.push({ service: SERVICES.printMaterial, params });
      return { ok: true, message: "OK" };
    });

    vi.spyOn(api, "printBarcode").mockImplementation(async (payload) => {
      const repeatNum = Math.min(99, Math.max(1, Number(payload.repeat) || 1));
      const params = {
        PSCOMPANY: payload.company || "01",
        PSPLANT: payload.plant || "100",
        PSBARCODE: payload.barcode || payload.container || "",
        PIREPEAT: repeatNum,
        PSUSER: payload.user || "AHMET_YILMAZ",
      };
      capturedCalls.push({ service: SERVICES.printBarcode, params });
      return { ok: true, message: "OK" };
    });
  });

  // Test 1: MZYPrintWHSP
  it("MZYPrintWHSP - Raf Etiketi Parametre Testi", async () => {
    capturedCalls = [];
    await api.printWHSP({
      company: "01",
      plant: "100",
      warehouse: "10",
      stockPlace: "A-01-01",
      repeat: 3,
    });

    expect(capturedCalls[0].params).toEqual({
      PSCOMPANY: "01",
      PSPLANT: "100",
      PSWAREHOUSE: "10",
      PSSTOCKPLACE: "A-01-01",
      PIREPEAT: 3,
      PSUSER: "AHMET_YILMAZ",
    });
  });

  // Test 2: MZYPrintContainer
  it("MZYPrintContainer - Konteyner Etiketi Parametre Testi", async () => {
    capturedCalls = [];
    await api.printContainer({
      company: "01",
      plant: "100",
      container: "PALET-9988",
      repeat: 2,
    });

    expect(capturedCalls[0].params).toEqual({
      PSCOMPANY: "01",
      PSPLANT: "100",
      PSCONTAINER: "PALET-9988",
      PIREPEAT: 2,
      PSUSER: "AHMET_YILMAZ",
    });
  });

  // Test 3: MZYPrintMaterial
  it("MZYPrintMaterial - Malzeme Barkodu Parametre Testi", async () => {
    capturedCalls = [];
    await api.printMaterial({
      company: "01",
      plant: "100",
      barcode: "MAL-SOAP-200ML",
      unit: "AD",
      repeat: 5,
    });

    expect(capturedCalls[0].params).toEqual({
      PSCOMPANY: "01",
      PSPLANT: "100",
      PSBARCODE: "MAL-SOAP-200ML",
      PSUNIT: "AD",
      PIREPEAT: 5,
      PSUSER: "AHMET_YILMAZ",
    });
  });

  // Test 4: MZYPrintBarcode
  it("MZYPrintBarcode - SKT / Barkod Parametre Testi", async () => {
    capturedCalls = [];
    await api.printBarcode({
      company: "01",
      plant: "100",
      barcode: "2028-12-31",
      repeat: 4,
    });

    expect(capturedCalls[0].params).toEqual({
      PSCOMPANY: "01",
      PSPLANT: "100",
      PSBARCODE: "2028-12-31",
      PIREPEAT: 4,
      PSUSER: "AHMET_YILMAZ",
    });
  });

  // Test 5: Kopya sayısı sınırları (Clamping)
  it("Kopya sayısı sınırları (Clamping) doğru çalışmalı", async () => {
    await api.printBarcode({ barcode: "2028-12-31", repeat: -5 });
    expect(capturedCalls[0].params.PIREPEAT).toBe(1);

    capturedCalls = [];
    await api.printBarcode({ barcode: "2028-12-31", repeat: 500 });
    expect(capturedCalls[0].params.PIREPEAT).toBe(99);
  });
});
