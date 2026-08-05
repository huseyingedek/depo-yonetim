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
  distributePlacement,
  materialRemaining,
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

        // MALZEME GENELİ kalan — aynı malzemenin TÜM açık satırlarının toplamı.
        const toplamKalan = materialRemaining(order, ready.material);
        if (toplamKalan <= 0) return { ok: false, message: "Bu kalem zaten tamamlandı" };
        const istenen = adet && adet > 0 ? Math.floor(adet) : toplamKalan; // boşsa kalanın tamamı
        // FAZLA MAL: girilen miktar toplam kalandan büyükse HİÇ kaydetme.
        if (istenen > toplamKalan) {
          return { ok: false, message: `Fazla mal — en fazla ${toplamKalan} yerleştirebilirsiniz (kalan ${toplamKalan})` };
        }

        const r = await api.readShelfBarcode(barcode.trim());
        if (!r.ok) return { ok: false, message: r.message || "Hedef raf okunamadı" };
        const target = { barcode: barcode.trim(), warehouse: r.warehouse, stockPlace: r.stockPlace };

        // Girilen miktarı açık satırlara SIRAYLA dağıt; her satır için ayrı SavePlacement.
        const allocations = distributePlacement(order, ready.material, istenen, ready.lot);
        const yeniKayitlar: PlacementRecord[] = [];
        for (const a of allocations) {
          const record = buildPlacementRecord(
            { ...ready, lineId: a.lineId, lot: a.lot, specialStock: a.specialStock, qty: a.qty },
            source,
            target,
            a.qty
          );
          const s = await api.savePlacement({
            order,
            itemNo: a.lineId, // PIITEMNO — o satır
            material: ready.material, // PSMATERIAL
            targetWarehouse: target.warehouse,
            targetShelf: target.stockPlace,
            specialStock: a.specialStock,
            lot: a.lot,
            qty: a.qty,
            startTime: order.startTime, // PDSTARTTIME
          });
          if (!s.ok) {
            // Kısmi başarı: o ana kadar kaydedilenleri sakla, hatayı dön.
            if (yeniKayitlar.length) set({ records: [...get().records, ...yeniKayitlar] });
            return { ok: false, message: s.message || "Yerleştirme kaydedilemedi" };
          }
          yeniKayitlar.push(record);
        }

        set({ records: [...get().records, ...yeniKayitlar], ready: null });

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
