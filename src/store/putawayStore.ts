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

  pendingProduct: { barcode: string; adet: number; material: string; name: string } | null;

  loadOrder: (id: string, orderType?: string) => Promise<{ ok: boolean; message?: string }>;
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
        let orderWithStart: PickOrder | null = null;
        try {
          const order = await api.enterPutaway(id, orderType);
          orderWithStart = order ? { ...order, startTime: order.startTime ?? caniasDateTime() } : null;
          set({ order: orderWithStart, loading: false, source: null, ready: null, records: [], pendingProduct: null });
        } catch (e) {
          set({ order: null, loading: false });
          return { ok: false, message: e instanceof Error ? e.message : String(e) };
        }
        if (!orderWithStart) return { ok: false, message: "Emir bulunamadı" };

        // Raf/öneri bilgileri ARKA PLANDA doldurulur — sayfa hemen açılsın diye await edilmez.
        api
          .fillPlacementLocations(orderWithStart)
          .then((rafli) => { if (get().order?.id === rafli.id) set({ order: rafli }); })
          .catch(() => {});

        return { ok: true };
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
          set({ pendingProduct: { barcode: kod, adet, material: scan.material, name: scan.name } });
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

        // Bu oturumda satır başına yerleştirilen (tazeleme geç kalsa da kapanan satır
        // tekrar açık görünmesin → aynı satıra ikinci kez yazılmasın).
        const yerlesen: Record<string, number> = {};
        for (const rec of get().records) yerlesen[rec.lineId] = (yerlesen[rec.lineId] ?? 0) + rec.qty;

        // Girilen miktar (Kaç tane?) yoksa okunan (ready.qty). Açık satırlara ÜSTTEN sırayla
        // dağıtılır: 60 → 24, 24, 12. Toplam kalanı aşarsa HİÇ kaydetme, "fazla" hatası ver.
        const toplamKalan = materialRemaining(order, ready.material, yerlesen);
        if (toplamKalan <= 0) return { ok: false, message: "Bu kalem zaten tamamlandı" };
        const istenen = adet && adet > 0 ? Math.floor(adet) : Math.min(ready.qty, toplamKalan);
        if (istenen > toplamKalan) {
          return { ok: false, message: `Fazla mal — en fazla ${toplamKalan} yerleştirebilirsiniz (${istenen - toplamKalan} fazla)` };
        }

        const r = await api.readShelfBarcode(barcode.trim());
        if (!r.ok) return { ok: false, message: r.message || "Hedef raf okunamadı" };
        const target = { barcode: barcode.trim(), warehouse: r.warehouse, stockPlace: r.stockPlace };

        // Girilen miktarı açık satırlara ÜSTTEN sırayla dağıt; kapanan satırları atla.
        const allocations = distributePlacement(order, ready.material, istenen, ready.lot, yerlesen);
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

            // ÇİFT SAYIMI ÖNLE: sunucu (MOVEDQTY/pickedQty) bu malzemeyi artık yansıttıysa,
            // oturum kayıtlarını düş. Böylece yerleşen = max(pickedQty, kayıt) toplamı şişmez.
            // (Tazeleme geç kalırsa — sunucu < oturum — kayıtlar tutulur, ilerleme geri düşmez.)
            const sunucuYer = yeniLines
              .filter((l) => l.product.code === ready.material)
              .reduce((s, l) => s + l.pickedQty, 0);
            const oturumYer = get().records
              .filter((r) => r.material === ready.material)
              .reduce((s, r) => s + r.qty, 0);
            if (sunucuYer >= oturumYer) {
              set({ records: get().records.filter((r) => r.material !== ready.material) });
            }
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
