// -----------------------------------------------------------------------------
// YÜK TESTİ — gerçek CANIAS'a, havuz üzerinden. "Kaç saniyede yanıt dönüyor?"
// -----------------------------------------------------------------------------
// Çalıştır (VPN açık, kendi makinende):
//   cd server
//   node loadtest.mjs                 → 50 eşzamanlı istek (varsayılan)
//   node loadtest.mjs --n=100         → 100 eşzamanlı istek
//   node loadtest.mjs --barcode=8690… → ayrıca ÜRÜN barkodu okuma testi
//
// Kimlik: server/.env'deki WMS_USER / WMS_PASSWORD ile login olur (havuz).
//   .env'de bunlar olmalı:  WMS_USER=WMSWSUSER   WMS_PASSWORD=1WmS00*
//
// Servisler app ile birebir aynı: MZYListingPick (emir/ürün çek), MZYReadBarcode.
// Hepsi READ — veriye dokunmaz. Havuz max 5 eşzamanlı oturum kullanır.
// -----------------------------------------------------------------------------
import dotenv from "dotenv";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), ".env") });

const { createCaniasPool } = await import("./caniasPool.mjs");

const arg = (k, d) => {
  const a = process.argv.find((x) => x.startsWith(k + "="));
  return a ? a.split("=")[1] : d;
};
const N = Number(arg("--n", "50"));
const CO = arg("--company", process.env.T_COMPANY || "01");
const PL = arg("--plant", process.env.T_PLANT || "100");
const WH = arg("--warehouse", "D1");
const WK = arg("--worker", process.env.WMS_USER || "WMSWSUSER");
const BARCODE = arg("--barcode", "");

// app'teki (client.ts) MZYListingPick isteğiyle BİREBİR aynı
const listArgs = {
  PSCOMPANY: CO, PSPLANT: PL, PSWORKER: WK,
  PISTATUS: 3, PIISPICK: 1,
  PDSTARTDATE: "01.01.1975", PDENDDATE: "01.01.2100",
  PIISDELETE: 0, PIISSTARTED: 1, PIORDER: 0,
};

const pool = createCaniasPool();

// ---- yardımcılar ----
const satirlar = (r, key) => {
  const t = r?.data?.[key];
  const row = t?.ROW ?? t;
  return Array.isArray(row) ? row : row ? [row] : [];
};
function istatistik(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const sum = s.reduce((a, b) => a + b, 0);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return { min: s[0], ort: sum / s.length, med: q(0.5), p95: q(0.95), max: s[s.length - 1] };
}
const ms = (x) => `${x.toFixed(0)}ms`;
const rapor = (etiket, sure) => {
  const st = istatistik(sure);
  console.log(`   ${etiket}: min ${ms(st.min)} | ort ${ms(st.ort)} | medyan ${ms(st.med)} | p95 ${ms(st.p95)} | max ${ms(st.max)}`);
};
async function olc(fn) {
  const t0 = performance.now();
  try { await fn(); return { ms: performance.now() - t0, ok: true }; }
  catch (e) { return { ms: performance.now() - t0, ok: false, err: e?.message || String(e) }; }
}

console.log("========== YÜK TESTİ ==========");
console.log(`Hedef: ${process.env.CANIAS_APPSERVER || "(env)"} | Kullanıcı: ${WK} | Firma/Tesis: ${CO}/${PL}\n`);

// ---- 1) LOGIN + ürünleri çek (doğrulama) ----
console.log("[1] Login + toplama emirleri çekiliyor...");
let ornek = [], adet = 0;
const ilk = await olc(async () => {
  const r = await pool.run("MZYListingPick", listArgs);
  const rows = satirlar(r, "TBLPOLIST");
  adet = rows.length;
  ornek = rows.slice(0, 3);
});
if (!ilk.ok) {
  console.log(`   ✗ BAŞARISIZ: ${ilk.err}`);
  console.log("   → .env'de WMS_USER/WMS_PASSWORD doğru mu? VPN açık mı?");
  await pool.shutdown(); process.exit(1);
}
console.log(`   ✓ Login OK. Açık toplama emri: ${adet} adet | ilk çağrı ${ms(ilk.ms)}`);
if (ornek.length) {
  console.log("   örnek emirler:", ornek.map((o) => o.ORDERNUM || o.PONUM || JSON.stringify(o).slice(0, 40)).join(" | "));
}

// ---- 2) TEK KULLANICI latency (10 ardışık istek) ----
console.log("\n[2] TEK istek latency (10 ardışık — tek depocu gibi):");
const seri = [];
for (let i = 0; i < 10; i++) {
  const r = await olc(() => pool.run("MZYListingPick", listArgs));
  seri.push(r.ms);
}
rapor("MZYListingPick (ardışık)", seri);

// ---- 3) YÜK: N eşzamanlı istek ----
console.log(`\n[3] YÜK: ${N} EŞZAMANLI istek (havuz max 5 oturum paylaştırır):`);
const t0 = performance.now();
const sonuc = await Promise.all(Array.from({ length: N }, () => olc(() => pool.run("MZYListingPick", listArgs))));
const toplamMs = performance.now() - t0;
const basari = sonuc.filter((x) => x.ok);
const sureler = basari.map((x) => x.ms);
console.log(`   ${basari.length}/${N} başarılı | toplam süre ${ms(toplamMs)} | verim ${(N / (toplamMs / 1000)).toFixed(1)} istek/sn`);
if (sureler.length) rapor("her istek (eşzamanlı yükte)", sureler);
const hatalar = sonuc.filter((x) => !x.ok);
if (hatalar.length) console.log(`   ⚠ ${hatalar.length} hata, örnek: ${hatalar[0].err}`);

// ---- 4) (opsiyonel) BARKOD okuma testi ----
if (BARCODE) {
  const bcArgs = { PSCOMPANY: CO, PSPLANT: PL, PSWAREHOUSE: WH, PSSTOCKPLACE: "", PSBARCODE: BARCODE, PDCQUANTITY: 1 };
  console.log(`\n[4] BARKOD okuma testi (${BARCODE}):`);
  const bcTek = await olc(() => pool.run("MZYReadBarcode", bcArgs));
  console.log(`   tek okuma: ${bcTek.ok ? ms(bcTek.ms) : "HATA: " + bcTek.err}`);
  if (bcTek.ok) {
    const bt0 = performance.now();
    const bcYuk = await Promise.all(Array.from({ length: N }, () => olc(() => pool.run("MZYReadBarcode", bcArgs))));
    const bcTop = performance.now() - bt0;
    const bcOk = bcYuk.filter((x) => x.ok);
    console.log(`   ${bcOk.length}/${N} başarılı | toplam ${ms(bcTop)} | verim ${(N / (bcTop / 1000)).toFixed(1)} okuma/sn`);
    if (bcOk.length) rapor("barkod okuma (eşzamanlı)", bcOk.map((x) => x.ms));
  }
}

console.log("\n[BİTİŞ] Havuz kapatılıyor...");
await pool.shutdown();
console.log("Kapandı. ✓");
process.exit(0);
