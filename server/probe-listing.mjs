// -----------------------------------------------------------------------------
// MZYListingPick — parametre adı hipotezi testi
// -----------------------------------------------------------------------------
// Yeni bilgi: Bora'nın alan listesinde adlar ÖNEKSİZ (COMPANY, PLANT, ISPICK...).
// Yani "PRUSERN" servisin İÇ değişkeni olabilir, parametre adı değil.
// Bu script MZYListingPick'i farklı adlandırma şemalarıyla dener.
//
// Çalıştırma:  node probe-listing.mjs
// -----------------------------------------------------------------------------

import soap from "soap";
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), ".env") });

const {
  CANIAS_WSDL_URL,
  WMS_USER,
  WMS_PASSWORD,
  CANIAS_CLIENT,
  CANIAS_LANGUAGE = "T",
  CANIAS_DBSERVER,
  CANIAS_DBNAME,
  CANIAS_APPSERVER,
  T_COMPANY = "01",
  T_PLANT = "100",
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
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const DATE_MIN = "01.01.1975";
const DATE_MAX = "01.01.2100";

// Bora: firma + tesis dolu, ISPICK=1, string "" , integer 0, tarih min/max
const BASE = {
  CLIENT: "",
  COMPANY: T_COMPANY,
  PLANT: T_PLANT,
  WAREHOUSE: "",
  ORDERNUM: "",
  STATUS: 0,
  ISPICK: 1,
  WORKER: "",
  ISDELETE: 0,
  ISSTARTED: 0,
  STARTDATE: DATE_MIN,
  ENDDATE: DATE_MAX,
};

const xml = (obj, transform = (k) => k) =>
  `<PARAMETERS>${Object.entries(obj)
    .map(([k, v]) => `<${transform(k)}>${esc(v)}</${transform(k)}>`)
    .join("")}</PARAMETERS>`;

const SCHEMES = [
  ["1 öneksiz (COMPANY)", xml(BASE)],
  ["2 PR öneki (PRCOMPANY)", xml(BASE, (k) => "PR" + k)],
  ["3 P öneki (PCOMPANY)", xml(BASE, (k) => "P" + k)],
  ["4 PS öneki (PSCOMPANY)", xml(BASE, (k) => "PS" + k)],
  ["5 IN_ öneki", xml(BASE, (k) => "IN_" + k)],
  ["6 küçük harf öneksiz", xml(BASE, (k) => k.toLowerCase())],
  ["7 sadece firma+tesis+ispick", xml({ COMPANY: T_COMPANY, PLANT: T_PLANT, ISPICK: 1 })],
];

const client = await soap.createClientAsync(CANIAS_WSDL_URL, { timeout: 20000 });
const [loginRes] = await client.loginAsync({
  Client: CANIAS_CLIENT,
  Language: CANIAS_LANGUAGE,
  DBServer: CANIAS_DBSERVER,
  DBName: CANIAS_DBNAME,
  ApplicationServer: CANIAS_APPSERVER,
  Username: WMS_USER,
  Password: WMS_PASSWORD,
  Encrypted: false,
  Compression: false,
  LCheck: "",
  VKey: "",
});
const lr = val(loginRes?.loginReturn ?? loginRes) ?? {};
if (lr.Success !== true || !lr.SessionId) {
  console.error("✗ Login başarısız:", lr.ErrorMessage || "(sebep yok)");
  process.exit(1);
}
console.log("✓ Login OK\n");
console.log(`Firma=${T_COMPANY}  Tesis=${T_PLANT}  ISPICK=1\n`);
console.log("═".repeat(74));

for (const [label, params] of SCHEMES) {
  let err = "";
  let resp = "";
  let msg = "";
  try {
    const [res] = await client.callServiceAsync({
      SessionId: lr.SessionId,
      SecurityKey: lr.SecurityKey || "",
      ServiceId: "MZYListingPick",
      Parameters: params,
      Compressed: false,
      Permanent: false,
      ExtraVariables: "",
      RequestId: 0,
    });
    const r = val(res?.callServiceReturn ?? res) ?? {};
    err = (r.SYSStatusError || "").split("\n")[0];
    resp = r.Response?.Value ?? "";
    msg = r.Messages?.Value ?? "";
  } catch (e) {
    err = "SOAP: " + (e?.message || e);
  }

  // Dolu bir tablo döndü mü?
  let rowCount = null;
  try {
    const d = JSON.parse(resp);
    const t = d.TBLPOLIST;
    rowCount = Array.isArray(t) ? t.length : t ? 1 : 0;
  } catch {
    /* parse edilemedi */
  }

  const win = !err && rowCount > 0;
  console.log(`\n${win ? "✓✓ VERİ GELDİ" : err ? "✗" : "· hatasız ama boş"}  ${label}`);
  if (err) console.log(`  hata    : ${err.slice(0, 150)}`);
  if (rowCount !== null) console.log(`  satır   : ${rowCount}`);
  if (msg) console.log(`  messages: ${String(msg).replace(/\s+/g, " ").slice(0, 200)}`);
  if (win) console.log(`  ÖRNEK   : ${String(resp).replace(/\s+/g, " ").slice(0, 800)}`);
}

console.log("\n" + "═".repeat(74));
await client.logoutAsync({ SessionId: lr.SessionId }).catch(() => {});
