// -----------------------------------------------------------------------------
// YERLEŞTİRME STORE — pickingStore'un aynası (yan etkiler: servis + state).
// -----------------------------------------------------------------------------
// TASARIM İSKELETİ: akış ve state hazır; canlıya bağlı OLMAYAN kısımlar:
//   • enterPutaway → şimdilik MZYEnterPick (Bora MZYEnterPlacement verecek)
//   • savePlacement → STUB (Bora MZYSavePlacement verecek) — kayıt henüz CANIAS'a YAZILMIYOR
// Okuma (kaynak/hedef raf, ürün) toplamayla birebir aynı servisleri kullanır.
// -----------------------------------------------------------------------------
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { api } from "../api/client";
import type { PickOrder } from "../types";
import {
  validateSource,
  evaluatePlacementScan,
  type SourceContext,
  type TargetContext,
  type PlacementRecord,
  type PlacementOutcome,
} from "./putawayLogic";

interface PutawayState {
  order: PickOrder | null;
  loading: boolean;
  placing: boolean;
  /** 2. adım: kaynak (çıkış) deposu — bir kez okutulur, saklanır. */
  source: SourceContext | null;
  /** 3. adım: o an okutulan hedef raf (nereye konacak). */
  target: TargetContext | null;
  /** Bu oturumda yapılan yerleştirmeler (tek tek). */
  records: PlacementRecord[];
  /** Parti takipli üründe ürün okundu, parti bekleniyor. */
  pendingProduct: { barcode: string; adet: number } | null;

  loadOrder: (id: string, orderType?: string) => Promise<void>;
  clear: () => void;
  /** 2. adım — KAYNAK depo okut (readBarcodeSP) + emirle doğrula. */
  scanSource: (barcode: string) => Promise<{ ok: boolean; message: string }>;
  /** 3. adım — HEDEF raf okut (readBarcodeSP). */
  scanTarget: (barcode: string) => Promise<{ ok: boolean; message: string }>;
  clearTarget: () => void;
  /** 3. adım — ürün okut. readBarcode'a KAYNAK depo/stok yeri gönderilir. */
  scanProduct: (barcode: string, adet?: number) => Promise<PlacementOutcome>;
  /** Parti takipli üründe parti okutulunca tekrar dener. */
  setBatch: (batchDate: string) => Promise<PlacementOutcome>;
  removeRecord: (id: string) => void;
}

export const usePutawayStore = create<PutawayState>()(
  persist(
    (set, get) => ({
      order: null,
      loading: false,
      placing: false,
      source: null,
      target: null,
      records: [],
      pendingProduct: null,

      loadOrder: async (id, orderType = "") => {
        set({ loading: true });
        try {
          // TODO: MZYEnterPlacement gelince api.enterPutaway onu çağıracak.
          const order = await api.enterPutaway(id, orderType);
          // Yeni emir → kaynak/hedef/kayıtlar sıfırlanır (fiziksel bağlam yeniden okutulur).
          set({ order: order ?? null, loading: false, source: null, target: null, records: [], pendingProduct: null });
        } catch {
          set({ order: null, loading: false });
        }
      },

      clear: () => set({ order: null, source: null, target: null, records: [], pendingProduct: null }),

      scanSource: async (barcode) => {
        const order = get().order;
        if (!order) return { ok: false, message: "Emir yüklü değil" };
        const r = await api.readShelfBarcode(barcode.trim());
        if (!r.ok) return { ok: false, message: r.message || "Kaynak depo okunamadı" };
        // Emrin kaynak depo/rafıyla (WAREHOUSEFA/FRONTAREA) doğrula.
        const v = validateSource(order, r.warehouse, r.stockPlace);
        if (!v.ok) return { ok: false, message: v.message };
        set({ source: { warehouse: r.warehouse, stockPlace: r.stockPlace } });
        return { ok: true, message: "" };
      },

      scanTarget: async (barcode) => {
        const r = await api.readShelfBarcode(barcode.trim());
        if (!r.ok) return { ok: false, message: r.message || "Hedef raf okunamadı" };
        set({ target: { barcode: barcode.trim(), warehouse: r.warehouse, stockPlace: r.stockPlace } });
        return { ok: true, message: "" };
      },

      clearTarget: () => set({ target: null }),

      scanProduct: async (barcode, adet = 1) => {
        const { order, source, target } = get();
        if (!order) return { kind: "error", message: "Emir yüklü değil" };
        if (!source) return { kind: "error", message: "Önce kaynak depoyu okutun." };
        if (!target) return { kind: "noTarget", message: "Önce hedef rafı okutun." };
        const kod = barcode.trim();
        // ÖNEMLİ (Bora): readBarcode'a bu adımda okutulan hedef raf DEĞİL,
        // 2. adımdaki KAYNAK depo/stok yeri gönderilir → availStock = kaynak stok.
        const scan = await api.readBarcode(kod, source.warehouse, source.stockPlace, adet);
        const { outcome, record } = evaluatePlacementScan({ order, source, target, scan, adet });
        if (outcome.kind === "needsBatch") {
          set({ pendingProduct: { barcode: kod, adet } });
          return outcome;
        }
        if (outcome.kind === "ok" && record) {
          // TASARIM: gerçekte her okutma anında MZYSavePlacement ile CANIAS'a yazılacak.
          // TODO: const s = await api.savePlacement({...record, order}); if (!s.ok) hata göster.
          set({ records: [...get().records, record], pendingProduct: null });
        }
        return outcome;
      },

      setBatch: async (batchDate) => {
        const { pendingProduct: p, order, source, target } = get();
        if (!p) return { kind: "error", message: "Bekleyen ürün yok" };
        if (!order || !source || !target) return { kind: "error", message: "Bağlam eksik (emir/kaynak/hedef)" };
        const scan = await api.readBarcode(p.barcode, source.warehouse, source.stockPlace, p.adet, batchDate);
        const { outcome, record } = evaluatePlacementScan({ order, source, target, scan, adet: p.adet, batchDate });
        if (outcome.kind === "ok" && record) {
          set({ records: [...get().records, record], pendingProduct: null });
        }
        return outcome;
      },

      removeRecord: (id) => set({ records: get().records.filter((r) => r.id !== id) }),
    }),
    {
      name: "aktuel-putaway", // localStorage anahtarı
      // Yalnızca emri sakla; kaynak/hedef fiziksel bağlam her girişte yeniden okutulur.
      partialize: (s) => ({ order: s.order }),
    }
  )
);
