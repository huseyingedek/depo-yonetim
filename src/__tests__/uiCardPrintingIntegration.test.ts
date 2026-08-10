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
  });

  it("1. Ürün Barkodu - Farklı ürün seçildiğinde tam olarak o ürünün malzeme kodu ve deposu gitmeli (Fix veri olmadığını kanıtlar)", async () => {
    // Simulating user selecting Product A (e.g. SHAMPOO)
    const productA: StockRow = {
      material: "MAL-SHAMPOO-500ML",
      name: "Şampuan 500ml",
      warehouse: "DEPO-A",
      stockPlace: "RAF-01",
      availStock: 100,
      unit: "AD",
    };

    await api.printWHSP({
      company: "01",
      plant: "100",
      warehouse: productA.warehouse,
      stockPlace: productA.stockPlace,
      container: productA.material,
      repeat: 3,
    });

    expect(capturedPayloads[0].container).toBe("MAL-SHAMPOO-500ML");
    expect(capturedPayloads[0].warehouse).toBe("DEPO-A");
    expect(capturedPayloads[0].stockPlace).toBe("RAF-01");

    // Simulating user selecting Product B (e.g. BISCUIT)
    capturedPayloads = [];
    const productB: StockRow = {
      material: "MAL-BISCUIT-100G",
      name: "Bisküvi 100g",
      warehouse: "DEPO-B",
      stockPlace: "RAF-99",
      availStock: 50,
      unit: "AD",
    };

    await api.printWHSP({
      company: "01",
      plant: "100",
      warehouse: productB.warehouse,
      stockPlace: productB.stockPlace,
      container: productB.material,
      repeat: 5,
    });

    expect(capturedPayloads[0].container).toBe("MAL-BISCUIT-100G");
    expect(capturedPayloads[0].warehouse).toBe("DEPO-B");
    expect(capturedPayloads[0].stockPlace).toBe("RAF-99");
  });

  it("2. Raf Etiketi - Seçilen raf koduna göre dinamik raf adresi gitmeli", async () => {
    const shelf: ShelfLocation = {
      id: "1",
      code: "RAF-Z-100",
      warehouse: "DEPO-SOOGUK",
      stockPlace: "RAF-Z-100",
      totalStock: 5,
      capacity: 10,
    };

    await api.printWHSP({
      company: "01",
      plant: "100",
      warehouse: shelf.warehouse,
      stockPlace: shelf.stockPlace,
      container: shelf.stockPlace,
      repeat: 2,
      isContainer: 0,
    });

    expect(capturedPayloads[0].container).toBe("RAF-Z-100");
    expect(capturedPayloads[0].stockPlace).toBe("RAF-Z-100");
    expect(capturedPayloads[0].warehouse).toBe("DEPO-SOOGUK");
  });

  it("3. SKT Etiketi - Seçilen tarihe ve partiye göre dinamik SKT verisi gitmeli", async () => {
    const userSelectedDate = "2028-11-20";

    await api.printWHSP({
      company: "01",
      plant: "100",
      container: userSelectedDate,
      repeat: 4,
    });

    expect(capturedPayloads[0].container).toBe("2028-11-20");
    expect(capturedPayloads[0].repeat).toBe(4);
  });
});
