// -----------------------------------------------------------------------------
// TOPLAMA KARAR MANTIĞI TESTLERİ
// -----------------------------------------------------------------------------
// Bora (23.07): "asıl iş ilk okutma ile paket gönder arasında." Bu testler tam
// o aralığı kapsıyor: barkod eşleştirme, miktar (çift çarpma yok), kalan/stok
// kontrolleri, kayıt üretimi ve linePicked matematiği.
//
//   npm test
// -----------------------------------------------------------------------------

import { describe, it, expect } from "vitest";
import { evaluateScan, linePicked } from "./pickingLogic";
import type { ShelfContext } from "./pickingLogic";
import type { PickLine, PickOrder, PickRecord, BarcodeResult } from "../types";

/* ----------------------------- Fixture'lar ------------------------------ */

function line(over: Partial<PickLine> = {}): PickLine {
  return {
    id: "3000",
    product: { code: "UD009", name: "Uludağ Su", barcode: "UD009$*$", unit: "AD" },
    location: "",
    requestedQty: 24,
    pickedQty: 0,
    records: [],
    ...over,
  };
}

function order(lines: PickLine[], over: Partial<PickOrder> = {}): PickOrder {
  return {
    id: "26935028",
    orderType: "SO",
    customer: "C1",
    reference: "REF",
    createdAt: "2026-07-23",
    lines,
    ...over,
  };
}

function scan(over: Partial<BarcodeResult> = {}): BarcodeResult {
  return {
    ok: true,
    material: "UD009",
    name: "Uludağ Su",
    unit: "AD",
    quantity: 1,
    availStock: 240,
    specialStock: "*",
    fields: {},
    message: "",
    ...over,
  };
}

const shelf: ShelfContext = { barcode: "D3$C1", warehouse: "D3", stockPlace: "C1" };

/** Deterministik id/zaman — kayıt alanlarını sabit kıyaslayabilmek için */
const sabit = { makeId: (i: number) => `REC${i}`, now: () => 1000 };

function rec(over: Partial<PickRecord> = {}): PickRecord {
  return {
    id: "r", material: "UD009", warehouse: "D3", stockPlace: "C1",
    specialStock: "*", qty: 1, unit: "AD", docType: "SO", docNum: "26935028",
    itemNo: "3000", barcode: "UD009$*$", at: 0, ...over,
  };
}

/* ------------------------------- linePicked ----------------------------- */

describe("linePicked — MOVEDQTY + bu oturumda okutulanlar", () => {
  it("kayıt yoksa MOVEDQTY döner", () => {
    expect(linePicked(line({ pickedQty: 5, records: [] }))).toBe(5);
  });

  it("MOVEDQTY ile kayıtları TOPLAR (ya biri ya öteki değil)", () => {
    const l = line({ pickedQty: 5, records: [rec({ qty: 3 }), rec({ qty: 2 })] });
    expect(linePicked(l)).toBe(10); // 5 + 3 + 2
  });

  it("MOVEDQTY 0 ise sadece kayıtların toplamı", () => {
    expect(linePicked(line({ pickedQty: 0, records: [rec({ qty: 7 })] }))).toBe(7);
  });
});

/* ------------------------------ evaluateScan ---------------------------- */

describe("evaluateScan — eşleştirme", () => {
  it("barkod çözülemezse error", () => {
    const d = evaluateScan({
      order: order([line()]), shelf, adet: 1, barcode: "X",
      scan: scan({ ok: false, message: "Barkod tanınmadı" }), ...sabit,
    });
    expect(d.outcome.kind).toBe("error");
    expect(d.record).toBeUndefined();
  });

  it("MATERIAL emirde yoksa notInOrder", () => {
    const d = evaluateScan({
      order: order([line()]), shelf, adet: 1, barcode: "ZZ",
      scan: scan({ material: "ZZ999", name: "Yok" }), ...sabit,
    });
    expect(d.outcome).toMatchObject({ kind: "notInOrder", material: "ZZ999" });
  });

  it("eşleştirme MATERIAL ile — farklı barkod aynı ürüne düşer", () => {
    // EAN okutuldu ama servis MATERIAL=UD009 döndü → kalem UD009 ile eşleşmeli
    const d = evaluateScan({
      order: order([line()]), shelf, adet: 1, barcode: "8690723511208",
      scan: scan({ material: "UD009", quantity: 24 }), ...sabit,
    });
    expect(d.outcome.kind).toBe("ok");
  });

  it("kalem zaten tamamsa alreadyDone", () => {
    const d = evaluateScan({
      order: order([line({ requestedQty: 5, pickedQty: 5 })]),
      shelf, adet: 1, barcode: "UD009$*$", scan: scan(), ...sabit,
    });
    expect(d.outcome).toMatchObject({ kind: "alreadyDone", lineId: "3000" });
  });
});

