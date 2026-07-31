// -----------------------------------------------------------------------------
// BARKOD STOK TANI — "stok yok" mesajının kaynağını bulur.
// -----------------------------------------------------------------------------
// MZYReadBarcode ham yanıtını döker; AVAILSTOCK gerçekten 0 mı, yoksa alan adı
// farklı/başka yerde mi görürsün. Rafsız (toplam) ile raflı (o raf) karşılaştırır.
//
// Çalıştır (VPN açık):
//   node barkodtani.mjs --barcode=8690632713052
//   node barkodtani.mjs --barcode=XXXX --warehouse=D1 --stockplace=D3R1
//
// Ekrandaki üründen bir barkod + o rafı (D1 / D3R1 gibi) ver.
// -----------------------------------------------------------------------------
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), ".env") });

const { createCaniasPool } = await import("./caniasPool.mjs");
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(k + "=")); return a ? a.split("=")[1] : d; };

const BARCODE = arg("--barcode", "");
const WH = arg("--warehouse", "");
const SP = arg("--stockplace", "");
const CO = arg("--company", process.env.T_COMPANY || "01");
const PL = arg("--plant", process.env.T_PLANT || "100");

if (!BARCODE) {
  console.log("Kullanım: node barkodtani.mjs --barcode=XXXX [--warehouse=D1 --stockplace=D3R1]");
  process.exit(1);
}

const pool = createCaniasPool();

async function oku(etiket, wh, sp) {
  const params = { PSCOMPANY: CO, PSPLANT: PL, PSWAREHOUSE: wh, PSSTOCKPLACE: sp, PSBARCODE: BARCODE, PDCQUANTITY: 1 };
  console.log(`\n=== ${etiket}  (PSWAREHOUSE="${wh}" PSSTOCKPLACE="${sp}") ===`);
  try {
    const r = await pool.run("MZYReadBarcode", params);
    const t = r?.data?.WMSXMLTABLE;
    const row = t?.ROW ?? t;
    const rows = Array.isArray(row) ? row : row ? [row] : [];
    console.log(`ham satır sayısı: ${rows.length}`);
    rows.forEach((x, i) => console.log(`  satır[${i}]: ${JSON.stringify(x)}`));
    const satir = rows.find((x) => x && x.MATERIAL) || rows[0] || {};
    const stokAlan = Object.keys(satir).filter((k) => /stock|stok|qty|quantity|miktar|avail|kalan|adet/i.test(k));
    console.log(`  → MATERIAL=${satir.MATERIAL ?? "-"} | SPECIALSTOCK=${satir.SPECIALSTOCK ?? "-"} (1=parti takipli)`);
    console.log(`  → stok/miktar alanları: ${stokAlan.map((k) => `${k}=${satir[k]}`).join(" | ") || "(HİÇ YOK — alan adı farklı olabilir!)"}`);
  } catch (e) {
    console.log(`  HATA: ${e?.message || e}`);
  }
}

console.log("========== BARKOD STOK TANI ==========");
console.log(`Barkod: ${BARCODE} | Firma/Tesis: ${CO}/${PL}`);
await oku("1) RAFSIZ — deponun TOPLAM stoğu", "", "");
if (WH || SP) await oku("2) RAF İLE — SADECE o rafın stoğu", WH, SP);
else console.log("\n(2. testi görmek için --warehouse ve --stockplace ver — ekrandaki raf, ör. D1 / D3R1)");

console.log("\n[BİTİŞ]");
await pool.shutdown();
process.exit(0);
