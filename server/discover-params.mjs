// -----------------------------------------------------------------------------
// CANIAS servis PARAMETRE ADI keşfi
// -----------------------------------------------------------------------------
// Mantık: eksik bir parametre bağlanmadığında CANIAS'ın SQL'i onu kolon sanıyor ve
//   PSQLException: column "prusern" does not exist
// diye hata veriyor. Yani servis eksik parametrenin adını bize söylüyor.
// Script bu adı yakalayıp ekliyor ve tekrar çağırıyor — hata bitene kadar.
//
// Çalıştırma (Aktüel VPN açıkken):
//   cd server
//   node discover-params.mjs --user=bsenturk --pass='2Akl00*'
//   node discover-params.mjs MZYEnterPick    → tek servis
//
// NOT: keşif sırasında parametreler boş/0 gönderilir, veri yazılmaz.
// -----------------------------------------------------------------------------

import soap from "soap";
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), ".env") });

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

// Bulunan parametre adına göre .env'deki gerçek test değerini kullan.
// Adı tanınmazsa boş ("") gönderilir; hata devam ederse sayıya çevrilir.
// Kullanici/sifre komut satirindan gelir:  node discover-params.mjs --user=X --pass=Y
const ARG = Object.fromEntries(
  process.argv.slice(2).filter((a) => a.startsWith("--")).map((a) => {
    const i = a.indexOf("=");
    return [a.slice(2, i < 0 ? undefined : i), i < 0 ? "" : a.slice(i + 1)];
  })
);

const HINTS = [
  [/PASS|SIFRE|PWD|PAROLA/i, () => ARG.pass],
  [/USER|KULLANICI|PERSON|WORKER/i, () => ARG.user],
  [/COMPANY|FIRMA/i, () => process.env.T_COMPANY],
  [/PLANT|TESIS/i, () => process.env.T_PLANT],
  [/WAREHOUSE|DEPO/i, () => process.env.T_WAREHOUSE],
  [/ORDERTYPE/i, () => process.env.T_ORDERTYPE],
  [/ORDERNUM|EMIR/i, () => process.env.T_ORDERNUM],
  [/BARCODE|BARKOD/i, () => process.env.T_BARCODE],
];

function guessValue(name) {
  for (const [re, get] of HINTS) {
    if (re.test(name)) return get() ?? "";
  }
  return "";
}

/** Çıktıya basarken şifreyi gizle (log paylaşılabilir olsun). */
const mask = (params) =>
  JSON.stringify(
    Object.fromEntries(
      Object.entries(params).map(([k, v]) => [
        k,
        /PASS|SIFRE|PWD|PAROLA/i.test(k) && v ? "***" : v,
      ])
    )
  );

// Veri yazmayan, denemesi güvenli servisler
const SAFE = [
  "MZYCheckUser",
  "MZYListingPick",
  "MZYReadBarcode",
];

const MAX_ROUNDS = 40;

/* ---------- yardımcılar ---------- */

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

const escapeXml = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const buildXml = (params) =>
  `<PARAMETERS>${Object.entries(params)
    .map(([k, v]) => `<${k}>${escapeXml(v)}</${k}>`)
    .join("")}</PARAMETERS>`;

/* ---------- bağlantı ---------- */

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

const SESSION = { id: lr.SessionId, key: lr.SecurityKey || "" };

async function callOnce(serviceId, params) {
  const [res] = await client.callServiceAsync({
    SessionId: SESSION.id,
    SecurityKey: SESSION.key,
    ServiceId: serviceId,
    Parameters: buildXml(params),
    Compressed: false,
    Permanent: false,
    ExtraVariables: "",
    RequestId: 0,
  });
  const r = val(res?.callServiceReturn ?? res) ?? {};
  return {
    response: r.Response?.Value ?? "",
    messages: r.Messages?.Value ?? "",
    sysStatus: r.SYSStatus,
    sysError: r.SYSStatusError || "",
  };
}

/* ---------- keşif döngüsü ---------- */

// Hata metninden eksik parametre adını çıkar
const missingParam = (err) => {
  const m = /column "([a-z0-9_]+)" does not exist/i.exec(err);
  return m ? m[1].toUpperCase() : null;
};
// Bu parametre sayı bekliyor mu?
const wantsNumber = (err) =>
  /invalid input syntax for type (integer|numeric|bigint|smallint|double)/i.test(err);

async function discover(serviceId) {
  console.log("─".repeat(70));
  console.log("▶", serviceId);

  const params = {};
  const numeric = new Set();

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    const r = await callOnce(serviceId, params);

    if (!r.sysError) {
      console.log(`  ✓ ${round}. denemede hatasız geçti`);
      console.log("  Parametreler:", mask(params));
      if (r.messages) console.log("  Messages:", r.messages);
      console.log("  Response  :", String(r.response).slice(0, 600));
      return { serviceId, params, ok: true, response: r.response };
    }

    const name = missingParam(r.sysError);
    if (name && !(name in params)) {
      const v = guessValue(name);
      params[name] = v;
      // Şifreyi ekrana basma
      const shown = /PASS|SIFRE|PWD|PAROLA/i.test(name) ? (v ? "***" : "(boş)") : v || "(boş)";
      console.log(`  + ${name} = ${shown}`);
      continue;
    }

    // İsim yok ama tip hatası var → boş gönderdiklerimizden biri sayı istiyor
    if (wantsNumber(r.sysError)) {
      const candidate = Object.keys(params).find((k) => !numeric.has(k) && params[k] === "");
      if (candidate) {
        numeric.add(candidate);
        params[candidate] = 0;
        console.log(`  ~ ${candidate} → sayı (0)`);
        continue;
      }
    }

    console.log("  ✗ Çözülemeyen hata:", r.sysError.split("\n")[0]);
    console.log("  Şu ana kadar bulunanlar:", mask(params));
    return { serviceId, params, ok: false, error: r.sysError };
  }

  console.log("  ✗ Tur limiti doldu. Bulunanlar:", mask(params));
  return { serviceId, params, ok: false };
}

/* ---------- çalıştır ---------- */

const rest = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const targets = rest.length ? rest : SAFE;
const results = [];

for (const s of targets) {
  try {
    results.push(await discover(s));
  } catch (e) {
    console.log("  ✗ İstisna:", e?.message || e);
    results.push({ serviceId: s, ok: false, params: {} });
  }
}

console.log("\n" + "═".repeat(70));
console.log("ÖZET — bulunan parametre adları\n");
for (const r of results) {
  const names = Object.keys(r.params || {});
  console.log(`${r.ok ? "✓" : "✗"} ${r.serviceId.padEnd(20)} ${names.join(", ") || "(bulunamadı)"}`);
}

await client.logoutAsync({ SessionId: SESSION.id }).catch(() => {});
