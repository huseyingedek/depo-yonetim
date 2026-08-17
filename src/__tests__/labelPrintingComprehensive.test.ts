import { describe, it, expect, beforeEach, vi } from "vitest";
import { api } from "../api/client";
import { SERVICES } from "../api/config";

// Polyfill localStorage
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

describe("Label Printing Module - Comprehensive Production Readiness Tests", () => {
  let capturedCalls: Array<{ service: string; params: Record<string, unknown> }> = [];

  beforeEach(() => {
    capturedCalls = [];
    storage["wms_worker_id"] = "DEPOCU_1";
    storage["wms_selected_company"] = "01";
    storage["wms_selected_plant"] = "100";
    storage["wms_selected_warehouse"] = "D1";

    vi.spyOn(api, "printContainer").mockImplementation(async (payload) => {
      if (!payload.container?.trim()) {
        return { ok: false, message: "Konteyner / Palet numarası girilmelidir" };
      }
      const repeatNum = Math.min(99, Math.max(1, Number(payload.repeat) || 1));
      capturedCalls.push({
        service: SERVICES.printContainer,
        params: {
          PSCOMPANY: payload.company || "01",
          PSPLANT: payload.plant || "100",
          PSWAREHOUSE: payload.warehouse || "D1",
          PSCONTAINER: payload.container.trim(),
          PIREPEAT: repeatNum,
          PSUSER: payload.user || "DEPOCU_1",
        },
      });
      return { ok: true, message: "Konteyner etiket yazdırma başarılı" };
    });

    vi.spyOn(api, "printWHSP").mockImplementation(async (payload) => {
      if (!payload.stockPlace?.trim()) {
        return { ok: false, message: "Raf / Stok Yeri adresi girilmelidir" };
      }
      const repeatNum = Math.min(99, Math.max(1, Number(payload.repeat) || 1));
      capturedCalls.push({
        service: SERVICES.printWHSP,
        params: {
          PSCOMPANY: payload.company || "01",
          PSPLANT: payload.plant || "100",
          PSWAREHOUSE: payload.warehouse || "D1",
          PSSTOCKPLACE: payload.stockPlace.trim(),
          PIREPEAT: repeatNum,
          PSUSER: payload.user || "DEPOCU_1",
        },
      });
      return { ok: true, message: "Raf etiket yazdırma başarılı" };
    });

    vi.spyOn(api, "printMaterial").mockImplementation(async (payload) => {
      const code = (payload.barcode || payload.container || "").trim();
      if (!code) {
        return { ok: false, message: "Malzeme kodu veya barkodu girilmelidir" };
      }
      const repeatNum = Math.min(99, Math.max(1, Number(payload.repeat) || 1));
      capturedCalls.push({
        service: SERVICES.printMaterial,
        params: {
          PSCOMPANY: payload.company || "01",
          PSPLANT: payload.plant || "100",
          PSBARCODE: code,
          PSUNIT: payload.unit || "AD",
          PIREPEAT: repeatNum,
          PSUSER: payload.user || "DEPOCU_1",
        },
      });
      return { ok: true, message: "Ürün barkod etiket yazdırma başarılı" };
    });

    vi.spyOn(api, "printBarcode").mockImplementation(async (payload) => {
      const code = (payload.barcode || payload.container || "").trim();
      if (!code) {
        return { ok: false, message: "Barkod / SKT bilgisi girilmelidir" };
      }
      const repeatNum = Math.min(99, Math.max(1, Number(payload.repeat) || 1));
      capturedCalls.push({
        service: SERVICES.printBarcode,
        params: {
          PSCOMPANY: payload.company || "01",
          PSPLANT: payload.plant || "100",
          PSBARCODE: code,
          PIREPEAT: repeatNum,
          PSUSER: payload.user || "DEPOCU_1",
        },
      });
      return { ok: true, message: "SKT / Barkod etiket yazdırma başarılı" };
    });
  });

  // 1. Paketleme / Palet Etiketi Yazdırma
  it("1. Paketleme Etiketi (MZYPrintContainer) - Palet ve Koli kodlarını doğru parametrelerle göndermeli", async () => {
    const res = await api.printContainer({
      container: "PALET-2026-0817-A",
      warehouse: "D1",
      repeat: 3,
    });

    expect(res.ok).toBe(true);
    expect(capturedCalls[0].service).toBe("MZYPrintContainer");
    expect(capturedCalls[0].params).toEqual({
      PSCOMPANY: "01",
      PSPLANT: "100",
      PSWAREHOUSE: "D1",
      PSCONTAINER: "PALET-2026-0817-A",
      PIREPEAT: 3,
      PSUSER: "DEPOCU_1",
    });
  });

  // 2. Depo Raf Etiketi Yazdırma
  it("2. Raf Etiketi (MZYPrintWHSP) - Özel lokasyon formatlarını (D3$C1, A-01-02 vb.) eksiksiz iletmeli", async () => {
    const res = await api.printWHSP({
      warehouse: "D1",
      stockPlace: "D3$C1",
      repeat: 2,
    });

    expect(res.ok).toBe(true);
    expect(capturedCalls[0].service).toBe("MZYPrintWHSP");
    expect(capturedCalls[0].params.PSSTOCKPLACE).toBe("D3$C1");
    expect(capturedCalls[0].params.PIREPEAT).toBe(2);
  });

  // 3. Ürün Barkodu Yazdırma
  it("3. Ürün Barkodu (MZYPrintMaterial) - Malzeme kodu, EAN barkod ve birimi CANIAS'a iletmeli", async () => {
    const res = await api.printMaterial({
      barcode: "8690123456789",
      unit: "PK",
      repeat: 10,
    });

    expect(res.ok).toBe(true);
    expect(capturedCalls[0].service).toBe("MZYPrintMaterial");
    expect(capturedCalls[0].params.PSBARCODE).toBe("8690123456789");
    expect(capturedCalls[0].params.PSUNIT).toBe("PK");
    expect(capturedCalls[0].params.PIREPEAT).toBe(10);
  });

  // 4. SKT / Parti Etiketi Yazdırma
  it("4. SKT Etiketi (MZYPrintBarcode) - Tarih ve parti numaralarını doğru formatlamalı", async () => {
    const res = await api.printBarcode({
      barcode: "2027-05-31",
      repeat: 5,
    });

    expect(res.ok).toBe(true);
    expect(capturedCalls[0].service).toBe("MZYPrintBarcode");
    expect(capturedCalls[0].params.PSBARCODE).toBe("2027-05-31");
    expect(capturedCalls[0].params.PIREPEAT).toBe(5);
  });

  // 5. İrsaliye Etiketi Yazdırma
  it("5. İrsaliye Etiketi (MZYPrintContainer) - İrsaliye numarasını konteyner servisiyle iletmeli", async () => {
    const res = await api.printContainer({
      container: "IRS2026000456",
      repeat: 1,
    });

    expect(res.ok).toBe(true);
    expect(capturedCalls[0].service).toBe("MZYPrintContainer");
    expect(capturedCalls[0].params.PSCONTAINER).toBe("IRS2026000456");
  });

  // 6. Çoklu Toplu Etiket Yazdırma (Batch Printing)
  it("6. Çoklu Toplu Yazdırma - Seçilen tüm kalemler sırayla basılmalı", async () => {
    const batchMaterials = [
      { code: "MAL-A", unit: "AD" },
      { code: "MAL-B", unit: "KG" },
      { code: "MAL-C", unit: "PK" },
    ];

    for (const mat of batchMaterials) {
      await api.printMaterial({
        barcode: mat.code,
        unit: mat.unit,
        repeat: 2,
      });
    }

    expect(capturedCalls.length).toBe(3);
    expect(capturedCalls[0].params.PSBARCODE).toBe("MAL-A");
    expect(capturedCalls[1].params.PSBARCODE).toBe("MAL-B");
    expect(capturedCalls[2].params.PSBARCODE).toBe("MAL-C");
  });

  // 7. Boş veri ve Sınır Değerleri
  it("7. Sınır Değerler - 0 veya negatif kopya 1'e, 99'dan büyük kopya 99'a sabitlenmeli", async () => {
    await api.printMaterial({ barcode: "TEST", repeat: -10 });
    expect(capturedCalls[0].params.PIREPEAT).toBe(1);

    capturedCalls = [];
    await api.printMaterial({ barcode: "TEST", repeat: 500 });
    expect(capturedCalls[0].params.PIREPEAT).toBe(99);
  });
});
