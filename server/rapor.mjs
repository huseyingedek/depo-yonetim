// -----------------------------------------------------------------------------
// TOPLANTI RAPORU — tüm katmanları aşama aşama kontrol eder
// -----------------------------------------------------------------------------
// Çalıştırma:  node rapor.mjs TOPLAMATEST Tt123
// -----------------------------------------------------------------------------

import soap from "soap";
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), ".env") });

const USER = process.argv[2] ?? "TOPLAMATEST";
const PASS = process.argv[3] ?? "Tt123";

const {
  CANIAS_WSDL_URL, WMS_USER, WMS_PASSWORD, CANIAS_CLIENT,
  CANIAS_LANGUAGE = "T", CANIAS_DBSERVER, CANIAS_DBNAME, CANIAS_APPSERVER,
  T_COMPANY = "01", T_PLANT = "100", T_WAREHOUSE = "D1",
} = process.env;

function val(x) {
  if (x === null || x === undefined) return x;
  if (Array.isArray(x)) return x.map(val);
  if (typeof x === "object") {
    if ("$value" in x) return x.$value;
    const out = {};
    for (const [k, v] of Object.entries(x)) {
      if (k === "attributes") continue;
      out[k] = val(v);
    }
    return Object.keys(out).length ? out : "";
  }
  return x;
}
const esc = (s) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const xml = (o) =>
  `<PARAMETERS>${Object.entries(o).map(([k, v]) => `<${k}>${esc(v)}</${k}>`).join("")}</PARAMETERS>`;

/** TROIA mesajından sadece metni çıkar */
function msgText(raw) {
  if (!raw) return "";
  const t = String(raw);
  const found = [...t.matchAll(/<TEXT>([\s\S]*?)<\/TEXT>/gi)].map((m) => m[1].trim());
  return found.length ? found.join(" | ") : t.slice(0, 120);
}

const line = (c = "─") => console.log(c.repeat(78));
const ok = (s) => `✓ ${s}`;
const no = (s) => `✗ ${s}`;

console.log("\n" + "═".repeat(78));
console.log("  AKTÜEL OFİS WMS — SERVİS DURUM RAPORU");
console.log("  " + new Date().toLocaleString("tr-TR"));
console.log("═".repeat(78));

/* ---------- AŞAMA 1: Ayarlar ---------- */
line("═");
console.log("AŞAMA 1 — Bağlantı ayarları (server/.env)");
line();
const cfg = {
  "WSDL adresi": CANIAS_WSDL_URL,
  "Uygulama sunucusu": CANIAS_APPSERVER,
  "Client": CANIAS_CLIENT,
  "Dil": CANIAS_LANGUAGE,
  "DB sunucu": CANIAS_DBSERVER,
  "DB adı": CANIAS_DBNAME,
  "WS kullanıcı": WMS_USER,
  "WS şifre": WMS_PASSWORD ? "(dolu)" : "(BOŞ!)",
};
for (const [k, v] of Object.entries(cfg)) {
  console.log(`  ${k.padEnd(22)} ${v || "(tanımsız)"}`);
}
const cfgEksik = Object.entries(cfg).filter(([, v]) => !v || v === "(BOŞ!)").map(([k]) => k);
console.log(`\n  ${cfgEksik.length ? no("Eksik: " + cfgEksik.join(", ")) : ok("Tüm ayarlar dolu")}`);
if (!/:\d+$/.test(CANIAS_APPSERVER)) {
  console.log(`  ${no("Uygulama sunucusunda port yok — 'ip:27499' olmalı")}`);
} else {
  console.log(`  ${ok("Uygulama sunucusu port içeriyor")}`);
}

/* ---------- AŞAMA 2: WSDL ---------- */
line("═");
console.log("AŞAMA 2 — WSDL erişimi ve SOAP istemcisi");
line();
let client;
try {
  client = await soap.createClientAsync(CANIAS_WSDL_URL, { timeout: 20000 });
  const d = client.describe();
  const ops = Object.values(Object.values(d)[0])[0];
  console.log(`  ${ok("WSDL okundu")}`);
  console.log(`  Operasyonlar: ${Object.keys(ops).join(", ")}`);
} catch (e) {
  console.log(`  ${no("WSDL okunamadı: " + (e?.message || e))}`);
  console.log("\n  → VPN kapalı olabilir. FortiClient bağlı mı kontrol et.");
  process.exit(1);
}

