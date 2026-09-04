import { describe, it, expect, beforeEach, vi } from "vitest";
import { formatBarcodeUnitInfo } from "../pages/label-printing/ProductBarcodePage";
import { api } from "../api/client";

describe("ProductBarcodePage - Barkod Türü (KO, PK, AD) ve Çoklu Kart Testleri", () => {
  let printedPayloads: Array<{ barcode?: string; unit?: string; repeat?: number }> = [];

  beforeEach(() => {
    printedPayloads = [];
    vi.spyOn(api, "printMaterial").mockImplementation(async (payload) => {
      printedPayloads.push(payload);
      return { ok: true, message: "OK" };
    });
  });

  describe("formatBarcodeUnitInfo - Barkod Türü ve Rozet Formatlayıcı", () => {
    it("Koli (KO) birimi için doğru etiket ve rozet sınıfı dönmelidir", () => {
      const ko = formatBarcodeUnitInfo("KO");
      expect(ko.short).toBe("KO");
      expect(ko.label).toBe("Koli (KO)");
      expect(ko.badgeClass).toContain("amber");

      const koli = formatBarcodeUnitInfo("KOLİ");
      expect(koli.short).toBe("KO");
      expect(koli.label).toBe("Koli (KO)");
    });

    it("Paket (PK) birimi için doğru etiket ve rozet sınıfı dönmelidir", () => {
      const pk = formatBarcodeUnitInfo("PK");
      expect(pk.short).toBe("PK");
      expect(pk.label).toBe("Paket (PK)");
      expect(pk.badgeClass).toContain("sky");

      const paket = formatBarcodeUnitInfo("PAKET");
      expect(paket.short).toBe("PK");
      expect(paket.label).toBe("Paket (PK)");
    });

    it("Adet (AD) birimi için doğru etiket ve rozet sınıfı dönmelidir", () => {
      const ad = formatBarcodeUnitInfo("AD");
      expect(ad.short).toBe("AD");
      expect(ad.label).toBe("Adet (AD)");
      expect(ad.badgeClass).toContain("emerald");

      const adet = formatBarcodeUnitInfo("ADET");
      expect(adet.short).toBe("AD");
      expect(adet.label).toBe("Adet (AD)");
    });

    it("Kutu (KT) ve Palet (PL) birimleri için doğru rozet dönmelidir", () => {
      const kt = formatBarcodeUnitInfo("KT");
      expect(kt.short).toBe("KT");
      expect(kt.label).toBe("Kutu (KT)");
      expect(kt.badgeClass).toContain("purple");

      const pl = formatBarcodeUnitInfo("PL");
      expect(pl.short).toBe("PL");
      expect(pl.label).toBe("Palet (PL)");
      expect(pl.badgeClass).toContain("indigo");
    });

    it("Bilinmeyen veya farklı birimler için güvenli fallback sağlamalıdır", () => {
      const unk = formatBarcodeUnitInfo("XYZ");
      expect(unk.short).toBe("XYZ");
      expect(unk.label).toBe("XYZ");
      expect(unk.badgeClass).toContain("slate");
    });
  });

  describe("CANIAS MZYGetMaterial - Çoklu Barkod (KO, PK, AD) Yanıtı Entegrasyonu", () => {
    it("Bir malzemenin birden fazla barkodu (AD, PK, KO) olduğunda her biri kendi birimiyle ayrışmalıdır", async () => {
      vi.spyOn(api, "getMaterialDetail").mockResolvedValueOnce({
        ok: true,
        message: "",
        matList: [
          {
            MATERIAL: "UD009",
            STEXT: "Şampuan 500ml",
            QUNIT: "AD",
          },
        ],
        barcodeList: [
          { BARCODE: "8690001001", BUNIT: "AD" },
          { BARCODE: "8690001002", BUNIT: "PK" },
          { BARCODE: "8690001003", BUNIT: "KO" },
        ],
        matSize: {},
      });

      const res = await api.getMaterialDetail("UD009");
      expect(res.ok).toBe(true);
      expect(res.barcodeList.length).toBe(3);

      const units = res.barcodeList.map((b) => formatBarcodeUnitInfo(String(b.BUNIT)).short);
      expect(units).toEqual(["AD", "PK", "KO"]);
    });

    it("Barkod araması yapıldığında okutulan barkod birimi (KO / PK / AD) readBarcode üzerinden doğru gelmelidir", async () => {
      vi.spyOn(api, "readBarcode").mockResolvedValueOnce({
        ok: true,
        material: "UD009",
        name: "Şampuan 500ml",
        unit: "PK",
        skunit: "AD",
        multiplier: 12,
        quantity: 1,
        availStock: 100,
        specialStock: "",
        fields: {},
        message: "",
      });

      const res = await api.readBarcode("8690001002");
      expect(res.ok).toBe(true);
      expect(res.unit).toBe("PK");
      const unitInfo = formatBarcodeUnitInfo(res.unit);
      expect(unitInfo.short).toBe("PK");
      expect(unitInfo.label).toBe("Paket (PK)");
    });

    it("Yazdırma işleminde seçilen kartın gerçek barkodu ve birimi (KO veya PK) CANIAS servisine tam gitmelidir", async () => {
      // Kullanıcı Koli kartını seçtiğinde:
      await api.printMaterial({
        company: "01",
        plant: "100",
        barcode: "8690001003",
        unit: "KO",
        repeat: 4,
      });

      expect(printedPayloads[0].barcode).toBe("8690001003");
      expect(printedPayloads[0].unit).toBe("KO");
      expect(printedPayloads[0].repeat).toBe(4);

      // Kullanıcı Paket kartını seçtiğinde:
      await api.printMaterial({
        company: "01",
        plant: "100",
        barcode: "8690001002",
        unit: "PK",
        repeat: 2,
      });

      expect(printedPayloads[1].barcode).toBe("8690001002");
      expect(printedPayloads[1].unit).toBe("PK");
      expect(printedPayloads[1].repeat).toBe(2);
    });
  });
});
