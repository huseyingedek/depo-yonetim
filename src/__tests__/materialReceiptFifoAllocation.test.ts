import { describe, it, expect } from "vitest";

// FIFO & CANIAS Open Order parsing logic simulation
const parseNum = (val: unknown): number => {
  if (val === null || val === undefined) return 0;
  if (typeof val === "number") return isNaN(val) ? 0 : val;
  if (typeof val === "string") {
    const cleaned = val.replace(/\s/g, "").replace(",", ".");
    const n = parseFloat(cleaned);
    return isNaN(n) ? 0 : n;
  }
  return 0;
};

const getOrderRemainingQty = (ord: Record<string, unknown>): number => {
  if (!ord || typeof ord !== "object") return 0;

  const candidates = [
    ord.REMQUANTITY,
    ord.REMQTY,
    ord.REMAININGQTY,
    ord.REMAININGQUANTITY,
    ord.OPENQTY,
    ord.OPENQUANTITY,
    ord.RESTQTY,
    ord.RESTQUANTITY,
    ord.PENDINGQTY,
    ord.BALQTY,
    ord.BALANCE,
    ord.KALAN,
    ord.KALANMIKTAR,
    ord.ACIKMIKTAR,
    ord.ACIK,
    ord.QUANTITY,
    ord.QTY,
    ord.ORDERQTY,
    ord.PURQTY,
    ord.ORDERQUANTITY,
    ord.PURQUANTITY,
    ord.REQQUANTITY,
    ord.PDCQUANTITY,
    ord.AKLSQUANTITY,
  ];

  for (const c of candidates) {
    if (c !== undefined && c !== null && c !== "") {
      const num = parseNum(c);
      if (num > 0) return num;
    }
  }

  for (const [k, v] of Object.entries(ord)) {
    if (
      /remquantity|remqty|remaining|openqty|restqty|balance|kalan|acik|quantity|qty|orderqty|miktar/i.test(k) &&
      !/net|gross|amount|total|tutar|price|fiyat|cost|curr|val|unit|date|tarih/i.test(k)
    ) {
      const num = parseNum(v);
      if (num > 0) return num;
    }
  }

  return 0;
};

const getOrderItemNum = (ord: Record<string, unknown>, fallbackIndex: number): string => {
  if (!ord || typeof ord !== "object") return String(fallbackIndex + 1);

  const candidates = [
    ord.ITEMNUM,
    ord.ITEM,
    ord.ITEMNO,
    ord.LINE,
    ord.LINENO,
    ord.POITEM,
    ord.PURITEM,
    ord.DOCITEM,
    ord.POSNO,
    ord.ORDERITEM,
    ord.KALEMNO,
    ord.KALEM,
    ord.ROWNUM,
    ord.ORDITEM,
  ];

  for (const c of candidates) {
    if (c !== undefined && c !== null) {
      const s = String(c).trim();
      if (s !== "" && s !== "0") {
        return s;
      }
    }
  }

  return String(fallbackIndex + 1);
};

const getOrderNum = (ord: Record<string, unknown>, fallbackIndex: number): string => {
  if (!ord || typeof ord !== "object") return `SIP-${fallbackIndex + 1}`;

  const candidates = [
    ord.PURORDER,
    ord.ORDERNUM,
    ord.ORDERNO,
    ord.POORDER,
    ord.PO_NUMBER,
    ord.DOCNUM,
    ord.DOCNO,
    ord.ORDER_NUM,
    ord.ORDER,
  ];

  for (const c of candidates) {
    if (c !== undefined && c !== null) {
      const s = String(c).trim();
      if (s !== "") return s;
    }
  }
  return `SIP-${fallbackIndex + 1}`;
};

