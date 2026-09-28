// =============================================================================
// AKTÜEL OFIS DEPO YÖNETİMİ (WMS) — BACKEND PROXY & KÖPRÜ SUNUCUSU
// =============================================================================
// Bu sunucunun temel amaçları:
// 1. CORS Güvenlik Köprüsü:
//    Tarayıcıda çalışan React ön yüzü, güvenlik kısıtlamaları (CORS) nedeniyle
//    yerel ağdaki CANIAS SOAP sunucusuna doğrudan istek atamaz. Bu Node.js sunucusu
//    React ile CANIAS arasında güvenli bir aracı görevi görür.
//
// 2. Protokol Tercümanı (JSON <-> SOAP XML):
//    React ön yüzü modern JSON formatında konuşurken, CANIAS ERP SOAP/XML protokolü
//    kullanır. Bu sunucu JSON parametrelerini alır, CANIAS'ın anlayacağı XML yapısına
//    dönüştürür ve CANIAS'tan dönen XML/JSON cevabını arındırarak ön yüze iletir.
//
// 3. Oturum & Bağlantı Yönetimi (Session Lifecycle):
//    Her istekte yeniden kullanıcı adı/şifre göndermek yerine CANIAS oturumunu (Session ID)
//    hafızasında tutar, süresi dolduğunda otomatik yeniler ve sunucu kapandığında
//    CANIAS'a logout bildirerek oturumu temizler.
// =============================================================================

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import soap from "soap";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// -----------------------------------------------------------------------------
// Ortam Değişkenleri (.env) Yüklemesi
// -----------------------------------------------------------------------------
// Frontend'in .env dosyasıyla karışmaması için doğrudan `server/.env` dosyasını okuruz.
dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), ".env") });

const {
  PORT = 8787,                          // Proxy sunucusunun dinleyeceği port (varsayılan: 8787)
  CANIAS_WS_VERSION = "v1",              // CANIAS servis sürümü ("v1" veya "v2")
  CANIAS_WSDL_URL = "",                  // CANIAS SOAP WSDL adresi (örn: http://192.168.22.16:8080/...wsdl)
  WMS_USER = "",                         // CANIAS Web Servis kullanıcı adı
  WMS_PASSWORD = "",                     // CANIAS Web Servis şifresi
  CANIAS_CLIENT = "",                    // CANIAS Firma / Client kodu (örn: "00")
  CANIAS_LANGUAGE = "T",                 // Dil seçeneği (T: Türkçe)
  CANIAS_DBSERVER = "",                  // CANIAS Veritabanı sunucusu
  CANIAS_DBNAME = "",                    // CANIAS Veritabanı adı (örn: "TEST")
  CANIAS_APPSERVER = "",                 // CANIAS Uygulama sunucusu adresi (örn: "192.168.22.16:27499")
  CORS_ORIGIN = "http://localhost:5173", // Ön yüzün istek atmasına izin verilen adresler
} = process.env;

// CANIAS v1 sürümü standart callIASService (RPC/encoded) kullanırken, v2 callService (Document/literal) kullanır.
const V1 = CANIAS_WS_VERSION.toLowerCase() !== "v2";

// Çoklu oturum havuzu modu (Opsiyonel — gelişmiş yük dengeleme için)
const POOL_MODE = String(process.env.USE_POOL ?? "").trim().toLowerCase() === "true";
let _caniasPool = null;

async function getPool() {
  if (!POOL_MODE) throw new Error("Havuz devre dışı (USE_POOL≠true) — tek oturum kullanılmalı");
  if (!_caniasPool) {
    const { createCaniasPool } = await import("./caniasPool.mjs");
    _caniasPool = createCaniasPool(process.env);
  }
  return _caniasPool;
}

