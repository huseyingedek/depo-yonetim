// -----------------------------------------------------------------------------
// SENARYO: YERLEŞTİRME (ISPICK=0)
// -----------------------------------------------------------------------------
// Toplamanın aynası: mal gelmiş, raflara dağıtılacak.
// Fark, ListingPick'te PIISPICK=0 göndermek ve kalemde FRONTAREA/WAREHOUSEFA
// alanlarının anlamlı olması (nereden alınacak).
//
// Bu taraf henüz hiç test edilmedi — bu script durumu görmek için.
//
// Çalıştırma:  node test/senaryo-yerlestirme.mjs bsenturk
// -----------------------------------------------------------------------------

import { CFG, cagir, kapat, baslik, adim, sonucBas } from "./ortak.mjs";

const KULLANICI = process.argv[2] ?? "bsenturk";
const C = { PSCOMPANY: CFG.company, PSPLANT: CFG.plant };

baslik(`YERLEŞTİRME SENARYOSU — ${KULLANICI}`);

/* ========================================================================== */
adim(1, "MZYListingPick — yerleştirme emirleri (PIISPICK=0)");
/* ========================================================================== */
const liste = await cagir("MZYListingPick", {
  ...C,
  PSWORKER: KULLANICI,
  PISTATUS: 0,
  PIISPICK: 0, // ← tek fark bu
  PDSTARTDATE: "01.01.1975",
  PDENDDATE: "01.01.2100",
  PIISDELETE: 0,
  PIISSTARTED: 1,
  PIORDER: 0,
});
console.log(`  giden: ${liste.giden}`);
const emirler = liste.tablolar.TBLPOLIST ?? [];
console.log(`  ✓ ${emirler.length} yerleştirme emri`);
emirler.slice(0, 8).forEach((e) =>
  console.log(`    ${e.ORDERNUM} / ${e.ORDERTYPE}`)
);

if (!emirler.length) {
  console.log("\n  · Yerleştirme emri yok.");
  console.log("    Bora'dan bir mal kabul/yerleştirme emri oluşturmasını iste.");
  await kapat();
  process.exit(0);
}

/* ========================================================================== */
adim(2, "MZYEnterPick — emre gir   ⚠ VERİ YAZAR");
/* ========================================================================== */
const e = emirler[0];
const enter = await cagir("MZYEnterPick", {
  ...C,
  PSORDERNUM: e.ORDERNUM,
  PSORDERTYPE: e.ORDERTYPE,
});
const kalemler = enter.tablolar.IASWMSPOITEM ?? enter.tablolar.TBLWMSPO ?? [];
console.log(`  ✓ ${kalemler.length} kalem`);

/* ========================================================================== */
adim(3, "Alan anlamları — toplamadan FARKI");
/* ========================================================================== */
// Toplamada: TRANSAREA/WAREHOUSETA = hedef (paletin bırakılacağı yer)
// Yerleştirmede: FRONTAREA/WAREHOUSEFA = kaynak (malın alınacağı yer)
kalemler.slice(0, 5).forEach((k) => {
  console.log(`\n  ${k.MATERIAL}  ${k.MTEXT?.trim()}`);
  console.log(`    ISPICK      = ${k.ISPICK}   (0 = yerleştirme)`);
  console.log(`    KAYNAK      : WAREHOUSEFA=${k.WAREHOUSEFA}  FRONTAREA=${k.FRONTAREA}`);
  console.log(`    HEDEF       : WAREHOUSETA=${k.WAREHOUSETA}  TRANSAREA=${k.TRANSAREA}`);
  console.log(`    miktar      : ${k.MOVEQTY}/${k.MOVEDQTY} ${k.UNIT}`);
});

if (!kalemler.length && enter.mesaj) console.log(`  mesaj: ${enter.mesaj}`);

/* ========================================================================== */
adim(4, "MZYCrtSuggestListPickFromSP — yerleştirmede öneri var mı?");
/* ========================================================================== */
// Toplamada "nereden al" öneriyordu. Yerleştirmede "nereye koy" önermesi
// beklenir ama bu doğrulanmadı — çıktıya bakıp karar vereceğiz.
if (kalemler.length) {
  const k = kalemler[0];
  const s = await cagir("MZYCrtSuggestListPickFromSP", {
    ...C,
    PSORDERNUM: e.ORDERNUM,
    PSORDERTYPE: e.ORDERTYPE,
    PIITEMNO: k.ITEMNO,
  });
  console.log(`  giden: ${s.giden}`);
  sonucBas(s);
}

baslik("NE ÖĞRENDİK");
console.log("  • Yerleştirme emri geliyor mu?");
console.log("  • FRONTAREA/WAREHOUSEFA dolu mu? (kaynak raf)");
console.log("  • Öneri servisi bu tarafta da çalışıyor mu?");
console.log("\n  Bunlar netleşmeden yerleştirme ekranı yazılmamalı.");

await kapat();
