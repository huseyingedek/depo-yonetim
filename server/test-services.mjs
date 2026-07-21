// -----------------------------------------------------------------------------
// CANIAS (CaniasWebService) test scripti — login → listServices → callService
// -----------------------------------------------------------------------------
// Öğrendiğimiz yapı:
//   login(Client, Language, DBServer, DBName, ApplicationServer, Username,
//         Password, Encrypted, Compression, LCheck, VKey)
//     → { SessionId, SecurityKey, ContactNum, Success, ErrorMessage }
//   callService(SessionId, SecurityKey, ServiceId, Parameters, Compressed,
//               Permanent, ExtraVariables, RequestId)
//     → { Response, ExtraVariables, Messages, SYSStatus, SYSStatusError }
//   logout(SessionId)
//
// Çalıştırma (VPN bağlıyken):  npm run test-services
// -----------------------------------------------------------------------------

import soap from "soap";
import dotenv from "dotenv";
import { writeFileSync } from "fs";

dotenv.config();

const {
  CANIAS_WSDL_URL = "",
  WMS_USER = "",
  WMS_PASSWORD = "",
  CANIAS_CLIENT = "",
  CANIAS_LANGUAGE = "T",
  CANIAS_DBSERVER = "",
  CANIAS_DBNAME = "",
  CANIAS_APPSERVER = "",
  T_COMPANY = "",
  T_PLANT = "",
  T_WAREHOUSE = "",
} = process.env;

const line = (s = "") => console.log(s);
const hr = () => line("─".repeat(70));

/** SOAP yanıtları {attributes, $value} sarmalıyla gelir — gerçek değeri çıkarır. */
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

/** MZYListingPick parametreleri (sıra Mizoye dokümanındaki gibi) */
const LISTING_VALUES = [
  T_COMPANY, T_PLANT, "", "", T_WAREHOUSE, "", "", "", "", "1", "", "", "0", "0", "1",
];

/** MZYListingPick parametreleri, XML iç gövdesi (15 alan, doküman sırası) */
const INNER_XML =
  `<PCOMPANY>${T_COMPANY}</PCOMPANY>` +
  `<PPLANT>${T_PLANT}</PPLANT>` +
  `<PWORKER></PWORKER>` +
  `<PSTATUS></PSTATUS>` +
  `<PWAREHOUSE>${T_WAREHOUSE}</PWAREHOUSE>` +
  `<PORDERNUM></PORDERNUM>` +
  `<PORDERTYPE></PORDERTYPE>` +
  `<PFRONTAREA></PFRONTAREA>` +
  `<PMATERIAL></PMATERIAL>` +
  `<PISPICK>1</PISPICK>` +
  `<PSTARTDATE></PSTARTDATE>` +
  `<PENDDATE></PENDDATE>` +
  `<PISDELETE>0</PISDELETE>` +
  `<PISSTARTED>0</PISSTARTED>` +
  `<PLISTING>1</PLISTING>`;

/** XML kök adı fark etmiyor (hepsi kabul edildi) → <PARAMETERS> kullanıyoruz. */
const xml = (obj) =>
  `<PARAMETERS>${Object.entries(obj)
    .map(([k, v]) => `<${k}>${v}</${k}>`)
    .join("")}</PARAMETERS>`;

const BASE = { PCOMPANY: T_COMPANY, PPLANT: T_PLANT, PWAREHOUSE: T_WAREHOUSE };
const FLAGS = { PISPICK: 1, PISDELETE: 0, PISSTARTED: 0, PLISTING: 1 };

/**
 * XML çözüldü. Yeni hata: SQL "invalid input syntax for type integer: ''"
 * → boş gönderilen alanlar sorunlu. Boşları hiç göndermeyi ve tarihleri
 * doldurmayı deniyoruz.
 */
/**
 * Hata TÜM varyantlarda aynı (Position 1209) → alanlarımız servise ulaşmıyor.
 * Demek ki CANIAS farklı bir isim/değer yapısı bekliyor. Onları deniyoruz.
 */
const P = { ...BASE, ...FLAGS };
const entries = Object.entries(P);

