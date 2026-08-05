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

export function evaluatePlacementScan(input: PlacementScanInput): PlacementDecision {
  const { order, source, scan, batchDate } = input;

  if (!scan.ok) return { outcome: { kind: "error", message: scan.message || "Barkod tanınmadı" } };
  if (!source) return { outcome: { kind: "error", message: "Önce kaynak depoyu okutun." } };

  const line = order.lines.find((l) => l.product.code === scan.material);
  if (!line) return { outcome: { kind: "notInOrder", material: scan.material, name: scan.name } };

  // Parti takipli mi? (SPECIALSTOCK=1)
  const ozelStok = scan.specialStock || (line.lotTracked ? "1" : "*");
  if (ozelStok === "1" && !batchDate) {
    return { outcome: { kind: "needsBatch", lineId: line.id, material: scan.material, name: scan.name } };
  }
  const parti = ozelStok === "1" ? batchDate ?? "*" : "*";

  const yerlesen = input.alreadyPlaced ?? 0;
  const kalan = line.requestedQty - yerlesen;
  if (kalan <= 0) {
    return { outcome: { kind: "exceedsAvail", message: "Bu kalem zaten tamamlandı", enFazla: 0 } };
  }

  return {
    outcome: { kind: "ok", lineId: line.id, material: scan.material, name: scan.name },
    ready: { lineId: line.id, material: scan.material, name: scan.name, qty: kalan, lot: parti, specialStock: ozelStok },
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
