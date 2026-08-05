// -----------------------------------------------------------------------------

// -----------------------------------------------------------------------------

// -----------------------------------------------------------------------------

import type { PickOrder, PickLine, PickRecord, BarcodeResult, RestoredPick } from "../types";

export interface ShelfContext {

  barcode: string;
  warehouse: string;
  stockPlace: string;
}

export type ScanOutcome =
  | { kind: "ok"; lineId: string; material: string; name: string }
  | { kind: "notInOrder"; material: string; name: string }
  | { kind: "alreadyDone"; lineId: string }

  | { kind: "needsBatch"; lineId: string; material: string; name: string }

  | { kind: "exceedsOrder"; lineId: string; message: string; enFazla: number }

  | { kind: "noStock"; lineId: string; message: string }
  | { kind: "error"; message: string };

export function gecerliKayit(r: PickRecord): boolean {
  return !(r.specialStock === "1" && (!r.lot || r.lot === "*"));
}

export const qtyRound = (n: number): number =>
  Math.round((Number(n) + Number.EPSILON) * 1000) / 1000;

export function toOrderQty(stockQty: number, cfactor?: number): number {
  const f = cfactor && cfactor > 0 ? cfactor : 1;
  return qtyRound(stockQty / f);
}

export function linePicked(line: PickLine): number {
  const onceki = line.pickedQty;
  const buOturum = (line.records ?? [])
    .filter(gecerliKayit)
    .reduce((s, r) => s + r.qty, 0);
  return qtyRound(onceki + buOturum);
}

export interface ScanInput {
  order: PickOrder;
  shelf: ShelfContext | null;

  scan: BarcodeResult;

  barcode: string;

  adet: number;

  batchDate?: string;

  makeId?: (i: number) => string;

  now?: () => number;
}

export interface ScanDecision {
  outcome: ScanOutcome;

  record?: PickRecord;
  mergedInto?: string;
}

