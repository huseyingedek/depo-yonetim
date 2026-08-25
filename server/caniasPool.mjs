// -----------------------------------------------------------------------------

// -----------------------------------------------------------------------------
import soap from "soap";
import { createPool } from "./sessionPool.mjs";

const LIMIT = Number(process.env.POOL_LIMIT || 5);
const MIN = Number(process.env.POOL_MIN || 1);            // en az sıcak
const IDLE_MS = Number(process.env.POOL_IDLE_MS || 60000);
const CALL_TIMEOUT_MS = Number(process.env.POOL_CALL_TIMEOUT_MS || 20000);
const BREAKER = Number(process.env.POOL_BREAKER || 5);
const COOLDOWN_MS = Number(process.env.POOL_COOLDOWN_MS || 15000);
const KEEPALIVE_MS = Number(process.env.POOL_KEEPALIVE_MS || 90000);  // min-1'i canlı tut (<3dk)
const RECONCILE_MS = Number(process.env.POOL_RECONCILE_MS || 30000);  // CANIAS gerçeğiyle uzlaş
const MZY_COMPANY = process.env.T_COMPANY || "01";
const MZY_PLANT = process.env.T_PLANT || "100";

const YAZAN_SERVIS = new Set([
  "MZYSavePick",
  "MZYSavePlacement",
  "MZYCreateContainer",
  "MZYPrintContainer",
  "MZYPrintWHSP",
  "MZYPrintMaterial",
  "MZYPrintBarcode",
  "MzySetMatSize",
  "MZYSetMatSize",
  "MZYSaveReceipt",
  "MZYSAVEINVPURORDER",
  "MZYStockTransfer",
  "MzyStockTransfer",
]);

function val(x) {
  if (x === null || x === undefined) return x;
  if (Array.isArray(x)) return x.map(val);
  if (typeof x === "object") {
    if ("$value" in x) return x.$value;
    const out = {};
    for (const [k, v] of Object.entries(x)) { if (k === "attributes") continue; out[k] = val(v); }
    return Object.keys(out).length ? out : "";
  }
  return x;
}
const escapeXml = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function buildArgs(params = {}) {
  const body = Object.entries(params).map(([k, v]) => {
    if (Array.isArray(v)) {
      const rows = v.map((row) => `<ROW>${Object.entries(row ?? {}).map(([rk, rv]) => `<${rk}>${escapeXml(rv)}</${rk}>`).join("")}</ROW>`).join("");
      return `<${k}>${rows}</${k}>`;
    }
    return `<${k}>${escapeXml(v)}</${k}>`;
  }).join("");
  return `<PARAMETERS>${body}</PARAMETERS>`;
}

export function createCaniasPool(env = process.env) {
  const {
    CANIAS_WSDL_URL, CANIAS_CLIENT, CANIAS_LANGUAGE = "T",
    CANIAS_DBSERVER, CANIAS_DBNAME, CANIAS_APPSERVER, WMS_USER, WMS_PASSWORD,
  } = env;

  let clientPromise = null;
  const getClient = () => (clientPromise ??= soap.createClientAsync(CANIAS_WSDL_URL, { timeout: CALL_TIMEOUT_MS }));

  async function login() {
    const client = await getClient();
    const [res] = await client.loginAsync({
      p_strClient: CANIAS_CLIENT, p_strLanguage: CANIAS_LANGUAGE, p_strDBName: CANIAS_DBNAME,
      p_strDBServer: CANIAS_DBSERVER, p_strAppServer: CANIAS_APPSERVER,
      p_strUserName: WMS_USER, p_strPassword: WMS_PASSWORD,
    });
    const sid = val(res?.loginReturn ?? res);
    if (!sid || typeof sid !== "string" || /error|fail|hata/i.test(sid)) {
      throw Object.assign(new Error("CANIAS login başarısız: " + (sid || "boş sessionId")), { code: "LOGIN" });
    }
    return sid;
  }
  async function logout(sid) {
    const client = await getClient();
    try { await client.logoutAsync({ p_strSessionId: sid }); } catch { }
  }
  async function callSvc(sid, serviceId, params) {
    const client = await getClient();
    const [res] = await client.callIASServiceAsync({
      sessionid: sid, serviceid: serviceId, args: buildArgs(params), returntype: "JSON", permanent: false,
    });
    const out = val(res?.callIASServiceReturn ?? res);
    const raw = typeof out === "string" ? out : JSON.stringify(out ?? "");
    const bos = !String(raw ?? "").trim();

    if (bos && !YAZAN_SERVIS.has(serviceId)) throw Object.assign(new Error("session invalid (empty)"), { code: "SESSION" });
    let data = null;
    if (raw) { try { data = JSON.parse(raw); } catch { data = { raw }; } }
    return { data, raw, messages: "", sysStatus: 0, sysError: "" };
  }

  let pool;
  const validate = async () => {
    const r = await pool.run("MZYActiveUserList", { PSCOMPANY: MZY_COMPANY, PSPLANT: MZY_PLANT });
    const t = r?.data?.TBLACTIVEUSER;
    const row = t?.ROW ?? t;
    const rows = Array.isArray(row) ? row : (row && row.CONNECTIONID ? [row] : []);
    return rows.map((x) => x.CONNECTIONID).filter(Boolean);
  };

  pool = createPool({ login, logout, callSvc, validate, limit: LIMIT, min: MIN, idleMs: IDLE_MS, callTimeoutMs: CALL_TIMEOUT_MS, breakerThreshold: BREAKER, cooldownMs: COOLDOWN_MS });

  // ---- Zamanlayıcılar ----
  const timers = [
    setInterval(() => pool.reap().catch(() => {}), IDLE_MS / 2),
    setInterval(() => pool.reconcile().catch(() => {}), RECONCILE_MS),
    setInterval(() => pool.keepAlive("MZYActiveUserList", { PSCOMPANY: MZY_COMPANY, PSPLANT: MZY_PLANT }).catch(() => {}), KEEPALIVE_MS),
  ];
  timers.forEach((t) => t.unref?.());

  return {
    run: (serviceId, params) => pool.run(serviceId, params),
    status: () => ({ size: pool.size(), limit: LIMIT, min: MIN }),
    async shutdown() { timers.forEach(clearInterval); for (const p of pool._pool) if (p.sid) await logout(p.sid); },
    _pool: pool,
  };
}
