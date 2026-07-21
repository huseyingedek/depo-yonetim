// -----------------------------------------------------------------------------
// MZYListingPick — TARİH BİÇİMİ taraması
// -----------------------------------------------------------------------------
// Bora: "tarihi yanlış yollamışsın, ikisi de 1975"
// Yani PDENDDATE=1.01.2100 karşı tarafa 1975 olarak geçiyor → aralık sıfır
// genişlikte kalıyor → liste boş dönüyor.
//
// İki şüpheli:
//   a) tek haneli gün  → "1.01.1975" yerine "01.01.1975" olmalı
//   b) 2100 yılı parse sınırını aşıyor → daha yakın bir üst tarih gerekli
//
// Her biçimi deneyip hangisinin emir döndürdüğünü buluyoruz.
//
// Çalıştırma:  node test-tarih.mjs bsenturk
// -----------------------------------------------------------------------------

import soap from "soap";
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), ".env") });

const USER = process.argv[2] ?? "bsenturk";
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

/** Tarih dışındaki her şey sabit — tek değişken tarih olsun */
const SABIT = {
  PSCOMPANY: T_COMPANY, PSPLANT: T_PLANT, PSWORKER: USER,
  PISTATUS: 0, PIISPICK: 1,
  PIISDELETE: 0, PIISSTARTED: 1, PIORDER: 0,
};

/** [etiket, başlangıç, bitiş] */
const TARIHLER = [
  ["01 mevcut hali (tek haneli gün, 2100)", "1.01.1975", "1.01.2100"],
  ["02 iki haneli gün, 2100", "01.01.1975", "01.01.2100"],
  ["03 iki haneli gün, 2030", "01.01.1975", "31.12.2030"],
  ["04 yakın aralık 2020-2030", "01.01.2020", "31.12.2030"],
  ["05 tire ayraç GG-AA-YYYY", "01-01-2020", "31-12-2030"],
  ["06 ISO YYYY-AA-GG", "2020-01-01", "2030-12-31"],
  ["07 ayraçsız YYYYAAGG", "20200101", "20301231"],
  ["08 ayraçsız GGAAYYYY", "01012020", "31122030"],
  ["09 slash GG/AA/YYYY", "01/01/2020", "31/12/2030"],
  ["10 bitiş = bugünden ileri (01.01.2027)", "01.01.2020", "01.01.2027"],
  ["11 her ikisi de % (joker)", "%", "%"],
  ["12 her ikisi de boş", "", ""],
];

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
console.log("Tarih dışındaki parametreler sabit:", JSON.stringify(SABIT));
console.log("\n" + "═".repeat(78));

let kazanan = null;

for (const [etiket, bas, bit] of TARIHLER) {
  const params = { ...SABIT, PDSTARTDATE: bas, PDENDDATE: bit };
  let raw = "";
  try {
    const [res] = await client.callIASServiceAsync({
      sessionid: sessionId, serviceid: "MZYListingPick",
      args: xml(params), returntype: "JSON", permanent: false,
    });
    const o = val(res?.callIASServiceReturn ?? res);
    raw = typeof o === "string" ? o : JSON.stringify(o ?? "");
  } catch (e) {
    raw = "HATA: " + (e?.message || e).toString().slice(0, 110);
  }

  let satir = 0;
  let mesaj = "";
  try {
    const d = JSON.parse(raw);
    satir = unwrap(d.TBLPOLIST).length;
    if (d.TBLMESSAGE) {
      mesaj = unwrap(d.TBLMESSAGE).map((m) => m.TEXT || m.VALUE || "").filter(Boolean).join(" | ");
    }
  } catch { /* çözülemedi */ }

  const bayrak = satir > 0 ? `✓✓ ${satir} emir` : raw.startsWith("HATA") ? "✗ hata" : "·  boş";
  console.log(`${bayrak.padEnd(14)} ${etiket}`);
  console.log(`               ${bas || "(boş)"}  →  ${bit || "(boş)"}`);
  if (mesaj) console.log(`               mesaj: ${mesaj.slice(0, 120)}`);
  if (raw.startsWith("HATA")) console.log(`               ${raw}`);

  if (satir > 0 && !kazanan) kazanan = { etiket, bas, bit, raw };
}

console.log("\n" + "═".repeat(78));
console.log("DEĞERLENDİRME");
console.log("═".repeat(78));

if (kazanan) {
  console.log(`→ ÇALIŞAN BİÇİM: ${kazanan.etiket}`);
  console.log(`   PDSTARTDATE="${kazanan.bas}"   PDENDDATE="${kazanan.bit}"`);
  const rows = unwrap(JSON.parse(kazanan.raw).TBLPOLIST);
  console.log(`\nSatır sayısı: ${rows.length}`);
  rows.slice(0, 5).forEach((r) =>
    console.log(`  ${r.ORDERNUM} / ${r.ORDERTYPE}  STATUS=${r.STATUS}  ISSTARTED=${r.ISSTARTED}  WORKER=${r.WORKER}`)
  );
  console.log("\n→ client.ts içindeki DATE_MIN / DATE_MAX bu değerlerle güncellenecek.");
} else {
  console.log("→ Hiçbir tarih biçimi emir döndürmedi.");
  console.log("  Sorun tarih değil ya da tarihle birlikte başka bir filtre de engelliyor.");
  console.log("  Bora'ya sor: senin tarafında PDSTARTDATE/PDENDDATE ne değer olarak görünüyor?");
}

await client.logoutAsync({ p_strSessionId: sessionId }).catch(() => {});
