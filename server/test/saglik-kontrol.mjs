// -----------------------------------------------------------------------------
// SAĞLIK KONTROLÜ — hangi servis çalışıyor, hangisi eksik
// -----------------------------------------------------------------------------
// Her servisi bilinen parametrelerle çağırır ve tek satırlık durum verir.
// Sabah açılışında ya da "Bora bir şey değiştirdi mi" diye bakarken çalıştır.
//
// Çalıştırma:  node test/saglik-kontrol.mjs
// -----------------------------------------------------------------------------

import { CFG, cagir, kapat, baslik, kalin } from "./ortak.mjs";

const C = { PSCOMPANY: CFG.company, PSPLANT: CFG.plant };
const TARIH = { PDSTARTDATE: "01.01.1975", PDENDDATE: "01.01.2100" };

/**
 * Her satır: [servis, parametreler, beklenen tablo, kontrol fonksiyonu]
 * Kontrol fonksiyonu "" dönerse SORUN YOK, metin dönerse sorun anlatır.
 */
const KONTROLLER = [
  [
    "MZYListingPick",
    {
      ...C, PSWORKER: "bsenturk", PISTATUS: 0, PIISPICK: 1, ...TARIH,
      PIISDELETE: 0, PIISSTARTED: 1, PIORDER: 0,
    },
    "TBLPOLIST",
    (rows) => (rows.length ? "" : "emir dönmüyor"),
  ],
  [
    "MZYReadBarcodeSP",
    { ...C, PSBARCODE: "D3$C1" },
    "TBLWHSP",
    (rows) => {
      const r = rows[0];
      if (!r) return "yanıt yok";
      if (r.WAREHOUSE !== "D3" || r.STOCKPLACE !== "C1") return "raf çözülemiyor";
      if (!r.PLANT) return "PLANT boş dönüyor";
      return "";
    },
  ],
  [
    "MZYReadBarcodeSP (geçersiz raf)",
    { ...C, PSBARCODE: "ZZ$YY99" },
    "TBLWHSP",
    (rows) =>
      rows.length ? "geçersiz rafı kabul ediyor — doğrulama yok" : "",
    "MZYReadBarcodeSP",
  ],
  [
    "MZYReadBarcode",
    { ...C, PSWAREHOUSE: "D3", PSSTOCKPLACE: "C1", PSBATCHNUM: "*", PSBARCODE: "UD009$*$" },
    "WMSXMLTABLE",
    (rows) => {
      const r = rows.find((x) => x.MATERIAL);
      if (!r) return "barkod çözülemiyor";
      const sorunlar = [];
      if (r.STOCKPLACE === "PSSTOCKPLACE") sorunlar.push("STOCKPLACE=PSSTOCKPLACE");
      if (r.CCPLANT === "TXTCCPLANT") sorunlar.push("CCPLANT=TXTCCPLANT");
      if (!("AVAILSTOCK" in r)) sorunlar.push("AVAILSTOCK alanı yok");
      else if (Number(r.AVAILSTOCK) === 0) sorunlar.push("AVAILSTOCK=0");
      return sorunlar.join(", ");
    },
  ],
  [
    "MZYCreateContainer",
    { ...C, PSWAREHOUSE: "10", PSMATERIAL: "KONPAKET" },
    null,
    (_rows, r) => {
      const adlar = Object.keys(r.tablolar);
      const dolu = adlar.some((a) => r.tablolar[a].length && !/MESSAGE/i.test(a));
      return dolu ? "" : "palet numarası dönmüyor";
    },
  ],
  [
    "MZYSavePick",
    { ...C },
    null,
    (_rows, r) => {
      const adlar = Object.keys(r.tablolar);
      if (!adlar.length) return "servis yok";
      const dolu = adlar.some((a) => r.tablolar[a].length && !/MESSAGE/i.test(a));
      return dolu ? "" : "boş dönüyor (henüz yazılmadı)";
    },
  ],
];

baslik("SERVİS SAĞLIK KONTROLÜ");
console.log(`  firma ${CFG.company} · tesis ${CFG.plant} · ${CFG.appServer}\n`);

let sorunlu = 0;
for (const [etiket, params, tablo, kontrol, gercekAd] of KONTROLLER) {
  const servis = gercekAd ?? etiket;
  const r = await cagir(servis, params);
  const rows = tablo ? r.tablolar[tablo] ?? [] : [];
  const sorun = r.hata ? r.hata : kontrol(rows, r);

  const durum = sorun ? "✗" : "✓";
  console.log(`  ${durum} ${etiket.padEnd(34)} ${sorun || "sorun yok"}`);
  if (sorun) sorunlu++;
}

console.log("\n" + kalin());
console.log(
  sorunlu === 0
    ? "  Tüm servisler beklendiği gibi."
    : `  ${sorunlu} serviste sorun var — yukarıdaki satırlara bak.`
);
console.log(kalin());

await kapat();
