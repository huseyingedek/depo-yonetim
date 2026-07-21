// -----------------------------------------------------------------------------
// v1 — MZYEnterPick (emre gir + kalem detayı)
// -----------------------------------------------------------------------------
// ⚠ DİKKAT: Bu servis VERİ YAZAR — emri kullanıcıya atar / başlatılmış işaretler.
//    Gerçek emirler üzerinde çalışıyoruz.
//
// Akış: listeden ilk emri al → MZYEnterPick çağır → kalem alanlarını dök
//
// Çalıştırma:
//   node test-v1-enter.mjs bsenturk                  → listeden ilk emri kullanır
//   node test-v1-enter.mjs bsenturk 00002215 MR      → belirli emir
// -----------------------------------------------------------------------------

import soap from "soap";
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), ".env") });

const USER = process.argv[2] ?? "bsenturk";
const ARG_ORDER = process.argv[3] ?? "";
const ARG_TYPE = process.argv[4] ?? "";

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

/** CANIAS'ın bozuk JSON'unu düzleştir (#item sarmalı) */
function flatten(input) {
  const out = {};
  if (!input || typeof input !== "object") return out;
  for (const [key, value] of Object.entries(input)) {
    if (Array.isArray(value)) {
      for (const el of value) {
        if (el && typeof el === "object") {
          Object.assign(out, el["#item"] ?? el);
        } else if (out[key] === undefined) {
          out[key] = el;
        }
      }
    } else if (value && typeof value === "object") {
      Object.assign(out, value["#item"] ?? value);
    } else {
      out[key] = value;
    }
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
  p_strClient: CANIAS_CLIENT,
  p_strLanguage: CANIAS_LANGUAGE,
  p_strDBName: CANIAS_DBNAME,
  p_strDBServer: CANIAS_DBSERVER,
  p_strAppServer: CANIAS_APPSERVER,
  p_strUserName: WMS_USER,
  p_strPassword: WMS_PASSWORD,
});
const sessionId = val(lres?.loginReturn ?? lres);
if (!sessionId || typeof sessionId !== "string") {
  console.error("✗ Login başarısız:", sessionId);
  process.exit(1);
}
console.log("✓ Login OK —", sessionId, "\n");

async function cagir(serviceid, params) {
  const [res] = await client.callIASServiceAsync({
    sessionid: sessionId,
    serviceid,
    args: xml(params),
    returntype: "JSON",
    permanent: false,
  });
  const out = val(res?.callIASServiceReturn ?? res);
  return typeof out === "string" ? out : JSON.stringify(out ?? "");
}

/* ---------- 1) Emri belirle ---------- */
let orderNum = ARG_ORDER;
let orderType = ARG_TYPE;

if (!orderNum) {
  console.log("═".repeat(78));
  console.log("1) Listeden emir alınıyor (MZYListingPick)");
  console.log("═".repeat(78));

  const listRaw = await cagir("MZYListingPick", {
    PSCOMPANY: T_COMPANY, PSPLANT: T_PLANT, PSWORKER: USER,
    PISTATUS: 0, PIISPICK: 1,
    PDSTARTDATE: "01.01.1975", PDENDDATE: "01.01.2100",
    PIISDELETE: 0, PIISSTARTED: 1, PIORDER: 0,
  });

  const rows = unwrap(JSON.parse(listRaw).TBLPOLIST);
  if (!rows.length) {
    console.log("✗ Liste boş — test edilecek emir yok.");
    process.exit(0);
  }
  console.log(`  ${rows.length} emir bulundu:`);
  rows.forEach((r, i) =>
    console.log(`    ${i + 1}. ${r.ORDERNUM} / ${r.ORDERTYPE}  (${r.STEXT || "-"})`)
  );
  orderNum = rows[0].ORDERNUM;
  orderType = rows[0].ORDERTYPE;
}

console.log(`\n  Seçilen emir: ${orderNum} / tip ${orderType}`);

/* ---------- 2) Emre gir ---------- */
console.log("\n" + "═".repeat(78));
console.log("2) MZYEnterPick — emre giriliyor  ⚠ VERİ YAZAR");
console.log("═".repeat(78));

const params = {
  PSCOMPANY: T_COMPANY,
  PSPLANT: T_PLANT,
  PSORDERNUM: orderNum,
  PSORDERTYPE: orderType,
};
console.log("  Gönderilen:", xml(params));

const raw = await cagir("MZYEnterPick", params);

console.log("\n  HAM YANIT:");
console.log("  " + String(raw).replace(/\n/g, "\n  ").slice(0, 2500));

/* ---------- 3) Çözümle ---------- */
console.log("\n" + "═".repeat(78));
console.log("3) Çözümleme");
console.log("═".repeat(78));

try {
  const d = JSON.parse(raw);
  for (const [tablo, icerik] of Object.entries(d)) {
    const rows = unwrap(icerik);
    console.log(`\n  ${tablo}: ${rows.length} satır`);
    if (!rows.length) continue;

    if (/MESSAGE/i.test(tablo)) {
      rows.forEach((m) => console.log(`    mesaj: ${m.TEXT || m.VALUE || JSON.stringify(m)}`));
      continue;
    }

    console.log(`    ALANLAR: ${Object.keys(rows[0]).join(", ")}`);
    console.log(`\n    İLK 2 SATIR:`);
    console.log(
      JSON.stringify(rows.slice(0, 2), null, 2)
        .split("\n")
        .map((l) => "    " + l)
        .join("\n")
    );
  }
} catch (e) {
  console.log("  (JSON çözülemedi)", e?.message || e);
}

console.log("\n" + "═".repeat(78));
console.log("Kalem alanlarını buradan eşleyeceğiz:");
console.log("  raf → FRONTAREA?   miktar → MOVEQTY?   toplanan → MOVEDQTY?");
console.log("  malzeme → MATERIAL?   parti → BATCHNUM?   birim → UNIT?");
console.log("═".repeat(78));

await client.logoutAsync({ p_strSessionId: sessionId }).catch(() => {});