describe("evaluateScan — kalem seçimi (aynı malzeme, farklı itemno)", () => {
  it("ilk kalem dolu, ikinci açık → ikinci kaleme (itemno) yazar", () => {
    const l1 = line({ id: "1000", requestedQty: 2, pickedQty: 2 }); // tam
    const l2 = line({ id: "2000", requestedQty: 5, pickedQty: 0 }); // açık
    const d = evaluateScan({
      order: order([l1, l2]), shelf, adet: 1, barcode: "UD009$*$",
      scan: scan({ quantity: 1 }), ...sabit,
    });
    expect(d.outcome.kind).toBe("ok");
    expect(d.record?.itemNo).toBe("2000");
  });

  it("iki açık kalem → yeterli kalanı olanı seçer", () => {
    const l1 = line({ id: "1000", requestedQty: 3, pickedQty: 2 }); // kalan 1
    const l2 = line({ id: "2000", requestedQty: 10, pickedQty: 0 }); // kalan 10
    const d = evaluateScan({
      order: order([l1, l2]), shelf, adet: 1, barcode: "UD009$*$",
      scan: scan({ quantity: 5 }), ...sabit, // 5 lazım; kalan 1 yetmez
    });
    expect(d.record?.itemNo).toBe("2000");
    expect(d.record?.qty).toBe(5);
  });
});

describe("evaluateScan — miktar servisten, çift çarpma yok", () => {
  it("Kaç tane=4, katsayı 1 → tek kayıt qty=4 (birleşik, ayrı satır değil)", () => {
    const d = evaluateScan({
      order: order([line({ product: { code: "KF018", name: "Kraf", barcode: "x", unit: "ST" }, requestedQty: 10 })]),
      shelf, adet: 4, barcode: "6920583837067",
      scan: scan({ material: "KF018", unit: "ST", quantity: 4, availStock: 100 }), ...sabit,
    });
    expect(d.outcome.kind).toBe("ok");
    expect(d.record?.qty).toBe(4);
    expect(d.mergedInto).toBeUndefined();
  });

  it("Kaç tane=2, koli katsayısı 10 → tek kayıt qty=20", () => {
    const d = evaluateScan({
      order: order([line({ requestedQty: 100 })]), shelf, adet: 2,
      barcode: "koli", scan: scan({ quantity: 20, availStock: 240 }), ...sabit,
    });
    expect(d.record?.qty).toBe(20);
  });

  it("servis 0 dönerse ekrandaki adet kadar (qty=3)", () => {
    const d = evaluateScan({
      order: order([line({ requestedQty: 100 })]), shelf, adet: 3,
      barcode: "UD009$*$", scan: scan({ quantity: 0 }), ...sabit,
    });
    expect(d.record?.qty).toBe(3);
  });
});

describe("evaluateScan — BİRLEŞTİRME (Bora index kuralı)", () => {
  it("aynı index tekrar okutulunca miktar birleşir, yeni satır açılmaz", () => {
    const l = line({
      requestedQty: 100,
      records: [rec({ id: "R1", qty: 3, warehouse: "D3", stockPlace: "C1", specialStock: "*", lot: "*" })],
    });
    const d = evaluateScan({
      order: order([l]), shelf, adet: 1, barcode: "UD009$*$",
      scan: scan({ quantity: 2, availStock: 240 }), ...sabit,
    });
    expect(d.outcome.kind).toBe("ok");
    expect(d.mergedInto).toBe("R1");
    expect(d.record?.qty).toBe(5); // 3 + 2
  });

  it("farklı stok yeri → yeni satır (mergedInto boş)", () => {
    const l = line({
      requestedQty: 100,
      records: [rec({ id: "R1", qty: 3, warehouse: "D3", stockPlace: "C1", specialStock: "*", lot: "*" })],
    });
    const shelfC2: ShelfContext = { barcode: "D3$C2", warehouse: "D3", stockPlace: "C2" };
    const d = evaluateScan({
      order: order([l]), shelf: shelfC2, adet: 1, barcode: "UD009$*$",
      scan: scan({ quantity: 2, availStock: 240 }), ...sabit,
    });
    expect(d.mergedInto).toBeUndefined();
    expect(d.record?.qty).toBe(2);
  });

  it("birleşince AVAILSTOCK aşılırsa noStock", () => {
    const l = line({
      requestedQty: 100,
      records: [rec({ id: "R1", qty: 5, warehouse: "D3", stockPlace: "C1", specialStock: "*", lot: "*" })],
    });
    const d = evaluateScan({
      order: order([l]), shelf, adet: 1, barcode: "UD009$*$",
      scan: scan({ quantity: 1, availStock: 5 }), ...sabit, // 5+1=6 > 5
    });
    expect(d.outcome.kind).toBe("noStock");
    expect(d.record).toBeUndefined();
  });
});

