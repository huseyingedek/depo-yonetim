// -----------------------------------------------------------------------------
// AVAILSTOCK — kendi tarafımızı ele: TÜM alanları ve alternatif param adlarını dök
// -----------------------------------------------------------------------------
// Amaç: hata bizde mi? Üç şeyi kontrol eder:
//   1. Dönen satırın TÜM alanları — stoğu taşıyan başka alan var mı?
//   2. Farklı parti parametre adları (PSBATCHNUM/PSBATCH/PSLOT/PSCHARGE)
//   3. Ham JSON — parser bir şey mi kaçırıyor?
//
//   node test/availstock-tumalanlar.mjs
// -----------------------------------------------------------------------------

import { CFG, cagir, kapat, baslik, cizgi } from "./ortak.mjs";
const C = { PSCOMPANY: CFG.company, PSPLANT: CFG.plant };
const RAF = { PSWAREHOUSE: "D3", PSSTOCKPLACE: "C1" };
const MAT = "UD009", PARTI = "11202027", BARKOD = "UD009$*$";

baslik("AVAILSTOCK — kendi tarafımızı ele");

/* 1. Başarılı satırın TÜM alanları -------------------------------------- */
console.log("\n  1) DÖNEN SATIRIN TÜM ALANLARI (parti dolu):");
const r = await cagir("MZYReadBarcode", {
  ...C, ...RAF, PSBATCHNUM: PARTI, PSBARCODE: BARKOD, PDCQUANTITY: 1,
});
const s = (r.tablolar.WMSXMLTABLE ?? []).find((x) => x.MATERIAL);
if (s) {
  for (const [k, v] of Object.entries(s)) {
    const stokAlani = /stock|stok|avail|qty|quant|total|miktar|bakiye/i.test(k);
    console.log(`     ${stokAlani ? "»" : " "} ${k.padEnd(16)} = ${v}`);
  }
} else {
  console.log("     ✗ başarılı satır yok:", r.mesaj);
}

/* 2. Ham JSON ------------------------------------------------------------ */
console.log("\n  2) HAM JSON (parser kaçırıyor mu?):");
console.log("     " + (r.ham || "").slice(0, 600));

/* 3. Alternatif parti parametre adları ----------------------------------- */
console.log("\n  3) ALTERNATİF PARTİ PARAMETRE ADLARI:");
const adlar = ["PSBATCHNUM", "PSBATCH", "PSLOT", "PSCHARGE", "PSBATCHNO", "PSSERIAL"];
for (const ad of adlar) {
  const rr = await cagir("MZYReadBarcode", {
    ...C, ...RAF, [ad]: PARTI, PSBARCODE: BARKOD, PDCQUANTITY: 1,
  });
  const ss = (rr.tablolar.WMSXMLTABLE ?? []).find((x) => x.MATERIAL);
  const a = ss ? ss.AVAILSTOCK : "—";
  const bn = ss ? ss.BATCHNUM : "—";
  console.log(`     ${ad.padEnd(12)} → AVAILSTOCK=${String(a).padEnd(8)} BATCHNUM=${bn}` +
    (Number(a) > 0 ? "  ✓✓✓" : ""));
}

console.log("\n" + cizgi());
console.log("  » ile işaretli alan stok taşıyor olabilir.");
console.log("  Bir param adı ✓ verirse parti adını yanlış yolluyormuşuz demektir.");
console.log(cizgi());
await kapat();