const PARAM_FORMATS = {
  "düz eleman (mevcut)": xml(P),

  "PARAMETER > NAME/VALUE": `<PARAMETERS>${entries
    .map(([n, v]) => `<PARAMETER><NAME>${n}</NAME><VALUE>${v}</VALUE></PARAMETER>`)
    .join("")}</PARAMETERS>`,

  "PARAMETER Name/Value attr": `<PARAMETERS>${entries
    .map(([n, v]) => `<PARAMETER Name="${n}" Value="${v}"/>`)
    .join("")}</PARAMETERS>`,

  "PARAM NAME attr": `<PARAMS>${entries
    .map(([n, v]) => `<PARAM NAME="${n}">${v}</PARAM>`)
    .join("")}</PARAMS>`,

  "servis adı ile sarmalı": `<PARAMETERS><MZYListingPick>${entries
    .map(([n, v]) => `<${n}>${v}</${n}>`)
    .join("")}</MZYListingPick></PARAMETERS>`,

  "sıralı PARAM (pozisyonel)": `<PARAMETERS>${[
    T_COMPANY, T_PLANT, "", "", T_WAREHOUSE, "", "", "", "", "1", "", "", "0", "0", "1",
  ].map((v) => `<PARAM>${v}</PARAM>`).join("")}</PARAMETERS>`,

  "ROOT > PARAMETERS > alanlar": `<ROOT><PARAMETERS>${entries
    .map(([n, v]) => `<${n}>${v}</${n}>`)
    .join("")}</PARAMETERS></ROOT>`,
};

async function main() {
  if (!CANIAS_WSDL_URL) return console.error("HATA: CANIAS_WSDL_URL yok (.env)");

  line("WSDL: " + CANIAS_WSDL_URL);
  const client = await soap.createClientAsync(CANIAS_WSDL_URL, { timeout: 20000 });
  if (WMS_USER) client.setSecurity(new soap.BasicAuthSecurity(WMS_USER, WMS_PASSWORD));
  writeFileSync("describe.json", JSON.stringify(client.describe(), null, 2), "utf8");
  line("✓ WSDL yüklendi\n");

  // ---------- 1) LOGIN ----------
  hr();
  line("▶ login");
  hr();
  const loginArgs = {
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
  };
  line("İstek: " + JSON.stringify({ ...loginArgs, Password: "***" }, null, 2));

  let session = "", securityKey = "";
  try {
    const [res] = await client.loginAsync(loginArgs);
    const r = val(res?.loginReturn ?? res) ?? {};
    line("Yanıt: " + JSON.stringify(r, null, 2));
    session = typeof r.SessionId === "string" ? r.SessionId : "";
    securityKey = typeof r.SecurityKey === "string" ? r.SecurityKey : "";
    if (r.Success !== true || !session) {
      line("\n❌ LOGIN BAŞARISIZ");
      line("   ErrorMessage: " + (r.ErrorMessage || "(boş)"));
      line("\n   → Login parametrelerinden biri hatalı (büyük ihtimalle ApplicationServer");
      line("     veya DBServer/DBName). Bu değerleri Bora'dan teyit et.");
      return;
    }
    line(`\n✓ Oturum açıldı. SessionId=${session}`);
  } catch (e) {
    line("HATA: " + (e?.message || e));
    line("\n→ Login parametreleri (Client/DBServer/DBName/ApplicationServer) gerekiyor.");
    return;
  }

  // ---------- 2) listServices ----------
  hr();
  line("▶ listServices (tanımlı servisler)");
  hr();
  try {
    const [r] = await client.listServicesAsync({ SessionId: session });
    line(JSON.stringify(val(r?.listServicesReturn ?? r), null, 2).slice(0, 4000));
  } catch (e) {
    line("HATA: " + (e?.message || e));
  }

  // ---------- 3) callService — ServiceId ve Parameters formatını bul ----------
  // listServices "MZYListingPick_Toplama Emirleri Listesi" döndü → tam ad da denenecek.
  // Uzun ad "servis bulunamadı" verdi → kısa ad doğru.
  const SERVICE_IDS = ["MZYListingPick"];

  for (const serviceId of SERVICE_IDS) {
    for (const [label, params] of Object.entries(PARAM_FORMATS)) {
      hr();
      line(`▶ ServiceId: "${serviceId}"  |  format: ${label}`);
      hr();
      try {
        const [res] = await client.callServiceAsync({
          SessionId: session,
          SecurityKey: securityKey,
          ServiceId: serviceId,
          Parameters: params,
          Compressed: false,
          Permanent: false,
          ExtraVariables: "",
          RequestId: 0,
        });
        const r = val(res?.callServiceReturn ?? res) ?? {};
        const resp = r.Response?.Value ?? "";
        const msg = r.Messages?.Value ?? "";
        line(`SYSStatus: ${r.SYSStatus}   SYSStatusError: ${r.SYSStatusError ?? ""}`);
        if (msg) line("Messages : " + String(msg).slice(0, 800));
        if (resp) {
          line("★★★ DOLU RESPONSE ★★★");
          line(String(resp).slice(0, 4000));
        } else {
          line("Response : (boş)");
        }
      } catch (e) {
        line("  HATA: " + (e?.message || e));
      }
      line("");
    }
  }

  // ---------- 4) logout ----------
  try {
    await client.logoutAsync({ SessionId: session });
    line("✓ logout");
  } catch {
    /* önemsiz */
  }

  hr();
  line("Hangi formatta dolu Response geldiyse Parameters formatı odur.");
}

main().catch((e) => console.error("GENEL HATA:", e?.message || e));
