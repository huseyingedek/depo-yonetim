// -----------------------------------------------------------------------------
// RAF ZİNCİRİ — EnterPick → CrtSuggestListPickFromSP → raf barkodu → ReadBarcodeSP
// -----------------------------------------------------------------------------
// Bora'nın tarifi (WhatsApp 14:46):
//   "sen içeri girince MZYCrtSuggestListPickFromSP bu fonksiyonu çağırırsan
//    sana gelen tabloda WAREHOUSE ve STOCKPLACE de gelen bilgileri birleştirip
//    arasına $ koyarsan, depo raf barkodu olmuş olur"
//
// Yani:  raf barkodu = WAREHOUSE + "$" + STOCKPLACE
//
// Bu da ReadBarcodeSP'nin neden saçmaladığını açıklıyor: "$" ile ayırmaya
// çalışıyor, biz "$" içermeyen metin gönderdiğimiz için rastgele kesiyordu.
//
// Bu script zinciri baştan sona kurar ve her adımı ayrı ayrı raporlar.
//
// Çalıştırma:  node test-raf-zinciri.mjs bsenturk 26935028 SO
// -----------------------------------------------------------------------------

import soap from "soap";
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), ".env") });

const USER = process.argv[2] ?? "bsenturk";
const ORDERNUM = process.argv[3] ?? "26935028";
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
console.log("✓ Login OK\n");

async function cagir(serviceid, params) {
  try {
    const [res] = await client.callIASServiceAsync({
      sessionid: sessionId, serviceid,
      args: xml(params), returntype: "JSON", permanent: false,
    });
    const o = val(res?.callIASServiceReturn ?? res);
    return { raw: typeof o === "string" ? o : JSON.stringify(o ?? "") };
  } catch (e) {
    return { raw: "", hata: (e?.message || String(e)).slice(0, 160) };
  }
}

/** Tüm tabloları {ad: satırlar} olarak döndürür */
function tablolar(raw) {
  const out = {};
  try {
    for (const [ad, icerik] of Object.entries(JSON.parse(raw))) {
      out[ad] = unwrap(icerik);
    }
  } catch { /* çözülemedi */ }
  return out;
}
function mesajlar(t) {
  const m = [];
  for (const [ad, rows] of Object.entries(t)) {
    if (!/MESSAGE/i.test(ad)) continue;
    for (const r of rows) {
      const s = r.TEXT || r.VALUE || "";
      if (s) m.push(s);
    }
  }
  return m.join(" | ");
}

/* ---------------------------------------------------------------------------
   1) EnterPick — emre gir, kalemleri al
   --------------------------------------------------------------------------- */
console.log("═".repeat(78));
console.log(`1) MZYEnterPick — ${ORDERNUM} / ${ORDERTYPE}`);
console.log("═".repeat(78));

const enterR = await cagir("MZYEnterPick", {
  PSCOMPANY: T_COMPANY, PSPLANT: T_PLANT,
  PSORDERNUM: ORDERNUM, PSORDERTYPE: ORDERTYPE,
});
const enterT = tablolar(enterR.raw);
const kalemler = enterT.IASWMSPOITEM ?? enterT.TBLWMSPO ?? [];

console.log(`  dönen tablolar: ${Object.keys(enterT).join(", ") || "(yok)"}`);
console.log(`  kalem sayısı  : ${kalemler.length}`);
if (mesajlar(enterT)) console.log(`  mesaj: ${mesajlar(enterT)}`);
if (enterR.hata) console.log(`  hata: ${enterR.hata}`);

if (!kalemler.length) {
  console.log("\n✗ Kalem gelmedi — emre daha önce girilmiş olabilir (EnterPick veri yazar).");
  console.log("  Bora'dan emri sıfırlamasını iste ya da başka bir emir dene.");
  await client.logoutAsync({ p_strSessionId: sessionId }).catch(() => {});
  process.exit(0);
}

kalemler.forEach((k) =>
  console.log(`    ITEMNO ${k.ITEMNO}  ${k.MATERIAL}  ${k.MOVEQTY}/${k.MOVEDQTY} ${k.UNIT}`)
);

/* ---------------------------------------------------------------------------
   2) CrtSuggestListPickFromSP — her kalem için raf önerisi
   --------------------------------------------------------------------------- */
