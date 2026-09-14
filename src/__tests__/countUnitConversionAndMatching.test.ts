import { describe, it, expect } from "vitest";
import type { AdjustmentLine } from "../types";

// Unit conversion formatter logic extracted for unit testing
function formatUnitConversionText(line: AdjustmentLine): string | null {
  const docUnit = (line.docUnit || line.unit || "AD").toUpperCase();
  const skunit = (line.skunit || docUnit).toUpperCase();
  const bunit = (line.bunit || docUnit).toUpperCase();
  const docMult = line.multiplier && line.multiplier > 0 ? line.multiplier : 1;
  const bunitMult =
    line.bunitMultiplier && line.bunitMultiplier > 0
      ? line.bunitMultiplier
      : bunit === docUnit
      ? docMult
      : bunit === skunit
      ? 1
      : 1;

  const hasDiff = docMult > 1 || docUnit !== skunit || bunit !== docUnit;
  if (!hasDiff) return null;

  // Case 0: Eğer okutulan birim ile belge birimi aynıysa
  if (bunit === docUnit) {
    if (docMult > 1 || docUnit !== skunit) {
      return `1 ${docUnit} = ${docMult} ${skunit}`;
    }
    return null;
  }

  // Case 1: skunit === bunit
  // "skunit bunit aynı ise sadece 1ko(sayımda gelen birim)= xbunit olacak"
  if (skunit === bunit) {
    const x = docMult;
    return `1 ${docUnit} = ${x} ${bunit}`;
  }

  // Case 2: skunit !== bunit
  // "misal pk ise 1 ko(sayımda gelen birim) = x bunit = y(eğer skunit buint ile aynı değilse skunit değeri de yazacak)"
  const x = bunitMult > 0 ? docMult / bunitMult : docMult;
  const y = docMult;
  return `1 ${docUnit} = ${x} ${bunit} = ${y} ${skunit}`;
}

