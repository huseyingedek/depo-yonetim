import { describe, it, expect, beforeEach, vi } from "vitest";
import { useTransferStore } from "../store/transferStore";
import { api } from "../api/client";

describe("INVT00M1 Stok Transferi (Stock Transfer Store & Flow)", () => {
  beforeEach(() => {
    useTransferStore.getState().reset();
    vi.restoreAllMocks();
  });

  it("1. Kaynak raf barkodu okutulduğunda kaynak depo ve stok yerini kaydeder", async () => {
    vi.spyOn(api, "readShelfBarcode").mockResolvedValueOnce({
      ok: true,
      warehouse: "01",
      stockPlace: "A-01-01",
      message: "",
    });

    const res = await useTransferStore.getState().scanSourceShelf("01-A-01-01");
    expect(res.ok).toBe(true);

    const state = useTransferStore.getState();
    expect(state.sourceShelf).toEqual({
      barcode: "01-A-01-01",
      warehouse: "01",
      stockPlace: "A-01-01",
    });
  });

  it("2. Kaynak raf olmadan malzeme okutulmasını engeller", async () => {
    const res = await useTransferStore.getState().scanProduct("8690001001", 1);
    expect(res.ok).toBe(false);
    expect(res.message).toContain("Önce raf");
  });

  it("3. Parti takipsiz malzeme okutulduğunda sepete doğrudan ekler ve tekrar okutulursa miktarı artırır", async () => {
    useTransferStore.getState().setSourceShelf({
      barcode: "01-A-01-01",
      warehouse: "01",
      stockPlace: "A-01-01",
    });

    vi.spyOn(api, "readBarcode").mockResolvedValue({
      ok: true,
      material: "MLZ001",
      name: "Test Malzeme",
      unit: "AD",
      quantity: 5,
      availStock: 50,
      specialStock: "0",
      fields: {},
      message: "",
    });

    // İlk okutma (5 adet)
    const res1 = await useTransferStore.getState().scanProduct("8690001001", 5);
    expect(res1.ok).toBe(true);
    expect(useTransferStore.getState().items.length).toBe(1);
    expect(useTransferStore.getState().items[0].quantity).toBe(5);

    // İkinci okutma (aynı malzeme, 3 adet)
    vi.spyOn(api, "readBarcode").mockResolvedValueOnce({
      ok: true,
      material: "MLZ001",
      name: "Test Malzeme",
      unit: "AD",
      quantity: 3,
      availStock: 50,
      specialStock: "0",
      fields: {},
      message: "",
    });

    const res2 = await useTransferStore.getState().scanProduct("8690001001", 3);
    expect(res2.ok).toBe(true);
    expect(useTransferStore.getState().items.length).toBe(1);
    expect(useTransferStore.getState().items[0].quantity).toBe(8);
  });

  it("4. Parti takipli malzeme okutulduğunda lotPending açar, parti girilince sepete ekler", async () => {
    useTransferStore.getState().setSourceShelf({
      barcode: "01-A-01-01",
      warehouse: "01",
      stockPlace: "A-01-01",
    });

    vi.spyOn(api, "readBarcode").mockResolvedValueOnce({
      ok: true,
      material: "MLZ002",
      name: "Partili Malzeme",
      unit: "KG",
      quantity: 2,
      availStock: 20,
      specialStock: "1",
      fields: {},
      message: "",
    });
    vi.spyOn(api, "getStock").mockResolvedValueOnce([
      { batchNum: "LOT-2026-01", availStock: 10, unit: "KG" },
      { batchNum: "LOT-2026-02", availStock: 10, unit: "KG" },
    ]);

    const res = await useTransferStore.getState().scanProduct("8690002002", 2);
    expect(res.ok).toBe(true);
    expect(res.needsBatch).toBe(true);
    expect(useTransferStore.getState().lotPending?.material).toBe("MLZ002");

    // Parti seçimi
    const lotRes = await useTransferStore.getState().selectBatch("LOT-2026-01");
    expect(lotRes.ok).toBe(true);
    expect(useTransferStore.getState().lotPending).toBeNull();
    expect(useTransferStore.getState().items.length).toBe(1);
    expect(useTransferStore.getState().items[0].batchNum).toBe("LOT-2026-01");
  });

  it("5. Miktar güncelleme ve kalem silme doğru çalışır", () => {
    useTransferStore.setState({
      items: [
        {
          id: "item-1",
          material: "MLZ001",
          name: "Test 1",
          barcode: "869001",
          quantity: 4,
          unit: "AD",
          sourceWarehouse: "01",
          sourceStockPlace: "A-01",
          timestamp: Date.now(),
        },
      ],
    });

    useTransferStore.getState().updateItemQty("item-1", 10);
    expect(useTransferStore.getState().items[0].quantity).toBe(10);

    useTransferStore.getState().removeItem("item-1");
    expect(useTransferStore.getState().items.length).toBe(0);
  });

  it("6. Hedef raf okutulup transfer tamamlandığında JSON paketi hazırlanıp servise gönderilir", async () => {
    useTransferStore.setState({
      sourceShelf: {
        barcode: "01-A-01-01",
        warehouse: "01",
        stockPlace: "A-01-01",
      },
      items: [
        {
          id: "item-1",
          material: "MLZ001",
          name: "Örnek Malzeme",
          barcode: "869001",
          quantity: 10,
          unit: "AD",
          batchNum: "LOT99",
          specialStock: "1",
          sourceWarehouse: "01",
          sourceStockPlace: "A-01-01",
          timestamp: Date.now(),
        },
      ],
      step: "target",
    });

    // Hedef rafı tara
    vi.spyOn(api, "readShelfBarcode").mockResolvedValueOnce({
      ok: true,
      warehouse: "02",
      stockPlace: "B-03-02",
      message: "",
    });

    await useTransferStore.getState().scanTargetShelf("02-B-03-02");
    expect(useTransferStore.getState().targetShelf?.warehouse).toBe("02");
    expect(useTransferStore.getState().targetShelf?.stockPlace).toBe("B-03-02");

    const spyCreate = vi.spyOn(api, "createStockTransfer").mockResolvedValueOnce({
      ok: true,
      message: "Transfer başarıyla tamamlandı",
      transferId: "TR-999",
    });

    const completeRes = await useTransferStore.getState().completeTransfer();
    expect(completeRes.ok).toBe(true);
    expect(spyCreate).toHaveBeenCalledTimes(1);

    const payload = spyCreate.mock.calls[0][0];
    expect(payload.sourceWarehouse).toBe("01");
    expect(payload.sourceStockPlace).toBe("A-01-01");
    expect(payload.targetWarehouse).toBe("02");
    expect(payload.targetStockPlace).toBe("B-03-02");
    expect(payload.items.length).toBe(1);
    expect(payload.items[0].material).toBe("MLZ001");
    expect(payload.items[0].quantity).toBe(10);
    expect(payload.items[0].batchNum).toBe("LOT99");

    expect(useTransferStore.getState().step).toBe("success");
    expect(useTransferStore.getState().completedResult?.payload).toBeDefined();
  });

  it("7. api.createStockTransfer Bora Bey'in belirttiği MZYStockTransfer parametrelerini eksiksiz iletir", async () => {
    let capturedBody: Record<string, unknown> = {};
    let capturedUrl = "";

    global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      capturedUrl = String(url);
      capturedBody = JSON.parse(String(init?.body || "{}"));
      return {
        ok: true,
        status: 200,
        json: async () => ({
          status: 200,
          data: {
            TBLMESSAGE: [{ TYPE: "S", SYSTEMMSG: "Transfer 12345 nolu belge ile kaydedildi" }],
            TRANSFERID: "12345",
          },
          messages: "",
        }),
      };
    });

    const res = await api.createStockTransfer({
      company: "01",
      plant: "100",
      user: "depocu1",
      sourceWarehouse: "01",
      sourceStockPlace: "A-01-01",
      targetWarehouse: "02",
      targetStockPlace: "B-02-01",
      items: [
        {
          material: "MLZ001",
          materialName: "Koli Kalem",
          barcode: "8690001001",
          quantity: 25,
          unit: "AD",
          batchNum: "PARTI-01",
          specialStock: "1",
        },
        {
          material: "MLZ002",
          materialName: "Partisiz Kalem",
          barcode: "8690001002",
          quantity: 10,
          unit: "PK",
        },
      ],
    });

    expect(res.ok).toBe(true);
    expect(res.transferId).toBe("12345");
    expect(capturedUrl).toContain("MZYStockTransfer");

    // Header parametreleri
    expect(capturedBody.COMPANY).toBe("01");
    expect(capturedBody.PSCOMPANY).toBe("01");
    expect(capturedBody.PLANT).toBe("100");
    expect(capturedBody.PSPLANT).toBe("100");
    expect(capturedBody.USER).toBe("depocu1");
    expect(capturedBody.PSUSER).toBe("depocu1");
    expect(capturedBody.SRCWAREHOUSE).toBe("01");
    expect(capturedBody.PSSRCWAREHOUSE).toBe("01");
    expect(capturedBody.SRCSTOCKPLACE).toBe("A-01-01");
    expect(capturedBody.PSSRCSTOCKPLACE).toBe("A-01-01");
    expect(capturedBody.TARWAREHOUSE).toBe("02");
    expect(capturedBody.PSTARWAREHOUSE).toBe("02");
    expect(capturedBody.TARSTOCKPLACE).toBe("B-02-01");
    expect(capturedBody.PSTARSTOCKPLACE).toBe("B-02-01");

    // Transfer listesi alt tablosu (TRANSFERLIST)
    const list = capturedBody.TRANSFERLIST as Array<Record<string, unknown>>;
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBe(2);

    expect(list[0]).toEqual({
      MATERIAL: "MLZ001",
      SPECIALSTOCK: "1",
      BATCHNUM: "PARTI-01",
      QUANTITY: 25,
      QUNIT: "AD",
    });

    expect(list[1]).toEqual({
      MATERIAL: "MLZ002",
      SPECIALSTOCK: "*",
      BATCHNUM: "*",
      QUANTITY: 10,
      QUNIT: "PK",
    });
  });

  it("8. api.createStockTransfer servisten hata döndüğünde ok:false ve mesaj döner", async () => {
    global.fetch = vi.fn().mockImplementation(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        status: 200,
        data: {
          TBLMESSAGE: [{ TYPE: "E", SYSTEMMSG: "Yetersiz stok miktarı: MLZ001 için mevcut stok 5" }],
        },
        messages: "ERROR: Yetersiz stok miktarı",
      }),
    }));

    const res = await api.createStockTransfer({
      company: "01",
      plant: "100",
      sourceWarehouse: "01",
      sourceStockPlace: "A-01-01",
      targetWarehouse: "02",
      targetStockPlace: "B-02-01",
      items: [{ material: "MLZ001", quantity: 50, unit: "AD" }],
    });

    expect(res.ok).toBe(false);
    expect(res.message).toContain("Yetersiz stok");
  });
});
