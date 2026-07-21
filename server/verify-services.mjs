// -----------------------------------------------------------------------------
// Resmi parametre dokümanıyla doğrulama
// -----------------------------------------------------------------------------
// Çalıştırma:  node verify-services.mjs bsenturk '2Akl00*'
// -----------------------------------------------------------------------------

import soap from "soap";
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), ".env") });

const USER = process.argv[2] ?? "";
const PASS = process.argv[3] ?? "";

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

const xml = (o) =>
  `<PARAMETERS>${Object.entries(o)
    .map(([k, v]) => `<${k}>${esc(v)}</${k}>`)
    .join("")}</PARAMETERS>`;

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

async function run(serviceId, params) {
  console.log("─".repeat(74));
  console.log("▶", serviceId);
  try {
    const [res] = await client.callServiceAsync({
      SessionId: lr.SessionId,
      SecurityKey: lr.SecurityKey || "",
      ServiceId: serviceId,
      Parameters: xml(params),
      Compressed: false,
      Permanent: false,
      ExtraVariables: "",
      RequestId: 0,
    });
    const r = val(res?.callServiceReturn ?? res) ?? {};
    const err = (r.SYSStatusError || "").split("\n")[0];
    const msg = r.Messages?.Value ?? "";
    const resp = r.Response?.Value ?? "";

    if (err) {
      console.log("  ✗ hata:", err.slice(0, 160));
    } else {
      console.log("  ✓ hatasız");
    }
    if (msg) console.log("  messages:", String(msg).replace(/\s+/g, " ").slice(0, 250));

    try {
      const d = JSON.parse(resp);
      for (const [table, rows] of Object.entries(d)) {
        const n = Array.isArray(rows) ? rows.length : rows ? 1 : 0;
        console.log(`  ${table}: ${n} satır`);
        const first = Array.isArray(rows) ? rows[0] : rows;
        if (first && typeof first === "object") {
          console.log("  alanlar:", Object.keys(first).join(", "));
          console.log("  ilk satır:", JSON.stringify(first).slice(0, 600));
        }
      }
    } catch {
      console.log("  response:", String(resp).slice(0, 300));
    }
    return resp;
  } catch (e) {
    console.log("  ✗ istisna:", e?.message || e);
    return "";
  }
}

// 1) Kullanıcı kontrol
if (USER) {
  await run("MZYCheckUser", { PSUSER: USER, PSPASSWORD: PASS });
}

// 2) Toplama emri listesi — resmi parametreler
const listing = await run("MZYListingPick", {
  PCOMPANY: T_COMPANY,
  PPLANT: T_PLANT,
  PWORKER: USER,
  PSTATUS: "0",
  PWAREHOUSE: "%",
  PORDERNUM: "%",
  PORDERTYPE: "%",
  PFRONTAREA: "%",
  PMATERIAL: "%",
  PISPICK: "1",
  PSTARTDATE: "01.01.1975",
  PENDDATE: "01.01.2100",
  PISDELETE: 0,
  PISSTARTED: 1,
  PLISTING: 0,
});

// 3) İlk emir bulunduysa detayına gir
try {
  const rows = JSON.parse(listing).TBLPOLIST;
  const first = Array.isArray(rows) ? rows[0] : rows;
  if (first) {
    const on = first.ORDERNUM ?? "";
    const ot = first.ORDERTYPE ?? first.DOCTYPE ?? "";
    console.log(`\n(ilk emir: ${on} / tip ${ot})`);
    await run("MZYEnterPick", {
      PSCOMPANY: T_COMPANY,
      PSPLANT: T_PLANT,
      PSORDERNUM: on,
      PSORDERTYPE: ot,
    });
  }
} catch {
  /* liste boş */
}

// 4) Seçim listeleri
await run("GetCompany", {});
await run("GetPlant", { PSCOMPANY: T_COMPANY });
await run("GetWarehouse", { PSCOMPANY: T_COMPANY, PSPLANT: T_PLANT });

console.log("\n" + "═".repeat(74));
await client.logoutAsync({ SessionId: lr.SessionId }).catch(() => {});
