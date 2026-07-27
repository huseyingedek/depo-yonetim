// -----------------------------------------------------------------------------
// AKTİF KULLANICILAR — CANIAS'ta şu an açık oturumları listeler.
// Çalıştır (VPN açık): node aktif.mjs
// -----------------------------------------------------------------------------
import soap from "soap";
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), ".env") });

process.on("unhandledRejection", (e) => {
  console.error(`\n⚠ Hata: ${e?.code || e?.message || e}`);
  if (String(e?.code) === "ETIMEDOUT") console.error("  VPN kopmuş olabilir — 192.168.22.16:8080 erişimini kontrol et.");
  process.exit(1);
});

const {
  CANIAS_WSDL_URL, CANIAS_CLIENT, CANIAS_LANGUAGE = "T",
  CANIAS_DBSERVER, CANIAS_DBNAME, CANIAS_APPSERVER, WMS_USER, WMS_PASSWORD,
} = process.env;

const val = (x) => (x && typeof x === "object" && "$value" in x ? x.$value : x);
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const buildArgs = (p) => `<PARAMETERS>${Object.entries(p).map(([k, v]) => `<${k}>${esc(v)}</${k}>`).join("")}</PARAMETERS>`;

let client, benimSid;
try {
  client = await soap.createClientAsync(CANIAS_WSDL_URL, { timeout: 20000 });
} catch (e) {
  console.error(`⚠ CANIAS'a bağlanılamadı: ${e?.code || e?.message}. VPN açık mı?`);
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
async function activeUsers(sid) {
  const [res] = await client.callIASServiceAsync({
    sessionid: sid, serviceid: "MZYActiveUserList",
    args: buildArgs({ PSCOMPANY: "01", PSPLANT: "100" }), returntype: "JSON", permanent: false,
  });
  const raw = val(res?.callIASServiceReturn ?? res);
  const j = typeof raw === "string" ? JSON.parse(raw || "{}") : raw;
  const t = j?.TBLACTIVEUSER; const row = t?.ROW ?? t;
  return Array.isArray(row) ? row : (row && row.CONNECTIONID ? [row] : []);
}

benimSid = await login();               // sorgu için bir oturum (sonda kapatılacak)
const rows = await activeUsers(benimSid);

console.log(`\n=== CANIAS AKTİF OTURUMLAR ===  (${new Date().toLocaleString("tr-TR")})\n`);
if (!rows.length) {
  console.log("(kayıt yok / servis boş döndü)");
} else {
  for (const r of rows) {
    const benimMi = r.CONNECTIONID === benimSid ? "  <-- bu sorgunun oturumu" : "";
    console.log(`• ${r.CONNECTIONID}  | tip:${r.CLIENTTYPE || "-"} | giriş:${r.LOGONDATE || "-"} | son işlem:${r.LASTINTERACTIONTIME || "-"}${benimMi}`);
  }
}
const toplam = rows.length;
const digerleri = rows.filter((r) => r.CONNECTIONID !== benimSid).length;
console.log(`\nTOPLAM aktif oturum: ${toplam}  (bu sorgunun oturumu hariç: ${digerleri})`);

await logout(benimSid);                 // temizlik
process.exit(0);
