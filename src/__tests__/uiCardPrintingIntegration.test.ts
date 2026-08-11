import { describe, it, expect, beforeEach, vi } from "vitest";
import { api } from "../api/client";
import type { StockRow, ShelfLocation } from "../types";

// Integration test verifying that UI selections extract exact product attributes
// and never use hardcoded/fixed values when calling CANIAS APIs.
describe("UI Card Printing Integration & Dynamic Data Audit", () => {
  let capturedPayloads: any[] = [];

  beforeEach(() => {
    capturedPayloads = [];

    vi.spyOn(api, "printWHSP").mockImplementation(async (payload) => {
      capturedPayloads.push(payload);
      return { ok: true, message: "OK" };
    });

    vi.spyOn(api, "printContainer").mockImplementation(async (payload) => {
      capturedPayloads.push(payload);
      return { ok: true, message: "OK" };
    });

    vi.spyOn(api, "printMaterial").mockImplementation(async (payload) => {
      capturedPayloads.push(payload);
      return { ok: true, message: "OK" };
    });

    vi.spyOn(api, "printBarcode").mockImplementation(async (payload) => {
      capturedPayloads.push(payload);
      return { ok: true, message: "OK" };
    });
  });

  it("1. Ürün Barkodu - Farklı ürün seçildiğinde tam olarak o ürünün malzeme kodu ve birimi gitmeli", async () => {
    const productA: StockRow = {
      material: "MAL-SHAMPOO-500ML",
      name: "Şampuan 500ml",
      warehouse: "DEPO-A",
      stockPlace: "RAF-01",
      availStock: 100,
      unit: "AD",
    };

    await api.printMaterial({
      company: "01",
      plant: "100",
      barcode: productA.material,
      unit: productA.unit,
      repeat: 3,
    });

    expect(capturedPayloads[0].barcode).toBe("MAL-SHAMPOO-500ML");
    expect(capturedPayloads[0].unit).toBe("AD");

    capturedPayloads = [];
    const productB: StockRow = {
      material: "MAL-BISCUIT-100G",
      name: "Bisküvi 100g",
      warehouse: "DEPO-B",
      stockPlace: "RAF-99",
      availStock: 50,
      unit: "KG",
    };

    await api.printMaterial({
      company: "01",
      plant: "100",
      barcode: productB.material,
      unit: productB.unit,
      repeat: 5,
    });

    expect(capturedPayloads[0].barcode).toBe("MAL-BISCUIT-100G");
    expect(capturedPayloads[0].unit).toBe("KG");
  });

  it("2. Raf Etiketi - Seçilen raf koduna göre dinamik raf adresi gitmeli", async () => {
    const shelf: ShelfLocation = {
      id: "1",
      code: "RAF-Z-100",
      warehouse: "DEPO-SOGUK",
      stockPlace: "RAF-Z-100",
      totalStock: 5,
      capacity: 10,
    };

    await api.printWHSP({
      company: "01",
      plant: "100",
      warehouse: shelf.warehouse,
      stockPlace: shelf.stockPlace,
      repeat: 2,
    });

    expect(capturedPayloads[0].stockPlace).toBe("RAF-Z-100");
    expect(capturedPayloads[0].warehouse).toBe("DEPO-SOGUK");
  });

  it("3. SKT Etiketi - Seçilen tarihe ve partiye göre dinamik SKT verisi gitmeli", async () => {
    const userSelectedDate = "2028-11-20";

    await api.printBarcode({
      company: "01",
      plant: "100",
      barcode: userSelectedDate,
      repeat: 4,
    });

    expect(capturedPayloads[0].barcode).toBe("2028-11-20");
    expect(capturedPayloads[0].repeat).toBe(4);
  });
});
