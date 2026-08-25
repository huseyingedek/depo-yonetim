import { create } from "zustand";
import type { StockBatch, StockTransferPayload, TransferItem } from "../types";
import { api } from "../api/client";
import { useAppStore } from "./appStore";

export interface ShelfContext {
  barcode: string;
  warehouse: string;
  stockPlace: string;
}

export const qtyRound = (n: number): number =>
  Math.round((Number(n) + Number.EPSILON) * 1000) / 1000;

export function isoDateToBatch(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((iso ?? "").trim());
  return m ? `${m[1]}${m[2]}${m[3]}` : "";
}

function caniasDateTime(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(
    d.getHours()
  )}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export type TransferStep = "collect" | "target" | "success";

export interface LotPendingState {
  material: string;
  name: string;
  barcode: string;
  quantity: number;
  unit: string;
  specialStock: string;
  availStock: number;
}

interface TransferState {
  sourceShelf: ShelfContext | null;
  targetShelf: ShelfContext | null;
  items: TransferItem[];
  step: TransferStep;

  lotPending: LotPendingState | null;
  batchList: StockBatch[];
  batchLoading: boolean;
  batchError: string | null;

  loading: boolean;
  completing: boolean;
  completedResult: {
    transferId?: string;
    payload: StockTransferPayload;
  } | null;

  // Actions
  scanSourceShelf: (barcode: string) => Promise<{ ok: boolean; message: string }>;
  clearSourceShelf: () => void;
  setSourceShelf: (shelf: ShelfContext) => void;

  scanProduct: (
    barcode: string,
    adet?: number
  ) => Promise<{
    ok: boolean;
    message: string;
    needsBatch?: boolean;
    name?: string;
    itemId?: string;
  }>;

  scanLot: (lot: string) => Promise<{ ok: boolean; message: string; itemId?: string }>;
  selectBatch: (batchNum: string) => Promise<{ ok: boolean; message: string }>;
  cancelLot: () => void;

  addItem: (item: {
    material: string;
    name: string;
    barcode: string;
    quantity: number;
    unit: string;
    skunit?: string;
    multiplier?: number;
    batchNum?: string;
    specialStock?: string;
    isSpecialStock?: boolean;
    availStock?: number;
    sourceWarehouse?: string;
    sourceStockPlace?: string;
  }) => { ok: boolean; message: string; itemId?: string };

  updateItemQty: (id: string, qty: number) => void;
  removeItem: (id: string) => void;
  clearItems: () => void;

  goToTargetStep: () => { ok: boolean; message?: string };
  backToCollectStep: () => void;

  scanTargetShelf: (barcode: string) => Promise<{ ok: boolean; message: string }>;
  clearTargetShelf: () => void;
  setTargetShelf: (shelf: ShelfContext) => void;

  completeTransfer: () => Promise<{ ok: boolean; message: string; transferId?: string }>;
  reset: () => void;
}

