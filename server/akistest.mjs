// -----------------------------------------------------------------------------

// -----------------------------------------------------------------------------

// Çalıştır (proxy'ye ulaşabilen makinede):
//   node akistest.mjs --order=650006

// -----------------------------------------------------------------------------
import { performance } from "node:perf_hooks";

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(k + "=")); return a ? a.split("=")[1] : d; };
const BASE = arg("--base", "http://192.168.22.16:8787");
const ORDER = arg("--order", "");
const CREATE = process.argv.includes("--createcontainer");
const CO = arg("--company", "01");
const PL = arg("--plant", "100");
const WK = arg("--worker", "WMSWSUSER");
const TIMEOUT = Number(arg("--timeout", "35000"));

if (!ORDER) { console.log("Kullanım: node akistest.mjs --order=650006 [--createcontainer] [--base=http://...]"); process.exit(1); }

async function proxy(service, params) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), TIMEOUT);
  const t0 = performance.now();
  try {
    const res = await fetch(`${BASE}/api/mzy/${service}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params), signal: ctrl.signal,
    });
    const body = await res.json().catch(() => ({}));
    return { ms: performance.now() - t0, status: res.status, body };
  } catch (e) {
    return { ms: performance.now() - t0, status: 0, aborted: ctrl.signal.aborted, err: e.message };
  } finally { clearTimeout(to); }
}

async function adim(no, ad, service, params) {
  const r = await proxy(service, params);
  const okYanit = r.status === 200 && !r.body?.error;
  if (okYanit) {
    console.log(`  [${no}] ${ad}: ${r.ms.toFixed(0)}ms ✓`);
  } else {
    const neden = r.aborted
      ? `⏱ TIMEOUT — ${(r.ms / 1000).toFixed(0)}sn YANIT YOK (BURADA TAKILDI)`
      : r.status === 502 ? `✗ HTTP 502 — proxy CANIAS'tan yanıt alamadı: ${r.body?.error || ""}`
      : r.status === 0 ? `✗ proxy'ye ulaşılamadı: ${r.err}`
      : `✗ HTTP ${r.status}: ${JSON.stringify(r.body).slice(0, 140)}`;
    console.log(`  [${no}] ${ad}: ${neden}`);
  }
  return { ok: okYanit, ...r };
}
const satir = (body, key) => { const t = body?.data?.[key]; const row = t?.ROW ?? t; return Array.isArray(row) ? row : row ? [row] : []; };

console.log(`===== AKIŞ TESTİ (CANLI PROXY) — ${BASE} — Sipariş ${ORDER} =====\n`);

try {
  const h = await fetch(`${BASE}/health`).then((r) => r.json()).catch(() => null);
  console.log(h?.ok ? `  [0] /health: ✓ oturum ${h.sessionId}` : `  [0] /health: ✗ ${JSON.stringify(h)}`);
} catch (e) { console.log(`  [0] /health: ✗ proxy'ye ulaşılamadı (${e.message}) — canlı çalışıyor mu?`); }

const listeArgs = (worker) => ({ PSCOMPANY: CO, PSPLANT: PL, PSWORKER: worker, PISTATUS: 3, PIISPICK: 1, PDSTARTDATE: "01.01.1975", PDENDDATE: "01.01.2100", PIISDELETE: 0, PIISSTARTED: 1, PIORDER: 0 });
let s1 = await adim(1, `MZYListingPick (worker="${WK}")`, "MZYListingPick", listeArgs(WK));
let hepsi = s1.ok ? satir(s1.body, "TBLPOLIST") : [];
if (s1.ok && hepsi.length === 0) {
  console.log(`      → worker="${WK}" ile 0 sipariş. PSWORKER="" (tümü) ile tekrar deniyorum:`);
  const s1b = await adim("1b", `MZYListingPick (worker="")`, "MZYListingPick", listeArgs(""));
  if (s1b.ok) hepsi = satir(s1b.body, "TBLPOLIST");
}
let tip = "";
if (!hepsi.length) { console.log(`\n  ⚠ Hiç açık sipariş dönmedi. Duruyorum.`); process.exit(0); }
console.log(`      → ${hepsi.length} açık sipariş bulundu.`);
const o = hepsi.find((x) => String(x.ORDERNUM) === ORDER);
if (!o) {
  console.log(`\n  ⚠ ${ORDER} listede yok. Açık siparişler:`);
  console.log("     " + hepsi.map((x) => `${x.ORDERNUM}${x.WORKER ? "(" + x.WORKER + ")" : ""}`).join(", ").slice(0, 500));
  if (hepsi[0]) console.log("\n     ilk kaydın alanları (worker alan adını görmek için): " + JSON.stringify(hepsi[0]).slice(0, 500));
  console.log(`\n  → Yukarıdan gerçek bir --order seç.`);
  process.exit(0);
}
tip = o.ORDERTYPE || "";
console.log(`      → ${ORDER} bulundu, tip="${tip}"`);

// 2) ENTERPICK
const s2 = await adim(2, "MZYEnterPick", "MZYEnterPick", { PSCOMPANY: CO, PSPLANT: PL, PSORDERNUM: ORDER, PSORDERTYPE: tip, PSUSER: WK });
let kalemler = [], hedefDepo = "";
if (s2.ok) {
  kalemler = satir(s2.body, "IASWMSPOITEM");
  if (!kalemler.length) kalemler = satir(s2.body, "TBLWMSPO");
  hedefDepo = kalemler.find((l) => l.WAREHOUSETA)?.WAREHOUSETA || "";
  console.log(`      → ${kalemler.length} kalem, hedef depo="${hedefDepo || "boş"}"`);
}

for (const l of kalemler) {
  await adim("3." + l.ITEMNO, `MZYCrtSuggestListPickFromSP (kalem ${l.ITEMNO})`, "MZYCrtSuggestListPickFromSP", {
    PSCOMPANY: CO, PSPLANT: PL, PSORDERNUM: ORDER, PSORDERTYPE: tip, PIITEMNO: Number(l.ITEMNO),
  });
}

if (CREATE) {
  console.log(`\n  --createcontainer → GÖNDERME adımı (YAZMA):`);
  const s4 = await adim(4, "MZYCreateContainer (Pakete Yerleştir)", "MZYCreateContainer", {
    PSCOMPANY: CO, PSPLANT: PL, PSWAREHOUSE: hedefDepo, PSMATERIAL: "KONPAKET", PSORDERNUM: ORDER, PSORDERTYPE: tip,
  });
  if (s4.ok) console.log(`      → palet: ${JSON.stringify(satir(s4.body, "TBLCONTSP")[0] ?? "boş")}`);
} else {
  console.log(`\n  (Gönderme adımını da denemek için: --createcontainer ekle)`);
}

console.log(`\n===== BİTTİ =====`);
console.log(`Bir adım "TIMEOUT — TAKILDI" → takılma orada. "HTTP 502" → CANIAS o çağrıya yanıt vermedi.`);
console.log(`Hepsi ✓ → akış sağlıklı, sorun o siparişe/ana özgü.`);
process.exit(0);
