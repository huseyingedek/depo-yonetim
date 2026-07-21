// -----------------------------------------------------------------------------
// v1 — MZYListingPick filtre taraması
// -----------------------------------------------------------------------------
// Artık biliyoruz: v1 uç noktası + args'a XML  →  parametreler OKUNUYOR
// (MZYCheckUser doğru/yanlış şifrede farklı cevap verdi.)
//
// O halde liste boşsa sebep FİLTRE ya da VERİ YOKLUĞU. Teker teker gevşetiyoruz.
//
// Çalıştırma:  node test-v1-listing.mjs bsenturk
// -----------------------------------------------------------------------------

import soap from "soap";
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), ".env") });

const USER = process.argv[2] ?? "bsenturk";
const V1_WSDL =
  process.env.CANIAS_WSDL_V1 ||
  "http://192.168.22.16:8080/CaniasWS-v1/services/iasWebService?wsdl";

const {
  CANIAS_CLIENT = "00", CANIAS_LANGUAGE = "T",
  CANIAS_DBSERVER = "CANIAS", CANIAS_DBNAME = "AKTUEL",
  CANIAS_APPSERVER = "192.168.22.16:27499",
  WMS_USER, WMS_PASSWORD,
  T_COMPANY = "01", T_PLANT = "100",
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

/** Bora'nın önerdiği taban */
const BASE = {
  PSCOMPANY: T_COMPANY, PSPLANT: T_PLANT, PSWORKER: USER,
    PISTATUS: 0, PIISPICK: 1,
    PDSTARTDATE: "01.01.1975", PDENDDATE: "01.01.2100",
    PIISDELETE: 0, PIISSTARTED: 1, PIORDER: 0,
};

const CASES = [
  ["00 taban (Bora'nın değerleri)", BASE],
  ["01 PWORKER = %", { ...BASE, PWORKER: "%" }],
  ["02 PISSTARTED = 0", { ...BASE, PISSTARTED: 0 }],
  ["03 PSTATUS = %", { ...BASE, PSTATUS: "%" }],
  ["04 PSTATUS = 1", { ...BASE, PSTATUS: "1" }],
  ["05 PSTATUS = 2", { ...BASE, PSTATUS: "2" }],
  ["06 PLISTING = 1", { ...BASE, PLISTING: 1 }],
  ["07 PISPICK = 0 (yerleştirme)", { ...BASE, PISPICK: 0 }],
  ["08 PISDELETE = 1", { ...BASE, PISDELETE: 1 }],
  ["09 WORKER=% + ISSTARTED=0", { ...BASE, PWORKER: "%", PISSTARTED: 0 }],
  ["10 WORKER=% + STATUS=%", { ...BASE, PWORKER: "%", PSTATUS: "%" }],
  ["11 WORKER=% STATUS=% ISSTARTED=0", { ...BASE, PWORKER: "%", PSTATUS: "%", PISSTARTED: 0 }],
  ["12 + PLISTING=1", { ...BASE, PWORKER: "%", PSTATUS: "%", PISSTARTED: 0, PLISTING: 1 }],
  ["13 PISPICK=% (her ikisi)", { ...BASE, PWORKER: "%", PSTATUS: "%", PISPICK: "%" }],
  ["14 tesis serbest", { ...BASE, PWORKER: "%", PSTATUS: "%", PPLANT: "%" }],
  ["15 firma+tesis serbest", { ...BASE, PCOMPANY: "%", PPLANT: "%", PWORKER: "%", PSTATUS: "%" }],
  ["16 EN GENİŞ", {
    PCOMPANY: "%", PPLANT: "%", PWORKER: "%", PSTATUS: "%",
    PWAREHOUSE: "%", PORDERNUM: "%", PORDERTYPE: "%", PFRONTAREA: "%", PMATERIAL: "%",
    PISPICK: "%", PSTARTDATE: "01.01.1975", PENDDATE: "01.01.2100",
    PISDELETE: "%", PISSTARTED: "%", PLISTING: "%",
  }],
  ["17 tarihler dar (bugün)", {
    ...BASE, PWORKER: "%", PSTATUS: "%",
    PSTARTDATE: "1.01.2020", PENDDATE: "31.12.2030",
  }],
];

const client = await soap.createClientAsync(V1_WSDL, { timeout: 20000 });
const [lres] = await client.loginAsync({
  p_strClient: CANIAS_CLIENT,
  p_strLanguage: CANIAS_LANGUAGE,
  p_strDBName: CANIAS_DBNAME,
  p_strDBServer: CANIAS_DBSERVER,
  p_strAppServer: CANIAS_APPSERVER,
  p_strUserName: WMS_USER,
  p_strPassword: WMS_PASSWORD,
});
const sessionId = val(lres?.loginReturn ?? lres);
if (!sessionId || typeof sessionId !== "string") {
  console.error("✗ Login başarısız:", sessionId);
  process.exit(1);
}
console.log("✓ Login OK —", sessionId);
console.log(`\nKullanıcı: ${USER}   Firma: ${T_COMPANY}   Tesis: ${T_PLANT}\n`);
console.log("═".repeat(78));

/** İç içe ROW yapısını açar */
function unwrap(t) {
  if (!t) return [];
  if (Array.isArray(t)) return t;
  if (typeof t === "object") return "ROW" in t ? unwrap(t.ROW) : [t];
  return [];
}

let kazanan = null;

for (const [ad, params] of CASES) {
  let out = "";
  try {
    const [res] = await client.callIASServiceAsync({
      sessionid: sessionId,
      serviceid: "MZYListingPick",
      args: xml(params),
      returntype: "JSON",
      permanent: false,
    });
    const r = val(res?.callIASServiceReturn ?? res);
    out = typeof r === "string" ? r : JSON.stringify(r ?? "");
  } catch (e) {
    out = "HATA: " + (e?.message || e).toString().slice(0, 90);
  }

  let satir = 0;
  let mesaj = "";
  try {
    const d = JSON.parse(out);
    satir = unwrap(d.TBLPOLIST).length;
    if (d.TBLMESSAGE) {
      mesaj = unwrap(d.TBLMESSAGE)
        .map((m) => m.TEXT || m.VALUE || JSON.stringify(m))
        .join(" | ");
    }
  } catch {
    /* parse edilemedi */
  }

  const flag = satir > 0 ? `✓✓ ${satir} SATIR` : out.startsWith("HATA") ? "✗ hata" : "·  boş";
  console.log(`${flag.padEnd(14)} ${ad}`);
  if (mesaj) console.log(`               mesaj: ${mesaj.slice(0, 100)}`);
  if (out.startsWith("HATA")) console.log(`               ${out.slice(0, 110)}`);

  if (satir > 0 && !kazanan) kazanan = { ad, out };
}

console.log("\n" + "═".repeat(78));
if (kazanan) {
  console.log("İLK VERİ GELEN:", kazanan.ad);
  console.log("═".repeat(78));
  const d = JSON.parse(kazanan.out);
  const rows = unwrap(d.TBLPOLIST);
  console.log(`\nSatır sayısı: ${rows.length}`);
  console.log(`\nALAN ADLARI:\n  ${Object.keys(rows[0]).join(", ")}`);
  console.log(`\nİLK 2 SATIR:`);
  console.log(JSON.stringify(rows.slice(0, 2), null, 2));
} else {
  console.log("Hiçbir kombinasyonda veri gelmedi.");
  console.log("→ Parametreler okunuyor (login bunu kanıtladı), demek ki");
  console.log("  sistemde bu firma/tesiste açık toplama emri yok.");
  console.log("→ Bora'dan CANIAS ekranından bir emir oluşturmasını iste.");
}

await client.logoutAsync({ p_strSessionId: sessionId }).catch(() => {});
