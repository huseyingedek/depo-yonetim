import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { PickOrder, PickRecord } from "../types";
import { api } from "../api/client";
import { evaluateScan, linePicked, gecerliKayit } from "./pickingLogic";
import type { ShelfContext, ScanOutcome } from "./pickingLogic";

// Tipleri tek kaynaktan (pickingLogic) dışa aktar — eski importlar kırılmasın.
export type { ShelfContext, ScanOutcome } from "./pickingLogic";
export { linePicked } from "./pickingLogic";

/* ─────────────────────────────────────────────────────────────────────────
 * SAVEPICK KİLİDİ (23.07 — kullanıcı isteği)
 * SavePick CANIAS'a gerçekten YAZAR (stok düşer). CreateContainer yanıtı
 * doğrulanana kadar KAPALI tutuyoruz. "Pakete Yerleştir" paleti oluşturur ama
 * SavePick'i çağırmaz; ekranda "kapalı" uyarısı çıkar.
 * AÇMAK İÇİN: aşağıyı true yap.
 * ───────────────────────────────────────────────────────────────────────── */
const SAVEPICK_AKTIF = true;

/**
 * Parti/tarihi CANIAS'ın beklediği YYYYAAGG biçimine çevirir (Bora: 20260908).
 * Depocu GG.AA.YYYY (08.09.2026) girse de servise YYYYAAGG gider; zaten
 * 8 haneli (YYYYAAGG) girilmişse olduğu gibi bırakır.
 */
function partiToBatchnum(s: string): string {
  const t = (s ?? "").trim();
  // GG.AA.YYYY / GG/AA/YYYY / GG-AA-YYYY  → YYYYAAGG
  let m = t.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$/);
  if (m) return `${m[3]}${m[2].padStart(2, "0")}${m[1].padStart(2, "0")}`;
  // YYYY-AA-GG / YYYY.AA.GG → YYYYAAGG
  m = t.match(/^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})$/);
  if (m) return `${m[1]}${m[2].padStart(2, "0")}${m[3].padStart(2, "0")}`;
  // Zaten YYYYAAGG (8 hane) ya da bilinmeyen biçim → olduğu gibi gönder.
  return t;
}

/**
 * Okutma kaydını kaleme ekler ya da aynı index'teki kaydı günceller (Bora'nın
 * birleştirme kuralı). `mergedInto` doluysa o kayıt `record` ile değiştirilir
 * (miktar zaten toplanmış gelir), yoksa yeni satır eklenir. Parti takipliyse
 * kaleme parti no'yu da yazar (gösterim ve "parti bekleniyor" kapısı için).
 */
function kayitUpsert(
  order: PickOrder,
  lineId: string,
  record: PickRecord,
  mergedInto?: string
): PickOrder {
  const lines = order.lines.map((l) => {
    if (l.id !== lineId) return l;
    const recs = l.records ?? [];
    const yeni = mergedInto
      ? recs.map((r) => (r.id === mergedInto ? record : r))
      : [...recs, record];
    const lot = record.lot && record.lot !== "*" ? record.lot : l.lot;
    return { ...l, records: yeni, lot };
  });
  return { ...order, lines };
}

/**
 * Taze çekilen emre, sayfa yenilenmeden önce yapılmış okutmaları geri harmanlar.
 * Okutmalar localStorage'da duruyor; emir servisten baz haliyle gelince
 * kalem eşleşmesine göre records geri takılıyor. Yoksa yenileyince kayıtlar
 * ekranda kaybolurdu (veri hâlâ localStorage'da ama order taze geldiği için).
 */
function mergeRecords(fresh: PickOrder, saklanan: PickOrder | null): PickOrder {
  if (!saklanan || saklanan.id !== fresh.id) return fresh;
  const kayitHaritasi = new Map(
    // Bayat/geçersiz kayıtları (partisiz "1") burada ELE — eski koddan kalıp
    // SavePick'e sızmasın, ekranda toplanmış gibi görünmesin.
    saklanan.lines.map((l) => [l.id, (l.records ?? []).filter(gecerliKayit)])
  );
  return {
    ...fresh,
    lines: fresh.lines.map((l) => {
      const kayitlar = kayitHaritasi.get(l.id);
      return kayitlar?.length ? { ...l, records: kayitlar } : l;
    }),
  };
}