export function evaluateScan(input: ScanInput): ScanDecision {
  const { order, shelf, scan, barcode, adet, batchDate } = input;
  const makeId = input.makeId ?? (() =>
    `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
  const now = input.now ?? (() => Date.now());

  // Servis barkodu tanımadıysa
  if (!scan.ok) {
    return { outcome: { kind: "error", message: scan.message || "Barkod tanınmadı" } };
  }

  const kacTane = Math.max(1, Math.floor(adet));

  const miktar = qtyRound(scan.quantity > 0 ? scan.quantity : kacTane);
  const barkodBirim = kacTane > 0 ? miktar / kacTane : miktar;

  const adaylar = order.lines.filter((l) => l.product.code === scan.material);
  if (!adaylar.length) {
    return { outcome: { kind: "notInOrder", material: scan.material, name: scan.name } };
  }
  const acikKalemler = adaylar.filter((l) => linePicked(l) < l.requestedQty);
  if (!acikKalemler.length) {
    return { outcome: { kind: "alreadyDone", lineId: adaylar[0].id } };
  }
  const line =
    acikKalemler.find((l) => l.requestedQty - linePicked(l) >= miktar) ??
    acikKalemler.reduce((best, l) =>
      l.requestedQty - linePicked(l) > best.requestedQty - linePicked(best) ? l : best
    );

  const birim = line.product.unit || scan.unit;

  const ozelStok = scan.specialStock || (line.lotTracked ? "1" : "*");

  if (ozelStok === "1" && !batchDate) {

    if (shelf && scan.availStock <= 0) {
      return {
        outcome: {
          kind: "noStock",
          lineId: line.id,
          message: "Bu rafta bu üründen stok yok — doğru rafta mısınız?",
        },
      };
    }
    return {
      outcome: { kind: "needsBatch", lineId: line.id, material: scan.material, name: scan.name },
    };
  }

  const parti = ozelStok === "1" ? batchDate ?? "*" : "*";

  const kalan = line.requestedQty - linePicked(line);
  if (miktar > kalan) {
    return {
      outcome: {
        kind: "exceedsOrder",
        lineId: line.id,
        enFazla: Math.floor(kalan / barkodBirim),
        message: "Sipariş miktarından fazla okutamazsınız",
      },
    };
  }

  const wh = shelf?.warehouse ?? "";
  const sp = shelf?.stockPlace ?? "";
  const mevcut = (line.records ?? []).find(
    (r) =>
      r.warehouse === wh &&
      r.stockPlace === sp &&
      r.specialStock === ozelStok &&
      (r.lot ?? "*") === parti
  );
  const yeniToplam = (mevcut?.qty ?? 0) + miktar;

  if (shelf && (scan.availStock <= 0 || yeniToplam > scan.availStock)) {
    return {
      outcome: {
        kind: "noStock",
        lineId: line.id,
        message: "Stokta okutulan miktara kadar ürün bulunmamaktadır",
      },
    };
  }

  const record: PickRecord = {
    id: mevcut?.id ?? makeId(0),
    material: scan.material,
    warehouse: wh,
    stockPlace: sp,
    specialStock: ozelStok,
    lot: parti,
    qty: yeniToplam,
    unit: birim,
    docType: order.orderType ?? "",

    docNum: order.id,
    itemNo: line.id,
    barcode: barcode.trim(),
    at: now(),
  };

  return {
    outcome: { kind: "ok", lineId: line.id, material: scan.material, name: scan.name },
    record,
    mergedInto: mevcut?.id,
  };
}

export function isoDateToBatch(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((iso ?? "").trim());
  return m ? `${m[1]}${m[2]}${m[3]}` : "";
}

export interface RestoreResult {
  order: PickOrder;

  errors: string[];
}

export function applyRestoredPicks(
  order: PickOrder,
  restored: RestoredPick[],
  makeId: (i: number) => string = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  now: () => number = () => Date.now()
): RestoreResult {
  const errors: string[] = [];

  const bana = restored;
  if (!bana.length) return { order, errors };

  let lines = order.lines;
  let degisti = false;
  let sayac = 0;

  for (const p of bana) {

    let idx = lines.findIndex((l) => l.id === p.itemNo);
    if (idx < 0) idx = lines.findIndex((l) => l.product.code === p.material);
    if (idx < 0) {

      errors.push(`${p.material}: bu emirde yok — atlandı`);
      continue;
    }

    const line = lines[idx];
    const parti = p.specialStock === "1" ? p.lot ?? "*" : "*";

    const mevcut = linePicked(line);
    const kalan = qtyRound(line.requestedQty - mevcut); // daha ne kadar gerekiyor
    const eklenecek = kalan > 0 ? Math.min(p.qty, kalan) : 0;
    const fazla = qtyRound(p.qty - eklenecek);

    if (fazla > 0) {

      const ad = line.product.name ? line.product.name.trim() : "";
      const kisaAd = ad.length > 20 ? ad.slice(0, 20).trim() + "…" : ad;
      const etiket = [line.product.code || p.material, kisaAd].filter(Boolean).join(" ");
      errors.push(
        `Diğer paletteki ${etiket} malzemesi ${fazla} ${line.product.unit} fazla — geri yerine koyunuz`
      );
    }
    if (eklenecek <= 0) continue;

    const eslesen = (line.records ?? []).find(
      (r) =>
        r.material === p.material &&
        r.warehouse === p.warehouse &&
        r.stockPlace === p.stockPlace &&
        r.specialStock === p.specialStock &&
        (r.lot ?? "*") === parti
    );
    const record: PickRecord = {
      id: eslesen?.id ?? makeId(sayac++),
      material: p.material,
      warehouse: p.warehouse,
      stockPlace: p.stockPlace,
      specialStock: p.specialStock,
      lot: parti,
      qty: qtyRound((eslesen?.qty ?? 0) + eklenecek),
      unit: p.unit || line.product.unit,
      docType: order.orderType ?? "",
      docNum: order.id,
      itemNo: line.id,
      barcode: "",
      at: now(),
    };
    lines = lines.map((l, i) =>
      i === idx
        ? {
            ...l,
            records: eslesen
              ? (l.records ?? []).map((r) => (r.id === eslesen.id ? record : r))
              : [...(l.records ?? []), record],
            lot: parti !== "*" ? parti : l.lot,
          }
        : l
    );
    degisti = true;
  }

  return { order: degisti ? { ...order, lines } : order, errors };
}

export function blockingHigherPriorityOrders(
  selected: PickOrder,
  all: PickOrder[]
): PickOrder[] {
  const esik = selected.priority ?? Number.POSITIVE_INFINITY;
  return all
    .filter(
      (o) =>
        o.id !== selected.id &&
        o.priority !== undefined &&
        o.priority < esik &&
        (o.status ?? "open") === "open" // yalnızca hiç başlanmamış (Yeni)
    )
    .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
}
