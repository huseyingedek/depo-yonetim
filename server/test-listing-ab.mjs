// -----------------------------------------------------------------------------
// MZYListingPick — ESKİ vs YENİ parametre seti (A/B)
// -----------------------------------------------------------------------------
// Az önce eski 15 parametreyle 6 emir geliyordu, yeni 10 parametreyle boş.
// Sebep ikisinden biri:
//   a) Servis henüz yeni parametre adlarına güncellenmedi
//   b) Emirler EnterPick sonrası liste dışı kaldı (durum değişti)
//
// Eski set hâlâ veri veriyorsa → (a)
// İkisi de boşsa → (b)
//
// Çalıştırma:  node test-listing-ab.mjs bsenturk
// -----------------------------------------------------------------------------

import soap from "soap";
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), ".env") });

const USER = process.argv[2] ?? "bsenturk";
const V1_WSDL =
  process.env.CANIAS_WSDL_V1 ||
  "http://192.168.22.16:8080/CaniasWS-v1/services/iasWebService?wsdl";

const {
  CANIAS_CLIENT = "00", CANIAS_LANGUAGE = "T",
  CANIAS_DBSERVER = "CANIAS", CANIAS_DBNAME = "AKTUEL",
  CANIAS_APPSERVER = "192.168.22.16:27499",
  WMS_USER, WMS_PASSWORD,
  T_COMPANY = "01", T_PLANT = "100",
} = process.env;

function val(x) {
  if (x === null || x === undefined) return x;
  if (Array.isArray(x)) return x.map(val);
  if (typeof x === "object") {
    if ("$value" in x) return x.$value;
    const out = {};
    for (const [k, v] of Object.entries(x)) {
      if (k === "attributes") continue;
      out[k] = val(v);
    }
    return Object.keys(out).length ? out : "";
  }
  return x;
}
const esc = (s) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const xml = (o) =>
  `<PARAMETERS>${Object.entries(o).map(([k, v]) => `<${k}>${esc(v)}</${k}>`).join("")}</PARAMETERS>`;

function flatten(input) {
  const out = {};
  if (!input || typeof input !== "object") return out;
  for (const [key, value] of Object.entries(input)) {
    if (Array.isArray(value)) {
      for (const el of value) {
        if (el && typeof el === "object") Object.assign(out, el["#item"] ?? el);
        else if (out[key] === undefined) out[key] = el;
      }
    } else if (value && typeof value === "object") {
      Object.assign(out, value["#item"] ?? value);
    } else out[key] = value;
  }
  return out;
}
function unwrap(t) {
  if (!t) return [];
  if (Array.isArray(t)) return t.map(flatten);
  if (typeof t === "object") return "ROW" in t ? unwrap(t.ROW) : [flatten(t)];
  return [];
}

/* ESKİ — 15 parametre (P öneki) */
const ESKI = {
  PCOMPANY: T_COMPANY, PPLANT: T_PLANT, PWORKER: USER, PSTATUS: "0",
  PWAREHOUSE: "%", PORDERNUM: "%", PORDERTYPE: "%", PFRONTAREA: "%", PMATERIAL: "%",
  PISPICK: 1, PSTARTDATE: "01.01.1975", PENDDATE: "01.01.2100",
  PISDELETE: 0, PISSTARTED: 1, PLISTING: 0,
};

/* YENİ — 10 parametre (PS/PI/PD öneki) */
const YENI = {
  PSCOMPANY: T_COMPANY, PSPLANT: T_PLANT, PSWORKER: USER,
  PISTATUS: 0, PIISPICK: 1,
  PDSTARTDATE: "01.01.1975", PDENDDATE: "01.01.2100",
  PIISDELETE: 0, PIISSTARTED: 1, PIORDER: 0,
};

const client = await soap.createClientAsync(V1_WSDL, { timeout: 20000 });
const [lres] = await client.loginAsync({
  p_strClient: CANIAS_CLIENT, p_strLanguage: CANIAS_LANGUAGE,
  p_strDBName: CANIAS_DBNAME, p_strDBServer: CANIAS_DBSERVER,
  p_strAppServer: CANIAS_APPSERVER,
  p_strUserName: WMS_USER, p_strPassword: WMS_PASSWORD,
});
const sessionId = val(lres?.loginReturn ?? lres);
if (!sessionId || typeof sessionId !== "string") {
  console.error("✗ Login başarısız:", sessionId);
  process.exit(1);
}
console.log("✓ Login OK\n");

async function dene(etiket, params) {
  let raw = "";
  try {
    const [res] = await client.callIASServiceAsync({
      sessionid: sessionId, serviceid: "MZYListingPick",
      args: xml(params), returntype: "JSON", permanent: false,
    });
    const o = val(res?.callIASServiceReturn ?? res);
    raw = typeof o === "string" ? o : JSON.stringify(o ?? "");
  } catch (e) {
    raw = "HATA: " + (e?.message || e).toString().slice(0, 100);
  }

  let satir = 0;
  let mesaj = "";
  try {
    const d = JSON.parse(raw);
    satir = unwrap(d.TBLPOLIST).length;
    if (d.TBLMESSAGE) {
      mesaj = unwrap(d.TBLMESSAGE).map((m) => m.TEXT || m.VALUE || "").filter(Boolean).join(" | ");
    }
  } catch { /* yok */ }

  console.log("─".repeat(78));
  console.log(`${etiket}  (${Object.keys(params).length} parametre)`);
  console.log(`  ${xml(params).slice(0, 150)}...`);
  console.log(`  SONUÇ: ${satir > 0 ? `✓✓ ${satir} emir` : "· boş"}`);
  if (mesaj) console.log(`  mesaj: ${mesaj}`);
  if (raw.startsWith("HATA")) console.log(`  ${raw}`);
  return satir;
}

const a = await dene("A) ESKİ parametreler (PCOMPANY, PWORKER, PISPICK, PLISTING...)", ESKI);
const b = await dene("B) YENİ parametreler (PSCOMPANY, PSWORKER, PIISPICK, PIORDER...)", YENI);

/* Emirler tükenmiş olabilir mi? ISSTARTED=0 ile de bak */
const c = await dene("C) YENİ + PIISSTARTED=0", { ...YENI, PIISSTARTED: 0 });
const d = await dene("D) YENİ + PISTATUS=1 (kısmi açık)", { ...YENI, PISTATUS: 1 });

console.log("\n" + "═".repeat(78));
console.log("DEĞERLENDİRME");
console.log("═".repeat(78));
if (a > 0 && b === 0) {
  console.log("→ Eski parametreler çalışıyor, yenisi çalışmıyor.");
  console.log("  Servis henüz yeni parametre adlarına GÜNCELLENMEMİŞ.");
  console.log("  Bora'ya sor: dokümanı güncelledin ama servisi deploy ettin mi?");
} else if (a === 0 && b === 0 && c === 0 && d === 0) {
  console.log("→ Hiçbiri veri vermiyor. Parametre meselesi değil.");
  console.log("  Emirler EnterPick sonrası durum değiştirmiş olabilir (ISSTARTED/STATUS).");
  console.log("  Bora'ya sor: emirleri sıfırlayabilir misin?");
} else if (b > 0) {
  console.log("→ Yeni parametreler çalışıyor. Sorun yok.");
} else {
  console.log("→ Karışık sonuç, yukarıdaki satırlara bak.");
}

await client.logoutAsync({ p_strSessionId: sessionId }).catch(() => {});