// -----------------------------------------------------------------------------
// Servis İzin Beyaz Listesi (Security Whitelist)
// -----------------------------------------------------------------------------
// Dışarıdan gelebilecek rastgele veya yetkisiz servis çağrılarını engellemek için
// sadece sistemimizde kayıtlı olan CANIAS servis isimlerine izin verilir.
const ALLOWED = new Set([
  // Kullanıcı ve Temel Doğrulama
  "MZYCheckUser",

  // Toplama (Picking) Servisleri
  "MZYListingPick",
  "MZYEnterPick",
  "MZYClosePick",
  "MZYCreateContainer",
  "MZYReadBarcode",
  "MZYReadBarcodeSP",
  "MZYCrtSuggestListPickFromSP",
  "MZYSavePick",
  "MZYGetStock",
  "MZYGetTransaction",
  "MZYGetSourceType",

  // Yerleştirme (Placement / Putaway) Servisleri
  "MZYListingPlacement",
  "MZYEnterPlacement",
  "MZYClosePlacement",
  "MZYSavePlacement",
  "MZYCrtSuggestListPlacement",

  // Tanım & Sistem Servisleri
  "GetCompany",
  "GetPlant",
  "GetWarehouse",
  "GetStockPlace",

  // Etiket Basma & Barkod Servisleri
  "MZYPrintContainer",
  "MZYPrintWHSP",
  "MZYPrintMaterial",
  "MZYPrintBarcode",
  "MZYCreateBarcode",
  "MzyCreateBarcode",

  // Mal Kabul Servisleri
  "MZYGetOpenOrder",
  "MZYGetMaterial",
  "MZYSetMatSize",
  "MzySetMatSize",
  "MZYGetCustomer",
  "MzyGetCustomer",
  "MZYSaveReceipt",
  "MZYSAVEINVPURORDER",

  // Stok Transfer Servisleri
  "MZYStockTransfer",
  "MzyStockTransfer",

  // Sayım (Adjustment) Servisleri
  "MZYListingAdjustment",
  "MzyListingAdjustment",
  "MZYLISTINGADJUSTMENT",
  "MZYEnterAdjustment",
  "MzyEnterAdjustment",
  "MZYENTERADJUSTMENT",
  "MZYSAVEADJUSTMENT",
  "MZYSaveAdjustment",
  "MzySaveAdjustment",

  // Paketleme (Packaging) Servisleri
  "MZYListingPack",
  "MzyListingPack",
  "MZYEnterPack",
  "MzyEnterPack",
  "MZYENTERPACK",
]);

// -----------------------------------------------------------------------------
// Express Uygulama Yapılandırması & Middleware'ler
// -----------------------------------------------------------------------------
const app = express();

// CORS Ayarı: Frontend (Vite) tarafından gelen isteklere izin verilir.
app.use(cors({ origin: CORS_ORIGIN.split(",").map((s) => s.trim()) }));

// JSON Gövdesi Ayrıştırıcı: Gelen HTTP POST isteklerindeki JSON veriyi okur.
app.use(express.json());

// Üretim ortamında dist/ klasöründeki derlenmiş frontend dosyalarını doğrudan sunar.
const DIST_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");
app.use(express.static(DIST_DIR));

// -----------------------------------------------------------------------------
// Yardımcı Fonksiyonlar (Data & XML Helpers)
// -----------------------------------------------------------------------------

// SOAP nesnelerinden dönen karmaşık { $value: "..." } yapılarını düz JavaScript nesnelerine dönüştürür.
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

// XML Injection önleme: Parametrelerdeki özel karakterleri (&, <, >) XML formatına çevirir.
const escapeXml = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

// Frontend'den gelen JSON parametre nesnesini CANIAS'ın beklediği <PARAMETERS> XML yapısına çevirir.
// Örneğin: { PSCOMPANY: "01", PSPLANT: "100" } -> <PARAMETERS><PSCOMPANY>01</PSCOMPANY><PSPLANT>100</PSPLANT></PARAMETERS>
function buildParametersXml(params = {}) {
  const body = Object.entries(params)
    .map(([k, v]) => {
      // Eğer parametre bir tablo/dizi ise (Örn: satır kalemleri) her satırı <ROW> içine sarar.
      if (Array.isArray(v)) {
        const rows = v
          .map(
            (row) =>
              `<ROW>${Object.entries(row ?? {})
                .map(([rk, rv]) => `<${rk}>${escapeXml(rv)}</${rk}>`)
                .join("")}</ROW>`
          )
          .join("");
        return `<${k}>${rows}</${k}>`;
      }
      return `<${k}>${escapeXml(v)}</${k}>`;
    })
    .join("");
  return `<PARAMETERS>${body}</PARAMETERS>`;
}

