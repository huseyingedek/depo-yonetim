// -----------------------------------------------------------------------------
// AVAILSTOCK — parti nasıl gönderilmeli? Tüm kombinasyonlar
// -----------------------------------------------------------------------------
// Bora: "parti boş/* değilse AVAILSTOCK doluyor." Ama PSBATCHNUM=11202027
// gönderince yine 0 geldi. İki ihtimal:
//   a) parti PSBATCHNUM alanında değil, BARKODUN içinde gitmeli (UD009$parti$)
//   b) barkodtaki "*" dış PSBATCHNUM'ı eziyor
// Bu script UD009 için tüm kombinasyonları dener.
//
//   node test/availstock-parti.mjs
// -----------------------------------------------------------------------------

import { CFG, cagir, kapat, baslik, cizgi } from "./ortak.mjs";

const C = { PSCOMPANY: CFG.company, PSPLANT: CFG.plant };
const DEPO = "D3", STOK = "C1", MAT = "UD009", PARTI = "11202027";

baslik(`AVAILSTOCK PARTİ KOMBİNASYONLARI — ${MAT} @ ${DEPO}$${STOK} parti ${PARTI}`);

const denemeler = [
  ["barkod UD009$*$      + PSBATCHNUM boş",   `${MAT}$*$`,        ""],
  ["barkod UD009$*$      + PSBATCHNUM parti", `${MAT}$*$`,        PARTI],
  ["barkod UD009$parti$  + PSBATCHNUM boş",   `${MAT}$${PARTI}$`, ""],
  ["barkod UD009$parti$  + PSBATCHNUM parti", `${MAT}$${PARTI}$`, PARTI],
  ["barkod UD009         + PSBATCHNUM parti", `${MAT}`,           PARTI],
  ["barkod UD009$$parti  + PSBATCHNUM boş",   `${MAT}$$${PARTI}`, ""],
];

for (const [etiket, barkod, parti] of denemeler) {
  const b = await cagir("MZYReadBarcode", {
    ...C, PSWAREHOUSE: DEPO, PSSTOCKPLACE: STOK,
    PSBATCHNUM: parti, PSBARCODE: barkod, PDCQUANTITY: 1,
  });
  const s = (b.tablolar.WMSXMLTABLE ?? []).find((x) => x.MATERIAL);
  if (!s) {
    console.log(`  ✗ ${etiket.padEnd(42)} çözülemedi  ${b.mesaj || ""}`);
    continue;
  }
  const a = Number(s.AVAILSTOCK ?? 0);
  console.log(
    `  ${a > 0 ? "✓" : "·"} ${etiket.padEnd(42)}` +
      ` AVAILSTOCK=${String(a).padEnd(9)} BATCHNUM=${s.BATCHNUM ?? "—"} QTY=${s.QUANTITY}`
  );
}

console.log("\n" + cizgi());
console.log("  ✓ olan satır varsa parti o biçimde gönderilmeli.");
console.log("  Hiçbiri değilse Bora'nın düzeltmesi henüz yayında değil olabilir.");
console.log(cizgi());
await kapat();
