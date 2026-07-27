// -----------------------------------------------------------------------------
// TOKEN HAVUZU MİNİ MODELİ — gerçek CANIAS'a karşı prototip.
//   • max 5, min 1  • yükte 5'e çıkar  • boşta reaper 1'e indirir
//   • her token aynı anda TEK çağrı (per-token kilit); tokenlar paralel
// Çalıştır (VPN açık, proxy'ye GEREK YOK): node pool-model.mjs   (veya --n=30)
// NOT: bu bir prototip — commit'lenmeyecek, denedikten sonra silinecek.
// -----------------------------------------------------------------------------
import soap from "soap";
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), ".env") });

process.on("unhandledRejection", (e) => {
  console.error(`\n⚠ CANIAS hatası: ${e?.code || e?.message || e}`);
  if (String(e?.code) === "ETIMEDOUT")
    console.error("  VPN kopmuş olabilir — 192.168.22.16:8080'e erişimi kontrol et, tekrar dene.");
  process.exit(1);
});

const {
  CANIAS_WSDL_URL, CANIAS_CLIENT, CANIAS_LANGUAGE = "T",
  CANIAS_DBSERVER, CANIAS_DBNAME, CANIAS_APPSERVER, WMS_USER, WMS_PASSWORD,
} = process.env;

const LIMIT = 5;       // max eşzamanlı oturum
const MIN = 1;         // en az sıcak tutulan
const IDLE_MS = 5000;  // boşta 5 sn -> logout (model için kısa)
const YUK = Number((process.argv.find((a) => a.startsWith("--n=")) || "").split("=")[1] || 20);

const val = (x) => (x && typeof x === "object" && "$value" in x ? x.$value : x);
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const buildArgs = (p) => `<PARAMETERS>${Object.entries(p).map(([k, v]) => `<${k}>${esc(v)}</${k}>`).join("")}</PARAMETERS>`;

let client;
try {
  client = await soap.createClientAsync(CANIAS_WSDL_URL, { timeout: 30000 });
} catch (e) {
  console.error(`⚠ CANIAS'a bağlanılamadı (${CANIAS_WSDL_URL}): ${e?.code || e?.message}`);
  console.error("  VPN kopmuş olabilir. PowerShell: Test-NetConnection 192.168.22.16 -Port 8080 — sonra tekrar dene.");
  process.exit(1);
}

async function login() {
  const [res] = await client.loginAsync({
    p_strClient: CANIAS_CLIENT, p_strLanguage: CANIAS_LANGUAGE, p_strDBName: CANIAS_DBNAME,
    p_strDBServer: CANIAS_DBSERVER, p_strAppServer: CANIAS_APPSERVER,
    p_strUserName: WMS_USER, p_strPassword: WMS_PASSWORD,
  });
  return val(res?.loginReturn ?? res);
}
async function logout(sid) { try { await client.logoutAsync({ p_strSessionId: sid }); } catch {} }
async function callSvc(sid, serviceId, params) {
  const [res] = await client.callIASServiceAsync({
    sessionid: sid, serviceid: serviceId, args: buildArgs(params), returntype: "JSON", permanent: false,
  });
  return val(res?.callIASServiceReturn ?? res);
}

/* ---------------- HAVUZ ---------------- */
const pool = [];        // { sid, busy, lastUsed }
const bekleyenler = []; // acquire kuyruğu (hepsi meşgulse)
const boyut = () => pool.length;
const bosBul = () => pool.find((p) => !p.busy && p.sid);

async function acquire() {
  const b = bosBul();
  if (b) { b.busy = true; return b; }
  if (pool.length < LIMIT) {
    const slot = { sid: null, busy: true, lastUsed: Date.now() }; // slotu HEMEN rezerve et (aşırı login olmasın)
    pool.push(slot);
    slot.sid = await login();
    console.log(`   + login → havuz ${boyut()}  (${slot.sid})`);
    return slot;
  }
  return new Promise((resolve) => bekleyenler.push(resolve)); // hepsi meşgul → sıraya gir
}
function release(p) {
  p.busy = false; p.lastUsed = Date.now();
  const w = bekleyenler.shift();
  if (w) { p.busy = true; w(p); }
}
async function run(serviceId, params) {
  const p = await acquire();
  try { return await callSvc(p.sid, serviceId, params); }
  finally { release(p); }
}
async function reap() {
  const now = Date.now();
  for (const p of [...pool]) {
    if (boyut() <= MIN) break;
    if (!p.busy && p.sid && now - p.lastUsed > IDLE_MS) {
      pool.splice(pool.indexOf(p), 1);
      await logout(p.sid);
      console.log(`   - logout (idle) → havuz ${boyut()}  (${p.sid})`);
    }
  }
}
const reaper = setInterval(reap, 1500);

async function caniasAktif() {
  const p = bosBul() || pool[0];
  if (!p?.sid) return "?";
  try {
    const r = await callSvc(p.sid, "MZYActiveUserList", { PSCOMPANY: "01", PSPLANT: "100" });
    const j = typeof r === "string" ? JSON.parse(r || "{}") : r;
    const t = j?.TBLACTIVEUSER; const row = t?.ROW ?? t;
    const rows = Array.isArray(row) ? row : (row && row.CONNECTIONID ? [row] : []);
    return rows.length;
  } catch { return "?"; }
}

/* ---------------- SENARYO ---------------- */
const listing = { PSCOMPANY: "01", PSPLANT: "100", PSWORKER: WMS_USER, PISTATUS: 3, PIISPICK: 1, PDSTARTDATE: "01.01.1975", PDENDDATE: "01.01.2100", PIISDELETE: 0, PIISSTARTED: 1, PIORDER: 0 };

console.log(`=== HAVUZ MODELİ (max ${LIMIT}, min ${MIN}, idle ${IDLE_MS}ms) ===`);
console.log(`\n>>> YÜK: ${YUK} eşzamanlı istek — havuz ${LIMIT}'e çıkmalı...`);
const t0 = Date.now();
const res = await Promise.allSettled(Array.from({ length: YUK }, () => run("MZYListingPick", listing)));
const ok = res.filter((r) => r.status === "fulfilled").length;
console.log(`Yük bitti: ${ok}/${YUK} ok, ${Date.now() - t0} ms | havuz: ${boyut()} | CANIAS aktif: ${await caniasAktif()}`);

console.log(`\n>>> BOŞTA bekleniyor — reaper ${MIN}'e indirmeli...`);
for (let i = 0; i < 8; i++) {
  await new Promise((r) => setTimeout(r, 2000));
  console.log(`   +${(i + 1) * 2}s | havuz: ${boyut()}`);
  if (boyut() <= MIN) break;
}
console.log(`\nBoşta sonrası: havuz ${boyut()} | CANIAS aktif: ${await caniasAktif()}`);

console.log(`\n=== SONUÇ ===`);
console.log(boyut() <= MIN
  ? `✓ Model çalıştı: yükte ${LIMIT}'e çıktı, boşta ${MIN}'e indi.`
  : `⚠ Boşta ${boyut()} kaldı — reaper beklendiği gibi indirmedi, inceleyelim.`);

clearInterval(reaper);
for (const p of pool) await logout(p.sid);
process.exit(0);