export const useTransferStore = create<TransferState>()((set, get) => ({
  sourceShelf: null,
  targetShelf: null,
  items: [],
  step: "collect",

  lotPending: null,
  batchList: [],
  batchLoading: false,
  batchError: null,

  loading: false,
  completing: false,
  completedResult: null,

      scanSourceShelf: async (barcode: string) => {
        const kod = barcode.trim().toUpperCase();
        if (!kod) return { ok: false, message: "Barkod boş olamaz" };

        try {
          const res = await api.readShelfBarcode(kod);
          if (!res.ok) {
            return { ok: false, message: res.message || "Kaynak raf bulunamadı" };
          }
          const shelf: ShelfContext = {
            barcode: kod,
            warehouse: res.warehouse,
            stockPlace: res.stockPlace,
          };
          set({ sourceShelf: shelf, lotPending: null });
          return { ok: true, message: `Raf: ${kod}` };
        } catch (e) {
          return {
            ok: false,
            message: e instanceof Error ? e.message : "Raf okunurken hata oluştu",
          };
        }
      },

      clearSourceShelf: () => {
        set({ sourceShelf: null, lotPending: null });
      },

      setSourceShelf: (shelf: ShelfContext) => {
        set({ sourceShelf: shelf, lotPending: null });
      },

      scanProduct: async (barcode: string, adet = 1) => {
        const { sourceShelf, items } = get();
        if (!sourceShelf) {
          return { ok: false, message: "Önce raf barkodunu okutun" };
        }

        const kod = barcode.trim().toUpperCase();
        if (!kod) return { ok: false, message: "Barkod boş olamaz" };

        const kacTane = Math.max(1, Math.floor(adet));

        try {
          // CANIAS barkod okuma servisi
          const res = await api.readBarcode(
            kod,
            sourceShelf.warehouse,
            sourceShelf.stockPlace,
            kacTane
          );

          if (!res.ok || !res.material) {
            return { ok: false, message: res.message || "Malzeme bulunamadı" };
          }

          const miktar = qtyRound(res.quantity > 0 ? res.quantity : kacTane);
          const ozelStok = res.specialStock || "0";
          const lotTracked = ozelStok === "1" || !!res.lot;

          // Parti takipli malzeme ise ve barkoddan parti gelmediyse:
          if (lotTracked && (!res.lot || res.lot === "*")) {
            set({
              lotPending: {
                material: res.material,
                name: res.name,
                barcode: kod,
                quantity: miktar,
                unit: res.unit || "AD",
                specialStock: ozelStok,
                availStock: res.availStock,
              },
              batchLoading: true,
              batchError: null,
              batchList: [],
            });

            // Stoktaki partileri çek
            api
              .getStock(res.material, sourceShelf.warehouse, sourceShelf.stockPlace)
              .then((list) => {
                set({ batchList: list, batchLoading: false });
              })
              .catch((err) => {
                set({
                  batchError: err instanceof Error ? err.message : "Partiler alınamadı",
                  batchLoading: false,
                });
              });

            return {
              ok: true,
              needsBatch: true,
              name: res.name,
              message: `${res.name} — Parti barkodu bekleniyor`,
            };
          }

          // Parti takibi yoksa veya parti barkoddan geldiyse doğrudan sepete ekle
          const batchNum = res.lot && res.lot !== "*" ? res.lot : undefined;

          // Aynı malzeme + aynı parti + aynı kaynak raf varsa miktarı artır
          const existingIndex = items.findIndex(
            (it) =>
              it.material === res.material &&
              (it.batchNum ?? "") === (batchNum ?? "") &&
              it.sourceWarehouse === sourceShelf.warehouse &&
              it.sourceStockPlace === sourceShelf.stockPlace
          );

          let updatedItems: TransferItem[];
          let targetItemId = "";
          if (existingIndex >= 0) {
            targetItemId = items[existingIndex].id;
            updatedItems = items.map((it, idx) =>
              idx === existingIndex
                ? { ...it, quantity: qtyRound(it.quantity + miktar), timestamp: Date.now() }
                : it
            );
          } else {
            targetItemId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
            const newItem: TransferItem = {
              id: targetItemId,
              material: res.material,
              name: res.name,
              barcode: kod,
              quantity: miktar,
              unit: res.unit || "AD",
              batchNum,
              isSpecialStock: lotTracked,
              specialStock: ozelStok,
              sourceWarehouse: sourceShelf.warehouse,
              sourceStockPlace: sourceShelf.stockPlace,
              availStock: res.availStock,
              timestamp: Date.now(),
            };
            updatedItems = [newItem, ...items];
          }

          set({ items: updatedItems, lotPending: null });
          return { ok: true, name: res.name, message: `${res.name} eklendi`, itemId: targetItemId };
        } catch (e) {
          return {
            ok: false,
            message: e instanceof Error ? e.message : "Barkod okunurken hata oluştu",
          };
        }
      },

      scanLot: async (lotBarcode: string) => {
        const { lotPending, sourceShelf, items } = get();
        if (!lotPending || !sourceShelf) {
          return { ok: false, message: "Parti bekleyen malzeme yok" };
        }

        const lot = lotBarcode.trim().toUpperCase();
        if (!lot) return { ok: false, message: "Parti barkodu boş olamaz" };

        const existingIndex = items.findIndex(
          (it) =>
            it.material === lotPending.material &&
            (it.batchNum ?? "") === lot &&
            it.sourceWarehouse === sourceShelf.warehouse &&
            it.sourceStockPlace === sourceShelf.stockPlace
        );

        let updatedItems: TransferItem[];
        let targetItemId = "";
        if (existingIndex >= 0) {
          targetItemId = items[existingIndex].id;
          updatedItems = items.map((it, idx) =>
            idx === existingIndex
              ? { ...it, quantity: qtyRound(it.quantity + lotPending.quantity), timestamp: Date.now() }
              : it
          );
        } else {
          targetItemId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
          const newItem: TransferItem = {
            id: targetItemId,
            material: lotPending.material,
            name: lotPending.name,
            barcode: lotPending.barcode,
            quantity: lotPending.quantity,
            unit: lotPending.unit,
            batchNum: lot,
            isSpecialStock: true,
            specialStock: lotPending.specialStock,
            sourceWarehouse: sourceShelf.warehouse,
            sourceStockPlace: sourceShelf.stockPlace,
            availStock: lotPending.availStock,
            timestamp: Date.now(),
          };
          updatedItems = [newItem, ...items];
        }

        set({
          items: updatedItems,
          lotPending: null,
          batchList: [],
          batchError: null,
        });

        return { ok: true, message: `Parti (${lot}) ile eklendi`, itemId: targetItemId };
      },

      selectBatch: async (batchNum: string) => {
        return get().scanLot(batchNum);
      },

      cancelLot: () => {
        set({ lotPending: null, batchList: [], batchError: null });
      },

      addItem: (item: {
        material: string;
        name: string;
        barcode: string;
        quantity: number;
        unit: string;
        skunit?: string;
        multiplier?: number;
        batchNum?: string;
        specialStock?: string;
        isSpecialStock?: boolean;
        availStock?: number;
        sourceWarehouse?: string;
        sourceStockPlace?: string;
      }) => {
        const { sourceShelf, items } = get();
        const srcWh = item.sourceWarehouse || sourceShelf?.warehouse || "";
        const srcSp = item.sourceStockPlace || sourceShelf?.stockPlace || "";
        if (!srcWh && !sourceShelf) return { ok: false, message: "Önce raf okutulmalı" };

        const lot = item.batchNum && item.batchNum !== "*" ? item.batchNum : undefined;
        const existingIndex = items.findIndex(
          (it) =>
            it.material === item.material &&
            (it.batchNum ?? "") === (lot ?? "") &&
            it.sourceWarehouse === srcWh &&
            it.sourceStockPlace === srcSp
        );

        let updatedItems: TransferItem[];
        let targetItemId = "";
        if (existingIndex >= 0) {
          targetItemId = items[existingIndex].id;
          updatedItems = items.map((it, idx) =>
            idx === existingIndex
              ? { ...it, quantity: qtyRound(it.quantity + item.quantity), timestamp: Date.now() }
              : it
          );
        } else {
          targetItemId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
          const newItem: TransferItem = {
            id: targetItemId,
            material: item.material,
            name: item.name,
            barcode: item.barcode,
            quantity: qtyRound(item.quantity),
            unit: item.unit || "AD",
            skunit: item.skunit,
            multiplier: item.multiplier,
            batchNum: lot,
            isSpecialStock: Boolean(item.isSpecialStock),
            specialStock: item.specialStock || (lot ? "1" : "*"),
            sourceWarehouse: srcWh,
            sourceStockPlace: srcSp,
            availStock: item.availStock,
            timestamp: Date.now(),
          };
          updatedItems = [newItem, ...items];
        }

        set({ items: updatedItems, lotPending: null });
        return { ok: true, itemId: targetItemId, message: `${item.name} (${item.quantity} ${item.unit || "AD"}) eklendi` };
      },

      updateItemQty: (id: string, qty: number) => {
        const { items } = get();
        if (qty <= 0) {
          set({ items: items.filter((it) => it.id !== id) });
        } else {
          set({
            items: items.map((it) => (it.id === id ? { ...it, quantity: qtyRound(qty) } : it)),
          });
        }
      },

      removeItem: (id: string) => {
        set({ items: get().items.filter((it) => it.id !== id) });
      },

      clearItems: () => {
        set({ items: [] });
      },

      goToTargetStep: () => {
        const { items } = get();
        if (!items.length) {
          return { ok: false, message: "Taşınacak en az 1 malzeme okutmalısınız" };
        }
        set({ step: "target", lotPending: null });
        return { ok: true };
      },

      backToCollectStep: () => {
        set({ step: "collect" });
      },

      scanTargetShelf: async (barcode: string) => {
        const kod = barcode.trim().toUpperCase();
        if (!kod) return { ok: false, message: "Barkod boş olamaz" };

        try {
          const res = await api.readShelfBarcode(kod);
          if (!res.ok) {
            return { ok: false, message: res.message || "Hedef raf bulunamadı" };
          }
          const shelf: ShelfContext = {
            barcode: kod,
            warehouse: res.warehouse,
            stockPlace: res.stockPlace,
          };
          set({ targetShelf: shelf });
          return { ok: true, message: `Hedef: ${shelf.warehouse} · ${shelf.stockPlace}` };
        } catch (e) {
          return {
            ok: false,
            message: e instanceof Error ? e.message : "Hedef raf okunurken hata oluştu",
          };
        }
      },

      clearTargetShelf: () => {
        set({ targetShelf: null });
      },

      setTargetShelf: (shelf: ShelfContext) => {
        set({ targetShelf: shelf });
      },

      completeTransfer: async () => {
        const { sourceShelf, targetShelf, items } = get();
        if (!items.length) {
          return { ok: false, message: "Taşınacak malzeme yok" };
        }
        if (!targetShelf) {
          return { ok: false, message: "Hedef depo ve stok yerini belirleyin" };
        }

        const appState = useAppStore.getState();
        const currentSettings = appState.settings;
        const company = currentSettings?.company || "01";
        const plant = currentSettings?.facility || "100";
        const user = appState.user?.username || "";
        const firstSourceWh = sourceShelf?.warehouse || items[0].sourceWarehouse;
        const firstSourceSp = sourceShelf?.stockPlace || items[0].sourceStockPlace;

        const payload: StockTransferPayload = {
          company,
          plant,
          user,
          sourceWarehouse: firstSourceWh,
          sourceStockPlace: firstSourceSp,
          targetWarehouse: targetShelf.warehouse,
          targetStockPlace: targetShelf.stockPlace,
          transferDate: caniasDateTime(),
          items: items.map((it) => ({
            material: it.material,
            materialName: it.name,
            barcode: it.barcode,
            quantity: it.quantity,
            unit: it.unit,
            skunit: it.skunit,
            multiplier: it.multiplier,
            batchNum: it.batchNum,
            specialStock: it.specialStock,
            sourceWarehouse: it.sourceWarehouse,
            sourceStockPlace: it.sourceStockPlace,
            targetWarehouse: targetShelf.warehouse,
            targetStockPlace: targetShelf.stockPlace,
          })),
        };

        set({ completing: true });
        try {
          const res = await api.createStockTransfer(payload);
          if (res.ok) {
            set({
              items: [],
              sourceShelf: null,
              targetShelf: null,
              lotPending: null,
              batchList: [],
              batchError: null,
              completing: false,
              completedResult: {
                transferId: res.transferId,
                payload,
              },
            });
            return { ok: true, message: res.message || "Transfer başarıyla tamamlandı", transferId: res.transferId };
          } else {
            set({ completing: false });
            return { ok: false, message: res.message || "Transfer gerçekleştirilemedi" };
          }
        } catch (e) {
          set({ completing: false });
          return {
            ok: false,
            message: e instanceof Error ? e.message : "Transfer sırasında hata oluştu",
          };
        }
      },

      reset: () => {
        set({
          sourceShelf: null,
          targetShelf: null,
          items: [],
          step: "collect",
          lotPending: null,
          batchList: [],
          batchError: null,
          loading: false,
          completing: false,
          completedResult: null,
        });
      },
    }));
