// -----------------------------------------------------------------------------

// -----------------------------------------------------------------------------
export function createPool({
  login, logout, callSvc, validate,
  now = () => Date.now(),
  limit = 5, min = 1, idleMs = 5000, callTimeoutMs = 500,
  breakerThreshold = 5, cooldownMs = 10000,
}) {
  const pool = [];
  const waiters = [];
  const persisted = new Set();

  let ardArdaHata = 0;
  let devreAcik = false;
  let acilmaZamani = 0;
  const baglantiHatasiMi = (e) => {
    const c = e?.code;
    return c === "TIMEOUT" || c === "ETIMEDOUT" || c === "LOGIN" ||
      /timeout|etimedout|login başarısız|ulaş/i.test(String(e?.message));
  };
  const hataKaydet = (e) => {
    if (!baglantiHatasiMi(e)) return;                 // sadece CANIAS/bağlantı hatası sayılır
    ardArdaHata++;
    if (ardArdaHata >= breakerThreshold) { devreAcik = true; acilmaZamani = now(); }
  };
  const basari = () => { ardArdaHata = 0; devreAcik = false; };

  const size = () => pool.length;
  const free = () => pool.find((p) => !p.busy && p.sid);

  const withTimeout = (pr, ms, label) => {
    let to;
    const timer = new Promise((_, rej) => {
      to = setTimeout(() => rej(Object.assign(new Error(`timeout:${label}`), { code: "TIMEOUT" })), ms);
    });
    return Promise.race([pr, timer]).finally(() => clearTimeout(to));
  };

  async function acquire() {
    const f = free();
    if (f) { f.busy = true; return f; }
    if (pool.length < limit) {
      const slot = { sid: null, busy: true, lastUsed: now() };
      pool.push(slot);
      try {
        slot.sid = await withTimeout(login(), callTimeoutMs, "login");
        persisted.add(slot.sid);
      } catch (e) {
        pool.splice(pool.indexOf(slot), 1);
        const w = waiters.shift();
        if (w) acquire().then(w.resolve, w.reject);
        throw e;
      }
      return slot;
    }
    return new Promise((resolve, reject) => waiters.push({ resolve, reject }));
  }

  function release(p, dead = false) {
    if (dead) {
      const i = pool.indexOf(p); if (i >= 0) pool.splice(i, 1);
      if (p.sid) { persisted.delete(p.sid); logout(p.sid).catch(() => {}); }
      const w = waiters.shift();
      if (w) acquire().then(w.resolve, w.reject); // boşalan slotu bekleyenle doldur
      return;
    }
    const w = waiters.shift();
    if (w) { p.busy = true; w.resolve(p); }        // boşta tokeni doğrudan bekleyene
    else { p.busy = false; p.lastUsed = now(); }
  }

  async function run(serviceId, params, _retry = true) {

    if (devreAcik && now() - acilmaZamani < cooldownMs) {
      throw Object.assign(new Error("CANIAS'a ulaşılamıyor (devre açık)"), { code: "CIRCUIT" });
    }
    let p;
    try {
      p = await acquire();
    } catch (e) {
      hataKaydet(e);
      throw e;
    }
    try {
      const r = await withTimeout(callSvc(p.sid, serviceId, params), callTimeoutMs, "call");
      release(p);
      basari();                                      // başarı → devreyi kapat
      return r;
    } catch (e) {
      const sessionErr = /session|invalid/i.test(String(e?.message));
      const zamanAsimi = e?.code === "TIMEOUT";

      release(p, sessionErr || zamanAsimi);
      if (sessionErr && _retry) return run(serviceId, params, false);
      hataKaydet(e);
      throw e;
    }
  }

  async function reap() {
    const t = now();
    for (const p of [...pool]) {
      if (size() <= min) break;
      if (!p.busy && p.sid && t - p.lastUsed > idleMs) {
        pool.splice(pool.indexOf(p), 1);
        persisted.delete(p.sid);
        await logout(p.sid).catch(() => {});
      }
    }
  }

  async function reconcile() {
    if (!validate) return;
    let liste;
    try { liste = await validate(); } catch { return; }

    if (!Array.isArray(liste) || liste.length === 0) return;
    const aktif = new Set(liste);
    for (const p of [...pool]) {
      if (p.sid && !p.busy && !aktif.has(p.sid)) {
        pool.splice(pool.indexOf(p), 1);
        persisted.delete(p.sid);
      }
    }
  }

  async function keepAlive(svc, params) {
    for (const p of pool) {
      if (!p.busy && p.sid) {
        try { await callSvc(p.sid, svc, params); p.lastUsed = now(); } catch {}
      }
    }
  }

  async function recover(persistedSids) {
    if (!validate) return;
    let aktif;
    try { aktif = new Set(await validate()); } catch { return; }
    for (const sid of persistedSids) {
      if (aktif.has(sid)) await logout(sid).catch(() => {}); // orphan → temiz kapat
    }
  }

  return { run, reap, reconcile, keepAlive, recover, size, _pool: pool, _waiters: waiters, _persisted: persisted, _circuit: () => ({ open: devreAcik, fails: ardArdaHata }) };
}
