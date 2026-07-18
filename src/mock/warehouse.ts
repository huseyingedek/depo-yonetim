import type {
  Receipt,
  PutawayItem,
  TransferTask,
  CountTask,
  ProductStock,
  ProductRef,
} from "../types";

// Ortak ürün kataloğu
export const catalog: ProductRef[] = [
  { code: "CY-TRK-1KG", name: "Çaykur Tiryaki Çay 1 KG", barcode: "8690105070307", unit: "Adet" },
  { code: "SKR-TZ-5KG", name: "Torku Toz Şeker 5 KG", barcode: "8690504021214", unit: "Adet" },
  { code: "ULK-CKL-80", name: "Ülker Çikolata 80 G", barcode: "8690504027214", unit: "Adet" },
  { code: "PNR-SUT-1L", name: "Pınar Süt 1 L", barcode: "8690637012345", unit: "Adet" },
  { code: "NST-SU-05", name: "Nestle Su 0.5 L", barcode: "8690637012349", unit: "Adet" },
  { code: "ETI-BIS-12", name: "Eti Bisküvi 12'li", barcode: "8690504099999", unit: "Paket" },
  { code: "COCA-1L", name: "Coca-Cola 1 L", barcode: "8690504011111", unit: "Adet" },
  { code: "SEK-KHV-250", name: "Selamlique Kahve 250 G", barcode: "8690505012345", unit: "Adet" },
  { code: "SANA-MRG-500", name: "Sana Margarin 500 G", barcode: "8690506022345", unit: "Adet" },
  { code: "TAT-KETC-700", name: "Tat Ketçap 700 G", barcode: "8690507032345", unit: "Adet" },
  { code: "YUDUM-YAG-1L", name: "Yudum Ayçiçek Yağı 1 L", barcode: "8690508042345", unit: "Adet" },
  { code: "FILIZ-MKR-500", name: "Filiz Makarna 500 G", barcode: "8690509052345", unit: "Adet" },
];

const p = (i: number) => catalog[i % catalog.length];
const loc = (i: number) => {
  const aisle = String.fromCharCode(65 + (i % 4)); // A-D
  const bay = String((i % 8) + 1).padStart(2, "0");
  const level = String((i % 5) + 1).padStart(2, "0");
  return `${aisle}-${bay}-${level}`;
};

/* ---------- Mal Kabul ---------- */
const suppliers = ["ABC Gıda", "XYZ Dağıtım", "Delta Ltd.", "Marmara Toptan", "Ege Lojistik", "Anadolu Tedarik"];
export const mockReceipts: Receipt[] = Array.from({ length: 11 }).map((_, r) => {
  const lineCount = 3 + (r % 4);
  return {
    id: `IRS${String(245 - r).padStart(6, "0")}`,
    supplier: suppliers[r % suppliers.length],
    reference: `CANIAS-IRS-${1000 + r}`,
    createdAt: "2026-07-18T08:00:00",
    lines: Array.from({ length: lineCount }).map((__, l) => {
      const prod = p(r + l);
      const tracksLot = l % 3 === 0;
      return {
        id: `${r}-${l}`,
        product: prod,
        expectedQty: 20 + l * 10,
        receivedQty: 0,
        tracksLot,
        lot: undefined,
        expiry: undefined,
      };
    }),
  };
});

/* ---------- Yerleştirme ---------- */
export const mockPutaway: PutawayItem[] = Array.from({ length: 14 }).map((_, i) => ({
  id: `PA-${i + 1}`,
  product: p(i),
  qty: 10 + (i % 6) * 5,
  suggestedLocation: loc(i),
  placed: false,
  sourceRef: `IRS${String(245 - (i % 4)).padStart(6, "0")}`,
}));

/* ---------- Transfer ---------- */
export const mockTransfers: TransferTask[] = Array.from({ length: 9 }).map((_, i) => ({
  id: `TR-${i + 1}`,
  product: p(i + 2),
  fromLocation: loc(i),
  toLocation: loc(i + 3),
  qty: 5 + (i % 5) * 4,
  movedQty: 0,
}));

/* ---------- Sayım ---------- */
export const mockCounts: CountTask[] = Array.from({ length: 8 }).map((_, c) => {
  const lineCount = 2 + (c % 3);
  return {
    id: `CNT-${c + 1}`,
    location: loc(c),
    reference: `CANIAS-CNT-${500 + c}`,
    lines: Array.from({ length: lineCount }).map((__, l) => ({
      id: `${c}-${l}`,
      product: p(c + l),
      systemQty: 30 + l * 15,
      countedQty: null,
    })),
  };
});

/* ---------- Ürün Sorgulama ---------- */
export function lookupStock(barcode: string): ProductStock | undefined {
  const product = catalog.find((c) => c.barcode === barcode.trim());
  if (!product) return undefined;
  const idx = catalog.indexOf(product);
  const locCount = 3 + (idx % 5); // bazı ürünler çok lokasyonda → sayfalama
  const locations = Array.from({ length: locCount }).map((_, i) => ({
    location: loc(idx + i),
    qty: 40 + ((idx + i) % 7) * 25,
  }));
  return {
    product,
    totalStock: locations.reduce((s, l) => s + l.qty, 0),
    locations,
  };
}

// Sorgulama için hızlı örnek barkod listesi (demo)
export const sampleBarcodes = catalog.map((c) => c.barcode);
