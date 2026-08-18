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

// Payload formatter for api.saveReceipt
function formatSaveReceiptPayload(payload: {
  company?: string;
  plant?: string;
  vendor: string;
  waybillNo: string;
  sourceWarehouse?: string;
  targetWarehouse?: string;
  user?: string;
  items: Array<{
    orderNum: string;
    itemNum: number | string;
    material: string;
    quantity: number;
    batchNum?: string;
    expiryDate?: string;
  }>;
}) {
  const formattedItems = (payload.items || []).map((it) => ({
    PURORDER: String(it.orderNum || "").trim(),
    ORDERNUM: String(it.orderNum || "").trim(),
    ITEMNUM: Number(it.itemNum) || 1,
    MATERIAL: String(it.material || "").trim(),
    QUANTITY: Number(it.quantity) || 1,
    BATCHNUM: String(it.batchNum || "").trim(),
    EXPIRYDATE: String(it.expiryDate || "").trim(),
  }));

  const params = {
    PSCOMPANY: String(payload.company || "01").trim(),
    PSPLANT: String(payload.plant || "100").trim(),
    PSVENDOR: String(payload.vendor || "").trim(),
    PSWAYBILL: String(payload.waybillNo || "").trim(),
    PSSOURCEWH: String(payload.sourceWarehouse || "").trim(),
    PSTARGETWH: String(payload.targetWarehouse || "D1").trim(),
    PSUSER: String(payload.user || "WMSUSER").trim(),
    PSITEMS: formattedItems,
  };

  return {
    params,
    xml: buildParametersXml(params),
  };
}

describe("MZYSAVEINVPURORDER Payload & XML Construction Tests", () => {
  it("formats single item payload correctly with company, plant, vendor, waybill, target warehouse", () => {
    const { params, xml } = formatSaveReceiptPayload({
      company: "01",
      plant: "100",
      vendor: "800980",
      waybillNo: "IRS-2026-001",
      targetWarehouse: "D1",
      user: "AHMET",
      items: [
        {
          orderNum: "179395",
          itemNum: 1,
          material: "BS020",
          quantity: 25,
        },
      ],
    });

    expect(params.PSCOMPANY).toBe("01");
    expect(params.PSPLANT).toBe("100");
    expect(params.PSVENDOR).toBe("800980");
    expect(params.PSWAYBILL).toBe("IRS-2026-001");
    expect(params.PSTARGETWH).toBe("D1");
    expect(params.PSUSER).toBe("AHMET");
    expect(params.PSITEMS).toHaveLength(1);
    expect(params.PSITEMS[0]).toEqual({
      PURORDER: "179395",
      ORDERNUM: "179395",
      ITEMNUM: 1,
      MATERIAL: "BS020",
      QUANTITY: 25,
      BATCHNUM: "",
      EXPIRYDATE: "",
    });

    expect(xml).toContain("<PSCOMPANY>01</PSCOMPANY>");
    expect(xml).toContain("<PSVENDOR>800980</PSVENDOR>");
    expect(xml).toContain("<PSWAYBILL>IRS-2026-001</PSWAYBILL>");
    expect(xml).toContain("<PSTARGETWH>D1</PSTARGETWH>");
    expect(xml).toContain("<PURORDER>179395</PURORDER>");
    expect(xml).toContain("<MATERIAL>BS020</MATERIAL>");
    expect(xml).toContain("<QUANTITY>25</QUANTITY>");
  });

  it("handles multi-item receipts with batch and expiry date correctly", () => {
    const { params, xml } = formatSaveReceiptPayload({
      vendor: "800980",
      waybillNo: "IRS-LOT-99",
      targetWarehouse: "D2",
      items: [
        {
          orderNum: "179395",
          itemNum: 1,
          material: "BS020",
          quantity: 10,
          batchNum: "LOT2026-A",
          expiryDate: "2027-12-31",
        },
        {
          orderNum: "179395",
          itemNum: 2,
          material: "BS021",
          quantity: 50,
          batchNum: "LOT2026-B",
          expiryDate: "2028-06-30",
        },
      ],
    });

    expect(params.PSITEMS).toHaveLength(2);
    expect(params.PSITEMS[0].BATCHNUM).toBe("LOT2026-A");
    expect(params.PSITEMS[0].EXPIRYDATE).toBe("2027-12-31");
    expect(params.PSITEMS[1].BATCHNUM).toBe("LOT2026-B");
    expect(params.PSITEMS[1].EXPIRYDATE).toBe("2028-06-30");

    expect(xml).toContain("<BATCHNUM>LOT2026-A</BATCHNUM>");
    expect(xml).toContain("<EXPIRYDATE>2027-12-31</EXPIRYDATE>");
    expect(xml).toContain("<BATCHNUM>LOT2026-B</BATCHNUM>");
    expect(xml).toContain("<EXPIRYDATE>2028-06-30</EXPIRYDATE>");
  });

  it("escapes XML special characters in waybill or material names properly", () => {
    const { xml } = formatSaveReceiptPayload({
      vendor: "800980",
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

    expect(xml).toContain("<PSWAYBILL>IRS &amp; CO &lt;2026&gt;</PSWAYBILL>");
    expect(xml).toContain("<MATERIAL>MAT &amp; 01</MATERIAL>");
  });
});
