// -----------------------------------------------------------------------------
// UYGULAMA BİREBİR — app'in gönderdiği TAM parametrelerle AVAILSTOCK gelir mi?
// -----------------------------------------------------------------------------
// Bora'nın resmi spec'i: MZYReadBarcode yalnızca
//   PSCOMPANY, PSPLANT, PSBARCODE, PSWAREHOUSE, PSSTOCKPLACE, PDCQUANTITY
// Batch/specialstock YOK. Uygulama artık tam bunu gönderiyor.
// Bu script birebir aynısını yollar; 240 gelmeli.
//
//   node test/app-birebir.mjs
// -----------------------------------------------------------------------------

import { CFG, cagir, kapat, baslik, cizgi } from "./ortak.mjs";
const C = { PSCOMPANY: CFG.company, PSPLANT: CFG.plant };

baslik("UYGULAMA BİREBİR — batch/specialstock YOK");

const barkodlar = [
  ["UD009$*$", "parti takipli (eskiden 0 dönüyordu)"],
  ["NC063$*$", "partisiz"],
  ["NC210$*$", "partisiz"],
  ["8690723511208", "EAN — UD009"],
];

for (const [barkod, not] of barkodlar) {
  const r = await cagir("MZYReadBarcode", {
    ...C, PSWAREHOUSE: "D3", PSSTOCKPLACE: "C1",
    PSBARCODE: barkod, PDCQUANTITY: 1,   // ← app'in gönderdiği tam set
  });
  const s = (r.tablolar.WMSXMLTABLE ?? []).find((x) => x.MATERIAL);
  const a = s ? Number(s.AVAILSTOCK ?? 0) : "—";
  console.log(
    `  ${Number(a) > 0 ? "✓" : "✗"} ${barkod.padEnd(16)} ` +
    `AVAILSTOCK=${String(a).padEnd(8)} QTY=${s?.QUANTITY ?? "—"}  ${not}`
  );
}
console.log("\n" + cizgi());
console.log("  Hepsi ✓ ise uygulama gerçek stoğu görüyor demektir — AVAILSTOCK kapandı.");
console.log(cizgi());
await kapat();
