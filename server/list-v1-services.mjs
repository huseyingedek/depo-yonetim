// -----------------------------------------------------------------------------
// v1 — sunucuda yayınlanmış TÜM servisleri dök
// -----------------------------------------------------------------------------
// listIASServices ham çıktısını çözer ve MZY* servislerini süzer.
// Amaç: CrtSuggestListPickFromSP ve SavePick'in gerçek adlarını bulmak.
//
// Çalıştırma:  node list-v1-services.mjs
//              node list-v1-services.mjs suggest      → filtreleyerek ara
// -----------------------------------------------------------------------------

import soap from "soap";
import dotenv from "dotenv";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(HERE, ".env") });

const ARA = (process.argv[2] ?? "").toLowerCase();

const V1_WSDL =
  process.env.CANIAS_WSDL_V1 ||
  "http://192.168.22.16:8080/CaniasWS-v1/services/iasWebService?wsdl";

const {
  CANIAS_CLIENT = "00", CANIAS_LANGUAGE = "T",
  CANIAS_DBSERVER = "CANIAS", CANIAS_DBNAME = "AKTUEL",
  CANIAS_APPSERVER = "192.168.22.16:27499",
  WMS_USER, WMS_PASSWORD,
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

const client = await soap.createClientAsync(V1_WSDL, { timeout: 30000 });
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

const [res] = await client.listIASServicesAsync({ p_strSessionId: sessionId });
const data = val(res?.listIASServicesReturn ?? res);

// Ham çıktıyı dosyaya da yaz
writeFileSync(join(HERE, "v1-services.json"), JSON.stringify(data, null, 2), "utf-8");
writeFileSync(join(HERE, "v1-services-raw.xml"), String(client.lastResponse || ""), "utf-8");

/** İç içe yapıdan tüm metinleri topla */
function tumMetinler(x, cikti = []) {
  if (x === null || x === undefined) return cikti;
  if (typeof x === "string") {
    if (x.trim()) cikti.push(x.trim());
    return cikti;
  }
  if (Array.isArray(x)) {
    x.forEach((e) => tumMetinler(e, cikti));
    return cikti;
  }
  if (typeof x === "object") {
    Object.values(x).forEach((v) => tumMetinler(v, cikti));
  }
  return cikti;
}

const hepsi = [...new Set(tumMetinler(data))];

console.log("═".repeat(78));
console.log(`Toplam ${hepsi.length} kayıt bulundu`);
console.log("═".repeat(78));

if (!hepsi.length) {
  console.log("\nListe boş geldi. Ham XML'i kontrol et: server/v1-services-raw.xml");
  console.log("\nSOAP yanıtının ilk 1500 karakteri:");
  console.log(String(client.lastResponse || "").slice(0, 1500));
} else {
  const mzy = hepsi.filter((s) => /^MZY/i.test(s));
  console.log(`\nMZY ile başlayanlar (${mzy.length}):`);
  mzy.sort().forEach((s) => console.log("  " + s));

  if (ARA) {
    const bulunan = hepsi.filter((s) => s.toLowerCase().includes(ARA));
    console.log(`\n"${ARA}" içerenler (${bulunan.length}):`);
    bulunan.forEach((s) => console.log("  " + s));
  }

  console.log(`\nTÜM LİSTE:`);
  hepsi.sort().forEach((s) => console.log("  " + s));
}

console.log("\nHam çıktılar yazıldı:");
console.log("  server/v1-services.json");
console.log("  server/v1-services-raw.xml");

await client.logoutAsync({ p_strSessionId: sessionId }).catch(() => {});
