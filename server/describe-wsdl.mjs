// -----------------------------------------------------------------------------
// Bir WSDL'in operasyonlarını ve parametre şemalarını dök
// -----------------------------------------------------------------------------
// Kullanım:
//   node describe-wsdl.mjs                       → server/.env'deki adres
//   node describe-wsdl.mjs <wsdl-adresi>         → verilen adres
//
// Örnek:
//   node describe-wsdl.mjs http://192.168.22.16:8080/CaniasWS-v1/services/iasWebService?wsdl
// -----------------------------------------------------------------------------

import soap from "soap";
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), ".env") });

const url = process.argv[2] || process.env.CANIAS_WSDL_URL;
if (!url) {
  console.error("WSDL adresi verilmedi.");
  process.exit(1);
}

console.log("WSDL:", url, "\n");

let client;
try {
  client = await soap.createClientAsync(url, { timeout: 20000 });
} catch (e) {
  console.error("✗ WSDL okunamadı:", e?.message || e);
  process.exit(1);
}

const desc = client.describe();

for (const [svcName, svc] of Object.entries(desc)) {
  for (const [portName, port] of Object.entries(svc)) {
    console.log("═".repeat(78));
    console.log(`SERVİS: ${svcName}   PORT: ${portName}`);
    console.log("═".repeat(78));
    const ops = Object.keys(port);
    console.log(`\nOperasyonlar (${ops.length}): ${ops.join(", ")}\n`);

    for (const [opName, op] of Object.entries(port)) {
      console.log("─".repeat(78));
      console.log(`▶ ${opName}`);
      console.log("  GİRDİ :", JSON.stringify(op.input, null, 2).replace(/\n/g, "\n  "));
      console.log("  ÇIKTI :", JSON.stringify(op.output, null, 2).replace(/\n/g, "\n  "));
    }
  }
}

console.log("\n" + "═".repeat(78));
console.log("Bu listeyi v2 ile karşılaştır — hangi operasyon hangi işi yapıyor?");
console.log("═".repeat(78));
