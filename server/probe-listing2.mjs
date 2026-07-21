// -----------------------------------------------------------------------------
// MZYListingPick — Bora'nın kurallarıyla tam alan listesi
// -----------------------------------------------------------------------------
// Bora: "boş string ise % gönder", "integer 0", "tarih min 01.01.1975 / max 01.01.2100"
// Bu script emir BAŞLIĞI tablosundaki TÜM alanları gönderir (eksik integer kalmasın).
//
// Çalıştırma:  node probe-listing2.mjs
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

// Emir başlığı tablosu — Bora'nın alan listesi, tipleriyle
// S=string("%"), I=integer(0), D=tarih
const FIELDS = [
  ["CLIENT", "S"],
  ["COMPANY", "S"],
  ["PLANT", "S"],
  ["WAREHOUSE", "S"],
  ["ORDERNUM", "S"],
  ["STATUS", "I"],
  ["ISPICK", "I"],
  ["CREATEDBY", "S"],
  ["CREATEDAT", "D"],
  ["CHANGEDBY", "S"],
  ["CHANGEDAT", "D"],
  ["WORKER", "S"],
  ["STEXT", "S"],
  ["ISDELETE", "I"],
  ["TRANSACT", "S"],
  ["ISSTARTED", "I"],
  ["ISDIRECTDELIVER", "I"],
  ["STARTDATE", "D"],
  ["PRIORITY", "I"],
];

// Sabit değerler
const FIXED = { COMPANY: T_COMPANY, PLANT: T_PLANT, ISPICK: 1 };

function buildParams({ dateMode = "minmax" } = {}) {
  const out = {};
  for (const [name, type] of FIELDS) {
    if (name in FIXED) {
      out[name] = FIXED[name];
    } else if (type === "S") {
      out[name] = "%"; // Bora: boş string yerine %
    } else if (type === "I") {
      out[name] = 0;
    } else {
      out[name] = dateMode === "minmax" ? (name.includes("START") ? DMIN : DMAX) : DMIN;
    }
  }
  return out;
}

const xml = (obj, pre = "") =>
  `<PARAMETERS>${Object.entries(obj)
    .map(([k, v]) => `<${pre}${k}>${esc(v)}</${pre}${k}>`)
    .join("")}</PARAMETERS>`;

const base = buildParams();

const CASES = [
  ["1 tam liste, öneksiz", xml(base)],
  ["2 tam liste, PR öneki", xml(base, "PR")],
  ["3 tam liste, P öneki", xml(base, "P")],
  // integer'lar da % olsun mu?
  [
    "4 tam liste, hepsi %",
    xml(Object.fromEntries(FIELDS.map(([n]) => [n, n in FIXED ? FIXED[n] : "%"]))),
  ],
  // STATUS/ISPICK dışında hiç integer yok
  [
    "5 sadece string'ler %",
    xml(
      Object.fromEntries(
        FIELDS.filter(([, t]) => t === "S").map(([n]) => [n, n in FIXED ? FIXED[n] : "%"])
      )
    ),
  ],
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
console.log(`Firma=${T_COMPANY} Tesis=${T_PLANT} ISPICK=1, boş string='%'\n`);
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
  if (err) console.log(`  hata    : ${err.slice(0, 150)}`);
  if (rows !== null) console.log(`  satır   : ${rows}`);
  if (msg) console.log(`  messages: ${String(msg).replace(/\s+/g, " ").slice(0, 200)}`);
  if (win) console.log(`  ÖRNEK   : ${String(resp).replace(/\s+/g, " ").slice(0, 900)}`);
}

console.log("\n" + "═".repeat(74));
await client.logoutAsync({ SessionId: lr.SessionId }).catch(() => {});
