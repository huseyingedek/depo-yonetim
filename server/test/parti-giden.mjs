// Giden XML'i göster — PSBATCHNUM gerçekten dolu gidiyor mu?
import { CFG, cagir, kapat, baslik, cizgi } from "./ortak.mjs";
const C = { PSCOMPANY: CFG.company, PSPLANT: CFG.plant };

baslik("GİDEN XML KONTROL — PSBATCHNUM dolu mu?");
const r = await cagir("MZYReadBarcode", {
  ...C, PSWAREHOUSE: "D3", PSSTOCKPLACE: "C1",
  PSBATCHNUM: "11202027", PSBARCODE: "UD009$*$", PDCQUANTITY: 1,
});
console.log("\n  GİDEN:");
console.log("  " + r.giden);
const s = (r.tablolar.WMSXMLTABLE ?? []).find((x) => x.MATERIAL);
console.log("\n  DÖNEN:");
console.log(`  AVAILSTOCK=${s?.AVAILSTOCK}  BATCHNUM=${s?.BATCHNUM}  MATERIAL=${s?.MATERIAL}`);
console.log("\n" + cizgi());
console.log("  GİDEN'de <PSBATCHNUM>11202027</PSBATCHNUM> görünüyorsa biz doğru");
console.log("  gönderiyoruz demektir; sorun servis tarafında okumada.");
console.log(cizgi());
await kapat();
