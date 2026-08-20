import { describe, it, expect } from "vitest";

// XML escape helper simulation
const escapeXml = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

// Parameters XML builder simulation
function buildParametersXml(params: Record<string, unknown> = {}) {
  const body = Object.entries(params)
    .map(([k, v]) => {
      if (Array.isArray(v)) {
        const rows = v
          .map(
            (row) =>
              `<ROW>${Object.entries((row as Record<string, unknown>) ?? {})
                .map(([rk, rv]) => `<${rk}>${escapeXml(rv)}</${rk}>`)
                .join("")}</ROW>`
          )
          .join("");
        return `<${k}>${rows}</${k}>`;
      }
      return `<${k}>${escapeXml(v)}</${k}>`;
    })
    .join("");
  return `<PARAMETERS>${body}</PARAMETERS>`;
}

// Payload formatter for api.saveReceipt (MZYSaveReceipt)
function formatSaveReceiptPayload(payload: {
  company?: string;
  plant?: string;
  vendor: string;
  waybillNo: string;
  warehouse?: string;
  targetWarehouse?: string;
  stockPlace?: string;
  user?: string;
  startTime?: string;
  items: Array<{
    orderType?: string;
    orderNum: string;
    itemNum: number | string;
    material: string;
    quantity?: number;
    receivedQty?: number;
    unit?: string;
    specialStock?: string;
    isSpecialLot?: boolean;
    batchNum?: string;
    expiryDate?: string;
  }>;
}) {
  const formattedItems = (payload.items || []).map((it) => {
    const readQty = it.receivedQty ?? it.quantity ?? 1;
    const orderType = String(it.orderType || "OP").trim().toUpperCase();
    const specialStock = String(
      it.specialStock || (it.isSpecialLot ? "1" : "0")
    ).trim();

    return {
      MATERIAL: String(it.material || "").trim(),
      SPECIALSTOCK: specialStock,
      BATCHNUM: String(it.batchNum || "").trim(),
      READQUANTITY: Number(readQty),
      QUNIT: String(it.unit || "AD").trim().toUpperCase(),
      ORDERTYPE: orderType,
      ORDERNUM: String(it.orderNum || "").trim(),
      ITEMNUM: Number(it.itemNum) || 1,
      // Geriye dönük uyumluluk alanları
      PURORDER: String(it.orderNum || "").trim(),
      QUANTITY: Number(readQty),
      EXPIRYDATE: String(it.expiryDate || "").trim(),
    };
  });

  const params = {
    PSCOMPANY: String(payload.company || "01").trim(),
    PSPLANT: String(payload.plant || "100").trim(),
    PSVENDOR: String(payload.vendor || "").trim(),
    PSEXTDELNUM: String(payload.waybillNo || "").trim(),
    PSWAYBILL: String(payload.waybillNo || "").trim(),
    PSWAREHOUSE: String(payload.warehouse || payload.targetWarehouse || "D1").trim(),
    PSTARGETWH: String(payload.warehouse || payload.targetWarehouse || "D1").trim(),
    PSSTOCKPLACE: String(payload.stockPlace || "*").trim(),
    PSUSER: String(payload.user || "WMSUSER").trim(),
    PDTSTARTTIME: String(payload.startTime || "20.08.2026 14:00:00").trim(),
    PSIASPURITEMXML: formattedItems,
    PSITEMS: formattedItems,
  };

  return {
    params,
    xml: buildParametersXml(params),
  };
}

