// -----------------------------------------------------------------------------
// MZYEnterPick — dönen TÜM alan adlarını dök
// -----------------------------------------------------------------------------
// Barkod alanının adını arıyoruz. Şu an kodda BARCODE / BARCODENUM / EAN
// deneniyor ama hiçbiri tutmuyor. Tahmin etmek yerine yanıtın tamamına bakalım.
//
// ⚠ EnterPick veri yazar; emre daha önce girildiyse kalem dönmeyebilir.
//
// Çalıştırma:  node dump-enterpick.mjs 26935024 SO
// -----------------------------------------------------------------------------

import soap from "soap";
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), ".env") });

const ORDERNUM = process.argv[2] ?? "26935024";
const ORDERTYPE = process.argv[3] ?? "SO";

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

const [res] = await client.callIASServiceAsync({
  sessionid: sessionId, serviceid: "MZYEnterPick",
  args: xml({
    PSCOMPANY: T_COMPANY, PSPLANT: T_PLANT,
    PSORDERNUM: ORDERNUM, PSORDERTYPE: ORDERTYPE,
  }),
  returntype: "JSON", permanent: false,
});
const o = val(res?.callIASServiceReturn ?? res);
const raw = typeof o === "string" ? o : JSON.stringify(o ?? "");

console.log("═".repeat(72));
console.log(`MZYEnterPick — ${ORDERNUM} / ${ORDERTYPE}`);
console.log("═".repeat(72));

let d;
try {
  d = JSON.parse(raw);
} catch {
  console.log("(JSON çözülemedi)\n", raw.slice(0, 500));
  process.exit(0);
}

console.log(`Dönen tablolar: ${Object.keys(d).join(", ")}\n`);

for (const [tablo, icerik] of Object.entries(d)) {
  const rows = unwrap(icerik);
  console.log("─".repeat(72));
  console.log(`${tablo}: ${rows.length} satır`);
  if (!rows.length) continue;

  const alanlar = Object.keys(rows[0]);
  console.log(`\nTÜM ALANLAR (${alanlar.length}):`);
  console.log("  " + alanlar.join(", "));

  // Barkod olabilecek alanlar: adında BAR/EAN/GTIN geçen ya da
  // değeri uzun rakam dizisi olan (EAN13 gibi) alanlar
  console.log(`\nBARKOD ADAYLARI:`);
  const adaylar = new Set();
  for (const row of rows) {
    for (const [k, v] of Object.entries(row)) {
      const deger = String(v ?? "");
      const adUyuyor = /BAR|EAN|GTIN|KOD/i.test(k);
      const degerUyuyor = /^\d{8,14}$/.test(deger); // EAN benzeri
      if (adUyuyor || degerUyuyor) adaylar.add(`${k} = ${deger}`);
    }
  }
  if (adaylar.size) {
    [...adaylar].forEach((a) => console.log(`  ${a}`));
  } else {
    console.log("  (yok — bu tabloda barkod benzeri alan bulunamadı)");
  }

  console.log(`\nİLK SATIRIN TAMAMI:`);
  console.log(
    JSON.stringify(rows[0], null, 2).split("\n").map((l) => "  " + l).join("\n")
  );
}

await client.logoutAsync({ p_strSessionId: sessionId }).catch(() => {});
