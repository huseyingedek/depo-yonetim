// -----------------------------------------------------------------------------
// GERÇEK SERVİS KATMANI — mock yok.
// Ekranlar sadece buradaki `api` fonksiyonlarını çağırır.
// Zincir: frontend → proxy (server/) → CANIAS login + callService
// -----------------------------------------------------------------------------

import { wmsConfig, SERVICES } from "./config";
import { useAppStore } from "../store/appStore";
import type {
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
} from "../types";

/** Proxy yanıtı */
interface MzyResult {
  data: Record<string, unknown> | null;
  messages?: string;
  sysStatus?: number;
  sysError?: string;
  raw?: string;
}

export class WmsError extends Error {}

// Bora'nın parametre kuralları:
//   • boş string  → "%"  (joker; "" gönderme)
//   • integer     → 0
//   • tarih       → alt sınır 01.01.1975, üst sınır 01.01.2100
//
// DİKKAT — gün ve ay İKİ HANELİ olmak zorunda: GG.AA.YYYY
// "1.01.1975" gibi tek haneli gün gönderilirse servis tarihi çözemiyor,
// sessizce çöpe atıyor ve aralık boşa düştüğü için liste boş dönüyor.
// (Deneyle bulundu: aynı sorguda "1.01" boş, "01.01" 6 emir döndürdü.)
export const DATE_MIN = "01.01.1975";
export const DATE_MAX = "01.01.2100";
/** Boş string yerine joker. */
export const ANY = "%";

/**
 * CANIAS'ın Messages alanını kullanıcıya gösterilebilir metne çevirir.
 *
 * Üç biçimde gelebiliyor:
 *   1) TROIA XML : <TROIAMESSAGES><MESSAGE><TEXT>...</TEXT><TYPE>E</TYPE>...
 *   2) JSON      : [{"TEXT":"..."}] veya {"TEXT":"..."}
 *   3) düz metin
 * Hepsinden sadece okunabilir METNİ çıkarır; etiketleri ve kodları atar.
 */
export function serviceMessage(r: MzyResult): string {
  const raw = r.messages;
  if (!raw) return "";
  const text = String(raw).trim();
  if (!text) return "";

  // 1) TROIA XML — <TEXT>...</TEXT> içeriklerini topla
  if (text.includes("<")) {
    const found = [...text.matchAll(/<TEXT>([\s\S]*?)<\/TEXT>/gi)].map((m) => m[1].trim());
    if (found.length) return decodeEntities(found.join("\n"));
    // Etiketli ama TEXT yoksa: tüm etiketleri sök
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
          return String(o.TEXT ?? o.MESSAGE ?? o.DESCRIPTION ?? o.MSG ?? "");
        }
        return "";
      })
      .filter(Boolean);
    if (lines.length) return lines.join("\n");
  } catch {
    /* düz metin */
  }

  // 3) düz metin
  return text;
}

/** &amp; &lt; &quot; gibi kaçışları çöz. */
function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

/**
 * Aynı anda giden aynı isteği tekilleştirir.
 * React StrictMode geliştirmede efektleri iki kez çalıştırıyor; ayrıca kullanıcı
 * hızlı gidip gelirse aynı sorgu tekrar gidebiliyor. Sadece OKUMA servisleri
 * için — yazan servisler (EnterPick, CreateContainer) her zaman gerçekten gider.
 */
const READ_ONLY = new Set<string>([SERVICES.listingPick]);
const inflight = new Map<string, Promise<MzyResult>>();

