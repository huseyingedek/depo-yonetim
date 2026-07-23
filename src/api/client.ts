// -----------------------------------------------------------------------------
// GERÇEK SERVİS KATMANI — mock yok.
// Ekranlar sadece buradaki `api` fonksiyonlarını çağırır.
// Zincir: frontend → proxy (server/) → CANIAS login + callService
// -----------------------------------------------------------------------------

import { wmsConfig, SERVICES } from "./config";
import { useAppStore } from "../store/appStore";
import type {
  BarcodeResult,
  ShelfResult,
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
  // 1) CANIAS'ın Messages alanı (XML ya da JSON string)
  const m1 = mesajCoz(r.messages);
  if (m1) return m1;

  // 2) JSON mesaj tablosu — servisler artık hatayı da JSON dönüyor:
  //    {"MESSAGETABLE":{"ROW":[{"TYPE":"E","SYSTEMMSG":"...","MSGNUMBER":"1306"}]}}
  //    Sadece MESAJ tablolarına bakıyoruz (veri tablosuna değil).
  const m2 = mesajTablosu(r.data);
  if (m2) return m2;

  // 3) data ham XML olarak geldiyse ({raw:"<MESSAGETABLE>..."}) yine oku.
  const dataStr = dataToText(r.data);
  if (/SYSTEMMSG|MESSAGETABLE|TBLMESSAGE|<TEXT>/i.test(dataStr)) {
    const m3 = mesajCoz(dataStr);
    if (m3) return m3;
  }
  return "";
}

/** data içindeki JSON mesaj tablolarından SYSTEMMSG/TEXT toplar. */
function mesajTablosu(data: Record<string, unknown> | null): string {
  if (!data) return "";
  const adlar = ["MESSAGETABLE", "TBLMESSAGE", "TROIAMESSAGES", "MSGTABLE", "TBLMSG"];
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

/** data alanını metne çevirir (raw XML ya da JSON). */
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

/** Ham mesajı (XML/JSON/düz metin) okunabilir metne çevirir. */
function mesajCoz(raw: unknown): string {
  if (!raw) return "";
  const text = String(raw).trim();
  if (!text) return "";

  // 1) XML — <TEXT> veya <SYSTEMMSG> içeriklerini topla
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
    // Bora EnterPick yanıtına barkodları ekleyecek — alan adı netleşince
    // buraya eklenecek. Şimdilik gelen ilk eşleşen ad kullanılıyor.
    barcode: pick(row, ["BARCODE", "BARCODENUM", "EAN"]),
    unit: pick(row, ["UNIT"], "Adet"),
  };
}

/** CANIAS "*" değerini "belirlenmemiş / farketmez" anlamında kullanır. */
const yok = (v: string) => !v || v === "*";

/**
 * Emir kalemi — MZYEnterPick / IASWMSPOITEM tablosundan.
 *
 * Bora'nın açıkladığı kurallar:
 *   • MOVEQTY   = sipariş miktarı (toplanması gereken toplam)
 *   • MOVEDQTY  = toplanmış/kapanmış miktar  (D = "done")
 *   • SPECIALSTOCK = "1" → SKT'li ürün, BATCHNUM dolu, PARTİ BARKODU OKUTULUR
 *   • SPECIALSTOCK = "*" → parti takibi yok, parti barkodu okutulmaz
 *
 * Alan anlamları (Bora):
 *   • FRONTAREA + WAREHOUSEFA → YERLEŞTİRME emrinde: nereden alınacak (kaynak)
 *   • TRANSAREA + WAREHOUSETA → TOPLAMA emrinde: nereye konulacak (hedef/target)
 *
 * DİKKAT — toplamada TRANSAREA ürünün alınacağı RAF DEĞİLDİR.
 * Toplanan malların içine konduğu paletin/aracın bırakılacağı yerdir.
 * Ürünün hangi rafta durduğu bilgisi bu tabloda hiç YOK; onu ReadBarcodeSP
 * (Bora yazıyor) ve MZYCrtSuggestListPickFromSP verecek.
 * Bu yüzden toplamada `location` boş kalıyor — depocuya sevk alanını
 * "raf" diye göstermektense hiç göstermemek doğru.
 */
