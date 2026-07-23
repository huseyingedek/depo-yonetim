// -----------------------------------------------------------------------------
// SENARYO: TOPLAMA — login'den paketlemeye kadar tüm zincir
// -----------------------------------------------------------------------------
// Depocunun gerçek adımlarını sırayla yürütür ve her adımda ne döndüğünü basar.
//
//   1. CheckUser                  giriş
//   2. ListingPick                açık toplama emirleri
//   3. EnterPick                  emre gir, kalemleri al      ⚠ VERİ YAZAR
//   4. CrtSuggestListPickFromSP   her kalem için raf önerisi
//   5. ReadBarcodeSP              raf barkodu çöz
//   6. ReadBarcode                ürün barkodu çöz
//   7. CreateContainer            palet oluştur               ⚠ VERİ YAZAR
//   8. SavePick                   toplananı kaydet            ⚠ VERİ YAZAR
//
// Varsayılan olarak 7 ve 8 ATLANIR (veri yazdıkları için).
// Çalıştırma:
//   node test/senaryo-toplama.mjs bsenturk 2Akl00*
//   node test/senaryo-toplama.mjs bsenturk 2Akl00* --yaz     ← 7 ve 8 de çalışır
//   node test/senaryo-toplama.mjs bsenturk 2Akl00* --emir=26935024
// -----------------------------------------------------------------------------

import { CFG, cagir, kapat, baslik, adim, sonucBas, satirlariBas } from "./ortak.mjs";

const KULLANICI = process.argv[2] ?? "bsenturk";
const SIFRE = process.argv[3] ?? "";
const YAZ = process.argv.includes("--yaz");
const EMIR = (process.argv.find((a) => a.startsWith("--emir=")) ?? "").split("=")[1];

const C = { PSCOMPANY: CFG.company, PSPLANT: CFG.plant };

baslik(`TOPLAMA SENARYOSU — ${KULLANICI} · firma ${CFG.company} · tesis ${CFG.plant}`);
if (!YAZ) console.log("  (yazma adımları atlanıyor — çalıştırmak için --yaz)");

/* ========================================================================== */
adim(1, "MZYCheckUser — depocu girişi");
/* ========================================================================== */
// Uygulamada: giriş ekranı. Depocunun CANIAS kullanıcısı ve şifresi.
// Dönen TBLUSER doluysa giriş geçerli; TBLMESSAGE gelirse hata metni içinde.
if (SIFRE) {
  const r = await cagir("MZYCheckUser", { PSUSER: KULLANICI, PSPASSWORD: SIFRE });
  console.log(`  giden: ${r.giden.replace(SIFRE, "***")}`);
  sonucBas(r);
} else {
  console.log("  · şifre verilmedi, atlandı (2. argüman olarak geçebilirsin)");
}

/* ========================================================================== */
adim(2, "MZYListingPick — açık toplama emirleri");
/* ========================================================================== */
// Uygulamada: "Açık Siparişler" listesi.
// Tarih GG.AA.YYYY ve gün İKİ HANELİ olmalı — "1.01.1975" sessizce boş döndürür.
const listeParams = {
  ...C,
  PSWORKER: KULLANICI,
  PISTATUS: 0, // 0 açık
  PIISPICK: 1, // 1 toplama, 0 yerleştirme
  PDSTARTDATE: "01.01.1975",
  PDENDDATE: "01.01.2100",
  PIISDELETE: 0,
  PIISSTARTED: 1,
  PIORDER: 0,
};
const liste = await cagir("MZYListingPick", listeParams);
console.log(`  giden: ${liste.giden}`);
const emirler = liste.tablolar.TBLPOLIST ?? [];
console.log(`  ✓ ${emirler.length} emir`);
emirler.slice(0, 8).forEach((e) =>
  console.log(`    ${e.ORDERNUM} / ${e.ORDERTYPE}   müşteri: ${e.CUSNAME1 ?? "—"}`)
);

if (!emirler.length) {
  console.log("\n  ✗ Emir yok, senaryo burada duruyor.");
  await kapat();
  process.exit(0);
}

const secili = EMIR ? emirler.find((e) => e.ORDERNUM === EMIR) : emirler[0];
if (!secili) {
  console.log(`\n  ✗ ${EMIR} listede yok.`);
  await kapat();
  process.exit(0);
}
const E = { PSORDERNUM: secili.ORDERNUM, PSORDERTYPE: secili.ORDERTYPE };
console.log(`\n  → seçilen emir: ${E.PSORDERNUM} / ${E.PSORDERTYPE}`);

