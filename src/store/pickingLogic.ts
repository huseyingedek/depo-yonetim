// -----------------------------------------------------------------------------
// TOPLAMA KARAR MANTIĞI — saf fonksiyonlar (api/zustand/localStorage YOK)
// -----------------------------------------------------------------------------
// Bora (23.07): "asıl iş ilk okutma ile paket gönder arasında." Burası tam o.
// Bu dosya AĞA ÇIKMAZ, STATE TUTMAZ — sadece girdi alıp karar döner. Böylece
// tek tek test edilebilir. Yan etkili işler (servis çağrısı, state yazma)
// pickingStore'da kalır; buradaki fonksiyonlar onların beynidir.
// -----------------------------------------------------------------------------

import type { PickOrder, PickLine, PickRecord, BarcodeResult, RestoredPick } from "../types";

/** Depocunun o an önünde durduğu raf. */
export interface ShelfContext {
  /** Okutulan ham barkod — "D3$C1" */
  barcode: string;
  warehouse: string;
  stockPlace: string;
}

/** Ürün okutma sonucu — ekran buna göre tepki verir. */
export type ScanOutcome =
  | { kind: "ok"; lineId: string; material: string; name: string }
  | { kind: "notInOrder"; material: string; name: string }
  | { kind: "alreadyDone"; lineId: string }
  /** SPECIALSTOCK=1 → parti takipli. Kayıt açılmaz, parti barkodu beklenir. */
  | { kind: "needsBatch"; lineId: string; material: string; name: string }
  /** İstenen miktarı aşıyor — KAYIT AÇILMAZ. `enFazla` = kaç tane okutulabilir */
  | { kind: "exceedsOrder"; lineId: string; message: string; enFazla: number }
  /** Okutulan rafta bu kadar stok yok — KAYIT AÇILMAZ */
  | { kind: "noStock"; lineId: string; message: string }
  | { kind: "error"; message: string };

/**
 * Kayıt geçerli mi? Bora (23.07): SPECIALSTOCK=1 ise parti "*"/boş OLAMAZ —
 * parti takipli üründe parti okutulmamışsa o kayıt YOK sayılır (ne gösterilir
 * ne SavePick'e gider). Eski koddan kalan partisiz "1" kayıtlarını da eler.
 */
export function gecerliKayit(r: PickRecord): boolean {
  return !(r.specialStock === "1" && (!r.lot || r.lot === "*"));
}

/**
 * Kalemin toplanmış miktarı.
 *
 * Bora'nın formülü (22.07): kalan = MOVEQTY − MOVEDQTY − okutulan
 * Yani toplanan = MOVEDQTY (önceki oturumda toplanmış, servisten gelen)
 *               + bu oturumda okutulan kayıtların toplamı.
 * İkisi AYRI kaynak; toplanmaları gerekir. Geçersiz (partisiz "1") kayıtlar
 * sayılmaz.
 */
/**
 * Miktar yuvarlama — Kg/ondalıklı miktarlarda kayan-nokta artığını temizler.
 * Ör. 16.39552268322588 → 16.396. Tam sayılar aynen kalır (500 → 500).
 * Hem gösterimde hem toplamada kullanılır ki ekranda 14 haneli çöp çıkmasın.
 */
export const qtyRound = (n: number): number =>
  Math.round((Number(n) + Number.EPSILON) * 1000) / 1000;

/**
 * Stok birimindeki miktarı SİPARİŞ birimine çevirir: stok / CFACTOR.
 * CFACTOR yok / 0 / 1 ise çevrim yapılmaz (miktar aynen döner).
 * Ör. 10 adet, cfactor 10 → 1 koli. Ondalıklar qtyRound ile temizlenir.
 */
export function toOrderQty(stockQty: number, cfactor?: number): number {
  const f = cfactor && cfactor > 0 ? cfactor : 1;
  return qtyRound(stockQty / f);
}