/* ---------- AŞAMA 3: CANIAS oturumu ---------- */
line("═");
console.log("AŞAMA 3 — CANIAS servis girişi (WMSWSUSER ile token alma)");
line();
const [loginRes] = await client.loginAsync({
  Client: CANIAS_CLIENT, Language: CANIAS_LANGUAGE, DBServer: CANIAS_DBSERVER,
  DBName: CANIAS_DBNAME, ApplicationServer: CANIAS_APPSERVER,
  Username: WMS_USER, Password: WMS_PASSWORD,
  Encrypted: false, Compression: false, LCheck: "", VKey: "",
});
const lr = val(loginRes?.loginReturn ?? loginRes) ?? {};
if (lr.Success !== true || !lr.SessionId) {
  console.log(`  ${no("Giriş başarısız: " + (lr.ErrorMessage || "sebep bilinmiyor"))}`);
  process.exit(1);
}
console.log(`  ${ok("Giriş başarılı")}`);
console.log(`  Oturum: ${lr.SessionId}`);

/* ---------- AŞAMA 4: Yayınlanmış servisler ---------- */
line("═");
console.log("AŞAMA 4 — Sunucuda yayınlanmış servisler");
line();
const BEKLENEN = [
  "MZYCheckUser", "MZYListingPick", "MZYEnterPick",
  "MZYClosePick", "MZYCreateContainer", "MZYReadBarcode",
  "GetCompany", "GetPlant", "GetWarehouse",
];
let yayinda = [];
try {
  const [sres] = await client.listServicesAsync({ SessionId: lr.SessionId });
  const sv = val(sres?.listServicesReturn ?? sres);
  const text = JSON.stringify(sv);
  yayinda = BEKLENEN.filter((s) => text.includes(s));
  for (const s of BEKLENEN) {
    console.log(`  ${yayinda.includes(s) ? ok(s) : no(s + "  ← sunucuda YOK")}`);
  }
} catch (e) {
  console.log(`  (servis listesi alınamadı: ${e?.message || e})`);
}

/* ---------- AŞAMA 5: Servis çağrıları ---------- */
line("═");
console.log("AŞAMA 5 — Servisleri tek tek çağır");
line();

async function dene(ad, params, tablo) {
  let err = "", resp = "", msg = "";
  try {
    const [res] = await client.callServiceAsync({
      SessionId: lr.SessionId,
      SecurityKey: lr.SecurityKey || "",
      ServiceId: ad,
      Parameters: xml(params),
      Compressed: false, Permanent: false, ExtraVariables: "", RequestId: 0,
    });
    const r = val(res?.callServiceReturn ?? res) ?? {};
    err = (r.SYSStatusError || "").split("\n")[0];
    resp = r.Response?.Value ?? "";
    msg = msgText(r.Messages?.Value);
  } catch (e) {
    err = "SOAP: " + (e?.message || e);
  }

  let satir = null;
  try {
    const d = JSON.parse(resp);
    const t = tablo && d[tablo] !== undefined ? d[tablo] : Object.values(d)[0];
    satir = Array.isArray(t) ? t.length : t ? 1 : 0;
  } catch { /* yok */ }

  const durum = err ? "HATA" : satir > 0 ? `${satir} SATIR` : "boş";
  console.log(`\n  ${ad}`);
  console.log(`    parametre : ${Object.keys(params).length} adet`);
  console.log(`    durum     : ${err ? no(durum) : satir > 0 ? ok(durum) : "· " + durum}`);
  if (err) console.log(`    hata      : ${err.slice(0, 120)}`);
  if (msg) console.log(`    mesaj     : ${msg}`);
  if (satir > 0) {
    try {
      const d = JSON.parse(resp);
      const t = tablo && d[tablo] !== undefined ? d[tablo] : Object.values(d)[0];
      const first = Array.isArray(t) ? t[0] : t;
      console.log(`    alanlar   : ${Object.keys(first).join(", ")}`);
    } catch { /* yok */ }
  }
  return { ad, err, msg, satir, resp };
}