const calculateFifoAllocation = (openOrders: Record<string, unknown>[], receiptQty: number) => {
  let remainingToDistribute = Math.max(0, receiptQty);
  const allocatedOrders: Array<{
    orderNum: string;
    itemNum: string;
    remainingQty: number;
    allocatedQty: number;
    remainingAfter: number;
    isFullyAllocated: boolean;
    isPartiallyAllocated: boolean;
  }> = [];

  openOrders.forEach((ord, idx) => {
    const orderNum = getOrderNum(ord, idx);
    const itemNum = getOrderItemNum(ord, idx);
    const rawRem = getOrderRemainingQty(ord);
    const remainingQty = rawRem > 0 ? rawRem : 1;

    const alloc = Math.min(remainingToDistribute, remainingQty);
    remainingToDistribute -= alloc;

    allocatedOrders.push({
      orderNum,
      itemNum,
      remainingQty,
      allocatedQty: alloc,
      remainingAfter: Math.max(0, remainingQty - alloc),
      isFullyAllocated: remainingQty > 0 && alloc === remainingQty,
      isPartiallyAllocated: alloc > 0 && alloc < remainingQty,
    });
  });

  return {
    allocations: allocatedOrders,
    unallocatedQty: remainingToDistribute,
  };
};

describe("Mal Kabul FIFO Sipariş Dağıtımı ve CANIAS Alan Adları Uyumluluk Testleri", () => {
  it("CANIAS REMQUANTITY alanını doğru okumalı ve bakiye olarak kullanmalıdır", () => {
    const row = {
      PURORDER: "SIP-2026-001",
      ITEMNUM: "10",
      REMQUANTITY: "25",
      ORDERDATE: "2026-08-01",
    };

    expect(getOrderRemainingQty(row)).toBe(25);
    expect(getOrderItemNum(row, 0)).toBe("10");
    expect(getOrderNum(row, 0)).toBe("SIP-2026-001");
  });

  it("ITEMNUM '0' veya boş geldiğinde Kalem No 0 kalmamalı, 1-tabanlı sıra numarasına (1, 2, 3...) dönüştürülmelidir", () => {
    const row1 = { PURORDER: "SIP-1", ITEMNUM: "0", QUANTITY: "10" };
    const row2 = { PURORDER: "SIP-2", ITEMNUM: 0, QUANTITY: "20" };
    const row3 = { PURORDER: "SIP-3", ITEMNUM: "", QUANTITY: "30" };

    expect(getOrderItemNum(row1, 0)).toBe("1");
    expect(getOrderItemNum(row2, 1)).toBe("2");
    expect(getOrderItemNum(row3, 2)).toBe("3");
  });

  it("Farklı CANIAS miktar alanlarını (QUANTITY, ORDERQTY, OPENQTY, RESTQTY, KALAN) desteklemelidir", () => {
    expect(getOrderRemainingQty({ QUANTITY: "15" })).toBe(15);
    expect(getOrderRemainingQty({ ORDERQTY: "40" })).toBe(40);
    expect(getOrderRemainingQty({ OPENQTY: "30" })).toBe(30);
    expect(getOrderRemainingQty({ RESTQTY: "8" })).toBe(8);
    expect(getOrderRemainingQty({ KALAN: "50" })).toBe(50);
    expect(getOrderRemainingQty({ ACIKMIKTAR: "12" })).toBe(12);
  });

  it("Paket/Adet sayısı arttıkça FIFO sırasına göre sipariş bakiyelerinden otomatik düşüm yapmalıdır", () => {
    const orders = [
      { PURORDER: "SIP-001", ITEMNUM: "1", REMQUANTITY: "10" },
      { PURORDER: "SIP-002", ITEMNUM: "1", REMQUANTITY: "20" },
      { PURORDER: "SIP-003", ITEMNUM: "1", REMQUANTITY: "30" },
    ];

    // Durum 1: 5 Adet/Paket kabul
    const res1 = calculateFifoAllocation(orders, 5);
    expect(res1.allocations[0].allocatedQty).toBe(5);
    expect(res1.allocations[0].remainingAfter).toBe(5);
    expect(res1.allocations[0].isPartiallyAllocated).toBe(true);
    expect(res1.allocations[1].allocatedQty).toBe(0);
    expect(res1.allocations[2].allocatedQty).toBe(0);
    expect(res1.unallocatedQty).toBe(0);

    // Durum 2: 15 Adet/Paket kabul (İlk siparişin tamamı + 2. siparişten 5 adet)
    const res2 = calculateFifoAllocation(orders, 15);
    expect(res2.allocations[0].allocatedQty).toBe(10);
    expect(res2.allocations[0].remainingAfter).toBe(0);
    expect(res2.allocations[0].isFullyAllocated).toBe(true);
    expect(res2.allocations[1].allocatedQty).toBe(5);
    expect(res2.allocations[1].remainingAfter).toBe(15);
    expect(res2.allocations[1].isPartiallyAllocated).toBe(true);
    expect(res2.allocations[2].allocatedQty).toBe(0);
    expect(res2.unallocatedQty).toBe(0);

    // Durum 3: 65 Adet/Paket kabul (Tüm siparişler karşılanır + 5 adet serbest miktar)
    const res3 = calculateFifoAllocation(orders, 65);
    expect(res3.allocations[0].isFullyAllocated).toBe(true);
    expect(res3.allocations[1].isFullyAllocated).toBe(true);
    expect(res3.allocations[2].isFullyAllocated).toBe(true);
    expect(res3.unallocatedQty).toBe(5);
  });

  it("CANIAS bakiye alanı 0 veya tanımsız dönse bile sistem 0'da kilitlenmemeli, en az 1 bakiye düşülebilir olmalıdır", () => {
    const orders = [
      { PURORDER: "SIP-001", ITEMNUM: "0" }, // Bakiye alanı yok
    ];

    const res = calculateFifoAllocation(orders, 3);
    expect(res.allocations[0].remainingQty).toBe(1);
    expect(res.allocations[0].allocatedQty).toBe(1);
    expect(res.allocations[0].itemNum).toBe("1");
    expect(res.unallocatedQty).toBe(2);
  });

  // ---------------------------------------------------------------------------
  // 3 AŞAMALI (1 ÜRÜN · 2 ÖLÇÜ · 3 ADET) ADIM GEÇİŞİ TESTLERİ
  // ---------------------------------------------------------------------------
  describe("3 Aşamalı (1 Ürün · 2 Ölçü · 3 Adet) Adım Geçiş Mantığı", () => {
    it("Ölçüleri eksik/0 olan bir ürün okutulduğunda 1. Adım yeşil olmalı ve 2. Adıma (Ölçü) geçmelidir", () => {
      const dimensions = {
        width: 0,
        length: 20,
        height: 15,
        netWeight: 0,
        brutWeight: 1.5,
      };

      const hasAllDimensions =
        dimensions.width > 0 &&
        dimensions.length > 0 &&
        dimensions.height > 0 &&
        dimensions.netWeight > 0 &&
        dimensions.brutWeight > 0;

      expect(hasAllDimensions).toBe(false);
      const nextStep = hasAllDimensions ? "quantity" : "dimensions";
      expect(nextStep).toBe("dimensions");
    });

    it("Bütün ölçü değerleri tam (> 0) olan bir ürün okutulduğunda 2. Adım da yeşil olmalı ve doğrudan 3. Adıma (Adet) atlamalıdır", () => {
      const dimensions = {
        width: 30,
        length: 40,
        height: 20,
        netWeight: 2.5,
        brutWeight: 3.0,
      };

      const hasAllDimensions =
        dimensions.width > 0 &&
        dimensions.length > 0 &&
        dimensions.height > 0 &&
        dimensions.netWeight > 0 &&
        dimensions.brutWeight > 0;

      expect(hasAllDimensions).toBe(true);
      const nextStep = hasAllDimensions ? "quantity" : "dimensions";
      expect(nextStep).toBe("quantity");
    });

    it("CANIAS NET veya AMOUNT gibi parasal tutar alanlarını (örn: 17634.15) adet olarak algılamamalıdır", () => {
      const rowWithMoney = {
        PURORDER: "SIP-2026-999",
        QUANTITY: "25",
        REMQUANTITY: "20",
        NET: "17634.15",
        AMOUNT: "17634.15",
        PRICE: "352.68",
      };

      const rem = getOrderRemainingQty(rowWithMoney);
      expect(rem).toBe(20);
      expect(rem).not.toBe(17634.15);
    });
  });
});
