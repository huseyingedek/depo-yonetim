// -----------------------------------------------------------------------------
// MZYListingPick — Bora: "tüm parametreleri gönder, eksik gönderme"
// -----------------------------------------------------------------------------
// Bora'nın verdiği İKİ tablo var:
//   T1 = emir başlığı (19 alan)   → daha önce denendi, olmadı
//   T2 = emir kalemi  (42 alan)   → HİÇ denenmedi  ← asıl aday
// Bu script T2'yi ve T1+T2 birleşimini dener.
//
// Değer kuralları (Bora): string → "%", integer/quantity/percent → 0,
//                          tarih → 01.01.1975 / 01.01.2100
//
// Çalıştırma:  node probe-full.mjs
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

const DMIN = "01.01.1975";
const DMAX = "01.01.2100";

// S=string  I=integer  Q=quantity  P=percent  D=datetime
const T1 = [
  ["CLIENT", "S"], ["COMPANY", "S"], ["PLANT", "S"], ["WAREHOUSE", "S"],
  ["ORDERNUM", "S"], ["STATUS", "I"], ["ISPICK", "I"], ["CREATEDBY", "S"],
  ["CREATEDAT", "D"], ["CHANGEDBY", "S"], ["CHANGEDAT", "D"], ["WORKER", "S"],
  ["STEXT", "S"], ["ISDELETE", "I"], ["TRANSACT", "S"], ["ISSTARTED", "I"],
  ["ISDIRECTDELIVER", "I"], ["STARTDATE", "D"], ["PRIORITY", "I"],
];

const T2 = [
  ["CLIENT", "S"], ["COMPANY", "S"], ["PLANT", "S"], ["WAREHOUSEFA", "S"],
  ["ORDERNUM", "S"], ["FRONTAREA", "S"], ["MATERIAL", "S"], ["MTEXT", "S"],
  ["WORKER", "S"], ["EXSTQTY", "Q"], ["MOVEQTY", "Q"], ["UNIT", "S"],
  ["MOVEDATE", "D"], ["MOVEDQTY", "Q"], ["STATUS", "I"], ["ISPICK", "I"],
  ["TRANSAREA", "S"], ["WAREHOUSETA", "S"], ["DOCTYPE", "S"], ["DOCNUM", "S"],
  ["ITEMNUM", "I"], ["CREATEDBY", "S"], ["CREATEDAT", "D"], ["CHANGEDBY", "S"],
  ["CHANGEDAT", "D"], ["ITEMNO", "I"], ["ISVARIANT", "I"], ["VARIANTKEY", "S"],
  ["VOPTIONS", "S"], ["BATCHNUM", "S"], ["PRIORITY", "I"], ["SPECIALSTOCK", "S"],
  ["WEIGHTCAPACITY", "Q"], ["VOLUMECAPACITY", "Q"], ["SORTCONDITION", "S"],
  ["ISUSERUNCODE", "I"], ["RESERNUM", "S"], ["SOURCETYPE", "I"],
  ["ISTOLERANCE", "I"], ["LOWERTOL", "P"], ["UPPERTOL", "P"], ["CUSTOMER", "S"],
];

// Birleşim (aynı ad bir kez)
const UNION = (() => {
  const seen = new Map();
  for (const [n, t] of [...T1, ...T2]) if (!seen.has(n)) seen.set(n, t);
  return [...seen.entries()];
})();

const FIXED = { COMPANY: T_COMPANY, PLANT: T_PLANT, ISPICK: 1 };

function build(fields) {
  const out = {};
  for (const [name, type] of fields) {
    if (name in FIXED) out[name] = FIXED[name];
    else if (type === "S") out[name] = "%";
    else if (type === "D") out[name] = name.includes("START") ? DMIN : DMAX;
    else out[name] = 0; // I, Q, P
  }
  return out;
}

const xml = (obj, pre = "") =>
  `<PARAMETERS>${Object.entries(obj)
    .map(([k, v]) => `<${pre}${k}>${esc(v)}</${pre}${k}>`)
    .join("")}</PARAMETERS>`;

const CASES = [
  ["1 T2 kalem tablosu (42 alan)", xml(build(T2))],
  ["2 T1+T2 birleşim", xml(build(UNION))],
  ["3 T1+T2 birleşim, PR öneki", xml(build(UNION), "PR")],
  ["4 T2, tarihler hep min", xml({ ...build(T2), CREATEDAT: DMIN, CHANGEDAT: DMIN, MOVEDATE: DMIN })],
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
console.log("✓ Login OK");
console.log(`T1=${T1.length} alan, T2=${T2.length} alan, birleşim=${UNION.length} alan\n`);
console.log("═".repeat(74));

for (const [label, params] of CASES) {
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

  let rows = null;
  try {
    const t = JSON.parse(resp).TBLPOLIST;
    rows = Array.isArray(t) ? t.length : t ? 1 : 0;
  } catch {
    /* yok */
  }

  const win = !err && rows > 0;
  console.log(`\n${win ? "✓✓ VERİ GELDİ" : err ? "✗" : "· hatasız ama boş"}  ${label}`);
  if (err) console.log(`  hata    : ${err.slice(0, 160)}`);
  if (rows !== null) console.log(`  satır   : ${rows}`);
  if (msg) console.log(`  messages: ${String(msg).replace(/\s+/g, " ").slice(0, 220)}`);
  if (win) console.log(`  ÖRNEK   : ${String(resp).replace(/\s+/g, " ").slice(0, 1200)}`);
}

console.log("\n" + "═".repeat(74));
await client.logoutAsync({ SessionId: lr.SessionId }).catch(() => {});