export function linePicked(line: PickLine): number {
  const onceki = line.pickedQty; // MOVEDQTY — servisten gelen baz
  const buOturum = (line.records ?? [])
    .filter(gecerliKayit)
    .reduce((s, r) => s + r.qty, 0);
  return qtyRound(onceki + buOturum);
}

export interface ScanInput {
  order: PickOrder;
  shelf: ShelfContext | null;
  /** api.readBarcode sonucu */
  scan: BarcodeResult;
  /** okutulan ham barkod */
  barcode: string;
  /** ekranda girilen "kaç tane" */
  adet: number;
  /**
   * Parti takipli üründe (SPECIALSTOCK=1) okutulan parti/tarih (YYYYAAGG).
   * Verilmezse ve ürün parti takipliyse "needsBatch" döner (parti beklenir).
   * "*" ürünlerde kullanılmaz.
   */
  batchDate?: string;
  /** kayıt kimliği üretici — testte sabitlenebilir */
  makeId?: (i: number) => string;
  /** zaman damgası — testte sabitlenebilir */
  now?: () => number;
}

export interface ScanDecision {
  outcome: ScanOutcome;
  /**
   * Kabulse upsert edilecek kayıt. Aynı index (depo+stok yeri+özel stok+parti)
   * varsa `mergedInto` o kaydın id'sidir ve `record.qty` TOPLAM miktardır;
   * yoksa mergedInto boştur ve yeni satır eklenir.
   */
  record?: PickRecord;
  mergedInto?: string;
}

/**
 * Bir ürün okutmasını değerlendirir. Ağa çıkmaz — servis sonucu (scan) dışarıdan
 * verilir. Karar + (kabulse) üretilecek kaydı döner. Kayıt üretimi ve state
 * yazımı çağırana bırakılır.
 */
