// -----------------------------------------------------------------------------
// Ortak yardımcılar — bütün test scriptleri bunu kullanır
// -----------------------------------------------------------------------------
// Tek yerde: bağlantı, login, servis çağırma, CANIAS'ın bozuk JSON'unu
// düzleştirme ve ekrana basma.
// -----------------------------------------------------------------------------

import soap from "soap";
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

dotenv.config({
  path: join(dirname(fileURLToPath(import.meta.url)), "..", ".env"),
});

export const CFG = {
  wsdl:
    process.env.CANIAS_WSDL_V1 ||
    "http://192.168.22.16:8080/CaniasWS-v1/services/iasWebService?wsdl",
  client: process.env.CANIAS_CLIENT || "00",
  language: process.env.CANIAS_LANGUAGE || "T",
  dbServer: process.env.CANIAS_DBSERVER || "CANIAS",
  dbName: process.env.CANIAS_DBNAME || "AKTUEL",
  appServer: process.env.CANIAS_APPSERVER || "192.168.22.16:27499",
  wsUser: process.env.WMS_USER,
  wsPassword: process.env.WMS_PASSWORD,
  company: process.env.T_COMPANY || "01",
  plant: process.env.T_PLANT || "100",
};

/* ---------------- Biçim yardımcıları ---------------- */

/** SOAP yanıtları {attributes,$value} sarmalıyla gelir; gerçek değeri çıkarır. */
export function val(x) {
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

/**
 * Parametre XML'i. Değer dizi ise tablo olarak yazılır (her eleman <ROW>).
 * DİKKAT: args alanı virgülle ayrık değil, XML ister — deneyle bulundu.
 */
export function xml(params = {}) {
  const body = Object.entries(params)
    .map(([k, v]) => {
      if (Array.isArray(v)) {
        const rows = v
          .map(
            (row) =>
              `<ROW>${Object.entries(row ?? {})
                .map(([rk, rv]) => `<${rk}>${esc(rv)}</${rk}>`)
                .join("")}</ROW>`
          )
          .join("");
        return `<${k}>${rows}</${k}>`;
      }
      return `<${k}>${esc(v)}</${k}>`;
    })
    .join("");
  return `<PARAMETERS>${body}</PARAMETERS>`;
}

/**
 * CANIAS'ın bozuk JSON'unu düzleştirir.
 * Bir satırın alanları ilk dizi tipindeki alanın içine {"#item":{...}}
 * sarmalıyla tıkışıyor; hepsini tek düzeye çekiyoruz.
 */
export function flatten(input) {
  const out = {};
  if (!input || typeof input !== "object") return out;
  for (const [key, value] of Object.entries(input)) {
    if (Array.isArray(value)) {
      for (const el of value) {
        if (el && typeof el === "object") Object.assign(out, el["#item"] ?? el);
        else if (out[key] === undefined) out[key] = el;
      }
    } else if (value && typeof value === "object") {
      Object.assign(out, value["#item"] ?? value);
    } else out[key] = value;
  }
  return out;
}

/** İç içe ROW yapısını satır dizisine çevirir. */
export function unwrap(t) {
  if (!t) return [];
  if (Array.isArray(t)) return t.map(flatten);
  if (typeof t === "object") return "ROW" in t ? unwrap(t.ROW) : [flatten(t)];
  return [];
}

/* ---------------- Bağlantı ---------------- */

let client = null;
let sessionId = null;

export async function baglan() {
  if (sessionId) return sessionId;
  client = await soap.createClientAsync(CFG.wsdl, { timeout: 20000 });
  const [res] = await client.loginAsync({
    p_strClient: CFG.client,
    p_strLanguage: CFG.language,
    p_strDBName: CFG.dbName,
    p_strDBServer: CFG.dbServer,
    p_strAppServer: CFG.appServer,
    p_strUserName: CFG.wsUser,
    p_strPassword: CFG.wsPassword,
  });
  const s = val(res?.loginReturn ?? res);
  if (!s || typeof s !== "string") throw new Error("Login başarısız: " + s);
  sessionId = s;
  return sessionId;
}

export async function kapat() {
  if (!client || !sessionId) return;
  await client.logoutAsync({ p_strSessionId: sessionId }).catch(() => {});
  sessionId = null;
}

/**
 * Servis çağırır. Dönen: { tablolar, mesaj, ham }
 *   tablolar → { TABLOADI: [satır, ...] }
 *   mesaj    → TBLMESSAGE içindeki metinler
 */
export async function cagir(serviceid, params = {}) {
  await baglan();
  const giden = xml(params);
  let ham = "";
  try {
    const [res] = await client.callIASServiceAsync({
      sessionid: sessionId,
      serviceid,
      args: giden,
      returntype: "JSON",
      permanent: false,
    });
    const o = val(res?.callIASServiceReturn ?? res);
    ham = typeof o === "string" ? o : JSON.stringify(o ?? "");
  } catch (e) {
    return { giden, tablolar: {}, mesaj: "", ham: "", hata: e?.message || String(e) };
  }

  const tablolar = {};
  let mesaj = "";
  try {
    for (const [ad, icerik] of Object.entries(JSON.parse(ham))) {
      const rows = unwrap(icerik);
      tablolar[ad] = rows;
      if (/MESSAGE/i.test(ad)) {
        mesaj = rows.map((m) => m.TEXT || m.VALUE || "").filter(Boolean).join(" | ");
      }
    }
  } catch {
    /* JSON değilse tablolar boş kalır */
  }
  return { giden, tablolar, mesaj, ham };
}

/* ---------------- Ekrana basma ---------------- */

export const cizgi = (n = 76) => "─".repeat(n);
export const kalin = (n = 76) => "═".repeat(n);

export function baslik(metin) {
  console.log("\n" + kalin());
  console.log("  " + metin);
  console.log(kalin());
}

export function adim(no, metin) {
  console.log(`\n${cizgi()}`);
  console.log(`  ${no}. ${metin}`);
  console.log(cizgi());
}

/** Satırları alan=değer olarak basar; boş değerler ∅ */
export function satirlariBas(rows, limit = 5) {
  rows.slice(0, limit).forEach((r) => {
    console.log(
      "    " +
        Object.entries(r)
          .map(([k, v]) => `${k}=${v === "" ? "∅" : v}`)
          .join("  ")
    );
  });
  if (rows.length > limit) console.log(`    … ${rows.length - limit} satır daha`);
}

export function sonucBas(r, { tablo, limit = 5 } = {}) {
  if (r.hata) {
    console.log(`  ✗ HATA: ${r.hata}`);
    return;
  }
  const adlar = Object.keys(r.tablolar);
  if (!adlar.length) {
    console.log("  · yanıt boş");
    return;
  }
  for (const ad of adlar) {
    const rows = r.tablolar[ad];
    if (tablo && ad !== tablo && !/MESSAGE/i.test(ad)) continue;
    console.log(`  ${ad}: ${rows.length} satır`);
    if (rows.length) satirlariBas(rows, limit);
  }
  if (r.mesaj) console.log(`  mesaj: ${r.mesaj}`);
}
