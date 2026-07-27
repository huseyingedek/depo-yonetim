// -----------------------------------------------------------------------------
// HAVUZ DAYANIKLILIK TESTLERİ — sahte (mock) CANIAS ile tüm senaryolar.
// Gerçek CANIAS/VPN gerekmez; deterministik. Çalıştır: node test.mjs
// -----------------------------------------------------------------------------
import { createPool } from "./pool.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Kontrol edilebilir sahte CANIAS
function makeFake(now = () => Date.now(), { loginMs = 4, callMs = 2 } = {}) {
  let n = 1000;
  const active = new Map(); // sid -> son işlem zamanı (afk-öldürme simülasyonu için)
  const f = {
    mode: "normal", logins: 0, loginMs, callMs, active,
    externalClose: (sid) => active.delete(sid),
    // CANIAS'ın afk (idle) öldürmesi: ttl'den uzun süredir işlem görmeyeni sil
    idleSweep: (ttl) => { const t = now(); for (const [sid, la] of active) if (t - la > ttl) active.delete(sid); },
    async login() {
      if (f.mode === "down") throw Object.assign(new Error("ETIMEDOUT"), { code: "ETIMEDOUT" });
      await sleep(f.mode === "slow" ? f.loginMs * 300 : f.loginMs);
      f.logins++; const sid = "S" + ++n; active.set(sid, now()); return sid;
    },
    async logout(sid) { await sleep(1); active.delete(sid); },
    async callSvc(sid, svc) {
      if (f.mode === "down") throw Object.assign(new Error("ETIMEDOUT"), { code: "ETIMEDOUT" });
      await sleep(f.mode === "slow" ? f.callMs * 300 : f.callMs);
      if (!active.has(sid)) throw new Error("session invalid"); // ölmüş/dış kapatılmış oturum
      active.set(sid, now()); return { ok: true }; // her çağrı (ping dahil) son işlem zamanını yeniler
    },
  };
  return f;
}

const wire = (fake, clock) => ({
  login: () => fake.login(),
  logout: (s) => fake.logout(s),
  callSvc: (s, svc, p) => fake.callSvc(s, svc),
  validate: () => Promise.resolve([...fake.active.keys()]),
  now: () => clock.t,
});

let PASS = 0, FAIL = 0;
const ok = (c, m) => { c ? (PASS++, console.log(`   ✓ ${m}`)) : (FAIL++, console.log(`   ✗ ${m}`)); };

// -------------------- SENARYOLAR --------------------

async function s1_yuk() {
  console.log("\n[1] YÜK: 20 eşzamanlı istek → havuz limit'e (5) çıkar");
  const clock = { t: 1e6 }, fake = makeFake(() => clock.t);
  const pool = createPool({ ...wire(fake, clock), limit: 5, min: 1, idleMs: 9e9, callTimeoutMs: 500 });
  const r = await Promise.allSettled(Array.from({ length: 20 }, () => pool.run("svc", {})));
  ok(r.every((x) => x.status === "fulfilled"), "20/20 istek başarılı");
  ok(pool.size() === 5, `havuz = 5 (${pool.size()})`);
  ok(fake.active.size === 5, `CANIAS = 5 oturum (${fake.active.size})`);
}

async function s2_bosta() {
  console.log("\n[2] BOŞTA: yük biter → reaper min'e (1) indirir");
  const clock = { t: 1e6 }, fake = makeFake(() => clock.t);
  const pool = createPool({ ...wire(fake, clock), limit: 5, min: 1, idleMs: 100, callTimeoutMs: 500 });
  await Promise.allSettled(Array.from({ length: 20 }, () => pool.run("svc", {})));
  ok(pool.size() === 5, `yük sonrası havuz = 5 (${pool.size()})`);
  clock.t += 200;                         // boşta süresi geçti
  await pool.reap(); await pool.reap(); await pool.reap(); await pool.reap();
  ok(pool.size() === 1, `boşta sonrası havuz = 1 (${pool.size()})`);
  ok(fake.active.size === 1, `CANIAS = 1 oturum (${fake.active.size})`);
}

