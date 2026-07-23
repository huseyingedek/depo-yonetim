// -----------------------------------------------------------------------------
// AVAILSTOCK — parametre süpürme. Farklı param setleriyle stok gelir mi?
// -----------------------------------------------------------------------------
// 7 param doğru gidiyor ama AVAILSTOCK=0. Belki eksik/fazla param var.
// Bu script farklı kombinasyonları dener; herhangi biri >0 verirse yakaladık.
//
//   node test/availstock-suzgec.mjs
// -----------------------------------------------------------------------------

import { CFG, cagir, kapat, baslik, cizgi } from "./ortak.mjs";
const CO = CFG.company, PL = CFG.plant;
const MAT = "UD009", PARTI = "11202027", BARKOD = "UD009$*$";
const D = "D3", SK = "C1";

baslik("AVAILSTOCK PARAMETRE SÜPÜRME");

const setler = [
  ["taban (7 param)", {
    PSCOMPANY: CO, PSPLANT: PL, PSWAREHOUSE: D, PSSTOCKPLACE: SK,
    PSBATCHNUM: PARTI, PSBARCODE: BARKOD, PDCQUANTITY: 1 }],

  ["+ PSSPECIALSTOCK boş", {
    PSCOMPANY: CO, PSPLANT: PL, PSWAREHOUSE: D, PSSTOCKPLACE: SK,
    PSBATCHNUM: PARTI, PSBARCODE: BARKOD, PDCQUANTITY: 1, PSSPECIALSTOCK: "" }],

  ["+ PSSPECIALSTOCK %", {
    PSCOMPANY: CO, PSPLANT: PL, PSWAREHOUSE: D, PSSTOCKPLACE: SK,
    PSBATCHNUM: PARTI, PSBARCODE: BARKOD, PDCQUANTITY: 1, PSSPECIALSTOCK: "%" }],

  ["+ PSMATERIAL de", {
    PSCOMPANY: CO, PSPLANT: PL, PSWAREHOUSE: D, PSSTOCKPLACE: SK,
    PSBATCHNUM: PARTI, PSBARCODE: BARKOD, PDCQUANTITY: 1, PSMATERIAL: MAT }],

  ["depo/stok yeri BOŞ (firma geneli?)", {
    PSCOMPANY: CO, PSPLANT: PL, PSWAREHOUSE: "", PSSTOCKPLACE: "",
    PSBATCHNUM: PARTI, PSBARCODE: BARKOD, PDCQUANTITY: 1 }],

  ["stok yeri BOŞ, depo dolu", {
    PSCOMPANY: CO, PSPLANT: PL, PSWAREHOUSE: D, PSSTOCKPLACE: "",
    PSBATCHNUM: PARTI, PSBARCODE: BARKOD, PDCQUANTITY: 1 }],

  ["PDCQUANTITY yok", {
    PSCOMPANY: CO, PSPLANT: PL, PSWAREHOUSE: D, PSSTOCKPLACE: SK,
    PSBATCHNUM: PARTI, PSBARCODE: BARKOD }],

  ["tesis 01 (firma ile aynı)", {
    PSCOMPANY: CO, PSPLANT: "01", PSWAREHOUSE: D, PSSTOCKPLACE: SK,
    PSBATCHNUM: PARTI, PSBARCODE: BARKOD, PDCQUANTITY: 1 }],

  ["firma 100 (tesis ile aynı)", {
    PSCOMPANY: "100", PSPLANT: PL, PSWAREHOUSE: D, PSSTOCKPLACE: SK,
    PSBATCHNUM: PARTI, PSBARCODE: BARKOD, PDCQUANTITY: 1 }],
];

for (const [etiket, params] of setler) {
  const r = await cagir("MZYReadBarcode", params);
  const s = (r.tablolar.WMSXMLTABLE ?? []).find((x) => x.MATERIAL);
  if (!s) {
    console.log(`  ✗ ${etiket.padEnd(36)} çözülemedi  ${(r.mesaj || "").slice(0, 40)}`);
    continue;
  }
  const a = Number(s.AVAILSTOCK ?? 0);
  console.log(
    `  ${a > 0 ? "✓✓✓" : "·  "} ${etiket.padEnd(36)}` +
      ` AVAILSTOCK=${String(a).padEnd(8)} QTY=${s.QUANTITY} BATCH=${s.BATCHNUM}`
  );
}

console.log("\n" + cizgi());
console.log("  ✓✓✓ olan bir set varsa param eksikliği bizdeymiş — onu kullanırız.");
console.log("  Hepsi 0 ise param meselesi değil, servis içi hesap; Bora'da.");
console.log(cizgi());
await kapat();
