// -----------------------------------------------------------------------------
// v1 — MZYCrtSuggestListPickFromSP keşfi
// -----------------------------------------------------------------------------
// Akış sırası: CheckUser → ListingPick → EnterPick → **CrtSuggestListPickFromSP**
//              → ReadBarcode → CreateContainer → SavePick
//
// Bu servisin parametreleri elimizde yok. Servis adının ve parametre setinin
// farklı varyasyonlarını deneyip hangisinin cevap verdiğini buluyoruz.
// Artık servisler TBLMESSAGE ile konuşuyor, yani yanlışsa sebebini söylüyorlar.
//
// Çalıştırma:  node test-v1-suggest.mjs bsenturk 00002215 MR
// -----------------------------------------------------------------------------

import soap from "soap";
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), ".env") });

const USER = process.argv[2] ?? "bsenturk";
const ORDER = process.argv[3] ?? ""; // boşsa listeden ilk TOPLAMA emri alınır
const OTYPE = process.argv[4] ?? "";

const V1_WSDL =
  process.env.CANIAS_WSDL_V1 ||
  "http://192.168.22.16:8080/CaniasWS-v1/services/iasWebService?wsdl";

const {
  CANIAS_CLIENT = "00", CANIAS_LANGUAGE = "T",
  CANIAS_DBSERVER = "CANIAS", CANIAS_DBNAME = "AKTUEL",
  CANIAS_APPSERVER = "192.168.22.16:27499",
  WMS_USER, WMS_PASSWORD,
  T_COMPANY = "01", T_PLANT = "100", T_WAREHOUSE = "D1",
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
console.log("✓ Login OK\n");

async function cagir(serviceid, params) {
  try {
    const [res] = await client.callIASServiceAsync({
      sessionid: sessionId,
      serviceid,
      args: xml(params),
      returntype: "JSON",
      permanent: false,
    });
    const out = val(res?.callIASServiceReturn ?? res);
    return { ok: true, raw: typeof out === "string" ? out : JSON.stringify(out ?? "") };
  } catch (e) {
    return { ok: false, raw: "", hata: (e?.message || String(e)).slice(0, 160) };
  }
}

/* ---------- 0) Toplama emri bul (ISPICK=1) ---------- */
let ORDERNUM = ORDER;
let ORDERTYPE = OTYPE;
/** Denenecek emirler — ilki kalem döndürmezse sıradakine geçilir. */
let ADAYLAR = ORDER ? [{ ORDERNUM: ORDER, ORDERTYPE: OTYPE }] : [];

if (!ORDERNUM) {
  console.log("═".repeat(78));
  console.log("0) MZYListingPick — TOPLAMA emirleri (ISPICK=1)");
  console.log("═".repeat(78));
  const lst = await cagir("MZYListingPick", {
    PSCOMPANY: T_COMPANY, PSPLANT: T_PLANT, PSWORKER: USER,
    PISTATUS: 0, PIISPICK: 1,
    PDSTARTDATE: "01.01.1975", PDENDDATE: "01.01.2100",
    PIISDELETE: 0, PIISSTARTED: 1, PIORDER: 0,
  });
  let rows = [];
  try { rows = unwrap(JSON.parse(lst.raw).TBLPOLIST); } catch { /* boş */ }

  if (!rows.length) {
    console.log("  ✗ Toplama emri yok (ISPICK=1 boş döndü).");
    console.log("  → Bora'dan bir toplama emri oluşturmasını iste.");
    await client.logoutAsync({ p_strSessionId: sessionId }).catch(() => {});
    process.exit(0);
  }
  console.log(`  ✓ ${rows.length} toplama emri:`);
  rows.forEach((r, i) => console.log(`    ${i + 1}. ${r.ORDERNUM} / ${r.ORDERTYPE}  (${r.STEXT || "-"})`));
  ADAYLAR = rows.map((r) => ({ ORDERNUM: r.ORDERNUM, ORDERTYPE: r.ORDERTYPE }));
}

/* ---------- 1) Emre gir — kalem gelene kadar sırayla dene ---------- */
// DİKKAT: MZYEnterPick veri YAZAR ve idempotent değildir.
// Aynı emre ikinci kez girilince kalem yerine TBLMESSAGE dönüyor.
// Bu yüzden kalem gelmezse listedeki sıradaki emre geçiyoruz.
console.log("\n" + "═".repeat(78));
console.log("1) MZYEnterPick — emre giriliyor");
console.log("═".repeat(78));

let KALEMLER = [];

for (const aday of ADAYLAR) {
  const r = await cagir("MZYEnterPick", {
    PSCOMPANY: T_COMPANY, PSPLANT: T_PLANT,
    PSORDERNUM: aday.ORDERNUM, PSORDERTYPE: aday.ORDERTYPE,
  });

  let tablolar = [];
  let satirlar = [];
  try {
    const d = JSON.parse(r.raw);
    tablolar = Object.keys(d);
    satirlar = unwrap(d.IASWMSPOITEM ?? d.TBLWMSPO);
  } catch { /* boş */ }

  console.log(`\n  ${aday.ORDERNUM} / ${aday.ORDERTYPE}`);
  console.log(`    dönen tablolar: ${tablolar.join(", ") || "(yok)"}`);
  console.log(`    kalem sayısı  : ${satirlar.length}`);

  if (satirlar.length) {
    ORDERNUM = aday.ORDERNUM;
    ORDERTYPE = aday.ORDERTYPE;
    KALEMLER = satirlar;
    console.log(`    ✓ bu emirle devam ediliyor\n`);
    KALEMLER.forEach((k) => {
      const toplama = k.ISPICK === "1";
      const alan = toplama ? k.TRANSAREA : k.FRONTAREA;
      const depo = toplama ? k.WAREHOUSETA : k.WAREHOUSEFA;
      const parti = k.SPECIALSTOCK === "1" ? `parti: ${k.BATCHNUM}` : "parti yok";
      console.log(
        `      ITEMNO ${k.ITEMNO} · ${k.MATERIAL} · ${k.MOVEQTY}/${k.MOVEDQTY} ${k.UNIT}\n` +
        `        ${k.MTEXT}\n` +
        `        ${toplama ? "hedef" : "kaynak"}: depo ${depo || "-"} / alan ${alan || "-"} · ${parti}`
      );
    });
    break;
  }
  console.log(`    · kalem yok, sıradaki emre geçiliyor`);
}

if (!KALEMLER.length) {
  console.log("\n✗ Hiçbir emirden kalem gelmedi.");
  console.log("  Emirlere daha önce girilmiş olabilir (EnterPick veri yazıyor).");
  console.log("  → Bora'dan yeni bir toplama emri iste ya da mevcutları sıfırlat.");
  await client.logoutAsync({ p_strSessionId: sessionId }).catch(() => {});
  process.exit(0);
}

/* ---------- 2) Servis adı (doğrulandı) ---------- */
const ADLAR = ["MZYCrtSuggestListPickFromSP"];

/* ---------- 3) Parametre seti varyasyonları ---------- */
// Bora'nın resmi listesi:
//   PSCOMPANY, PSPLANT, PSORDERNUM, PSORDERTYPE (STRING) + PIITEMNO (INTEGER)
// Önek kuralı: PS = string, PI = integer
// ÖNEMLİ: PIITEMNO emrin GERÇEK kalem numarası olmalı.
// Bu emirde ITEMNO=1000 gibi değerler var, sabit 1/2 değil.
const SETLER = KALEMLER.map((k) => [
  `ITEMNO ${k.ITEMNO} (${k.MATERIAL})`,
  {
    PSCOMPANY: T_COMPANY,
    PSPLANT: T_PLANT,
    PSORDERNUM: ORDERNUM,
    PSORDERTYPE: ORDERTYPE,
    PIITEMNO: Number(k.ITEMNO),
  },
]);

if (!SETLER.length) {
  console.log("\n✗ Kalem gelmedi, öneri denenemiyor.");
  await client.logoutAsync({ p_strSessionId: sessionId }).catch(() => {});
  process.exit(0);
}

console.log("\n" + "═".repeat(78));
console.log("2) Servis kontrolü");
console.log("═".repeat(78));

let gecerliAd = null;
for (const ad of ADLAR) {
  const r = await cagir(ad, SETLER[0][1]);
  const bulunamadi = /can not find web service|bulunamadı/i.test(r.raw + (r.hata ?? ""));
  const durum = r.hata ? "✗ istisna" : bulunamadi ? "✗ servis yok" : "★ VAR";
  console.log(`  ${durum.padEnd(14)} ${ad}`);
  if (r.hata) console.log(`                 ${r.hata}`);
  if (!r.hata && !bulunamadi && !gecerliAd) gecerliAd = ad;
}

if (!gecerliAd) {
  console.log("\n✗ Hiçbir servis adı tutmadı. Bora'dan tam adı iste.");
  await client.logoutAsync({ p_strSessionId: sessionId }).catch(() => {});
  process.exit(0);
}

/* ---------- 4) Parametre setlerini dene ---------- */
console.log("\n" + "═".repeat(78));
console.log(`3) Her kalem için öneri — ${gecerliAd}`);
console.log("═".repeat(78));

for (const [etiket, params] of SETLER) {
  const r = await cagir(gecerliAd, params);
  console.log(`\n─ ${etiket}`);
  console.log(`  gönderilen: ${xml(params)}`);
  if (r.hata) {
    console.log(`  ✗ ${r.hata}`);
    continue;
  }
  try {
    const d = JSON.parse(r.raw);
    for (const [tablo, icerik] of Object.entries(d)) {
      const rows = unwrap(icerik);
      if (/MESSAGE/i.test(tablo)) {
        const metin = rows.map((m) => m.TEXT || m.VALUE || JSON.stringify(m)).join(" | ");
        console.log(`  ${tablo}: ${metin || "(boş)"}`);
      } else {
        console.log(`  ${tablo}: ${rows.length} satır`);
        if (rows.length) {
          console.log(`    ALANLAR: ${Object.keys(rows[0]).join(", ")}`);
          console.log(`    İLK SATIR: ${JSON.stringify(rows[0]).slice(0, 700)}`);
        }
      }
    }
  } catch {
    console.log(`  yanıt: ${r.raw.slice(0, 250)}`);
  }
}

console.log("\n" + "═".repeat(78));
await client.logoutAsync({ p_strSessionId: sessionId }).catch(() => {});