async function s3_son_oturum_dis_kapatma() {
  console.log("\n[3] DIŞ KAPATMA (SON oturum): elle kapatılır → istek yine başarılı (re-login)");
  const clock = { t: 1e6 }, fake = makeFake(() => clock.t);
  const pool = createPool({ ...wire(fake, clock), limit: 5, min: 1, idleMs: 9e9, callTimeoutMs: 500 });
  await pool.run("svc", {});                        // 1 oturum aç
  ok(pool.size() === 1, `havuz = 1 (${pool.size()})`);
  const sid = pool._pool[0].sid;
  fake.externalClose(sid);                          // CANIAS'ta elle kapat
  ok(!fake.active.has(sid), "oturum CANIAS'ta kapatıldı");
  const r = await pool.run("svc", {});              // çağrı → session hatası → dead → taze login → başarılı
  ok(r?.ok === true, "istek yine BAŞARILI (kendini toparladı)");
  ok(pool.size() === 1 && fake.active.size === 1, `havuz=1, CANIAS=1 (${pool.size()}/${fake.active.size})`);
  ok(pool._pool[0].sid !== sid, "yeni (taze) oturuma geçti");
}

async function s4_bir_oturum_reconcile() {
  console.log("\n[4] DIŞ KAPATMA (5'ten BİRİ): reconcile ile havuzdan temizlenir");
  const clock = { t: 1e6 }, fake = makeFake(() => clock.t);
  const pool = createPool({ ...wire(fake, clock), limit: 5, min: 1, idleMs: 9e9, callTimeoutMs: 500 });
  await Promise.allSettled(Array.from({ length: 12 }, () => pool.run("svc", {})));
  ok(pool.size() === 5, `havuz = 5 (${pool.size()})`);
  const kapatilan = pool._pool[2].sid;
  fake.externalClose(kapatilan);                    // 5'ten birini elle kapat
  await pool.reconcile();                           // MZYActiveUserList ile uzlaştır
  ok(pool.size() === 4, `reconcile sonrası havuz = 4 (${pool.size()})`);
  ok(!pool._pool.some((p) => p.sid === kapatilan), "kapatılan oturum havuzdan atıldı");
  ok(pool._pool.every((p) => fake.active.has(p.sid)), "kalan tüm oturumlar CANIAS'ta gerçekten aktif");
}

async function s5_yavas_yanit() {
  console.log("\n[5] YAVAŞ YANIT: çağrı timeout'u aşar → temiz reddeder, ASILMAZ");
  const clock = { t: 1e6 }, fake = makeFake(() => clock.t);
  const pool = createPool({ ...wire(fake, clock), limit: 5, min: 1, idleMs: 9e9, callTimeoutMs: 120 });
  await pool.run("svc", {});                        // 1 sağlıklı oturum
  fake.mode = "slow";                               // artık çağrılar çok yavaş
  const t0 = Date.now();
  let hata = null;
  try { await pool.run("svc", {}); } catch (e) { hata = e; }
  const gecen = Date.now() - t0;
  ok(hata && hata.code === "TIMEOUT", "çağrı TIMEOUT ile reddedildi (asılmadı)");
  ok(gecen < 500, `hızlı döndü, ~${gecen}ms (sonsuz beklemedi)`);
  ok(pool.size() <= 5, `limit korunuyor (havuz ${pool.size()})`);
}

async function s6_canias_coktu() {
  console.log("\n[6] CANIAS ÇÖKTÜ: tüm çağrılar hata → temiz, asılma yok, limit korunur → sonra toparlanır");
  const clock = { t: 1e6 }, fake = makeFake(() => clock.t);
  const pool = createPool({ ...wire(fake, clock), limit: 5, min: 1, idleMs: 9e9, callTimeoutMs: 200 });
  fake.mode = "down";                               // CANIAS düştü
  const r = await Promise.allSettled(Array.from({ length: 10 }, () => pool.run("svc", {})));
  ok(r.every((x) => x.status === "rejected"), "10/10 istek TEMİZ hata verdi (kilitlenmedi)");
  ok(pool.size() <= 5, `limit aşılmadı (havuz ${pool.size()})`);
  fake.mode = "normal";                             // CANIAS geri geldi
  const r2 = await pool.run("svc", {});
  ok(r2?.ok === true, "CANIAS dönünce istek yeniden ÇALIŞIYOR (toparlandı)");
}

