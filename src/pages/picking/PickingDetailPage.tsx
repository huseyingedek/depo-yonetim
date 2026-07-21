import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Minus, Plus, MapPin, Check, AlertTriangle, Loader2, ArrowRight, PackagePlus } from "lucide-react";
import PageHeader from "../../components/PageHeader";
import BarcodeScanner from "../../components/BarcodeScanner";
import { usePickingStore, orderProgress, orderTotals } from "../../store/pickingStore";

type Toast = { kind: "ok" | "done" | "error"; text: string } | null;
type ScanStep = "shelf" | "product" | "lot";

export default function PickingDetailPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const orderType = searchParams.get("type") ?? "";

  const order = usePickingStore((s) => s.order);
  const loading = usePickingStore((s) => s.loading);
  const loadOrder = usePickingStore((s) => s.loadOrder);
  const scan = usePickingStore((s) => s.scan);
  const setQty = usePickingStore((s) => s.setQty);
  const setLot = usePickingStore((s) => s.setLot);

  const [toast, setToast] = useState<Toast>(null);
  const [flashLine, setFlashLine] = useState<string | null>(null);

  // --- 3 adımlı okutma sırası: Raf → Ürün → Parti ---
  const [step, setStep] = useState<ScanStep>("shelf");
  const [shelf, setShelf] = useState<string | null>(null);
  // ürün okundu, parti bekleniyor
  const [pending, setPending] = useState<{ barcode: string; lineId: string } | null>(null);

  // StrictMode efekti iki kez çalıştırıyor; MZYEnterPick VERİ YAZDIĞI için
  // ikinci çağrının gitmemesi önemli.
  const yuklendi = useRef("");

  useEffect(() => {
    if (!id) return;
    const anahtar = `${id}|${orderType}`;
    if (yuklendi.current === anahtar) return;
    yuklendi.current = anahtar;
    loadOrder(id, orderType);
  }, [id, orderType, loadOrder]);

  const showToast = (tst: Toast) => {
    setToast(tst);
    setTimeout(() => setToast(null), 1600);
  };

  const flash = (lineId: string) => {
    setFlashLine(lineId);
    setTimeout(() => setFlashLine(null), 600);
  };

  /** Ürün miktarını uygula (ileride MZYReadBarcode'un döndüğü miktar kadar). */
  const applyPick = useCallback(
    (barcode: string) => {
      const res = scan(barcode);
      if (!res.ok) return false;
      flash(res.lineId!);
      showToast(res.complete ? { kind: "done", text: t("picking.lineComplete") } : { kind: "ok", text: "+1" });
      return true;
    },
    [scan, t]
  );

  const handleDetected = useCallback(
    (code: string) => {
      const barcode = code.trim();

      // 1) RAF
      if (step === "shelf") {
        setShelf(barcode);
        setStep("product");
        showToast({ kind: "ok", text: `${t("picking.shelfRead")}: ${barcode}` });
        return;
      }

      // 2) ÜRÜN
      if (step === "product") {
        const line = order?.lines.find((l) => l.product.barcode === barcode);
        if (!line) {
          showToast({ kind: "error", text: t("picking.wrongBarcode") });
          return;
        }
        // Parti takipliyse 3. adıma geç, miktarı parti okununca uygula
        if (line.lotTracked) {
          setPending({ barcode, lineId: line.id });
          setStep("lot");
          flash(line.id);
          showToast({ kind: "ok", text: t("picking.scanLot") });
          return;
        }
        applyPick(barcode);
        return; // raf korunur, sonraki ürüne devam
      }

      // 3) PARTİ
      if (step === "lot" && pending) {
        setLot(pending.lineId, barcode);
        applyPick(pending.barcode);
        showToast({ kind: "done", text: `${t("picking.lotRead")}: ${barcode}` });
        setPending(null);
        setStep("product");
      }
    },
    [step, order, pending, applyPick, setLot, t]
  );

  const stepPrompt =
    step === "shelf" ? t("picking.scanShelf") : step === "lot" ? t("picking.scanLot") : t("picking.scanProduct");

  if (loading || !order) {
    return (
      <div className="mx-auto max-w-6xl p-4 lg:p-8">
        <PageHeader title={t("picking.title")} backTo="/picking" />
        <div className="flex items-center justify-center py-24 text-subtle">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      </div>
    );
  }

  const progress = orderProgress(order);
  const { picked, requested } = orderTotals(order);
  const nextLine = order.lines.find((l) => l.pickedQty < l.requestedQty);

  // Servisten gelen toplama sırası korunur; TAMAMLANAN kalemler en alta iner.
  // (sort stabil olduğu için eşitlerde orijinal sıra bozulmaz)
  const sortedLines = [...order.lines].sort((a, b) => {
    const aDone = a.pickedQty >= a.requestedQty ? 1 : 0;
    const bDone = b.pickedQty >= b.requestedQty ? 1 : 0;
    return aDone - bDone;
  });

  return (
    <div className="mx-auto max-w-6xl p-4 lg:p-8">
      <PageHeader
        title={order.id}
        subtitle={`${order.customer} · ${order.reference}`}
        backTo="/picking"
        right={
          <span className="chip bg-brand-100 px-3 py-1 font-mono text-sm text-brand-700">
            {picked}/{requested}
          </span>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
        {/* Sol: kamera + ilerleme */}
        <div className="lg:sticky lg:top-24 lg:self-start">
          <div className="card p-4">
            {/* Okutma sırası: Raf → Ürün → Parti */}
            <div className="mb-3 flex items-center gap-1.5">
              {(["shelf", "product", "lot"] as const).map((s, i) => {
                const active = step === s;
                const done =
                  (s === "shelf" && shelf !== null) ||
                  (s === "product" && step === "lot");
                const label =
                  s === "shelf" ? t("picking.stepShelf") : s === "product" ? t("picking.stepProduct") : t("picking.stepLot");
                return (
                  <div
                    key={s}
                    className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-2 py-1.5 text-[11px] font-semibold transition-all duration-200 ease-soft ${
                      active
                        ? "bg-brand-600 text-white shadow-soft"
                        : done
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-elevated text-subtle"
                    }`}
                  >
                    <span className="font-mono">{done ? "✓" : i + 1}</span>
                    {label}
                  </div>
                );
              })}
            </div>

            {/* Okunan raf */}
            {shelf && (
              <div className="mb-3 flex items-center justify-between rounded-xl bg-elevated px-3 py-2">
                <span className="inline-flex items-center gap-1.5 text-xs text-muted">
                  <MapPin className="h-3.5 w-3.5 text-brand-500" />
                  {t("picking.stepShelf")}: <span className="font-mono font-bold text-fg">{shelf}</span>
                </span>
                <button
                  onClick={() => {
                    setShelf(null);
                    setPending(null);
                    setStep("shelf");
                  }}
                  className="text-xs font-semibold text-brand-600 hover:underline"
                >
                  {t("picking.changeShelf")}
                </button>
              </div>
            )}

            <BarcodeScanner
              onDetected={handleDetected}
              prompt={stepPrompt}
            />
          </div>

          <div className="card mt-4 p-4">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-semibold text-muted">{t("picking.progress")}</span>
              <span className="font-bold text-fg">{Math.round(progress)}%</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-elevated">
              <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${progress}%` }} />
            </div>
            {nextLine ? (
              <p className="mt-3 flex items-center gap-1.5 text-xs text-subtle">
                <ArrowRight className="h-3.5 w-3.5" />
                {t("picking.location")}: <span className="font-mono font-semibold text-muted">{nextLine.location}</span>
                <span className="truncate">· {nextLine.product.name}</span>
              </p>
            ) : (
              <p className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
                <Check className="h-3.5 w-3.5" /> {t("picking.allComplete")}
              </p>
            )}
          </div>
        </div>

        {/* Sağ: kalem listesi */}
        <div>
          <div className="space-y-2.5">
            {sortedLines.map((line, idx) => {
              const done = line.pickedQty >= line.requestedQty;
              const partial = line.pickedQty > 0 && !done;
              const flashing = flashLine === line.id;
              return (
                <div
                  key={line.id}
                  className={`flex flex-col gap-3 rounded-2xl border p-4 shadow-card transition-all duration-300 ease-soft sm:flex-row sm:items-center ${
                    flashing ? "border-brand-400 ring-2 ring-brand-200" : "border-line"
                  } ${done ? "bg-elevated opacity-60" : "bg-surface"}`}
                >
                  {/* toplama sırası */}
                  <span className="hidden w-6 shrink-0 text-center font-mono text-xs font-bold text-subtle sm:block">
                    {done ? "✓" : idx + 1}
                  </span>
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                        done ? "bg-emerald-100" : partial ? "bg-amber-100" : "bg-elevated"
                      }`}
                    >
                      {done ? (
                        <Check className="h-5 w-5 text-emerald-600" />
                      ) : (
                        <span className={`text-sm font-bold ${partial ? "text-amber-600" : "text-subtle"}`}>
                          {line.pickedQty}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-fg">{line.product.name}</p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-subtle">
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" />
                          <span className="font-mono font-semibold text-muted">{line.location}</span>
                        </span>
                        <span className="font-mono">· {line.product.barcode}</span>
                        {line.lotTracked && (
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold ${
                              line.lot ? "bg-violet-100 text-violet-700" : "bg-amber-100 text-amber-700"
                            }`}
                          >
                            {t("picking.stepLot")}: {line.lot ?? "—"}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => setQty(line.id, line.pickedQty - 1)}
                      className="flex h-9 w-9 items-center justify-center rounded-lg bg-elevated text-muted transition hover:bg-line active:scale-95"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <span className="w-16 text-center font-mono text-sm font-bold text-fg">
                      {line.pickedQty} / {line.requestedQty}
                    </span>
                    <button
                      onClick={() => setQty(line.id, line.pickedQty + 1)}
                      className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white transition hover:bg-brand-700 active:scale-95"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Kısmi de olsa pakete yerleştirilebilir — %100 şartı yok */}
          <button
            onClick={() => navigate(`/picking/${order.id}/summary`)}
            className="btn-primary btn-lg mt-5 w-full"
          >
            <PackagePlus className="h-5 w-5" />
            {t("picking.placeInPackage")}
          </button>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="pointer-events-none fixed inset-x-0 top-20 z-40 flex justify-center px-4">
          <div
            className={`flex animate-pop-in items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold text-white shadow-soft ${
              toast.kind === "error" ? "bg-rose-500" : toast.kind === "done" ? "bg-emerald-600" : "bg-ink-900"
            }`}
          >
            {toast.kind === "error" ? <AlertTriangle className="h-4 w-4" /> : <Check className="h-4 w-4" />}
            {toast.text}
          </div>
        </div>
      )}
    </div>
  );
}
