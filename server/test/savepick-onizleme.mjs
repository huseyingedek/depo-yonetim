// -----------------------------------------------------------------------------
// SAVEPICK ÖNİZLEME — YAZMAZ. Sadece gönderilecek XML'i gösterir.
// -----------------------------------------------------------------------------
// Bora: "SavePick hazır sayılır ama bensiz deneme, trace alıp takip etmem lazım."
// Bu script HİÇBİR yazma servisi çağırmaz (CreateContainer / SavePick YOK).
// Sadece okuma adımlarıyla (emir + kalem + öneri) 1 adetlik bir toplama
// senaryosu kurar ve SavePick'e GİDECEK tam XML'i basar.
//
// Amaç: Bora canlı testten ÖNCE alan adlarını ve yapıyı onaylasın.
//
//   node test/savepick-onizleme.mjs
// -----------------------------------------------------------------------------

import { CFG, cagir, kapat, baslik, cizgi, xml } from "./ortak.mjs";
const C = { PSCOMPANY: CFG.company, PSPLANT: CFG.plant };

baslik("SAVEPICK ÖNİZLEME — yazma YOK, sadece giden XML");

// 1. Emir (okuma)
const liste = await cagir("MZYListingPick", {
  ...C, PSWORKER: "%", PISTATUS: 0, PIISPICK: 1,
  PDSTARTDATE: "01.01.1975", PDENDDATE: "01.01.2100",
  PIISDELETE: 0, PIISSTARTED: 1, PIORDER: 0,
});
const emir = (liste.tablolar.TBLPOLIST ?? [])[0];
if (!emir) { console.log("✗ emir yok"); await kapat(); process.exit(0); }
const E = { PSORDERNUM: emir.ORDERNUM, PSORDERTYPE: emir.ORDERTYPE };

// 2. Kalemler (okuma — EnterPick idempotent değil ama satır döndürüyor)
const enter = await cagir("MZYEnterPick", { ...C, ...E });
const kalemler = enter.tablolar.IASWMSPOITEM ?? enter.tablolar.TBLWMSPO ?? [];
const k = kalemler.find((x) => Number(x.MOVEQTY) > Number(x.MOVEDQTY ?? 0)) ?? kalemler[0];

// 3. Öneri rafı (okuma)
const sug = await cagir("MZYCrtSuggestListPickFromSP", { ...C, ...E, PIITEMNO: k.ITEMNO });
const o = (sug.tablolar.SUGGESTEDLISTFROM ?? [])[0] ?? {};

// 4. 1 adetlik okutma kaydı kur (barkod katsayısı 1 varsayımı)
const satir = {
  COMPANY: CFG.company,
  PLANT: CFG.plant,
  MATERIAL: k.MATERIAL,
  WAREHOUSE: o.WAREHOUSE ?? "",
  STOCKPLACE: o.STOCKPLACE ?? "",
  SPECIALSTOCK: o.SPECIALSTOCK ?? k.SPECIALSTOCK ?? "*",
  BATCHNUM: o.BATCHNUM ?? "*",
  QUANTITY: "1",
  QUNIT: k.UNIT ?? "AD",
  ORDERTYPE: emir.ORDERTYPE,
  ORDERNUM: emir.ORDERNUM,
  ITEMNO: k.ITEMNO,
};

// 5. Palet: gerçek testte CreateContainer dönecek. Önizlemede yer tutucu.
const PALET_DEPO = k.WAREHOUSETA ?? "10";
const PALET_NO = "<CreateContainer'dan gelecek>";

const params = {
  PSCOMPANY: CFG.company,
  PSPLANT: CFG.plant,
  PSCONTWAREHOUSE: PALET_DEPO,
  PSCONTSTOCKPLACE: PALET_NO,
  PSIASWMSPOITEMXML: [satir], // sunucu <ROW> listesine çevirir
};

console.log(`\n  Emir: ${emir.ORDERNUM} / ${emir.ORDERTYPE}`);
console.log(`  Kalem: ITEMNO ${k.ITEMNO}  ${k.MATERIAL}  ` +
  `MOVEQTY=${k.MOVEQTY} MOVEDQTY=${k.MOVEDQTY ?? 0}`);
console.log(`  Raf: ${o.WAREHOUSE}$${o.STOCKPLACE}  parti ${o.BATCHNUM ?? "-"}  ` +
  `specialstock ${o.SPECIALSTOCK ?? "-"}`);
console.log("\n" + cizgi());
console.log("  MZYSavePick'e GİDECEK XML (YAZILMADI):\n");
console.log(xml(params).replace(/></g, ">\n  <"));
console.log("\n" + cizgi());
console.log("  Bu yapıyı Bora onaylasın. Palet numarası gerçek testte");
console.log("  CreateContainer'dan gelecek. Sonra --yaz ile birlikte çalıştırırız.");
console.log(cizgi());
await kapat();