/* ========================================================================== */
adim(3, "MZYEnterPick — emre gir, kalemleri al   ⚠ VERİ YAZAR");
/* ========================================================================== */
// Uygulamada: emre tıklayınca. Emri kullanıcıya atar, ISSTARTED=1 yapar.
// İDEMPOTENT DEĞİL: aynı emre ikinci girişte kalem yerine mesaj dönebiliyor.
const enter = await cagir("MZYEnterPick", { ...C, ...E });
console.log(`  giden: ${enter.giden}`);
const kalemler = enter.tablolar.IASWMSPOITEM ?? enter.tablolar.TBLWMSPO ?? [];
console.log(`  ✓ ${kalemler.length} kalem`);
kalemler.forEach((k) =>
  console.log(
    `    ITEMNO ${k.ITEMNO}  ${k.MATERIAL}  ${k.MOVEQTY}/${k.MOVEDQTY} ${k.UNIT}` +
      (k.SPECIALSTOCK === "1" ? "  [PARTİ TAKİPLİ]" : "")
  )
);
if (!kalemler.length) {
  console.log("  · Kalem gelmedi — emre daha önce girilmiş olabilir.");
  if (enter.mesaj) console.log(`  mesaj: ${enter.mesaj}`);
}

/* ========================================================================== */
adim(4, "MZYCrtSuggestListPickFromSP — hangi raftan alınacak");
/* ========================================================================== */
// Uygulamada: kalem satırlarındaki raf seçim kutusu.
// SUGGESTEDLISTFROM döner: WAREHOUSE+STOCKPLACE (raf), TOTAL (raftaki stok),
// DISTANCE (uzaklık, küçük = yakın), ENTRYDATE (FIFO için giriş tarihi).
// Raf barkodu biçimi: WAREHOUSE + "$" + STOCKPLACE
const raflar = [];
for (const k of kalemler) {
  const s = await cagir("MZYCrtSuggestListPickFromSP", {
    ...C,
    ...E,
    PIITEMNO: k.ITEMNO,
  });
  const oneriler = s.tablolar.SUGGESTEDLISTFROM ?? [];
  console.log(`\n  ITEMNO ${k.ITEMNO} (${k.MATERIAL}): ${oneriler.length} öneri`);
  for (const o of oneriler) {
    const barkod = `${o.WAREHOUSE}$${o.STOCKPLACE}`;
    console.log(
      `    ${barkod.padEnd(12)} stok ${o.TOTAL} ${o.QUNIT}   mesafe ${o.DISTANCE}   giriş ${o.ENTRYDATE}`
    );
    raflar.push({ itemNo: k.ITEMNO, material: k.MATERIAL, barkod, ...o });
  }
  if (!oneriler.length) console.log("    · öneri yok (stok yok olabilir)");
}

/* ========================================================================== */
adim(5, "MZYReadBarcodeSP — raf barkodu çöz");
/* ========================================================================== */
// Uygulamada: depocu rafın barkodunu okutur, "bu raftayım" bağlamı açılır.
// DİKKAT: doğrulama YAPMIYOR — olmayan raf da kabul ediliyor.
const ornekRaf = raflar[0]?.barkod ?? "D3$C1";
const rafSonuc = await cagir("MZYReadBarcodeSP", { ...C, PSBARCODE: ornekRaf });
console.log(`  giden: ${rafSonuc.giden}`);
sonucBas(rafSonuc);

console.log("\n  Doğrulama kontrolü — olmayan raf:");
const sahteRaf = await cagir("MZYReadBarcodeSP", { ...C, PSBARCODE: "ZZ$YY99" });
satirlariBas(sahteRaf.tablolar.TBLWHSP ?? []);
console.log("  (satır dönüyorsa servis geçersiz rafı da kabul ediyor demektir)");

