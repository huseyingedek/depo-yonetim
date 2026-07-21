// -----------------------------------------------------------------------------
// MZYCheckUser — login testi
// -----------------------------------------------------------------------------
// Bu servis test için ideal: sadece 2 parametre alıyor ve SQL'i küçük (Position 83).
//
// Kritik gösterge: hata mesajındaki KOLON ADI.
//   • Hep "prusern" diyorsa       → parametre hiç bağlanmıyor
//   • "prpassw" veya başka bir ada geçerse → İLK parametre bağlandı, ilerledik!
//   • Hata kaybolursa             → çözüldü
//
// Çalıştırma:  node test-login.mjs bsenturk '2Akl00*'
// -----------------------------------------------------------------------------

import soap from "soap";
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), ".env") });

const USER = process.argv[2] ?? "bsenturk";
const PASS = process.argv[3] ?? "";
if (!PASS) {
  console.error("Kullanım: node test-login.mjs <kullanici> <sifre>");
  process.exit(1);
}

const {
  CANIAS_WSDL_URL, WMS_USER, WMS_PASSWORD, CANIAS_CLIENT,
  CANIAS_LANGUAGE = "T", CANIAS_DBSERVER, CANIAS_DBNAME, CANIAS_APPSERVER,
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

/* Denenecek ad şemaları */
const CASES = [
  ["01 PSUSER/PSPASSWORD (doküman)", xml({ PSUSER: USER, PSPASSWORD: PASS })],
  ["02 PRUSERN/PRPASSW (hatadan)", xml({ PRUSERN: USER, PRPASSW: PASS })],
  ["03 ikisi birden", xml({ PSUSER: USER, PSPASSWORD: PASS, PRUSERN: USER, PRPASSW: PASS })],
  ["04 PRUSERN + PSPASSWORD", xml({ PRUSERN: USER, PSPASSWORD: PASS })],
  ["05 USERNAME/PASSWORD", xml({ USERNAME: USER, PASSWORD: PASS })],
  ["06 USER/PASS", xml({ USER: USER, PASS: PASS })],
  ["07 PUSER/PPASSWORD", xml({ PUSER: USER, PPASSWORD: PASS })],
  ["08 PSUSERNAME/PSPASSWORD", xml({ PSUSERNAME: USER, PSPASSWORD: PASS })],
  ["09 PRUSER/PRPASSWORD", xml({ PRUSER: USER, PRPASSWORD: PASS })],
  ["10 PSUSER + noktalı virgül", xml({ "PSUSER;": USER, "PSPASSWORD;": PASS })],
  ["11 sadece PSUSER", xml({ PSUSER: USER })],
  ["12 hiç parametre yok", "<PARAMETERS/>"],
];

const client = await soap.createClientAsync(CANIAS_WSDL_URL, { timeout: 20000 });
const [loginRes] = await client.loginAsync({
  Client: CANIAS_CLIENT, Language: CANIAS_LANGUAGE, DBServer: CANIAS_DBSERVER,
  DBName: CANIAS_DBNAME, ApplicationServer: CANIAS_APPSERVER,
  Username: WMS_USER, Password: WMS_PASSWORD,
  Encrypted: false, Compression: false, LCheck: "", VKey: "",
});
const lr = val(loginRes?.loginReturn ?? loginRes) ?? {};
if (lr.Success !== true || !lr.SessionId) {
  console.error("✗ CANIAS login başarısız:", lr.ErrorMessage || "(sebep yok)");
  process.exit(1);
}
console.log("✓ CANIAS servis girişi OK (WMSWSUSER) —", lr.SessionId);
console.log("\nŞimdi uygulama girişi (MZYCheckUser) deneniyor...");
console.log("Kullanıcı:", USER, "\n");
console.log("═".repeat(74));

const seenColumns = new Set();

for (const [label, params] of CASES) {
  let err = "", resp = "", msg = "";
  try {
    const [res] = await client.callServiceAsync({
      SessionId: lr.SessionId,
      SecurityKey: lr.SecurityKey || "",
      ServiceId: "MZYCheckUser",
      Parameters: params,
      Compressed: false, Permanent: false, ExtraVariables: "", RequestId: 0,
    });
    const r = val(res?.callServiceReturn ?? res) ?? {};
    err = (r.SYSStatusError || "").split("\n")[0];
    resp = r.Response?.Value ?? "";
    msg = r.Messages?.Value ?? "";
  } catch (e) {
    err = "SOAP: " + (e?.message || e);
  }

  // Hata mesajındaki kolon adı
  const col = (/column "([a-z0-9_]+)"/i.exec(err) || [])[1] || null;
  if (col) seenColumns.add(col);

  // Kullanıcı satırı döndü mü?
  let rows = 0;
  try {
    const t = JSON.parse(resp).TBLUSER;
    rows = Array.isArray(t) ? t.length : t ? 1 : 0;
  } catch { /* yok */ }

  const flag = rows > 0 ? "✓✓ GİRİŞ BAŞARILI" : !err ? "· hatasız ama boş" : "✗";
  console.log(`\n${flag}  ${label}`);
  if (err) console.log(`  hata  : ${err.slice(0, 130)}`);
  if (col) console.log(`  kolon : ${col}`);
  if (msg) console.log(`  msg   : ${String(msg).replace(/\s+/g, " ").slice(0, 200)}`);
  if (rows > 0) console.log(`  KULLANICI: ${String(resp).replace(/\s+/g, " ").slice(0, 500)}`);
}

console.log("\n" + "═".repeat(74));
console.log("SONUÇ");
console.log("═".repeat(74));
console.log("Hata mesajında görülen kolon adları:", [...seenColumns].join(", ") || "(yok)");
if (seenColumns.size === 1) {
  console.log(
    `\n→ 12 farklı adlandırmada da hata hep aynı kolonu ("${[...seenColumns][0]}") gösteriyor.\n` +
      "  Gönderdiğimiz parametreler servise hiç ulaşmıyor. Sorun bizim tarafta değil."
  );
} else if (seenColumns.size > 1) {
  console.log("\n→ Kolon adı DEĞİŞTİ! Bazı şemalar bağlanıyor, ilerleme var.");
}

await client.logoutAsync({ SessionId: lr.SessionId }).catch(() => {});
