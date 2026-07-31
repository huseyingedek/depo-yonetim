// -----------------------------------------------------------------------------
// SessionPool — CANIAS'tan BAĞIMSIZ, enjekte edilebilir oturum havuzu.
// Bağımlılıklar dışarıdan verilir: login, logout, callSvc, validate, now.
// Değişmezler: 1 <= boyut <= limit; bir token aynı anda TEK çağrı.
// -----------------------------------------------------------------------------
export function createPool({
  login, logout, callSvc, validate,
  now = () => Date.now(),
  limit = 5, min = 1, idleMs = 5000, callTimeoutMs = 500,
  breakerThreshold = 5, cooldownMs = 10000,
}) {
  const pool = [];        // { sid, busy, lastUsed }
  const waiters = [];     // { resolve, reject } — hepsi meşgulse bekleyenler
  const persisted = new Set(); // "token log dosyası" karşılığı (restart recovery)

  // Devre kesici: art arda bağlantı hatasında "aç" (hızlı fail, CANIAS'ı yorma),
  // cooldown sonrası tek yoklama (half-open), başarıda "kapat".
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
        pool.splice(pool.indexOf(slot), 1); // login patladı → slotu geri al (limit aşılmasın)
        const w = waiters.shift();          // bekleyen varsa denesin (o da patlarsa reject olur)
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
    // Devre açık + cooldown dolmadıysa → HIZLI FAIL (20sn beklemeden, CANIAS'ı yormadan)
    if (devreAcik && now() - acilmaZamani < cooldownMs) {
      throw Object.assign(new Error("CANIAS'a ulaşılamıyor (devre açık)"), { code: "CIRCUIT" });
    }
    let p;
    try {
      p = await acquire();
    } catch (e) {
      hataKaydet(e);                                 // login patladı → bağlantı hatası
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
      // ÖNEMLİ: timeout'ta alttaki çağrı ARKADA hâlâ çalışıyor olabilir. Tokeni
      // havuza geri verirsek başka istek kapar → AYNI oturuma paralel çağrı → liste
      // bozulması. Bu yüzden timeout'ta da tokeni ÖLDÜR. Ama RETRY YAPMA (yazma
      // servisinde çift kayıt olmasın — sadece ölü-oturumda taze dene).
      release(p, sessionErr || zamanAsimi);
      if (sessionErr && _retry) return run(serviceId, params, false); // ölü oturum → 1 kez taze dene
      hataKaydet(e);                                 // timeout/diğer → bağlantı hatası say
      throw e;
    }
  }

  // Boştaları min'e kadar logout et
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

  // CANIAS gerçeğiyle uzlaştır: listede olmayan (dış kapatılan) boştaları at
  async function reconcile() {
    if (!validate) return;
    let liste;
    try { liste = await validate(); } catch { return; }
    // GÜVENLİK: boş/hatalı liste gelirse DOKUNMA (yanlışlıkla hepsini atma).
    if (!Array.isArray(liste) || liste.length === 0) return;
    const aktif = new Set(liste);
    for (const p of [...pool]) {
      if (p.sid && !p.busy && !aktif.has(p.sid)) {
        pool.splice(pool.indexOf(p), 1);
        persisted.delete(p.sid);
      }
    }
  }

  // min sıcak tokenı idle-ölmekten koru (heartbeat)
  async function keepAlive(svc, params) {
    for (const p of pool) {
      if (!p.busy && p.sid) {
        try { await callSvc(p.sid, svc, params); p.lastUsed = now(); } catch {}
      }
    }
  }

  // Restart sonrası: kalıcı listedeki orphan oturumları CANIAS'la uzlaştırıp temizle
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