export function evaluateScan(input: ScanInput): ScanDecision {
  const { order, shelf, scan, barcode, adet, batchDate } = input;
  const makeId = input.makeId ?? (() =>
    `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
  const now = input.now ?? (() => Date.now());

  // Servis barkodu tanımadıysa
  if (!scan.ok) {
    return { outcome: { kind: "error", message: scan.message || "Barkod tanınmadı" } };
  }

  /* MİKTAR — servisten HAZIR geliyor, çarpma YAPILMAZ (QUANTITY = katsayı×adet).
     Kalem seçiminden ÖNCE hesaplıyoruz; hangi kalemin yeteceğini bilmek için. */
  const kacTane = Math.max(1, Math.floor(adet));
  // Miktarı kaynakta yuvarla — Kg/ondalıklı barkodlarda QUANTITY 15 haneli kayan
  // nokta çöpü dönebiliyor (0.791045366451766). Yuvarlanmış değer hem ekranda
  // (Okutulanlar) hem CANIAS'a giden READQTY'de temiz olur.
  const miktar = qtyRound(scan.quantity > 0 ? scan.quantity : kacTane);
  const barkodBirim = kacTane > 0 ? miktar / kacTane : miktar;

  /* KALEM SEÇİMİ — Bora (16:13-16:14): aynı MALZEMEDEN birden çok kalem
     (farklı ITEMNO) olabilir. Eşleştirmeyi malzemeyle yapıyoruz ama doğru
     KALEMİ seçmeliyiz: açık (tamamlanmamış) ve YETERLİ KALANI olan. Onun
     itemno'su kayda gider. Yeterli kalanı olan yoksa en çok kalanı olanı al
     (miktar kontrolü aşağıda exceedsOrder verir). */
  const adaylar = order.lines.filter((l) => l.product.code === scan.material);
  if (!adaylar.length) {
    return { outcome: { kind: "notInOrder", material: scan.material, name: scan.name } };
  }
  const acikKalemler = adaylar.filter((l) => linePicked(l) < l.requestedQty);
  if (!acikKalemler.length) {
    return { outcome: { kind: "alreadyDone", lineId: adaylar[0].id } };
  }
  const line =
    acikKalemler.find((l) => l.requestedQty - linePicked(l) >= miktar) ??
    acikKalemler.reduce((best, l) =>
      l.requestedQty - linePicked(l) > best.requestedQty - linePicked(best) ? l : best
    );

  const birim = scan.unit || line.product.unit;

  // ÖZEL STOK — Bora: ReadBarcode'un SPECIALSTOCK'una bak. "1" ise parti takipli.
  const ozelStok = scan.specialStock || (line.lotTracked ? "1" : "*");

  // PARTİ TAKİPLİ ve henüz parti okunmadı → kayıt AÇMA, parti barkodunu iste.
  // (Parti okunca ikinci ReadBarcode gerçek parti stoğuyla tekrar buraya gelir.)
  if (ozelStok === "1" && !batchDate) {
    // Ama önce: partisiz ilk okumada AVAILSTOCK tüm partilerin toplamıdır.
    // 0 ise bu rafta bu üründen HİÇ stok yok (çoğu zaman yanlış raf). Parti
    // sormak anlamsız — depocuyu erkenden uyar.
    if (shelf && scan.availStock <= 0) {
      return {
        outcome: {
          kind: "noStock",
          lineId: line.id,
          message: "Bu rafta bu üründen stok yok — doğru rafta mısınız?",
        },
      };
    }
    return {
      outcome: { kind: "needsBatch", lineId: line.id, material: scan.material, name: scan.name },
    };
  }

  // Parti no: "1" ise okutulan tarih (YYYYAAGG), "*" ise "*".
  const parti = ozelStok === "1" ? batchDate ?? "*" : "*";

  /* KONTROL 1 — sipariş miktarı aşılıyor mu? (MOVEQTY − MOVEDQTY − okutulan) */
  const kalan = line.requestedQty - linePicked(line);
  if (miktar > kalan) {
    return {
      outcome: {
        kind: "exceedsOrder",
        lineId: line.id,
        enFazla: Math.floor(kalan / barkodBirim),
        message: "Sipariş miktarından fazla okutamazsınız",
      },
    };
  }

  /* BİRLEŞTİRME — Bora'nın index kuralı (tekrarlayamaz):
     Aynı depo + stok yeri + özel stok + parti varsa YENİ SATIR açma, miktarı
     artır. (Firma/tesis/belge/kalem/malzeme kalem+emir başına sabit.)
     Diğer index alanları: company, plant, ordertype, ordernum, itemno,
     warehouse, stockplace, specialstock, material, batchnum. */
  const wh = shelf?.warehouse ?? "";
  const sp = shelf?.stockPlace ?? "";
  const mevcut = (line.records ?? []).find(
    (r) =>
      r.warehouse === wh &&
      r.stockPlace === sp &&
      r.specialStock === ozelStok &&
      (r.lot ?? "*") === parti
  );
  const yeniToplam = (mevcut?.qty ?? 0) + miktar;

  /* KONTROL 2 — AVAILSTOCK. Birleşmiş satırın TOPLAMI availstock'u geçemez
     (Bora: "artırılan miktarın availstock'u geçmesine izin verme"). */
  if (shelf && (scan.availStock <= 0 || yeniToplam > scan.availStock)) {
    return {
      outcome: {
        kind: "noStock",
        lineId: line.id,
        message: "Stokta okutulan miktara kadar ürün bulunmamaktadır",
      },
    };
  }

  const record: PickRecord = {
    id: mevcut?.id ?? makeId(0),
    material: scan.material,
    warehouse: wh,
    stockPlace: sp,
    specialStock: ozelStok,
    lot: parti,
    qty: yeniToplam,
    unit: birim,
    docType: order.orderType ?? "",
    // docNum = ORDERNUM (belge numarası).
    docNum: order.id,
    itemNo: line.id,
    barcode: barcode.trim(),
    at: now(),
  };

  return {
    outcome: { kind: "ok", lineId: line.id, material: scan.material, name: scan.name },
    record,
    mergedInto: mevcut?.id,
  };
}

/**
 * <input type="date"> değeri (YYYY-MM-DD) → parti barkodu biçimi YYYYAAGG.
 * Yalnızca tarih-input biçimini kabul eder; geçersizse boş döner.
 * (Elle yazılan serbest tarihler pickingStore.partiToBatchnum ile çözülür.)
 */
export function isoDateToBatch(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((iso ?? "").trim());
  return m ? `${m[1]}${m[2]}${m[3]}` : "";
}

/**
 * KISMİ SİPARİŞ GERİ YÜKLEME — raf okutmada dönen "önceden konteynıra toplanmış"
 * kalemleri, tek tek okutulmuş gibi kayda çevirir (saf, idempotent).
 *
 * Kural (Hüseyin): liste yalnızca İÇİNDE BULUNULAN siparişe aitse işlenir.
 * Kalemler CANIAS'ta zaten kayıtlı (bir konteynırda); ekranda "toplanan" olarak
 * görünsün ve "paketle" deyince yeni konteynıra taşınsın diye normal kayıt gibi
 * eklenir. Listedeki bilgi (malzeme/parti/miktar/raf) yeterli — readBarcode'a
 * gidilmez.
 *
 * IDEMPOTENT: Aynı index'te (kalem + depo + stok yeri + özel stok + parti) kayıt
 * zaten varsa TEKRAR EKLENMEZ — raf iki kez okutulsa ya da kayıtlar
 * localStorage'dan geri gelse bile miktar şişmez.
 *
 * Emirde olmayan kalem (itemNo/malzeme eşleşmeyen) atlanır.
 */
export interface RestoreResult {
  order: PickOrder;
  /** Kontrol hataları — HEPSİ toplanır, kullanıcıya birlikte gösterilir. */
  errors: string[];
}

export function applyRestoredPicks(
  order: PickOrder,
  restored: RestoredPick[],
  makeId: (i: number) => string = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  now: () => number = () => Date.now()
): RestoreResult {
  const errors: string[] = [];
  // SİPARİŞ EŞLEŞTİRME KONTROLÜ KAPALI (Hüseyin: "kontrol yapma, okundu diye
  // yerleştir otomatik"). Gelen MATLIST'in tamamı, bulunulan emre uygulanır;
  // hangi siparişe ait olduğuna BAKILMAZ. (Madde başta "aynı sipariş ise"
  // diyordu; talep üzerine devre dışı.) Kalem/fazla kontrolleri aşağıda kalıyor.
  const bana = restored;
  if (!bana.length) return { order, errors };

  let lines = order.lines;
  let degisti = false;
  let sayac = 0;

  for (const p of bana) {
    // Kalem: önce ITEMNO ile, yoksa malzeme kodu ile eşleştir.
    let idx = lines.findIndex((l) => l.id === p.itemNo);
    if (idx < 0) idx = lines.findIndex((l) => l.product.code === p.material);
    if (idx < 0) {
      // KONTROL: emirde olmayan ürün — sessizce atlamıyoruz, hata topluyoruz.
      errors.push(`${p.material}: bu emirde yok — atlandı`);
      continue;
    }

    const line = lines[idx];
    const parti = p.specialStock === "1" ? p.lot ?? "*" : "*";

    // MATLIST MANTIĞI: her okutmada palet miktarı EKLENİR ve BİRİKİR
    // (2/6 → 4/6 → 6/6). "Zaten okundu" engeli YOK. Sadece sipariş miktarını
    // aşan kısım eklenmez → "fazla, geri yerine koyunuz" mesajı verilir.
    const mevcut = linePicked(line);
    const kalan = qtyRound(line.requestedQty - mevcut); // daha ne kadar gerekiyor
    const eklenecek = kalan > 0 ? Math.min(p.qty, kalan) : 0;
    const fazla = qtyRound(p.qty - eklenecek);

    if (fazla > 0) {
      // Kod + ürün adı (ad çok uzun olabilir → 20 karakterde kısalt, "…" ekle).
      const ad = line.product.name ? line.product.name.trim() : "";
      const kisaAd = ad.length > 20 ? ad.slice(0, 20).trim() + "…" : ad;
      const etiket = [line.product.code || p.material, kisaAd].filter(Boolean).join(" ");
      errors.push(
        `Diğer paletteki ${etiket} malzemesi ${fazla} ${line.product.unit} fazla — geri yerine koyunuz`
      );
    }
    if (eklenecek <= 0) continue; // tamamı fazla — eklenecek bir şey yok

    // BİRLEŞTİRME (elle okutmadaki kural): aynı malzeme + depo + raf + özel stok
    // + parti varsa YENİ SATIR AÇMA, mevcut kaydın miktarını artır. Böylece
    // "Okutulanlar"da aynı raf/belge/birim için tek satır kalır.
    const eslesen = (line.records ?? []).find(
      (r) =>
        r.material === p.material &&
        r.warehouse === p.warehouse &&
        r.stockPlace === p.stockPlace &&
        r.specialStock === p.specialStock &&
        (r.lot ?? "*") === parti
    );
    const record: PickRecord = {
      id: eslesen?.id ?? makeId(sayac++),
      material: p.material,
      warehouse: p.warehouse,
      stockPlace: p.stockPlace,
      specialStock: p.specialStock,
      lot: parti,
      qty: qtyRound((eslesen?.qty ?? 0) + eklenecek),
      unit: p.unit || line.product.unit,
      docType: order.orderType ?? "",
      docNum: order.id,
      itemNo: line.id,
      barcode: "", // otomatik geri yükleme — elle okutulan ham barkod yok
      at: now(),
    };
    lines = lines.map((l, i) =>
      i === idx
        ? {
            ...l,
            records: eslesen
              ? (l.records ?? []).map((r) => (r.id === eslesen.id ? record : r))
              : [...(l.records ?? []), record],
            lot: parti !== "*" ? parti : l.lot,
          }
        : l
    );
    degisti = true;
  }

  return { order: degisti ? { ...order, lines } : order, errors };
}

/**
 * ÖNCELİK KİLİDİ — bir emre girmeden önce çalışan engel kontrolü.
 *
 * Kural (Hüseyin): PRIORITY 0–9; küçük olan daha ÖNCELİKLİ. Personel öncelik
 * sırasına uymak zorunda. Seçilen emrin önceliğinden KÜÇÜK (daha öncelikli) ve
 * HİÇ BAŞLANMAMIŞ (status "open" = Yeni) bir emir varsa, giriş engellenir;
 * önce o emir(ler) toplanmalı.
 *
 * Sayılmayanlar:
 *   • Kısmen toplanmış (status "partial") emirler — kullanıcı kararı: dikkate alma.
 *   • Kapanmış (status "closed") emirler — zaten toplanmış.
 *   • Önceliksiz emirler (priority undefined) — en düşük öncelik, engellemez.
 *
 * Seçilen emrin önceliği yoksa (undefined) eşik = +∞ sayılır: 0–9 önceliğe
 * sahip tüm YENİ emirler ondan önce gelir (önceliksiz en sona toplanır).
 *
 * Dönen liste önceliğe göre artan sıralı — [0]. eleman en öncelikli engel.
 * Ağa çıkmaz, state tutmaz — girdi alır, karar döner (test edilebilir).
 */
export function blockingHigherPriorityOrders(
  selected: PickOrder,
  all: PickOrder[]
): PickOrder[] {
  const esik = selected.priority ?? Number.POSITIVE_INFINITY;
  return all
    .filter(
      (o) =>
        o.id !== selected.id &&
        o.priority !== undefined &&
        o.priority < esik &&
        (o.status ?? "open") === "open" // yalnızca hiç başlanmamış (Yeni)
    )
    .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
}
