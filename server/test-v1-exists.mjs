// -----------------------------------------------------------------------------
// v1 — bir servis GERÇEKTEN var mı?
// -----------------------------------------------------------------------------
// listIASServices tutarsız sonuç veriyor (aynı komut kimi zaman 6, kimi zaman
// 1 servis döndürdü). O yüzden varlığı ÇAĞIRARAK ölçüyoruz.
//
// Yöntem: üç grubu aynı koşullarda çağırıp yanıtları karşılaştır
//   1) KESİN VAR   → MZYEnterPick
//   2) KESİN YOK   → uydurma bir ad
//   3) ŞÜPHELİ     → CrtSuggestListPickFromSP / SavePick
//
// Şüphelinin yanıtı "kesin yok" ile aynıysa → servis yayınlanmamış.
// Farklıysa → servis var, sorun parametrelerde.
//
// Çalıştırma:  node test-v1-exists.mjs
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

// Hepsine AYNI parametreler gider — fark sadece servis adından gelsin
const ORTAK = {
  PSCOMPANY: T_COMPANY,
  PSPLANT: T_PLANT,
  PSORDERNUM: "00002215",
  PSORDERTYPE: "MR",
};

async function cagir(ad) {
  try {
    const [res] = await client.callIASServiceAsync({
      sessionid: sessionId,
      serviceid: ad,
      args: xml(ORTAK),
      returntype: "JSON",
      permanent: false,
    });
    const out = val(res?.callIASServiceReturn ?? res);
    const raw = typeof out === "string" ? out : JSON.stringify(out ?? "");
    return { raw, uzunluk: raw.length };
  } catch (e) {
    return { raw: "İSTİSNA: " + (e?.message || e).toString().slice(0, 120), uzunluk: -1 };
  }
}

const GRUPLAR = [
  ["KESİN VAR", "MZYEnterPick"],
  ["KESİN YOK", "ZZZBUSERVISYOKTUR123"],
  ["KESİN YOK", "MZYAsdfghjkl"],
  ["şüpheli", "MZYCrtSuggestListPickFromSP"],
  ["şüpheli", "MZYSavePick"],
  ["şüpheli", "MZYCRTSUGGESTLISTPICKFROMSP"],
  ["şüpheli", "MZYSAVEPICK"],
  ["şüpheli", "CrtSuggestListPickFromSP"],
  ["şüpheli", "SavePick"],
];

console.log("Tümü AYNI parametrelerle çağrılıyor:", xml(ORTAK));
console.log("\n" + "═".repeat(78));

const sonuclar = [];
for (const [grup, ad] of GRUPLAR) {
  const r = await cagir(ad);
  sonuclar.push({ grup, ad, ...r });
  const ozet = r.raw ? r.raw.replace(/\s+/g, " ").slice(0, 70) : "(tamamen boş)";
  console.log(`\n${grup.padEnd(10)} ${ad}`);
  console.log(`  uzunluk: ${r.uzunluk}`);
  console.log(`  yanıt  : ${ozet}`);
}

/* ---------- Karşılaştırma ---------- */
const yokImzasi = sonuclar.find((s) => s.grup === "KESİN YOK")?.raw ?? "";
const varImzasi = sonuclar.find((s) => s.grup === "KESİN VAR")?.raw ?? "";

console.log("\n" + "═".repeat(78));
console.log("KARŞILAŞTIRMA");
console.log("═".repeat(78));
console.log(`\n"Servis yok" imzası : ${yokImzasi ? yokImzasi.slice(0, 60) : "(tamamen boş)"}`);
console.log(`"Servis var" imzası : ${varImzasi.slice(0, 60)}...`);

console.log("\nŞüpheliler:");
for (const s of sonuclar.filter((x) => x.grup === "şüpheli")) {
  const yokGibi = s.raw === yokImzasi;
  console.log(`  ${yokGibi ? "✗ YAYINLANMAMIŞ" : "★ VAR OLABİLİR"}  ${s.ad}`);
}

const varOlan = sonuclar.filter((s) => s.grup === "şüpheli" && s.raw !== yokImzasi);
console.log("\n" + "─".repeat(78));
if (varOlan.length) {
  console.log("→ Şu servis(ler) farklı cevap verdi, parametreleri araştırılmalı:");
  varOlan.forEach((s) => console.log("   " + s.ad));
} else {
  console.log("→ Şüphelilerin hepsi 'yok' imzasıyla aynı cevabı verdi.");
  console.log("  Bu iki servis sunucuda yayınlanmamış. Bora'nın yayınlaması gerekiyor.");
}

await client.logoutAsync({ p_strSessionId: sessionId }).catch(() => {});
