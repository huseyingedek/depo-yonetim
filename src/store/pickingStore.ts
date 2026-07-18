import { create } from "zustand";
import type { PickOrder } from "../types";
import { api } from "../api/client";

interface PickingState {
  order: PickOrder | null;
  loading: boolean;
  completing: boolean;
  loadOrder: (id: string) => Promise<void>;
  clear: () => void;
  /** Barkod okutulduğunda ilgili kalemi bulup miktarı artırır. */
  scan: (barcode: string) => { ok: boolean; lineId?: string; complete?: boolean };
  setQty: (lineId: string, qty: number) => void;
  complete: () => Promise<string>; // caniasRef döner
}

export const usePickingStore = create<PickingState>((set, get) => ({
  order: null,
  loading: false,
  completing: false,

  loadOrder: async (id: string) => {
    set({ loading: true, order: null });
    const order = await api.getPickOrder(id);
    set({ order: order ?? null, loading: false });
  },

  clear: () => set({ order: null }),

  scan: (barcode: string) => {
    const order = get().order;
    if (!order) return { ok: false };
    const line = order.lines.find((l) => l.product.barcode === barcode.trim());
    if (!line) return { ok: false };
    if (line.pickedQty >= line.requestedQty) {
      return { ok: true, lineId: line.id, complete: true };
    }
    const lines = order.lines.map((l) =>
      l.id === line.id ? { ...l, pickedQty: l.pickedQty + 1 } : l
    );
    const updated = { ...order, lines };
    set({ order: updated });
    const nowLine = lines.find((l) => l.id === line.id)!;
    return { ok: true, lineId: line.id, complete: nowLine.pickedQty >= nowLine.requestedQty };
  },

  setQty: (lineId: string, qty: number) => {
    const order = get().order;
    if (!order) return;
    const lines = order.lines.map((l) =>
      l.id === lineId ? { ...l, pickedQty: Math.max(0, Math.min(l.requestedQty, qty)) } : l
    );
    set({ order: { ...order, lines } });
  },

  complete: async () => {
    const order = get().order;
    if (!order) return "";
    set({ completing: true });
    const res = await api.completePickOrder(order);
    set({ completing: false });
    return res.caniasRef;
  },
}));

// Yardımcılar
export function orderProgress(order: PickOrder): number {
  const req = order.lines.reduce((s, l) => s + l.requestedQty, 0);
  const pick = order.lines.reduce((s, l) => s + l.pickedQty, 0);
  return req === 0 ? 0 : (pick / req) * 100;
}

export function orderTotals(order: PickOrder) {
  const requested = order.lines.reduce((s, l) => s + l.requestedQty, 0);
  const picked = order.lines.reduce((s, l) => s + l.pickedQty, 0);
  return { requested, picked, missing: requested - picked, lineCount: order.lines.length };
}