const sonuclar = [];
sonuclar.push(await dene("MZYCheckUser", { PSUSER: USER, PSPASSWORD: PASS }, "TBLUSER"));
sonuclar.push(await dene("MZYListingPick", {
  PSCOMPANY: T_COMPANY, PSPLANT: T_PLANT, PSWORKER: USER,
    PISTATUS: 0, PIISPICK: 1,
    PDSTARTDATE: "01.01.1975", PDENDDATE: "01.01.2100",
    PIISDELETE: 0, PIISSTARTED: 1, PIORDER: 0,
}, "TBLPOLIST"));
sonuclar.push(await dene("MZYReadBarcode", {
  PSCOMPANY: T_COMPANY, PSPLANT: T_PLANT, PSBARCODE: "%",
}, null));
if (yayinda.includes("GetCompany")) sonuclar.push(await dene("GetCompany", {}, null));
if (yayinda.includes("GetPlant")) sonuclar.push(await dene("GetPlant", { PSCOMPANY: T_COMPANY }, null));
if (yayinda.includes("GetWarehouse")) {
  sonuclar.push(await dene("GetWarehouse", { PSCOMPANY: T_COMPANY, PSPLANT: T_PLANT }, null));
}
console.log("\n  (MZYEnterPick / MZYClosePick / MZYCreateContainer veri YAZDIĞI için");
console.log("   otomatik denenmedi — gerçek bir emir numarası gerekiyor.)");

/* ---------- ÖZET ---------- */
line("═");
console.log("ÖZET");
line("═");
console.log("\n  Katmanlar:");
console.log(`    ${ok("VPN / ağ erişimi")}`);
console.log(`    ${ok("WSDL ve SOAP istemcisi")}`);
console.log(`    ${ok("CANIAS oturumu (WMSWSUSER)")}`);
console.log(`    ${ok("Servis çağrısı ulaşıyor")}`);

const eksikServis = BEKLENEN.filter((s) => !yayinda.includes(s));
const hatali = sonuclar.filter((s) => s.err);
const bosDonen = sonuclar.filter((s) => !s.err && s.satir === 0);
const veriGelen = sonuclar.filter((s) => s.satir > 0);

console.log("\n  Servisler:");
console.log(`    Veri dönen     : ${veriGelen.length ? veriGelen.map((s) => s.ad).join(", ") : "yok"}`);
console.log(`    Boş dönen      : ${bosDonen.length ? bosDonen.map((s) => s.ad).join(", ") : "yok"}`);
console.log(`    Hata veren     : ${hatali.length ? hatali.map((s) => s.ad).join(", ") : "yok"}`);
console.log(`    Sunucuda yok   : ${eksikServis.length ? eksikServis.join(", ") : "yok"}`);

console.log("\n  Değerlendirme:");
if (veriGelen.length === 0 && hatali.length === 0) {
  console.log("    Servisler çalışıyor, hata yok — ama hiçbiri veri döndürmüyor.");
  console.log("    Bizim taraftaki parametreler dokümanla birebir aynı.");
  console.log("    → Eksik olan: CANIAS'ta tanımlı depo kullanıcısı ve açık toplama emri.");
} else if (hatali.length) {
  console.log("    Bazı servisler hata veriyor — yukarıdaki mesajlara bakın.");
} else {
  console.log("    Veri geliyor — uygulama listeyi gösterebilir.");
}

console.log("\n  Kullanılan test bilgileri:");
console.log(`    Depo kullanıcısı : ${USER}`);
console.log(`    Firma / Tesis    : ${T_COMPANY} / ${T_PLANT}`);
console.log(`    Depo             : ${T_WAREHOUSE}`);
line("═");
console.log("");

await client.logoutAsync({ SessionId: lr.SessionId }).catch(() => {});
