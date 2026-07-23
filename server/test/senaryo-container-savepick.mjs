// -----------------------------------------------------------------------------
// KONTEYNER + SAVEPICK ZİNCİRİ — her adımın GİDEN parametresi ve DÖNEN yanıtı
// -----------------------------------------------------------------------------
// ⚠ VERİ YAZAR: CreateContainer palet oluşturur, SavePick stok düşürür.
// Uygulamanın yaptığı zinciri birebir yürütür ve hepsini döker.
//
//   node test/senaryo-container-savepick.mjs
//   node test/senaryo-container-savepick.mjs --emir=26935026
// -----------------------------------------------------------------------------

import { CFG, cagir, kapat, baslik, adim, cizgi, xml } from "./ortak.mjs";
const C = { PSCOMPANY: CFG.company, PSPLANT: CFG.plant };
const EMIR = (process.argv.find((a) => a.startsWith("--emir=")) ?? "").split("=")[1];

const bas = (r) => {
  console.log("  GİDEN : " + r.giden);
  console.log("  DÖNEN : " + (r.ham || "(boş)").replace(/\s+/g, " ").slice(0, 500));
  if (r.mesaj) console.log("  MESAJ : " + r.mesaj);
};

baslik("KONTEYNER + SAVEPICK ZİNCİRİ");

/* 1. Emir */
adim(1, "MZYListingPick");
const liste = await cagir("MZYListingPick", {
  ...C, PSWORKER: "%", PISTATUS: 0, PIISPICK: 1,
  PDSTARTDATE: "01.01.1975", PDENDDATE: "01.01.2100",
  PIISDELETE: 0, PIISSTARTED: 1, PIORDER: 0,
});
const emirler = liste.tablolar.TBLPOLIST ?? [];
const emir = EMIR ? emirler.find((e) => e.ORDERNUM === EMIR) : emirler[0];
if (!emir) { console.log("  ✗ emir yok"); await kapat(); process.exit(0); }
const ON = emir.ORDERNUM, OT = emir.ORDERTYPE;
console.log(`  → emir ${ON} / ${OT}`);

/* 2. Kalemler */
adim(2, "MZYEnterPick");
const enter = await cagir("MZYEnterPick", { ...C, PSORDERNUM: ON, PSORDERTYPE: OT });
const kalemler = enter.tablolar.IASWMSPOITEM ?? enter.tablolar.TBLWMSPO ?? [];
const kalem = kalemler.find((k) => Number(k.MOVEQTY) > Number(k.MOVEDQTY ?? 0)) ?? kalemler[0];
if (!kalem) {
  console.log(`  ✗ EnterPick kalem döndürmedi (emir ${ON}). Başka emir dene: --emir=...`);
  console.log(`  GİDEN: ${enter.giden}`);
  console.log(`  DÖNEN: ${(enter.ham || "(boş)").slice(0, 300)}`);
  await kapat();
  process.exit(0);
}
console.log(`  → ${kalemler.length} kalem, seçilen ITEMNO ${kalem.ITEMNO} ${kalem.MATERIAL} (${kalem.MOVEQTY}/${kalem.MOVEDQTY} ${kalem.UNIT}), WAREHOUSETA=${kalem.WAREHOUSETA}`);

/* 3. Öneri rafı */
adim(3, "MZYCrtSuggestListPickFromSP");
const sug = await cagir("MZYCrtSuggestListPickFromSP", { ...C, PSORDERNUM: ON, PSORDERTYPE: OT, PIITEMNO: kalem.ITEMNO });
const o = (sug.tablolar.SUGGESTEDLISTFROM ?? [])[0] ?? {};
const DEPO = o.WAREHOUSE ?? "D3", STOK = o.STOCKPLACE ?? "C1";
console.log(`  → raf ${DEPO}$${STOK}  TOTAL ${o.TOTAL} ${o.QUNIT}  parti ${o.BATCHNUM}  specialstock ${o.SPECIALSTOCK}`);

/* 4. Raf okut */
adim(4, "MZYReadBarcodeSP (raf)");
const raf = await cagir("MZYReadBarcodeSP", { ...C, PSBARCODE: `${DEPO}$${STOK}` });
bas(raf);

/* 5. Ürün okut */
adim(5, "MZYReadBarcode (ürün)");
const urun = await cagir("MZYReadBarcode", {
  ...C, PSWAREHOUSE: DEPO, PSSTOCKPLACE: STOK, PSBARCODE: `${kalem.MATERIAL}$*$`, PDCQUANTITY: 1,
});
bas(urun);
const s = (urun.tablolar.WMSXMLTABLE ?? []).find((x) => x.MATERIAL) ?? {};
console.log(`  → MATERIAL=${s.MATERIAL} QUANTITY=${s.QUANTITY} AVAILSTOCK=${s.AVAILSTOCK} SPECIALSTOCK=${s.SPECIALSTOCK} UNIT=${s.UNIT}`);

/* 6. Okutulan satır (buildPickRows biçimi) */
const miktar = Number(s.QUANTITY) > 0 ? Number(s.QUANTITY) : 1;
const satir = {
  COMPANY: CFG.company, PLANT: CFG.plant, MATERIAL: kalem.MATERIAL,
  WAREHOUSE: DEPO, STOCKPLACE: STOK,
  SPECIALSTOCK: s.SPECIALSTOCK || "*", BATCHNUM: (s.SPECIALSTOCK === "1" ? "20260908" : "*"),
  READQTY: String(miktar), QUNIT: s.UNIT || kalem.UNIT,
  ORDERTYPE: OT, ORDERNUM: ON, ITEMNO: kalem.ITEMNO, VOPTIONS: "",
};
console.log("\n  OKUTULAN SATIR:", JSON.stringify(satir));

/* 7. CreateContainer  ⚠ YAZAR */
adim(7, "MZYCreateContainer  ⚠ palet oluşturur");
const PALETDEPO = kalem.WAREHOUSETA || "10";
const kap = await cagir("MZYCreateContainer", { ...C, PSWAREHOUSE: PALETDEPO, PSMATERIAL: "KONPAKET" });
bas(kap);
const kr = (kap.tablolar.TBLCONTSP ?? kap.tablolar.IASINVITEM ?? [])[0] ?? {};
const PALETNO = kr.BATCHNUM || kr.STOCKPLACE || "";
console.log(`  → PALET depo=${PALETDEPO}  no=${PALETNO}`);
if (!PALETNO) { console.log("  ✗ palet no boş — SavePick atlanıyor"); await kapat(); process.exit(0); }

/* 8. SavePick  ⚠ STOK DÜŞER */
adim(8, "MZYSavePick  ⚠ stok düşürür");
const savePickParams = {
  ...C, PSORDERNUM: ON, PSORDERTYPE: OT,
  PSCONTWAREHOUSE: PALETDEPO, PSCONTSTOCKPLACE: PALETNO,
  PSIASWMSPOITEMXML: [satir],
};
console.log("  GÖNDERİLEN PARAMETRELER (XML):");
console.log("  " + xml(savePickParams));
const save = await cagir("MZYSavePick", savePickParams);
console.log("\n  DÖNEN:");
bas(save);
console.log("\n" + cizgi());
console.log(save.mesaj ? `  ⚠ MESAJ VAR (hata?): ${save.mesaj}` : "  ✓ TBLMESSAGE boş → Bora'nın kuralına göre BAŞARILI");
console.log("  → CANIAS'ta kontrol: MOVEDQTY arttı mı, stok düştü mü?");
console.log(cizgi());
await kapat();
