// -----------------------------------------------------------------------------
// Aktüel Ofis WMS — CANIAS Proxy
// -----------------------------------------------------------------------------
// Frontend:  POST /api/mzy/:service   { PCOMPANY: "01", PPLANT: "100", ... }
// Proxy:     login (oturum cache'li) → servis çağrısı → sade JSON döner
//
// İKİ SÜRÜM DESTEKLENİR (server/.env → CANIAS_WS_VERSION):
//
//   v1  (ÇALIŞAN SÜRÜM)
//     login(p_strClient, p_strLanguage, p_strDBName, p_strDBServer,
//           p_strAppServer, p_strUserName, p_strPassword) → sessionId (düz string)
//     callIASService(sessionid, serviceid, args, returntype, permanent)
//     args = <PARAMETERS><PSUSER>x</PSUSER>...</PARAMETERS>  ← XML, adlarıyla
//
//   v2  (parametreleri okumuyordu — bkz. server/NOTLAR.md)
//     login(Client, Language, DBServer, DBName, ApplicationServer, ...)
//     callService(SessionId, SecurityKey, ServiceId, Parameters=XML, ...)
//
// ÖNEMLİ: parametreler ADLARIYLA gider (sıra değil). client.ts'teki anahtar
// adları Mizoye dokümanındaki adlarla birebir aynı olmalı.
// -----------------------------------------------------------------------------

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import soap from "soap";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Her zaman server/.env okunsun — proje kökünden çalıştırılsa bile
// yanlışlıkla frontend .env'i yüklenmesin.
dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), ".env") });

const {
  PORT = 8787,
  CANIAS_WS_VERSION = "v1",
  CANIAS_WSDL_URL = "",
  WMS_USER = "",
  WMS_PASSWORD = "",
  CANIAS_CLIENT = "",
  CANIAS_LANGUAGE = "T",
  CANIAS_DBSERVER = "",
  CANIAS_DBNAME = "",
  CANIAS_APPSERVER = "",
  CORS_ORIGIN = "http://localhost:5173",
} = process.env;

const V1 = CANIAS_WS_VERSION.toLowerCase() !== "v2";

const ALLOWED = new Set([
  "MZYCheckUser",
  "MZYListingPick",
  "MZYEnterPick",
  "MZYClosePick",
  "MZYCreateContainer",
  "MZYReadBarcode",
  "MZYReadBarcodeSP",
  "MZYCrtSuggestListPickFromSP",
  "MZYSavePick",
  "GetCompany",
  "GetPlant",
  "GetWarehouse",
]);

const app = express();
app.use(cors({ origin: CORS_ORIGIN.split(",").map((s) => s.trim()) }));
app.use(express.json());

/* ---------------- SOAP yardımcıları ---------------- */

/** SOAP yanıtları {attributes,$value} sarmalıyla gelir; gerçek değeri çıkarır. */
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

/** v2 biçimi: <PARAMETERS><ALAN>deger</ALAN>...</PARAMETERS> */
/**
 * Parametre XML'i üretir.
 *
 * Değer DİZİ ise tablo olarak yazılır — her eleman bir <ROW>:
 *   { IASWMSPOITEMREAD: [{COMPANY:"01"}, ...] }
 *   → <IASWMSPOITEMREAD><ROW><COMPANY>01</COMPANY></ROW>...</IASWMSPOITEMREAD>
 *
 * MZYSavePick birden çok okutma satırı taşıdığı için gerekli. Bu biçim
 * Bora'dan TEYİT EDİLMEDİ; servis yayınlanınca ilk çağrıda doğrulanacak.
 */
