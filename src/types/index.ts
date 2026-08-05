export type OperationType =
  | "receiving" // Mal Kabul
  | "putaway" // Yerleştirme
  | "picking" // Toplama
  | "transfer" // Transfer
  | "count" // Sayım
  | "inquiry" // Ürün Sorgulama
  | "label_printing"; // Etiket Yazdırma

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
  barcode2?: string; // ürünün 2. barkodu (ör. koli barkodu)
  unit: string; // birim (Adet, KG...)
}

export type LineStatus = "pending" | "partial" | "done";

export interface PickRecord {
  id: string;
  material: string; // MATERIAL
  warehouse: string;
  stockPlace: string;
  specialStock: string;
  lot?: string; // BATCHNUM
  qty: number; // QUANTITY
  unit: string; // QUNIT
  docType: string; // ORDERTYPE (SO)
  docNum: string; // ORDERNUM
  itemNo: string; // ITEMNO

  barcode: string;
  at: number; // okutma zamanı
}

export interface BarcodeResult {

  ok: boolean;

  material: string;

  name: string;

  unit: string;

  lot?: string;

  specialStock: string;

  quantity: number;

  availStock: number;

  fields: Record<string, string>;

  message: string;
}

export interface RestoredPick {
  warehouse: string;
  stockPlace: string;
  material: string; // MATERIAL
  lot?: string;
  specialStock: string;
  qty: number;
  unit: string; // QUNIT
  orderNum: string;
  orderType: string; // ORDERTYPE
  itemNo: string; // ITEMNO — kalem no
}

export interface ShelfResult {
  ok: boolean;
  warehouse: string;
  stockPlace: string;
  message: string;

  restored?: RestoredPick[];
}

export interface PickLine {
  id: string;
  product: ProductRef;
  location: string; // raf / stok yeri
  requestedQty: number; // MOVEQTY

  pickedQty: number;

  records?: PickRecord[];

  lotTracked?: boolean;
  lot?: string; // okutulan parti
  expiry?: string;

  priority?: number;

  orderQty?: number;
  orderUnit?: string;
  cfactor?: number;

  suggestions?: PickSuggestion[];

  targetArea?: string;

  targetWarehouse?: string;

  weight?: number;

  volume?: number;
}

export type PickOrderStatus = "open" | "partial" | "closed";

export interface PickOrder {
  id: string; // ORDERNUM — emir numarası
  orderType?: string;
  customer: string; // CUSTOMER — müşteri/tedarikçi no
  reference: string; // STEXT — emir açıklaması
  createdAt: string; // CREATEDAT
  worker?: string; // WORKER — varsayılan çalışan
  priority?: number;
  status?: PickOrderStatus; // STATUS
  started?: boolean;

  startTime?: string;
  lines: PickLine[];

  sourceWarehouse?: string; // WAREHOUSEFA — kaynak/çıkış deposu
  sourceShelf?: string; // FRONTAREA — kaynak raf
}

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

export interface PutawayItem {
  id: string;
  product: ProductRef;
  qty: number;
  suggestedLocation: string; // Önerilen lokasyon
  placedLocation?: string; // Yerleştirilen lokasyon (elle onay/değiştir)
  placed: boolean;
  sourceRef: string; // hangi irsaliyeden geldi
}

export interface TransferTask {
  id: string;
  product: ProductRef;
  fromLocation: string;
  toLocation: string;
  qty: number;
  movedQty: number;
}

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

export interface StockLocation {
  location: string;
  qty: number;
}

export interface ProductStock {
  product: ProductRef;
  totalStock: number;
  locations: StockLocation[];
}

export interface StockBatch {
  batchNum: string; // BATCHNUM
  availStock: number; // AVAILSTOCK
  unit: string;
}

// Ürün sorgulama — MZYGetStock / TBLSTOCK satırı (raf ve/veya ürün bağımsız).
// Alanlar canlı yanıtla teyit edildi (05.08): COMPANY, PLANT, MATERIAL,
// WAREHOUSE, STOCKPLACE, SPECIALSTOCK, BATCHNUM, VOPTIONS, AVAILSTOCK, QUNIT.
// Malzeme açıklaması Bora tarafından MTEXT alanı olarak eklendi (05.08).
export interface StockRow {
  material: string; // MATERIAL — malzeme kodu
  name: string; // MTEXT — malzeme açıklaması
  warehouse: string; // WAREHOUSE — depo
  stockPlace: string; // STOCKPLACE — stok yeri / HU
  batchNum: string; // BATCHNUM — parti
  specialStock: string; // SPECIALSTOCK — 1: parti/SKT takipli
  availStock: number; // AVAILSTOCK
  unit: string; // QUNIT
}

export interface PickSuggestion {
  itemNo: number;
  location: string; // STOCKPLACE — stok yeri
  warehouse: string; // WAREHOUSE — depo

  barcode: string;
  material: string;
  lot?: string;

  total: number;
  unit: string; // QUNIT

  distance?: number;

  entryDate?: string;
}