function buildArgs(params = {}) {
  return buildParametersXml(params);
}

// -----------------------------------------------------------------------------
// CANIAS SOAP İstemcisi & Oturum Yönetimi
// -----------------------------------------------------------------------------
let clientPromise = null;

// CANIAS WSDL dosyasını bir kez indirip hafızada tutar (her istekte tekrar indirilmez).
async function getClient() {
  if (!CANIAS_WSDL_URL) throw new Error("CANIAS_WSDL_URL tanımlı değil (.env)");
  if (!clientPromise) {
    clientPromise = soap.createClientAsync(CANIAS_WSDL_URL, { timeout: 20000 });
  }
  return clientPromise;
}

let session = null;
let loginPromise = null;
const SESSION_TTL = 20 * 60 * 1000; // Oturum yaşam süresi: 20 dakika

// CANIAS oturumunu sonlandırma (logout)
async function logout(sid) {
  if (!sid) return;
  try {
    const client = await getClient();
    if (V1) {
      await client.logoutAsync({ p_strSessionId: sid });
    } else {
      await client.logoutAsync({ SessionId: sid });
    }
    console.log("✓ CANIAS oturumu kapatıldı (logout):", sid);
  } catch (err) {
    console.warn("CANIAS logout uyarısı (ihmal edilebilir):", err?.message || err);
  }
}

