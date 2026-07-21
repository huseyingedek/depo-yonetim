// -----------------------------------------------------------------------------
// MZYListingPick — dokümanla karşılaştır, gönder, HAM yanıtı bas
// -----------------------------------------------------------------------------
// 1) Dokümandaki 15 parametre ile bizim gönderdiklerimizi karşılaştırır
//    (eksik / fazla / sıra farkı)
// 2) Tam olarak ne gönderdiğimizi gösterir
// 3) Yanıtın HAM halini kırpmadan basar
//
// Çalıştırma:  node check-listing.mjs bsenturk
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

/* --- 1) DOKÜMAN: ad, tip, olması gereken değer --- */
const DOC = [
  ["PCOMPANY", "STRING", T_COMPANY],
  ["PPLANT", "STRING", T_PLANT],
  ["PWORKER", "STRING", USER],
  ["PSTATUS", "STRING", "0"],
  ["PWAREHOUSE", "STRING", "%"],
  ["PORDERNUM", "STRING", "%"],
  ["PORDERTYPE", "STRING", "%"],
  ["PFRONTAREA", "STRING", "%"],
  ["PMATERIAL", "STRING", "%"],
  ["PISPICK", "INTEGER", 1],
  ["PSTARTDATE", "DATETIME", "01.01.1975"],
  ["PENDDATE", "DATETIME", "01.01.2100"],
  ["PISDELETE", "INTEGER", 0],
  ["PISSTARTED", "INTEGER", 1],
  ["PLISTING", "INTEGER", 0],
];

/* --- 2) UYGULAMANIN gönderdiği (src/api/client.ts ile birebir aynı) --- */
const SENT = {
  PSCOMPANY: T_COMPANY, PSPLANT: T_PLANT, PSWORKER: USER,
    PISTATUS: 0, PIISPICK: 1,
    PDSTARTDATE: "01.01.1975", PDENDDATE: "01.01.2100",
    PIISDELETE: 0, PIISSTARTED: 1, PIORDER: 0,
};

console.log("═".repeat(74));
console.log("PARAMETRE KARŞILAŞTIRMA");
console.log("═".repeat(74));
console.log("#   ad             tip        beklenen      gönderilen    durum");
console.log("-".repeat(74));

const docNames = DOC.map(([n]) => n);
const sentNames = Object.keys(SENT);
let problems = 0;

DOC.forEach(([name, type, expected], i) => {
  const has = name in SENT;
  const actual = has ? SENT[name] : "—";
  const ok = has && String(actual) === String(expected);
  if (!ok) problems++;
  console.log(
    `${String(i + 1).padEnd(3)} ${name.padEnd(14)} ${type.padEnd(10)} ` +
      `${String(expected).padEnd(13)} ${String(actual).padEnd(13)} ${ok ? "✓" : has ? "≠ değer" : "✗ EKSİK"}`
  );
});

const extra = sentNames.filter((n) => !docNames.includes(n));
if (extra.length) {
  problems += extra.length;
  console.log("\nFAZLADAN gönderilenler:", extra.join(", "));
}

const orderOk = JSON.stringify(sentNames) === JSON.stringify(docNames);
console.log(`\nSıra dokümanla aynı mı : ${orderOk ? "✓ evet" : "✗ hayır"}`);
console.log(`Toplam sorun           : ${problems === 0 ? "yok — liste tam" : problems}`);

/* --- 3) Gönder --- */
const xml = `<PARAMETERS>${Object.entries(SENT)
  .map(([k, v]) => `<${k}>${esc(v)}</${k}>`)
  .join("")}</PARAMETERS>`;

console.log("\n" + "═".repeat(74));
console.log("GÖNDERİLEN Parameters");
console.log("═".repeat(74));
console.log(xml);

const client = await soap.createClientAsync(CANIAS_WSDL_URL, { timeout: 20000 });
const [loginRes] = await client.loginAsync({
  Client: CANIAS_CLIENT, Language: CANIAS_LANGUAGE, DBServer: CANIAS_DBSERVER,
  DBName: CANIAS_DBNAME, ApplicationServer: CANIAS_APPSERVER,
  Username: WMS_USER, Password: WMS_PASSWORD,
  Encrypted: false, Compression: false, LCheck: "", VKey: "",
});
const lr = val(loginRes?.loginReturn ?? loginRes) ?? {};
if (lr.Success !== true || !lr.SessionId) {
  console.error("\n✗ Login başarısız:", lr.ErrorMessage || "(sebep yok)");
  process.exit(1);
}

const [res] = await client.callServiceAsync({
  SessionId: lr.SessionId,
  SecurityKey: lr.SecurityKey || "",
  ServiceId: "MZYListingPick",
  Parameters: xml,
  Compressed: false,
  Permanent: false,
  ExtraVariables: "",
  RequestId: 0,
});

const r = val(res?.callServiceReturn ?? res) ?? {};

console.log("\n" + "═".repeat(74));
console.log("HAM YANIT (kırpılmadı)");
console.log("═".repeat(74));
console.log("SYSStatus      :", r.SYSStatus);
console.log("SYSStatusError :", r.SYSStatusError || "(yok)");
console.log("Messages       :", r.Messages?.Value || "(yok)");
console.log("Response       :", r.Response?.Value || "(yok)");

console.log("\n--- callServiceReturn tüm alanları ---");
console.log(JSON.stringify(r, null, 2).slice(0, 3000));

await client.logoutAsync({ SessionId: lr.SessionId }).catch(() => {});
