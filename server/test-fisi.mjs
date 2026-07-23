// -----------------------------------------------------------------------------
// TEST FİŞİ — ekranda deneyecek raf + ürün barkodlarını üretir
// -----------------------------------------------------------------------------
// Bir emir için:
//   1. EnterPick    → kalemleri al
//   2. Suggest      → her kalemin RAF barkodunu bul (WAREHOUSE$STOCKPLACE)
//   3. ReadBarcode  → ÜRÜN barkodunu doğrula ("MALZEME$*$" biçimi)
//
// Sonuçta kopyala-yapıştır yapabileceğin bir liste basar.
//
// ⚠ EnterPick VERİ YAZAR. Emir zaten açıksa ikinci kez kalem dönmeyebilir.
//
// Çalıştırma:  node test-fisi.mjs bsenturk 26935024 SO
// -----------------------------------------------------------------------------

import soap from "soap";
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), ".env") });

const USER = process.argv[2] ?? "bsenturk";
const ORDERNUM = process.argv[3] ?? "26935024";
const ORDERTYPE = process.argv[4] ?? "SO";

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

async function cagir(serviceid, params) {
  try {
    const [res] = await client.callIASServiceAsync({
      sessionid: sessionId, serviceid,
      args: xml(params), returntype: "JSON", permanent: false,
    });
    const o = val(res?.callIASServiceReturn ?? res);
    const raw = typeof o === "string" ? o : JSON.stringify(o ?? "");
    const tablolar = {};
    try {
      for (const [ad, icerik] of Object.entries(JSON.parse(raw))) {
        tablolar[ad] = unwrap(icerik);
      }
    } catch { /* çözülemedi */ }
    return tablolar;
  } catch {
    return {};
  }
}

console.log("\n" + "═".repeat(74));
console.log(`TEST FİŞİ — emir ${ORDERNUM} / ${ORDERTYPE}`);
console.log("═".repeat(74));

/* 1) Kalemler */
const enter = await cagir("MZYEnterPick", {
  PSCOMPANY: T_COMPANY, PSPLANT: T_PLANT,
  PSORDERNUM: ORDERNUM, PSORDERTYPE: ORDERTYPE,
});
const kalemler = enter.IASWMSPOITEM ?? enter.TBLWMSPO ?? [];

if (!kalemler.length) {
  console.log("\n✗ Kalem gelmedi. Emre daha önce girilmiş olabilir");
  console.log("  (MZYEnterPick veri yazar, ikinci girişte kalem dönmüyor).");
  console.log("  Uygulamada emri bir kez açman yeterli — orada kalemler görünüyorsa");
  console.log("  bu script yerine ekrandaki listeyi kullan.");
  await client.logoutAsync({ p_strSessionId: sessionId }).catch(() => {});
  process.exit(0);
}

const fis = [];

for (const k of kalemler) {
  const material = k.MATERIAL;
  const itemNo = k.ITEMNO ?? k.ITEMNUM;

  /* 2) Raf barkodu — öneri servisinden */
  const sug = await cagir("MZYCrtSuggestListPickFromSP", {
    PSCOMPANY: T_COMPANY, PSPLANT: T_PLANT,
    PSORDERNUM: ORDERNUM, PSORDERTYPE: ORDERTYPE,
    PIITEMNO: itemNo,
  });
  const oneriler = (sug.SUGGESTEDLISTFROM ?? [])
    .filter((s) => s.WAREHOUSE && s.STOCKPLACE)
    .map((s) => ({
      barkod: `${s.WAREHOUSE}$${s.STOCKPLACE}`,
      stok: s.TOTAL,
      birim: s.QUNIT,
      mesafe: Number(s.DISTANCE ?? 0),
    }))
    .sort((a, b) => a.mesafe - b.mesafe);

  /* 3) Ürün barkodu — "MALZEME$*$" biçimi (Bora: UD009$*$) */
  const urunBarkod = `${material}$*$`;
  const rb = await cagir("MZYReadBarcode", {
    PSCOMPANY: T_COMPANY, PSPLANT: T_PLANT,
    PSWAREHOUSE: "", PSSTOCKPLACE: "", PSBARCODE: urunBarkod,
  });
  const cozum = (rb.WMSXMLTABLE ?? []).find((r) => r.MATERIAL);
  const urunOk = cozum?.MATERIAL === material;

  fis.push({
    itemNo, material, ad: (k.MTEXT ?? "").trim(),
    istenen: `${k.MOVEQTY} ${k.UNIT}`,
    parti: k.SPECIALSTOCK === "1",
    urunBarkod, urunOk,
    raflar: oneriler,
  });
}

/* ---------------- Fişi bas ---------------- */
for (const f of fis) {
  console.log("\n" + "─".repeat(74));
  console.log(`  ${f.ad}`);
  console.log(`  malzeme ${f.material}  ·  ITEMNO ${f.itemNo}  ·  istenen ${f.istenen}` +
    (f.parti ? "  ·  PARTİ TAKİPLİ" : ""));
  console.log("");
  if (f.raflar.length) {
    f.raflar.forEach((r, i) =>
      console.log(`   ${i === 0 ? "1) RAF   " : "   ayrıca"} ${r.barkod.padEnd(14)} (${r.stok} ${r.birim}, mesafe ${r.mesafe})`)
    );
  } else {
    console.log("   1) RAF    ✗ öneri yok — bu kalemin stoğu yok");
  }
  console.log(`   2) ÜRÜN   ${f.urunBarkod.padEnd(14)} ${f.urunOk ? "✓ çözülüyor" : "✗ ÇÖZÜLMEDİ"}`);
  if (f.parti) console.log(`   3) PARTİ  (parti barkodu Bora'dan istenecek)`);
}

/* Ekranda hızlı deneme için sadeleştirilmiş liste */
const denenebilir = fis.filter((f) => f.raflar.length && f.urunOk);

console.log("\n" + "═".repeat(74));
console.log("EKRANDA DENE");
console.log("═".repeat(74));
if (!denenebilir.length) {
  console.log("  ✗ Bu emirde hem rafı hem barkodu çalışan kalem yok.");
  console.log("    Stoğu olan başka bir emir dene.");
} else {
  console.log(`  http://localhost:5173/picking/${ORDERNUM}?type=${ORDERTYPE}\n`);
  for (const f of denenebilir) {
    console.log(`  ${f.ad}`);
    console.log(`    raf  → ${f.raflar[0].barkod}`);
    console.log(`    ürün → ${f.urunBarkod}`);
    console.log("");
  }
}

await client.logoutAsync({ p_strSessionId: sessionId }).catch(() => {});
