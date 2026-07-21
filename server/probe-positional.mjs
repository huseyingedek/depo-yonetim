// -----------------------------------------------------------------------------
// MZYListingPick — SIRALI (isimsiz) parametre denemesi
// -----------------------------------------------------------------------------
// Dokümandaki yazım şekli bir sıralı liste sözdizimine benziyor:
//     PCOMPANY, PPLANT, PWORKER, ... PLISTING;
// Belki değerler isimle değil, bu SIRAYLA gönderiliyordur.
// Ayırıcı olarak ; , | ve satır sonu; ayrıca sıralı XML elemanları denenir.
//
// Çalıştırma:  node probe-positional.mjs bsenturk
// -----------------------------------------------------------------------------

import soap from "soap";
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), ".env") });

const USER = process.argv[2] ?? "bsenturk";

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

// Dokümandaki SIRA — değiştirmeyin
const ORDER = [
  ["PCOMPANY", T_COMPANY],
  ["PPLANT", T_PLANT],
  ["PWORKER", USER],
  ["PSTATUS", "0"],
  ["PWAREHOUSE", "%"],
  ["PORDERNUM", "%"],
  ["PORDERTYPE", "%"],
  ["PFRONTAREA", "%"],
  ["PMATERIAL", "%"],
  ["PISPICK", "1"],
  ["PSTARTDATE", "01.01.1975"],
  ["PENDDATE", "01.01.2100"],
  ["PISDELETE", "0"],
  ["PISSTARTED", "1"],
  ["PLISTING", "0"],
];

const values = ORDER.map(([, v]) => v);

const CASES = [
  ["A ; ile ayrık (XML içinde)", `<PARAMETERS>${esc(values.join(";"))}</PARAMETERS>`],
  ["B , ile ayrık", `<PARAMETERS>${esc(values.join(","))}</PARAMETERS>`],
  ["C | ile ayrık", `<PARAMETERS>${esc(values.join("|"))}</PARAMETERS>`],
  ["D satır sonu ile", `<PARAMETERS>${esc(values.join("\n"))}</PARAMETERS>`],
  ["E <P> sırayla", `<PARAMETERS>${values.map((v) => `<P>${esc(v)}</P>`).join("")}</PARAMETERS>`],
  [
    "F <PARAMETER> sırayla",
    `<PARAMETERS>${values.map((v) => `<PARAMETER>${esc(v)}</PARAMETER>`).join("")}</PARAMETERS>`,
  ],
  [
    "G <P1..P15> numaralı",
    `<PARAMETERS>${values.map((v, i) => `<P${i + 1}>${esc(v)}</P${i + 1}>`).join("")}</PARAMETERS>`,
  ],
  [
    "H isimli + XML bildirimi",
    `<?xml version="1.0" encoding="UTF-8"?><PARAMETERS>${ORDER.map(
      ([k, v]) => `<${k}>${esc(v)}</${k}>`
    ).join("")}</PARAMETERS>`,
  ],
  [
    "I isimli, CDATA değerli",
    `<PARAMETERS>${ORDER.map(([k, v]) => `<${k}><![CDATA[${v}]]></${k}>`).join("")}</PARAMETERS>`,
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
console.log("✓ Login OK —", ORDER.length, "parametre, dokümandaki sırayla\n");
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

  // Hata metni değişti mi? (integer hatası = hâlâ bağlanmıyor)
  const same = /invalid input syntax for type integer/i.test(err);
  const flag = rows > 0 ? "✓✓ VERİ GELDİ" : err ? (same ? "✗" : "★ FARKLI HATA") : "· hatasız ama boş";

  console.log(`\n${flag}  ${label}`);
  if (err) console.log(`  hata : ${err.slice(0, 150)}`);
  if (rows !== null) console.log(`  satır: ${rows}`);
  if (msg) console.log(`  msg  : ${String(msg).replace(/\s+/g, " ").slice(0, 200)}`);
  if (rows > 0) console.log(`  ÖRNEK: ${String(resp).replace(/\s+/g, " ").slice(0, 900)}`);
}

console.log("\n" + "═".repeat(74));
await client.logoutAsync({ SessionId: lr.SessionId }).catch(() => {});