async function s7_bizim_sistem_coktu() {
  console.log("\n[7] BİZİM SİSTEM ÇÖKTÜ + RESTART: orphan oturumlar recover ile temizlenir");
  const clock = { t: 1e6 }, fake = makeFake(() => clock.t);
  const pool1 = createPool({ ...wire(fake, clock), limit: 5, min: 1, idleMs: 9e9, callTimeoutMs: 500 });
  await Promise.allSettled(Array.from({ length: 12 }, () => pool1.run("svc", {})));
  ok(fake.active.size === 5, `çökmeden önce CANIAS = 5 (${fake.active.size})`);
  const kalici = [...pool1._persisted];             // "token log dosyası" (diskte kalan)
  // >>> ÇÖKME: pool1 uçtu, ama CANIAS'ta 5 orphan oturum asılı kaldı <<<
  const pool2 = createPool({ ...wire(fake, clock), limit: 5, min: 1, idleMs: 9e9, callTimeoutMs: 500 });
  ok(fake.active.size === 5, "restart anında CANIAS'ta 5 orphan var");
  await pool2.recover(kalici);                      // dosyadan oku + CANIAS'la uzlaş + temizle
  ok(fake.active.size === 0, `recover sonrası orphan temizlendi, CANIAS = 0 (${fake.active.size})`);
  const r = await pool2.run("svc", {});             // yeni havuz temiz çalışıyor
  ok(r?.ok === true && pool2.size() === 1, "yeni havuz temiz başladı ve çalışıyor");
}


async function s8_reuse() {
  console.log("\n[8] REUSE vs YENİDEN LOGIN: mevcut varsa kullan, yetmezse yeni aç");
  const clock = { t: 1e6 }, fake = makeFake(() => clock.t);
  const pool = createPool({ ...wire(fake, clock), limit: 5, min: 1, idleMs: 30000, callTimeoutMs: 500 });
  await Promise.allSettled(Array.from({ length: 20 }, () => pool.run("svc", {})));
  ok(pool.size() === 5 && fake.logins === 5, `yük: havuz 5, toplam login 5 (${fake.logins})`);
  await pool.run("svc", {});                         // idle penceresi içinde yeni istek
  ok(fake.logins === 5, `hemen gelen istek: MEVCUDU kullandı, login ARTMADI (${fake.logins})`);
  ok(pool.size() === 5, `havuz hâlâ 5 (${pool.size()})`);
  clock.t += 40000;                                  // uzun boşluk
  for (let i = 0; i < 5; i++) await pool.reap();
  ok(pool.size() === 1, `uzun boşta: reaper havuzu 1'e indirdi (${pool.size()})`);
  await pool.run("svc", {});                         // tek istek
  ok(fake.logins === 5, `tek istek: sıcak oturumu kullandı, login yok (${fake.logins})`);
  await Promise.allSettled(Array.from({ length: 5 }, () => pool.run("svc", {})));  // patlama
  ok(pool.size() === 5 && fake.logins === 9, `patlama: 1 reuse + 4 YENİ login = 9 (${fake.logins}), havuz 5`);
}


