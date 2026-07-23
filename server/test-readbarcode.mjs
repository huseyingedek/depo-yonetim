// -----------------------------------------------------------------------------
// ReadBarcodeSP keşfi — servis adı + barkod değeri + dönen alanlar
// -----------------------------------------------------------------------------
// Bora: "READBARCODESP hazır, 3 parametre: PSCOMPANY, PSPLANT, PSBARCODE"
//
// İki bilinmeyen var:
//   1) Servisin tam adı (MZY öneki var mı?)  → aday adları deniyoruz
//   2) Gerçek bir barkod değeri              → aday değerleri deniyoruz
//
// Bilinmeyen servis adı ile bilinmeyen barkodu aynı anda denemek yanıltıcı olur:
// boş cevap gelince "servis mi yok, barkod mu yok" ayırt edilemez.
// Bu yüzden ÖNCE servis adını sabitliyoruz (kesin var olmayan bir kontrol adıyla
// karşılaştırarak), SONRA o adla barkod değerlerini tarıyoruz.
//
// Çalıştırma:
//   node test-readbarcode.mjs                 → adayları tarar
//   node test-readbarcode.mjs 8690632012345   → belirli barkodu dener
// -----------------------------------------------------------------------------

import soap from "soap";
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), ".env") });

const ARG_BARCODE = process.argv[2] ?? "";

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
    return { ok: true, raw: typeof o === "string" ? o : JSON.stringify(o ?? "") };
  } catch (e) {
    return { ok: false, raw: "", hata: (e?.message || String(e)).slice(0, 140) };
  }
}

/* ---------------------------------------------------------------------------
   1) SERVİS ADI
   --------------------------------------------------------------------------- */
console.log("═".repeat(78));
console.log("1) Servis adı belirleniyor");
console.log("═".repeat(78));

// Bu ad KESİNLİKLE yok. "Servis yok" cevabının nasıl göründüğünü öğrenmek için.
const KONTROL = "MZYBoyleBirServisYokAbi";
const ADAYLAR = [
  "MZYReadBarcodeSP",
  "ReadBarcodeSP",
  "MZYReadBarcode",
  "MZYReadBarcodesp",
];

const ornekParams = { PSCOMPANY: T_COMPANY, PSPLANT: T_PLANT, PSBARCODE: "%" };

const kontrolSonuc = await cagir(KONTROL, ornekParams);
const yokImzasi = (kontrolSonuc.raw || kontrolSonuc.hata || "").slice(0, 120);
console.log(`  Kontrol (olmayan servis) imzası: ${yokImzasi || "(boş)"}\n`);

let SERVIS = "";
for (const ad of ADAYLAR) {
  const r = await cagir(ad, ornekParams);
  const cevap = (r.raw || r.hata || "").slice(0, 120);
  const ayni = cevap === yokImzasi;
  console.log(`  ${ayni ? "✗ yok " : "✓ VAR "} ${ad}`);
  console.log(`         ${cevap || "(boş)"}`);
  if (!ayni && !SERVIS) SERVIS = ad;
}

if (!SERVIS) {
  console.log("\n✗ Hiçbir aday ad kontrolden farklı cevap vermedi.");
  console.log("  Bora'ya sor: servisin CANIAS'taki tam adı nedir?");
  await client.logoutAsync({ p_strSessionId: sessionId }).catch(() => {});
  process.exit(0);
}

console.log(`\n→ Kullanılacak servis: ${SERVIS}`);

/* ---------------------------------------------------------------------------
   2) BARKOD DEĞERİ
   --------------------------------------------------------------------------- */
console.log("\n" + "═".repeat(78));
console.log("2) Barkod değerleri deneniyor");
console.log("═".repeat(78));

// Elimizde gerçek barkod yok. Emirdeki malzeme kodlarını ve jokerleri deniyoruz;
// biri veri döndürürse hem servisin çalıştığını hem dönen alanları öğreniriz.
const BARKODLAR = ARG_BARCODE
  ? [ARG_BARCODE]
  : ["%", "UD009", "NC063", "NC210", "UL029", "UL048", "*", ""];

