// -----------------------------------------------------------------------------
// CANIAS parametre geçişi — 2. tur
// -----------------------------------------------------------------------------
// 1. turda öğrendik:
//   • Parameters XML olmak ZORUNDA (JSON/düz metin → "Content is not allowed in prolog")
//   • Ama geçerli her XML sessizce yutuluyor; kök adı da alan adı da fark etmiyor
//   • Yani isimle eşleme çalışmıyor
//
// Bu tur şunları dener:
//   A) SIRAYA göre (isimsiz) parametre
//   B) Kök/eleman adı varyasyonları
//   C) ExtraVariables alanından geçirme
//   D) Permanent / Compressed bayrakları
//
// Çalıştırma:  node probe-format2.mjs bsenturk '2Akl00*'
// -----------------------------------------------------------------------------

import soap from "soap";
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), ".env") });

const USER = process.argv[2] ?? "";
const PASS = process.argv[3] ?? "";
if (!USER) {
  console.error("Kullanım: node probe-format2.mjs <kullanici> <sifre>");
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

const U = USER;
const P = PASS;

/**
 * Her vaka: callService'e gönderilecek alanları döner.
 * Varsayılan: Parameters=<...>, ExtraVariables=""
 */
const CASES = [
  // --- A) sıraya göre, isimsiz ---
  ["A1 PARAMETER sırayla", { Parameters: `<PARAMETERS><PARAMETER>${U}</PARAMETER><PARAMETER>${P}</PARAMETER></PARAMETERS>` }],
  ["A2 VALUE sırayla", { Parameters: `<PARAMETERS><VALUE>${U}</VALUE><VALUE>${P}</VALUE></PARAMETERS>` }],
  ["A3 P sırayla", { Parameters: `<PARAMETERS><P>${U}</P><P>${P}</P></PARAMETERS>` }],
  ["A4 numaralı P1/P2", { Parameters: `<PARAMETERS><P1>${U}</P1><P2>${P}</P2></PARAMETERS>` }],
  ["A5 ITEM sırayla", { Parameters: `<PARAMETERS><ITEM>${U}</ITEM><ITEM>${P}</ITEM></PARAMETERS>` }],

  // --- B) kök / öznitelik varyasyonları ---
  ["B1 kök öznitelik", { Parameters: `<PARAMETERS PRUSERN="${U}" PRPASSW="${P}"/>` }],
  ["B2 REQUEST kök", { Parameters: `<REQUEST><PRUSERN>${U}</PRUSERN><PRPASSW>${P}</PRPASSW></REQUEST>` }],
  ["B3 INPUT kök", { Parameters: `<INPUT><PRUSERN>${U}</PRUSERN><PRPASSW>${P}</PRPASSW></INPUT>` }],
  ["B4 VARIABLES kök", { Parameters: `<VARIABLES><PRUSERN>${U}</PRUSERN><PRPASSW>${P}</PRPASSW></VARIABLES>` }],
  ["B5 TROIADATA kök", { Parameters: `<TROIADATA><PRUSERN>${U}</PRUSERN><PRPASSW>${P}</PRPASSW></TROIADATA>` }],
  ["B6 tip öznitelikli", { Parameters: `<PARAMETERS><PARAMETER NAME="PRUSERN" TYPE="STRING">${U}</PARAMETER><PARAMETER NAME="PRPASSW" TYPE="STRING">${P}</PARAMETER></PARAMETERS>` }],

  // --- C) ExtraVariables kanalı ---
  ["C1 Extra=XML, Params boş", { Parameters: "<PARAMETERS/>", ExtraVariables: `<PARAMETERS><PRUSERN>${U}</PRUSERN><PRPASSW>${P}</PRPASSW></PARAMETERS>` }],
  ["C2 Extra=key=value", { Parameters: "<PARAMETERS/>", ExtraVariables: `PRUSERN=${U};PRPASSW=${P}` }],
  ["C3 Extra=key=value (satır)", { Parameters: "<PARAMETERS/>", ExtraVariables: `PRUSERN=${U}\nPRPASSW=${P}` }],
  ["C4 ikisi de dolu", { Parameters: `<PARAMETERS><PRUSERN>${U}</PRUSERN><PRPASSW>${P}</PRPASSW></PARAMETERS>`, ExtraVariables: `PRUSERN=${U};PRPASSW=${P}` }],

  // --- D) bayraklar ---
  ["D1 Permanent=true", { Parameters: `<PARAMETERS><PRUSERN>${U}</PRUSERN><PRPASSW>${P}</PRPASSW></PARAMETERS>`, Permanent: true }],
  ["D2 RequestId=1", { Parameters: `<PARAMETERS><PRUSERN>${U}</PRUSERN><PRPASSW>${P}</PRPASSW></PARAMETERS>`, RequestId: 1 }],
];

const client = await soap.createClientAsync(CANIAS_WSDL_URL, { timeout: 20000 });

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
console.log("Aranan: 'prusern does not exist' hatasının KAYBOLMASI\n");
console.log("═".repeat(74));

const winners = [];

for (const [label, override] of CASES) {
  let err = "";
  let resp = "";
  let msg = "";
  try {
    const [res] = await client.callServiceAsync({
      SessionId: lr.SessionId,
      SecurityKey: lr.SecurityKey || "",
      ServiceId: "MZYCheckUser",
      Parameters: "<PARAMETERS/>",
      Compressed: false,
      Permanent: false,
      ExtraVariables: "",
      RequestId: 0,
      ...override,
    });
    const r = val(res?.callServiceReturn ?? res) ?? {};
    err = (r.SYSStatusError || "").split("\n")[0];
    resp = r.Response?.Value ?? "";
    msg = r.Messages?.Value ?? "";
  } catch (e) {
    err = "SOAP: " + (e?.message || e);
  }

  const unbound = /prusern/i.test(err);
  if (!unbound) winners.push(label);
  console.log(`\n${err ? (unbound ? "✗" : "★ FARKLI") : "✓✓ HATASIZ"}  ${label}`);
  if (err) console.log(`  hata    : ${err.slice(0, 150)}`);
  if (msg) console.log(`  messages: ${String(msg).slice(0, 220)}`);
  if (resp) console.log(`  response: ${String(resp).replace(/\s+/g, " ").slice(0, 220)}`);
}

console.log("\n" + "═".repeat(74));
console.log(
  winners.length ? "İncelenecek: " + winners.join(", ") : "Hiçbiri bağlanmadı."
);

await client.logoutAsync({ SessionId: lr.SessionId }).catch(() => {});