async function s9_200() {
  const N = Number((process.argv.find((a) => a.startsWith("--n=")) || "").split("=")[1] || 250);
  console.log(`\n[9] ${N} EŞZAMANLI istek → limit hiç aşılmaz (max 5), hepsi başarılı`);
  const clock = { t: 1e6 }, fake = makeFake(() => clock.t);
  let maxHavuz = 0;
  const origLogin = fake.login.bind(fake);
  fake.login = async () => { const r = await origLogin(); maxHavuz = Math.max(maxHavuz, pool.size()); return r; };
  const pool = createPool({ ...wire(fake, clock), limit: 5, min: 1, idleMs: 9e9, callTimeoutMs: 1000 });
  const t0 = Date.now();
  const r = await Promise.allSettled(Array.from({ length: N }, () => pool.run("svc", {})));
  const okN = r.filter((x) => x.status === "fulfilled").length;
  console.log(`   → ${okN}/${N} başarılı | ${Date.now() - t0}ms | toplam login: ${fake.logins} | max havuz: ${Math.max(maxHavuz, pool.size())}`);
  ok(okN === N, `${N}/${N} istek BAŞARILI`);
  ok(fake.logins === 5, `sadece 5 login açıldı — ${N} istek 5 oturumu paylaştı (${fake.logins})`);
  ok(pool.size() === 5 && fake.active.size === 5, `havuz 5, CANIAS 5 — limit hiç aşılmadı (${pool.size()}/${fake.active.size})`);
}


async function s10_idle_olum_recover() {
  console.log("\n[10] CANIAS min-1'i AFK ÖLDÜRÜR (keepAlive YOK) → sonraki istek re-login ile toparlar");
  const clock = { t: 1e6 }, fake = makeFake(() => clock.t);
  const TTL = 3000; // CANIAS 3 birim afk sonra öldürür (3 dk simülasyonu)
  const pool = createPool({ ...wire(fake, clock), limit: 5, min: 1, idleMs: 9e9, callTimeoutMs: 500 });
  await pool.run("svc", {});
  ok(pool.size() === 1 && fake.logins === 1, "min 1 sıcak oturum (1 login)");
  clock.t += TTL + 1; fake.idleSweep(TTL);              // afk → CANIAS öldürdü
  ok(fake.active.size === 0, "CANIAS sıcak oturumu idle-ÖLDÜRDÜ");
  const r = await pool.run("svc", {});                  // pool ölü sid'i kullanır → fail → re-login
  ok(r?.ok === true, "sonraki istek yine BAŞARILI (ölü tespit → re-login)");
  ok(fake.logins === 2 && pool.size() === 1, `re-login oldu (login 2), havuz 1 (${fake.logins})`);
}

async function s11_keepalive_korur() {
  console.log("\n[11] keepAlive (heartbeat) → min-1 HİÇ ölmez, re-login GEREKMEZ");
  const clock = { t: 1e6 }, fake = makeFake(() => clock.t);
  const TTL = 3000, HB = 2000; // heartbeat aralığı < ttl
  const pool = createPool({ ...wire(fake, clock), limit: 5, min: 1, idleMs: 9e9, callTimeoutMs: 500 });
  await pool.run("svc", {});
  ok(fake.logins === 1, "min 1 sıcak oturum (1 login)");
  for (let i = 0; i < 4; i++) {                          // uzun afk (8 birim) ama heartbeat'li
    clock.t += HB; await pool.keepAlive("ping", {}); fake.idleSweep(TTL);
  }
  ok(fake.active.size === 1, "8 birim afk'ya rağmen oturum CANLI (heartbeat korudu)");
  const r = await pool.run("svc", {});
  ok(r?.ok === true && fake.logins === 1, `re-login OLMADI, sıcak oturum kullanıldı (login ${fake.logins})`);
}

// -------------------- ÇALIŞTIR --------------------
console.log("========== HAVUZ DAYANIKLILIK TEST SÜİTİ ==========");
for (const s of [s1_yuk, s2_bosta, s3_son_oturum_dis_kapatma, s4_bir_oturum_reconcile, s5_yavas_yanit, s6_canias_coktu, s7_bizim_sistem_coktu, s8_reuse, s9_200, s10_idle_olum_recover, s11_keepalive_korur]) {
  try { await s(); } catch (e) { FAIL++; console.log(`   ✗ SENARYO PATLADI: ${e?.message || e}`); }
}
console.log(`\n========== SONUÇ: ${PASS} geçti, ${FAIL} kaldı ==========`);
process.exit(FAIL ? 1 : 0);
