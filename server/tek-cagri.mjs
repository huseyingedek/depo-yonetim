// -----------------------------------------------------------------------------
// TEK ÇAĞRI — Bora trace'e bakarken karışıklık olmasın diye
// -----------------------------------------------------------------------------
// Bora: "trace hep raf okuttuğunu gösteriyor"
// Sebebi bizim test scriptimiz: tek çalıştırmada 20+ çağrı yapıyor ve
// çoğu MZYReadBarcodeSP (raf). Trace'te doğal olarak raf okumaları görünüyor.
//
// Bu script SADECE BİR çağrı yapar. Trace'te tek satır görünür.
//
// Çalıştırma:
//   node tek-cagri.mjs                                  → MZYReadBarcode, EAN
//   node tek-cagri.mjs MZYReadBarcode 8690723511208     → belirli servis+barkod
//   node tek-cagri.mjs MZYReadBarcodeSP D3$C1           → raf servisi
// -----------------------------------------------------------------------------

import soap from "soap";
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), ".env") });

const SERVIS = process.argv[2] ?? "MZYReadBarcode";
const BARKOD = process.argv[3] ?? "8690723511208";

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

// SP olan 3 parametre, diğeri 5 parametre alıyor
const params = SERVIS.toUpperCase().endsWith("SP")
  ? { PSCOMPANY: T_COMPANY, PSPLANT: T_PLANT, PSBARCODE: BARKOD }
  : {
      PSCOMPANY: T_COMPANY, PSPLANT: T_PLANT,
      PSWAREHOUSE: "", PSSTOCKPLACE: "", PSBARCODE: BARKOD,
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

const saat = new Date().toLocaleTimeString("tr-TR");

console.log("═".repeat(70));
console.log(`TEK ÇAĞRI  —  ${saat}`);
console.log("═".repeat(70));
console.log(`  servis : ${SERVIS}`);
console.log(`  barkod : ${BARKOD}`);
console.log(`  giden  : ${xml(params)}`);
console.log("─".repeat(70));

const [res] = await client.callIASServiceAsync({
  sessionid: sessionId, serviceid: SERVIS,
  args: xml(params), returntype: "JSON", permanent: false,
});
const o = val(res?.callIASServiceReturn ?? res);
const raw = typeof o === "string" ? o : JSON.stringify(o ?? "");

console.log("  DÖNEN:");
console.log(raw);
console.log("═".repeat(70));
console.log(`  Bora'ya: saat ${saat}, servis ${SERVIS}, TEK çağrı yapıldı.`);

await client.logoutAsync({ p_strSessionId: sessionId }).catch(() => {});
