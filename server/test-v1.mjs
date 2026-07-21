// -----------------------------------------------------------------------------
// CANIAS WS v1 (iasWebService) — args virgülle ayrık
// -----------------------------------------------------------------------------
// v1 imzası v2'den tamamen farklı:
//   login(p_strClient, p_strLanguage, p_strDBName, p_strDBServer,
//         p_strAppServer, p_strUserName, p_strPassword) → sessionId (düz string)
//   callIASService(sessionid, serviceid, args, returntype, permanent)
//   listIASServices(p_strSessionId)
//
// args = değerler SIRAYLA, virgülle ayrılmış (exe'deki "PARAMS separatedByComma")
//
// Çalıştırma:  node test-v1.mjs TOPLAMATEST Tt123
// -----------------------------------------------------------------------------

import soap from "soap";
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), ".env") });

const USER = process.argv[2] ?? "TOPLAMATEST";
const PASS = process.argv[3] ?? "Tt123";

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

console.log("v1 WSDL:", V1_WSDL, "\n");

const client = await soap.createClientAsync(V1_WSDL, { timeout: 20000 });

/* ---------- LOGIN ---------- */
console.log("═".repeat(78));
console.log("LOGIN");
console.log("═".repeat(78));

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

if (!sessionId || typeof sessionId !== "string" || /error|fail|hata/i.test(sessionId)) {
  console.log("✗ Login başarısız:", sessionId);
  process.exit(1);
}
console.log("✓ Login OK");
console.log("  SessionId:", sessionId);

/* ---------- SERVİS LİSTESİ ---------- */
console.log("\n" + "═".repeat(78));
console.log("YAYINLANMIŞ SERVİSLER");
console.log("═".repeat(78));
try {
  const [sres] = await client.listIASServicesAsync({ p_strSessionId: sessionId });
  const list = val(sres?.listIASServicesReturn ?? sres);
  const arr = Array.isArray(list) ? list : [list];
  const mzy = arr.filter((s) => /MZY|Get/i.test(String(s)));
  console.log(`  Toplam ${arr.length} servis`);
  console.log(`  İlgili olanlar:\n    ${mzy.join("\n    ") || "(bulunamadı)"}`);
} catch (e) {
  console.log("  (liste alınamadı)", e?.message || e);
}

/* ---------- ÇAĞRI ---------- */
async function cagir(etiket, serviceid, args, returntype) {
  console.log("\n" + "─".repeat(78));
  console.log(`▶ ${etiket}`);
  console.log(`  serviceid  : ${serviceid}`);
  console.log(`  args       : ${args}`);
  console.log(`  returntype : ${returntype || "(boş)"}`);
  try {
    const [res] = await client.callIASServiceAsync({
      sessionid: sessionId,
      serviceid,
      args,
      returntype,
      permanent: false,
    });
    const out = val(res?.callIASServiceReturn ?? res);
    const text = typeof out === "string" ? out : JSON.stringify(out);
    console.log(`  SONUÇ      : ${String(text).replace(/\s+/g, " ").slice(0, 900)}`);
    return text;
  } catch (e) {
    console.log(`  ✗ hata     : ${(e?.message || e).toString().slice(0, 200)}`);
    return null;
  }
}

console.log("\n" + "═".repeat(78));
console.log("MZYCheckUser — kullanıcı kontrolü");
console.log("═".repeat(78));
for (const rt of ["JSON", "XML", ""]) {
  await cagir(`returntype=${rt || "boş"}`, "MZYCheckUser", `${USER},${PASS}`, rt);
}

console.log("\n" + "═".repeat(78));
console.log("MZYListingPick — toplama emirleri");
console.log("═".repeat(78));
const listArgs = [
  T_COMPANY, T_PLANT, USER, "0",
  "%", "%", "%", "%", "%",
  "1", "01.01.1975", "01.01.2100",
  "0", "1", "0",
].join(",");
for (const rt of ["JSON", "XML", ""]) {
  await cagir(`returntype=${rt || "boş"}`, "MZYListingPick", listArgs, rt);
}

console.log("\n" + "═".repeat(78));
console.log("MZYReadBarcode");
console.log("═".repeat(78));
await cagir("returntype=JSON", "MZYReadBarcode", `${T_COMPANY},${T_PLANT},%`, "JSON");

console.log("\n" + "═".repeat(78));
try {
  await client.logoutAsync({ p_strSessionId: sessionId });
  console.log("✓ Oturum kapatıldı");
} catch {
  /* önemsiz */
}