function toPickLine(row: Row, i: number): PickLine {
  const isPick = pick(row, ["ISPICK"]) === "1";
  const lot = pick(row, ["BATCHNUM"]);
  const specialStock = pick(row, ["SPECIALSTOCK"]);

  // Yerleştirmede kaynak alan gerçekten okutulacak yerdir; toplamada değil.
  const kaynak = isPick ? "" : pick(row, ["FRONTAREA"]);

  return {
    id: pick(row, ["ITEMNUM", "ITEMNO"], String(i + 1)),
    product: toProduct(row),
    location: yok(kaynak) ? "" : kaynak,
    requestedQty: num(row, ["MOVEQTY"]),
    pickedQty: num(row, ["MOVEDQTY"]),
    // Parti barkodu SADECE özel stok (SKT'li) ürünlerde istenir
    lotTracked: specialStock === "1",
    lot: yok(lot) ? undefined : lot,
    // PRIORITY kalem seviyesinde geliyor (emir listesinde değil).
    // Küçük olan önce toplanır — Bora.
    priority: pick(row, ["PRIORITY"]) === "" ? undefined : num(row, ["PRIORITY"], 0),
    // Toplamada hedef: toplanan malın konduğu paletin bırakılacağı yer
    targetArea: isPick && !yok(pick(row, ["TRANSAREA"])) ? pick(row, ["TRANSAREA"]) : undefined,
    // WAREHOUSETA — MZYCreateContainer'a giden hedef depo (Bora)
    targetWarehouse: pick(row, ["WAREHOUSETA"]) || undefined,
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
      PISTATUS: 3, // Bora (23.07): 0 yerine 3
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
    const siraliKalemler = rows.map(toPickLine).sort((a, b) => {
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
      // Toplama sırası PRIORITY'ye göre: küçük olan önce (Bora).
      // Önceliksiz kalemler sona; eşitlikte ITEMNO ile sabit sıra.
      lines: siraliKalemler,
    };
  },

  /**
   * Kalemlerin raf bilgisini doldurur — her kalem için öneri servisi çağrılır.
   *
   * Ayrı bir fonksiyon çünkü:
   *   • kalem sayısı kadar istek çıkıyor, emir ekranını bekletmemek gerekiyor
   *   • Bora: "uzun siparişlerde tekrar sorgulamakta fayda var, toplarken
   *     stok eksilebilir" — yani bu bilgi tazelenebilir olmalı
   *
   * Öneri servisi stok yoksa boş döner; o durumda kalem raf bilgisiz kalır,
   * uydurma bir raf yazmıyoruz.
   */
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
          return line; // öneri alınamadıysa kalem raf bilgisiz kalsın
        }
      })
    );
    return { ...order, lines };
  },

  /**
   * MZYCrtSuggestListPickFromSP — "Stok Yerinden Toplama Önerisi".
   *
   * Bir kalemin hangi raftan alınacağını söyler. Dönen tablo: SUGGESTEDLISTFROM
   *   WAREHOUSE + STOCKPLACE → raf ("D3" + "C1" → barkod "D3$C1")
   *   TOTAL + QUNIT          → o rafta bu üründen ne kadar var (96 AD)
   *   DISTANCE               → rafın uzaklığı, küçük olan daha yakın
   *   ENTRYDATE              → stoğun rafa giriş tarihi (FIFO)
   *   BATCHNUM / SPECIALSTOCK→ o raftaki partinin bilgisi
   *
   * Aynı ürün birden çok rafta olabilir; her raf ayrı satır olarak gelir.
   * Sonuç mesafeye göre sıralanır — depocu en yakın rafa gitsin.
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
    return rowsOf(r, ["SUGGESTEDLISTFROM"])
      .map((row) => {
        const warehouse = pick(row, ["WAREHOUSE"]);
        const location = pick(row, ["STOCKPLACE"]);
        const lot = pick(row, ["BATCHNUM"]);
        return {
          itemNo,
          warehouse,
          location,
          // Raf barkodu biçimi: DEPO$STOKYERİ (Bora)
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
    // SIRALAMA YOK — servis rafları zaten kendi sırasıyla gönderiyor, biz
    // kendi kafamıza göre (mesafe vb.) yeniden sıralamıyoruz. Bora: "adamlar
    // sıralamış, hazır sıralı geliyor, ona göre çek."
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

  /**
   * MZYCreateContainer — "Palet Oluştur" (Bora'nın Excel'indeki adı).
   * Parametreler: PSCOMPANY, PSPLANT, PSWAREHOUSE, PSMATERIAL
   *
   * DEPO: ayarlardaki depo DEĞİL — EnterPick'ten gelen WAREHOUSETA
   * (IASWMSPOITEM_WAREHOUSETA, örn. "10"). Bora: "enterpickle gelen
   * warehouseta". Yani paletin bırakılacağı hedef depo.
   */
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
      // Emir bilgisi de gönderiliyor (spec'te yok ama isteğe göre ekli).
      PSORDERNUM: orderNum,
      PSORDERTYPE: orderType,
    });
    // CreateContainer paleti "TBLCONTSP" tablosunda döndürüyor (canlı, 23.07):
    //   { WAREHOUSE:"10", BATCHNUM:"SO-26935282", COMPANY:"01", PLANT:"100" }
    // Yani paletin DEPOSU = WAREHOUSE, NUMARASI = BATCHNUM.
    // (Eski IASINVITEM/STOCKPLACE biçimi de yedekte duruyor.)
    const rows = rowsOf(r, ["TBLCONTSP", "IASINVITEM", "TBLCONTAINER"]);
    const row = rows[0] ?? {};
    const paletNo = pick(row, [
      "BATCHNUM", "STOCKPLACE", "CONTAINER", "CONTAINERNUM", "HU", "CONTAINERNO",
    ]);
    // PSCONTWAREHOUSE = paletin GERÇEK deposu (yanıttan gelen WAREHOUSE).
    // Palet her zaman 10'da oluşuyor; WAREHOUSETA "100" olsa da container 10'da.
    // "Gönderdiğin depo" (targetWarehouse) 100 ise SavePick "Depo 100 bulunamadı"
    // diyordu — bu yüzden container'ın döndürdüğü depoyu kullanıyoruz.
    return {
      containerWarehouse: pick(row, ["WAREHOUSE"]) || targetWarehouse,
      containerId: paletNo,
      // CANIAS hata mesajı (ör. "envanter hareketi yetkiniz yok"). Boş palette
      // kullanıcıya bunu göstereceğiz — genel "boş döndü" yerine gerçek sebep.
      message: serviceMessage(r),
    };
  },

  /**
   * Okutma kayıtlarını CANIAS'ın beklediği tablo biçimine çevirir.
   *
   * Bora'nın verdiği yapı — IASWMSPOITEMREAD:
   *   COMPANY, PLANT, MATERIAL, WAREHOUSE, STOCKPLACE, SPECIALSTOCK,
   *   BATCHNUM, QUANTITY, QUNIT, ORDERTYPE, ORDERNUM, ITEMNO
   *
   * Servis henüz yazılmadı; gelince bu satırlar olduğu gibi gönderilecek.
   * Burada hazır tutuluyor ki servis geldiğinde tek bağlantı kalsın.
   */
  buildPickRows(order: PickOrder): Row[] {
    const c = ctx();
    return order.lines.flatMap((line) =>
      (line.records ?? [])
        // Bora (23.07): SPECIALSTOCK=1 ise parti "*" olamaz. Parti takipli ama
        // partisi girilmemiş (okutulmamış) kayıt SavePick'e GÖNDERİLMEZ.
        .filter((r) => !(r.specialStock === "1" && (!r.lot || r.lot === "*")))
        .map((r) => ({
        COMPANY: c.company,
        PLANT: c.plant,
        MATERIAL: r.material,
        WAREHOUSE: r.warehouse,
        STOCKPLACE: r.stockPlace,
        SPECIALSTOCK: r.specialStock,
        BATCHNUM: r.lot ?? "*",
        // Okutulan miktar — Bora (23.07): servis READQTY bekliyor. Tek alan.
        READQTY: String(r.qty),
        QUNIT: r.unit,
        ORDERTYPE: order.orderType ?? "",
        ORDERNUM: order.id,
        ITEMNO: r.itemNo,
        // Bora (23.07): kendi kontrol açısından sipariş ve önceden toplanan.
        MOVEQTY: String(line.requestedQty),
        MOVEDQTY: String(line.pickedQty),
        // Bora (23.07): şimdilik BOŞ gönderilecek, altyapı için alan dursun.
        VOPTIONS: "",
      }))
    );
  },

  /**
   * MZYSavePick — toplananı CANIAS'a yazar. MOVEDQTY bununla güncellenir.
   *
   * Bora'nın son spec'i (23.07) — parametreler:
   *   PSCOMPANY, PSPLANT,
   *   PSORDERNUM, PSORDERTYPE → toplanan emir
   *   PSCONTWAREHOUSE   → CreateContainer'a gönderilen depo
   *   PSCONTSTOCKPLACE  → CreateContainer'dan dönen BATCHNUM (palet no)
   *   PSIASWMSPOITEMXML → okutulanlar tablosu, XML olarak
   *
   * PSIASWMSPOITEMXML bir XML bloğu: her okutma satırı bir <ROW>. Sunucu
   * dizi verildiğinde <PSIASWMSPOITEMXML><ROW>...</ROW></PSIASWMSPOITEMXML>
   * olarak seri hale getiriyor.
   */
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
      PSORDERNUM: order.id,
      PSORDERTYPE: order.orderType ?? "",
      PSCONTWAREHOUSE: containerWarehouse,
      PSCONTSTOCKPLACE: containerId,
      // Dizi gönderiliyor; sunucu <ROW> listesine çeviriyor
      PSIASWMSPOITEMXML: rows,
    });

    const mesaj = serviceMessage(r);
    // Hata mesajı varsa başarısız say; boş mesaj başarı kabul ediliyor
    if (mesaj) return { ok: false, message: mesaj };
    return { ok: true, message: "" };
  },

  /**
   * MZYReadBarcode — ÜRÜN barkodu çözümü.
   * Parametreler: PSCOMPANY, PSPLANT, PSWAREHOUSE, PSSTOCKPLACE, PSBARCODE
   * Depo/stok yeri = önce okutulan raf; boş geçilebilir.
   *
   * Yanıt tek tablo (WMSXMLTABLE) ama İKİ FARKLI BİÇİMDE geliyor:
   *
   *   BAŞARILI → tek satır, malzeme alanları dolu:
   *     {MATERIAL:"UD009", MTEXT:"Uludağ...", UNIT:"AD", QUANTITY:"0.0", ...}
   *
   *   BAŞARISIZ → iki satır, anahtar-değer:
   *     [{FIELD:"RETVALUE", VALUE:"0"}, {FIELD:"SYSTEMMSG", VALUE:"..."}]
   *
   * Ayrımı MATERIAL alanının varlığından yapıyoruz — RETVALUE başarılı
   * yanıtta hiç gelmiyor, ona bakmak yanıltıcı olurdu.
   *
   * Bir ürünün birden çok barkodu var (EAN'lar + "UD009$*$" biçimi), hepsi
   * aynı MATERIAL'a çıkıyor. Bu yüzden kalem eşleştirmesi BARKODLA DEĞİL,
   * dönen MATERIAL ile yapılmalı.
   */
  async readBarcode(
    barcode: string,
    warehouse = "",
    stockPlace = "",
    quantity = 1,
    /** Parti doğrulaması için gönderilir (parti takipli üründe). Boşsa
        gönderilmez — normal ürün okumasında parti barkodun içinde gelir. */
    batchNum = ""
  ): Promise<BarcodeResult> {
    const c = ctx();
    const params: Record<string, unknown> = {
      PSCOMPANY: c.company,
      PSPLANT: c.plant,
      PSWAREHOUSE: warehouse,
      PSSTOCKPLACE: stockPlace,
      PSBARCODE: barcode,
      // Ekranda girilen "kaç tane" değeri. Ad: TBLPARAM_PDCQUANTITY
      PDCQUANTITY: quantity,
    };
    // Parti verilmişse doğrulama için PSBATCHNUM eklenir (o partinin stoğu döner).
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
      unit: pick(satir, ["UNIT"]),
      lot: yok(lot) ? undefined : lot,
      quantity: num(satir, ["QUANTITY"], 0),
      availStock: num(satir, ["AVAILSTOCK"], 0),
      // "1" → parti takipli, "*" → değil. Parti akışını buna göre tetikleyeceğiz.
      specialStock: pick(satir, ["SPECIALSTOCK"]),
      fields: satir as Record<string, string>,
      message: "",
    };
  },

  /**
   * MZYReadBarcodeSP — RAF barkodu çözümü. Biçim: WAREHOUSE$STOCKPLACE (D3$C1)
   *
   * DİKKAT: Servis DOĞRULAMA YAPMIYOR. Olmayan raf ("ZZ$YY99") gönderilse de
   * normal cevap dönüyor. Yani buradan gelen "ok" değeri rafın gerçekten
   * var olduğunu göstermez; sadece barkodun ayrıştırılabildiğini gösterir.
   * Gerçek doğrulama Bora'dan bekleniyor.
   */
  async readShelfBarcode(barcode: string): Promise<ShelfResult> {
    const c = ctx();
    const r = await call(SERVICES.readBarcodeSP, {
      PSCOMPANY: c.company,
      PSPLANT: c.plant,
      PSBARCODE: barcode,
    });
    // Servis WAREHOUSE ve STOCKPLACE'i AYRI döndürüyor — barkodu parse etmiyoruz.
    // Tablo adı değişti: artık IASINV007 (eski TBLWHSP yedekte).
    const rows = rowsOf(r, ["IASINV007", "TBLWHSP"]);
    const row = rows[0];
    const warehouse = row ? pick(row, ["WAREHOUSE"]) : "";
    const stockPlace = row ? pick(row, ["STOCKPLACE"]) : "";

    // Depo ve stok yeri dolu geldiyse raf geçerli. Barkod biçimini ($) kontrol
    // etmiyoruz — servis alanları ayrı veriyor.
    if (!warehouse || !stockPlace) {
      return {
        ok: false,
        warehouse: "",
        stockPlace: "",
        message: serviceMessage(r) || "Raf barkodu okunamadı",
      };
    }
    return { ok: true, warehouse, stockPlace, message: "" };
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
