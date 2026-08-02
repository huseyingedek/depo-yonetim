import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { PickOrder, PickRecord, StockBatch } from "../types";
import { api } from "../api/client";
import { evaluateScan, linePicked, gecerliKayit, qtyRound, applyRestoredPicks } from "./pickingLogic";
import type { ShelfContext, ScanOutcome } from "./pickingLogic";

export type { ShelfContext, ScanOutcome } from "./pickingLogic";
export { linePicked } from "./pickingLogic";

const SAVEPICK_AKTIF = true;

function partiToBatchnum(s: string): string {
  const t = (s ?? "").trim();

  let m = t.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$/);
  if (m) return `${m[3]}${m[2].padStart(2, "0")}${m[1].padStart(2, "0")}`;

  m = t.match(/^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})$/);
  if (m) return `${m[1]}${m[2].padStart(2, "0")}${m[3].padStart(2, "0")}`;

  return t;
}

function kayitUpsert(
  order: PickOrder,
  lineId: string,
  record: PickRecord,
  mergedInto?: string
): PickOrder {
  const lines = order.lines.map((l) => {
    if (l.id !== lineId) return l;
    const recs = l.records ?? [];
    const yeni = mergedInto
      ? recs.map((r) => (r.id === mergedInto ? record : r))
      : [...recs, record];
    const lot = record.lot && record.lot !== "*" ? record.lot : l.lot;
    return { ...l, records: yeni, lot };
  });
  return { ...order, lines };
}

