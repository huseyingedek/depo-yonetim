// -----------------------------------------------------------------------------
// BİRİM KONTROLÜ — QUANTITY gerçekten barkodun katsayısı mı?
// -----------------------------------------------------------------------------
// quantity-kontrol.mjs "QUANTITY = gönderilen miktar" gösterdi. İki açıklaması var:
//   a) servis gönderileni aynen geri veriyor (katsayı hiç uygulanmıyor)
//   b) denenen barkodların hepsi 1 birimlik (katsayı=1, sonuç aynı görünür)
//
// Bu script PDCQUANTITY=1 sabit tutup FARKLI barkodları karşılaştırır ve
// UNIT / SKUNIT alanlarını yan yana basar.
//
//   UNIT ≠ SKUNIT ama QUANTITY=1  → çevrim yapılmıyor, eksik
//   Bazı barkodlarda QUANTITY>1   → katsayı çalışıyor, sorun yok
//
// Çalıştırma:  node test/birim-kontrol.mjs
// -----------------------------------------------------------------------------

import { CFG, cagir, kapat, baslik, cizgi } from "./ortak.mjs";

const DEPO = "D3";
const STOKYERI = "C1";

/** Farklı biçim ve birimlerde barkodlar */
const BARKODLAR = [
  ["UD009$*$", "malzeme biçimi, birim AD"],
  ["NC063$*$", "malzeme biçimi, birim PK"],
  ["NC210$*$", "malzeme biçimi, birim AD"],
  ["8690723511208", "EAN — UD009"],
  ["8690723511239", "EAN — UD009 (2. barkod)"],
  ["8690632763057", "EAN — NC063 paket"],
];

baslik("BİRİM KONTROLÜ — PDCQUANTITY=1 sabit, barkodlar farklı");
console.log("  QUANTITY barkodun katsayısıysa barkoda göre DEĞİŞMELİ.\n");

const sonuclar = [];

for (const [barkod, aciklama] of BARKODLAR) {
  const r = await cagir("MZYReadBarcode", {
    PSCOMPANY: CFG.company,
    PSPLANT: CFG.plant,
    PSWAREHOUSE: DEPO,
    PSSTOCKPLACE: STOKYERI,
    PSBATCHNUM: "*",
    PSBARCODE: barkod,
    PDCQUANTITY: 1,
  });

  const s = (r.tablolar.WMSXMLTABLE ?? []).find((x) => x.MATERIAL);
  if (!s) {
    console.log(`  ${barkod.padEnd(16)} ✗ çözülemedi   ${aciklama}`);
    continue;
  }

  const q = Number(s.QUANTITY ?? 0);
  sonuclar.push({ barkod, material: s.MATERIAL, unit: s.UNIT, skunit: s.SKUNIT, q });

  console.log(
    `  ${barkod.padEnd(16)} ${String(s.MATERIAL).padEnd(7)}` +
      ` UNIT=${String(s.UNIT).padEnd(4)} SKUNIT=${String(s.SKUNIT).padEnd(4)}` +
      ` QUANTITY=${String(q).padEnd(6)} AVAILSTOCK=${s.AVAILSTOCK ?? "—"}`
  );
  console.log(`  ${" ".repeat(16)} ${aciklama}`);
}

console.log("\n" + cizgi());

if (!sonuclar.length) {
  console.log("  Hiçbir barkod çözülemedi.");
} else {
  const hepsiBir = sonuclar.every((x) => x.q === 1);
  const birimFarki = sonuclar.filter((x) => x.unit !== x.skunit);

  if (hepsiBir) {
    console.log("  Bütün barkodlarda QUANTITY=1.");
    if (birimFarki.length) {
      console.log("  ✗ Ama şu barkodlarda UNIT ≠ SKUNIT:");
      birimFarki.forEach((x) =>
        console.log(`      ${x.barkod}  ${x.material}  ${x.unit} → ${x.skunit}`)
      );
      console.log("    Yani çevrim gerekiyor ama QUANTITY 1 dönüyor — katsayı");
      console.log("    uygulanmıyor. Bora'ya: QUANTITY barkodun kaç SKUNIT");
      console.log("    ettiğini dönmeli (1 PK = 30 AD ise 30).");
    } else {
      console.log("  Hepsinde UNIT = SKUNIT, yani zaten tekil ürünler.");
      console.log("  Çok birimli bir barkod (koli/çuval) ile test etmek lazım.");
      console.log("  Bora'dan koli barkodu iste.");
    }
  } else {
    console.log("  ✓ QUANTITY barkoda göre değişiyor — katsayı çalışıyor.");
    sonuclar
      .filter((x) => x.q !== 1)
      .forEach((x) =>
        console.log(`      ${x.barkod} → ${x.q} ${x.skunit || x.unit}`)
      );
  }
}

console.log(cizgi());
await kapat();
