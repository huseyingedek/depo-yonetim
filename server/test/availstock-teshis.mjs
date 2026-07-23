// -----------------------------------------------------------------------------
// AVAILSTOCK teşhis — TÜM raflar, TÜM kalemler, parti dolu/boş
// -----------------------------------------------------------------------------
// suggest servisi stoğu görüyor (TOTAL>0) ama ReadBarcode AVAILSTOCK=0 dönüyor.
// Şüpheyi tamamen kaldırmak için:
//   - HER kalemin HER öneri rafını dene (filtre yok, slice yok)
//   - AVAILSTOCK'u hem parti BOŞ hem suggest'ten gelen PARTİ ile oku
//   - suggest.TOTAL ile ReadBarcode.AVAILSTOCK'u yan yana bas
//
// Çalıştırma:  node test/availstock-teshis.mjs
//              node test/availstock-teshis.mjs --emir=26935024
// -----------------------------------------------------------------------------

import { CFG, cagir, kapat, baslik, adim, cizgi } from "./ortak.mjs";

const EMIR = (process.argv.find((a) => a.startsWith("--emir=")) ?? "").split("=")[1];
const C = { PSCOMPANY: CFG.company, PSPLANT: CFG.plant };

baslik("AVAILSTOCK TEŞHİS — TÜM raflar denenir");

const liste = await cagir("MZYListingPick", {
  ...C, PSWORKER: "%", PISTATUS: 0, PIISPICK: 1,
  PDSTARTDATE: "01.01.1975", PDENDDATE: "01.01.2100",
  PIISDELETE: 0, PIISSTARTED: 1, PIORDER: 0,
});
const emirler = liste.tablolar.TBLPOLIST ?? [];
if (!emirler.length) { console.log("  ✗ Açık emir yok."); await kapat(); process.exit(0); }
const secili = EMIR ? emirler.find((e) => e.ORDERNUM === EMIR) : emirler[0];
const E = { PSORDERNUM: secili.ORDERNUM, PSORDERTYPE: secili.ORDERTYPE };
console.log(`  emir: ${E.PSORDERNUM} / ${E.PSORDERTYPE}`);

const enter = await cagir("MZYEnterPick", { ...C, ...E });
const kalemler = enter.tablolar.IASWMSPOITEM ?? enter.tablolar.TBLWMSPO ?? [];
console.log(`  ${kalemler.length} kalem`);

/** AVAILSTOCK'u bir rafta belirli parti ile oku */
async function oku(material, warehouse, stockPlace, batch) {
  const b = await cagir("MZYReadBarcode", {
    ...C, PSWAREHOUSE: warehouse, PSSTOCKPLACE: stockPlace,
    PSBATCHNUM: batch, PSBARCODE: `${material}$*$`, PDCQUANTITY: 1,
  });
  const s = (b.tablolar.WMSXMLTABLE ?? []).find((x) => x.MATERIAL);
  return s ? { avail: Number(s.AVAILSTOCK ?? 0), batchDonen: s.BATCHNUM ?? "" } : null;
}

let toplamRaf = 0, dolu = 0;

for (const k of kalemler) {
  const s = await cagir("MZYCrtSuggestListPickFromSP", { ...C, ...E, PIITEMNO: k.ITEMNO });
  const oneriler = s.tablolar.SUGGESTEDLISTFROM ?? [];
  console.log("\n" + cizgi());
  console.log(`  ITEMNO ${k.ITEMNO}  ${k.MATERIAL}  — ${oneriler.length} öneri rafı`);
  if (!oneriler.length) { console.log("    · öneri yok"); continue; }

  for (const o of oneriler) {
    toplamRaf++;
    const raf = `${o.WAREHOUSE}$${o.STOCKPLACE}`;
    const parti = o.BATCHNUM && o.BATCHNUM !== "*" ? o.BATCHNUM : "";

    const bos = await oku(k.MATERIAL, o.WAREHOUSE, o.STOCKPLACE, "");
    const ileParti = parti ? await oku(k.MATERIAL, o.WAREHOUSE, o.STOCKPLACE, parti) : null;

    const aBos = bos ? bos.avail : "—";
    const aParti = ileParti ? ileParti.avail : (parti ? "—" : "·");
    if ((bos && bos.avail > 0) || (ileParti && ileParti.avail > 0)) dolu++;

    console.log(
      `    ${raf.padEnd(12)} TOTAL=${String(o.TOTAL).padEnd(9)}` +
        ` parti[${(parti || "—").padEnd(8)}]` +
        ` AVAIL(boş)=${String(aBos).padEnd(8)} AVAIL(parti)=${String(aParti).padEnd(8)}` +
        (((bos && bos.avail > 0) || (ileParti && ileParti.avail > 0)) ? "✓" : "✗ 0")
    );
  }
}

console.log("\n" + cizgi());
console.log(`  Denenen raf: ${toplamRaf}   AVAILSTOCK dolu gelen: ${dolu}`);
if (dolu === 0) {
  console.log("  → Hiçbir rafta, hiçbir parti biçiminde AVAILSTOCK dolmuyor.");
  console.log("    suggest.TOTAL stoğu gösterirken ReadBarcode 0 dönüyor.");
  console.log("    Şüphe kalmadı: MZYReadBarcode.AVAILSTOCK hesabı hatalı.");
} else {
  console.log(`  → ${dolu} rafta AVAILSTOCK doldu — biçim/parti farkı önemliymiş.`);
}
console.log(cizgi());
await kapat();
