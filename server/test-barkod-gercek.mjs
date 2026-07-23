// -----------------------------------------------------------------------------
// GERÇEK BARKODLAR — Bora'nın verdiği örneklerle iki servisi de test et
// -----------------------------------------------------------------------------
// Bora (WhatsApp 14:47-14:49):
//   raf barkodu   : D3$C1                → MZYReadBarcodeSP
//   ürün barkodu  : UD009$*$             → MZYReadBarcode
//   veya EAN      : 8690723511208 / ...239 / ...246 / ...277
//   "bunlardan hangisini okutursan okut, hepsi UD009 nolu malzemeyi bulmanı sağlar"
//   "bir ürünün tek barkodu yok"
//
// Amaç: başarılı okumada hangi ALANLARIN döndüğünü görmek.
// Şimdiye kadar hep RETVALUE=0 (başarısız) görmüştük; başarılı cevabın
// biçimini bilmeden ekran akışı yazılamaz.
//
// Çalıştırma:  node test-barkod-gercek.mjs
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
console.log("✓ Login OK");
console.log(`  .env değerleri → T_COMPANY="${T_COMPANY}"  T_PLANT="${T_PLANT}"\n`);

/**
 * @param ekstra MZYReadBarcode 5 parametre alıyor (Bora, güncel Excel):
 *   PSCOMPANY, PSPLANT, PSWAREHOUSE, PSSTOCKPLACE, PSBARCODE
 *   Depo ve stok yeri "hafızadaki" değerler — yani önce okutulan raf. Boş olabilir.
 *   MZYReadBarcodeSP ise 3 parametre: PSCOMPANY, PSPLANT, PSBARCODE
 */
async function cagir(serviceid, barkod, ekstra = {}) {
  const params = {
    PSCOMPANY: T_COMPANY, PSPLANT: T_PLANT, ...ekstra, PSBARCODE: barkod,
  };
  // Bora "tesisi boş gönderiyorsun" dedi. Tartışmak yerine gönderileni basıyoruz.
  console.log(`      GİDEN → ${xml(params)}`);
  try {
    const [res] = await client.callIASServiceAsync({
      sessionid: sessionId, serviceid,
      args: xml(params), returntype: "JSON", permanent: false,
    });
    const o = val(res?.callIASServiceReturn ?? res);
    return typeof o === "string" ? o : JSON.stringify(o ?? "");
  } catch (e) {
    return "HATA: " + (e?.message || String(e)).slice(0, 160);
  }
}

/** Yanıtı tam dök — hangi alan ne, onu öğreniyoruz */
function dok(raw) {
  if (raw.startsWith("HATA")) {
    console.log(`    ${raw}`);
    return;
  }
  let d;
  try {
    d = JSON.parse(raw);
  } catch {
    console.log(`    (JSON çözülemedi) ${raw.slice(0, 200)}`);
    return;
  }
  for (const [ad, icerik] of Object.entries(d)) {
    const rows = unwrap(icerik);
    if (!rows.length) {
      console.log(`    ${ad}: (boş)`);
      continue;
    }
    console.log(`    ${ad}: ${rows.length} satır`);
    for (const row of rows) {
      const ozet = Object.entries(row)
        .map(([k, v]) => `${k}=${v === "" ? "∅" : v}`)
        .join("  ");
      console.log(`      ${ozet}`);
    }
  }
}

/* ---------------------------------------------------------------------------
   1) RAF BARKODU → MZYReadBarcodeSP
   --------------------------------------------------------------------------- */
console.log("═".repeat(78));
console.log("1) RAF BARKODU — MZYReadBarcodeSP");
console.log("═".repeat(78));

// D3$C1 gerçek örnek. Yanına bozuk varyantlar koyuyoruz: servis geçersiz
// barkodu reddediyor mu, yoksa her şeyi kabul mü ediyor? Depocu yanlış raf
// okuttuğunda uyarabilmemiz buna bağlı.
const RAF_TESTLERI = [
  ["GERÇEK", "D3$C1"],
  ["olmayan raf", "ZZ$YY99"],
  ["$ yok", "D3C1"],
  ["boş", ""],
];

for (const [etiket, bc] of RAF_TESTLERI) {
  console.log(`\n  [${etiket}] PSBARCODE="${bc}"`);
  dok(await cagir("MZYReadBarcodeSP", bc));
}

/* ---------------------------------------------------------------------------
   2) ÜRÜN BARKODU → MZYReadBarcode
   --------------------------------------------------------------------------- */
console.log("\n" + "═".repeat(78));
console.log("2) ÜRÜN BARKODU — MZYReadBarcode");
console.log("═".repeat(78));

// Bora: bir ürünün TEK barkodu yok. Hepsi UD009'a çıkmalı.
// Aynı malzemeye çıkıyorlarsa eşleştirmeyi barkoda göre değil,
// dönen MATERIAL değerine göre yapmalıyız.
const URUN_TESTLERI = [
  ["malzeme biçimi", "UD009$*$"],
  ["EAN 1", "8690723511208"],
  ["EAN 2", "8690723511239"],
  ["EAN 3", "8690723511246"],
  ["EAN 4", "8690723511277"],
  ["olmayan barkod", "0000000000000"],
];

// Raf bilgisi GÖNDERİLMEDEN — "boş olabilir" diyor, doğrulayalım
console.log("\n  --- raf bilgisi BOŞ ---");
for (const [etiket, bc] of URUN_TESTLERI) {
  console.log(`\n  [${etiket}] PSBARCODE="${bc}"`);
  dok(await cagir("MZYReadBarcode", bc, { PSWAREHOUSE: "", PSSTOCKPLACE: "" }));
}

// Raf bilgisi İLE — D3$C1 okutulmuş gibi. Asıl akış bu:
// depocu rafı okutur, sonra üründe raf bilgisi de gönderilir.
console.log("\n  --- raf bilgisi DOLU (D3 / C1) ---");
for (const [etiket, bc] of URUN_TESTLERI) {
  console.log(`\n  [${etiket}] PSBARCODE="${bc}"  +  D3/C1`);
  dok(await cagir("MZYReadBarcode", bc, { PSWAREHOUSE: "D3", PSSTOCKPLACE: "C1" }));
}

/* ---------------------------------------------------------------------------
   3) ÇAPRAZ — yanlış servise gönderirsek ne olur?
   --------------------------------------------------------------------------- */
console.log("\n" + "═".repeat(78));
console.log("3) ÇAPRAZ KONTROL");
console.log("═".repeat(78));
console.log("  Depocu raf yerine ürün okutursa ayırt edebilecek miyiz?");

console.log(`\n  raf barkodu → ÜRÜN servisine (MZYReadBarcode)`);
dok(await cagir("MZYReadBarcode", "D3$C1", { PSWAREHOUSE: "", PSSTOCKPLACE: "" }));

console.log(`\n  ürün barkodu → RAF servisine (MZYReadBarcodeSP)`);
dok(await cagir("MZYReadBarcodeSP", "8690723511208"));

await client.logoutAsync({ p_strSessionId: sessionId }).catch(() => {});
