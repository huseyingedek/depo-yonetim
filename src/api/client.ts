// -----------------------------------------------------------------------------

// -----------------------------------------------------------------------------

import { wmsConfig, SERVICES } from "./config";
import { useAppStore } from "../store/appStore";
import type {
  BarcodeResult,
  ShelfResult,
  RestoredPick,
  PickOrder,
  PickLine,
  ProductRef,
  User,
  Receipt,
  ReceiptLine,
  PutawayItem,
  TransferTask,
  CountTask,
  ProductStock,
  PickSuggestion,
  StockBatch,
  StockRow,
  StockTransferPayload,
} from "../types";

interface MzyResult {
  data: Record<string, unknown> | null;
  messages?: string;
  sysStatus?: number;
  sysError?: string;
  raw?: string;
}

export class WmsError extends Error { }


export const DATE_MIN = "01.01.1975";
export const DATE_MAX = "01.01.2100";

export const ANY = "%";

export const LABEL_COUNT = 0;

export function serviceMessage(r: MzyResult): string {

  const m1 = mesajCoz(r.messages);
  if (m1) return m1;

  //    {"MESSAGETABLE":{"ROW":[{"TYPE":"E","SYSTEMMSG":"...","MSGNUMBER":"1306"}]}}

  const m2 = mesajTablosu(r.data);
  if (m2) return m2;

  const dataStr = dataToText(r.data);
  if (/SYSTEMMSG|MESSAGETABLE|TBLMESSAGE|<TEXT>/i.test(dataStr)) {
    const m3 = mesajCoz(dataStr);
    if (m3) return m3;
  }
  return "";
}

function mesajTablosu(data: unknown): string {
  if (!data || typeof data !== "object") return "";

  const d = data as Record<string, unknown>;
  const adlar = ["MESSAGETABLE", "TBLMESSAGE", "TROIAMESSAGES", "MSGTABLE", "TBLMSG", "ROW"];
  const lines: string[] = [];
  for (const ad of adlar) {
    if (ad in d) {
      for (const row of unwrapRows(d[ad])) {
        const t = pick(row, ["SYSTEMMSG", "TEXT", "MESSAGE", "MSG", "DESCRIPTION"]);
        if (t) lines.push(t);
      }
    }
  }
  return lines.join("\n");
}

function dataToText(data: unknown): string {
  if (!data) return "";
  if (typeof data === "string") return data;
  if (typeof data === "object") {
    const o = data as Record<string, unknown>;
    if (typeof o.raw === "string") return o.raw;
    return JSON.stringify(data);
  }
  return String(data);
}