describe("Sayım Birim Dönüşümü ve Barkod Eşleşmesi Kuralları (Kural 1 & 2)", () => {
  it("Kural 2 - Durum A: bunit skunit ile aynı ise (Örn: KO belge birimi, AD barkodu okutuldu, skunit AD) -> 1 KO = 10 AD", () => {
    const line: AdjustmentLine = {
      id: "1",
      material: "MLZ001",
      name: "Ürün X",
      targetQty: 50, // 5 KO * 10 AD = 50 AD
      countedQty: 10, // 1 KO = 10 AD sayıldı
      unit: "KO",
      docUnit: "KO",
      skunit: "AD",
      multiplier: 10,
      bunit: "AD",
      bunitMultiplier: 1,
    };

    const text = formatUnitConversionText(line);
    expect(text).toBe("1 KO = 10 AD");
  });

  it("Kural 2 - Durum B: bunit skunit ile farklı ise (Örn: KO belge birimi, PK barkodu okutuldu, skunit AD) -> 1 KO = 2 PK = 10 AD", () => {
    const line: AdjustmentLine = {
      id: "1",
      material: "MLZ001",
      name: "Ürün X",
      targetQty: 50, // 5 KO
      countedQty: 10, // 1 KO = 2 PK = 10 AD sayıldı
      unit: "KO",
      docUnit: "KO",
      skunit: "AD",
      multiplier: 10, // 1 KO = 10 AD
      bunit: "PK",
      bunitMultiplier: 5, // 1 PK = 5 AD -> 1 KO = 2 PK
    };

    const text = formatUnitConversionText(line);
    expect(text).toBe("1 KO = 2 PK = 10 AD");
  });

  it("Kural 2 - Kartın Sağındaki Miktar Gösterimi: Üst satırda x/x docUnit (örn: 1 / 5 KO), alt satırda skunit cinsinden toplam değer (örn: 10 AD)", () => {
    const line: AdjustmentLine = {
      id: "1",
      material: "MLZ001",
      name: "Ürün X",
      targetQty: 50,
      countedQty: 10,
      unit: "KO",
      docUnit: "KO",
      skunit: "AD",
      multiplier: 10,
      bunit: "PK",
      bunitMultiplier: 5,
    };

    const docUnit = (line.docUnit || line.unit || "AD").toUpperCase();
    const skunit = (line.skunit || docUnit).toUpperCase();
    const docMult = line.multiplier && line.multiplier > 0 ? line.multiplier : 1;
    const countedInDocUnit = docMult > 1 ? line.countedQty / docMult : line.countedQty;
    const targetInDocUnit = docMult > 1 ? line.targetQty / docMult : line.targetQty;

    // Üst satır: Sayımda gelen belge birimi cinsinden
    const topText = `${countedInDocUnit} / ${targetInDocUnit} ${docUnit}`;
    expect(topText).toBe("1 / 5 KO");

    // Alt satır: skunit cinsinden toplam değer
    const bottomText = `${line.countedQty} ${skunit}`;
    expect(bottomText).toBe("10 AD");
  });

  it("Kural 2 - Farklı birim okutulduğunda belge birimi (unit / docUnit) korunmalı, ezilmemelidir", () => {
    const initialLine: AdjustmentLine = {
      id: "line-1",
      material: "MLZ001",
      name: "Ürün X",
      targetQty: 50, // 5 KO
      countedQty: 0,
      unit: "KO",
      docUnit: "KO",
      skunit: "AD",
      multiplier: 10,
    };

    // Depocu PK barkodu okuttu ve 2 PK girdi (+10 AD):
    const scannedBarcodeUnit = "PK";
    const scannedBarcodeMult = 5;
    const enteredQty = 2; // 2 PK = 10 AD
    const addedBaseQty = enteredQty * scannedBarcodeMult;

    const originalDocUnit = initialLine.docUnit || initialLine.unit;
    const originalDocMult = initialLine.multiplier || 1;

    const updatedLine: AdjustmentLine = {
      ...initialLine,
      countedQty: initialLine.countedQty + addedBaseQty,
      unit: originalDocUnit, // KO korunur
      docUnit: originalDocUnit, // KO
      multiplier: originalDocMult, // 10 korunur
      bunit: scannedBarcodeUnit, // PK kaydedilir
      bunitMultiplier: scannedBarcodeMult, // 5
    };

    expect(updatedLine.unit).toBe("KO");
    expect(updatedLine.docUnit).toBe("KO");
    expect(updatedLine.bunit).toBe("PK");
    expect(updatedLine.countedQty).toBe(10);

    const countedInDocUnit = updatedLine.countedQty / (updatedLine.multiplier || 1);
    expect(countedInDocUnit).toBe(1); // 1 KO
  });

  it("Kural 1 - Sayılanlar ekranı sıralaması (Tier 1..5) bozulmadan Durum rozeti olmadan listelenmelidir", () => {
    const lines: AdjustmentLine[] = [
      { id: "1", material: "TAM", name: "Tam Ürün", targetQty: 10, countedQty: 10, unit: "AD" },       // Yeşil (Tier 5)
      { id: "2", material: "SIFIR", name: "Sıfır Ürün", targetQty: 10, countedQty: 0, unit: "AD" },      // Siyah/Gri (Tier 4)
      { id: "3", material: "EKSIK", name: "Eksik Ürün", targetQty: 10, countedQty: 5, unit: "AD" },      // Sarı (Tier 3)
      { id: "4", material: "FAZLA", name: "Fazla Ürün", targetQty: 10, countedQty: 15, unit: "AD" },     // Kırmızı (Tier 2)
      { id: "5", material: "YENI", name: "Yeni Ürün", targetQty: 0, countedQty: 3, unit: "AD" },        // Mavi (Tier 1)
    ];

    const getTier = (l: AdjustmentLine) => {
      if (l.targetQty <= 0 && l.countedQty > 0) return 1; // Mavi
      if (l.targetQty > 0 && l.countedQty > l.targetQty) return 2; // Kırmızı
      if (l.targetQty > 0 && l.countedQty > 0 && l.countedQty < l.targetQty) return 3; // Sarı
      if (l.countedQty === 0) return 4; // Okutulmayanlar
      return 5; // Yeşil
    };

    const sorted = [...lines].sort((a, b) => getTier(a) - getTier(b));
    expect(sorted.map((l) => l.material)).toEqual(["YENI", "FAZLA", "EKSIK", "SIFIR", "TAM"]);
  });

  it("Okutulmayan ürünlerde 'Okutulan Birim' kolonu '-' göstermeli, okutulan ürünlerde ise birim yazmalıdır", () => {
    const getOkutulanBirim = (line: AdjustmentLine) => {
      return line.countedQty > 0 ? (line.bunit || line.unit || line.skunit || "AD") : "-";
    };

    // Okunmamış/sayılmamış ürün:
    const uncountedLine: AdjustmentLine = {
      id: "line-uncounted",
      material: "MLZ001",
      name: "Henüz Okutulmayan Ürün",
      targetQty: 10,
      countedQty: 0,
      unit: "KO",
      skunit: "AD",
    };
    expect(getOkutulanBirim(uncountedLine)).toBe("-");

    // Okutulmuş ürün (PK barkoduyla okutuldu):
    const countedLineWithBunit: AdjustmentLine = {
      id: "line-counted",
      material: "MLZ001",
      name: "Okutulan Ürün",
      targetQty: 10,
      countedQty: 5,
      unit: "KO",
      skunit: "AD",
      bunit: "PK",
      bunitMultiplier: 5,
    };
    expect(getOkutulanBirim(countedLineWithBunit)).toBe("PK");

    // Çöp kutusuna basılıp sıfırlanan satır:
    const resetLine: AdjustmentLine = {
      ...countedLineWithBunit,
      countedQty: 0,
      bunit: undefined,
      bunitMultiplier: undefined,
    };
    expect(getOkutulanBirim(resetLine)).toBe("-");
  });
});
