// -----------------------------------------------------------------------------
// AVAILSTOCK — parti alanı ne gönderilmeli?
// -----------------------------------------------------------------------------
// Bora (21.07 22:52-53):
//   "kaldırdım — ama işlem yapman için gerekiyor parti"
//   "malzeme barkodunu okuttuktan sonra değer dönüyor olacak,
//    ama tüm partiler dahil boş gönderirsen"
//   "dolu gönderirsen sadece gönderdiğin parti için dönecek"
//
// Yani PSBATCHNUM BOŞ olmalı ki raftaki TOPLAM stok dönsün.
// Biz "*" gönderiyorduk — "*" boş sayılıyor mu, yoksa parti adı gibi mi
// yorumlanıp 0 mı dönüyor? Bu script üç biçimi yan yana dener.
//
// Çalıştırma:  node test/parti-availstock.mjs
// -----------------------------------------------------------------------------

import { CFG, cagir, kapat, baslik, cizgi } from "./ortak.mjs";

const DEPO = "D3";
const STOKYERI = "C1";
const BARKODLAR = ["UD009$*$", "8690723511208", "NC063$*$"];

/** Gönderilecek parti biçimleri — etiket, değer */
const PARTILER = [
  ['boş string ("")', ""],
  ['yüzde ("%")', "%"],
  ['yıldız ("*")', "*"],
];

baslik("AVAILSTOCK — PSBATCHNUM biçim testi");
console.log("  Bora: parti BOŞ gönderilirse tüm partilerin toplamı dönmeli.\n");

for (const barkod of BARKODLAR) {
  console.log(`  ${barkod}`);
  for (const [etiket, parti] of PARTILER) {
    const r = await cagir("MZYReadBarcode", {
      PSCOMPANY: CFG.company,
      PSPLANT: CFG.plant,
      PSWAREHOUSE: DEPO,
      PSSTOCKPLACE: STOKYERI,
      PSBATCHNUM: parti,
      PSBARCODE: barkod,
      PDCQUANTITY: 1,
    });
    const s = (r.tablolar.WMSXMLTABLE ?? []).find((x) => x.MATERIAL);
    if (!s) {
      console.log(`     ${etiket.padEnd(16)} ✗ çözülemedi  ${r.mesaj || ""}`);
      continue;
    }
    console.log(
      `     ${etiket.padEnd(16)} AVAILSTOCK=${String(s.AVAILSTOCK ?? "—").padEnd(10)}` +
        ` QUANTITY=${String(s.QUANTITY ?? "—").padEnd(8)} BATCHNUM=${s.BATCHNUM ?? "—"}`
    );
  }
  console.log("");
}

console.log(cizgi());
console.log("  SONUÇ (21.07 çalıştırıldı): üç biçimde de AVAILSTOCK=0.0.");
console.log("  Kritik ipucu → dönen BATCHNUM her üç denemede de \"*\".");
console.log("  Yani gönderdiğimiz PSBATCHNUM servise HİÇ ULAŞMIYOR, içeride");
console.log("  sabit \"*\" ile çalışıyor. Daha önceki TXTMATERIAL / PSSTOCKPLACE");
console.log("  hatalarının aynısı: değişken atanmamış. Bora'ya bu satır gösterilecek.");
console.log(cizgi());
await kapat();