function buildParametersXml(params = {}) {
  const body = Object.entries(params)
    .map(([k, v]) => {
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

/**
 * v1 biçimi — DENEYLE BULUNDU:
 * args alanı da <PARAMETERS><AD>deger</AD>...</PARAMETERS> XML'i ister.
 * Virgülle ayrık gönderim sessizce yok sayılıyor (boş tablo döner).
 * Doğrulama: MZYCheckUser doğru şifrede TBLUSER, yanlışta TBLMESSAGE döndü.
 */
function buildArgs(params = {}) {
  return buildParametersXml(params);
}

let clientPromise = null;
async function getClient() {
  if (!CANIAS_WSDL_URL) throw new Error("CANIAS_WSDL_URL tanımlı değil (.env)");
  if (!clientPromise) {
    clientPromise = soap.createClientAsync(CANIAS_WSDL_URL, { timeout: 20000 });
  }
  return clientPromise;
}

/* ---------------- Oturum yönetimi ---------------- */

let session = null; // { sessionId, securityKey, at }
const SESSION_TTL = 20 * 60 * 1000; // 20 dk

async function login() {
  const client = await getClient();

  if (V1) {
    const [res] = await client.loginAsync({
      p_strClient: CANIAS_CLIENT,
      p_strLanguage: CANIAS_LANGUAGE,
      p_strDBName: CANIAS_DBNAME,
      p_strDBServer: CANIAS_DBSERVER,
      p_strAppServer: CANIAS_APPSERVER,
      p_strUserName: WMS_USER,
      p_strPassword: WMS_PASSWORD,
    });
    const sessionId = val(res?.loginReturn ?? res);
    if (!sessionId || typeof sessionId !== "string" || /error|fail|hata/i.test(sessionId)) {
      throw new Error("CANIAS login başarısız: " + (sessionId || "bilinmeyen hata"));
    }
    session = { sessionId, securityKey: "", at: Date.now() };
  } else {
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
}

async function ensureSession() {
  if (session && Date.now() - session.at < SESSION_TTL) return session;
  return login();
}

/* ---------------- Servis çağrısı ---------------- */

/** TROIA mesaj XML'inden okunur metni çıkarır. */
function msgText(raw) {
  if (!raw) return "";
  const t = String(raw);
  const found = [...t.matchAll(/<TEXT>([\s\S]*?)<\/TEXT>/gi)].map((m) => m[1].trim());
  return found.length ? found.join("\n") : t;
}

/**
 * CANIAS ÇAĞRI KUYRUĞU — aynı anda TEK istek.
 *
 * CANIAS/TROIA oturumu eşzamanlı çağrılara dayanmıyor: aynı sessionId'ye
 * paralel istek gelince oturum bozulup sonraki yanıtlar BOŞ dönüyor.
 * (fillLocations her kalem için paralel suggest atıyordu → liste bazen boş
 * geliyordu.) Bütün çağrıları sıraya sokuyoruz; biri bitmeden diğeri gitmiyor.
 */
let cagriKuyrugu = Promise.resolve();
function siraya(fn) {
  const p = cagriKuyrugu.then(fn, fn);
  // Kuyruğu, hatayı yutarak ilerlet (bir çağrı patlasa da sıra devam etsin).
  cagriKuyrugu = p.then(() => {}, () => {});
  return p;
}

function callService(serviceId, params, retry = true) {
  return siraya(() => callServiceInner(serviceId, params, retry));
}

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

  /* OTURUM ÖLÜMÜ — CANIAS session'ı zaman aşımına uğrayınca çağrılar HATA
     DEĞİL, TAMAMEN BOŞ yanıt döndürüyor (rawResponse = ""). "session" kelimesi
     yok, o yüzden ayrıca boş yanıtı da yakalıyoruz.

     ÖNEMLİ AYRIMLAR (yanlış re-login olmasın diye):
     • "veri yok" ≠ boş: veri olmasa da servis JSON döner ({"TBLPOLIST":""}).
       Yalnızca rawResponse'un TAMAMEN boş olması ölü oturumdur.
     • Oturum YENİ açıldıysa (3 sn) ve hâlâ boşsa, bu ölü oturum değil —
       servis gerçekten boş/bozuk dönüyor demektir; TEKRAR login ATMAYIZ
       (aksi halde bozuk serviste sürekli gereksiz login olurdu — kullanıcının
       uyarısı). Sadece oturum ESKİYSE ölü sayıp yenileriz.
     • SavePick/CreateContainer başarıda da boş dönebiliyor (data:null) →
       onları tekrar DENEMEYİZ (çift palet/stok riski); ölü oturuma denk
       gelirlerse "palet oluşturulamadı" ile güvenli başarısız olurlar. */
  const yazanServis = serviceId === "MZYSavePick" || serviceId === "MZYCreateContainer";
  const bosYanit = !String(rawResponse ?? "").trim();
  const oturumHatasi = /session/i.test(String(sysError) + String(rawResponse));
  const oturumEski = session ? Date.now() - session.at > 3000 : true;
  if (retry && (oturumHatasi || (bosYanit && !yazanServis && oturumEski))) {
    console.warn(`[${serviceId}] boş/ölü oturum — SOAP client + session yenilenip tekrar denenecek`);
    // RESTART EŞDEĞERİ: sadece login değil, SOAP bağlantısını da yeniliyoruz.
    // Restart edince düzelmesinin sebebi client'ın da baştan kurulması.
    session = null;
    clientPromise = null;
    return callServiceInner(serviceId, params, false);
  }

  // Yanıt JSON string olarak geliyor
  let data = null;
  if (rawResponse) {
    try {
      data = JSON.parse(rawResponse);
    } catch {
      data = { raw: rawResponse };
    }
  }

  // v1'de mesajlar yanıtın içinde gelebiliyor (TBLMESSAGE / SYSTEMMSG)
  if (V1 && data && !messages) {
    const t = JSON.stringify(data);
    if (/TBLMESSAGE|SYSTEMMSG|MESSAGE/i.test(t)) {
      const m = /<TEXT>[\s\S]*?<\/TEXT>/i.exec(t);
      if (m) messages = m[0];
    }
  }

  return { data, messages, sysStatus, sysError, raw: rawResponse };
}

/* ---------------- HTTP uçları ---------------- */

app.get("/health", async (_req, res) => {
  try {
    const s = await ensureSession();
    res.json({ ok: true, version: V1 ? "v1" : "v2", sessionId: s.sessionId });
  } catch (e) {
    res.status(502).json({ ok: false, error: String(e?.message || e) });
  }
});

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

app.post("/api/mzy/:service", async (req, res) => {
  const { service } = req.params;
  if (!ALLOWED.has(service)) {
    return res.status(404).json({ error: `Bilinmeyen servis: ${service}` });
  }
  try {
    const result = await callService(service, req.body ?? {});
    if (result.messages) console.log(`[${service}] Mesaj:`, msgText(result.messages));
    if (result.sysError) console.warn(`[${service}] Hata:`, result.sysError);
    console.log(`[${service}] Yanıt:`, String(result.raw).replace(/\s+/g, " ").slice(0, 300));
    res.json(result);
  } catch (e) {
    console.error(`[${service}]`, e?.message || e);
    res.status(502).json({ error: String(e?.message || e) });
  }
});

// Açılışta eksik ayar varsa sessiz kalma
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

app.listen(PORT, () => {
  console.log(`WMS proxy : http://localhost:${PORT}`);
  console.log(`Sürüm     : ${V1 ? "v1 (args virgülle)" : "v2 (Parameters XML)"}`);
  console.log(`CANIAS    : ${CANIAS_WSDL_URL || "(tanımsız)"}`);
  console.log(`CORS      : ${CORS_ORIGIN}`);
  if (missing.length) {
    console.warn("⚠  server/.env içinde eksik:", missing.join(", "));
  }
  if (!/:\d+$/.test(CANIAS_APPSERVER)) {
    console.warn("⚠  CANIAS_APPSERVER port içermiyor — 'ip:27499' olmalı");
  }
});
