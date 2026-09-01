// -----------------------------------------------------------------------------

// -----------------------------------------------------------------------------


// -----------------------------------------------------------------------------

import type { PickOrder, BarcodeResult } from "../types";

export interface SourceContext {
  warehouse: string;
  stockPlace: string;
}

export interface TargetContext {
  barcode: string;
  warehouse: string;
  stockPlace: string;
}

export type PlacementOutcome =
  | { kind: "ok"; lineId: string; material: string; name: string }
  | { kind: "notInOrder"; material: string; name: string }

  | { kind: "needsBatch"; lineId: string; material: string; name: string }

  | { kind: "exceedsAvail"; message: string; enFazla: number }
  | { kind: "error"; message: string };

export interface ReadyPlacement {
  lineId: string;
  material: string;
  name: string;
  qty: number;
  lot: string;
  specialStock: string;
}

export interface PlacementRecord {
  id: string;
  material: string;
  sourceWarehouse: string;
  sourceShelf: string;
  targetWarehouse: string;
  targetShelf: string;
  lot: string;
  specialStock: string;
  qty: number;
  at: number;
}

export function validateSource(
  order: PickOrder,
  warehouse: string,
  stockPlace: string
): { ok: boolean; message: string } {
  // Kaynak = emrin WAREHOUSEFA + FRONTAREA'sı. Okutulan WAREHOUSE + STOCKPLACE
  // ikisiyle de birebir aynı olmalı (Hüseyin).
  const bekDepo = order.sourceWarehouse ?? "";
  const bekRaf = order.sourceShelf ?? "";
  if (!bekDepo && !bekRaf) return { ok: true, message: "" }; // doğrulanacak bilgi yok
  const depoOk = !bekDepo || warehouse === bekDepo;
  const rafOk = !bekRaf || stockPlace === bekRaf;
  if (depoOk && rafOk) return { ok: true, message: "" };
  return {
    ok: false,
    message: `Yanlış kaynak. Beklenen Depo ${bekDepo} · Stok yeri ${bekRaf}, okunan Depo ${warehouse} · Stok yeri ${stockPlace}`,
  };
}

export interface PlacementScanInput {
  order: PickOrder;

  source: SourceContext | null;

  scan: BarcodeResult;

  adet: number;

  batchDate?: string;

  alreadyPlaced?: number;
}

export interface PlacementDecision {
  outcome: PlacementOutcome;

  ready?: ReadyPlacement;
}

// Aynı malzemenin TÜM açık satırlarındaki toplam kalan miktar.
// (Bora: aynı malzeme farklı depo/stok yeri/partide 3 ayrı satır gelebilir.)
export function materialRemaining(order: PickOrder, material: string): number {
  return order.lines
    .filter((l) => l.product.code === material)
    .reduce((s, l) => s + Math.max(0, l.requestedQty - l.pickedQty), 0);
}

export interface PlacementAllocation {
  lineId: string;
  lot: string;
  specialStock: string;
  qty: number;
}

// Girilen miktarı, aynı malzemenin açık satırlarına SIRAYLA dağıtır:
// ilk satırı doldur, kalanı sonrakine... (Bora, 05.08).
export function distributePlacement(
  order: PickOrder,
  material: string,
  totalQty: number,
  fallbackLot = "*"
): PlacementAllocation[] {
  const acikSatirlar = order.lines.filter(
    (l) => l.product.code === material && l.requestedQty - l.pickedQty > 0
  );
  let kalan = totalQty;
  const allocations: PlacementAllocation[] = [];
  for (const l of acikSatirlar) {
    if (kalan <= 0) break;
    const satirKalan = l.requestedQty - l.pickedQty;
    const pay = Math.min(kalan, satirKalan);
    if (pay <= 0) continue;
    allocations.push({
      lineId: l.id,
      lot: l.lot ?? fallbackLot,
      specialStock: l.lotTracked ? "1" : "*",
      qty: pay,
    });
    kalan -= pay;
  }
  return allocations;
}

export function evaluatePlacementScan(input: PlacementScanInput): PlacementDecision {
  const { order, source, scan, batchDate, adet } = input;

  if (!scan.ok) return { outcome: { kind: "error", message: scan.message || "Barkod tanınmadı" } };
  if (!source) return { outcome: { kind: "error", message: "Önce kaynak depoyu okutun." } };

  // Aynı malzeme birden fazla satırda olabilir (farklı sipariş/depo/parti).
  const lines = order.lines.filter((l) => l.product.code === scan.material);
  if (!lines.length) return { outcome: { kind: "notInOrder", material: scan.material, name: scan.name } };

  // Açık (kalanı olan) satırlar
  const kalanOf = (l: (typeof lines)[number]) => l.requestedQty - l.pickedQty;
  const acikSatirlar = lines.filter((l) => kalanOf(l) > 0);
  if (!acikSatirlar.length) {
    return { outcome: { kind: "exceedsAvail", message: "Bu kalem zaten tamamlandı", enFazla: 0 } };
  }

  // Parti takipli mi? (SPECIALSTOCK=1). Satırlarda parti zaten varsa sormaya gerek yok.
  const ozelStok = scan.specialStock || (lines.some((l) => l.lotTracked) ? "1" : "*");
  const satirdaLotVar = lines.some((l) => !!l.lot);
  if (ozelStok === "1" && !batchDate && !satirdaLotVar) {
    return { outcome: { kind: "needsBatch", lineId: acikSatirlar[0].id, material: scan.material, name: scan.name } };
  }
  const parti = ozelStok === "1" ? batchDate ?? "*" : "*";

  // Okunan miktar (barkodun getirdiği miktar; yoksa okutma adedi).
  const okunan = scan.quantity > 0 ? scan.quantity : Math.max(1, Math.floor(adet || 1));

  // TEK satır eşle (toplamadaki mantık): kalanı okunana yeten ilk satır, yoksa en çok kalanı olan.
  // Böylece bir okutma yalnız BİR satıra, okunan miktar kadar yazılır — satırlar/siparişler
  // arası dağıtım YOK.
  const line =
    acikSatirlar.find((l) => kalanOf(l) >= okunan) ??
    acikSatirlar.reduce((best, l) => (kalanOf(l) > kalanOf(best) ? l : best));

  // Miktar okunandan ve o satırın kalanından fazla olamaz.
  const qty = Math.min(okunan, kalanOf(line));

  return {
    outcome: { kind: "ok", lineId: line.id, material: scan.material, name: scan.name },
    ready: { lineId: line.id, material: scan.material, name: scan.name, qty, lot: parti, specialStock: ozelStok },
  };
}

export function buildPlacementRecord(
  ready: ReadyPlacement,
  source: SourceContext,
  target: TargetContext,
  qty?: number,
  makeId: (i: number) => string = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  now: () => number = () => Date.now()
): PlacementRecord {
  return {
    id: makeId(0),
    material: ready.material,
    sourceWarehouse: source.warehouse,
    sourceShelf: source.stockPlace,
    targetWarehouse: target.warehouse,
    targetShelf: target.stockPlace,
    lot: ready.lot,
    specialStock: ready.specialStock,
    qty: qty && qty > 0 ? qty : ready.qty,
    at: now(),
  };
}
