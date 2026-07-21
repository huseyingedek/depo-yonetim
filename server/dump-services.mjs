// -----------------------------------------------------------------------------
// listServices ham çıktısı — parametre tanımı içeriyor mu?
// -----------------------------------------------------------------------------
// Servis listesini daha önce aldık ama HAM yapısına hiç bakmadık.
// TROIA bazı kurulumlarda servis parametrelerini de burada döndürür.
//
// Çalıştırma:  node dump-services.mjs
// Çıktı ayrıca services-raw.json dosyasına yazılır.
// -----------------------------------------------------------------------------

import soap from "soap";
import dotenv from "dotenv";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(HERE, ".env") });

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

const client = await soap.createClientAsync(CANIAS_WSDL_URL, { timeout: 30000 });
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
console.log("✓ Login OK\n");

const [res] = await client.listServicesAsync({ SessionId: lr.SessionId });
const data = val(res?.listServicesReturn ?? res);

const out = join(HERE, "services-raw.json");
writeFileSync(out, JSON.stringify(data, null, 2), "utf-8");
console.log("Ham çıktı yazıldı:", out);

// Ham SOAP yanıtı da faydalı olabilir
const rawOut = join(HERE, "services-raw.xml");
writeFileSync(rawOut, String(client.lastResponse || ""), "utf-8");
console.log("Ham SOAP yanıtı  :", rawOut);

console.log("\n" + "═".repeat(74));
console.log("Üst düzey yapı");
console.log("═".repeat(74));
console.log(
  Array.isArray(data) ? `dizi, ${data.length} eleman` : typeof data === "object" ? Object.keys(data) : typeof data
);

// MZYListingPick geçen her yeri göster
const text = JSON.stringify(data, null, 1);
console.log("\n" + "═".repeat(74));
console.log("MZYListingPick geçen satırlar (±25 satır bağlam)");
console.log("═".repeat(74));
const lines = text.split("\n");
const hits = lines.map((l, i) => (/MZYListingPick/i.test(l) ? i : -1)).filter((i) => i >= 0);
if (!hits.length) {
  console.log("(bulunamadı)");
  console.log("\nİlk 60 satır:");
  console.log(lines.slice(0, 60).join("\n"));
} else {
  for (const i of hits.slice(0, 3)) {
    console.log(lines.slice(Math.max(0, i - 5), i + 25).join("\n"));
    console.log("-".repeat(60));
  }
}

// Parametre kelimesi geçiyor mu?
console.log("\n" + "═".repeat(74));
console.log("İçerik ipuçları");
console.log("═".repeat(74));
for (const kw of ["PARAM", "INPUT", "FIELD", "COLUMN", "TYPE", "SIGNATURE"]) {
  const n = (text.match(new RegExp(kw, "gi")) || []).length;
  console.log(`${kw.padEnd(10)} ${n} kez`);
}

await client.logoutAsync({ SessionId: lr.SessionId }).catch(() => {});