interface PickingState {
  order: PickOrder | null;
  loading: boolean;
  completing: boolean;
  /** Raf bilgileri yükleniyor mu (öneri servisi kalem sayısı kadar çağrılıyor) */
  locationsLoading: boolean;
  /** Okutulan raf — ürün okuturken servise bu gönderilir */
  shelf: ShelfContext | null;
  /**
   * Parti takipli üründe (SPECIALSTOCK=1) ürün okundu, parti bekleniyor.
   * Parti okununca ikinci ReadBarcode bu barkod + adetle çağrılır.
   */
  pendingProduct: { lineId: string; barcode: string; adet: number } | null;

  loadOrder: (id: string, orderType?: string) => Promise<void>;
  clear: () => void;
  /**
   * Emirden çıkarken (geri tuşu) MZYClosePick ile kilidi açar ve emri temizler.
   * EnterPick emri kilitliyor; açılmazsa tekrar girişte "blokelendi" hatası olur.
   */
  leaveOrder: () => void;

  /** Raf barkodu okut — MZYReadBarcodeSP */
  scanShelf: (barcode: string) => Promise<{ ok: boolean; message: string }>;
  /** Rafı bırak (başka rafa geçmeden önce) */
  clearShelf: () => void;

  /**
   * Ürün barkodu okut — MZYReadBarcode.
   *
   * @param adet Bu barkoddan kaç tane alındı (çuval/koli sayısı). Varsayılan 1.
   *
   * Kayda giren miktar STOK BİRİMİNDE olur:
   *   barkod 25 KG'lık çuval (QUANTITY=25), depocu 2 çuval aldı (adet=2)
   *   → kayda 50 KG yazılır
   */
  scanProduct: (barcode: string, adet?: number) => Promise<ScanOutcome>;

  /** Kaydı sil — yanlış okutulmuşsa */
  removeRecord: (lineId: string, recordId: string) => void;
  /** Kayıt miktarını AZALT. Artırma yok: artırmak yeni okutma demektir. */
  decreaseRecord: (lineId: string, recordId: string, qty: number) => void;
  /**
   * Parti barkodu okutulunca kaleme ve kayıtlara parti yazılır.
   * Servise gitmez, doğrulama yapılmaz — okutulan değer olduğu gibi alınır.
   */
  setLot: (lineId: string, lot: string, expiry?: string) => void;
  /**
   * Parti okutulunca MZYReadBarcode ile DOĞRULAR: parti gerçekten o ürüne ait
   * mi ve o rafta stoğu var mı? Geçerliyse partiyi yazar, değilse hata döner.
   * Rastgele/yanlış parti girişini engeller.
   */
  scanLot: (lineId: string, lot: string) => Promise<{ ok: boolean; message: string }>;
  /**
   * Palet oluştur + toplananı kaydet. Palet numarası alınamazsa kayıt
   * yapılmaz ve ok:false döner — ekran hatayı gösterip geri döner.
   */
  complete: () => Promise<CompleteResult>;
}

export type CompleteResult =
  | { ok: true; containerId: string }
  | { ok: false; message: string };

