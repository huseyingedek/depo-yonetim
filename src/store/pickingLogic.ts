// -----------------------------------------------------------------------------
// TOPLAMA KARAR MANTIĞI — saf fonksiyonlar (api/zustand/localStorage YOK)
// -----------------------------------------------------------------------------
// Bora (23.07): "asıl iş ilk okutma ile paket gönder arasında." Burası tam o.
// Bu dosya AĞA ÇIKMAZ, STATE TUTMAZ — sadece girdi alıp karar döner. Böylece
// tek tek test edilebilir. Yan etkili işler (servis çağrısı, state yazma)
// pickingStore'da kalır; buradaki fonksiyonlar onların beynidir.
// -----------------------------------------------------------------------------

import type { PickOrder, PickLine, PickRecord, BarcodeResult } from "../types";

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
export function linePicked(line: PickLine): number {
  const onceki = line.pickedQty; // MOVEDQTY — servisten gelen baz
  const buOturum = (line.records ?? [])
    .filter(gecerliKayit)
    .reduce((s, r) => s + r.qty, 0);
  return onceki + buOturum;
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
  const miktar = scan.quantity > 0 ? scan.quantity : kacTane;
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
