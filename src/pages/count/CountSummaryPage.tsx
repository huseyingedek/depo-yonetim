import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, Warehouse, Package } from "lucide-react";
import ToastView, { useToast } from "../../components/Toast";
import { api } from "../../api/client";
import type { AdjustmentOrder, AdjustmentLine } from "../../types";

export default function CountSummaryPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams<{ id: string }>();
  const { toast, show } = useToast();

  const state = location.state as
    | {
        order?: AdjustmentOrder;
        lines?: AdjustmentLine[];
        warehouse?: string;
        orderType?: string;
        invDocNum?: string;
      }
    | undefined;

  const [order, setOrder] = useState<AdjustmentOrder | null>(state?.order ?? null);
  const [lines, setLines] = useState<AdjustmentLine[]>(state?.lines ?? []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const docNum = order?.invDocNum || order?.id || id || state?.invDocNum || "";
  const docType = order?.docType || state?.orderType || "";
  const warehouse =
    order?.warehouse ||
    state?.warehouse ||
    (lines.length > 0 && lines[0].warehouse ? lines[0].warehouse : "");

  // Eğer sayfaya doğrudan linkle / refresh ile girilmişse ve lines state'te yoksa API'den çek
  useEffect(() => {
    if (lines.length > 0 || !id) return;
    setLoading(true);
    setError(null);
    api
      .getAdjustmentOrder({
        orderNum: id,
        orderType: state?.orderType,
        invDocNum: state?.invDocNum || id,
        invDocType: state?.orderType,
        warehouse: state?.warehouse,
      })
      .then((res) => {
        if (res) {
          setOrder(res);
          if (res.lines && res.lines.length > 0) setLines(res.lines);
        }
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        setLoading(false);
      });
  }, [id, lines.length, state?.invDocNum, state?.orderType, state?.warehouse]);

  // 1. MAVİ: Plana Göre Olmayan / Beklenmeyen Kalemler (targetQty <= 0 && countedQty > 0)
  const unexpectedLines = useMemo(
    () => lines.filter((l) => l.targetQty <= 0 && l.countedQty > 0),
    [lines]
  );

  // 2. KIRMIZI: Fazla Sayılan Kalemler (targetQty > 0 && countedQty > targetQty)
  const excessLines = useMemo(
    () => lines.filter((l) => l.targetQty > 0 && l.countedQty > l.targetQty),
    [lines]
  );

  // 3. SARI / AMBER: Eksik Sayılan Kalemler (targetQty > 0 && countedQty < targetQty)
  const partialLines = useMemo(
    () => lines.filter((l) => l.targetQty > 0 && l.countedQty < l.targetQty),
    [lines]
  );

  // 4. YEŞİL: Tam Eşleşen / Tamamlanan Kalemler (targetQty > 0 && countedQty === targetQty)
  const matchedLines = useMemo(
    () => lines.filter((l) => l.targetQty > 0 && l.countedQty === l.targetQty),
    [lines]
  );

  // Hedefli toplam kalem sayısı
  const targetLinesCount = useMemo(
    () => lines.filter((l) => l.targetQty > 0).length,
    [lines]
  );

  // Sayım satırlarını sessionStorage'a senkronize et
  useEffect(() => {
    if (!id || lines.length === 0) return;
    try {
      sessionStorage.setItem(`count_session_${id}`, JSON.stringify({ order, lines }));
    } catch {}
  }, [id, order, lines]);

  const handleBack = () => {
    navigate(`/count/${id}`, {
      state: {
        order,
        lines,
        warehouse,
        orderType: docType,
        invDocNum: docNum,
      },
    });
  };

  // Sağ üstteki "Bitir" butonuna basılınca çalışacak handler
  const handleFinish = () => {
    show({
      kind: "ok",
      text: "Sayım tamamlandı. CANIAS onay servisi sonraki adımda bağlanacaktır.",
    });
  };

  // Malzeme Kartı (CountDetailPage ile 1:1 birebir aynı tasarım)
  const renderItemCard = (
    line: AdjustmentLine,
    qtyColorClass: string
  ) => {
    const counted = line.countedQty;
    const target = line.targetQty;
    const mult = line.multiplier && line.multiplier > 0 ? line.multiplier : 1;
    const unit = (line.unit || "AD").toUpperCase();
    const skunit = (line.skunit || unit).toUpperCase();
    const isDiffUnit = mult > 1 || unit !== skunit;
    const countedInUnit =
      mult > 1 ? Math.round((counted / mult) * 100) / 100 : counted;
    const targetInUnit =
      mult > 1 ? Math.round((target / mult) * 100) / 100 : target;

    const wh = line.warehouse || warehouse || "";
    const sp = line.stockPlace || "";
    let locationStr = "";
    if (wh && sp) {
      locationStr = sp.toUpperCase().startsWith(wh.toUpperCase())
        ? sp
        : `${wh}${sp}`;
    } else {
      locationStr = sp || wh;
    }
    locationStr = locationStr.replace(/\$/g, "");

    return (
      <div
        key={line.id}
        className="w-full text-left rounded-2xl border border-line bg-surface p-2.5 sm:p-3 transition-all shadow-xs"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-bold text-fg">{line.name}</p>
            <div className="mt-0.5 flex items-center gap-2.5 font-mono text-[13px] flex-wrap text-slate-600 dark:text-slate-300">
              <span className="font-bold text-slate-700 dark:text-slate-200">
                {line.material}
              </span>
              {locationStr && (
                <span className="inline-flex items-center gap-0.5 font-semibold text-slate-600 dark:text-slate-400">
                  <Warehouse className="h-3 w-3 shrink-0 text-slate-500" />
                  {locationStr}
                </span>
              )}
              {line.batchNum && (
                <span className="inline-flex shrink-0 items-center rounded bg-violet-100 dark:bg-violet-950/60 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-violet-700 dark:text-violet-300">
                  Parti: {line.batchNum}
                </span>
              )}
              {isDiffUnit && (
                <span className="font-semibold text-slate-500 dark:text-slate-400">
                  1 {unit} = {mult} {skunit}
                </span>
              )}
            </div>
          </div>
          <div className="shrink-0 text-right font-mono flex flex-col items-end justify-center pr-[17px] leading-tight">
            {/* Üst satır: Stok birimi cinsinden çevrilmiş miktar (örn: 24 / 24 KT) */}
            <div className={`${qtyColorClass} leading-tight`}>
              <span className="text-[15px] sm:text-[16px] font-black">
                {target > 0 ? `${counted} / ${target}` : counted}
              </span>
              <span className="ml-1 text-[14px] font-black uppercase">{skunit}</span>
            </div>
            {/* Alt satır: Okutulan barkod birimi cinsinden miktar (örn: 1 / 1 KO) */}
            {isDiffUnit && (
              <div className="text-fg leading-tight -mt-0.5">
                <span className="text-[15px] sm:text-[16px] font-black">
                  {target > 0 ? `${countedInUnit} / ${targetInUnit}` : countedInUnit}
                </span>
                <span className="ml-1 text-[14px] font-black uppercase">{unit}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-6xl p-2.5 sm:p-4 lg:p-6 short:h-[100dvh] short:max-w-none short:flex short:flex-col short:overflow-hidden short:p-2">
      {/* ÜST BAŞLIK */}
      <div className="mb-2 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleBack}
            className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl border border-line bg-surface text-fg shadow-card transition hover:bg-elevated active:scale-95 shrink-0"
            title="Geri Dön"
          >
            <ChevronLeft className="h-4 w-4 sm:h-5 sm:w-5" />
          </button>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[16px] sm:text-[17px] font-black tracking-tight text-fg">
              {docNum || "Sayım Özeti"}
            </span>
            {docType && (
              <span className="rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 font-mono text-[13px] font-bold text-slate-700 dark:text-slate-300">
                {docType}
              </span>
            )}
            {warehouse && (
              <div className="flex items-center gap-1 rounded-lg border border-line bg-surface px-2 py-0.5 text-xs font-bold text-slate-800 dark:text-slate-200 shadow-xs">
                <Warehouse className="h-3.5 w-3.5 text-brand-600 shrink-0" />
                <span>{warehouse}</span>
              </div>
            )}
          </div>
        </div>

        {/* SAĞ ÜST: BİTİR TUŞU VE SAĞINDA YEŞİL ROZET */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleFinish}
            className="flex items-center justify-center rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-1 text-xs sm:text-sm font-bold shadow-sm transition active:scale-95 shrink-0"
            title="Bitir"
          >
            <span>Bitir</span>
          </button>
          <span className="chip border px-2.5 py-1 text-[13px] sm:text-[14px] font-bold bg-emerald-100 text-emerald-800 border-emerald-300 rounded-xl shrink-0">
            {matchedLines.length} / {targetLinesCount} Tamamlandı
          </span>
        </div>
      </div>

      {/* HATA MESAJI */}
      {error && (
        <div className="mb-2 flex items-center justify-between gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-2 text-sm font-medium text-rose-600 shrink-0">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="shrink-0 font-bold underline"
          >
            Yenile
          </button>
        </div>
      )}

      {/* İÇERİK LİSTESİ: MAVİ -> KIRMIZI -> SARI -> EN ALTTA YEŞİL KART */}
      <div className="min-w-0 flex-1 overflow-y-auto pr-1 space-y-2">
        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-16 animate-pulse rounded-2xl bg-elevated"
              />
            ))}
          </div>
        ) : lines.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-surface/50 py-10 text-center text-subtle">
            <Package className="mb-2 h-8 w-8 text-slate-400" />
            <p className="text-base font-bold text-fg">Sayım kalemi bulunamadı</p>
          </div>
        ) : (
          <>
            {/* 1. MAVİ KALEMLER (Plana Göre Olmayan / Beklenmeyen) */}
            {unexpectedLines.map((line) =>
              renderItemCard(line, "text-blue-600 dark:text-blue-400")
            )}

            {/* 2. KIRMIZI KALEMLER (Fazla Sayılan) */}
            {excessLines.map((line) =>
              renderItemCard(line, "text-rose-600 dark:text-rose-400")
            )}

            {/* 3. SARI KALEMLER (Eksik Sayılan) */}
            {partialLines.map((line) =>
              renderItemCard(line, "text-amber-500 dark:text-amber-400")
            )}
          </>
        )}
      </div>

      <ToastView toast={toast} />
    </div>
  );
}
