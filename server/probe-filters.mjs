// -----------------------------------------------------------------------------
// MZYListingPick — hangi filtre listeyi boşaltıyor?
// -----------------------------------------------------------------------------
// Servis artık HATASIZ çalışıyor (SYSStatus 0) ama TBLPOLIST boş.
// Demek ki filtrelerden biri her şeyi eliyor. Teker teker gevşetip bakıyoruz.
//
// Çalıştırma:  node probe-filters.mjs bsenturk
// -----------------------------------------------------------------------------

import soap from "soap";
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), ".env") });

const USER = process.argv[2] ?? "bsenturk";
const {
  CANIAS_WSDL_URL, WMS_USER, WMS_PASSWORD, CANIAS_CLIENT,
  CANIAS_LANGUAGE = "T", CANIAS_DBSERVER, CANIAS_DBNAME, CANIAS_APPSERVER,
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

/** Bora'nın önerdiği taban değerler */
const BASE = {
  PCOMPANY: T_COMPANY,
  PPLANT: T_PLANT,
  PWORKER: USER,
  PSTATUS: "0",
  PWAREHOUSE: "%",
  PORDERNUM: "%",
  PORDERTYPE: "%",
  PFRONTAREA: "%",
  PMATERIAL: "%",
  PISPICK: 1,
  PSTARTDATE: "01.01.1975",
  PENDDATE: "01.01.2100",
  PISDELETE: 0,
  PISSTARTED: 1,
  PLISTING: 0,
};

const xml = (o) =>
  `<PARAMETERS>${Object.entries(o).map(([k, v]) => `<${k}>${esc(v)}</${k}>`).join("")}</PARAMETERS>`;

/** Tek tek filtreleri gevşet */
const CASES = [
  ["00 taban (Bora'nın değerleri)", BASE],
  ["01 PWORKER = %", { ...BASE, PWORKER: "%" }],
  ["02 PISSTARTED = 0", { ...BASE, PISSTARTED: 0 }],
  ["03 PSTATUS = %", { ...BASE, PSTATUS: "%" }],
  ["04 PSTATUS = 1 (kısmi açık)", { ...BASE, PSTATUS: "1" }],
  ["05 PSTATUS = 2 (kapalı)", { ...BASE, PSTATUS: "2" }],
  ["06 PLISTING = 1", { ...BASE, PLISTING: 1 }],
  ["07 PISPICK = 0 (yerleştirme)", { ...BASE, PISPICK: 0 }],
  ["08 PISDELETE = 1", { ...BASE, PISDELETE: 1 }],
  ["09 WORKER=% + ISSTARTED=0", { ...BASE, PWORKER: "%", PISSTARTED: 0 }],
  ["10 WORKER=% + STATUS=% + ISSTARTED=0", { ...BASE, PWORKER: "%", PSTATUS: "%", PISSTARTED: 0 }],
  ["11 EN GENİŞ (her şey serbest)", {
    ...BASE, PWORKER: "%", PSTATUS: "%", PISSTARTED: 0, PLISTING: 1, PISDELETE: 0,
  }],
  ["12 tesis de serbest", { ...BASE, PWORKER: "%", PSTATUS: "%", PISSTARTED: 0, PPLANT: "%" }],
  ["13 firma+tesis serbest", {
    ...BASE, PCOMPANY: "%", PPLANT: "%", PWORKER: "%", PSTATUS: "%", PISSTARTED: 0,
  }],
];

const client = await soap.createClientAsync(CANIAS_WSDL_URL, { timeout: 20000 });
const [loginRes] = await client.loginAsync({
  Client: CANIAS_CLIENT, Language: CANIAS_LANGUAGE, DBServer: CANIAS_DBSERVER,
  DBName: CANIAS_DBNAME, ApplicationServer: CANIAS_APPSERVER,
  Username: WMS_USER, Password: WMS_PASSWORD,
  Encrypted: false, Compression: false, LCheck: "", VKey: "",
});
const lr = val(loginRes?.loginReturn ?? loginRes) ?? {};
if (lr.Success !== true || !lr.SessionId) {
  console.error("✗ Login başarısız:", lr.ErrorMessage || "(sebep yok)");
  process.exit(1);
}
console.log("✓ Login OK\n");
console.log("Amaç: hangi filtre gevşetilince veri geliyor?\n");
console.log("═".repeat(74));

let winner = null;

for (const [label, params] of CASES) {
  let err = "", resp = "";
  try {
    const [res] = await client.callServiceAsync({
      SessionId: lr.SessionId,
      SecurityKey: lr.SecurityKey || "",
      ServiceId: "MZYListingPick",
      Parameters: xml(params),
      Compressed: false, Permanent: false, ExtraVariables: "", RequestId: 0,
    });
    const r = val(res?.callServiceReturn ?? res) ?? {};
    err = (r.SYSStatusError || "").split("\n")[0];
    resp = r.Response?.Value ?? "";
  } catch (e) {
    err = "SOAP: " + (e?.message || e);
  }

  let rows = 0;
  try {
    const t = JSON.parse(resp).TBLPOLIST;
    rows = Array.isArray(t) ? t.length : t ? 1 : 0;
  } catch { /* yok */ }

  const flag = err ? "✗ hata" : rows > 0 ? `✓✓ ${rows} SATIR` : "· boş";
  console.log(`${flag.padEnd(14)} ${label}`);
  if (err) console.log(`               ${err.slice(0, 110)}`);

  if (rows > 0 && !winner) {
    winner = { label, resp };
  }
}

console.log("\n" + "═".repeat(74));
if (winner) {
  console.log("İLK VERİ GELEN:", winner.label);
  console.log("\nÖRNEK SATIRLAR (alan adlarını buradan alacağız)");
  console.log("═".repeat(74));
  try {
    const t = JSON.parse(winner.resp).TBLPOLIST;
    const rows = Array.isArray(t) ? t : [t];
    console.log("Alanlar:", Object.keys(rows[0]).join(", "));
    console.log("\nİlk 3 satır:");
    console.log(JSON.stringify(rows.slice(0, 3), null, 2));
  } catch {
    console.log(winner.resp.slice(0, 2000));
  }
} else {
  console.log("Hiçbir kombinasyonda veri gelmedi.");
  console.log("→ Sistemde bu firma/tesis için hiç toplama emri olmayabilir.");
  console.log("→ Bora'dan CANIAS ekranında gerçekten açık bir emir var mı teyit iste.");
}

await client.logoutAsync({ SessionId: lr.SessionId }).catch(() => {});
