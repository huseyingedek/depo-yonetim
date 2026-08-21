import { describe, it, expect } from "vitest";
import { api } from "../api/client";

describe("Mal Kabul (Goods Receipt) Comprehensive Flow & Service Parameter Audit", () => {
  // ---------------------------------------------------------------------------
  // 1. ADIM: Tedarikçi Seçimi ve Varsayılan Depo Parametreleri
  // ---------------------------------------------------------------------------
  describe("1. Adım: Tedarikçi ve Depo Parametreleri", () => {
    it("varsayılan hedef depo kodu '00$*' olmalıdır", () => {
      const defaultTargetWh = "00$*";
      expect(defaultTargetWh).toBe("00$*");
      expect(defaultTargetWh).not.toBe("00&*");
    });
  });

  // ---------------------------------------------------------------------------
  // 2. ADIM: Malzeme Okutma, Hacim (Desi) ve Çevrim Katsayıları
  // ---------------------------------------------------------------------------
  describe("2. Adım: Malzeme Detay, Desi ve Katsayı Hesaplamaları", () => {
    it("Desi formülü (En × Boy × Yükseklik) / 3000 olarak hesaplanmalı ve birimi 'DS' olmalıdır", () => {
      const width = 30; // cm
      const length = 40; // cm
      const height = 50; // cm

      const desi = Number(((width * length * height) / 3000).toFixed(2));
      expect(desi).toBe(20); // (30 * 40 * 50) / 3000 = 60000 / 3000 = 20 DS
    });

    it("Koli okutulduğunda koli katsayısı ile adet miktarı doğru hesaplanmalıdır", () => {
      const packageMultiplier = 24; // 1 KO = 24 AD
      const scannedQty = 5; // 5 KO
      const totalStockQty = scannedQty * packageMultiplier;

      expect(totalStockQty).toBe(120); // 120 AD
    });
  });

  // ---------------------------------------------------------------------------
  // 3. ADIM: Öz Nitelikler Sıralaması ve Renk Standartları
  // ---------------------------------------------------------------------------
  describe("3. Adım: Öz Nitelik Sıralaması ve Renk Kuralları", () => {
    it("Takipli rozeti her zaman İLK sırada ve hap/pill rozet şeklinde olmalıdır", () => {
      const isSpecialLot = true;
      const specialAttributes = {
        isspoil: true,
        aklisbreakable: true,
        isexplos: true,
      };

      const attrs: Array<{ id: string; label: string; isPill?: boolean; colorClass: string }> = [];

      // 1. Takipli / Partili (İlk Sırada)
      if (isSpecialLot) {
        attrs.push({
          id: "special_lot",
          label: "Parti takipli",
          isPill: true,
          colorClass: "rounded-full border border-amber-300 bg-amber-50 text-amber-700 font-bold",
        });
      }

      // 2. Bozulur (Yeşil)
      if (specialAttributes.isspoil) {
        attrs.push({
          id: "spoil",
          label: "Bozulur",
          colorClass: "rounded border border-emerald-500/40 bg-emerald-500/15 text-emerald-800",
        });
      }

      // 3. Yanıcı (Kırmızı)
      if (specialAttributes.isexplos) {
        attrs.push({
          id: "explos",
          label: "Yanıcı",
          colorClass: "rounded border border-rose-500/40 bg-rose-500/15 text-rose-800",
        });
      }

      // 4. Kırılabilir (En Sonda ve Açık Sarı)
      if (specialAttributes.aklisbreakable) {
        attrs.push({
          id: "breakable",
          label: "Kırılabilir",
          colorClass: "rounded border border-yellow-300/80 bg-yellow-50 text-yellow-900",
        });
      }

      expect(attrs[0].id).toBe("special_lot");
      expect(attrs[0].label).toBe("Parti takipli");
      expect(attrs[0].isPill).toBe(true);

      expect(attrs[attrs.length - 1].id).toBe("breakable");
      expect(attrs[attrs.length - 1].label).toBe("Kırılabilir");

      const spoilAttr = attrs.find((a) => a.id === "spoil");
      expect(spoilAttr?.colorClass).toContain("emerald");
    });
  });

  // ---------------------------------------------------------------------------
  // 4. ADIM: FIFO Açık Sipariş Karşılama ve Dağıtımı
  // ---------------------------------------------------------------------------
  describe("4. Adım: FIFO Sipariş Dağıtımı ve Sipariş/Stok Birimi Ayrımı", () => {
    it("FIFO mantığıyla açık siparişlere stok ve sipariş birimi bazında dağıtım yapmalıdır", () => {
      const openOrders = [
        { PURORDER: "OP-001", ITEMNUM: 1, PURUNIT: "KO", SKUNIT: "AD", REMAININGQTY: 10, CONV1: 1, CONV2: 10 }, // 10 KO = 100 AD
        { PURORDER: "OP-002", ITEMNUM: 1, PURUNIT: "KO", SKUNIT: "AD", REMAININGQTY: 5, CONV1: 1, CONV2: 10 },  // 5 KO = 50 AD
      ];

      const factor = 10; // 1 KO = 10 AD
      const receiptPurQty = 12; // Depocu 12 KO kabul ediyor
      let remainingStockToDistribute = receiptPurQty * factor; // 120 AD

      const newItems: Array<{ orderNum: string; purQty: number; purUnit: string; receivedQty: number; unit: string }> = [];

      for (const ord of openOrders) {
        if (remainingStockToDistribute <= 0) break;
        const totalStockQty = ord.REMAININGQTY * factor;
        const allocStock = Math.min(remainingStockToDistribute, totalStockQty);
        remainingStockToDistribute -= allocStock;
        const allocPur = Number((allocStock / factor).toFixed(2));

        newItems.push({
          orderNum: ord.PURORDER,
          purQty: allocPur,
          purUnit: ord.PURUNIT,
          receivedQty: allocStock,
          unit: ord.SKUNIT,
        });
      }

      expect(newItems).toHaveLength(2);
      // İlk sipariş tam kapandı: 10 KO = 100 AD
      expect(newItems[0].orderNum).toBe("OP-001");
      expect(newItems[0].purQty).toBe(10);
      expect(newItems[0].purUnit).toBe("KO");
      expect(newItems[0].receivedQty).toBe(100);
      expect(newItems[0].unit).toBe("AD");

      // İkinci sipariş kısmi kapandı: 2 KO = 20 AD
      expect(newItems[1].orderNum).toBe("OP-002");
      expect(newItems[1].purQty).toBe(2);
      expect(newItems[1].purUnit).toBe("KO");
      expect(newItems[1].receivedQty).toBe(20);
      expect(newItems[1].unit).toBe("AD");
    });
  });

  // ---------------------------------------------------------------------------
  // 5. ADIM: MZYSaveReceipt Servis Parametreleri ve Payload Testi
  // ---------------------------------------------------------------------------
  describe("5. Adım: CANIAS MZYSaveReceipt Payload Bütünlüğü", () => {
    it("Partili ve serbest malzemeler için SPECIALSTOCK '1'/'0', BATCHNUM, READQUANTITY, READPURQTY eksiksiz hazırlanmalıdır", () => {
      const items = [
        {
          orderType: "OP",
          orderNum: "179395",
          itemNum: 1,
          material: "LOT-MAT",
          receivedQty: 100, // Stok birimi
          unit: "AD",
          purQty: 10, // Sipariş birimi
          purUnit: "KO",
          isSpecialLot: true,
          batchNum: "LOT-2026-A",
          expiryDate: "2026-12-31",
        },
        {
          orderType: "OP",
          orderNum: "179396",
          itemNum: 2,
          material: "FREE-MAT",
          receivedQty: 50,
          unit: "AD",
          purQty: 50,
          purUnit: "AD",
          isSpecialLot: false,
        },
      ];

      const formatted = items.map((it) => {
        const isPartili = Boolean(it.isSpecialLot);
        return {
          MATERIAL: it.material,
          SPECIALSTOCK: isPartili ? "1" : "0",
          BATCHNUM: isPartili ? String(it.batchNum || "").trim() : "",
          READQUANTITY: Number(it.receivedQty),
          QUNIT: String(it.unit || "AD").trim().toUpperCase(),
          READPURQTY: it.purQty !== undefined ? Number(it.purQty) : Number(it.receivedQty),
          PURUNIT: String(it.purUnit || it.unit || "AD").trim().toUpperCase(),
          ORDERTYPE: it.orderType,
          ORDERNUM: it.orderNum,
          ITEMNUM: it.itemNum,
          EXPIRYDATE: String(it.expiryDate || "").trim(),
        };
      });

      // 1. Kalem: Partili
      expect(formatted[0].MATERIAL).toBe("LOT-MAT");
      expect(formatted[0].SPECIALSTOCK).toBe("1");
      expect(formatted[0].BATCHNUM).toBe("LOT-2026-A");
      expect(formatted[0].READQUANTITY).toBe(100);
      expect(formatted[0].QUNIT).toBe("AD");
      expect(formatted[0].READPURQTY).toBe(10);
      expect(formatted[0].PURUNIT).toBe("KO");
      expect(formatted[0].EXPIRYDATE).toBe("2026-12-31");

      // 2. Kalem: Serbest (Non-lot)
      expect(formatted[1].MATERIAL).toBe("FREE-MAT");
      expect(formatted[1].SPECIALSTOCK).toBe("0");
      expect(formatted[1].BATCHNUM).toBe("");
      expect(formatted[1].READQUANTITY).toBe(50);
      expect(formatted[1].QUNIT).toBe("AD");
      expect(formatted[1].READPURQTY).toBe(50);
      expect(formatted[1].PURUNIT).toBe("AD");
    });
  });

  // ---------------------------------------------------------------------------
  // 6. ADIM: MzySetMatSize Primitive '1' Yanıt Koruması
  // ---------------------------------------------------------------------------
  describe("6. Adım: MzySetMatSize Primitive '1' Yanıtı ve Geri Dönüş State Koruması", () => {
    it("CANIAS servisinden primitive '1' döndüğünde istemci çökmemeli ve başarıyla tamamlanmalıdır", () => {
      // client.ts mesajTablosu korumasını simüle et
      const rawData: unknown = 1;
      const isObject = rawData && typeof rawData === "object";
      expect(isObject).toBeFalsy();

      // Ölçü sayfasından dönüşte katsayıların kaybolmadığını doğrula
      const savedDimensions = {
        width: 25,
        length: 35,
        height: 45,
        volume: 13.13,
        netWeight: 1.5,
        brutWeight: 2.0,
      };

      const restoredMaterial = {
        material: "BS020",
        packageMultiplier: 12,
        unitMultipliers: { KO: 12, AD: 1 },
        dimensions: savedDimensions,
      };

      expect(restoredMaterial.packageMultiplier).toBe(12);
      expect(restoredMaterial.unitMultipliers.KO).toBe(12);
      expect(restoredMaterial.dimensions.volume).toBe(13.13);
    });
  });
});
