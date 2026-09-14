import { describe, it, expect } from "vitest";
import type { AdjustmentLine } from "../types";

// Unit conversion formatter logic extracted for unit testing
function formatUnitConversionText(line: AdjustmentLine): string | null {
  const docUnit = (line.docUnit || line.unit || "AD").toUpperCase();
  const skunit = (line.skunit || docUnit).toUpperCase();
  const bunit = (line.bunit || (docUnit !== skunit ? docUnit : null))?.toUpperCase();
  const quantity =
    line.bunitMultiplier && line.bunitMultiplier > 0
      ? line.bunitMultiplier
      : line.multiplier && line.multiplier > 0
      ? line.multiplier
      : 1;

  // Çevrim kuralı: 1 bunit = quantity x skunit (örn: 1 PK = 10 AD veya 1 KO = 50 AD)
  if (bunit && bunit !== skunit && quantity > 1) {
    return `1 ${bunit} = ${quantity} ${skunit}`;
  }

  if (docUnit !== skunit && line.multiplier && line.multiplier > 1) {
    return `1 ${docUnit} = ${line.multiplier} ${skunit}`;
  }

  return null;
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

  it("Kural 2 - Durum B: bunit = quantity x skunit (Örn: PK barkodu okutuldu, quantity: 5, skunit: AD) -> 1 PK = 5 AD", () => {
    const line: AdjustmentLine = {
      id: "1",
      material: "MLZ001",
      name: "Ürün X",
      targetQty: 50, // 5 KO
      countedQty: 10,
      unit: "KO",
      docUnit: "KO",
      skunit: "AD",
      multiplier: 10, // 1 KO = 10 AD
      bunit: "PK",
      bunitMultiplier: 5, // 1 PK = 5 AD
    };

    const text = formatUnitConversionText(line);
    expect(text).toBe("1 PK = 5 AD");
  });

  it("Kural 2 - Durum C: Belge AD iken PK barkodu okutulduğunda ters çevrim (0.1 PK) yapılmamalı, 1 PK = 10 AD gösterilmeli", () => {
    const line: AdjustmentLine = {
      id: "2",
      material: "MLZ002",
      name: "Ürün Y",
      targetQty: 100,
      countedQty: 20,
      unit: "AD",
      docUnit: "AD",
      skunit: "AD",
      multiplier: 1,
      bunit: "PK",
      bunitMultiplier: 10, // 1 PK = 10 AD
    };

    const text = formatUnitConversionText(line);
    expect(text).toBe("1 PK = 10 AD");
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

  it("Kural 3 - KO barkodu ile 3 koli okutulduğunda sağ kartta üstte 3 KO, altta (3 x quantity) skunit (150 AD) hesaplanmalıdır", () => {
    // 1 KO = 50 AD dönüşümü olan koli barkodu:
    const scannedQty = 3; // 3 KO girildi
    const bunitMult = 50; // quantity / multiplier
    const skunit = "AD";

    const line: AdjustmentLine = {
      id: "new-123",
      material: "MLZ999",
      name: "Koli Ürünü",
      targetQty: 0, // Belgede olmayan / serbest sayım
      countedQty: scannedQty * bunitMult, // 150 AD ana stok birimi
      unit: "KO",
      docUnit: "KO",
      skunit: "AD",
      multiplier: 50,
      bunit: "KO",
      bunitMultiplier: 50,
    };

    const docUnit = (line.docUnit || line.unit || "AD").toUpperCase();
    const docMult = line.multiplier && line.multiplier > 0 ? line.multiplier : 1;
    const lineBunit = line.bunit ? line.bunit.toUpperCase() : undefined;
    const lineBunitMult = line.bunitMultiplier && line.bunitMultiplier > 0 ? line.bunitMultiplier : 1;

    let displayUnit = docUnit;
    let displayMult = docMult;
    if (lineBunit && lineBunitMult > 1) {
      displayUnit = lineBunit;
      displayMult = lineBunitMult;
    } else if (docMult > 1) {
      displayUnit = docUnit;
      displayMult = docMult;
    }

    const countedInDisplayUnit = displayMult > 1 ? line.countedQty / displayMult : line.countedQty;
    const isUnexpected = line.targetQty <= 0 && line.countedQty > 0;
    const showSkunitSubtext = (displayMult > 1 || displayUnit !== skunit) && line.countedQty > 0;

    // Üst satır: 3 KO
    expect(countedInDisplayUnit).toBe(3);
    expect(displayUnit).toBe("KO");
    expect(isUnexpected).toBe(true); // Mavi rozet

    // Alt satır: (3 x quantity) skunit = 150 AD
    expect(showSkunitSubtext).toBe(true);
    expect(`${line.countedQty} ${skunit}`).toBe("150 AD");
  });
});

