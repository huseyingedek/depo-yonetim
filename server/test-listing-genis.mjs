// -----------------------------------------------------------------------------
// MZYListingPick — servis ölü mü, yoksa sadece toplama emirleri mi bitti?
// -----------------------------------------------------------------------------
// A/B testi 4 durumda da boş döndü ama hepsi ISPICK=1 (toplama) idi.
// Burada filtreleri tek tek gevşetiyoruz. Herhangi biri satır döndürürse
// servis SAĞLAM demektir, sorun sadece bizim aradığımız emirlerde.
// Hiçbiri döndürmezse servis/veri tarafında daha büyük bir sorun var.
//
// Çalıştırma:  node test-listing-genis.mjs bsenturk
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

/** Bora'nın güncel 10 parametresi — taban */
const TABAN = {
  PSCOMPANY: T_COMPANY, PSPLANT: T_PLANT, PSWORKER: USER,
  PISTATUS: 0, PIISPICK: 1,
  PDSTARTDATE: "01.01.1975", PDENDDATE: "01.01.2100",
  PIISDELETE: 0, PIISSTARTED: 1, PIORDER: 0,
};

const DURUMLAR = [
  ["01 taban (toplama, bu kullanıcı)", TABAN],
  ["02 YERLEŞTİRME emirleri (PIISPICK=0)", { ...TABAN, PIISPICK: 0 }],
  ["03 kullanıcı serbest (PSWORKER=%)", { ...TABAN, PSWORKER: "%" }],
  ["04 yerleştirme + kullanıcı serbest", { ...TABAN, PIISPICK: 0, PSWORKER: "%" }],
  ["05 durum serbest (PISTATUS=2)", { ...TABAN, PISTATUS: 2 }],
  ["06 silinmişler dahil (PIISDELETE=1)", { ...TABAN, PIISDELETE: 1 }],
  ["07 başlatılmamışlar (PIISSTARTED=0) + kullanıcı serbest", { ...TABAN, PIISSTARTED: 0, PSWORKER: "%" }],
  ["08 tesis serbest (PSPLANT=%)", { ...TABAN, PSPLANT: "%", PSWORKER: "%" }],
  ["09 firma+tesis serbest", { ...TABAN, PSCOMPANY: "%", PSPLANT: "%", PSWORKER: "%" }],
  ["10 PIORDER=1", { ...TABAN, PIORDER: 1 }],
];

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
console.log(`Kullanıcı: ${USER}   Firma: ${T_COMPANY}   Tesis: ${T_PLANT}\n`);
console.log("═".repeat(78));

let kazanan = null;

for (const [etiket, params] of DURUMLAR) {
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
  let tablolar = "";
  try {
    const d = JSON.parse(raw);
    tablolar = Object.keys(d).join(", ");
    satir = unwrap(d.TBLPOLIST).length;
    if (d.TBLMESSAGE) {
      mesaj = unwrap(d.TBLMESSAGE).map((m) => m.TEXT || m.VALUE || "").filter(Boolean).join(" | ");
    }
  } catch { /* çözülemedi */ }

  const bayrak = satir > 0 ? `✓✓ ${satir} emir` : raw.startsWith("HATA") ? "✗ hata" : "·  boş";
  console.log(`${bayrak.padEnd(14)} ${etiket}`);
  if (tablolar) console.log(`               dönen tablolar: ${tablolar}`);
  if (mesaj) console.log(`               mesaj: ${mesaj.slice(0, 120)}`);
  if (raw.startsWith("HATA")) console.log(`               ${raw}`);

  if (satir > 0 && !kazanan) kazanan = { etiket, raw };
}

console.log("\n" + "═".repeat(78));
console.log("DEĞERLENDİRME");
console.log("═".repeat(78));

if (kazanan) {
  console.log(`→ Servis SAĞLAM. Veri gelen durum: ${kazanan.etiket}`);
  const rows = unwrap(JSON.parse(kazanan.raw).TBLPOLIST);
  console.log(`\nSatır sayısı: ${rows.length}`);
  console.log(`ALANLAR: ${Object.keys(rows[0]).join(", ")}`);
  console.log(`\nİLK 3 SATIR:`);
  rows.slice(0, 3).forEach((r) =>
    console.log(`  ${r.ORDERNUM} / ${r.ORDERTYPE}  ISPICK=${r.ISPICK}  STATUS=${r.STATUS}  ISSTARTED=${r.ISSTARTED}  WORKER=${r.WORKER}`)
  );
  console.log("\n→ Yani sorun servis değil, bizim aradığımız emirlerde.");
} else {
  console.log("→ Hiçbir filtre kombinasyonunda satır yok.");
  console.log("  Toplama da yerleştirme de boş, kullanıcı/tesis serbest bırakılsa bile.");
  console.log("  Bu artık filtre meselesi değil — Bora'ya sormak lazım.");
}

await client.logoutAsync({ p_strSessionId: sessionId }).catch(() => {});
