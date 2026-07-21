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
  location: string; // raf / stok yeri
  requestedQty: number; // MOVEQTY
  pickedQty: number; // MOVEDQTY
  /** Parti No "*" değilse parti takipli → parti barkodu da okutulur. */
  lotTracked?: boolean;
  lot?: string; // okutulan parti
  expiry?: string; // parti barkodundan gelen SKT (gösterim)
}

/** CANIAS STATUS: 0 Açık, 1 Kısmi Açık, 2 Kapalı */
export type PickOrderStatus = "open" | "partial" | "closed";

export interface PickOrder {
  id: string; // ORDERNUM — emir numarası
  orderType?: string; // ORDERTYPE — emir tipi (EnterPick/ClosePick için gerekli)
  customer: string; // CUSTOMER — müşteri/tedarikçi no
  reference: string; // STEXT — emir açıklaması
  createdAt: string; // CREATEDAT
  worker?: string; // WORKER — varsayılan çalışan
  priority?: number; // PRIORITY — öncelik (küçük = önce)
  status?: PickOrderStatus; // STATUS
  started?: boolean; // ISSTARTED — toplamaya başlanmış mı
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

/** MZYCrtSuggestListPickFromSP çıktısı — bir kalem için toplama önerisi. */
export interface PickSuggestion {
  itemNo: number;
  location: string; // önerilen raf / stok yeri
  warehouse: string;
  material: string;
  lot?: string; // parti (SPECIALSTOCK=1 ise dolu)
  qty: number; // önerilen miktar
  unit: string;
}