export const usePickingStore = create<PickingState>()(
  persist(
    (set, get) => ({
  order: null,
  loading: false,
  completing: false,
  locationsLoading: false,
  shelf: null,
  pendingProduct: null,

  loadOrder: async (id: string, orderType = "") => {
    // Emre HER GİRİŞTE EnterPick çalışır (Bora: emir kullanıcıya atanır).
    // Ama kayıtları kaybetmeyiz: aynı emirse önceki order'ı saklarız, taze
    // emre records'ları harmanlarız. EnterPick BOŞ dönerse (idempotent değil,
    // ikinci çağrı boş dönebiliyor) önceki emri KORURUZ — uçmaz.
    const oncekiOrder = get().order?.id === id ? get().order : null;
    const oncekiShelf = get().order?.id === id ? get().shelf : null;
    // Yüklenirken önceki emri ekranda tut (boş ekran yanıp sönmesin).
    set({ loading: true, order: oncekiOrder, shelf: oncekiShelf });
    try {
      const taze = await api.getPickOrder(id, orderType);
      // Taze geldiyse records'ları harmanla; boş döndüyse öncekini koru.
      const order = taze ? mergeRecords(taze, oncekiOrder) : oncekiOrder;
      set({ order, loading: false });
      if (!order) return;

      // Raf bilgisi ayrı çekiliyor — kalem sayısı kadar istek çıkıyor,
      // kalem listesini bunun için bekletmeye gerek yok.
      // fillLocations ...line ile records'ları koruyor.
      set({ locationsLoading: true });
      try {
        const rafli = await api.fillLocations(order);
        // Bu sırada kullanıcı başka emre geçmiş olabilir; kontrol et
        if (get().order?.id === rafli.id) set({ order: rafli });
      } finally {
        set({ locationsLoading: false });
      }
    } catch {
      set({ order: null, loading: false, locationsLoading: false });
    }
  },

  clear: () => set({ order: null, shelf: null }),

  leaveOrder: () => {
    const order = get().order;
    if (order) {
      // Kilidi aç (MZYClosePick) — arka planda, dönüşü bekletmeye gerek yok.
      api.cancelPick(order.id, order.orderType ?? "").catch(() => {});
    }
    set({ order: null, shelf: null, pendingProduct: null });
  },

  scanShelf: async (barcode: string) => {
    try {
      const r = await api.readShelfBarcode(barcode.trim());
      if (!r.ok) return { ok: false, message: r.message || "Raf barkodu okunamadı" };
      // Barkod'u servisin döndürdüğü DEPO+STOK YERİ'nden kuruyoruz (parse yok);
      // kayıt eşleştirmesi bununla tutarlı olsun diye.
      set({
        shelf: {
          barcode: `${r.warehouse}$${r.stockPlace}`,
          warehouse: r.warehouse,
          stockPlace: r.stockPlace,
        },
      });
      return { ok: true, message: "" };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
  },

  clearShelf: () => set({ shelf: null }),

  scanProduct: async (barcode: string, adet = 1) => {
    const order = get().order;
    if (!order) return { kind: "error", message: "Emir yüklü değil" };
    const shelf = get().shelf;

    let sonuc;
    try {
      // Raf okutulmuşsa depo/stok yeri de gönderilir (Bora: "hafızadaki depo")
      /* PARTİ AYRI PARAMETRE DEĞİL — Bora'nın resmi spec'i (22.07):
         ReadBarcode parti/özel stoğu ayrı almıyor, barkodun içinden okuyor.
         Bu yüzden burada sadece okutulan barkodu + rafı + "kaç tane"yi
         gönderiyoruz. AVAILSTOCK o barkod için raftaki gerçek stoğu döner. */
      sonuc = await api.readBarcode(
        barcode.trim(),
        shelf?.warehouse ?? "",
        shelf?.stockPlace ?? "",
        Math.max(1, Math.floor(adet)) // ekranda girilen "kaç tane"
      );
    } catch (e) {
      return { kind: "error", message: e instanceof Error ? e.message : String(e) };
    }

    // Karar mantığı saf fonksiyonda (pickingLogic) — test edilebilir.
    const karar = evaluateScan({ order, shelf, scan: sonuc, barcode, adet });

    // Parti takipli (SPECIALSTOCK=1) → kayıt açma, parti barkodu bekle.
    // Ürün bağlamını sakla; parti okununca ikinci ReadBarcode bununla çağrılır.
    if (karar.outcome.kind === "needsBatch") {
      set({
        pendingProduct: {
          lineId: karar.outcome.lineId,
          barcode: barcode.trim(),
          adet: Math.max(1, Math.floor(adet)),
        },
      });
      return karar.outcome;
    }

    // Kabul edildiyse kaydı upsert et (aynı index varsa miktarı artır).
    if (karar.outcome.kind === "ok" && karar.record) {
      set({
        order: kayitUpsert(order, karar.outcome.lineId, karar.record, karar.mergedInto),
      });
    }
    return karar.outcome;
  },

  removeRecord: (lineId, recordId) => {
    const order = get().order;
    if (!order) return;
    const lines = order.lines.map((l) =>
      l.id === lineId
        ? { ...l, records: (l.records ?? []).filter((r) => r.id !== recordId) }
        : l
    );
    set({ order: { ...order, lines } });
  },

  decreaseRecord: (lineId, recordId, qty) => {
    const order = get().order;
    if (!order) return;
    const lines = order.lines.map((l) => {
      if (l.id !== lineId) return l;
      const records = (l.records ?? []).map((r) => {
        if (r.id !== recordId) return r;
        // Yalnızca azaltma: mevcut değerin üstüne çıkılamaz.
        // Alt sınır 1 — sıfırlamak kaydı anlamsız kılar, silmek gerekir.
        const yeni = Math.max(1, Math.min(r.qty, qty));
        return { ...r, qty: yeni };
      });
      return { ...l, records };
    });
    set({ order: { ...order, lines } });
  },

  setLot: (lineId: string, lot: string, expiry?: string) => {
    const order = get().order;
    if (!order) return;
    // Parti hem kaleme hem kayıtlara yazılır — servise satır satır
    // giderken her kayıtta parti bilgisi bulunsun diye.
    const lines = order.lines.map((l) =>
      l.id === lineId
        ? {
            ...l,
            lot,
            expiry,
            records: (l.records ?? []).map((r) => (r.lot ? r : { ...r, lot })),
          }
        : l
    );
    set({ order: { ...order, lines } });
  },

  scanLot: async (lineId, lot) => {
    const order = get().order;
    const shelf = get().shelf;
    const pending = get().pendingProduct;
    if (!order) return { ok: false, message: "Emir yüklü değil" };
    const line = order.lines.find((l) => l.id === lineId);
    if (!line) return { ok: false, message: "Kalem bulunamadı" };

    /* Bora: parti okununca, ürün barkodu + parti ile İKİNCİ ReadBarcode.
       Partisiz ilk okumada tüm partilerin toplam stoğu döner (yüksek); parti
       verilince o partinin GERÇEK stoğu döner (daha düşük). Miktar/adet ilk
       okumadan (pendingProduct) gelir. */
    const barkod = pending?.barcode || line.product.barcode || `${line.product.code}$*$`;
    const adet = pending?.adet ?? 1;
    // Parti → CANIAS biçimi YYYYAAGG (08.09.2026 → 20260908).
    const parti = partiToBatchnum(lot);
    let sonuc;
    try {
      sonuc = await api.readBarcode(
        barkod,
        shelf?.warehouse ?? "",
        shelf?.stockPlace ?? "",
        adet,
        parti // PSBATCHNUM — okutulan parti (YYYYAAGG)
      );
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }

    // Servis reddederse (geçersiz parti, 30 gün kuralı vb.) mesajını göster.
    if (!sonuc.ok) {
      return { ok: false, message: sonuc.message || "Parti okunamadı" };
    }
    if (sonuc.material && sonuc.material !== line.product.code) {
      return { ok: false, message: "Bu parti bu ürüne ait değil" };
    }

    // Parti ile kaydı oluştur/birleştir — "*" akışıyla aynı, batchDate=parti.
    const karar = evaluateScan({
      order,
      shelf,
      scan: sonuc,
      barcode: barkod,
      adet,
      batchDate: parti, // kayda YYYYAAGG olarak yazılsın
    });
    if (karar.outcome.kind !== "ok" || !karar.record) {
      const msg =
        "message" in karar.outcome ? karar.outcome.message : "Parti eklenemedi";
      return { ok: false, message: msg };
    }
    set({
      order: kayitUpsert(order, lineId, karar.record, karar.mergedInto),
      pendingProduct: null,
    });
    return { ok: true, message: "" };
  },

  complete: async () => {
    const order = get().order;
    if (!order) return { ok: false, message: "Emir yüklü değil" };
    // Hiç okutma yoksa palet bile oluşturma — önce ürün okutulmalı.
    const okutmaVar = order.lines.some((l) => (l.records ?? []).length > 0);
    if (!okutmaVar) {
      return { ok: false, message: "Önce ürün okutun — henüz toplanan yok." };
    }
    set({ completing: true });
    try {
      // 1) Palet oluştur — depo, EnterPick'ten gelen WAREHOUSETA (Bora)
      const hedefDepo = order.lines.find((l) => l.targetWarehouse)?.targetWarehouse ?? "";
      const kap = await api.placeInPackage(
        hedefDepo,
        "KONPAKET",
        order.id,
        order.orderType ?? ""
      );
      if (!kap.containerId) {
        return {
          ok: false,
          // CANIAS ne dediyse onu göster (ör. "Firma:01 Tesis:100 de envanter
          // hareketi yapacak yetkiniz bulunmamaktadır. / Konteyner Oluşturulamadı!")
          message: kap.message
            ? `Palet oluşturulamadı: ${kap.message}`
            : "Palet oluşturulamadı (MZYCreateContainer boş döndü). Toplama kaydedilmedi.",
        };
      }

      // 2) Toplananı kaydet — paletin deposu + numarasıyla birlikte.
      //    GEÇİCİ KİLİT: SavePick, CreateContainer yanıtı doğrulanana kadar
      //    KAPALI (kullanıcı isteği, 23.07). Açmak için SAVEPICK_AKTIF = true yap.
      if (!SAVEPICK_AKTIF) {
        return {
          ok: false,
          message:
            `Palet oluştu (${kap.containerId}). SavePick şu an KAPALI — ` +
            `CreateContainer yanıtı doğrulanıyor. Onay verilince açılacak, ` +
            `henüz CANIAS'a kayıt YAZILMADI.`,
        };
      }
      const kayit = await api.savePick(order, kap.containerWarehouse, kap.containerId);
      if (!kayit.ok) {
        return {
          ok: false,
          message:
            `Palet ${kap.containerId} oluştu ama toplama kaydedilemedi: ` +
            kayit.message,
        };
      }

      // Kayıt CANIAS'a yazıldı — yerel okutmaları temizle. Yoksa aynı emre
      // tekrar girince localStorage'daki eski kayıtlar yeniden sayılır (çift).
      set({
        order: { ...order, lines: order.lines.map((l) => ({ ...l, records: [] })) },
        shelf: null,
      });
      return { ok: true, containerId: kap.containerId };
    } catch (e) {
      return {
        ok: false,
        message: e instanceof Error ? e.message : String(e),
      };
    } finally {
      set({ completing: false });
    }
  },
}),
{
  name: "aktuel-picking", // localStorage anahtarı
  // Yalnızca okutma verisini sakla; loading/completing gibi geçici durumlar değil.
  partialize: (s) => ({ order: s.order, shelf: s.shelf }),
}));

// Yardımcılar (linePicked pickingLogic'ten import edilip yukarıda yeniden dışa aktarıldı)

export function orderProgress(order: PickOrder): number {
  const req = order.lines.reduce((s, l) => s + l.requestedQty, 0);
  const pick = order.lines.reduce((s, l) => s + linePicked(l), 0);
  return req === 0 ? 0 : Math.min(100, (pick / req) * 100);
}

export function orderTotals(order: PickOrder) {
  const requested = order.lines.reduce((s, l) => s + l.requestedQty, 0);
  const picked = order.lines.reduce((s, l) => s + linePicked(l), 0);
  return { requested, picked, missing: requested - picked, lineCount: order.lines.length };
}