/** Proxy üzerinden CANIAS servisini çağırır. */
function call(service: string, params: Record<string, unknown>): Promise<MzyResult> {
  if (!READ_ONLY.has(service)) return doCall(service, params);

  const key = service + ":" + JSON.stringify(params);
  const pending = inflight.get(key);
  if (pending) return pending;

  const p = doCall(service, params).finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

async function doCall(service: string, params: Record<string, unknown>): Promise<MzyResult> {
  if (!wmsConfig.baseUrl) {
    throw new WmsError("Proxy adresi tanımlı değil (VITE_WMS_BASE_URL)");
  }
  let res: Response;
  try {
    res = await fetch(`${wmsConfig.baseUrl}/${service}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
  } catch {
    throw new WmsError("Sunucuya ulaşılamıyor (proxy çalışıyor mu, VPN açık mı?)");
  }
  const body = (await res.json().catch(() => ({}))) as MzyResult & { error?: string };
  const msg = serviceMessage(body);

  if (!res.ok) throw new WmsError(body.error || msg || `${service} → HTTP ${res.status}`);

  // CANIAS sistem hatası — servisin kendi metnini tercih et
  if (body.sysError) throw new WmsError(msg || body.sysError);

  // Veri yok ama servis bir şey söylüyorsa, onu aynen kullanıcıya göster
  if (!body.data && msg) throw new WmsError(msg);

  if (msg) console.info(`[${service}] servis mesajı:`, msg);
  return body;
}

/** Ayarlar'dan işlem bağlamı (CANIAS kodları). */
function ctx() {
  const st = useAppStore.getState();
  return {
    company: st.settings.company,
    plant: st.settings.facility,
    warehouse: st.settings.warehouse,
    worker: st.user?.username ?? "", // PWORKER = login olan kullanıcı
  };
}

/* ---------------- yardımcı eşleyiciler ---------------- */

type Row = Record<string, unknown>;

/** Satırdan ilk bulunan alanı döner (alan adları netleşene kadar toleranslı). */
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

/**
 * Servis yanıtından tablo satırlarını çıkarır.
 *
 * CANIAS iki katmanlı gönderiyor:
 *   { "TBLUSER": { "ROW": {...} } }        → tek satır
 *   { "TBLPOLIST": { "ROW": [{...},{...}] } } → çok satır
 *   { "TBLPOLIST": "" }                    → boş
 */
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

/**
 * CANIAS'ın JSON çıktısı bozuk geliyor: bir satırın alanlarının çoğu,
 * ilk dizi tipli alanın (ör. PLANT) içine "#item" sarmalıyla sıkışıyor:
 *
 *   { "COMPANY": "01",
 *     "PLANT": ["100", {"#item":{"ORDERNUM":"00002215"}},
 *                      {"#item":{"STATUS":"0"}}, ...] }
 *
 * Bu fonksiyon hepsini tek düzeye çıkarır:
 *   { COMPANY:"01", PLANT:"100", ORDERNUM:"00002215", STATUS:"0", ... }
 */
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
          out[key] = el; // dizinin ilk düz değeri asıl alandır
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
  // Adı bilinmiyorsa ilk dolu tabloyu al (TBLMESSAGE hariç — o hata tablosu)
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
    barcode: pick(row, ["BARCODE"]),
    unit: pick(row, ["UNIT"], "Adet"),
  };
}

/** CANIAS "*" değerini "belirlenmemiş / farketmez" anlamında kullanır. */
const yok = (v: string) => !v || v === "*";

/**
 * Emir kalemi — MZYEnterPick / TBLWMSPO tablosundan.
 *
 * Bora'nın açıkladığı kurallar:
 *   • MOVEQTY   = sipariş miktarı (toplanması gereken toplam)
 *   • MOVEDQTY  = toplanmış/kapanmış miktar  (D = "done")
 *   • FRONTAREA + WAREHOUSEFA → YERLEŞTİRME emrinde anlamlı: nereden alınacak
 *   • TRANSAREA + WAREHOUSETA → TOPLAMA emrinde anlamlı: nereye konulacak (hedef)
 *   • SPECIALSTOCK = "1" → SKT'li ürün, BATCHNUM dolu, PARTİ BARKODU OKUTULUR
 *   • SPECIALSTOCK = "*" → parti takibi yok, parti barkodu okutulmaz
 */
function toPickLine(row: Row, i: number): PickLine {
  const isPick = pick(row, ["ISPICK"]) === "1";
  const lot = pick(row, ["BATCHNUM"]);
  const specialStock = pick(row, ["SPECIALSTOCK"]);

  // Toplamada hedef alan, yerleştirmede kaynak alan okutulur
  const raf = isPick ? pick(row, ["TRANSAREA"]) : pick(row, ["FRONTAREA"]);

  return {
    id: pick(row, ["ITEMNUM", "ITEMNO"], String(i + 1)),
    product: toProduct(row),
    location: yok(raf) ? "" : raf,
    requestedQty: num(row, ["MOVEQTY"]),
    pickedQty: num(row, ["MOVEDQTY"]),
    // Parti barkodu SADECE özel stok (SKT'li) ürünlerde istenir
    lotTracked: specialStock === "1",
    lot: yok(lot) ? undefined : lot,
  };
}

/** STATUS: 0 Açık, 1 Kısmi Açık, 2 Kapalı */
function toStatus(v: string): PickOrder["status"] {
  return v === "2" ? "closed" : v === "1" ? "partial" : "open";
}

/** Emir başlığı (liste tablosu). */
function toPickOrder(row: Row): PickOrder {
  const worker = pick(row, ["WORKER"]);
  return {
    id: pick(row, ["ORDERNUM"]),
    orderType: pick(row, ["ORDERTYPE"]),
    // CUSNAME1/NAME1 müşteri adı, yoksa müşteri numarası
    customer: pick(row, ["CUSNAME1", "NAME1", "CUSTOMER"]),
    reference: pick(row, ["STEXT", "DOCNUM"]), // Emir açıklaması
    createdAt: pick(row, ["CREATEDAT"]),
    worker: worker && worker !== "*" ? worker : undefined, // "*" = atanmamış
    // PRIORITY: küçük olan önce toplanır. Alan boşsa 0 sayma —
    // 0 sıralamada en başa fırlar ve öncelikli emirlerin önüne geçer.
    priority: pick(row, ["PRIORITY"]) === "" ? undefined : num(row, ["PRIORITY"], 0),
    status: toStatus(pick(row, ["STATUS"], "0")),
    started: pick(row, ["ISSTARTED"], "0") === "1",
    lines: [],
  };
}

/* ---------------- API ---------------- */
// Parametre adları ve değerleri Mizoye'nin resmi servis dokümanından.
// Önek servise göre değişiyor: MZYListingPick "P...", diğerleri "PS...".

export const api = {
  /** MZYCheckUser — depocu girişi. */
  async checkUser(username: string, password: string): Promise<User | null> {
    const r = await call(SERVICES.checkUser, {
      PSUSER: username,
      PSPASSWORD: password,
    });
    // Doğru bilgide TBLUSER dolu gelir; yanlışta TBLMESSAGE (boş veya hata metni).
    const rows = rowsOf(r, ["TBLUSER", "TBLCHECKUSER"]);
    if (!rows.length) {
      const hata = unwrapRows(r.data?.TBLMESSAGE)
        .map((m) => pick(m, ["TEXT", "MESSAGE", "VALUE"]))
        .filter(Boolean)
        .join("\n");
      throw new WmsError(hata || serviceMessage(r) || "Kullanıcı adı veya parola hatalı");
    }
    const u = rows[0];
    const name = pick(u, ["NAME"]);
    const surname = pick(u, ["SURNAME"]);
    console.info("[MZYCheckUser] kullanıcı:", u);
    return {
      username,
      displayName: [name, surname].filter(Boolean).join(" ") || username,
    };
  },

  /**
   * MZYListingPick — açık toplama emirleri.
   * Sıralama PRIORITY'ye göre artan: küçük olan önce toplanır (Bora).
   */
  async getPickOrders(): Promise<PickOrder[]> {
    const c = ctx();
    const r = await call(SERVICES.listingPick, {
      // Önek kuralı: PS = STRING, PI = INTEGER, PD = DATETIME
      PSCOMPANY: c.company,
      PSPLANT: c.plant,
      PSWORKER: c.worker, // giriş yapan kullanıcı
      PISTATUS: 0, // Açık
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
        // Önceliksiz emirler en sona; eşitlikte emir numarasına göre sabit sıra
        const pa = a.priority ?? Number.MAX_SAFE_INTEGER;
        const pb = b.priority ?? Number.MAX_SAFE_INTEGER;
        return pa !== pb ? pa - pb : a.id.localeCompare(b.id);
      });
  },

  /** MZYEnterPick — emri toplamaya başlat + kalem detayı. */
  async getPickOrder(orderNum: string, orderType = ""): Promise<PickOrder | undefined> {
    const c = ctx();
    const r = await call(SERVICES.enterPick, {
      PSCOMPANY: c.company,
      PSPLANT: c.plant,
      PSORDERNUM: orderNum,
      PSORDERTYPE: orderType,
    });
    // Bora: EnterPick'ten dönen tablo IASWMSPOITEM.
    // (Gözlemde TBLWMSPO adıyla da geliyor — ikisini de tanıyoruz.)
    const rows = rowsOf(r, ["IASWMSPOITEM", "TBLWMSPO", "TBLPODETAIL"]);
    if (!rows.length) return undefined;
    const head = rows[0];
    return {
      id: pick(head, ["ORDERNUM"], orderNum),
      orderType: pick(head, ["ORDERTYPE"], orderType),
      customer: pick(head, ["CUSNAME1", "CUSTOMER"]),
      reference: pick(head, ["STEXT", "DOCNUM"]),
      createdAt: pick(head, ["CREATEDAT"]),
      status: toStatus(pick(head, ["STATUS"], "0")),
      started: pick(head, ["ISSTARTED"], "0") === "1",
      lines: rows.map(toPickLine),
    };
  },

  /**
   * MZYCrtSuggestListPickFromSP — "Stok Yerinden Toplama Önerisi Oluştur".
   * Bir kalem için hangi raftan/partiden alınacağını önerir.
   * Önek kuralı: PS = STRING, PI = INTEGER.
   */
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
    return rowsOf(r, ["IASWMSPOITEM", "TBLSUGGEST", "TBLWMSPO"]).map((row) => ({
      itemNo,
      location: pick(row, ["FRONTAREA", "STOCKPLACE", "TRANSAREA"]),
      warehouse: pick(row, ["WAREHOUSEFA", "WAREHOUSE"]),
      material: pick(row, ["MATERIAL"]),
      lot: (() => {
        const b = pick(row, ["BATCHNUM"]);
        return yok(b) ? undefined : b;
      })(),
      qty: num(row, ["MOVEQTY", "QUANTITY", "EXSTQTY"]),
      unit: pick(row, ["UNIT"], "Adet"),
    }));
  },

  /** MZYClosePick — toplamaktan vazgeç (tamamlama DEĞİL). */
  async cancelPick(orderNum: string, orderType = ""): Promise<void> {
    const c = ctx();
    await call(SERVICES.closePick, {
      PSCOMPANY: c.company,
      PSPLANT: c.plant,
      PSORDERNUM: orderNum,
      PSORDERTYPE: orderType,
    });
  },

  /** MZYCreateContainer — "Pakete Yerleştir" (palet oluştur). */
  async placeInPackage(material = "KONPAKET"): Promise<{ containerId: string }> {
    const c = ctx();
    const r = await call(SERVICES.createContainer, {
      PSCOMPANY: c.company,
      PSPLANT: c.plant,
      PSWAREHOUSE: c.warehouse,
      PSMATERIAL: material,
    });
    const rows = rowsOf(r, ["TBLCONTAINER"]);
    return { containerId: rows.length ? pick(rows[0], ["CONTAINER", "CONTAINERNUM", "HU"]) : "" };
  },

  /** MZYReadBarcode — parametre adları dokümanda yok, Bora'ya sorulacak. */
  async readBarcode(barcode: string): Promise<{ material: string; qty: number } | null> {
    const c = ctx();
    const r = await call(SERVICES.readBarcode, {
      PSCOMPANY: c.company,
      PSPLANT: c.plant,
      PSBARCODE: barcode,
    });
    const rows = rowsOf(r, ["TBLBARCODE", "TBLMATERIAL"]);
    if (!rows.length) return null;
    return {
      material: pick(rows[0], ["MATERIAL"]),
      qty: num(rows[0], ["QUANTITY", "MOVEQTY"], 1),
    };
  },

  /* ---- Seçim listeleri (Ayarlar ekranı) ---- */

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

  /* ---------------------------------------------------------------------
   * Diğer modüller — CANIAS servisleri henüz yok, ekranlar bozulmasın diye
   * boş dönüyorlar.
   * ------------------------------------------------------------------- */
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
};