let kazanan = null;

for (const bc of BARKODLAR) {
  const r = await cagir(SERVIS, {
    PSCOMPANY: T_COMPANY, PSPLANT: T_PLANT, PSBARCODE: bc,
  });

  let tablolar = [];
  let toplamSatir = 0;
  let mesaj = "";
  try {
    const d = JSON.parse(r.raw);
    tablolar = Object.keys(d);
    for (const [ad, icerik] of Object.entries(d)) {
      const rows = unwrap(icerik);
      if (/MESSAGE/i.test(ad)) {
        mesaj = rows.map((m) => m.TEXT || m.VALUE || "").filter(Boolean).join(" | ");
      } else {
        toplamSatir += rows.length;
      }
    }
  } catch { /* çözülemedi */ }

  const bayrak = toplamSatir > 0 ? `✓✓ ${toplamSatir} satır` : "·  boş";
  console.log(`\n  ${bayrak}  PSBARCODE="${bc}"`);
  console.log(`      tablolar: ${tablolar.join(", ") || "(yok)"}`);
  if (mesaj) console.log(`      mesaj: ${mesaj.slice(0, 140)}`);
  if (r.hata) console.log(`      hata: ${r.hata}`);

  // HER barkodun dönen satırını bas — sadece ilkini basmak yanıltıcıydı.
  // Asıl merak: gönderdiğimiz değer alanlardan birine AYNEN düşüyor mu?
  // Düşüyorsa servis barkodu çözmüyor, girdiyi geri yansıtıyor demektir.
  try {
    const d = JSON.parse(r.raw);
    for (const [ad, icerik] of Object.entries(d)) {
      for (const row of unwrap(icerik)) {
        const ozet = Object.entries(row)
          .map(([k, v]) => `${k}=${v === "" ? "∅" : v}`)
          .join("  ");
        const yansima = Object.entries(row).find(([, v]) => v !== "" && v === bc);
        console.log(`      ${ad}: ${ozet}`);
        if (yansima) console.log(`      ⚠ girdi "${bc}" → ${yansima[0]} alanına aynen yansımış`);
      }
    }
  } catch { /* çözülemedi */ }

  if (toplamSatir > 0 && !kazanan) kazanan = { bc, raw: r.raw };
}

/* ---------------------------------------------------------------------------
   3) DÖNEN ALANLAR
   --------------------------------------------------------------------------- */
console.log("\n" + "═".repeat(78));
console.log("3) Sonuç");
console.log("═".repeat(78));

if (!kazanan) {
  console.log("→ Servis cevap veriyor ama hiçbir barkod değeri satır döndürmedi.");
  console.log("  Denediklerimiz malzeme kodlarıydı, gerçek barkod olmayabilir.");
  console.log("  Bora'dan çalışan bir örnek barkod iste (bir raf + bir ürün).");
  console.log(`  Sonra:  node test-readbarcode.mjs <barkod>`);
} else {
  console.log(`→ VERİ GELDİ — PSBARCODE="${kazanan.bc}"\n`);
  const d = JSON.parse(kazanan.raw);
  for (const [ad, icerik] of Object.entries(d)) {
    const rows = unwrap(icerik);
    if (!rows.length) continue;
    console.log(`  ${ad}: ${rows.length} satır`);
    console.log(`    ALANLAR: ${Object.keys(rows[0]).join(", ")}`);
    console.log(`\n    İLK 2 SATIR:`);
    console.log(
      JSON.stringify(rows.slice(0, 2), null, 2).split("\n").map((l) => "    " + l).join("\n")
    );
    console.log("");
  }
  console.log("  → Bu alanlara bakarak client.ts eşlemesi yazılacak:");
  console.log("    barkod hangi malzemeye ait? raf mı ürün mü? miktar/stok alanı hangisi?");
}

await client.logoutAsync({ p_strSessionId: sessionId }).catch(() => {});
