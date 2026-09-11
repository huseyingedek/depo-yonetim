import { describe, it, expect } from "vitest";
import type { AdjustmentLine } from "../types";

function cleanShelfCode(raw?: string | null): string {
  if (!raw) return "";
  let s = raw.trim().toUpperCase();
  if (s.includes("$")) {
    s = s.split("$").slice(1).join("$").trim();
  }
  return s;
}

function areShelvesEqual(
  targetSp?: string | null,
  targetWh?: string | null,
  enteredSp?: string | null,
  enteredWh?: string | null
): boolean {
  if (!targetSp) return true;
  if (!enteredSp) return false;

  const sp1 = cleanShelfCode(targetSp);
  const sp2 = cleanShelfCode(enteredSp);

  const wh1 = (targetWh || "").trim().toUpperCase();
  const wh2 = (enteredWh || "").trim().toUpperCase();
  if (wh1 && wh2 && wh1 !== wh2) {
    return false;
  }

  if (sp1 === sp2) return true;

  const norm1 = sp1.replace(/[^A-Z0-9]/g, "");
  const norm2 = sp2.replace(/[^A-Z0-9]/g, "");
  return norm1.length > 0 && norm1 === norm2;
}

describe("Sayım Raf Doğrulama ve Satır Sayım Akışı", () => {
  it("Raf karşılaştırması aynı rafı doğru tespit eder", () => {
    // Birebir aynı
    expect(areShelvesEqual("A-01-01", "01", "A-01-01", "01")).toBe(true);
    // $ formatında girilen raf
    expect(areShelvesEqual("A-01-01", "01", "01$A-01-01", "01")).toBe(true);
    // Belgede $ ile tanımlı raf
    expect(areShelvesEqual("01$A-01-01", "01", "A-01-01", "01")).toBe(true);
    // Alfanümerik format (tire olmadan)
    expect(areShelvesEqual("A-01-01", "01", "A0101", "01")).toBe(true);
    // Belgede raf belirtilmemişse okutulan rafı kabul etmeli
    expect(areShelvesEqual("", "01", "B-02-01", "01")).toBe(true);
    expect(areShelvesEqual(undefined, "01", "B-02-01", "01")).toBe(true);
  });

  it("Raf karşılaştırması farklı rafı doğru tespit eder", () => {
    // Farklı raf kodu
    expect(areShelvesEqual("A-01-01", "01", "A-01-02", "01")).toBe(false);
    expect(areShelvesEqual("A-01-01", "01", "B-05-01", "01")).toBe(false);
    // Farklı depo
    expect(areShelvesEqual("A-01-01", "01", "A-01-01", "02")).toBe(false);
  });

  it("Kullanıcı sağ taraftan ürüne tıklayıp AYNI rafı okuttuğunda o satır sayılır", () => {
    const initialLines: AdjustmentLine[] = [
      {
        id: "line-1",
        material: "MLZ001",
        name: "A4 Fotokopi Kağıdı",
        stockPlace: "A-01-01",
        warehouse: "01",
        targetQty: 10,
        countedQty: 0,
        unit: "KO",
        skunit: "PK",
        multiplier: 5,
      },
      {
        id: "line-2",
        material: "MLZ002",
        name: "Tükenmez Kalem",
        stockPlace: "A-01-02",
        warehouse: "01",
        targetQty: 50,
        countedQty: 0,
        unit: "AD",
        skunit: "AD",
        multiplier: 1,
      },
    ];

    // line-1 seçildi
    const targetLine = initialLines[0];
    const enteredWh = "01";
    const enteredSp = "A-01-01";

    const isSame = areShelvesEqual(targetLine.stockPlace, targetLine.warehouse, enteredSp, enteredWh);
    expect(isSame).toBe(true);

    // Raf aynı: line-1'in sayımı yapılır
    const countedQtyInUnit = 2; // 2 koli
    const baseCounted = countedQtyInUnit * targetLine.multiplier; // 10 paket

    const updatedLines = initialLines.map((l) =>
      l.id === targetLine.id ? { ...l, countedQty: baseCounted } : l
    );

    expect(updatedLines).toHaveLength(2);
    expect(updatedLines[0].countedQty).toBe(10);
    expect(updatedLines[0].targetQty).toBe(10);
    // line-1 tam sayıldı (tamamlandı)
    expect(updatedLines[0].countedQty === updatedLines[0].targetQty).toBe(true);
    // line-2 dokunulmadı (siyah, 0/50)
    expect(updatedLines[1].countedQty).toBe(0);
  });

  it("Kullanıcı sağ taraftan ürüne tıklayıp FARKLI raf okuttuğunda sağ tarafa YENİ satır eklenir ve tıklanan kart SİYAH (henüz girilmemiş) kalır", () => {
    const initialLines: AdjustmentLine[] = [
      {
        id: "line-1",
        material: "MLZ001",
        name: "A4 Fotokopi Kağıdı",
        stockPlace: "A-01-01",
        warehouse: "01",
        targetQty: 10,
        countedQty: 0,
        unit: "KO",
        skunit: "PK",
        multiplier: 5,
      },
      {
        id: "line-2",
        material: "MLZ002",
        name: "Tükenmez Kalem",
        stockPlace: "A-01-02",
        warehouse: "01",
        targetQty: 50,
        countedQty: 0,
        unit: "AD",
        skunit: "AD",
        multiplier: 1,
      },
    ];

    // line-1 seçildi (sağda yazan raf: A-01-01)
    const targetLine = initialLines[0];
    // Kullanıcı farklı bir raf okuttu (örn: B-02-04)
    const enteredWh = "01";
    const enteredSp = "B-02-04";

    const isSame = areShelvesEqual(targetLine.stockPlace, targetLine.warehouse, enteredSp, enteredWh);
    expect(isSame).toBe(false);

    // Farklı raf: yeni ürünmüş gibi yeni satır oluşturulur
    const newLineId = `new-shelf-${Date.now()}`;
    const countedInUnit = 1; // 1 koli
    const baseCounted = countedInUnit * targetLine.multiplier; // 5 paket

    const newLine: AdjustmentLine = {
      id: newLineId,
      material: targetLine.material,
      name: targetLine.name,
      barcode: targetLine.barcode,
      targetQty: 0, // planda bu rafta yok, beklenmeyen satır
      countedQty: baseCounted,
      unit: targetLine.unit,
      skunit: targetLine.skunit,
      multiplier: targetLine.multiplier,
      stockPlace: enteredSp,
      warehouse: enteredWh,
    };

    // Yeni satır listeye eklenir, mevcut satırlar korunur
    const resultLines = [newLine, ...initialLines];

    expect(resultLines).toHaveLength(3);

    // 1. Yeni eklenen kart:
    const addedCard = resultLines.find((l) => l.id === newLineId);
    expect(addedCard).toBeDefined();
    expect(addedCard?.stockPlace).toBe("B-02-04");
    expect(addedCard?.targetQty).toBe(0);
    expect(addedCard?.countedQty).toBe(5);

    // 2. Tıklanan orijinal kart: SİYAH ve HENÜZ GİRİLMEMİŞ (countedQty: 0) olarak kalır!
    const originalCard = resultLines.find((l) => l.id === "line-1");
    expect(originalCard).toBeDefined();
    expect(originalCard?.stockPlace).toBe("A-01-01");
    expect(originalCard?.targetQty).toBe(10);
    expect(originalCard?.countedQty).toBe(0); // Dokunulmadı, sayılmadı!
  });
});
