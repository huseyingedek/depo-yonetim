import type { PickOrder } from "../types";

// Demo verisi. Gerçek servisler bağlanınca api/client.ts içindeki adapter değişir,
// ekranlar aynı kalır.
export const mockOrders: PickOrder[] = [
  {
    id: "SO100245",
    customer: "ABC Market",
    reference: "CANIAS-2026-000245",
    createdAt: "2026-07-18T08:20:00",
    lines: [
      {
        id: "l1",
        product: { code: "CY-TRK-1KG", name: "Çaykur Tiryaki Çay 1 KG", barcode: "8690105070307", unit: "Adet" },
        location: "A-03-02",
        requestedQty: 12,
        pickedQty: 0,
      },
      {
        id: "l2",
        product: { code: "SKR-TZ-5KG", name: "Torku Toz Şeker 5 KG", barcode: "8690504021214", unit: "Adet" },
        location: "A-01-05",
        requestedQty: 6,
        pickedQty: 0,
      },
      {
        id: "l3",
        product: { code: "ULK-CKL-80", name: "Ülker Çikolata 80 G", barcode: "8690504027214", unit: "Adet" },
        location: "B-02-01",
        requestedQty: 8,
        pickedQty: 0,
      },
      {
        id: "l4",
        product: { code: "PNR-SUT-1L", name: "Pınar Süt 1 L", barcode: "8690637012345", unit: "Adet" },
        location: "C-05-01",
        requestedQty: 4,
        pickedQty: 0,
      },
    ],
  },
  {
    id: "SO100244",
    customer: "XYZ Gıda",
    reference: "CANIAS-2026-000244",
    createdAt: "2026-07-18T08:05:00",
    lines: [
      {
        id: "l1",
        product: { code: "NST-SU-05", name: "Nestle Su 0.5 L", barcode: "8690637012349", unit: "Adet" },
        location: "A-03-01",
        requestedQty: 24,
        pickedQty: 0,
      },
      {
        id: "l2",
        product: { code: "ETI-BIS-12", name: "Eti Bisküvi 12'li", barcode: "8690504099999", unit: "Adet" },
        location: "B-01-03",
        requestedQty: 10,
        pickedQty: 0,
      },
    ],
  },
  {
    id: "SO100243",
    customer: "Metro Şube",
    reference: "CANIAS-2026-000243",
    createdAt: "2026-07-18T07:40:00",
    lines: [
      {
        id: "l1",
        product: { code: "COCA-1L", name: "Coca-Cola 1 L", barcode: "8690504011111", unit: "Adet" },
        location: "A-02-04",
        requestedQty: 18,
        pickedQty: 0,
      },
    ],
  },
];
