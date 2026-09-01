// -----------------------------------------------------------------------------

// -----------------------------------------------------------------------------
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { api } from "../api/client";
import type { PickOrder } from "../types";
import { caniasDateTime } from "./pickingStore";
import {
  validateSource,
  evaluatePlacementScan,
  buildPlacementRecord,
  type SourceContext,
  type ReadyPlacement,
  type PlacementRecord,
  type PlacementOutcome,
} from "./putawayLogic";

interface PutawayState {
  order: PickOrder | null;
  loading: boolean;
  placing: boolean;

  source: SourceContext | null;

  ready: ReadyPlacement | null;

  records: PlacementRecord[];

  pendingProduct: { barcode: string; adet: number } | null;

  loadOrder: (id: string, orderType?: string) => Promise<void>;
  clear: () => void;

  scanSource: (barcode: string) => Promise<{ ok: boolean; message: string }>;

  scanProduct: (barcode: string, adet?: number) => Promise<PlacementOutcome>;

  setBatch: (batchDate: string) => Promise<PlacementOutcome>;

  scanTarget: (barcode: string, adet?: number) => Promise<{ ok: boolean; message: string }>;

  clearReady: () => void;
  removeRecord: (id: string) => void;
}

export const usePutawayStore = create<PutawayState>()(
  persist(
    (set, get) => ({
      order: null,
      loading: false,
      placing: false,
      source: null,
      ready: null,
      records: [],
      pendingProduct: null,

      loadOrder: async (id, orderType = "") => {
        set({ loading: true });
        try {
          const order = await api.enterPutaway(id, orderType);

          const orderWithStart = order ? { ...order, startTime: order.startTime ?? caniasDateTime() } : null;

          set({ order: orderWithStart, loading: false, source: null, ready: null, records: [], pendingProduct: null });

          if (orderWithStart) {
            const rafli = await api.fillPlacementLocations(orderWithStart);
            if (get().order?.id === rafli.id) set({ order: rafli });
          }
        } catch {
          set({ order: null, loading: false });
        }
      },

      clear: () => set({ order: null, source: null, ready: null, records: [], pendingProduct: null }),

      scanSource: async (barcode) => {
        const order = get().order;
        if (!order) return { ok: false, message: "Emir yüklü değil" };
        const r = await api.readShelfBarcode(barcode.trim());
        if (!r.ok) return { ok: false, message: r.message || "Kaynak depo okunamadı" };
        // Okutulan WAREHOUSE+STOCKPLACE, emrin WAREHOUSEFA+FRONTAREA'sıyla aynı olmalı.
        const v = validateSource(order, r.warehouse, r.stockPlace);
        if (!v.ok) return { ok: false, message: v.message };
        set({ source: { warehouse: r.warehouse, stockPlace: r.stockPlace } });
        return { ok: true, message: "" };
      },

      scanProduct: async (barcode, adet = 1) => {
        const { order, source } = get();
        if (!order) return { kind: "error", message: "Emir yüklü değil" };
        if (!source) return { kind: "error", message: "Önce kaynak depoyu okutun." };
        const kod = barcode.trim();

        const scan = await api.readBarcode(kod, source.warehouse, source.stockPlace, adet);

        const oturumKayit = get().records.filter((r) => r.material === scan.material).reduce((s, r) => s + r.qty, 0);
        const yerlesen = Math.max(order.lines.find((l) => l.product.code === scan.material)?.pickedQty ?? 0, oturumKayit);
        const { outcome, ready } = evaluatePlacementScan({ order, source, scan, adet, alreadyPlaced: yerlesen });
        if (outcome.kind === "needsBatch") {
          set({ pendingProduct: { barcode: kod, adet } });
          return outcome;
        }
        if (outcome.kind === "ok" && ready) set({ ready, pendingProduct: null });
        return outcome;
      },

      setBatch: async (batchDate) => {
        const { pendingProduct: p, order, source } = get();
        if (!p) return { kind: "error", message: "Bekleyen ürün yok" };
        if (!order || !source) return { kind: "error", message: "Bağlam eksik (emir/kaynak)" };
        const scan = await api.readBarcode(p.barcode, source.warehouse, source.stockPlace, p.adet, batchDate);
        const yerlesen = order.lines.find((l) => l.product.code === scan.material)?.pickedQty ?? 0;
        const { outcome, ready } = evaluatePlacementScan({ order, source, scan, adet: p.adet, batchDate, alreadyPlaced: yerlesen });
        if (outcome.kind === "ok" && ready) set({ ready, pendingProduct: null });
        return outcome;
      },

      scanTarget: async (barcode, adet) => {
        const { order, source, ready } = get();
        if (!order || !source) return { ok: false, message: "Bağlam eksik (emir/kaynak)" };
        if (!ready) return { ok: false, message: "Önce ürünü (ve gerekiyorsa partisini) okutun." };

        // Yerleştirme YALNIZ eşleşen TEK satıra yapılır (ready.lineId).
        // Miktar okunandan (ready.qty) ve o satırın kalanından fazla olamaz — dağıtım yok.
        const line = order.lines.find((l) => l.id === ready.lineId);
        const satirKalan = line ? Math.max(0, line.requestedQty - line.pickedQty) : ready.qty;
        const tavan = Math.min(ready.qty, satirKalan);
        if (tavan <= 0) return { ok: false, message: "Bu satır zaten tamamlandı" };
        const istenen = adet && adet > 0 ? Math.floor(adet) : tavan; // boşsa okunan kadar
        // FAZLA MAL: okunandan / satır kalanından fazlasını HİÇ kaydetme.
        if (istenen > tavan) {
          return { ok: false, message: `Fazla mal — en fazla ${tavan} yerleştirebilirsiniz` };
        }

        const r = await api.readShelfBarcode(barcode.trim());
        if (!r.ok) return { ok: false, message: r.message || "Hedef raf okunamadı" };
        const target = { barcode: barcode.trim(), warehouse: r.warehouse, stockPlace: r.stockPlace };

        // TEK satır → TEK SavePlacement (o satırın kendi kalem no'su ile).
        const record = buildPlacementRecord({ ...ready, qty: istenen }, source, target, istenen);
        const s = await api.savePlacement({
          order,
          itemNo: ready.lineId, // PIITEMNO — eşleşen tek satır
          material: ready.material, // PSMATERIAL
          targetWarehouse: target.warehouse,
          targetShelf: target.stockPlace,
          specialStock: ready.specialStock,
          lot: ready.lot,
          qty: istenen,
          startTime: order.startTime, // PDSTARTTIME
        });
        if (!s.ok) return { ok: false, message: s.message || "Yerleştirme kaydedilemedi" };

        set({ records: [...get().records, record], ready: null });

        // Tüm satırlar gönderildikten sonra TEK tazeleme (EnterPlacement).
        try {
          const taze = await api.enterPutaway(order.id, order.orderType ?? "");
          if (taze && get().order?.id === taze.id) {
            const oncekiOneri = new Map((get().order?.lines ?? []).map((l) => [l.id, l.suggestions]));
            const yeniLines = taze.lines.map((l) => ({ ...l, suggestions: oncekiOneri.get(l.id) }));
            set({ order: { ...taze, startTime: get().order?.startTime, lines: yeniLines } });
          }
        } catch {

        }
        return { ok: true, message: "" };
      },

      clearReady: () => set({ ready: null, pendingProduct: null }),

      removeRecord: (id) => set({ records: get().records.filter((r) => r.id !== id) }),
    }),
    {
      name: "aktuel-putaway", // localStorage anahtarı

      partialize: (s) => ({ order: s.order }),
    }
  )
);
