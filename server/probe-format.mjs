// -----------------------------------------------------------------------------
// CANIAS "Parameters" SARMAL FORMATI tespiti
// -----------------------------------------------------------------------------
// Sorun: PRUSERN=bsenturk gönderdik, servis hâlâ "column prusern does not exist"
// diyor. Yani parametre hiç bağlanmıyor → sarmal (wrapper) yapısı yanlış.
//
// Bu script MZYCheckUser'ı aynı parametreyle ama FARKLI sarmallarla çağırır.
// Hata metni "prusern does not exist" olmaktan çıkarsa → o format doğrudur.
//
// Çalıştırma (Aktüel VPN açıkken):
//   cd server
//   node probe-format.mjs bsenturk '2Akl00*'
// -----------------------------------------------------------------------------

import soap from "soap";
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), ".env") });

const USER = process.argv[2] ?? "";
const PASS = process.argv[3] ?? "";
if (!USER) {
  console.error("Kullanım: node probe-format.mjs <kullanici> <sifre>");
  process.exit(1);
}

const {
  CANIAS_WSDL_URL,
  WMS_USER,
  WMS_PASSWORD,
  CANIAS_CLIENT,
  CANIAS_LANGUAGE = "T",
  CANIAS_DBSERVER,
  CANIAS_DBNAME,
  CANIAS_APPSERVER,
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
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// Denenecek sarmallar. p = [[ad, deger], ...]
const FORMATS = [
  ["A düz alan", (p) => `<PARAMETERS>${p.map(([k, v]) => `<${k}>${esc(v)}</${k}>`).join("")}</PARAMETERS>`],
  ["B PARAMETER>NAME/VALUE", (p) => `<PARAMETERS>${p.map(([k, v]) => `<PARAMETER><NAME>${k}</NAME><VALUE>${esc(v)}</VALUE></PARAMETER>`).join("")}</PARAMETERS>`],
  ["C PARAMETER attr", (p) => `<PARAMETERS>${p.map(([k, v]) => `<PARAMETER NAME="${k}" VALUE="${esc(v)}"/>`).join("")}</PARAMETERS>`],
  ["D PARAM attr+text", (p) => `<PARAMETERS>${p.map(([k, v]) => `<PARAM NAME="${k}">${esc(v)}</PARAM>`).join("")}</PARAMETERS>`],
  ["E FIELD attr", (p) => `<PARAMETERS>${p.map(([k, v]) => `<FIELD NAME="${k}">${esc(v)}</FIELD>`).join("")}</PARAMETERS>`],
  ["F servis adı kök", (p) => `<MZYCheckUser>${p.map(([k, v]) => `<${k}>${esc(v)}</${k}>`).join("")}</MZYCheckUser>`],
  ["G PARAMETERS>servis", (p) => `<PARAMETERS><MZYCheckUser>${p.map(([k, v]) => `<${k}>${esc(v)}</${k}>`).join("")}</MZYCheckUser></PARAMETERS>`],
  ["H ROOT>PARAMETERS", (p) => `<ROOT><PARAMETERS>${p.map(([k, v]) => `<${k}>${esc(v)}</${k}>`).join("")}</PARAMETERS></ROOT>`],
  ["I TROIA kök", (p) => `<TROIAPARAMETERS>${p.map(([k, v]) => `<${k}>${esc(v)}</${k}>`).join("")}</TROIAPARAMETERS>`],
  ["J tek satır PARAMETER", (p) => `<PARAMETERS><PARAMETER>${p.map(([k, v]) => `<${k}>${esc(v)}</${k}>`).join("")}</PARAMETER></PARAMETERS>`],
  ["K DATA>ROW", (p) => `<PARAMETERS><DATA><ROW>${p.map(([k, v]) => `<${k}>${esc(v)}</${k}>`).join("")}</ROW></DATA></PARAMETERS>`],
  ["L JSON", (p) => JSON.stringify(Object.fromEntries(p))],
  ["M key=value", (p) => p.map(([k, v]) => `${k}=${v}`).join("\n")],
  ["N küçük harf alan", (p) => `<PARAMETERS>${p.map(([k, v]) => `<${k.toLowerCase()}>${esc(v)}</${k.toLowerCase()}>`).join("")}</PARAMETERS>`],
];

const client = await soap.createClientAsync(CANIAS_WSDL_URL, { timeout: 20000 });

// WSDL'de parametre şemasını anlatan başka bir operasyon var mı?
console.log("WSDL operasyonları:");
try {
  const desc = client.describe();
  for (const svc of Object.values(desc)) {
    for (const port of Object.values(svc)) {
      console.log("  " + Object.keys(port).join(", "));
    }
  }
} catch (e) {
  console.log("  (okunamadı)", e?.message || e);
}
console.log();

const [loginRes] = await client.loginAsync({
  Client: CANIAS_CLIENT,
  Language: CANIAS_LANGUAGE,
  DBServer: CANIAS_DBSERVER,
  DBName: CANIAS_DBNAME,
  ApplicationServer: CANIAS_APPSERVER,
  Username: WMS_USER,
  Password: WMS_PASSWORD,
  Encrypted: false,
  Compression: false,
  LCheck: "",
  VKey: "",
});
const lr = val(loginRes?.loginReturn ?? loginRes) ?? {};
if (lr.Success !== true || !lr.SessionId) {
  console.error("✗ Login başarısız:", lr.ErrorMessage || "(sebep yok)");
  process.exit(1);
}
console.log("✓ Login OK —", lr.SessionId, "\n");

const PARAMS = [
  ["PRUSERN", USER],
  ["PRPASSW", PASS],
];

console.log("Beklenen: 'prusern does not exist' hatası KAYBOLURSA o format doğrudur.\n");
console.log("═".repeat(74));

const winners = [];

for (const [label, build] of FORMATS) {
  const xml = build(PARAMS);
  let out;
  try {
    const [res] = await client.callServiceAsync({
      SessionId: lr.SessionId,
      SecurityKey: lr.SecurityKey || "",
      ServiceId: "MZYCheckUser",
      Parameters: xml,
      Compressed: false,
      Permanent: false,
      ExtraVariables: "",
      RequestId: 0,
    });
    const r = val(res?.callServiceReturn ?? res) ?? {};
    out = {
      err: (r.SYSStatusError || "").split("\n")[0],
      msg: r.Messages?.Value ?? "",
      resp: r.Response?.Value ?? "",
    };
  } catch (e) {
    out = { err: "SOAP: " + (e?.message || e), msg: "", resp: "" };
  }

  const stillUnbound = /prusern/i.test(out.err);
  const flag = out.err ? (stillUnbound ? "✗ bağlanmadı" : "★ FARKLI HATA") : "✓✓ HATASIZ";
  if (!stillUnbound) winners.push(label);

  console.log(`\n${flag}  ${label}`);
  console.log(`  gönderilen: ${xml.slice(0, 110)}`);
  if (out.err) console.log(`  hata      : ${out.err.slice(0, 160)}`);
  if (out.msg) console.log(`  messages  : ${String(out.msg).slice(0, 200)}`);
  if (out.resp) console.log(`  response  : ${String(out.resp).slice(0, 200)}`);
}

console.log("\n" + "═".repeat(74));
console.log(
  winners.length
    ? "İlgilenilecek formatlar: " + winners.join(", ")
    : "Hiçbiri bağlanmadı — sarmal dışında bir şey gerekiyor (Bora'ya sor)."
);

await client.logoutAsync({ SessionId: lr.SessionId }).catch(() => {});