describe("MZYSaveReceipt Payload & XML Construction Tests", () => {
  it("formats single item payload correctly with company, plant, vendor, waybill, warehouse, stockplace, and PSIASPURITEMXML", () => {
    const { params, xml } = formatSaveReceiptPayload({
      company: "01",
      plant: "100",
      vendor: "16660",
      waybillNo: "IRS-2026-001",
      targetWarehouse: "D1",
      stockPlace: "A-01-01",
      user: "AHMET",
      items: [
        {
          orderType: "OP",
          orderNum: "179395",
          itemNum: 1000,
          material: "BS020",
          quantity: 25,
          unit: "AD",
        },
      ],
    });

    expect(params.PSCOMPANY).toBe("01");
    expect(params.PSPLANT).toBe("100");
    expect(params.PSVENDOR).toBe("16660");
    expect(params.PSEXTDELNUM).toBe("IRS-2026-001");
    expect(params.PSWAREHOUSE).toBe("D1");
    expect(params.PSSTOCKPLACE).toBe("A-01-01");
    expect(params.PSUSER).toBe("AHMET");
    expect(params.PSIASPURITEMXML).toHaveLength(1);
    expect(params.PSIASPURITEMXML[0]).toEqual({
      MATERIAL: "BS020",
      SPECIALSTOCK: "0",
      BATCHNUM: "",
      READQUANTITY: 25,
      QUNIT: "AD",
      ORDERTYPE: "OP",
      ORDERNUM: "179395",
      ITEMNUM: 1000,
      PURORDER: "179395",
      QUANTITY: 25,
      EXPIRYDATE: "",
    });

    expect(xml).toContain("<PSCOMPANY>01</PSCOMPANY>");
    expect(xml).toContain("<PSVENDOR>16660</PSVENDOR>");
    expect(xml).toContain("<PSEXTDELNUM>IRS-2026-001</PSEXTDELNUM>");
    expect(xml).toContain("<PSWAREHOUSE>D1</PSWAREHOUSE>");
    expect(xml).toContain("<PSSTOCKPLACE>A-01-01</PSSTOCKPLACE>");
    expect(xml).toContain("<PSIASPURITEMXML>");
    expect(xml).toContain("<MATERIAL>BS020</MATERIAL>");
    expect(xml).toContain("<READQUANTITY>25</READQUANTITY>");
    expect(xml).toContain("<QUNIT>AD</QUNIT>");
    expect(xml).toContain("<ORDERTYPE>OP</ORDERTYPE>");
    expect(xml).toContain("<ORDERNUM>179395</ORDERNUM>");
    expect(xml).toContain("<ITEMNUM>1000</ITEMNUM>");
  });

  it("handles multi-item receipts with batch and special stock correctly", () => {
    const { params, xml } = formatSaveReceiptPayload({
      vendor: "16660",
      waybillNo: "IRS-LOT-99",
      targetWarehouse: "D2",
      items: [
        {
          orderType: "OP",
          orderNum: "179395",
          itemNum: 1000,
          material: "BS020",
          receivedQty: 10,
          unit: "AD",
          batchNum: "LOT2026-A",
          isSpecialLot: true,
        },
        {
          orderType: "OP",
          orderNum: "179395",
          itemNum: 2000,
          material: "BS021",
          receivedQty: 50,
          unit: "KO",
          batchNum: "LOT2026-B",
        },
      ],
    });

    expect(params.PSIASPURITEMXML).toHaveLength(2);
    expect(params.PSIASPURITEMXML[0].BATCHNUM).toBe("LOT2026-A");
    expect(params.PSIASPURITEMXML[0].SPECIALSTOCK).toBe("1");
    expect(params.PSIASPURITEMXML[0].READQUANTITY).toBe(10);
    expect(params.PSIASPURITEMXML[0].QUNIT).toBe("AD");
    expect(params.PSIASPURITEMXML[1].BATCHNUM).toBe("LOT2026-B");
    expect(params.PSIASPURITEMXML[1].READQUANTITY).toBe(50);
    expect(params.PSIASPURITEMXML[1].QUNIT).toBe("KO");

    expect(xml).toContain("<BATCHNUM>LOT2026-A</BATCHNUM>");
    expect(xml).toContain("<SPECIALSTOCK>1</SPECIALSTOCK>");
    expect(xml).toContain("<QUNIT>AD</QUNIT>");
    expect(xml).toContain("<BATCHNUM>LOT2026-B</BATCHNUM>");
    expect(xml).toContain("<QUNIT>KO</QUNIT>");
  });

  it("escapes XML special characters in waybill or material names properly", () => {
    const { xml } = formatSaveReceiptPayload({
      vendor: "16660",
      waybillNo: "IRS & CO <2026>",
      targetWarehouse: "D1",
      items: [
        {
          orderNum: "179395",
          itemNum: 1,
          material: "MAT & 01",
          quantity: 5,
        },
      ],
    });

    expect(xml).toContain("<PSEXTDELNUM>IRS &amp; CO &lt;2026&gt;</PSEXTDELNUM>");
    expect(xml).toContain("<MATERIAL>MAT &amp; 01</MATERIAL>");
  });
});