/* ========================================================================== */
adim(6, "MZYReadBarcode — ürün barkodu çöz");
/* ========================================================================== */
// Uygulamada: depocu ürünü okutur. Dönen MATERIAL ile emirdeki kalem eşleşir.
// Bir ürünün BİRDEN ÇOK barkodu olabilir; eşleştirme barkodla değil
// MATERIAL ile yapılır.
//   QUANTITY   → okutulan barkodun kaç stok birimi ettiği (1 koli = 10 adet → 10)
//   AVAILSTOCK → o raftaki gerçek stok; raf+ürün+parti üçü de gönderilirse dolu
const rafParcali = ornekRaf.split("$");
for (const k of kalemler.slice(0, 3)) {
  const barkod = `${k.MATERIAL}$*$`; // malzeme biçimi — Bora: "UD009$*$"
  const b = await cagir("MZYReadBarcode", {
    ...C,
    PSWAREHOUSE: rafParcali[0] ?? "",
    PSSTOCKPLACE: rafParcali[1] ?? "",
    PSBATCHNUM: "*",
    PSBARCODE: barkod,
  });
  const satir = (b.tablolar.WMSXMLTABLE ?? []).find((r) => r.MATERIAL);
  console.log(`\n  ${barkod}`);
  if (satir) {
    console.log(
      `    ✓ ${satir.MATERIAL}  ${satir.MTEXT?.trim()}  birim ${satir.UNIT}` +
        `  QUANTITY=${satir.QUANTITY}  AVAILSTOCK=${satir.AVAILSTOCK ?? "—"}`
    );
  } else {
    console.log(`    ✗ çözülemedi  ${b.mesaj || ""}`);
  }
}

/* ========================================================================== */
adim(7, "MZYCreateContainer — palet oluştur   ⚠ VERİ YAZAR");
/* ========================================================================== */
// Uygulamada: "Pakete Yerleştir" ilk adımı. Dönen palet numarası SavePick'e gider.
// DEPO: ayarlardaki depo değil, EnterPick'ten gelen WAREHOUSETA.
const hedefDepo = kalemler[0]?.WAREHOUSETA ?? "10";
if (YAZ) {
  const kap = await cagir("MZYCreateContainer", {
    ...C,
    PSWAREHOUSE: hedefDepo,
    PSMATERIAL: "KONPAKET",
  });
  console.log(`  giden: ${kap.giden}`);
  sonucBas(kap);
} else {
  console.log(`  · atlandı. Çalışsaydı: PSWAREHOUSE=${hedefDepo} PSMATERIAL=KONPAKET`);
}

/* ========================================================================== */
adim(8, "MZYSavePick — toplananı kaydet   ⚠ VERİ YAZAR");
/* ========================================================================== */
// Uygulamada: paletten sonra. MOVEDQTY bununla güncellenir.
// Okutma satırları IASWMSPOITEMREAD tablosu olarak gider:
//   COMPANY, PLANT, MATERIAL, WAREHOUSE, STOCKPLACE, SPECIALSTOCK,
//   BATCHNUM, QUANTITY, QUNIT, ORDERTYPE, ORDERNUM, ITEMNO
// ⚠ Satırların XML'de nasıl taşınacağı Bora'dan TEYİT EDİLMEDİ.
if (YAZ && kalemler.length) {
  const k = kalemler[0];
  const satirlar = [
    {
      COMPANY: CFG.company,
      PLANT: CFG.plant,
      MATERIAL: k.MATERIAL,
      WAREHOUSE: rafParcali[0] ?? "",
      STOCKPLACE: rafParcali[1] ?? "",
      SPECIALSTOCK: k.SPECIALSTOCK === "1" ? "1" : "*",
      BATCHNUM: "*",
      QUANTITY: "1",
      QUNIT: k.UNIT,
      ORDERTYPE: E.PSORDERTYPE,
      ORDERNUM: E.PSORDERNUM,
      ITEMNO: k.ITEMNO,
    },
  ];
  const s = await cagir("MZYSavePick", {
    ...C,
    ...E,
    PSCONTAINER: "",
    IASWMSPOITEMREAD: satirlar,
  });
  console.log(`  giden: ${s.giden}`);
  sonucBas(s);
} else {
  console.log("  · atlandı (--yaz ile çalışır)");
}

/* ========================================================================== */
baslik("ÖZET");
/* ========================================================================== */
console.log(`  emir       : ${E.PSORDERNUM} / ${E.PSORDERTYPE}`);
console.log(`  kalem      : ${kalemler.length}`);
console.log(`  raf önerisi: ${raflar.length}`);
console.log(`  hedef depo : ${hedefDepo}`);
if (raflar.length) {
  console.log("\n  Ekranda deneyebileceğin çiftler:");
  const gorulen = new Set();
  for (const r of raflar) {
    if (gorulen.has(r.material)) continue;
    gorulen.add(r.material);
    console.log(`    raf ${r.barkod}   ürün ${r.material}$*$`);
  }
}

await kapat();