console.log("\n" + "═".repeat(78));
console.log("2) MZYCrtSuggestListPickFromSP — raf önerileri");
console.log("═".repeat(78));

/** Bulunan raflar: {barkod, warehouse, stockplace, kalem} */
const RAFLAR = [];

for (const k of kalemler) {
  const r = await cagir("MZYCrtSuggestListPickFromSP", {
    PSCOMPANY: T_COMPANY, PSPLANT: T_PLANT,
    PSORDERNUM: ORDERNUM, PSORDERTYPE: ORDERTYPE,
    PIITEMNO: k.ITEMNO,
  });
  const t = tablolar(r.raw);

  // WAREHOUSE + STOCKPLACE içeren HER tabloyu tara — tablo adını varsaymıyoruz
  const oneriler = [];
  for (const [ad, rows] of Object.entries(t)) {
    for (const row of rows) {
      if (row.WAREHOUSE !== undefined && row.STOCKPLACE !== undefined) {
        oneriler.push({ tablo: ad, ...row });
      }
    }
  }

  console.log(`\n  ITEMNO ${k.ITEMNO} (${k.MATERIAL})`);
  console.log(`    tablolar: ${Object.keys(t).join(", ") || "(yok)"}`);
  const msj = mesajlar(t);
  if (msj) console.log(`    mesaj: ${msj}`);

  if (!oneriler.length) {
    console.log(`    · raf önerisi yok (stok yok olabilir)`);
    continue;
  }

  for (const o of oneriler) {
    // Bora: WAREHOUSE + "$" + STOCKPLACE = raf barkodu
    const barkod = `${o.WAREHOUSE}$${o.STOCKPLACE}`;
    console.log(`    ✓ ${o.tablo}: WAREHOUSE=${o.WAREHOUSE}  STOCKPLACE=${o.STOCKPLACE}`);
    console.log(`      → raf barkodu: ${barkod}`);
    console.log(`      diğer alanlar: ${Object.keys(o).join(", ")}`);
    RAFLAR.push({ barkod, ...o, kalem: k.MATERIAL });
  }
}

/* ---------------------------------------------------------------------------
   3) ReadBarcodeSP — üretilen barkodu geri çözdür
   --------------------------------------------------------------------------- */
console.log("\n" + "═".repeat(78));
console.log("3) MZYReadBarcodeSP — üretilen raf barkodu doğrulanıyor");
console.log("═".repeat(78));

if (!RAFLAR.length) {
  console.log("  ✗ Elde raf barkodu yok, doğrulanacak bir şey de yok.");
  console.log("    Öneri servisi boş döndü — Bora'nın dediği gibi stok olmayabilir.");
} else {
  for (const raf of RAFLAR) {
    const r = await cagir("MZYReadBarcodeSP", {
      PSCOMPANY: T_COMPANY, PSPLANT: T_PLANT, PSBARCODE: raf.barkod,
    });
    const t = tablolar(r.raw);
    const rows = t.TBLWHSP ?? [];
    const geri = rows[0] ?? {};

    // Gidiş-dönüş tutuyor mu? Tutuyorsa biçim doğru demektir.
    const tutuyor =
      geri.WAREHOUSE === raf.WAREHOUSE && geri.STOCKPLACE === raf.STOCKPLACE;

    console.log(`\n  barkod: ${raf.barkod}   (${raf.kalem})`);
    console.log(`    dönen: WAREHOUSE=${geri.WAREHOUSE ?? "?"}  STOCKPLACE=${geri.STOCKPLACE ?? "?"}  PLANT=${geri.PLANT ?? "?"}`);
    console.log(`    ${tutuyor ? "✓ gidiş-dönüş TUTUYOR — biçim doğru" : "✗ tutmuyor — biçim yanlış olabilir"}`);
    if (mesajlar(t)) console.log(`    mesaj: ${mesajlar(t)}`);
  }
}

console.log("\n" + "═".repeat(78));
console.log("ÖZET");
console.log("═".repeat(78));
console.log(`  kalem: ${kalemler.length}   raf önerisi: ${RAFLAR.length}`);
if (RAFLAR.length) {
  console.log("\n  Uygulamada kullanılacak raf barkodları:");
  RAFLAR.forEach((r) => console.log(`    ${r.barkod}  →  ${r.kalem}`));
}

await client.logoutAsync({ p_strSessionId: sessionId }).catch(() => {});
