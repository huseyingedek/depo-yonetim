// -----------------------------------------------------------------------------
// Sunucuya GERÇEKTEN giden SOAP zarfını göster
// -----------------------------------------------------------------------------
// Hipotez: node-soap, WSDL'deki eleman adıyla bizim verdiğimiz anahtar uyuşmazsa
// alanı sessizce atıyor olabilir. O zaman CANIAS parametreleri hiç görmez —
// ki gözlemlediğimiz "ne göndersek aynı hata" davranışı tam da buna uyuyor.
//
// Çalıştırma:  node dump-envelope.mjs
// -----------------------------------------------------------------------------

import soap from "soap";
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), ".env") });

const {
  CANIAS_WSDL_URL,
  WMS_USER,
  WMS_PASSWORD,
  CANIAS_CLIENT,
  CANIAS_LANGUAGE = "T",
  CANIAS_DBSERVER,
  CANIAS_DBNAME,
  CANIAS_APPSERVER,
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

const client = await soap.createClientAsync(CANIAS_WSDL_URL, { timeout: 20000 });

console.log("═".repeat(74));
console.log("1) WSDL'e göre callService girdi şeması");
console.log("═".repeat(74));
try {
  const d = client.describe();
  for (const [svcName, svc] of Object.entries(d)) {
    for (const [portName, port] of Object.entries(svc)) {
      if (port.callService) {
        console.log(`${svcName} / ${portName} / callService`);
        console.log(JSON.stringify(port.callService.input, null, 2));
      }
    }
  }
} catch (e) {
  console.log("(okunamadı)", e?.message || e);
}

const [loginRes] = await client.loginAsync({
  Client: CANIAS_CLIENT,
  Language: CANIAS_LANGUAGE,
  DBServer: CANIAS_DBSERVER,
  DBName: CANIAS_DBNAME,
  ApplicationServer: CANIAS_APPSERVER,
  Username: WMS_USER,
  Password: WMS_PASSWORD,
  Encrypted: false,
  Compression: false,
  LCheck: "",
  VKey: "",
});
const lr = val(loginRes?.loginReturn ?? loginRes) ?? {};
if (lr.Success !== true || !lr.SessionId) {
  console.error("✗ Login başarısız:", lr.ErrorMessage || "(sebep yok)");
  process.exit(1);
}

console.log("\n" + "═".repeat(74));
console.log("2) callService çağrısında giden zarf");
console.log("═".repeat(74));

const PARAMS = "<PARAMETERS><COMPANY>01</COMPANY><PLANT>100</PLANT><ISPICK>1</ISPICK></PARAMETERS>";

try {
  await client.callServiceAsync({
    SessionId: lr.SessionId,
    SecurityKey: lr.SecurityKey || "",
    ServiceId: "MZYListingPick",
    Parameters: PARAMS,
    Compressed: false,
    Permanent: false,
    ExtraVariables: "",
    RequestId: 0,
  });
} catch (e) {
  console.log("(çağrı hatası, zarf yine de basılacak)", e?.message || e);
}

console.log(client.lastRequest);

console.log("\n" + "═".repeat(74));
console.log("3) KONTROL");
console.log("═".repeat(74));
const req = String(client.lastRequest || "");
const hasParams = /<[^>]*Parameters[^>]*>/i.test(req);
const hasContent = /COMPANY/i.test(req);
console.log(`Parameters elemanı zarfta var mı : ${hasParams ? "EVET" : "HAYIR ← sorun bu"}`);
console.log(`İçeriği (COMPANY) zarfta var mı  : ${hasContent ? "EVET" : "HAYIR ← sorun bu"}`);
if (hasParams && hasContent) {
  console.log("\nZarf doğru gidiyor → sorun CANIAS tarafında, Bora'ya sor.");
} else {
  console.log("\nZarf eksik gidiyor → sorun bizde, node-soap alanı düşürüyor.");
}

await client.logoutAsync({ SessionId: lr.SessionId }).catch(() => {});
