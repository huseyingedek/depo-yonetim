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
  lineId: string; // hangi satıra (ITEMNO) yerleştirildi — satır bazlı ilerleme için
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

  // Okunan miktar (barkodun getirdiği miktar; yoksa okutma adedi). Bu, yerleştirilecek
  // ÖNERİLEN miktardır; kullanıcı "Kaç tane?" ile değiştirebilir. Miktar, açık satırlara
  // ÜSTTEN sırayla dağıtılır (scanTarget → distributePlacement): 60 → 24, 24, 12 gibi.
  const okunan = scan.quantity > 0 ? scan.quantity : Math.max(1, Math.floor(adet || 1));
  const ilkAcik = acikSatirlar[0];

  // Parti takipli mi? (satırlardan biri parti-takipliyse ya da barkod "1" dönerse)
  const ozelStok = lines.some((l) => l.lotTracked) || scan.specialStock === "1" ? "1" : "*";
  // Parti takipliyse parti adımı HER ZAMAN gelir — parti emirde (BATCHNUM) zaten olsa bile
  // ATLANMAZ (Hüseyin). Kullanıcı partiyi okutunca/onaylayınca (batchDate) devam edilir.
  if (ozelStok === "1" && !batchDate) {
    return { outcome: { kind: "needsBatch", lineId: ilkAcik.id, material: scan.material, name: scan.name } };
  }
  const parti = ozelStok === "1" ? batchDate || ilkAcik.lot || "*" : "*";

  // Miktar toplam kalanı aşamaz (dağıtım/fazla kontrolü scanTarget'ta da yapılır).
  const toplamKalan = acikSatirlar.reduce((s, l) => s + kalanOf(l), 0);
  const qty = Math.min(okunan, toplamKalan);

  return {
    outcome: { kind: "ok", lineId: ilkAcik.id, material: scan.material, name: scan.name },
    ready: { lineId: ilkAcik.id, material: scan.material, name: scan.name, qty, lot: parti, specialStock: ozelStok },
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
    lineId: ready.lineId,
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
