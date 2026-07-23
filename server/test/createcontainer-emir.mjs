// -----------------------------------------------------------------------------
// CREATECONTAINER + EMİR — order bilgisi eklersek palet numarası döner mi?
// -----------------------------------------------------------------------------
// ⚠ VERİ YAZAR (palet oluşturur, stok oynatmaz).
// Spec'te yok ama boş dönüyor; PSORDERNUM/PSORDERTYPE ekleyip deniyoruz.
//
//   node test/createcontainer-emir.mjs
// -----------------------------------------------------------------------------

import { CFG, cagir, kapat, baslik, cizgi } from "./ortak.mjs";
const C = { PSCOMPANY: CFG.company, PSPLANT: CFG.plant };

baslik("CREATECONTAINER + EMİR BİLGİSİ");

// Gerçek bir emir çek
const liste = await cagir("MZYListingPick", {
  ...C, PSWORKER: "%", PISTATUS: 0, PIISPICK: 1,
  PDSTARTDATE: "01.01.1975", PDENDDATE: "01.01.2100",
  PIISDELETE: 0, PIISSTARTED: 1, PIORDER: 0,
});
const emir = (liste.tablolar.TBLPOLIST ?? [])[0];
const ON = emir?.ORDERNUM ?? "26935028";
const OT = emir?.ORDERTYPE ?? "SO";
console.log(`  emir: ${ON} / ${OT}\n`);

const setler = [
  ["taban (spec)", { PSWAREHOUSE: "10", PSMATERIAL: "KONPAKET" }],
  ["+ ORDERNUM/ORDERTYPE", { PSWAREHOUSE: "10", PSMATERIAL: "KONPAKET", PSORDERNUM: ON, PSORDERTYPE: OT }],
  ["+ ORDER (kısa)", { PSWAREHOUSE: "10", PSMATERIAL: "KONPAKET", PSORDER: ON }],
  ["+ DOCNUM/DOCTYPE", { PSWAREHOUSE: "10", PSMATERIAL: "KONPAKET", PSDOCNUM: ON, PSDOCTYPE: OT }],
];

for (const [etiket, p] of setler) {
  const r = await cagir("MZYCreateContainer", { ...C, ...p });
  const adlar = Object.keys(r.tablolar);
  let dolu = "";
  for (const ad of adlar)
    for (const row of r.tablolar[ad])
      for (const [k, v] of Object.entries(row))
        if (v && String(v).trim() && String(v) !== "0") dolu += ` ${ad}.${k}=${v}`;
  console.log(`  ${dolu ? "✓✓✓" : "·  "} ${etiket.padEnd(24)} ham: ${(r.ham||"").replace(/\s+/g,"").slice(0,80)}${dolu||""}`);
  if (r.mesaj) console.log(`       mesaj: ${r.mesaj}`);
}

console.log("\n" + cizgi());
console.log("  ✓✓✓ olan sette palet numarası dönmüş demektir → o parametreleri ekleriz.");
console.log("  Hepsi boşsa emir bilgisi de çözmüyor, kesinlikle CreateContainer'da (Bora).");
console.log(cizgi());
await kapat();
