// -----------------------------------------------------------------------------
// CREATECONTAINER TANI — palet numarası hangi alanda dönüyor?
// -----------------------------------------------------------------------------
// ⚠ VERİ YAZAR: boş bir palet (konteyner) oluşturur. Stok OYNATMAZ.
// Amaç: dönen TÜM tabloları ve TÜM alanları dökmek; palet numarasının
// hangi alanda geldiğini bulmak. SavePick'e PSCONTSTOCKPLACE olarak o gidecek.
//
// Depo (PSWAREHOUSE) = emirden gelen WAREHOUSETA; yoksa 10 (Bora örneği).
//
//   node test/createcontainer-teshis.mjs
//   node test/createcontainer-teshis.mjs 10        ← depoyu elle ver
// -----------------------------------------------------------------------------

import { CFG, cagir, kapat, baslik, cizgi } from "./ortak.mjs";
const C = { PSCOMPANY: CFG.company, PSPLANT: CFG.plant };

baslik("CREATECONTAINER TANI — palet no hangi alanda?");

// Depoyu emirden çek (WAREHOUSETA), yoksa argüman ya da 10
let depo = process.argv[2];
if (!depo) {
  const liste = await cagir("MZYListingPick", {
    ...C, PSWORKER: "%", PISTATUS: 0, PIISPICK: 1,
    PDSTARTDATE: "01.01.1975", PDENDDATE: "01.01.2100",
    PIISDELETE: 0, PIISSTARTED: 1, PIORDER: 0,
  });
  const emir = (liste.tablolar.TBLPOLIST ?? [])[0];
  if (emir) {
    const enter = await cagir("MZYEnterPick", {
      ...C, PSORDERNUM: emir.ORDERNUM, PSORDERTYPE: emir.ORDERTYPE,
    });
    const k = (enter.tablolar.IASWMSPOITEM ?? enter.tablolar.TBLWMSPO ?? [])[0];
    depo = k?.WAREHOUSETA;
  }
}
depo = depo || "10";

console.log(`\n  PSWAREHOUSE=${depo}  PSMATERIAL=KONPAKET\n`);

const r = await cagir("MZYCreateContainer", {
  ...C, PSWAREHOUSE: depo, PSMATERIAL: "KONPAKET",
});

console.log("  giden: " + r.giden);
if (r.hata) { console.log("  ✗ HATA: " + r.hata); await kapat(); process.exit(1); }

console.log("\n" + cizgi());
console.log("  DÖNEN HAM JSON:");
console.log("  " + (r.ham || "(boş)").slice(0, 800));

console.log("\n" + cizgi());
console.log("  DÖNEN TABLOLAR VE ALANLAR:");
const adlar = Object.keys(r.tablolar);
if (!adlar.length) console.log("  · hiç tablo dönmedi");
for (const ad of adlar) {
  const rows = r.tablolar[ad];
  console.log(`\n  [${ad}] — ${rows.length} satır`);
  rows.slice(0, 3).forEach((row, i) => {
    console.log(`    satır ${i}:`);
    for (const [k, v] of Object.entries(row)) {
      const aday = /cont|palet|pallet|hu|stockplace|number|no\b|barcode/i.test(k);
      console.log(`      ${aday ? "»" : " "} ${k.padEnd(16)} = ${v === "" ? "∅" : v}`);
    }
  });
}
if (r.mesaj) console.log(`\n  mesaj: ${r.mesaj}`);

console.log("\n" + cizgi());
console.log("  » ile işaretli alanlardan hangisi palet numarasıysa,");
console.log("  client.ts placeInPackage o alanı okuyacak (şu an CONTAINER/STOCKPLACE/HU deniyor).");
console.log(cizgi());
await kapat();
