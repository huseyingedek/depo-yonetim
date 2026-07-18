import type {
  PickOrder,
  Receipt,
  PutawayItem,
  TransferTask,
  CountTask,
  ProductStock,
} from "../types";
import { mockOrders } from "../mock/data";
import {
  mockReceipts,
  mockPutaway,
  mockTransfers,
  mockCounts,
  lookupStock,
} from "../mock/warehouse";

/**
 * ADAPTER KATMANI
 * -----------------------------------------------------------------------------
 * Ekranlar sadece bu fonksiyonları çağırır. Şu an mock veriyle çalışıyor.
 * Mizoye/Bora servisleri hazır olunca, buradaki fonksiyonların içi gerçek
 * fetch çağrılarıyla değiştirilir (endpoint + auth header). Ekranlara dokunmaya
 * gerek kalmaz.
 *
 * Örn. gerçek entegrasyon:
 *   const res = await fetch(`${BASE_URL}/picking/orders`, { headers: authHeaders() });
 *   return res.json();
 */

const NETWORK_DELAY = 350; // gerçekçi hissiyat için

function delay<T>(value: T, ms = NETWORK_DELAY): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

// Bellekte tutulan çalışma kopyaları (mock oturum)
let ordersState: PickOrder[] = clone(mockOrders);
let receiptsState: Receipt[] = clone(mockReceipts);
let putawayState: PutawayItem[] = clone(mockPutaway);
let transfersState: TransferTask[] = clone(mockTransfers);
let countsState: CountTask[] = clone(mockCounts);

export const api = {
  /* ---------- Sipariş Toplama ---------- */
  async getPickOrders(): Promise<PickOrder[]> {
    return delay(ordersState.map(clone));
  },
  async getPickOrder(id: string): Promise<PickOrder | undefined> {
    const order = ordersState.find((o) => o.id === id);
    return delay(order ? clone(order) : undefined);
  },
  async completePickOrder(order: PickOrder): Promise<{ ok: true; caniasRef: string }> {
    ordersState = ordersState.filter((o) => o.id !== order.id);
    return delay({ ok: true as const, caniasRef: order.reference });
  },

  /* ---------- Mal Kabul ---------- */
  async getReceipts(): Promise<Receipt[]> {
    return delay(receiptsState.map(clone));
  },
  async getReceipt(id: string): Promise<Receipt | undefined> {
    const r = receiptsState.find((x) => x.id === id);
    return delay(r ? clone(r) : undefined);
  },
  async completeReceipt(receipt: Receipt): Promise<{ ok: true; caniasRef: string }> {
    receiptsState = receiptsState.filter((r) => r.id !== receipt.id);
    return delay({ ok: true as const, caniasRef: receipt.reference });
  },

  /* ---------- Yerleştirme ---------- */
  async getPutawayItems(): Promise<PutawayItem[]> {
    return delay(putawayState.map(clone));
  },
  async completePutaway(itemId: string, location: string): Promise<{ ok: true }> {
    putawayState = putawayState.filter((i) => i.id !== itemId);
    void location;
    return delay({ ok: true as const });
  },

  /* ---------- Transfer ---------- */
  async getTransferTasks(): Promise<TransferTask[]> {
    return delay(transfersState.map(clone));
  },
  async completeTransfer(taskId: string): Promise<{ ok: true }> {
    transfersState = transfersState.filter((tk) => tk.id !== taskId);
    return delay({ ok: true as const });
  },

  /* ---------- Sayım ---------- */
  async getCountTasks(): Promise<CountTask[]> {
    return delay(countsState.map(clone));
  },
  async getCountTask(id: string): Promise<CountTask | undefined> {
    const c = countsState.find((x) => x.id === id);
    return delay(c ? clone(c) : undefined);
  },
  async completeCount(task: CountTask): Promise<{ ok: true; caniasRef: string }> {
    countsState = countsState.filter((c) => c.id !== task.id);
    return delay({ ok: true as const, caniasRef: task.reference });
  },

  /* ---------- Ürün Sorgulama ---------- */
  async queryProduct(barcode: string): Promise<ProductStock | undefined> {
    return delay(lookupStock(barcode));
  },
};