export function caniasDateTime(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(
    d.getMinutes()
  )}:${p(d.getSeconds())}`;
}

export function mergeRecords(fresh: PickOrder, saklanan: PickOrder | null): PickOrder {
  if (!saklanan || saklanan.id !== fresh.id) return fresh;

  const saklananHaritasi = new Map(saklanan.lines.map((l) => [l.id, l]));
  return {
    ...fresh,
    lines: fresh.lines.map((l) => {
      const sl = saklananHaritasi.get(l.id);

      // ekranda toplanmış gibi görünmesin.
      const kayitlar = (sl?.records ?? []).filter(gecerliKayit);
      if (!kayitlar.length) return l;

      return {
        ...l,
        records: kayitlar,
        lot: sl?.lot && sl.lot !== "*" ? sl.lot : l.lot,
        expiry: sl?.expiry ?? l.expiry,
      };
    }),
  };
}

interface PickingState {
  order: PickOrder | null;
  loading: boolean;
  completing: boolean;

  locationsLoading: boolean;

  shelf: ShelfContext | null;

  pendingProduct: { lineId: string; barcode: string; adet: number } | null;

  batchList: StockBatch[];

  batchError: string | null;

  batchLoading: boolean;

  loadOrder: (id: string, orderType?: string) => Promise<void>;
  clear: () => void;

  leaveOrder: () => void;

  scanShelf: (barcode: string) => Promise<{ ok: boolean; message: string; restoreErrors?: string[] }>;

  clearShelf: () => void;

  scanProduct: (barcode: string, adet?: number) => Promise<ScanOutcome>;

  removeRecord: (lineId: string, recordId: string) => void;

  decreaseRecord: (lineId: string, recordId: string, qty: number) => void;

  setLot: (lineId: string, lot: string, expiry?: string) => void;

  scanLot: (lineId: string, lot: string) => Promise<{ ok: boolean; message: string }>;

  selectBatch: (lineId: string, batchNum: string) => Promise<{ ok: boolean; message: string }>;

  complete: () => Promise<CompleteResult>;
}

export type CompleteResult =
  | { ok: true; containerId: string }
  | { ok: false; message: string };

export const usePickingStore = create<PickingState>()(
  persist(
    (set, get) => ({
  order: null,
  loading: false,
  completing: false,
  locationsLoading: false,
  shelf: null,
  pendingProduct: null,
  batchList: [],
  batchError: null,
  batchLoading: false,

  loadOrder: async (id: string, orderType = "") => {

    const oncekiOrder = get().order?.id === id ? get().order : null;
    const oncekiShelf = get().order?.id === id ? get().shelf : null;

    set({ loading: true, order: oncekiOrder, shelf: oncekiShelf });
    try {
      const taze = await api.getPickOrder(id, orderType);

      let order = taze ? mergeRecords(taze, oncekiOrder) : oncekiOrder;

      if (order && !order.startTime) {
        order = { ...order, startTime: oncekiOrder?.startTime ?? caniasDateTime() };
      }
      set({ order, loading: false });
      if (!order) return;

      set({ locationsLoading: true });
      try {
        const rafli = await api.fillLocations(order);

        if (get().order?.id === rafli.id) set({ order: rafli });
      } finally {
        set({ locationsLoading: false });
      }
    } catch {
      set({ order: null, loading: false, locationsLoading: false });
    }
  },

  clear: () => set({ order: null, shelf: null, pendingProduct: null, batchList: [], batchError: null, batchLoading: false }),

  leaveOrder: () => {
    const order = get().order;
    if (order) {

      api.cancelPick(order.id, order.orderType ?? "").catch(() => {});
    }

    set({ pendingProduct: null, shelf: null, batchList: [], batchError: null, batchLoading: false });
  },

  scanShelf: async (barcode: string) => {
    try {
      const r = await api.readShelfBarcode(barcode.trim());
      if (!r.ok) return { ok: false, message: r.message || "Raf barkodu okunamadı" };

      set({
        shelf: {
          barcode: `${r.warehouse}$${r.stockPlace}`,
          warehouse: r.warehouse,
          stockPlace: r.stockPlace,
        },
      });

      const order = get().order;
      let restoreErrors: string[] = [];
      if (order && r.restored?.length) {
        const res = applyRestoredPicks(order, r.restored);
        if (res.order !== order) set({ order: res.order });
        restoreErrors = res.errors;
      }

      return { ok: true, message: "", restoreErrors };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
  },

  clearShelf: () => set({ shelf: null }),

  scanProduct: async (barcode: string, adet = 1) => {
    const order = get().order;
    if (!order) return { kind: "error", message: "Emir yüklü değil" };
    const shelf = get().shelf;

    let sonuc;
    try {

      sonuc = await api.readBarcode(
        barcode.trim(),
        shelf?.warehouse ?? "",
        shelf?.stockPlace ?? "",
        Math.max(1, Math.floor(adet)) // ekranda girilen "kaç tane"
      );
    } catch (e) {
      return { kind: "error", message: e instanceof Error ? e.message : String(e) };
    }

    const karar = evaluateScan({ order, shelf, scan: sonuc, barcode, adet });

    if (karar.outcome.kind === "needsBatch") {
      const bekLineId = karar.outcome.lineId;
      set({
        pendingProduct: { lineId: bekLineId, barcode: barcode.trim(), adet: Math.max(1, Math.floor(adet)) },
        batchList: [],
        batchError: null,
        batchLoading: true,
      });

      api
        .getStock(sonuc.material, shelf?.warehouse ?? "", shelf?.stockPlace ?? "")
        .then((batches) => { if (get().pendingProduct?.lineId === bekLineId) set({ batchList: batches, batchLoading: false }); })
        .catch((e) => {
          if (get().pendingProduct?.lineId === bekLineId) {
            set({ batchError: e instanceof Error ? e.message : String(e), batchLoading: false });
          }
        });
      return karar.outcome;
    }

    if (karar.outcome.kind === "ok" && karar.record) {
      set({
        order: kayitUpsert(order, karar.outcome.lineId, karar.record, karar.mergedInto),
      });
    }
    return karar.outcome;
  },

  removeRecord: (lineId, recordId) => {
    const order = get().order;
    if (!order) return;
    const lines = order.lines.map((l) =>
      l.id === lineId
        ? { ...l, records: (l.records ?? []).filter((r) => r.id !== recordId) }
        : l
    );
    set({ order: { ...order, lines } });
  },

  decreaseRecord: (lineId, recordId, qty) => {
    const order = get().order;
    if (!order) return;
    const lines = order.lines.map((l) => {
      if (l.id !== lineId) return l;
      const records = (l.records ?? []).map((r) => {
        if (r.id !== recordId) return r;

        const yeni = Math.max(1, Math.min(r.qty, qty));
        return { ...r, qty: yeni };
      });
      return { ...l, records };
    });
    set({ order: { ...order, lines } });
  },

  setLot: (lineId: string, lot: string, expiry?: string) => {
    const order = get().order;
    if (!order) return;

    const lines = order.lines.map((l) =>
      l.id === lineId
        ? {
            ...l,
            lot,
            expiry,
            records: (l.records ?? []).map((r) => (r.lot ? r : { ...r, lot })),
          }
        : l
    );
    set({ order: { ...order, lines } });
  },

  scanLot: async (lineId, lot) => {
    const order = get().order;
    const shelf = get().shelf;
    const pending = get().pendingProduct;
    if (!order) return { ok: false, message: "Emir yüklü değil" };
    const line = order.lines.find((l) => l.id === lineId);
    if (!line) return { ok: false, message: "Kalem bulunamadı" };

    const barkod = pending?.barcode || line.product.barcode || `${line.product.code}$*$`;
    const adet = pending?.adet ?? 1;

    const parti = partiToBatchnum(lot);
    let sonuc;
    try {
      sonuc = await api.readBarcode(
        barkod,
        shelf?.warehouse ?? "",
        shelf?.stockPlace ?? "",
        adet,
        parti
      );
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }

    if (!sonuc.ok) {
      return { ok: false, message: sonuc.message || "Parti okunamadı" };
    }
    if (sonuc.material && sonuc.material !== line.product.code) {
      return { ok: false, message: "Bu parti bu ürüne ait değil" };
    }

    const karar = evaluateScan({
      order,
      shelf,
      scan: sonuc,
      barcode: barkod,
      adet,
      batchDate: parti, // kayda YYYYAAGG olarak yazılsın
    });
    if (karar.outcome.kind !== "ok" || !karar.record) {
      const msg =
        "message" in karar.outcome ? karar.outcome.message : "Parti eklenemedi";
      return { ok: false, message: msg };
    }
    set({
      order: kayitUpsert(order, lineId, karar.record, karar.mergedInto),
      pendingProduct: null,
      batchList: [],
    });
    return { ok: true, message: "" };
  },

  selectBatch: async (lineId, batchNum) => {
    const order = get().order;
    const shelf = get().shelf;
    const pending = get().pendingProduct;
    if (!order) return { ok: false, message: "Emir yüklü değil" };
    const line = order.lines.find((l) => l.id === lineId);
    if (!line) return { ok: false, message: "Kalem bulunamadı" };
    const barkod = pending?.barcode || line.product.barcode || `${line.product.code}$*$`;
    const adet = pending?.adet ?? 1;

    let sonuc;
    try {
      sonuc = await api.readBarcode(barkod, shelf?.warehouse ?? "", shelf?.stockPlace ?? "", adet, batchNum);
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
    if (!sonuc.ok) return { ok: false, message: sonuc.message || "Parti okunamadı" };
    if (sonuc.material && sonuc.material !== line.product.code) {
      return { ok: false, message: "Bu parti bu ürüne ait değil" };
    }
    const karar = evaluateScan({ order, shelf, scan: sonuc, barcode: barkod, adet, batchDate: batchNum });
    if (karar.outcome.kind !== "ok" || !karar.record) {
      const msg = "message" in karar.outcome ? karar.outcome.message : "Parti eklenemedi";
      return { ok: false, message: msg };
    }
    set({
      order: kayitUpsert(order, lineId, karar.record, karar.mergedInto),
      pendingProduct: null,
      batchList: [],
    });
    return { ok: true, message: "" };
  },

  complete: async () => {
    const order = get().order;
    if (!order) return { ok: false, message: "Emir yüklü değil" };

    const okutmaVar = order.lines.some((l) => (l.records ?? []).length > 0);
    if (!okutmaVar) {
      const oncedenKayitli = order.lines.some((l) => l.pickedQty > 0);
      return {
        ok: false,
        message: oncedenKayitli
          ? "Bu oturumda yeni okutma yok — kalan ürünleri okutun."
          : "Önce ürün okutun — henüz toplanan yok.",
      };
    }
    set({ completing: true });
    try {

      const hedefDepo = order.lines.find((l) => l.targetWarehouse)?.targetWarehouse ?? "";
      const kap = await api.placeInPackage(
        hedefDepo,
        "KONPAKET",
        order.id,
        order.orderType ?? ""
      );
      if (!kap.containerId) {
        return {
          ok: false,

          message: kap.message
            ? `Palet oluşturulamadı: ${kap.message}`
            : "Palet oluşturulamadı (MZYCreateContainer boş döndü). Toplama kaydedilmedi.",
        };
      }

      if (!SAVEPICK_AKTIF) {
        return {
          ok: false,
          message:
            `Palet oluştu (${kap.containerId}). SavePick şu an KAPALI — ` +
            `CreateContainer yanıtı doğrulanıyor. Onay verilince açılacak, ` +
            `henüz CANIAS'a kayıt YAZILMADI.`,
        };
      }
      const kayit = await api.savePick(order, kap.containerWarehouse, kap.containerId);
      if (!kayit.ok) {
        return {
          ok: false,
          message:
            `Palet ${kap.containerId} oluştu ama toplama kaydedilemedi: ` +
            kayit.message,
        };
      }

      set({
        order: { ...order, lines: order.lines.map((l) => ({ ...l, records: [] })) },
        shelf: null,
      });
      return { ok: true, containerId: kap.containerId };
    } catch (e) {
      return {
        ok: false,
        message: e instanceof Error ? e.message : String(e),
      };
    } finally {
      set({ completing: false });
    }
  },
}),
{
  name: "aktuel-picking", // localStorage anahtarı

  // olsun diye shelf'i saklamıyoruz.
  partialize: (s) => ({ order: s.order }),

  merge: (persisted, current) => ({
    ...current,
    ...(persisted as Partial<PickingState>),
    shelf: null,
  }),
}));

export function orderProgress(order: PickOrder): number {

  const total = order.lines.length;
  if (total === 0) return 0;
  const done = order.lines.filter((l) => linePicked(l) >= l.requestedQty).length;
  return (done / total) * 100;
}

export function orderTotals(order: PickOrder) {
  const requested = qtyRound(order.lines.reduce((s, l) => s + l.requestedQty, 0));
  const picked = qtyRound(order.lines.reduce((s, l) => s + linePicked(l), 0));
  return { requested, picked, missing: qtyRound(requested - picked), lineCount: order.lines.length };
}
