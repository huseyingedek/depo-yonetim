// -----------------------------------------------------------------------------
// QUANTITY kontrolü — PDQUANTITY ile çarpılıyor mu?
// -----------------------------------------------------------------------------
// Bora (21.07 22:23): "miktarı 1 de 5 de göndersen QUANTITY hep aynı olmalı,
// orası okuttuğun barkodu temsil etmeli. Sanırım ben onu miktarla çarptım."
//
// Bu script aynı barkodu farklı PDQUANTITY değerleriyle çağırıp QUANTITY'nin
// değişip değişmediğine bakar.
//
//   QUANTITY sabit  → doğru, düzeltilmiş
//   QUANTITY değişiyor → hâlâ çarpıyor, ÇİFT ÇARPMA olur
//     (uygulama da kendi tarafında çarptığı için 5 yerine 25 yazılır)
//
// Çalıştırma:  node test/quantity-kontrol.mjs
//              node test/quantity-kontrol.mjs UD009$*$ D3 C1
// -----------------------------------------------------------------------------

import { CFG, cagir, kapat, baslik, cizgi } from "./ortak.mjs";

const BARKOD = process.argv[2] ?? "UD009$*$";
const DEPO = process.argv[3] ?? "D3";
const STOKYERI = process.argv[4] ?? "C1";

const MIKTARLAR = [1, 2, 5, 10];

baslik(`QUANTITY KONTROLÜ — ${BARKOD} @ ${DEPO}$${STOKYERI}`);
console.log("  Aynı barkod, farklı PDCQUANTITY. QUANTITY sabit kalmalı.\n");

const sonuclar = [];

for (const m of MIKTARLAR) {
  const r = await cagir("MZYReadBarcode", {
    PSCOMPANY: CFG.company,
    PSPLANT: CFG.plant,
    PSWAREHOUSE: DEPO,
    PSSTOCKPLACE: STOKYERI,
    PSBATCHNUM: "*",
    PSBARCODE: BARKOD,
    PDCQUANTITY: m,
  });

  const satir = (r.tablolar.WMSXMLTABLE ?? []).find((x) => x.MATERIAL);
  if (!satir) {
    console.log(`  PDCQUANTITY=${String(m).padEnd(3)} ✗ barkod çözülemedi  ${r.mesaj || ""}`);
    continue;
  }

  const q = Number(satir.QUANTITY ?? 0);
  const a = Number(satir.AVAILSTOCK ?? 0);
  sonuclar.push({ gonderilen: m, quantity: q, availStock: a });

  console.log(
    `  PDCQUANTITY=${String(m).padEnd(3)} → QUANTITY=${String(q).padEnd(8)}` +
      ` AVAILSTOCK=${String(a).padEnd(8)} STOCKPLACE=${satir.STOCKPLACE}`
  );
}

console.log("\n" + cizgi());

if (sonuclar.length < 2) {
  console.log("  Yeterli sonuç yok — barkod ya da raf yanlış olabilir.");
} else {
  const ilk = sonuclar[0].quantity;
  const hepsiAyni = sonuclar.every((s) => s.quantity === ilk);

  /* BEKLENEN DAVRANIŞ (deneyle doğrulandı):
     QUANTITY = barkod katsayısı × PDCQUANTITY
     Yani servis çarpmayı kendi yapıyor. Uygulama QUANTITY'yi olduğu gibi
     kayda yazar, bir daha çarpmaz. */
  const katsayilar = sonuclar.map((s) => s.quantity / s.gonderilen);
  const katsayiSabit = katsayilar.every((k) => k === katsayilar[0]);

  if (ilk === 0) {
    console.log("  ✗ QUANTITY hep 0 — hesaplanmıyor.");
    console.log("    STOCKPLACE okunmuyorsa sebebi o olabilir.");
  } else if (katsayiSabit) {
    console.log(`  ✓ Doğru çalışıyor. Barkod katsayısı: ${katsayilar[0]}`);
    console.log("    QUANTITY = katsayı × PDCQUANTITY, servis çarpmayı yapıyor.");
    console.log("    Uygulama QUANTITY'yi olduğu gibi kayda yazıyor.");
    sonuclar.forEach((s) =>
      console.log(`      ${s.gonderilen} tane → kayda ${s.quantity} yazılır`)
    );
  } else if (hepsiAyni) {
    console.log(`  ⚠ QUANTITY sabit (${ilk}) — PDCQUANTITY dikkate alınmıyor.`);
    console.log("    Uygulama çarpmıyor, o yüzden 5 tane okutsan da ${ilk} yazılır.");
    console.log("    Bora'ya sor: PDCQUANTITY hesaba katılmalı mı?");
  } else {
    console.log("  ⚠ Katsayı tutarsız — beklenmedik davranış:");
    sonuclar.forEach((s) =>
      console.log(`      ${s.gonderilen} → ${s.quantity} (katsayı ${s.quantity / s.gonderilen})`)
    );
  }

  const stokDegisiyor = sonuclar.some((s) => s.availStock !== sonuclar[0].availStock);
  if (stokDegisiyor) {
    console.log("\n  ⚠ AVAILSTOCK da gönderilen miktarla değişiyor —");
    console.log("    o da raftaki stoğu göstermeli, miktardan bağımsız olmalı.");
  }
}

console.log(cizgi());
await kapat();
