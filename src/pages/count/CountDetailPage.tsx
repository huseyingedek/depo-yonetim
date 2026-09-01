import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ChevronLeft,
  Warehouse,
  MapPin,
  Package,
  Loader2,
  Trash2,
  Plus,
  Minus,
  Check,
} from "lucide-react";
import BarcodeScanner from "../../components/BarcodeScanner";
import ToastView, { useToast } from "../../components/Toast";
import { api } from "../../api/client";
import { sesBasarili, sesHata } from "../../sound";
import type { AdjustmentOrder, AdjustmentLine } from "../../types";

type ActiveCountItem = {
  lineId: string;
  material: string;
  name: string;
  barcode: string;
  quantity: number; // Kullanıcının o an girdiği / değiştirdiği miktar
  targetQty: number; // Hedef / Sistem miktarı
  unit: string; // Okutulan birim (KO, PK, AD vb.)
  skunit: string; // Stok birimi (AD)
  multiplier: number; // Birim çarpanı (örn: 1 KO = 24 AD)
  batchNum?: string;
  specialStock?: string;
  warehouse?: string;
  stockPlace?: string;
};

export default function CountDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const orderType = searchParams.get("type") || searchParams.get("docType") || "";
  const invDocNum = searchParams.get("invDocNum") || id || "";
  const warehouseParam = searchParams.get("warehouse") || searchParams.get("wh") || "";

  const [order, setOrder] = useState<AdjustmentOrder | null>(null);
  const [lines, setLines] = useState<AdjustmentLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [flashLineId, setFlashLineId] = useState<string | null>(null);
  const [activeItem, setActiveItem] = useState<ActiveCountItem | null>(null);

  const { toast, show } = useToast();
  const istendi = useRef(false);

  const loadAdjustmentDetail = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.getAdjustmentOrder({
        orderNum: invDocNum,
        orderType,
        invDocNum,
        invDocType: orderType,
        warehouse: warehouseParam,
      });

      if (data) {
        setOrder(data);
        if (data.lines && data.lines.length > 0) {
          setLines(data.lines);
        } else {
          // Servisten henüz satır dönmüyorsa veya boşsa mock / örnek sayım satırları
          setLines([
            {
              id: "1",
              material: "MLZ001",
              name: "A4 Fotokopi Kağıdı 80gr 500lü",
              barcode: "869001001",
              targetQty: 10,
              countedQty: 0,
              unit: "KO",
              skunit: "PK",
              multiplier: 5,
              stockPlace: data.stockPlace || "A-01-01",
              warehouse: data.warehouse || "01",
            },
            {
              id: "2",
              material: "MLZ002",
              name: "Tükenmez Kalem Mavi 50li Kutu",
              barcode: "869001002",
              targetQty: 50,
              countedQty: 0,
              unit: "AD",
              skunit: "AD",
              multiplier: 1,
              stockPlace: data.stockPlace || "A-01-02",
              warehouse: data.warehouse || "01",
            },
            {
              id: "3",
              material: "MLZ003",
              name: "Zımba Teli No:10 Paket",
              barcode: "869001003",
              targetQty: 24,
              countedQty: 24,
              unit: "PK",
              skunit: "AD",
              multiplier: 10,
              stockPlace: data.stockPlace || "A-01-03",
              warehouse: data.warehouse || "01",
            },
          ]);
        }
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [id, orderType]);

  useEffect(() => {
    if (istendi.current) return;
    istendi.current = true;
    loadAdjustmentDetail();
  }, [loadAdjustmentDetail]);

  const flash = (lineId: string) => {
    setFlashLineId(lineId);
    setTimeout(() => setFlashLineId(null), 600);
  };

  // Barkod Okutulduğunda (Sol Panel)
  const handleDetected = useCallback(
    async (code: string) => {
      const rawCode = code.trim();
      if (!rawCode) return;
      const sadelestir = (s: string) => s.trim().toLowerCase().replace(/^0+/, "");
      const hedef = sadelestir(rawCode);

      // 1. Önce mevcut listede barkod veya malzeme kodu ile eşleşen var mı bak:
      const matchedLine = lines.find(
        (l) =>
          (l.barcode && sadelestir(l.barcode) === hedef) ||
          sadelestir(l.material) === hedef
      );

      if (matchedLine) {
        sesBasarili();
        flash(matchedLine.id);
        const unit = (matchedLine.unit || "AD").toUpperCase();
        const skunit = (matchedLine.skunit || unit).toUpperCase();
        const mult = matchedLine.multiplier && matchedLine.multiplier > 0 ? matchedLine.multiplier : 1;

        setActiveItem({
          lineId: matchedLine.id,
          material: matchedLine.material,
          name: matchedLine.name,
          barcode: matchedLine.barcode || rawCode,
          quantity: matchedLine.countedQty > 0 ? matchedLine.countedQty : 1,
          targetQty: matchedLine.targetQty,
          unit,
          skunit,
          multiplier: mult,
          batchNum: matchedLine.batchNum,
          specialStock: matchedLine.specialStock,
          warehouse: matchedLine.warehouse || order?.warehouse,
          stockPlace: matchedLine.stockPlace || order?.stockPlace,
        });

        show({
          kind: "ok",
          text: `${matchedLine.material} seçildi. Miktar girip onaylayın.`,
        });
        return;
      }

      // 2. Listede yoksa CANIAS MZYReadBarcode ile genel sorgula:
      setBusy(true);
      try {
        const res = await api.readBarcode(
          rawCode,
          order?.warehouse || "01",
          order?.stockPlace || ""
        );

        if (res.ok && res.material) {
          sesBasarili();
          const unit = (res.unit || "AD").toUpperCase();
          const skunit = (res.skunit || unit).toUpperCase();
          const mult = res.multiplier && res.multiplier > 0 ? res.multiplier : 1;

          // Yeni kalem olarak aktif panele al
          const newLineId = `new-${Date.now()}`;
          setActiveItem({
            lineId: newLineId,
            material: res.material,
            name: res.name || res.material,
            barcode: rawCode,
            quantity: 1,
            targetQty: 0,
            unit,
            skunit,
            multiplier: mult,
            batchNum: res.lot,
            specialStock: res.specialStock,
            warehouse: order?.warehouse,
            stockPlace: order?.stockPlace,
          });

          show({
            kind: "ok",
            text: `${res.material} okundu. Miktar girip ekleyin.`,
          });
        } else {
          sesHata();
          show({
            kind: "error",
            text: res.message || `${rawCode} barkodu bulunamadı`,
          });
        }
      } catch (err: unknown) {
        sesHata();
        show({
          kind: "error",
          text: err instanceof Error ? err.message : "Barkod sorgulanamadı",
        });
      } finally {
        setBusy(false);
      }
    },
    [lines, order, show]
  );

  // Miktar Girişini Onaylama / Listeye Ekleme
  const handleCommitActiveItem = () => {
    if (!activeItem) return;
    const finalQty = Math.max(0, activeItem.quantity);

    setLines((prev) => {
      const idx = prev.findIndex((l) => l.id === activeItem.lineId || l.material === activeItem.material);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = {
          ...updated[idx],
          countedQty: finalQty,
          unit: activeItem.unit,
          skunit: activeItem.skunit,
          multiplier: activeItem.multiplier,
          batchNum: activeItem.batchNum || updated[idx].batchNum,
        };
        return updated;
      } else {
        // Yeni eklenen satır
        const newLine: AdjustmentLine = {
          id: activeItem.lineId,
          material: activeItem.material,
          name: activeItem.name,
          barcode: activeItem.barcode,
          targetQty: activeItem.targetQty,
          countedQty: finalQty,
          unit: activeItem.unit,
          skunit: activeItem.skunit,
          multiplier: activeItem.multiplier,
          batchNum: activeItem.batchNum,
          specialStock: activeItem.specialStock,
          warehouse: activeItem.warehouse,
          stockPlace: activeItem.stockPlace,
        };
        return [newLine, ...prev];
      }
    });

    sesBasarili();
    flash(activeItem.lineId);
    show({
      kind: "ok",
      text: `${activeItem.material} için ${finalQty} ${activeItem.unit} sayımı kaydedildi.`,
    });
    setActiveItem(null);
  };

  // Sağdaki kartlardan birine tıklandığında sol miktar paneline al
  const selectLineForCounting = (line: AdjustmentLine) => {
    const unit = (line.unit || "AD").toUpperCase();
    const skunit = (line.skunit || unit).toUpperCase();
    const mult = line.multiplier && line.multiplier > 0 ? line.multiplier : 1;

    setActiveItem({
      lineId: line.id,
      material: line.material,
      name: line.name,
      barcode: line.barcode || "",
      quantity: line.countedQty > 0 ? line.countedQty : 1,
      targetQty: line.targetQty,
      unit,
      skunit,
      multiplier: mult,
      batchNum: line.batchNum,
      specialStock: line.specialStock,
      warehouse: line.warehouse || order?.warehouse,
      stockPlace: line.stockPlace || order?.stockPlace,
    });
  };

  // ---------------------------------------------------------------------------
  // SAĞ TARAF SIRALAMA MANTIĞI:
  // 1. Üstte: Eksik (counted < target) veya Fazla (counted > target) olan kartlar.
  // 2. Altta: Tam olan (counted === target) kartlar.
  // ---------------------------------------------------------------------------
  const sortedLines = useMemo(() => {
    return [...lines].sort((a, b) => {
      const aIsComplete = a.targetQty > 0 && a.countedQty === a.targetQty;
      const bIsComplete = b.targetQty > 0 && b.countedQty === b.targetQty;

      // Tam olanlar en alta gitsin (tam olmayanlar üstte kalsın)
      if (!aIsComplete && bIsComplete) return -1;
      if (aIsComplete && !bIsComplete) return 1;

      // Kendi aralarında id sırası
      return a.id.localeCompare(b.id, undefined, { numeric: true });
    });
  }, [lines]);

  // Özet Sayılar
  const totalCountedLines = lines.filter((l) => l.targetQty > 0 && l.countedQty === l.targetQty).length;
  const isAllComplete = lines.length > 0 && totalCountedLines === lines.length;

  return (
    <div className="mx-auto max-w-6xl p-3 md:p-4 lg:p-8 short:h-[100dvh] short:max-w-none short:flex short:flex-col short:overflow-hidden short:p-2">
      {/* Üst Başlık ve Geri Dön Butonu */}
      <div className="mb-2.5 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => navigate("/count")}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-surface text-fg shadow-card transition hover:bg-elevated active:scale-95"
            title="Sayımlara Dön"
            aria-label="Geri"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[17px] font-black tracking-tight text-fg">
                {order?.invDocNum || order?.id || id}
              </span>
              {order?.docType && (
                <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[14px] font-bold text-slate-700">
                  {order.docType}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Depo & Raf ve İlerleme Rozeti */}
        <div className="flex items-center gap-2">
          {(order?.warehouse || order?.stockPlace) && (
            <div className="hidden sm:flex items-center gap-1.5 rounded-xl border border-line bg-surface px-2.5 py-1 text-[14px] font-bold text-slate-800 shadow-card">
              <Warehouse className="h-4 w-4 text-brand-600 shrink-0" />
              <span>{[order.warehouse, order.stockPlace].filter(Boolean).join(" / ")}</span>
            </div>
          )}
          <span
            className={`chip border px-2.5 py-1 text-[14px] font-bold ${
              isAllComplete
                ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                : "bg-brand-100 text-brand-800 border-brand-300"
            }`}
          >
            {totalCountedLines} / {lines.length} Tamamlandı
          </span>
        </div>
      </div>

      {/* Hata Bildirimi */}
      {error && (
        <div className="mb-2.5 flex items-center justify-between gap-3 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-2.5 text-[15px] font-medium text-rose-600 shrink-0">
          <span>{error}</span>
          <button
            type="button"
            onClick={loadAdjustmentDetail}
            className="shrink-0 font-bold underline"
          >
            Tekrar Dene
          </button>
        </div>
      )}

      {/* İki Sütunlu Grid Düzen (Sol Küçük, Sağ Geniş) */}
      <div className="grid min-w-0 gap-2.5 md:gap-3.5 md:grid-cols-[265px_minmax(0,1fr)] lg:grid-cols-[275px_minmax(0,1fr)] xl:grid-cols-[285px_minmax(0,1fr)] short:!flex short:min-h-0 short:flex-1 short:overflow-hidden short:gap-2.5">
        {/* =================================================================== */}
        {/* SOL KOLON: Sol üstte küçük, az yer kaplayan okutma ve miktar alanı */}
        {/* =================================================================== */}
        <div className="min-w-0 md:sticky md:top-2 md:self-start lg:sticky lg:top-2 xl:sticky xl:top-2 short:!static short:w-[265px] short:shrink-0 short:self-stretch short:overflow-y-auto">
          <div className="card p-1.5 sm:p-2 space-y-1.5">
            {/* Depo & Raf Bilgisi Başlık Kartı */}
            {(order?.warehouse || order?.stockPlace) && (
              <div className="flex items-center justify-between gap-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 px-2 py-1 text-[13px]">
                <span className="inline-flex min-w-0 items-center gap-1 font-bold text-emerald-800 dark:text-emerald-200">
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                  <span className="truncate">
                    Depo: <span className="font-mono">{order.warehouse}</span>
                    {order.stockPlace ? ` · Raf: ${order.stockPlace}` : ""}
                  </span>
                </span>
              </div>
            )}

            {/* Barkod Okuyucu (Küçük ve Kompakt) */}
            {!activeItem && (
              <div className="space-y-1">
                <span className="block text-[13.5px] font-bold text-fg">
                  Barkod Okut
                </span>
                <BarcodeScanner
                  onDetected={handleDetected}
                  placeholder="Barkod okut"
                  hideCardWrapper
                  compact
                />
                {busy && (
                  <p className="mt-1 flex items-center gap-1.5 text-[13px] font-semibold text-brand-600">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> CANIAS sorgulanıyor…
                  </p>
                )}
              </div>
            )}

            {/* Aktif Malzeme Miktar Paneli (Transfer Ekranıyla Birebir Kompakt Stepper) */}
            {activeItem && (
              <div className="space-y-1.5 pt-0.5 animate-fade-in">
                {/* Malzeme Başlığı & İptal */}
                <div className="flex items-center justify-between gap-1.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-bold text-fg">
                      {activeItem.name}
                    </p>
                    <div className="flex items-center gap-1.5 font-mono text-[12px] text-slate-500">
                      <span className="font-bold text-brand-600">{activeItem.material}</span>
                      {activeItem.barcode && <span>· {activeItem.barcode}</span>}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveItem(null)}
                    className="flex h-6 w-6 items-center justify-center rounded-lg border border-line bg-elevated/40 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"
                    title="İptal"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Birim Eşitliği (örn: 1 KO = 5 PK) */}
                {activeItem.multiplier > 1 || activeItem.unit !== activeItem.skunit ? (
                  <div className="rounded-md bg-amber-50 border border-amber-200/60 px-1.5 py-0.5 font-mono text-[12px] font-bold text-amber-800">
                    1 {activeItem.unit} = {activeItem.multiplier} {activeItem.skunit}
                  </div>
                ) : null}

                {/* Miktar Stepper Girişi */}
                <div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        setActiveItem((prev) =>
                          prev ? { ...prev, quantity: Math.max(0, prev.quantity - 1) } : null
                        )
                      }
                      className="flex h-8.5 w-8.5 items-center justify-center rounded-lg bg-elevated text-subtle hover:bg-line active:scale-95 transition shrink-0"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>

                    <div className="relative flex-1">
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={activeItem.quantity === 0 ? "" : activeItem.quantity}
                        placeholder="0"
                        onChange={(e) => {
                          const raw = e.target.value;
                          if (raw === "") {
                            setActiveItem((prev) => (prev ? { ...prev, quantity: 0 } : null));
                            return;
                          }
                          const val = parseFloat(raw);
                          setActiveItem((prev) =>
                            prev ? { ...prev, quantity: isNaN(val) ? 0 : Math.max(0, val) } : null
                          );
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleCommitActiveItem();
                          }
                        }}
                        className="field-input w-full text-center font-mono text-[15px] font-extrabold text-emerald-600 h-8.5 py-0.5"
                        autoFocus
                      />
                      <span className="absolute right-1.5 top-1/2 -translate-y-1/2 font-mono text-[12px] font-bold text-slate-500">
                        {activeItem.unit}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setActiveItem((prev) =>
                          prev ? { ...prev, quantity: prev.quantity + 1 } : null
                        )
                      }
                      className="flex h-8.5 w-8.5 items-center justify-center rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 active:scale-95 transition shadow-sm shrink-0"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* Hızlı Butonlar ve Ekle Butonu */}
                  <div className="grid grid-cols-4 gap-1 pt-1">
                    <button
                      type="button"
                      onClick={() =>
                        setActiveItem((prev) => (prev ? { ...prev, quantity: 0 } : null))
                      }
                      className="flex items-center justify-center rounded-lg border border-line bg-elevated/50 py-1.5 text-subtle hover:bg-rose-50 hover:text-rose-600 transition active:scale-95"
                      title="Sıfırla"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>

                    {[1, 5, 10].map((inc) => (
                      <button
                        key={inc}
                        type="button"
                        onClick={() =>
                          setActiveItem((prev) =>
                            prev ? { ...prev, quantity: prev.quantity + inc } : null
                          )
                        }
                        className="rounded-lg border border-line bg-elevated/80 py-1.5 font-mono text-[12px] font-black text-fg hover:bg-brand-600 hover:text-white transition active:scale-95"
                      >
                        +{inc}
                      </button>
                    ))}
                  </div>

                  {/* Ekle / Kaydet Butonu */}
                  <button
                    type="button"
                    onClick={handleCommitActiveItem}
                    className="mt-1.5 flex h-8.5 w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 text-[13px] font-extrabold text-white shadow-sm hover:bg-emerald-700 active:scale-95 transition"
                  >
                    <Check className="h-3.5 w-3.5" />
                    <span>Kaydet ({activeItem.quantity * activeItem.multiplier} {activeItem.skunit})</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* =================================================================== */}
        {/* SAĞ KOLON: Okutulacak Mallar (Aşağı doğru biriken kartlar)         */}
        {/* =================================================================== */}
        <div className="min-w-0 short:flex-1 short:overflow-y-auto short:pr-1 space-y-2">
          {/* Yükleniyor Durumu */}
          {loading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-20 animate-pulse rounded-2xl bg-elevated" />
              ))}
            </div>
          ) : sortedLines.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-surface/50 py-8 text-center text-subtle">
              <Package className="mb-2 h-7 w-7 text-slate-400" />
              <p className="text-[15px] font-bold text-fg">
                Sayılacak malzeme bulunamadı
              </p>
            </div>
          ) : (
            /* Okutulan ve Sayılacak Mallar Kart Listesi */
            <div className="space-y-2">
              {sortedLines.map((line) => {
                const counted = line.countedQty;
                const target = line.targetQty;
                const isMatched = target > 0 && counted === target;
                const isExcess = counted > target;

                // -----------------------------------------------------------
                // KURAL: Fazla olan KIRMIZI, Az olan SARI, Tam olan YEŞİL
                // -----------------------------------------------------------
                const colorClass = isExcess
                  ? "text-rose-600 bg-rose-50 border-rose-200"
                  : isMatched
                  ? "text-emerald-600 bg-emerald-50 border-emerald-200"
                  : "text-amber-600 bg-amber-50 border-amber-200";

                const isFlashing = flashLineId === line.id;
                const mult = line.multiplier && line.multiplier > 0 ? line.multiplier : 1;
                const unit = (line.unit || "AD").toUpperCase();
                const skunit = (line.skunit || unit).toUpperCase();
                const isDiffUnit = mult > 1 || unit !== skunit;
                const equation = `1 ${unit} = ${mult} ${skunit}`;

                return (
                  <button
                    key={line.id}
                    type="button"
                    onClick={() => selectLineForCounting(line)}
                    className={`w-full text-left rounded-2xl border p-2.5 sm:p-3 transition-all shadow-xs hover:border-emerald-500/40 active:scale-[0.99] ${
                      isFlashing
                        ? "border-brand-500 ring-2 ring-brand-300 bg-surface"
                        : isMatched
                        ? "border-emerald-500/60 bg-emerald-500/10"
                        : isExcess
                        ? "border-rose-500/60 bg-rose-500/10"
                        : "border-line bg-surface"
                    }`}
                  >
                    {/* Üst Satır: Malzeme Bilgileri & Doğrudan Metin Miktar Oranı */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px] font-bold text-fg">
                          {line.name}
                        </p>
                        <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[13px] flex-wrap">
                          {/* Ürün Kodu - Siyah */}
                          <span className="font-black text-fg">{line.material}</span>
                          {/* Lokasyon / Raf - Siyah */}
                          {line.stockPlace && (
                            <>
                              <span className="text-subtle">·</span>
                              <span className="inline-flex items-center gap-0.5 font-bold text-fg">
                                <MapPin className="h-3 w-3 text-subtle shrink-0" />
                                {line.stockPlace}
                              </span>
                            </>
                          )}
                          {/* Parti - Mor */}
                          {line.batchNum && (
                            <>
                              <span className="text-subtle">·</span>
                              <span className="inline-flex items-center gap-1 font-semibold text-violet-700 dark:text-violet-400">
                                Parti: {line.batchNum}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Sağ: Kaçta Kaçı Sayıldı (Ekstra kart yok, doğrudan beyaz kart üzerinde) */}
                      <div className="shrink-0 text-right font-mono self-center">
                        <span
                          className={`text-[16px] sm:text-[17px] font-black ${
                            isExcess
                              ? "text-rose-600 dark:text-rose-400"
                              : isMatched
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-amber-600 dark:text-amber-400"
                          }`}
                        >
                          {counted} / {target}
                        </span>
                        <span className="ml-1 text-[13px] font-black text-fg uppercase">
                          {skunit}
                        </span>
                      </div>
                    </div>

                    {/* Alt Satır: Birim Eşitliği (1 KO = 5 PK) ve Girilen Miktar */}
                    {isDiffUnit && (
                      <div className="mt-1.5 flex items-center justify-between border-t border-line/40 pt-1 font-mono text-[12px] sm:text-[13px]">
                        <span className="font-semibold text-subtle">{equation}</span>
                        <span className="font-bold text-fg">
                          Girilen: {counted} {unit}
                        </span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <ToastView toast={toast} />
    </div>
  );
}
