// -----------------------------------------------------------------------------
// CREATECONTAINER SÜPÜRME — farklı depo/malzeme, numara dönen var mı?
// -----------------------------------------------------------------------------
// ⚠ VERİ YAZAR: her satır bir palet oluşturur (stok oynatmaz).
// Boş TBLMESSAGE dışında bir şey dönen kombinasyon arıyoruz.
//
//   node test/createcontainer-suzgec.mjs
// -----------------------------------------------------------------------------

import { CFG, cagir, kapat, baslik, cizgi } from "./ortak.mjs";
const C = { PSCOMPANY: CFG.company, PSPLANT: CFG.plant };

baslik("CREATECONTAINER SÜPÜRME");

const setler = [
  ["depo 10 / KONPAKET",   { PSWAREHOUSE: "10", PSMATERIAL: "KONPAKET" }],
  ["depo D3 / KONPAKET",   { PSWAREHOUSE: "D3", PSMATERIAL: "KONPAKET" }],
  ["depo D1 / KONPAKET",   { PSWAREHOUSE: "D1", PSMATERIAL: "KONPAKET" }],
  ["depo 100 / KONPAKET",  { PSWAREHOUSE: "100", PSMATERIAL: "KONPAKET" }],
  ["depo 10 / KONPALET",   { PSWAREHOUSE: "10", PSMATERIAL: "KONPALET" }],
  ["depo 10 / malzeme boş",{ PSWAREHOUSE: "10", PSMATERIAL: "" }],
  ["depo 10 / PALET",      { PSWAREHOUSE: "10", PSMATERIAL: "PALET" }],
];

for (const [etiket, p] of setler) {
  const r = await cagir("MZYCreateContainer", { ...C, ...p });
  const adlar = Object.keys(r.tablolar);
  // Palet numarası olabilecek dolu bir değer var mı?
  let bulunan = "";
  for (const ad of adlar) {
    for (const row of r.tablolar[ad]) {
      for (const [k, v] of Object.entries(row)) {
        if (v && String(v).trim() && String(v) !== "0") {
          bulunan += ` ${ad}.${k}=${v}`;
        }
      }
    }
  }
  const hamKisa = (r.ham || "").replace(/\s+/g, "").slice(0, 90);
  console.log(
    `  ${bulunan ? "✓✓✓" : "·  "} ${etiket.padEnd(22)}` +
      ` tablolar: ${adlar.join(",") || "yok"}${bulunan || ""}`
  );
  if (r.hata) console.log(`       ✗ ${r.hata}`);
  else if (!bulunan) console.log(`       ham: ${hamKisa}`);
}

console.log("\n" + cizgi());
console.log("  ✓✓✓ olan satırda palet numarası dönmüş demektir.");
console.log("  Hepsi boşsa CreateContainer numara döndürmüyor — Bora'da.");
console.log(cizgi());
await kapat();