function mesajCoz(raw: unknown): string {
  if (!raw) return "";
  const text = String(raw).trim();
  if (!text) return "";

  if (text.includes("<")) {
    const found = [
      ...text.matchAll(/<(?:TEXT|SYSTEMMSG)>([\s\S]*?)<\/(?:TEXT|SYSTEMMSG)>/gi),
    ].map((m) => m[1].trim());
    if (found.length) return decodeEntities(found.join("\n"));
    const stripped = decodeEntities(text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
    if (stripped) return stripped;
  }

  // 2) JSON
  try {
    const parsed: unknown = JSON.parse(text);
    const items = Array.isArray(parsed) ? parsed : [parsed];
    const lines = items
      .map((it) => {
        if (typeof it === "string") return it;
        if (it && typeof it === "object") {
          const o = it as Record<string, unknown>;
          return String(o.SYSTEMMSG ?? o.TEXT ?? o.MESSAGE ?? o.DESCRIPTION ?? o.MSG ?? "");
        }
        return "";
      })
      .filter(Boolean);
    if (lines.length) return lines.join("\n");
  } catch {

  }

  // 3) düz metin
  return text;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

const READ_ONLY = new Set<string>([SERVICES.listingPick]);
const inflight = new Map<string, Promise<MzyResult>>();

function call(service: string, params: Record<string, unknown>): Promise<MzyResult> {
  if (!READ_ONLY.has(service)) return doCall(service, params);

  const key = service + ":" + JSON.stringify(params);
  const pending = inflight.get(key);
  if (pending) return pending;

  const p = doCall(service, params).finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}


function baglantiHatasi(detay = ""): WmsError {
  if (detay) console.warn("[bağlantı] istek cevapsız:", detay);
  return new WmsError("İstek cevaplanmadı, bağlantınızı kontrol ediniz");
}

const ISTEK_TIMEOUT_MS = 30000;

async function doCall(service: string, params: Record<string, unknown>): Promise<MzyResult> {
  if (!wmsConfig.baseUrl) {
    throw new WmsError("Proxy adresi tanımlı değil (VITE_WMS_BASE_URL)");
  }
  let res: Response;
  const iptal = new AbortController();
  const zamanAsimi = setTimeout(() => iptal.abort(), ISTEK_TIMEOUT_MS);
  try {
    res = await fetch(`${wmsConfig.baseUrl}/${service}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
      signal: iptal.signal,
    });
  } catch {

    throw baglantiHatasi(
      iptal.signal.aborted ? "zaman aşımı (yanıt gelmedi)" : "fetch başarısız (cihaz proxy'ye ulaşamadı)"
    );
  } finally {
    clearTimeout(zamanAsimi);
  }
  const body = (await res.json().catch(() => ({}))) as MzyResult & { error?: string };
  const msg = serviceMessage(body);

  if (res.status >= 500) throw baglantiHatasi(body.error || msg || `HTTP ${res.status}`);

  if (!res.ok) throw new WmsError(body.error || msg || `${service} → HTTP ${res.status}`);

  if (body.sysError) throw new WmsError(msg || body.sysError);

  if (!body.data && msg) throw new WmsError(msg);

  if (msg) console.info(`[${service}] servis mesajı:`, msg);
  return body;
}

function ctx() {
  const st = useAppStore.getState();
  return {
    company: st.settings.company,
    plant: st.settings.facility,
    warehouse: st.settings.warehouse,
    worker: st.user?.username ?? "",
  };
}

type Row = Record<string, unknown>;

function pick(row: Row, names: string[], fallback = ""): string {
  for (const n of names) {
    const v = row[n] ?? row[n.toUpperCase()] ?? row[n.toLowerCase()];
    if (v !== undefined && v !== null && String(v) !== "") return String(v);
  }
  return fallback;
}
function num(row: Row, names: string[], fallback = 0): number {
  const v = pick(row, names, "");
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
}

function unwrapRows(t: unknown): Row[] {
  if (!t) return [];
  if (Array.isArray(t)) return (t as unknown[]).map(flattenRow);
  if (typeof t === "object") {
    const o = t as Record<string, unknown>;
    if ("ROW" in o) return unwrapRows(o.ROW);
    return [flattenRow(o)];
  }
  return [];
}

function flattenRow(input: unknown): Row {
  const out: Row = {};
  if (!input || typeof input !== "object") return out;

  for (const [key, value] of Object.entries(input as Row)) {
    if (Array.isArray(value)) {
      for (const el of value) {
        if (el && typeof el === "object") {
          const inner = (el as Record<string, unknown>)["#item"] ?? el;
          if (inner && typeof inner === "object") Object.assign(out, inner);
        } else if (out[key] === undefined) {
          out[key] = el;
        }
      }
    } else if (value && typeof value === "object") {
      const inner = (value as Record<string, unknown>)["#item"] ?? value;
      Object.assign(out, inner as Row);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function rowsOf(result: MzyResult, tableNames: string[]): Row[] {
  const d = result.data;
  if (!d || typeof d !== "object") return [];
  const obj = d as Record<string, unknown>;
  for (const name of tableNames) {
    if (name in obj) {
      const rows = unwrapRows(obj[name]);
      if (rows.length) return rows;
    }
  }

  for (const [k, v] of Object.entries(obj)) {
    if (/MESSAGE/i.test(k)) continue;
    const rows = unwrapRows(v);
    if (rows.length) return rows;
  }
  return [];
}

function toProduct(row: Row): ProductRef {
  return {
    code: pick(row, ["MATERIAL"]),
    name: pick(row, ["MTEXT"]) || pick(row, ["MATERIAL"]),

    barcode: pick(row, ["BARCODE", "BARCODENUM", "EAN"]),
    // 2. barkod (koli barkodu) — Bora'nın göndereceği alan; esnek adla okunur.
    barcode2: pick(row, ["BARCODE2", "BARCODENUM2", "EAN2", "ALTBARCODE", "PACKBARCODE"]) || undefined,
    unit: pick(row, ["IUNIT", "UNIT"], "Adet"),
  };
}

const yok = (v: string) => !v || v === "*";

export function toPickLine(row: Row, i: number): PickLine {
  const isPick = pick(row, ["ISPICK"]) === "1";
  const lot = pick(row, ["BATCHNUM"]);
  const specialStock = pick(row, ["SPECIALSTOCK"]);

  const kaynak = isPick ? "" : pick(row, ["FRONTAREA"]);

  const moveQty = num(row, ["MOVEQTY"]);
  const orderQtyRaw = pick(row, ["AKLSQUANTITY"]) === "" ? undefined : num(row, ["AKLSQUANTITY"], 0);
  const cfactorRaw = pick(row, ["CFACTOR"]) === "" ? undefined : num(row, ["CFACTOR"], 0);
  const cf = cfactorRaw && cfactorRaw > 0 ? cfactorRaw : 1;
  const hedefStok =
    orderQtyRaw !== undefined && orderQtyRaw > 0
      ? Math.round((orderQtyRaw * cf + Number.EPSILON) * 1000) / 1000
      : moveQty;

  return {

    id: pick(row, ["ITEMNO", "ITEMNUM"], String(i + 1)),
    product: toProduct(row),
    location: yok(kaynak) ? "" : kaynak,
    requestedQty: hedefStok,
    pickedQty: num(row, ["MOVEDQTY"]),

    lotTracked: specialStock === "1",
    lot: yok(lot) ? undefined : lot,

    priority: pick(row, ["PRIORITY"]) === "" ? undefined : num(row, ["PRIORITY"], 0),

    orderQty: orderQtyRaw,
    orderUnit: pick(row, ["AKLSQUNIT"]) || undefined,
    cfactor: cfactorRaw,

    targetArea: isPick && !yok(pick(row, ["TRANSAREA"])) ? pick(row, ["TRANSAREA"]) : undefined,

    targetWarehouse: pick(row, ["WAREHOUSETA"]) || undefined,

    weight: num(row, ["WEIGHTCAPACITY"]) || undefined,
    volume: num(row, ["VOLUMECAPACITY"]) || undefined,
  };
}

export function toStatus(v: string): PickOrder["status"] {
  return v === "2" ? "closed" : v === "1" ? "partial" : "open";
}

function toPickOrder(row: Row): PickOrder {
  const worker = pick(row, ["WORKER"]);
  return {
    id: pick(row, ["ORDERNUM"]),
    orderType: pick(row, ["ORDERTYPE"]),

    customer: pick(row, ["CUSNAME1", "CUSTNAME1", "CUSTNAME", "CUSNAME", "CUSTOMERNAME", "NAME1", "CUSTOMER"]),
    reference: pick(row, ["STEXT", "DOCNUM"]), // Emir açıklaması
    createdAt: pick(row, ["CREATEDAT"]),
    worker: worker && worker !== "*" ? worker : undefined, // "*" = atanmamış

    priority: pick(row, ["PRIORITY"]) === "" ? undefined : num(row, ["PRIORITY"], 0),
    status: toStatus(pick(row, ["STATUS"], "0")),
    started: pick(row, ["ISSTARTED"], "0") === "1",
    lines: [],
  };
}

function orderFromStockPlace(sp: string): { num: string; type: string } {
  const m = /^([A-Za-z]+)-(.+)$/.exec((sp ?? "").trim());
  return m ? { type: m[1], num: m[2] } : { type: "", num: "" };
}

function collectMaterialRows(node: unknown, acc: Row[]): void {
  if (!node) return;
  if (Array.isArray(node)) {
    for (const el of node) collectMaterialRows(el, acc);
    return;
  }
  if (typeof node !== "object") return;
  const o = node as Record<string, unknown>;
  const inner = (o["#item"] && typeof o["#item"] === "object" ? o["#item"] : o) as Record<
    string,
    unknown
  >;

  if (typeof inner.MATERIAL === "string" && inner.MATERIAL.trim() !== "") acc.push(inner as Row);

  for (const v of Object.values(inner)) {
    if (v && typeof v === "object") collectMaterialRows(v, acc);
  }
}

function parseRestoredPicks(data: Record<string, unknown> | null): RestoredPick[] {
  if (!data) return [];
  const rows: Row[] = [];
  for (const [name, value] of Object.entries(data)) {
    if (/MESSAGE/i.test(name)) continue; // hata/mesaj tablolarını atla
    collectMaterialRows(value, rows);
  }
  const out: RestoredPick[] = [];
  for (const row of rows) {
    const material = pick(row, ["MATERIAL"]);
    if (!material) continue;

    const qty = num(row, ["TOTALSTOCK", "READQTY", "QUANTITY", "MOVEDQTY"], 0);
    if (qty <= 0) continue;
    const lot = pick(row, ["BATCHNUM"]);

    const lotVar = !yok(lot) && lot !== "*";
    const partiTakipli = pick(row, ["SPECIALSTOCK"]) || (lotVar ? "1" : "*");
    const stockPlace = pick(row, ["STOCKPLACE"]);
    const sp = orderFromStockPlace(stockPlace);
    out.push({
      warehouse: pick(row, ["WAREHOUSE"]),
      stockPlace,
      material,
      lot: lotVar ? lot : undefined,
      specialStock: partiTakipli,
      qty,
      unit: pick(row, ["QUNIT", "UNIT"]),

      orderNum: pick(row, ["ORDERNUM"]) || sp.num,
      orderType: pick(row, ["ORDERTYPE"]) || sp.type,
      itemNo: pick(row, ["ITEMNO", "ITEMNUM"]),
    });
  }
  return out;
}

export const api = {

  async checkUser(username: string, password: string): Promise<User | null> {
    const r = await call(SERVICES.checkUser, {
      PSUSER: username,
      PSPASSWORD: password,
    });

    const mesaj = serviceMessage(r);
    const rows = rowsOf(r, ["TBLUSER", "TBLCHECKUSER"]);
    const u = rows[0];

    const hataSatiri = !u || pick(u, ["TYPE"]) === "E" || !!pick(u, ["SYSTEMMSG"]);
    if (mesaj || hataSatiri) {
      const tblMsg = unwrapRows(r.data?.TBLMESSAGE)
        .map((m) => pick(m, ["TEXT", "MESSAGE", "VALUE"]))
        .filter(Boolean)
        .join("\n");
      throw new WmsError(
        tblMsg || mesaj || pick(u ?? {}, ["SYSTEMMSG"]) || "Kullanıcı adı veya parola hatalı"
      );
    }
    const name = pick(u, ["NAME"]);
    const surname = pick(u, ["SURNAME"]);
    console.info("[MZYCheckUser] kullanıcı:", u);
    return {
      username,
      displayName: [name, surname].filter(Boolean).join(" ") || username,
    };
  },

  async getPickOrders(): Promise<PickOrder[]> {
    const c = ctx();
    const r = await call(SERVICES.listingPick, {

      PSCOMPANY: c.company,
      PSPLANT: c.plant,
      PSWORKER: c.worker, // giriş yapan kullanıcı
      PISTATUS: 3,
      PIISPICK: 1, // Toplama emri
      PDSTARTDATE: DATE_MIN,
      PDENDDATE: DATE_MAX,
      PIISDELETE: 0,
      PIISSTARTED: 1,
      PIORDER: 0,
    });
    return rowsOf(r, ["TBLPOLIST"])
      .map(toPickOrder)
      .sort((a, b) => {

        const pa = a.priority ?? Number.MAX_SAFE_INTEGER;
        const pb = b.priority ?? Number.MAX_SAFE_INTEGER;
        return pa !== pb ? pa - pb : a.id.localeCompare(b.id);
      });
  },

  async getPickOrder(orderNum: string, orderType = ""): Promise<PickOrder | undefined> {
    const c = ctx();
    const r = await call(SERVICES.enterPick, {
      PSCOMPANY: c.company,
      PSPLANT: c.plant,
      PSORDERNUM: orderNum,
      PSORDERTYPE: orderType,

      PSUSER: c.worker,
    });

    const rows = rowsOf(r, ["IASWMSPOITEM", "TBLWMSPO", "TBLPODETAIL"]);
    if (!rows.length) return undefined;
    const head = rows[0];
    const siraliKalemler = rows
      .map(toPickLine)

      .filter((l) => !!(l.product.code || l.product.name) || l.requestedQty > 0)
      .sort((a, b) => {
        const pa = a.priority ?? Number.MAX_SAFE_INTEGER;
        const pb = b.priority ?? Number.MAX_SAFE_INTEGER;
        return pa !== pb ? pa - pb : Number(a.id) - Number(b.id);
      });
    return {
      id: pick(head, ["ORDERNUM"], orderNum),
      orderType: pick(head, ["ORDERTYPE"], orderType),
      customer: pick(head, ["CUSNAME1", "CUSTOMER"]),
      reference: pick(head, ["STEXT", "DOCNUM"]),
      createdAt: pick(head, ["CREATEDAT"]),
      status: toStatus(pick(head, ["STATUS"], "0")),
      started: pick(head, ["ISSTARTED"], "0") === "1",

      lines: siraliKalemler,
    };
  },

  async fillLocations(order: PickOrder): Promise<PickOrder> {
    const lines = await Promise.all(
      order.lines.map(async (line) => {
        try {
          const oneriler = await api.suggestForLine(
            order.id,
            order.orderType ?? "",
            Number(line.id)
          );
          return oneriler.length ? { ...line, suggestions: oneriler } : line;
        } catch {
          return line;
        }
      })
    );
    return { ...order, lines };
  },

  async suggestForLine(
    orderNum: string,
    orderType: string,
    itemNo: number
  ): Promise<PickSuggestion[]> {
    const c = ctx();
    const r = await call(SERVICES.suggestPick, {
      PSCOMPANY: c.company,
      PSPLANT: c.plant,
      PSORDERNUM: orderNum,
      PSORDERTYPE: orderType,
      PIITEMNO: itemNo,
    });
    return rowsOf(r, ["SUGGESTEDLISTFROM"])
      .map((row) => {
        const warehouse = pick(row, ["WAREHOUSE"]);
        const location = pick(row, ["STOCKPLACE"]);
        const lot = pick(row, ["BATCHNUM"]);
        return {
          itemNo,
          warehouse,
          location,

          barcode: warehouse && location ? `${warehouse}$${location}` : "",
          material: pick(row, ["MATERIAL"]),
          lot: yok(lot) ? undefined : lot,
          total: num(row, ["TOTAL"], 0),
          unit: pick(row, ["QUNIT"], "Adet"),
          distance: num(row, ["DISTANCE"], 0) || undefined,
          entryDate: pick(row, ["ENTRYDATE"]) || undefined,
        };
      })
      .filter((s) => s.barcode);

  },

  async getStock(material: string, warehouse = "", stockPlace = ""): Promise<StockBatch[]> {
    const c = ctx();
    const r = await call(SERVICES.getStock, {
      PSCOMPANY: c.company,
      PSPLANT: c.plant,

      // malzeme boş/tanımsız gidiyordu.
      PSMATERIAL: material,
      PSWAREHOUSE: warehouse,
      PSSTOCKPLACE: stockPlace,
      PSBATCHNUM: "",
      PSSPECIALSTOCK: "",
      PSVOPTIONS: "",
      PSBARCODE: "",
      PICONTAINER: 1,
      PIISPICKWH: 0,
    });
    const gorulen = new Set<string>();
    const list = rowsOf(r, ["TBLSTOCK"])
      // Sadece OKUTULAN malzemeyle sınırlıyoruz.
      .filter((row) => !material || pick(row, ["MATERIAL"]).trim() === material.trim())
      .map((row) => ({
        batchNum: pick(row, ["BATCHNUM"]),
        availStock: num(row, ["AVAILSTOCK"], 0),
        unit: pick(row, ["QUNIT"]),
      }))
      .filter((b) => {
        if (!(b.batchNum || b.availStock > 0)) return false;

        const anahtar = b.batchNum || "*";
        if (gorulen.has(anahtar)) return false;
        gorulen.add(anahtar);
        return true;
      });

    return list;
  },

  // Ürün Sorgulama — Raf ve Ürün BAĞIMSIZ (Bora, 05.08: "ikisi için de getstock").
  // Okutulan alan dolu gider, diğeri boş; diğer parametreler öndeğer.
  //   • Ürün okutulur → PSBARCODE dolu, raf boş  → o ürünün tüm stoğu
  //   • Raf okutulur   → PSWAREHOUSE/PSSTOCKPLACE dolu, ürün boş → raftaki stok
  //   • İkisi birden   → ikisi de dolu → o rafta o ürün
  // TBLSTOCK alanları canlı yanıtla teyit edildi (05.08): MATERIAL, MTEXT,
  // WAREHOUSE, STOCKPLACE, SPECIALSTOCK, BATCHNUM, AVAILSTOCK, QUNIT.
  async queryStock(opts: {
    barcode?: string;
    material?: string;
    warehouse?: string;
    stockPlace?: string;
    container?: boolean; // PICONTAINER: konteynerları da getir (öndeğer kapalı)
    onlyPickWarehouse?: boolean; // PIISPICKWH: yalnızca toplama depoları (öndeğer açık)
  }): Promise<StockRow[]> {
    const c = ctx();
    const r = await call(SERVICES.getStock, {
      PSCOMPANY: c.company,
      PSPLANT: c.plant,
      PSMATERIAL: opts.material ?? "",
      PSWAREHOUSE: opts.warehouse ?? "",
      PSSTOCKPLACE: opts.stockPlace ?? "",
      PSBATCHNUM: "",
      PSSPECIALSTOCK: "",
      PSVOPTIONS: "",
      PSBARCODE: opts.barcode ?? "",
      // Bora, 05.08: filtreleme artık serviste (WMS destek tablosu).
      PICONTAINER: opts.container ? 1 : 0,
      PIISPICKWH: opts.onlyPickWarehouse ? 1 : 0,
    });
    const gorulen = new Set<string>();
    return rowsOf(r, ["TBLSTOCK"])
      .map((row) => ({
        material: pick(row, ["MATERIAL"]),
        name: pick(row, ["MTEXT"]).trim(),
        warehouse: pick(row, ["WAREHOUSE"]),
        stockPlace: pick(row, ["STOCKPLACE"]),
        batchNum: pick(row, ["BATCHNUM"]),
        specialStock: pick(row, ["SPECIALSTOCK"]),
        availStock: num(row, ["AVAILSTOCK"], 0),
        unit: pick(row, ["QUNIT"]),
      }))
      .filter((b) => b.material || b.batchNum || b.availStock > 0)
      .filter((b) => {
        // Aynı malzeme+raf+parti tekrarını at (çok malzemeli rafı bozmadan).
        const anahtar = `${b.material}|${b.warehouse}|${b.stockPlace}|${b.batchNum || "*"}`;
        if (gorulen.has(anahtar)) return false;
        gorulen.add(anahtar);
        return true;
      });
  },

  async cancelPick(orderNum: string, orderType = ""): Promise<void> {
    const c = ctx();
    await call(SERVICES.closePick, {
      PSCOMPANY: c.company,
      PSPLANT: c.plant,
      PSORDERNUM: orderNum,
      PSORDERTYPE: orderType,
    });
  },

  async placeInPackage(
    targetWarehouse: string,
    material = "KONPAKET",
    orderNum = "",
    orderType = ""
  ): Promise<{ containerWarehouse: string; containerId: string; message: string }> {
    const c = ctx();
    const r = await call(SERVICES.createContainer, {
      PSCOMPANY: c.company,
      PSPLANT: c.plant,
      PSWAREHOUSE: targetWarehouse,
      PSMATERIAL: material,

      PSORDERNUM: orderNum,
      PSORDERTYPE: orderType,
    });

    const rows = rowsOf(r, ["TBLCONTSP", "IASINVITEM", "TBLCONTAINER"]);
    const row = rows[0] ?? {};
    const paletNo = pick(row, [
      "BATCHNUM", "STOCKPLACE", "CONTAINER", "CONTAINERNUM", "HU", "CONTAINERNO",
    ]);

    return {
      containerWarehouse: pick(row, ["WAREHOUSE"]) || targetWarehouse,
      containerId: paletNo,

      message: serviceMessage(r),
    };
  },

  buildPickRows(order: PickOrder): Row[] {
    const c = ctx();
    return order.lines.flatMap((line) =>
      (line.records ?? [])
        .filter((r) => !(r.specialStock === "1" && (!r.lot || r.lot === "*")))
        .map((r) => {
          const isPartili = r.specialStock === "1" || /takipli|partili/i.test(String(r.specialStock || ""));
          const specialStockVal = isPartili ? "1" : "*";
          const batchVal = isPartili && r.lot && r.lot !== "*" ? String(r.lot).trim() : "*";

          return {
            COMPANY: c.company,
            PLANT: c.plant,
            MATERIAL: r.material,
            WAREHOUSE: r.warehouse,
            STOCKPLACE: r.stockPlace,
            SPECIALSTOCK: specialStockVal,
            BATCHNUM: batchVal,

            READQTY: String(r.qty),
            QUNIT: r.unit,
            ORDERTYPE: order.orderType ?? "",
            ORDERNUM: order.id,
            ITEMNO: r.itemNo,

            MOVEQTY: String(line.requestedQty),
            MOVEDQTY: String(line.pickedQty),

            VOPTIONS: "",
          };
        })
    );
  },

  async savePick(
    order: PickOrder,
    containerWarehouse: string,
    containerId: string
  ): Promise<{ ok: boolean; message: string }> {
    const c = ctx();
    const rows = api.buildPickRows(order);
    if (!rows.length) return { ok: false, message: "Kaydedilecek okutma yok" };

    const r = await call(SERVICES.savePick, {
      PSCOMPANY: c.company,
      PSPLANT: c.plant,

      PSUSER: c.worker,
      PSORDERNUM: order.id,
      PSORDERTYPE: order.orderType ?? "",
      PSCONTWAREHOUSE: containerWarehouse,
      PSCONTSTOCKPLACE: containerId,

      PILABELCOUNT: LABEL_COUNT,

      PDTSTARTTIME: order.startTime ?? "",

      PSIASWMSPOITEMXML: rows,
    });

    const mesaj = serviceMessage(r);

    if (mesaj) return { ok: false, message: mesaj };
    return { ok: true, message: "" };
  },

  async readBarcode(
    barcode: string,
    warehouse = "",
    stockPlace = "",
    quantity = 1,

    batchNum = ""
  ): Promise<BarcodeResult> {
    const c = ctx();
    const params: Record<string, unknown> = {
      PSCOMPANY: c.company,
      PSPLANT: c.plant,
      PSWAREHOUSE: warehouse,
      PSSTOCKPLACE: stockPlace,
      PSBARCODE: barcode,

      PDCQUANTITY: quantity,
    };

    if (batchNum) params.PSBATCHNUM = batchNum;
    const r = await call(SERVICES.readBarcode, params);

    const rows = rowsOf(r, ["WMSXMLTABLE"]);

    // Başarısız biçim: FIELD/VALUE satırları
    const anahtarDeger: Record<string, string> = {};
    for (const row of rows) {
      const ad = pick(row, ["FIELD"]);
      if (ad) anahtarDeger[ad] = pick(row, ["VALUE"]);
    }

    const satir = rows.find((row) => pick(row, ["MATERIAL"]) !== "");
    if (!satir) {
      return {
        ok: false,
        material: "",
        name: "",
        unit: "",
        quantity: 0,
        availStock: 0,
        specialStock: "",
        fields: anahtarDeger,
        message: anahtarDeger.SYSTEMMSG || serviceMessage(r) || "Barkod tanınmadı",
      };
    }

    const lot = pick(satir, ["BATCHNUM"]);
    const rawQty = num(satir, ["QUANTITY"], 0);
    const mText = pick(satir, ["MTEXT"]).trim();
    const skunit = pick(satir, ["SKUNIT"]) || pick(satir, ["IUNIT", "UNIT"]) || "AD";

    let multiplier = rawQty > 0 ? rawQty : 1;
    if (multiplier <= 1 && mText) {
      const m = /(?:^|\s)(\d+)\s*(?:'l[üiıu]|l[üiıu]|adet|ad)(?:\s|$)/i.exec(mText);
      if (m) {
        const val = parseInt(m[1], 10);
        if (val > 1 && val <= 10000) multiplier = val;
      }
    }

    return {
      ok: true,
      material: pick(satir, ["MATERIAL"]),
      name: mText,
      unit: pick(satir, ["IUNIT", "UNIT"]),
      skunit,
      multiplier,
      lot: yok(lot) ? undefined : lot,
      quantity: rawQty,
      availStock: num(satir, ["AVAILSTOCK"], 0),

      specialStock: pick(satir, ["SPECIALSTOCK"]),
      fields: satir as Record<string, string>,
      message: "",
    };
  },

  async readShelfBarcode(barcode: string): Promise<ShelfResult> {
    const c = ctx();
    const r = await call(SERVICES.readBarcodeSP, {
      PSCOMPANY: c.company,
      PSPLANT: c.plant,
      PSBARCODE: barcode,
    });

    const rows = rowsOf(r, ["IASINV007", "TBLWHSP"]);
    const row = rows[0];
    const warehouse = row ? pick(row, ["WAREHOUSE"]) : "";
    const stockPlace = row ? pick(row, ["STOCKPLACE"]) : "";

    const restored = parseRestoredPicks(r.data);

    if (!warehouse || !stockPlace) {
      if (restored.length) {
        return {
          ok: true,
          warehouse: restored[0].warehouse,
          stockPlace: restored[0].stockPlace,
          message: "",
          restored,
        };
      }

      return {
        ok: false,
        warehouse: "",
        stockPlace: "",
        message: serviceMessage(r) || "Raf barkodu okunamadı",
      };
    }
    return { ok: true, warehouse, stockPlace, message: "", restored };
  },

  async getCompanies(): Promise<{ code: string; name: string }[]> {
    const r = await call(SERVICES.getCompany, {});
    return rowsOf(r, ["TBLCOMPANY"]).map((x) => ({
      code: pick(x, ["COMPANY"]),
      name: pick(x, ["NAME", "STEXT"]) || pick(x, ["COMPANY"]),
    }));
  },

  async getPlants(): Promise<{ code: string; name: string }[]> {
    const c = ctx();
    const r = await call(SERVICES.getPlant, { PSCOMPANY: c.company });
    return rowsOf(r, ["TBLPLANT"]).map((x) => ({
      code: pick(x, ["PLANT"]),
      name: pick(x, ["NAME", "STEXT"]) || pick(x, ["PLANT"]),
    }));
  },

  async getWarehouses(): Promise<{ code: string; name: string }[]> {
    const c = ctx();
    try {
      const r = await call(SERVICES.getWarehouse, {
        PSCOMPANY: String(c.company || "01").trim(),
        PSPLANT: String(c.plant || "100").trim(),
      });
      const res = rowsOf(r, ["TBLWAREHOUSE", "WAREHOUSELIST", "TABLE", "WAREHOUSE"]).map((x) => ({
        code: pick(x, ["WAREHOUSE", "CODE", "ID"]),
        name: pick(x, ["NAME", "STEXT", "DESCRIPTION"]) || pick(x, ["WAREHOUSE", "CODE"]),
      }));
      if (res.length > 0) return res;
    } catch {
      // Backend bağlı değilse fallback
    }
    return [
      { code: "01", name: "Ana Depo (01)" },
      { code: "02", name: "Sevkiyat Deposu (02)" },
      { code: "03", name: "Hammadde Deposu (03)" },
    ];
  },

  async getStockPlaces(warehouse = ""): Promise<{ code: string; name: string }[]> {
    const c = ctx();
    try {
      const r = await call(SERVICES.getStockPlace, {
        PSCOMPANY: c.company,
        PSPLANT: c.plant,
        PSWAREHOUSE: warehouse,
      });
      const res = rowsOf(r, ["TBLSTOCKPLACE", "TBLSP"]).map((x) => ({
        code: pick(x, ["STOCKPLACE", "SP"]),
        name: pick(x, ["NAME", "STEXT", "DESCRIPTION"]) || pick(x, ["STOCKPLACE", "SP"]),
      }));
      if (res.length > 0) return res;
    } catch {
      // Backend bağlı değilse fallback
    }
    const wh = warehouse || "01";
    return [
      { code: "A-01-01", name: `${wh} · A-01-01` },
      { code: "A-01-02", name: `${wh} · A-01-02` },
      { code: "B-02-01", name: `${wh} · B-02-01` },
      { code: "B-02-02", name: `${wh} · B-02-02` },
      { code: "C-03-01", name: `${wh} · C-03-01` },
    ];
  },

  async getReceipts(): Promise<Receipt[]> {
    const res = await api.getOpenOrders();
    if (!res.ok || !res.orders) return [];

    const map = new Map<string, Receipt>();
    res.orders.forEach((o, idx) => {
      const poNumber = String(o.ORDERNUM || o.PURORDER || `PO-${idx + 1}`).trim();
      const supplierName = String(o.NAME1 || o.SUPPLIERNAME || o.VENDORNAME || "Tedarikçi").trim();
      if (!map.has(poNumber)) {
        map.set(poNumber, {
          id: poNumber,
          supplier: supplierName,
          reference: poNumber,
          createdAt: String(o.ORDERDATE || new Date().toLocaleDateString("tr-TR")),
          lines: [],
        });
      }
      const r = map.get(poNumber)!;
      const matCode = String(o.MATERIAL || `MAT-${idx + 1}`).trim();
      const matName = String(o.STEXT || o.MTEXT || o.NAME1 || matCode).trim();
      r.lines.push({
        id: String(o.ITEMNUM || r.lines.length + 1),
        product: {
          code: matCode,
          name: matName,
          barcode: String(o.BARCODE || o.EAN || matCode).trim(),
          unit: String(o.PURUNIT || "Adet"),
        },
        expectedQty: Number(o.REMQUANTITY || o.QUANTITY || 1) || 1,
        receivedQty: 0,
        tracksLot: false,
      });
    });

    return Array.from(map.values());
  },

  async getReceipt(id: string): Promise<Receipt | undefined> {
    const res = await api.getOpenOrders({ vendor: id });
    let orders = res.orders;
    if (!orders || orders.length === 0) {
      const allRes = await api.getOpenOrders();
      orders = allRes.orders.filter(
        (o) => String(o.ORDERNUM || o.PURORDER || "").trim() === id || String(o.VENDOR || "").trim() === id
      );
    }
    if (!orders || orders.length === 0) return undefined;

    const first = orders[0];
    const supplierName = String(first.NAME1 || first.SUPPLIERNAME || first.VENDORNAME || "Tedarikçi").trim();
    const poNumber = String(first.ORDERNUM || first.PURORDER || id).trim();

    const lines: ReceiptLine[] = orders.map((o, idx) => {
      const matCode = String(o.MATERIAL || `MAT-${idx + 1}`).trim();
      const matName = String(o.STEXT || o.MTEXT || o.NAME1 || matCode).trim();
      const barcode = String(o.BARCODE || o.EAN || matCode).trim();
      const qty = Number(o.REMQUANTITY || o.QUANTITY || o.NET || 1) || 1;
      return {
        id: String(o.ITEMNUM || idx + 1),
        product: {
          code: matCode,
          name: matName,
          barcode: barcode,
          unit: String(o.PURUNIT || "Adet"),
        },
        expectedQty: qty > 0 ? qty : 1,
        receivedQty: 0,
        tracksLot: false,
      };
    });

    return {
      id: poNumber,
      supplier: supplierName,
      reference: poNumber,
      createdAt: String(first.ORDERDATE || new Date().toLocaleDateString("tr-TR")),
      lines,
    };
  },
  async completeReceipt(receipt: Receipt): Promise<{ ok: true; caniasRef: string }> {
    return { ok: true, caniasRef: receipt.reference };
  },
  async getPutawayItems(): Promise<PutawayItem[]> {
    return [];
  },
  async completePutaway(_itemId: string, _location: string): Promise<{ ok: true }> {
    return { ok: true };
  },
  async getTransferTasks(): Promise<TransferTask[]> {
    return [];
  },
  async completeTransfer(_taskId: string): Promise<{ ok: true }> {
    return { ok: true };
  },
  // INVT00M1 / MZYStockTransfer - Serbest Stok Transferi (Kaynak -> Hedef Depo / Stok Yeri)
  async createStockTransfer(
    payload: StockTransferPayload
  ): Promise<{ ok: boolean; transferId?: string; message: string }> {
    const c = ctx();
    const compCode = String(payload.company || c.company || "01").trim();
    const plantCode = String(payload.plant || c.plant || "100").trim();
    const userCode = String(payload.user || c.worker || "").trim();

    const srcWh = String(payload.sourceWarehouse || "").trim();
    const srcSp = String(payload.sourceStockPlace || "*").trim();
    const tarWh = String(payload.targetWarehouse || "").trim();
    const tarSp = String(payload.targetStockPlace || "*").trim();

    const formattedItems = (payload.items || []).map((it) => {
      const rawSpecial = String(it.specialStock || "").trim();
      const isPartili =
        rawSpecial === "1" ||
        /takipli|partili/i.test(rawSpecial) ||
        (Boolean(it.batchNum) && it.batchNum !== "*" && it.batchNum !== "—");
      const specialStock = isPartili
        ? "1"
        : rawSpecial !== "" && rawSpecial !== "0" && rawSpecial !== "Serbest"
        ? rawSpecial
        : "*";
      const batchNum =
        it.batchNum && it.batchNum !== "*" && it.batchNum !== "—"
          ? String(it.batchNum).trim()
          : "*";

      // Stok birimi (adet) bazında miktar hesaplama (Örn: KO/PK/KT ise çarpan ile adet'e çevir)
      let multiplier = it.multiplier && it.multiplier > 1 ? it.multiplier : 1;
      if (multiplier <= 1 && (it.materialName || "")) {
        const m = /(?:^|\s)(\d+)\s*(?:'l[üiıu]|l[üiıu]|adet|ad)(?:\s|$)/i.exec(it.materialName || "");
        if (m) {
          const val = parseInt(m[1], 10);
          if (val > 1 && val <= 10000) multiplier = val;
        }
      }
      const baseStockQty = Number(it.quantity || 1) * multiplier;
      const baseStockUnit = String(it.skunit || it.unit || "AD").trim().toUpperCase();

      return {
        MATERIAL: String(it.material || "").trim(),
        SPECIALSTOCK: specialStock,
        BATCHNUM: batchNum,
        QUANTITY: baseStockQty,
        QUNIT: baseStockUnit,
      };
    });

    console.log("📦 [CANIAS MZYStockTransfer PAYLOAD]", {
      company: compCode,
      plant: plantCode,
      user: userCode,
      sourceWarehouse: srcWh,
      sourceStockPlace: srcSp,
      targetWarehouse: tarWh,
      targetStockPlace: tarSp,
      items: formattedItems,
    });

    try {
      const r = await call(SERVICES.stockTransfer, {
        PSCOMPANY: compCode,
        PSPLANT: plantCode,
        PSUSER: userCode,
        PSSRCWAREHOUSE: srcWh,
        PSSRCSTOCKPLACE: srcSp,
        PSTARWAREHOUSE: tarWh,
        PSTARSTOCKPLACE: tarSp,
        PSTRANSFERTABLEXML: formattedItems,
      });

      const mesaj = serviceMessage(r);
      if (mesaj && /error|fail|hata/i.test(mesaj)) {
        return { ok: false, message: mesaj };
      }

      const rows = rowsOf(r, ["TBLTRANSFER", "TBLSTOCKTRANSFER", "TRANSFERLIST", "TBLDOC", "TBLRESULT"]);
      const firstRow = rows[0] || (r.data as Row) || {};
      const transferId =
        pick(firstRow, ["TRANSFERID", "PSTRANSFERID", "ORDERNUM", "DOCNUM", "TRANSFERNO"]) ||
        (r.data && typeof r.data === "object"
          ? pick(r.data as Row, ["TRANSFERID", "PSTRANSFERID", "ORDERNUM", "DOCNUM", "TRANSFERNO"])
          : "");

      return {
        ok: true,
        transferId: transferId || undefined,
        message: mesaj || "Transfer işlemi başarıyla tamamlandı.",
      };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      return { ok: false, message: errMsg };
    }
  },
  async getCountTasks(): Promise<CountTask[]> {
    return [];
  },
  async getCountTask(_id: string): Promise<CountTask | undefined> {
    return undefined;
  },
  async completeCount(task: CountTask): Promise<{ ok: true; caniasRef: string }> {
    return { ok: true, caniasRef: task.reference };
  },
  async queryProduct(_term: string): Promise<ProductStock | undefined> {
    return undefined;
  },

  // barcode verilirse (Bora, 14.08: listingPlacement'a PSBARCODE eklendi) sadece o
  // ürünü içeren yerleştirme emirleri döner — depocu önündeki ürünü okutup emri bulur.
  async getPutawayOrders(barcode = ""): Promise<PickOrder[]> {
    const c = ctx();
    const r = await call(SERVICES.listingPlacement, {
      PSCOMPANY: c.company,
      PSPLANT: c.plant,
      PSWORKER: c.worker,
      PISTATUS: 3,
      PIISPICK: 0,
      PDSTARTDATE: DATE_MIN,
      PDENDDATE: DATE_MAX,
      PIISDELETE: 0,
      PIISSTARTED: 1,
      PIORDER: 0,
      PSBARCODE: barcode,
    });
    return rowsOf(r, ["TBLPOLIST"])
      .map((row) => ({
        ...toPickOrder(row),

        sourceWarehouse: pick(row, ["WAREHOUSEFA"]),
        sourceShelf: pick(row, ["FRONTAREA"]),
      }))
      .sort((a, b) => {
        const pa = a.priority ?? Number.MAX_SAFE_INTEGER;
        const pb = b.priority ?? Number.MAX_SAFE_INTEGER;
        return pa !== pb ? pa - pb : a.id.localeCompare(b.id);
      });
  },

  async enterPutaway(orderNum: string, orderType = ""): Promise<PickOrder | undefined> {
    const c = ctx();
    const r = await call(SERVICES.enterPlacement, {
      PSCOMPANY: c.company,
      PSPLANT: c.plant,
      PSORDERNUM: orderNum,
      PSORDERTYPE: orderType,
    });
    const rows = rowsOf(r, ["IASWMSPOITEM", "TBLWMSPO", "TBLPODETAIL"]);
    if (!rows.length) return undefined;
    const head = rows[0];
    const kalemler = rows
      .map(toPickLine)
      .filter((l) => !!(l.product.code || l.product.name) || l.requestedQty > 0)
      .sort((a, b) => {
        const pa = a.priority ?? Number.MAX_SAFE_INTEGER;
        const pb = b.priority ?? Number.MAX_SAFE_INTEGER;
        return pa !== pb ? pa - pb : Number(a.id) - Number(b.id);
      });
    return {
      id: pick(head, ["ORDERNUM"], orderNum),
      orderType: pick(head, ["ORDERTYPE"], orderType),
      customer: pick(head, ["CUSNAME1", "CUSTOMER"]),
      reference: pick(head, ["STEXT", "DOCNUM"]),
      createdAt: pick(head, ["CREATEDAT"]),
      status: toStatus(pick(head, ["STATUS"], "0")),
      started: pick(head, ["ISSTARTED"], "0") === "1",

      sourceWarehouse: pick(head, ["WAREHOUSEFA"]),
      sourceShelf: pick(head, ["FRONTAREA"]),
      lines: kalemler,
    };
  },

  async suggestPlacementForLine(
    orderNum: string,
    orderType: string,
    itemNo: number
  ): Promise<PickSuggestion[]> {
    const c = ctx();
    const r = await call(SERVICES.suggestPlacement, {
      PSCOMPANY: c.company,
      PSPLANT: c.plant,
      PSORDERNUM: orderNum,
      PSORDERTYPE: orderType,
      PIITEMNO: itemNo,
    });

    return rowsOf(r, ["SUGGESTEDLISTTO", "SUGGESTEDLIST", "SUGGESTEDLISTFROM"])
      .map((row) => {
        const warehouse = pick(row, ["WAREHOUSE"]);
        const location = pick(row, ["STOCKPLACE"]);
        const lot = pick(row, ["BATCHNUM"]);
        return {
          itemNo,
          warehouse,
          location,
          barcode: warehouse && location ? `${warehouse}$${location}` : "",
          material: pick(row, ["MATERIAL"]),
          lot: yok(lot) ? undefined : lot,
          total: num(row, ["TOTAL"], 0),
          unit: pick(row, ["QUNIT"], "Adet"),
          distance: num(row, ["DISTANCE"], 0) || undefined,
          entryDate: pick(row, ["ENTRYDATE"]) || undefined,
        };
      })
      .filter((s) => s.barcode);
  },

  async fillPlacementLocations(order: PickOrder): Promise<PickOrder> {
    const lines = await Promise.all(
      order.lines.map(async (line) => {
        try {
          const oneriler = await api.suggestPlacementForLine(
            order.id,
            order.orderType ?? "",
            Number(line.id)
          );
          return oneriler.length ? { ...line, suggestions: oneriler } : line;
        } catch {
          return line;
        }
      })
    );
    return { ...order, lines };
  },

  async cancelPutaway(orderNum: string, orderType = ""): Promise<void> {
    const c = ctx();
    await call(SERVICES.closePlacement, {
      PSCOMPANY: c.company,
      PSPLANT: c.plant,
      PSORDERNUM: orderNum,
      PSORDERTYPE: orderType,
    });
  },

  async savePlacement(input: {
    order: PickOrder;
    itemNo: string; // PIITEMNO — kalem no
    material: string; // PSMATERIAL — malzeme kodu
    targetWarehouse: string; // PSWAREHOUSE — yerleştirilen depo
    targetShelf: string; // PSSTOCKPLACE — yerleştirilen raf
    specialStock: string; // PSSPECIALSTOCK
    lot: string; // PSBATCHNUM
    qty: number; // PDCQUANTITY
    startTime?: string; // PDSTARTTIME
  }): Promise<{ ok: boolean; message: string }> {
    const c = ctx();
    const isPartili = input.specialStock === "1" || /takipli|partili/i.test(String(input.specialStock || ""));
    const r = await call(SERVICES.savePlacement, {
      PSCOMPANY: c.company,
      PSPLANT: c.plant,
      PSORDERNUM: input.order.id,
      PSORDERTYPE: input.order.orderType ?? "",
      PIITEMNO: Number(input.itemNo) || 0,
      PSMATERIAL: input.material,
      PSWAREHOUSE: input.targetWarehouse,
      PSSTOCKPLACE: input.targetShelf,
      PSSPECIALSTOCK: isPartili ? "1" : "*",
      PSBATCHNUM: isPartili && input.lot && input.lot !== "*" ? input.lot : "*",
      PDCQUANTITY: input.qty,
      PSUSER: c.worker,
      PDSTARTTIME: input.startTime ?? "",
    });
    const mesaj = serviceMessage(r);
    if (mesaj) return { ok: false, message: mesaj };

    const bosYanit =
      !r.data ||
      (typeof r.data === "object" && Object.keys(r.data).length === 0) ||
      String(r.raw ?? "").trim().toLowerCase() === "null";
    if (bosYanit) {
      return {
        ok: false,
        message: "Yerleştirme kaydedilemedi — servis boş (null) yanıt döndü. Parametre/birim kontrolü gerekebilir.",
      };
    }
    return { ok: true, message: "" };
  },

  // 1. MZYPrintContainer - Konteyner Etiketi Bas
  // PARAMETRELER: PSCOMPANY ("01"), PSPLANT ("100"), PSCONTAINER, PIREPEAT, PSUSER
  async printContainer(payload: {
    company?: string;
    plant?: string;
    warehouse?: string;
    container: string;
    repeat: number;
    user?: string;
  }): Promise<{ ok: boolean; message: string }> {
    const c = ctx();
    const containerStr = (payload.container || "").trim();
    if (!containerStr) {
      throw new WmsError("Konteyner / Palet numarası girilmelidir");
    }
    const repeatNum = Math.min(99, Math.max(1, Number(payload.repeat) || 1));
    if (repeatNum < 1 || repeatNum > 99) {
      throw new WmsError("Kopya sayısı 1 ile 99 arasında olmalıdır");
    }

    const r = await call(SERVICES.printContainer, {
      PSCOMPANY: payload.company || c.company || "01",
      PSPLANT: payload.plant || c.plant || "100",
      PSCONTAINER: containerStr,
      PIREPEAT: repeatNum,
      PSUSER: payload.user || c.worker,
    });

    const mesaj = serviceMessage(r);
    if (mesaj && /error|fail|hata/i.test(mesaj)) {
      return { ok: false, message: mesaj };
    }

    return { ok: true, message: mesaj || "Konteyner etiket yazdırma isteği CANIAS sunucusuna iletildi." };
  },

  // 2. MZYPrintWHSP - Raf Etiketi Bas
  // PARAMETRELER: PSCOMPANY ("01"), PSPLANT ("100"), PSWAREHOUSE, PSSTOCKPLACE, PIREPEAT, PSUSER
  async printWHSP(payload: {
    company?: string;
    plant?: string;
    warehouse?: string;
    stockPlace?: string;
    repeat?: number;
    user?: string;
  }): Promise<{ ok: boolean; message: string }> {
    const c = ctx();
    const repeatNum = Math.min(99, Math.max(1, Number(payload.repeat) || 1));
    if (repeatNum < 1 || repeatNum > 99) {
      throw new WmsError("Kopya sayısı 1 ile 99 arasında olmalıdır");
    }

    const r = await call(SERVICES.printWHSP, {
      PSCOMPANY: payload.company || c.company || "01",
      PSPLANT: payload.plant || c.plant || "100",
      PSWAREHOUSE: payload.warehouse || "",
      PSSTOCKPLACE: payload.stockPlace || "",
      PIREPEAT: repeatNum,
      PSUSER: payload.user || c.worker,
    });

    const mesaj = serviceMessage(r);
    if (mesaj && /error|fail|hata/i.test(mesaj)) {
      return { ok: false, message: mesaj };
    }

    return { ok: true, message: mesaj || "Raf etiket yazdırma isteği CANIAS sunucusuna iletildi." };
  },

  // 3. MZYPrintMaterial - Malzeme Barkodu Bas
  // PARAMETRELER: PSCOMPANY ("01"), PSPLANT ("100"), PSBARCODE, PSUNIT, PIREPEAT, PSUSER
  async printMaterial(payload: {
    company?: string;
    plant?: string;
    barcode?: string;
    container?: string;
    unit?: string;
    repeat?: number;
    user?: string;
  }): Promise<{ ok: boolean; message: string }> {
    const c = ctx();
    const barcodeStr = (payload.barcode || payload.container || "").trim();
    if (!barcodeStr) {
      throw new WmsError("Malzeme kodu veya barkodu girilmelidir");
    }
    const repeatNum = Math.min(99, Math.max(1, Number(payload.repeat) || 1));
    if (repeatNum < 1 || repeatNum > 99) {
      throw new WmsError("Kopya sayısı 1 ile 99 arasında olmalıdır");
    }

    const r = await call(SERVICES.printMaterial, {
      PSCOMPANY: payload.company || c.company || "01",
      PSPLANT: payload.plant || c.plant || "100",
      PSBARCODE: barcodeStr,
      PSUNIT: payload.unit || "",
      PIREPEAT: repeatNum,
      PSUSER: payload.user || c.worker,
    });

    const mesaj = serviceMessage(r);
    if (mesaj && /error|fail|hata/i.test(mesaj)) {
      return { ok: false, message: mesaj };
    }

    return { ok: true, message: mesaj || "Malzeme barkod etiket yazdırma isteği CANIAS sunucusuna iletildi." };
  },

  // 4. MZYPrintBarcode - Barkodu Bas (SKT / Parti)
  // PARAMETRELER: PSCOMPANY ("01"), PSPLANT ("100"), PSBARCODE, PIREPEAT, PSUSER
  async printBarcode(payload: {
    company?: string;
    plant?: string;
    barcode?: string;
    container?: string;
    repeat?: number;
    user?: string;
  }): Promise<{ ok: boolean; message: string }> {
    const c = ctx();
    const barcodeStr = (payload.barcode || payload.container || "").trim();
    if (!barcodeStr) {
      throw new WmsError("Barkod / SKT bilgisi girilmelidir");
    }
    const repeatNum = Math.min(99, Math.max(1, Number(payload.repeat) || 1));
    if (repeatNum < 1 || repeatNum > 99) {
      throw new WmsError("Kopya sayısı 1 ile 99 arasında olmalıdır");
    }

    const r = await call(SERVICES.printBarcode, {
      PSCOMPANY: payload.company || c.company || "01",
      PSPLANT: payload.plant || c.plant || "100",
      PSBARCODE: barcodeStr,
      PIREPEAT: repeatNum,
      PSUSER: payload.user || c.worker,
    });

    const mesaj = serviceMessage(r);
    if (mesaj && /error|fail|hata/i.test(mesaj)) {
      return { ok: false, message: mesaj };
    }

    return { ok: true, message: mesaj || "SKT / Barkod etiket yazdırma isteği CANIAS sunucusuna iletildi." };
  },

  // ---------------------------------------------------------------------------
  // MAL KABUL (GOODS RECEIPT) SERVİSLERİ
  // ---------------------------------------------------------------------------

  // 1. MZYGetOpenOrder - Açık Satın Alma Siparişleri Listesi
  async getOpenOrders(payload: {
    barcode?: string;
    vendor?: string;
    vendorName?: string;
    company?: string;
    plant?: string;
  } = {}): Promise<{ ok: boolean; message: string; orders: Record<string, unknown>[] }> {
    const c = ctx();
    const params: Record<string, unknown> = {
      PSCOMPANY: payload.company || c.company || "01",
      PSPLANT: payload.plant || c.plant || "100",
    };

    if (payload.barcode?.trim()) {
      params.PSBARCODE = payload.barcode.trim();
    }
    if (payload.vendor?.trim()) {
      params.PSVENDOR = payload.vendor.trim();
    }
    if (payload.vendorName?.trim()) {
      params.PSVENDORNAME = payload.vendorName.trim();
      params.PSNAME = payload.vendorName.trim();
    }

    const r = await call(SERVICES.getOpenOrder, params);

    const mesaj = serviceMessage(r);
    const tableRows = rowsOf(r, ["PURORDERLIST", "TABLE", "ORDERS", "PURORDER", "ROW"]);

    return {
      ok: true,
      message: mesaj,
      orders: tableRows,
    };
  },

  // 2. MZYGetMaterial - Malzeme Detay Kartı, Barkod ve Ölçü Listesi
  async getMaterialDetail(
    barcode: string,
    company?: string,
    plant?: string
  ): Promise<{
    ok: boolean;
    message: string;
    matList: Record<string, unknown>[];
    barcodeList: Record<string, unknown>[];
    matSize: Record<string, unknown> | Record<string, unknown>[];
    image?: string;
  }> {
    const c = ctx();
    const r = await call(SERVICES.getMaterialDetail, {
      PSCOMPANY: company || c.company || "01",
      PSPLANT: plant || c.plant || "100",
      PSBARCODE: (barcode || "").trim(),
    });

    const mesaj = serviceMessage(r);
    const dataObj = r.data || {};
    const matList = rowsOf(r, ["WMSMATERIALXML", "WMSXMLTABLE", "MATLIST", "TABLE", "MATERIALS", "IASMATBASIC"]);
    const rootRow = matList[0] || (dataObj.WMSMATERIALXML as Record<string, unknown>)?.ROW || (dataObj.WMSXMLTABLE as Record<string, unknown>)?.ROW || (dataObj.ROW as Record<string, unknown>) || {};

    // Barcode List
    let barcodeList: Record<string, unknown>[] = [];
    const rawBC = (
      matList[0]?.BARCODELIST ||
      rootRow.BARCODELIST ||
      dataObj.BARCODELIST ||
      ((dataObj.WMSXMLTABLE as Record<string, unknown>)?.ROW as Record<string, unknown>)?.BARCODELIST ||
      ((dataObj.WMSMATERIALXML as Record<string, unknown>)?.ROW as Record<string, unknown>)?.BARCODELIST
    ) as unknown;
    if (rawBC) {
      if (Array.isArray(rawBC)) {
        barcodeList = rawBC as Record<string, unknown>[];
      } else if (typeof rawBC === "object" && (rawBC as Record<string, unknown>).ROW) {
        const rowVal = (rawBC as Record<string, unknown>).ROW;
        barcodeList = Array.isArray(rowVal) ? (rowVal as Record<string, unknown>[]) : [rowVal as Record<string, unknown>];
      } else if (typeof rawBC === "object") {
        barcodeList = [rawBC as Record<string, unknown>];
      }
    }
    if (!barcodeList.length) {
      barcodeList = rowsOf(r, ["BARCODELIST", "BARCODES"]);
    }

    // MatSize
    let matSize: Record<string, unknown> = {};
    if (rootRow.MATSIZE) {
      const ms = rootRow.MATSIZE as Record<string, unknown>;
      matSize = (ms.ROW || ms) as Record<string, unknown>;
    } else {
      const matSizeList = rowsOf(r, ["MATSIZE", "MATSIZELIST", "SIZE", "IASMATSIZE"]);
      matSize = matSizeList.length > 0 ? matSizeList[0] : ((dataObj.MATSIZE || dataObj.SIZE || {}) as Record<string, unknown>);
    }

    const imageList = (dataObj.MATIMAGES as Record<string, unknown>[]) || (dataObj.IMAGES as Record<string, unknown>[]) || (dataObj.PICTURELIST as Record<string, unknown>[]) || [];
    const rootImage = dataObj.IMAGE || dataObj.PICTURE || dataObj.IMAGEDATA || dataObj.RESIM || rootRow.IMAGE || rootRow.PICTURE || imageList[0]?.IMAGE || imageList[0]?.IMAGEDATA || imageList[0]?.DOCDATA;

    // Attach rootImage to first matList row if not already present
    if (matList.length > 0 && rootImage && !matList[0].IMAGE && !matList[0].PICTURE) {
      matList[0].IMAGE = rootImage;
    }

    return {
      ok: true,
      message: mesaj,
      matList,
      barcodeList,
      matSize,
      image: typeof rootImage === "string" ? rootImage : undefined,
    };
  },

  // 3. MZYSetMatSize - Malzeme Ölçü, Ağırlık ve Güvenlik Nitelikleri Güncelleme
  async setMatSize(payload: {
    company?: string;
    material: string;
    volume?: number;
    vunit?: string;
    pwidth?: number;
    plength?: number;
    pheight?: number;
    netweight?: number;
    nwunit?: string;
    brutweight?: number;
    bwunit?: string;
    isexplos?: number | boolean;
    isspoil?: number | boolean;
    aklisbreakable?: number | boolean;
    aklisliquid?: number | boolean;
    aklistoxic?: number | boolean;
    aklpalpos?: number;
  }): Promise<{ ok: boolean; message: string }> {
    const c = ctx();
    const matCode = (payload.material || "").trim();
    const compCode = payload.company || c.company || "01";

    const r = await call(SERVICES.setMatSize, {
      PSCOMPANY: compCode,
      COMPANY: compCode,
      PSMATERIAL: matCode,
      MATERIAL: matCode,
      VOLUME: payload.volume ?? 0,
      VUNIT: payload.vunit || "DS",
      PWIDTH: payload.pwidth ?? 0,
      PLENGTH: payload.plength ?? 0,
      PHEIGHT: payload.pheight ?? 0,
      NETWEIGHT: payload.netweight ?? 0,
      NWUNIT: payload.nwunit || "KG",
      BRUTWEIGHT: payload.brutweight ?? 0,
      BWUNIT: payload.bwunit || "KG",
      ISEXPLOS: payload.isexplos ? 1 : 0,
      ISSPOIL: payload.isspoil ? 1 : 0,
      AKLISBREAKABLE: payload.aklisbreakable ? 1 : 0,
      AKLISLIQUID: payload.aklisliquid ? 1 : 0,
      AKLISTOXIC: payload.aklistoxic ? 1 : 0,
      AKLPALPOS: payload.aklpalpos ?? 1,
    });

    const mesaj = serviceMessage(r);
    if (mesaj && /error|fail|hata/i.test(mesaj)) {
      return { ok: false, message: mesaj };
    }

    return { ok: true, message: mesaj || "Malzeme ölçü ve nitelik bilgileri başarıyla kaydedildi." };
  },

  // 4. MzyGetCustomer - Tedarikçi / Müşteri Arama Servisi
  // PARAMETRELER: PSCOMPANY ("01"), PSCUSTOMER (Tedarikçi Kodu), PSCUSNAME1 (Tedarikçi Adı), PICUSTYPE / PSCUSTYPE (1 = Tedarikçi)
  async getCustomers(payload: {
    customer?: string;
    name?: string;
    customerType?: number;
    company?: string;
  }): Promise<{ ok: boolean; message: string; customers: Record<string, unknown>[] }> {
    const c = ctx();
    const rawQuery = (payload.name || payload.customer || "").trim();
    const isCode = /^TED-?\d+$/i.test(rawQuery) || /^\d+$/.test(rawQuery);
    const namePattern = rawQuery ? (rawQuery.includes("%") ? rawQuery : `%${rawQuery}%`) : "";

    const params: Record<string, unknown> = {
      PSCOMPANY: payload.company || c.company || "01",
      PSCUSTOMER: isCode ? rawQuery : (payload.customer || "").trim(),
      PSCUSNAME1: isCode ? "" : namePattern,
      PICUSTYPE: payload.customerType ?? 1,
      PSCUSTYPE: payload.customerType ?? 1,
    };

    const r = await call(SERVICES.getCustomer, params);
    const mesaj = serviceMessage(r);
    const tableRows = rowsOf(r, ["CUSTOMERLIST", "VENDORLIST", "TABLE", "CUSTOMER", "VENDOR"]);

    return {
      ok: true,
      message: mesaj,
      customers: tableRows,
    };
  },

  // 5. MZYSaveReceipt - Mal Kabul Tamamlama ve Saklama Servisi
  async saveReceipt(payload: {
    company?: string;
    plant?: string;
    vendor: string;
    waybillNo: string;
    warehouse?: string;
    targetWarehouse?: string;
    sourceWarehouse?: string;
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
      purQty?: number;
      purUnit?: string;
      specialStock?: string;
      isSpecialLot?: boolean;
      batchNum?: string;
      expiryDate?: string;
    }>;
  }): Promise<{ ok: boolean; message: string }> {
    const c = ctx();
    const formattedItems = (payload.items || []).map((it) => {
      const readQty = it.receivedQty ?? it.quantity ?? 1;
      const orderType = String(it.orderType || "OP").trim().toUpperCase();
      const rawSpecial = String(
        it.specialStock || (it.isSpecialLot ? "1" : "*")
      ).trim();
      const isPartili = rawSpecial === "1" || /takipli|partili/i.test(rawSpecial) || Boolean(it.isSpecialLot);
      const specialStock = isPartili ? "1" : (rawSpecial !== "" && rawSpecial !== "0" && rawSpecial !== "Serbest" ? rawSpecial : "*");
      const batchNum = isPartili && it.batchNum && it.batchNum !== "*" && it.batchNum !== "—" ? String(it.batchNum).trim() : "*";

      return {
        MATERIAL: String(it.material || "").trim(),
        SPECIALSTOCK: specialStock,
        BATCHNUM: batchNum,
        READQUANTITY: Number(readQty),
        QUNIT: String(it.unit || "AD").trim().toUpperCase(),
        READPURQTY: it.purQty !== undefined ? Number(it.purQty) : Number(readQty),
        PURUNIT: String(it.purUnit || it.unit || "AD").trim().toUpperCase(),
        ORDERTYPE: orderType,
        ORDERNUM: String(it.orderNum || "").trim(),
        ITEMNUM: Number(it.itemNum) || 1,
        // Geriye dönük uyumluluk alanları
        PURORDER: String(it.orderNum || "").trim(),
        QUANTITY: Number(readQty),
        EXPIRYDATE: String(it.expiryDate || "").trim(),
      };
    });

    const nowStr = new Date().toLocaleString("tr-TR", { hour12: false });
    const startTimeStr = payload.startTime || nowStr;
    const compCode = String(payload.company || c.company || "01").trim();
    const plantCode = String(payload.plant || c.plant || "100").trim();
    const rawWh = String(payload.warehouse || payload.targetWarehouse || c.warehouse || "00").trim();
    const whCode = rawWh.includes("$") ? rawWh.split("$")[0].trim() : rawWh;
    const spCode = payload.stockPlace && payload.stockPlace !== "*"
      ? String(payload.stockPlace).trim()
      : (rawWh.includes("$") ? rawWh.split("$")[1].trim() : "*");
    const userCode = String(payload.user || c.worker || "").trim();
    const waybill = String(payload.waybillNo || "").trim();
    const vendorCode = String(payload.vendor || "").trim();

    const r = await call(SERVICES.saveReceipt, {
      PSCOMPANY: compCode,
      PSPLANT: plantCode,
      PSVENDOR: vendorCode,
      PSEXTDELNUM: waybill,
      PSWAYBILL: waybill, // Geriye dönük uyumluluk
      PSWAREHOUSE: whCode || "00",
      PSTARGETWH: whCode || "00", // Geriye dönük uyumluluk
      PSSOURCEWH: String(payload.sourceWarehouse || "").trim(),
      PSSTOCKPLACE: spCode || "*",
      PSUSER: userCode,
      PDTSTARTTIME: startTimeStr,
      PSIASPURITEMXML: formattedItems,
      PSITEMS: formattedItems, // Geriye dönük uyumluluk
    });

    const mesaj = serviceMessage(r);
    if (mesaj && /error|fail|hata/i.test(mesaj)) {
      return { ok: false, message: mesaj };
    }

    return {
      ok: true,
      message: mesaj || "Mal kabul işlemi başarıyla kaydedildi.",
    };
  },
};