describe("evaluateScan — KONTROL 1: sipariş miktarı aşımı", () => {
  it("okutulan > kalan ise exceedsOrder, kayıt açılmaz", () => {
    const d = evaluateScan({
      order: order([line({ requestedQty: 24, pickedQty: 20 })]), shelf, adet: 1,
      barcode: "8690723511208", scan: scan({ quantity: 24 }), ...sabit,
    });
    expect(d.outcome.kind).toBe("exceedsOrder");
    expect(d.record).toBeUndefined();
  });

  it("enFazla = kalanın bir barkoda kaç kez sığdığı", () => {
    const d = evaluateScan({
      order: order([line({ requestedQty: 124, pickedQty: 24 })]), shelf, adet: 5,
      barcode: "8690723511208", scan: scan({ quantity: 120, availStock: 500 }), ...sabit,
    });
    expect(d.outcome).toMatchObject({ kind: "exceedsOrder", enFazla: 4 });
  });

  it("tam kalan kadar okutmak KABUL edilir", () => {
    const d = evaluateScan({
      order: order([line({ requestedQty: 24, pickedQty: 23 })]), shelf, adet: 1,
      barcode: "UD009$*$", scan: scan({ quantity: 1 }), ...sabit,
    });
    expect(d.outcome.kind).toBe("ok");
  });
});

describe("evaluateScan — KONTROL 2: raf stoğu (AVAILSTOCK)", () => {
  it("AVAILSTOCK 0 ise noStock, kayıt açılmaz", () => {
    const d = evaluateScan({
      order: order([line()]), shelf, adet: 1, barcode: "UD009$*$",
      scan: scan({ availStock: 0 }), ...sabit,
    });
    expect(d.outcome.kind).toBe("noStock");
    expect(d.record).toBeUndefined();
  });

  it("raf okutulmamışsa (shelf null) stok kontrolü atlanır", () => {
    const d = evaluateScan({
      order: order([line()]), shelf: null, adet: 1, barcode: "UD009$*$",
      scan: scan({ availStock: 0 }), ...sabit,
    });
    expect(d.outcome.kind).toBe("ok");
  });
});

describe("evaluateScan — SPECIALSTOCK / parti", () => {
  it("SPECIALSTOCK=1 (parti yok) → needsBatch, kayıt açılmaz", () => {
    const d = evaluateScan({
      order: order([line()]), shelf, adet: 1, barcode: "UD009$*$",
      scan: scan({ specialStock: "1" }), ...sabit,
    });
    expect(d.outcome.kind).toBe("needsBatch");
    expect(d.record).toBeUndefined();
  });

  it("SPECIALSTOCK=1 ama rafta hiç stok yok (AVAILSTOCK 0) → noStock, parti sorma", () => {
    // Yanlış raf senaryosu: ürün bu rafta yok, partisiz toplam 0.
    const d = evaluateScan({
      order: order([line()]), shelf, adet: 1, barcode: "UD009$*$",
      scan: scan({ specialStock: "1", availStock: 0 }), ...sabit,
    });
    expect(d.outcome.kind).toBe("noStock");
    expect(d.record).toBeUndefined();
  });

  it("SPECIALSTOCK=1 + parti (batchDate) → kayıt oluşur, parti=tarih", () => {
    const d = evaluateScan({
      order: order([line()]), shelf, adet: 1, barcode: "UD009$*$",
      scan: scan({ specialStock: "1", availStock: 50, quantity: 1 }),
      batchDate: "20260908", ...sabit,
    });
    expect(d.outcome.kind).toBe("ok");
    expect(d.record?.specialStock).toBe("1");
    expect(d.record?.lot).toBe("20260908");
  });

  it("SPECIALSTOCK=* → kayıt specialStock=*, parti=*", () => {
    const d = evaluateScan({
      order: order([line()]), shelf, adet: 1, barcode: "UD009$*$",
      scan: scan({ specialStock: "*", quantity: 1 }), ...sabit,
    });
    expect(d.record?.specialStock).toBe("*");
    expect(d.record?.lot).toBe("*");
  });

  it("kayıt tüm alanları doğru taşır", () => {
    const d = evaluateScan({
      order: order([line()]), shelf, adet: 1, barcode: "UD009$*$",
      scan: scan({ quantity: 1 }), ...sabit,
    });
    expect(d.record).toMatchObject({
      id: "REC0", material: "UD009", warehouse: "D3", stockPlace: "C1",
      qty: 1, unit: "AD", docType: "SO", docNum: "26935028", itemNo: "3000",
      lot: "*", at: 1000,
    });
  });
});
