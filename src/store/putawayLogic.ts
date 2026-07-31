// -----------------------------------------------------------------------------
// YERLEŞTİRME KARAR MANTIĞI — saf fonksiyonlar (api/zustand/localStorage YOK)
// -----------------------------------------------------------------------------
// Toplamanın tersi: TEK kaynaktan al → ÇOK rafa dağıt, TEK TEK.
// pickingLogic ile aynı desende; ağa çıkmaz, state tutmaz — girdi alır, karar döner.
//
// AKIŞ (Bora):
//   1. Listing (PIISPICK=0) — emri seç.
//   2. KAYNAK depo okut (bir kez) → emrin WAREHOUSEFA/FRONTAREA'sıyla DOĞRULA.
//   3. Hedef raf + Ürün/Parti + Miktar okut → stok KAYNAK availqty ile kontrol.
//      (readBarcode'a KAYNAK depo/stok yeri gönderilir → scan.availStock = kaynak stok.)
//   4. Yerleştirmeyi kaydet (MZYSavePlacement — Bora verecek).
// -----------------------------------------------------------------------------

import type { PickOrder, BarcodeResult } from "../types";

/** 2. adımda okutulan KAYNAK (çıkış) depo/rafı. */
export interface SourceContext {
  warehouse: string;
  stockPlace: string;
}

/** 3. adımda okutulan HEDEF raf (nereye konacak). */
export interface TargetContext {
  barcode: string;
  warehouse: string;
  stockPlace: string;
}

/** Bir yerleştirme okutmasının sonucu — ekran buna göre tepki verir. */
export type PlacementOutcome =
  | { kind: "ok"; lineId: string; material: string; name: string }
  | { kind: "notInOrder"; material: string; name: string }
  /** SPECIALSTOCK=1 → parti takipli, parti barkodu beklenir. */
  | { kind: "needsBatch"; lineId: string; material: string; name: string }
  /** Kaynakta yeterli stok yok — `enFazla` = en çok kaç taşınabilir. */
  | { kind: "exceedsAvail"; message: string; enFazla: number }
  /** Hedef raf henüz okutulmadı. */
  | { kind: "noTarget"; message: string }
  | { kind: "error"; message: string };

/** Kabul edilen bir yerleştirme kaydı (SavePlacement'a gidecek). */
export interface PlacementRecord {
  id: string;
  material: string;
  sourceWarehouse: string;
  sourceShelf: string;
  targetWarehouse: string;
  targetShelf: string;
  lot: string; // "*" ya da parti (YYYYAAGG)
  specialStock: string; // "1" parti takipli, "*" değil
  qty: number;
  at: number;
}

/**
 * KAYNAK DOĞRULAMA — 2. adımda okutulan depo, emrin kaynak depo/rafıyla aynı mı?
 * Emir kaynak bilgisi yoksa (servis alanı henüz netleşmediyse) doğrulama atlanır.
 */
export function validateSource(
  order: PickOrder,
  warehouse: string,
  stockPlace: string
): { ok: boolean; message: string } {
  const bekDepo = order.sourceWarehouse ?? "";
  const bekRaf = order.sourceShelf ?? "";
  if (!bekDepo && !bekRaf) return { ok: true, message: "" }; // doğrulanacak bilgi yok
  const depoOk = !bekDepo || warehouse === bekDepo;
  const rafOk = !bekRaf || stockPlace === bekRaf;
  if (depoOk && rafOk) return { ok: true, message: "" };
  return {
    ok: false,
    message: `Yanlış kaynak. Beklenen ${bekDepo}${bekRaf ? "/" + bekRaf : ""}, okunan ${warehouse}/${stockPlace}`,
  };
}

export interface PlacementScanInput {
  order: PickOrder;
  /** 2. adımda okutulan kaynak depo */
  source: SourceContext | null;
  /** 3. adımda okutulan hedef raf */
  target: TargetContext | null;
  /** api.readBarcode sonucu — KAYNAK depo/stok yeriyle çağrıldığı için
   *  scan.availStock = KAYNAKTAKİ stok. */
  scan: BarcodeResult;
  /** ekranda girilen "kaç tane" */
  adet: number;
  /** parti takipli üründe okutulan parti (YYYYAAGG). Yoksa "needsBatch" döner. */
  batchDate?: string;
  makeId?: (i: number) => string;
  now?: () => number;
}

export interface PlacementDecision {
  outcome: PlacementOutcome;
  record?: PlacementRecord;
}

/**
 * Bir ürün okutmasını yerleştirme için değerlendirir. Ağa çıkmaz — servis sonucu
 * (scan) dışarıdan verilir. Karar + (kabulse) üretilecek kaydı döner.
 */
export function evaluatePlacementScan(input: PlacementScanInput): PlacementDecision {
  const { order, source, target, scan, adet, batchDate } = input;
  const makeId = input.makeId ?? (() => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
  const now = input.now ?? (() => Date.now());

  if (!scan.ok) return { outcome: { kind: "error", message: scan.message || "Barkod tanınmadı" } };
  if (!source) return { outcome: { kind: "error", message: "Önce kaynak depoyu okutun." } };
  if (!target) return { outcome: { kind: "noTarget", message: "Önce hedef rafı okutun." } };

  const kacTane = Math.max(1, Math.floor(adet));
  const miktar = scan.quantity > 0 ? scan.quantity : kacTane;

  // Ürün bu emirde var mı?
  const line = order.lines.find((l) => l.product.code === scan.material);
  if (!line) return { outcome: { kind: "notInOrder", material: scan.material, name: scan.name } };

  // Parti takipli mi? (SPECIALSTOCK=1)
  const ozelStok = scan.specialStock || (line.lotTracked ? "1" : "*");
  if (ozelStok === "1" && !batchDate) {
    return { outcome: { kind: "needsBatch", lineId: line.id, material: scan.material, name: scan.name } };
  }
  const parti = ozelStok === "1" ? batchDate ?? "*" : "*";

  // KAYNAK STOK KONTROLÜ — taşınmak istenen miktar kaynaktaki stoğu (availStock) aşamaz.
  if (scan.availStock <= 0 || miktar > scan.availStock) {
    return {
      outcome: {
        kind: "exceedsAvail",
        message: "Kaynakta yeterli stok yok",
        enFazla: Math.max(0, Math.floor(scan.availStock)),
      },
    };
  }

  const record: PlacementRecord = {
    id: makeId(0),
    material: scan.material,
    sourceWarehouse: source.warehouse,
    sourceShelf: source.stockPlace,
    targetWarehouse: target.warehouse,
    targetShelf: target.stockPlace,
    lot: parti,
    specialStock: ozelStok,
    qty: miktar,
    at: now(),
  };
  return { outcome: { kind: "ok", lineId: line.id, material: scan.material, name: scan.name }, record };
}
