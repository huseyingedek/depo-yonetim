// -----------------------------------------------------------------------------
// AVAILSTOCK — Bora: "sebep specialstock, onu da yolla"
// -----------------------------------------------------------------------------
// Boş/% işe yaramadı. Doğru DEĞERİ göndermek lazım. Bu script:
//   1. Emre girip UD009 kaleminin SPECIALSTOCK değerini alır
//   2. suggest'ten SPECIALSTOCK/BATCHNUM'ı alır
//   3. ReadBarcode'u gerçek SPECIALSTOCK + gerçek parti ile çağırır
//   4. Farklı param adlarını (PSSPECIALSTOCK/PSSPECIAL/PSSTOCKTYPE) dener
//
//   node test/availstock-specialstock.mjs
// -----------------------------------------------------------------------------

import { CFG, cagir, kapat, baslik, cizgi } from "./ortak.mjs";
const C = { PSCOMPANY: CFG.company, PSPLANT: CFG.plant };

baslik("AVAILSTOCK — SPECIALSTOCK ile");

// 1. Emir + kalemler
const liste = await cagir("MZYListingPick", {
  ...C, PSWORKER: "%", PISTATUS: 0, PIISPICK: 1,
  PDSTARTDATE: "01.01.1975", PDENDDATE: "01.01.2100",
  PIISDELETE: 0, PIISSTARTED: 1, PIORDER: 0,
});
const emir = (liste.tablolar.TBLPOLIST ?? [])[0];
if (!emir) { console.log("✗ emir yok"); await kapat(); process.exit(0); }
const E = { PSORDERNUM: emir.ORDERNUM, PSORDERTYPE: emir.ORDERTYPE };
console.log(`  emir ${E.PSORDERNUM}`);

const enter = await cagir("MZYEnterPick", { ...C, ...E });
const kalemler = enter.tablolar.IASWMSPOITEM ?? enter.tablolar.TBLWMSPO ?? [];
const kUD = kalemler.find((k) => k.MATERIAL === "UD009") ?? kalemler[0];
console.log(`  kalem ${kUD.MATERIAL}  SPECIALSTOCK=[${kUD.SPECIALSTOCK ?? ""}]  ITEMNO ${kUD.ITEMNO}`);

// 2. suggest'ten raf/parti/specialstock
const sug = await cagir("MZYCrtSuggestListPickFromSP", { ...C, ...E, PIITEMNO: kUD.ITEMNO });
const o = (sug.tablolar.SUGGESTEDLISTFROM ?? [])[0] ?? {};
console.log(`  suggest: raf ${o.WAREHOUSE}$${o.STOCKPLACE}  parti ${o.BATCHNUM}  SPECIALSTOCK=[${o.SPECIALSTOCK ?? ""}]  TOTAL ${o.TOTAL}`);

const D = o.WAREHOUSE ?? "D3", SK = o.STOCKPLACE ?? "C1";
const PARTI = o.BATCHNUM && o.BATCHNUM !== "*" ? o.BATCHNUM : "11202027";
const SS_KALEM = kUD.SPECIALSTOCK ?? "";
const SS_SUG = o.SPECIALSTOCK ?? "";

// 3. Denenecek specialstock değerleri (kalemden, suggest'ten, sabitler)
const ssDegerleri = [...new Set([SS_KALEM, SS_SUG, "", "%", "V", "K", "E", "0"].filter((v) => v !== undefined))];
const paramAdlari = ["PSSPECIALSTOCK", "PSSPECIAL", "PSSTOCKTYPE"];

console.log("\n  " + cizgi());
for (const ad of paramAdlari) {
  for (const ss of ssDegerleri) {
    const r = await cagir("MZYReadBarcode", {
      ...C, PSWAREHOUSE: D, PSSTOCKPLACE: SK,
      PSBATCHNUM: PARTI, PSBARCODE: `${kUD.MATERIAL}$*$`, PDCQUANTITY: 1,
      [ad]: ss,
    });
    const s = (r.tablolar.WMSXMLTABLE ?? []).find((x) => x.MATERIAL);
    const a = s ? Number(s.AVAILSTOCK ?? 0) : "—";
    console.log(
      `  ${Number(a) > 0 ? "✓✓✓" : "·  "} ${ad.padEnd(14)} = [${String(ss).padEnd(8)}]` +
        ` AVAILSTOCK=${String(a).padEnd(8)} BATCH=${s?.BATCHNUM ?? "—"}`
    );
  }
}
console.log("  " + cizgi());
console.log("  ✓✓✓ olan satırdaki param adı + değeri uygulamaya konur.");
await kapat();
