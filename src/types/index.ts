export type OperationType =
  | "receiving" // Mal Kabul
  | "putaway" // Yerleştirme
  | "picking" // Toplama
  | "transfer" // Transfer
  | "count" // Sayım
  | "inquiry"; // Ürün Sorgulama

export interface User {
  username: string;
  displayName: string;
}

export interface Settings {
  company: string; // Firma
  facility: string; // Tesis
  warehouse: string; // Depo
  language: "tr" | "en";
}

export interface ProductRef {
  code: string; // ürün kodu
  name: string;
  barcode: string;
  unit: string; // birim (Adet, KG...)
}

export type LineStatus = "pending" | "partial" | "done";

export interface PickLine {
  id: string;
  product: ProductRef;
  location: string; // lokasyon
  requestedQty: number;
  pickedQty: number;
}

export interface PickOrder {
  id: string; // Sipariş no (ör. SO100245)
  customer: string; // Müşteri / Şube
  reference: string; // CANIAS referansı
  createdAt: string;
  lines: PickLine[];
}

/* ---------- Mal Kabul (Receiving) ---------- */
export interface ReceiptLine {
  id: string;
  product: ProductRef;
  expectedQty: number;
  receivedQty: number;
  lot?: string; // Lot numarası
  expiry?: string; // SKT (son kullanma tarihi)
  tracksLot: boolean; // lot/SKT takibi var mı
}

export interface Receipt {
  id: string; // İrsaliye no (ör. IRS000245)
  supplier: string; // Tedarikçi
  reference: string;
  createdAt: string;
  lines: ReceiptLine[];
}

/* ---------- Yerleştirme (Put-away) ---------- */
export interface PutawayItem {
  id: string;
  product: ProductRef;
  qty: number;
  suggestedLocation: string; // Önerilen lokasyon
  placedLocation?: string; // Yerleştirilen lokasyon (elle onay/değiştir)
  placed: boolean;
  sourceRef: string; // hangi irsaliyeden geldi
}

/* ---------- Transfer ---------- */
export interface TransferTask {
  id: string;
  product: ProductRef;
  fromLocation: string;
  toLocation: string;
  qty: number;
  movedQty: number;
}

/* ---------- Sayım (Count) ---------- */
export interface CountLine {
  id: string;
  product: ProductRef;
  systemQty: number;
  countedQty: number | null; // sayılmadıysa null
}

export interface CountTask {
  id: string;
  location: string;
  reference: string;
  lines: CountLine[];
}

/* ---------- Ürün Sorgulama (Inquiry) ---------- */
export interface StockLocation {
  location: string;
  qty: number;
}

export interface ProductStock {
  product: ProductRef;
  totalStock: number;
  locations: StockLocation[];
}
