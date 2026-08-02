// -----------------------------------------------------------------------------

// -----------------------------------------------------------------------------

// -----------------------------------------------------------------------------
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), ".env") });

process.env.POOL_MIN = process.env.POOL_MIN || "3";
process.env.POOL_RECONCILE_MS = "99999999";         // otomatik değil, elle çağıracağız
process.env.POOL_KEEPALIVE_MS = "99999999";

const { createCaniasPool } = await import("./caniasPool.mjs");
const C = process.env.T_COMPANY || "01", P = process.env.T_PLANT || "100";
const ARGS = { PSCOMPANY: C, PSPLANT: P };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const pool = createCaniasPool();

let ok = 0, fail = 0, sonHata = "";
let calisiyor = true;

async function akis() {
  while (calisiyor) {
    const rs = await Promise.allSettled([1, 2, 3].map(() => pool.run("MZYActiveUserList", ARGS)));
    for (const r of rs) {
      if (r.status === "fulfilled") ok++;
      else { fail++; sonHata = r.reason?.message || String(r.reason); }
    }
  }
}

async function aktifSayisi() {
  try {
    const r = await pool.run("MZYActiveUserList", ARGS);
    const t = r?.data?.TBLACTIVEUSER; const row = t?.ROW ?? t;
    const rows = Array.isArray(row) ? row : row && row.CONNECTIONID ? [row] : [];
    return rows.length;
  } catch { return "?"; }
}

console.log("========== AKTİF YÜK ALTINDA MANUEL-KILL ==========");
console.log("Sürekli istek başlıyor... birkaç saniye sonra Workbench'ten oturum KILL et.\n");

akis(); // arka planda sürekli yük

for (let s = 1; s <= 60; s++) {
  await sleep(1000);
  await pool._pool.reconcile().catch(() => {});
  const canias = await aktifSayisi();
  console.log(`[t=${String(s).padStart(2)}s] ok=${ok} fail=${fail} | havuz=${pool.status().size} | CANIAS aktif=${canias}${sonHata ? " | son hata: " + sonHata : ""}`);
}

calisiyor = false;
await sleep(300);
console.log(`\n[SONUÇ] Toplam ${ok} başarılı, ${fail} başarısız.`);
console.log(fail === 0
  ? "→ Oturumları kill etmene rağmen HİÇBİR istek düşmedi. Kendini tam toparladı. ✓"
  : `→ ${fail} istek düştü (kill anındaki uçuştakiler olabilir), ama akış kesilmeden devam etti.`);
await pool.shutdown();
process.exit(0);
