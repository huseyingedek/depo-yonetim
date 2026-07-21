// -----------------------------------------------------------------------------
// v1 — args biçimi denemeleri
// -----------------------------------------------------------------------------
// callIASService'in "args" alanına ne yazılmalı? Virgül dışındaki biçimleri de
// dener ve MZYCheckUser'ı DOĞRU ve YANLIŞ şifreyle çağırıp farkı arar.
//
// Aranan: doğru ile yanlış şifrenin FARKLI cevap vermesi.
// Fark çıkan biçim = servisin gerçekten okuduğu biçimdir.
//
// Çalıştırma:  node test-v1-args.mjs bsenturk 2Akl00*
// -----------------------------------------------------------------------------

import soap from "soap";
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), ".env") });

const USER = process.argv[2] ?? "bsenturk";
const PASS = process.argv[3] ?? "2Akl00*";
const BAD = "YANLIS_SIFRE_XYZ";

const V1_WSDL =
  process.env.CANIAS_WSDL_V1 ||
  "http://192.168.22.16:8080/CaniasWS-v1/services/iasWebService?wsdl";

const {
  CANIAS_CLIENT = "00", CANIAS_LANGUAGE = "T",
  CANIAS_DBSERVER = "CANIAS", CANIAS_DBNAME = "AKTUEL",
  CANIAS_APPSERVER = "192.168.22.16:27499",
  WMS_USER, WMS_PASSWORD,
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

/** İki değerden args üreten biçimler */
const BICIMLER = [
  ["01 virgül", (a, b) => `${a},${b}`],
  ["02 noktalı virgül", (a, b) => `${a};${b}`],
  ["03 boru |", (a, b) => `${a}|${b}`],
  ["04 boşluk", (a, b) => `${a} ${b}`],
  ["05 sekme", (a, b) => `${a}\t${b}`],
  ["06 satır sonu", (a, b) => `${a}\n${b}`],
  ["07 tilde ~", (a, b) => `${a}~${b}`],
  ["08 çift nokta :", (a, b) => `${a}:${b}`],
  ["09 XML PARAMETERS", (a, b) => `<PARAMETERS><PSUSER>${a}</PSUSER><PSPASSWORD>${b}</PSPASSWORD></PARAMETERS>`],
  ["10 XML sıralı", (a, b) => `<PARAMETERS><P>${a}</P><P>${b}</P></PARAMETERS>`],
  ["11 JSON dizi", (a, b) => JSON.stringify([a, b])],
  ["12 JSON nesne", (a, b) => JSON.stringify({ PSUSER: a, PSPASSWORD: b })],
  ["13 ad=deger virgül", (a, b) => `PSUSER=${a},PSPASSWORD=${b}`],
  ["14 ad=deger ;", (a, b) => `PSUSER=${a};PSPASSWORD=${b}`],
  ["15 virgül+boşluk", (a, b) => `${a}, ${b}`],
  ["16 tırnaklı virgül", (a, b) => `"${a}","${b}"`],
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
console.log("✓ Login OK —", sessionId, "\n");
console.log(`Kullanıcı: ${USER}`);
console.log(`Doğru şifre : ${PASS}`);
console.log(`Yanlış şifre: ${BAD}\n`);
console.log("Aranan: iki cevabın FARKLI olması\n");
console.log("═".repeat(78));

async function cagir(args) {
  try {
    const [res] = await client.callIASServiceAsync({
      sessionid: sessionId,
      serviceid: "MZYCheckUser",
      args,
      returntype: "JSON",
      permanent: false,
    });
    const out = val(res?.callIASServiceReturn ?? res);
    return typeof out === "string" ? out : JSON.stringify(out ?? "");
  } catch (e) {
    return "HATA: " + (e?.message || e).toString().slice(0, 100);
  }
}

const farkliOlanlar = [];

for (const [ad, yap] of BICIMLER) {
  const dogruArgs = yap(USER, PASS);
  const yanlisArgs = yap(USER, BAD);

  const c1 = await cagir(dogruArgs);
  const c2 = await cagir(yanlisArgs);

  const fark = c1 !== c2;
  if (fark) farkliOlanlar.push(ad);

  const kisalt = (s) => String(s).replace(/\s+/g, " ").slice(0, 90);
  console.log(`\n${fark ? "★★ FARK VAR" : "·  aynı"}   ${ad}`);
  console.log(`   gönderilen : ${kisalt(dogruArgs)}`);
  console.log(`   doğru şifre: ${kisalt(c1)}`);
  if (fark) console.log(`   yanlış şifr: ${kisalt(c2)}`);
}

console.log("\n" + "═".repeat(78));
console.log("SONUÇ");
console.log("═".repeat(78));
if (farkliOlanlar.length) {
  console.log("★ Şifreye duyarlı biçim(ler):", farkliOlanlar.join(", "));
  console.log("  → Servis bu biçimi okuyor. client.ts'i buna göre ayarlayacağız.");
} else {
  console.log("Hiçbir biçimde fark yok.");
  console.log("→ MZYCheckUser şifreyi hiç kontrol etmiyor. Biçim meselesi değil,");
  console.log("  servisin kendisi doğrulama yapmıyor. Bora'ya bildirilecek.");
}

await client.logoutAsync({ p_strSessionId: sessionId }).catch(() => {});
