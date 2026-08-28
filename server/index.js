// -----------------------------------------------------------------------------

// -----------------------------------------------------------------------------

//   v1  (ÇALIŞAN SÜRÜM)
//     login(p_strClient, p_strLanguage, p_strDBName, p_strDBServer,

// -----------------------------------------------------------------------------

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import soap from "soap";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

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

// destructuring default'una güvenilmez.
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
  "MZYGetStock",
  "MZYGetTransaction",

  "MZYListingPlacement",
  "MZYEnterPlacement",
  "MZYClosePlacement",
  "MZYSavePlacement",
  "MZYCrtSuggestListPlacement",
  "GetCompany",
  "GetPlant",
  "GetWarehouse",
  "GetStockPlace",
  "MZYPrintContainer",
  "MZYPrintWHSP",
  "MZYPrintMaterial",
  "MZYPrintBarcode",

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

  // Sayım Servisleri
  "MZYListingAdjustment",
  "MzyListingAdjustment",
  "MZYLISTINGADJUSTMENT",
  "MZYEnterAdjustment",
  "MzyEnterAdjustment",
  "MZYENTERADJUSTMENT",
  "MZYSAVEADJUSTMENT",
  "MZYSaveAdjustment",
  "MzySaveAdjustment",
]);

const app = express();
app.use(cors({ origin: CORS_ORIGIN.split(",").map((s) => s.trim()) }));
app.use(express.json());

const DIST_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");
app.use(express.static(DIST_DIR));

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

let session = null;
let loginPromise = null;
const SESSION_TTL = 20 * 60 * 1000; // 20 dk

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

async function login() {
  if (loginPromise) return loginPromise;

  loginPromise = (async () => {
    try {
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
    } finally {
      loginPromise = null;
    }
  })();

  return loginPromise;
}

async function ensureSession() {
  if (session && Date.now() - session.at < SESSION_TTL) return session;
  return login();
}

function msgText(raw) {
  if (!raw) return "";
  const t = String(raw);
  const found = [...t.matchAll(/<TEXT>([\s\S]*?)<\/TEXT>/gi)].map((m) => m[1].trim());
  return found.length ? found.join("\n") : t;
}

let cagriKuyrugu = Promise.resolve();
function siraya(fn) {
  const p = cagriKuyrugu.then(fn, fn);

  cagriKuyrugu = p.then(() => {}, () => {});
  return p;
}

function callService(serviceId, params, retry = true) {
  if (POOL_MODE) return getPool().then((p) => p.run(serviceId, params));
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

  const yazanServis =
    serviceId === "MZYSavePick" ||
    serviceId === "MZYSavePlacement" ||
    serviceId === "MZYCreateContainer" ||
    serviceId === "MZYPrintContainer" ||
    serviceId === "MZYPrintWHSP" ||
    serviceId === "MZYPrintMaterial" ||
    serviceId === "MZYPrintBarcode" ||
    serviceId === "MzySetMatSize" ||
    serviceId === "MZYSetMatSize" ||
    serviceId === "MZYSaveReceipt" ||
    serviceId === "MZYSAVEINVPURORDER" ||
    serviceId === "MZYStockTransfer" ||
    serviceId === "MzyStockTransfer";
  const bosYanit = !String(rawResponse ?? "").trim();
  const oturumHatasi = /session/i.test(String(sysError) + String(rawResponse));
  const oturumEski = session ? Date.now() - session.at > 3000 : true;
  if (retry && (oturumHatasi || (bosYanit && !yazanServis && oturumEski))) {
    console.warn(`[${serviceId}] boş/ölü oturum — SOAP client + session yenilenip tekrar denenecek`);
    const oldSid = session?.sessionId;
    session = null;
    loginPromise = null;
    clientPromise = null;
    if (oldSid) logout(oldSid).catch(() => {});
    return callServiceInner(serviceId, params, false);
  }

  let data = null;
  if (rawResponse) {
    try {
      data = JSON.parse(rawResponse);
    } catch {
      data = { raw: rawResponse };
    }
  }

  if (V1 && data && !messages) {
    const t = JSON.stringify(data);
    if (/TBLMESSAGE|SYSTEMMSG|MESSAGE/i.test(t)) {
      const m = /<TEXT>[\s\S]*?<\/TEXT>/i.exec(t);
      if (m) messages = m[0];
    }
  }

  return { data, messages, sysStatus, sysError, raw: rawResponse };
}

const ts = () => new Date().toLocaleString("tr-TR", { hour12: false });
const log = (...a) => console.log(ts(), ...a);
const logErr = (...a) => console.error(ts(), "✗", ...a);

const kisaParam = (p = {}) => {
  const o = {};
  for (const [k, v] of Object.entries(p)) {
    o[k] = /pass|parola|sifre/i.test(k) ? "***" : typeof v === "object" ? "[…]" : String(v).slice(0, 40);
  }
  return JSON.stringify(o);
};

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

const SERVICE_ALIASES = {
  MzyGetCustomer: "MZYGetCustomer",
  MzySetMatSize: "MZYSetMatSize",
  MZYSAVEINVPURORDER: "MZYSaveReceipt",
};

app.post("/api/mzy/:service", async (req, res) => {
  let { service } = req.params;
  if (SERVICE_ALIASES[service]) {
    service = SERVICE_ALIASES[service];
  }
  if (!ALLOWED.has(service)) {
    const ciMatch = [...ALLOWED].find((s) => s.toLowerCase() === service.toLowerCase());
    if (ciMatch) {
      service = ciMatch;
    }
  }
  if (!ALLOWED.has(service)) {
    return res.status(404).json({ error: `Bilinmeyen servis: ${service}` });
  }
  const t0 = Date.now();
  log(`→ ${service} ${kisaParam(req.body)}`);
  try {
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
    res.json(result);
  } catch (e) {
    const ms = Date.now() - t0;
    logErr(`${service} ${ms}ms — ${e?.message || e}`);
    res.status(502).json({ error: String(e?.message || e) });
  }
});

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

// Graceful Shutdown
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
