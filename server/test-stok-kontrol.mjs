// -----------------------------------------------------------------------------
// STOK KONTROL — Bora'nın yeni parametre listesi hangi servise ait?
// -----------------------------------------------------------------------------
// Bora'nın attığı liste:
//   PSCOMPANY, PSPLANT, PSWAREHOUSE, PSSTOCKPLACE,
//   PSBATCHNUM, PSBARCODE, PDCQUANTITY
//
// Servis adını söylemedi. En güçlü aday MZYReadBarcode: şu an ilk 5 parametreyi
// zaten alıyor, listede sadece PSBATCHNUM ve PDCQUANTITY fazladan.
//
// Bu script aynı parametreleri aday servislere gönderip hangisinin anlamlı
// cevap verdiğini bulur. Özellikle QUANTITY'nin dolu dönüp dönmediğine bakıyoruz
// — şimdiye kadar hep 0.0 geliyordu.
//
// Çalıştırma:  node test-stok-kontrol.mjs
// -----------------------------------------------------------------------------

import soap from "soap";
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), ".env") });

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
console.log("✓ Login OK\n");

/* Bora'nın listesi — UD009 / D3$C1 ile (o rafta 96 AD olduğunu biliyoruz) */
const PARAMS = {
  PSCOMPANY: T_COMPANY,
  PSPLANT: T_PLANT,
  PSWAREHOUSE: "D3",
  PSSTOCKPLACE: "C1",
  PSBATCHNUM: "*",
  PSBARCODE: "UD009$*$",
  PDCQUANTITY: "1",
};

const ADAYLAR = [
  "MZYReadBarcode",
  "MZYReadBarcodeSP",
  "MZYCheckStock",
  "MZYControlPick",
  "MZYSavePick",
];

console.log("Gönderilen parametreler (Bora'nın listesi):");
console.log("  " + xml(PARAMS) + "\n");
console.log("═".repeat(74));

for (const servis of ADAYLAR) {
  let raw = "";
  try {
    const [res] = await client.callIASServiceAsync({
      sessionid: sessionId, serviceid: servis,
      args: xml(PARAMS), returntype: "JSON", permanent: false,
    });
    const o = val(res?.callIASServiceReturn ?? res);
    raw = typeof o === "string" ? o : JSON.stringify(o ?? "");
  } catch (e) {
    raw = "HATA: " + (e?.message || e).toString().slice(0, 120);
  }

  console.log(`\n${servis}`);
  console.log("─".repeat(74));

  if (!raw) {
    console.log("  (boş yanıt — servis muhtemelen yok)");
    continue;
  }
  if (raw.startsWith("HATA")) {
    console.log("  " + raw);
    continue;
  }

  let d;
  try {
    d = JSON.parse(raw);
  } catch {
    console.log("  (JSON değil) " + raw.slice(0, 200));
    continue;
  }

  for (const [tablo, icerik] of Object.entries(d)) {
    const rows = unwrap(icerik);
    if (!rows.length) {
      console.log(`  ${tablo}: (boş)`);
      continue;
    }
    console.log(`  ${tablo}: ${rows.length} satır`);
    for (const row of rows) {
      console.log(
        "    " +
          Object.entries(row)
            .map(([k, v]) => `${k}=${v === "" ? "∅" : v}`)
            .join("  ")
      );
    }
  }
}

console.log("\n" + "═".repeat(74));
console.log("NE ARIYORUZ");
console.log("═".repeat(74));
console.log("  • QUANTITY / TOTAL dolu mu? (D3$C1'de 96 AD olmalı)");
console.log("  • PDCQUANTITY tip hatası veriyor mu? (PD öneki tarih demekti)");
console.log("  • Hangi servis bu parametreleri tanıyor?");

await client.logoutAsync({ p_strSessionId: sessionId }).catch(() => {});
