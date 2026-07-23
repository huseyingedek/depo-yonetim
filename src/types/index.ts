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

/**
 * KABUL EDİLEN KAYIT — her barkod okutması bir satır üretir.
 *
 * Neden sayaç değil de kayıt listesi:
 * Stok bu satırlara göre düşecek. "Miktar 3" demek yetmiyor; hangi raftan,
 * hangi partiden, hangi belgeye karşılık alındığı da lazım. Bir ürünün
 * birden fazla barkodu ve birden fazla rafı olabildiği için aynı kalem
 * birden çok kayıt üretebilir.
 *
 * KURAL: kayıt SİLİNEBİLİR ve miktarı AZALTILABİLİR, ama ARTIRILAMAZ.
 * Artırmak yeni bir okutma demektir — ekranda sayı büyütmek gerçek malı
 * temsil etmez.
 */
export interface PickRecord {
  id: string;
  material: string; // MATERIAL
  warehouse: string; // WAREHOUSE — okutulan rafın deposu
  stockPlace: string; // STOCKPLACE — okutulan rafın stok yeri
  specialStock: string; // SPECIALSTOCK — özel stok ("1" ise SKT'li)
  lot?: string; // BATCHNUM
  qty: number; // QUANTITY
  unit: string; // QUNIT
  docType: string; // ORDERTYPE (SO)
  docNum: string; // ORDERNUM
  itemNo: string; // ITEMNO
  /** Okutulan ham barkod — hangi barkodla girildiği iz olarak kalsın */
  barcode: string;
  at: number; // okutma zamanı
}

/**
 * MZYReadBarcode sonucu.
 *
 * Servis WMSXMLTABLE içinde anahtar-değer listesi döndürüyor; başarılı
 * okumada hangi alanların geleceği henüz bilinmediği için ham alanlar
 * `fields` içinde olduğu gibi taşınıyor.
 */
export interface BarcodeResult {
  /** Barkod çözülebildi mi? */
  ok: boolean;
  /** MATERIAL — malzeme kodu (UD009 gibi). */
  material: string;
  /** MTEXT — malzeme adı. */
  name: string;
  /** UNIT — birim (AD, PK...). */
  unit: string;
  /** BATCHNUM — parti. "*" ise parti takibi yok. */
  lot?: string;
  /**
   * SPECIALSTOCK — "1" ise ürün PARTİ TAKİPLİ (depocu parti barkodunu da
   * okutmalı), "*" ise takipsiz. Bora: parti takibini buradan anlıyoruz.
   */
  specialStock: string;
  /**
   * QUANTITY — okutulan BARKODUN kaç stok birimi ettiği.
   * Bora: "1 koli 5 adet ise 5 döner". Yani koli barkodu okutunca 5.
   */
  quantity: number;
  /**
   * AVAILSTOCK — okutulan RAFTA, bu üründen ve bu partiden ne kadar var.
   * Bora: raf + ürün + parti üçü birden gönderilirse gerçek değer döner,
   * biri eksikse 0 gelir. Yani 0 gelmesi "stok yok" demek değil,
   * "sorgulanamadı" da olabilir — o yüzden 0'a bakarak engelleme yapılmaz.
   */
  availStock: number;
  /** Ham alanlar — eşlenmemiş olanlara erişmek için. */
  fields: Record<string, string>;
  /** Hata durumunda kullanıcıya gösterilecek mesaj. */
  message: string;
}

/** MZYReadBarcodeSP — raf barkodu çözümü. */
export interface ShelfResult {
  ok: boolean;
  warehouse: string;
  stockPlace: string;
  message: string;
}

export interface PickLine {
  id: string;
  product: ProductRef;
  location: string; // raf / stok yeri
  requestedQty: number; // MOVEQTY
  /** MOVEDQTY — emirden gelen başlangıç değeri. Güncel toplam için
   *  `records` toplamına bakılmalı (bkz. linePicked). */
  pickedQty: number;
  /** Bu kalem için okutulan kayıtlar — stok bunlara göre düşecek. */
  records?: PickRecord[];
  /** Parti No "*" değilse parti takipli → parti barkodu da okutulur. */
  lotTracked?: boolean;
  lot?: string; // okutulan parti
  expiry?: string; // parti barkodundan gelen SKT (gösterim)
  /** PRIORITY — toplama önceliği, küçük olan önce. Kalem seviyesinde gelir. */
  priority?: number;
  /**
   * Bu kalemin alınabileceği raflar — MZYCrtSuggestListPickFromSP'den.
   * Bir ürün birden fazla rafta olabilir; mesafeye göre sıralı gelir.
   * Her öneri rafın yanında oradaki stoğu da taşır.
   */
  suggestions?: PickSuggestion[];
  /**
   * TRANSAREA — toplama emrinde HEDEF alan.
   * Ürünün alınacağı raf değil; toplanan malın konduğu paletin/aracın
   * bırakılacağı yer. Yerleştirme emrinde kullanılmaz.
   */
  targetArea?: string;
  /**
   * WAREHOUSETA — hedef depo. MZYCreateContainer'a bu gönderilir (Bora),
   * ayarlardaki depo değil.
   */
  targetWarehouse?: string;
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
/**
 * MZYCrtSuggestListPickFromSP → SUGGESTEDLISTFROM tablosu.
 * "Bu kalemi hangi raftan al" önerisi: raf, oradaki stok, mesafe, giriş tarihi.
 */
export interface PickSuggestion {
  itemNo: number;
  location: string; // STOCKPLACE — stok yeri
  warehouse: string; // WAREHOUSE — depo
  /** Raf barkodu biçimi: DEPO$STOKYERİ */
  barcode: string;
  material: string;
  lot?: string; // BATCHNUM — parti (SPECIALSTOCK=1 ise dolu)
  /** TOTAL — o rafta bu üründen kaç tane var */
  total: number;
  unit: string; // QUNIT
  /** DISTANCE — rafın uzaklığı; küçük olan önce gösterilir */
  distance?: number;
  /** ENTRYDATE — stoğun rafa giriş tarihi (FIFO için) */
  entryDate?: string;
}
