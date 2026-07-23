// -----------------------------------------------------------------------------
// PK ÇEVRİM ALANLARI — dönen yanıtlarda AD karşılığı taşıyan alan var mı?
// -----------------------------------------------------------------------------
// Soru (Hüseyin): sipariş PK geliyor, stok AD gönderilecek. Servis dönüşünde
// PK→AD çevrimi için alan var mı, Bora eklemiş mi?
//
// Bu script HİÇBİR yorum yapmaz — sadece ReadBarcode ve EnterPick'in
// DÖNEN TÜM ALANLARINI döker. Özellikle birim/miktar ve "X" ekli alanları
// işaretler (X'ler genelde ikinci/temel birim karşılığıdır).
//
//   node test/pk-alanlar.mjs
//   node test/pk-alanlar.mjs 8690632763057 NC063   ← başka barkod/malzeme
// -----------------------------------------------------------------------------

import { CFG, cagir, kapat, baslik, cizgi } from "./ortak.mjs";
const C = { PSCOMPANY: CFG.company, PSPLANT: CFG.plant };
const BARKOD = process.argv[2] ?? "8692857012873";
const MALZEME = process.argv[3] ?? "PPL02";

const isaret = (k) => /unit|qty|qunit|birim|skunit|factor|katsay|conv|base|x$/i.test(k) ? "»" : " ";

baslik(`PK ÇEVRİM ALANLARI — ${MALZEME} / ${BARKOD}`);

// 1. ReadBarcode — TÜM alanlar
console.log("\n  [MZYReadBarcode] dönen tüm alanlar (PDCQUANTITY=1):");
const rb = await cagir("MZYReadBarcode", {
  ...C, PSWAREHOUSE: "D3", PSSTOCKPLACE: "C1", PSBARCODE: BARKOD, PDCQUANTITY: 1,
});
const s = (rb.tablolar.WMSXMLTABLE ?? []).find((x) => x.MATERIAL);
if (s) for (const [k, v] of Object.entries(s)) console.log(`    ${isaret(k)} ${k.padEnd(16)} = ${v === "" ? "∅" : v}`);
else console.log("    çözülemedi:", rb.mesaj);

// 2. EnterPick — bu malzemenin kalemindeki TÜM alanlar
console.log("\n  [MZYEnterPick] kalemin dönen tüm alanları:");
const liste = await cagir("MZYListingPick", {
  ...C, PSWORKER: "%", PISTATUS: 0, PIISPICK: 1,
  PDSTARTDATE: "01.01.1975", PDENDDATE: "01.01.2100",
  PIISDELETE: 0, PIISSTARTED: 1, PIORDER: 0,
});
let k = null;
for (const emir of (liste.tablolar.TBLPOLIST ?? []).slice(0, 20)) {
  const enter = await cagir("MZYEnterPick", { ...C, PSORDERNUM: emir.ORDERNUM, PSORDERTYPE: emir.ORDERTYPE });
  const kalemler = enter.tablolar.IASWMSPOITEM ?? enter.tablolar.TBLWMSPO ?? [];
  k = kalemler.find((x) => x.MATERIAL === MALZEME);
  if (k) { console.log(`    (emir ${emir.ORDERNUM})`); break; }
}
if (k) for (const [key, v] of Object.entries(k)) console.log(`    ${isaret(key)} ${key.padEnd(16)} = ${v === "" ? "∅" : v}`);
else console.log("    kalem bulunamadı");

console.log("\n" + cizgi());
console.log("  » ile işaretli alanlar birim/miktar/çevrim adayı. 'X' ekli olanlar");
console.log("  (MOVEQTYX, UNITX, QUANTITYX...) genelde ikinci/temel birim karşılığı.");
console.log("  Dolu geliyorsa çevrim için kullanılabilir; boşsa Bora eklememiş demektir.");
console.log(cizgi());
await kapat();
