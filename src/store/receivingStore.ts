import { create } from "zustand";
import type { Receipt } from "../types";
import { api } from "../api/client";

interface ReceivingState {
  receipt: Receipt | null;
  loading: boolean;
  completing: boolean;
  loadReceipt: (id: string) => Promise<void>;
  clear: () => void;
  /** Barkod okut: lot takipli ürünse modal gerektiğini bildirir. */
  scan: (barcode: string) => { ok: boolean; lineId?: string; needsLot?: boolean; complete?: boolean };
  applyLot: (lineId: string, lot: string, expiry: string, qty: number) => void;
  setQty: (lineId: string, qty: number) => void;
  complete: () => Promise<string>;
}

export const useReceivingStore = create<ReceivingState>((set, get) => ({
  receipt: null,
  loading: false,
  completing: false,

  loadReceipt: async (id) => {
    set({ loading: true, receipt: null });
    const receipt = await api.getReceipt(id);
    set({ receipt: receipt ?? null, loading: false });
  },

  clear: () => set({ receipt: null }),

  scan: (barcode) => {
    const receipt = get().receipt;
    if (!receipt) return { ok: false };
    const line = receipt.lines.find((l) => l.product.barcode === barcode.trim());
    if (!line) return { ok: false };
    if (line.tracksLot) return { ok: true, lineId: line.id, needsLot: true };
    if (line.receivedQty >= line.expectedQty) return { ok: true, lineId: line.id, complete: true };
    const lines = receipt.lines.map((l) =>
      l.id === line.id ? { ...l, receivedQty: l.receivedQty + 1 } : l
    );
    set({ receipt: { ...receipt, lines } });
    const now = lines.find((l) => l.id === line.id)!;
    return { ok: true, lineId: line.id, complete: now.receivedQty >= now.expectedQty };
  },

  applyLot: (lineId, lot, expiry, qty) => {
    const receipt = get().receipt;
    if (!receipt) return;
    const lines = receipt.lines.map((l) =>
      l.id === lineId ? { ...l, lot, expiry, receivedQty: Math.max(0, qty) } : l
    );
    set({ receipt: { ...receipt, lines } });
  },

  setQty: (lineId, qty) => {
    const receipt = get().receipt;
    if (!receipt) return;
    const lines = receipt.lines.map((l) =>
      l.id === lineId ? { ...l, receivedQty: Math.max(0, qty) } : l
    );
    set({ receipt: { ...receipt, lines } });
  },

  complete: async () => {
    const receipt = get().receipt;
    if (!receipt) return "";
    set({ completing: true });
    const res = await api.completeReceipt(receipt);
    set({ completing: false });
    return res.caniasRef;
  },
}));

export function receiptProgress(r: Receipt): number {
  const exp = r.lines.reduce((s, l) => s + l.expectedQty, 0);
  const rec = r.lines.reduce((s, l) => s + l.receivedQty, 0);
  return exp === 0 ? 0 : (rec / exp) * 100;
}

export function receiptTotals(r: Receipt) {
  const expected = r.lines.reduce((s, l) => s + l.expectedQty, 0);
  const received = r.lines.reduce((s, l) => s + l.receivedQty, 0);
  return { expected, received, lineCount: r.lines.length };
}
