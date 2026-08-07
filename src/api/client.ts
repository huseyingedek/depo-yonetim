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
  PutawayItem,
  TransferTask,
  CountTask,
  ProductStock,
  PickSuggestion,
  StockBatch,
  StockRow,
} from "../types";

interface MzyResult {
  data: Record<string, unknown> | null;
  messages?: string;
  sysStatus?: number;
  sysError?: string;
  raw?: string;
}

export class WmsError extends Error {}


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

function mesajTablosu(data: Record<string, unknown> | null): string {
  if (!data) return "";

  const adlar = ["MESSAGETABLE", "TBLMESSAGE", "TROIAMESSAGES", "MSGTABLE", "TBLMSG", "ROW"];
  const lines: string[] = [];
  for (const ad of adlar) {
    if (!(ad in data)) continue;
    for (const row of unwrapRows(data[ad])) {
      const t = pick(row, ["SYSTEMMSG", "TEXT", "MESSAGE", "MSG", "DESCRIPTION"]);
      if (t) lines.push(t);
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

let ardArdaBaglantiHatasi = 0;
const BAGLANTI_ESIK = 3;
function baglantiHatasi(detay = ""): WmsError {

  // debug için console'a yazılır.
  if (detay) console.warn("[bağlantı] istek cevapsız:", detay);
  ardArdaBaglantiHatasi++;
  if (ardArdaBaglantiHatasi >= BAGLANTI_ESIK) {
    ardArdaBaglantiHatasi = 0;

    try {
      useAppStore.getState().logout();
    } catch {

    }
  }
  return new WmsError("İstek cevaplanmadı");
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
  ardArdaBaglantiHatasi = 0;

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
  if (!d) return [];
  for (const name of tableNames) {
    if (name in d) {
      const rows = unwrapRows(d[name]);
      if (rows.length) return rows;
    }
  }

  for (const [k, v] of Object.entries(d)) {
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

    customer: pick(row, ["CUSNAME1", "NAME1", "CUSTOMER"]),
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
    return rowsOf(r, ["TBLSTOCK"])

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
        .map((r) => ({
        COMPANY: c.company,
        PLANT: c.plant,
        MATERIAL: r.material,
        WAREHOUSE: r.warehouse,
        STOCKPLACE: r.stockPlace,
        SPECIALSTOCK: r.specialStock,
        BATCHNUM: r.lot ?? "*",

        READQTY: String(r.qty),
        QUNIT: r.unit,
        ORDERTYPE: order.orderType ?? "",
        ORDERNUM: order.id,
        ITEMNO: r.itemNo,

        MOVEQTY: String(line.requestedQty),
        MOVEDQTY: String(line.pickedQty),

        VOPTIONS: "",
      }))
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
    return {
      ok: true,
      material: pick(satir, ["MATERIAL"]),
      name: pick(satir, ["MTEXT"]).trim(),
      unit: pick(satir, ["IUNIT", "UNIT"]),
      lot: yok(lot) ? undefined : lot,
      quantity: num(satir, ["QUANTITY"], 0),
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
    const r = await call(SERVICES.getWarehouse, { PSCOMPANY: c.company, PSPLANT: c.plant });
    return rowsOf(r, ["TBLWAREHOUSE"]).map((x) => ({
      code: pick(x, ["WAREHOUSE"]),
      name: pick(x, ["NAME", "STEXT"]) || pick(x, ["WAREHOUSE"]),
    }));
  },

  async getReceipts(): Promise<Receipt[]> {
    return [];
  },
  async getReceipt(_id: string): Promise<Receipt | undefined> {
    return undefined;
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

  async getPutawayOrders(): Promise<PickOrder[]> {
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
    const r = await call(SERVICES.savePlacement, {
      PSCOMPANY: c.company,
      PSPLANT: c.plant,
      PSORDERNUM: input.order.id,
      PSORDERTYPE: input.order.orderType ?? "",
      PIITEMNO: Number(input.itemNo) || 0,
      PSMATERIAL: input.material,
      PSWAREHOUSE: input.targetWarehouse,
      PSSTOCKPLACE: input.targetShelf,
      PSSPECIALSTOCK: input.specialStock,
      PSBATCHNUM: input.lot || "*",
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

  // Bora, 05.08: Raf / Konteyner / Parti Etiketi Yazdırma (MZYPrintWHSP)
  // PARAMETRELER:
  //   PSCOMPANY: "01", PSPLANT: "100", PSWAREHOUSE: depo, PSSTOCKPLACE: raf
  //   PSCONTAINER: parti/batchnum veya konteyner kodu
  //   PIISCONTAINER: 1 (konteyner ise) veya 0
  //   PIREPEAT: tekrar sayısı
  //   PSUSER: kullanıcı
  async printWHSP(payload: {
    company?: string;
    plant?: string;
    warehouse?: string;
    stockPlace?: string;
    container?: string;
    isContainer?: boolean | number;
    repeat?: number;
    user?: string;
  }): Promise<{ ok: boolean; message: string }> {
    const c = ctx();
    const repeatNum = Math.min(99, Math.max(1, Number(payload.repeat) || 1));
    if (repeatNum < 1 || repeatNum > 99) {
      throw new WmsError("Kopya sayısı 1 ile 99 arasında olmalıdır");
    }

    try {
      const r = await call(SERVICES.printWHSP, {
        PSCOMPANY: payload.company || c.company || "01",
        PSPLANT: payload.plant || c.plant || "100",
        PSWAREHOUSE: payload.warehouse || "",
        PSSTOCKPLACE: payload.stockPlace || "",
        PSCONTAINER: payload.container || "",
        PIISCONTAINER: payload.isContainer ? 1 : 0,
        PIREPEAT: repeatNum,
        PSUSER: payload.user || c.worker,
      });

      const mesaj = serviceMessage(r);
      if (mesaj && /error|fail|hata/i.test(mesaj)) {
        return { ok: false, message: mesaj };
      }

      return { ok: true, message: mesaj || "Etiket yazdırma isteği CANIAS sunucusuna iletildi." };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "";
      if (/bilinmeyen servis/i.test(errMsg) || /not found/i.test(errMsg)) {
        return this.printContainer({
          company: payload.company,
          plant: payload.plant,
          warehouse: payload.warehouse || "10",
          container: payload.container || "",
          repeat: repeatNum,
          user: payload.user,
        });
      }
      throw err;
    }
  },

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

    // Bora, 05.08: Konteyner etiketi basma MZYPrintContainer ile:
    // PSCOMPANY: "01", PSPLANT: "100", PSWAREHOUSE: "10", PIISCONTAINER: 1, PSCONTAINER: batchnumber
    const r = await call(SERVICES.printContainer, {
      PSCOMPANY: payload.company || c.company || "01",
      PSPLANT: payload.plant || c.plant || "100",
      PSWAREHOUSE: payload.warehouse || "10",
      PSSTOCKPLACE: "",
      PSCONTAINER: containerStr,
      PIISCONTAINER: 1,
      PIREPEAT: repeatNum,
      PSUSER: payload.user || c.worker,
    });

    const mesaj = serviceMessage(r);
    if (mesaj && /error|fail|hata/i.test(mesaj)) {
      return { ok: false, message: mesaj };
    }

    return { ok: true, message: mesaj || "Etiket yazdırma isteği CANIAS sunucusuna iletildi." };
  },
};
