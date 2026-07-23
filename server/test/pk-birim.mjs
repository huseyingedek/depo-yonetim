// -----------------------------------------------------------------------------
// PK BİRİM TEŞHİS — 72'li mendil: sipariş PK, stok AD. Katsayı ne, MOVEQTY ne?
// -----------------------------------------------------------------------------
// Sorular:
//   1. Barkod 8692857012873 katsayısı kaç? (PDCQUANTITY=1 → QUANTITY=?)
//   2. ReadBarcode UNIT / SKUNIT ne? (PK mı AD mı döner)
//   3. Siparişte PPL02 kaleminin MOVEQTY'si ve birimi ne? (2 PK mı, 144 AD mi)
//
//   node test/pk-birim.mjs
// -----------------------------------------------------------------------------

import { CFG, cagir, kapat, baslik, cizgi } from "./ortak.mjs";
const C = { PSCOMPANY: CFG.company, PSPLANT: CFG.plant };
const BARKOD = "8692857012873";
const MALZEME = "PPL02";

baslik("PK BİRİM TEŞHİS — 72'li mendil");

// 1-2. Barkodu oku: katsayı ve birim
console.log("\n  BARKOD OKUMA (D3$C1):");
for (const q of [1, 2]) {
  const r = await cagir("MZYReadBarcode", {
    ...C, PSWAREHOUSE: "D3", PSSTOCKPLACE: "C1",
    PSBARCODE: BARKOD, PDCQUANTITY: q,
  });
  const s = (r.tablolar.WMSXMLTABLE ?? []).find((x) => x.MATERIAL);
  if (!s) { console.log(`    PDCQUANTITY=${q} → çözülemedi ${r.mesaj||""}`); continue; }
  console.log(
    `    PDCQUANTITY=${q} → QUANTITY=${s.QUANTITY}  UNIT=${s.UNIT}  SKUNIT=${s.SKUNIT}  AVAILSTOCK=${s.AVAILSTOCK}`
  );
}

// 3. PPL02 kalemini içeren emri bul, MOVEQTY/birim göster
console.log("\n  SİPARİŞ KALEMİ (PPL02):");
const liste = await cagir("MZYListingPick", {
  ...C, PSWORKER: "%", PISTATUS: 0, PIISPICK: 1,
  PDSTARTDATE: "01.01.1975", PDENDDATE: "01.01.2100",
  PIISDELETE: 0, PIISSTARTED: 1, PIORDER: 0,
});
let bulundu = false;
for (const emir of (liste.tablolar.TBLPOLIST ?? []).slice(0, 20)) {
  const enter = await cagir("MZYEnterPick", {
    ...C, PSORDERNUM: emir.ORDERNUM, PSORDERTYPE: emir.ORDERTYPE,
  });
  const kalemler = enter.tablolar.IASWMSPOITEM ?? enter.tablolar.TBLWMSPO ?? [];
  const k = kalemler.find((x) => x.MATERIAL === MALZEME);
  if (k) {
    bulundu = true;
    console.log(`    emir ${emir.ORDERNUM}: MOVEQTY=${k.MOVEQTY}  MOVEDQTY=${k.MOVEDQTY}  UNIT=${k.UNIT}`);
    console.log(`    tüm birim alanları: ${Object.keys(k).filter((x)=>/unit|qty|qunit|birim/i.test(x)).map((x)=>`${x}=${k[x]}`).join("  ")}`);
    break;
  }
}
if (!bulundu) console.log("    PPL02 açık emirlerde bulunamadı.");

console.log("\n" + cizgi());
console.log("  Yorum: QUANTITY 72 katına çıkıyorsa katsayı 72. MOVEQTY 2 ise sipariş");
console.log("  PK cinsinden (2 paket = 144 AD). O zaman kıyas AD'ye çevrilmeli.");
console.log("  MOVEQTY 144 ise servis zaten AD veriyor, sorun yok.");
console.log(cizgi());
await kapat();