// CANIAS'a giriş yapıp SessionId alma (login)
async function login() {
  if (loginPromise) return loginPromise;

  loginPromise = (async () => {
    try {
      const client = await getClient();

      if (V1) {
        // v1 SOAP Login Çağrısı
        const [res] = await client.loginAsync({
          p_strClient: CANIAS_CLIENT,
          p_strLanguage: CANIAS_LANGUAGE,
          p_strDBName: CANIAS_DBNAME,
          p_strDBServer: CANIAS_DBSERVER,
          p_strAppServer: CANIAS_APPSERVER,
          p_strUserName: WMS_USER,
          p_strPassword: WMS_PASSWORD,
        });
        const rawLogin = res?.loginReturn;
        let sessionId = typeof rawLogin === "string" ? rawLogin : rawLogin?.$value ?? val(rawLogin ?? res);
        if (typeof sessionId === "object" && sessionId !== null) {
          sessionId = sessionId.$value || JSON.stringify(sessionId);
        }
        if (!sessionId || typeof sessionId !== "string" || /error|fail|hata/i.test(sessionId)) {
          console.error("CANIAS login hatası detayı:", JSON.stringify(res, null, 2));
          throw new Error("CANIAS login başarısız: " + (sessionId || JSON.stringify(res) || "bilinmeyen hata"));
        }
        session = { sessionId, securityKey: "", at: Date.now() };
      } else {
        // v2 SOAP Login Çağrısı
        const [res] = await client.loginAsync({
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
        const r = val(res?.loginReturn ?? res) ?? {};
        if (r.Success !== true || typeof r.SessionId !== "string" || !r.SessionId) {
          throw new Error("CANIAS login başarısız: " + (r.ErrorMessage || "bilinmeyen hata"));
        }
        session = { sessionId: r.SessionId, securityKey: r.SecurityKey || "", at: Date.now() };
      }

      console.log(`✓ CANIAS oturumu açıldı (${V1 ? "v1" : "v2"}):`, session.sessionId);
      return session;
    } finally {
      loginPromise = null;
    }
  })();

  return loginPromise;
}

// Oturum geçerliliğini kontrol eder: Oturum yoksa veya 20 dakikadan eskiyse yeniden açar.
async function ensureSession() {
  if (session && Date.now() - session.at < SESSION_TTL) return session;
  return login();
}

// CANIAS mesaj XML'inden kullanıcıya gösterilecek hata/bilgi metinlerini çeker.
function msgText(raw) {
  if (!raw) return "";
  const t = String(raw);
  const found = [...t.matchAll(/<TEXT>([\s\S]*?)<\/TEXT>/gi)].map((m) => m[1].trim());
  return found.length ? found.join("\n") : t;
}

// -----------------------------------------------------------------------------
// İstek Kuyruğu & Servis Çağırma Motoru (Call Pipeline)
// -----------------------------------------------------------------------------
// CANIAS SOAP servisi aynı anda gelen paralel çağrılarda kilitlenebildiği için
// istekleri sıraya (queue) alarak tek tek işletir.
let cagriKuyrugu = Promise.resolve();
function siraya(fn) {
  const p = cagriKuyrugu.then(fn, fn);
  cagriKuyrugu = p.then(() => { }, () => { });
  return p;
}

function callService(serviceId, params, retry = true) {
  if (POOL_MODE) return getPool().then((p) => p.run(serviceId, params));
  return siraya(() => callServiceInner(serviceId, params, retry));
}

// Gerçek SOAP servis çağrısını yürüten ana fonksiyon
async function callServiceInner(serviceId, params, retry = true) {
  const client = await getClient();
  const s = await ensureSession();

  let rawResponse = "";
  let messages = "";
  let sysStatus = 0;
  let sysError = "";

  if (V1) {
    const args = buildArgs(params);
    console.log(`\n[${serviceId}] → ${args}`);

    // CANIAS v1 callIASService çağrısı
    const [res] = await client.callIASServiceAsync({
      sessionid: s.sessionId,
      serviceid: serviceId,
      args,
      returntype: "JSON",
      permanent: false,
    });
    const out = val(res?.callIASServiceReturn ?? res);
    rawResponse = typeof out === "string" ? out : JSON.stringify(out ?? "");
  } else {
    // CANIAS v2 callService çağrısı
    const parametersXml = buildParametersXml(params);
    console.log(`\n[${serviceId}] → ${parametersXml}`);

    const [res] = await client.callServiceAsync({
      SessionId: s.sessionId,
      SecurityKey: s.securityKey,
      ServiceId: serviceId,
      Parameters: parametersXml,
      Compressed: false,
      Permanent: false,
      ExtraVariables: "",
      RequestId: 0,
    });
    const r = val(res?.callServiceReturn ?? res) ?? {};
    rawResponse = r.Response?.Value ?? "";
    messages = r.Messages?.Value ?? "";
    sysStatus = r.SYSStatus;
    sysError = r.SYSStatusError || "";
  }

  // Veritabanına kayıt yapan servisler boş dönebilir, okuma servislerinde boş dönmesi oturum hatası olabilir.
  const yazanServis =
    serviceId === "MZYSavePick" ||
    serviceId === "MZYSavePlacement" ||
    serviceId === "MZYCreateContainer" ||
    serviceId === "MZYPrintContainer" ||
    serviceId === "MZYPrintWHSP" ||
    serviceId === "MZYPrintMaterial" ||
    serviceId === "MZYPrintBarcode" ||
    serviceId === "MZYCreateBarcode" ||
    serviceId === "MzyCreateBarcode" ||
    serviceId === "MzySetMatSize" ||
    serviceId === "MZYSetMatSize" ||
    serviceId === "MZYSaveReceipt" ||
    serviceId === "MZYSAVEINVPURORDER" ||
    serviceId === "MZYStockTransfer" ||
    serviceId === "MzyStockTransfer" ||
    serviceId === "MZYSaveAdjustment" ||
    serviceId === "MzySaveAdjustment" ||
    serviceId === "MZYSAVEADJUSTMENT";

  const bosYanit = !String(rawResponse ?? "").trim();
  const oturumHatasi = /session/i.test(String(sysError) + String(rawResponse));
  const oturumEski = session ? Date.now() - session.at > 3000 : true;

  // Oturum düşmüşse otomatik olarak yeni login alıp isteği 1 defa tekrar dener (auto-retry).
  if (retry && (oturumHatasi || (bosYanit && !yazanServis && oturumEski))) {
    console.warn(`[${serviceId}] boş/ölü oturum — SOAP client + session yenilenip tekrar denenecek`);
    const oldSid = session?.sessionId;
    session = null;
    loginPromise = null;
    clientPromise = null;
    if (oldSid) logout(oldSid).catch(() => { });
    return callServiceInner(serviceId, params, false);
  }

  // CANIAS'tan dönen ham metin JSON ise JavaScript nesnesine ayrıştırılır.
  let data = null;
  if (rawResponse) {
    try {
      data = JSON.parse(rawResponse);
    } catch {
      data = { raw: rawResponse };
    }
  }

  // Hata veya bilgi mesajı ayıklama
  if (V1 && data && !messages) {
    const t = JSON.stringify(data);
    if (/TBLMESSAGE|SYSTEMMSG|MESSAGE/i.test(t)) {
      const m = /<TEXT>[\s\S]*?<\/TEXT>/i.exec(t);
      if (m) messages = m[0];
    }
  }

  return { data, messages, sysStatus, sysError, raw: rawResponse };
}

// -----------------------------------------------------------------------------
// Loglama ve Formatlama Yardımcıları
// -----------------------------------------------------------------------------
const ts = () => new Date().toLocaleString("tr-TR", { hour12: false });
const log = (...a) => console.log(ts(), ...a);
const logErr = (...a) => console.error(ts(), "✗", ...a);

// Konsola log basarken şifrelerin gizlenmesi ve uzun dizilerin kısaltılması
const kisaParam = (p = {}) => {
  const o = {};
  for (const [k, v] of Object.entries(p)) {
    o[k] = /pass|parola|sifre/i.test(k) ? "***" : typeof v === "object" ? "[…]" : String(v).slice(0, 40);
  }
  return JSON.stringify(o);
};

// -----------------------------------------------------------------------------
// REST API Uç Noktaları (Endpoints)
// -----------------------------------------------------------------------------

// 1. Sağlık Kontrolü (Healthcheck): Sunucunun ve CANIAS oturumunun durumunu döner.
app.get("/health", async (_req, res) => {
  try {
    const s = await ensureSession();
    res.json({ ok: true, version: V1 ? "v1" : "v2", sessionId: s.sessionId });
  } catch (e) {
    res.status(502).json({ ok: false, error: String(e?.message || e) });
  }
});

// 2. Servis Listesi: CANIAS'ta tanımlı tüm web servislerini listeler.
app.get("/services", async (_req, res) => {
  try {
    const client = await getClient();
    const s = await ensureSession();
    const [r] = V1
      ? await client.listIASServicesAsync({ p_strSessionId: s.sessionId })
      : await client.listServicesAsync({ SessionId: s.sessionId });
    res.json(val(r?.listIASServicesReturn ?? r?.listServicesReturn ?? r));
  } catch (e) {
    res.status(502).json({ error: String(e?.message || e) });
  }
});

// Servis İsim Takma Adları (Büyük/küçük harf veya eski isim uyumluluğu için)
const SERVICE_ALIASES = {
  MzyGetCustomer: "MZYGetCustomer",
  MzySetMatSize: "MZYSetMatSize",
  MZYSAVEINVPURORDER: "MZYSaveReceipt",
};

// 3. Ana Proxy Uç Noktası: Frontend tüm CANIAS çağrılarını bu kapıya gönderir.
// Örnek: POST http://localhost:8787/api/mzy/MZYEnterPack
app.post("/api/mzy/:service", async (req, res) => {
  let { service } = req.params;

  // Takma ad kontrolü
  if (SERVICE_ALIASES[service]) {
    service = SERVICE_ALIASES[service];
  }

  // Beyaz liste kontrolü (Büyük/küçük harf duyarsız eşleştirme ile)
  if (!ALLOWED.has(service)) {
    const ciMatch = [...ALLOWED].find((s) => s.toLowerCase() === service.toLowerCase());
    if (ciMatch) {
      service = ciMatch;
    }
  }

  // Eğer servis beyaz listede yoksa güvenlik nedeniyle reddet
  if (!ALLOWED.has(service)) {
    return res.status(404).json({ error: `Bilinmeyen servis: ${service}` });
  }

  const t0 = Date.now();
  log(`→ ${service} ${kisaParam(req.body)}`);

  try {
    // CANIAS çağrısını çalıştır
    const result = await callService(service, req.body ?? {});
    const ms = Date.now() - t0;
    const mesaj = result.messages ? msgText(result.messages) : "";
    if (result.sysError) logErr(`${service} sysError: ${result.sysError} (${ms}ms)`);
    const bos = !String(result.raw ?? "").trim();

    log(
      `← ${service} ${bos ? "BOŞ" : "OK"} ${ms}ms` +
      (mesaj ? ` | mesaj: ${mesaj.replace(/\s+/g, " ").slice(0, 120)}` : "") +
      ` | ${String(result.raw).replace(/\s+/g, " ").slice(0, 200)}`
    );

    // Sonucu JSON olarak React ön yüzüne ilet
    res.json(result);
  } catch (e) {
    const ms = Date.now() - t0;
    logErr(`${service} ${ms}ms — ${e?.message || e}`);
    res.status(502).json({ error: String(e?.message || e) });
  }
});

// -----------------------------------------------------------------------------
// Çevre Değişkeni Eksiklik Kontrolü & SPA Yönlendirmesi
// -----------------------------------------------------------------------------
const REQUIRED = {
  CANIAS_WSDL_URL,
  WMS_USER,
  WMS_PASSWORD,
  CANIAS_CLIENT,
  CANIAS_DBSERVER,
  CANIAS_DBNAME,
  CANIAS_APPSERVER,
};
const missing = Object.entries(REQUIRED)
  .filter(([, v]) => !v)
  .map(([k]) => k);

// Single Page Application (SPA) Fallback: API dışındaki GET isteklerinde index.html sunulur.
app.use((req, res, next) => {
  if (req.method !== "GET") return next();
  if (
    req.path.startsWith("/api/") ||
    req.path === "/health" ||
    req.path === "/services"
  ) {
    return next();
  }
  res.sendFile(join(DIST_DIR, "index.html"));
});

// -----------------------------------------------------------------------------
// Sunucuyu Başlatma (Listen)
// -----------------------------------------------------------------------------
const serverInstance = app.listen(PORT, () => {
  console.log(`WMS proxy : http://localhost:${PORT}`);
  console.log(`Sürüm     : ${V1 ? "v1 (args virgülle)" : "v2 (Parameters XML)"}`);
  console.log(`CANIAS    : ${CANIAS_WSDL_URL || "(tanımsız)"}`);
  console.log(`CORS      : ${CORS_ORIGIN}`);
  console.log(`Oturum    : ${POOL_MODE ? "HAVUZ (max 5 / min 1)" : "tek oturum (mevcut)"}`);
  if (missing.length) {
    console.warn("⚠  server/.env içinde eksik:", missing.join(", "));
  }
  if (!/:\d+$/.test(CANIAS_APPSERVER)) {
    console.warn("⚠  CANIAS_APPSERVER port içermiyor — 'ip:27499' olmalı");
  }
});

// -----------------------------------------------------------------------------
// Güvenli Kapatma (Graceful Shutdown)
// -----------------------------------------------------------------------------
// Sunucu terminalden Ctrl+C (SIGINT) ile kapatıldığında CANIAS'taki açık oturumu
// askıda bırakmamak için önce CANIAS'a logout gönderir, sonra işlemi temizce bitirir.
let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n[${signal}] Sunucu kapatılıyor, CANIAS oturumu sonlandırılıyor...`);
  if (session?.sessionId) {
    await logout(session.sessionId);
    session = null;
  }
  serverInstance.close(() => {
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 3000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
