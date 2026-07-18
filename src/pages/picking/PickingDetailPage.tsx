import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Minus, Plus, MapPin, Check, AlertTriangle, Loader2, ArrowRight } from "lucide-react";
import PageHeader from "../../components/PageHeader";
import BarcodeScanner from "../../components/BarcodeScanner";
import { usePickingStore, orderProgress, orderTotals } from "../../store/pickingStore";

type Toast = { kind: "ok" | "done" | "error"; text: string } | null;

export default function PickingDetailPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const order = usePickingStore((s) => s.order);
  const loading = usePickingStore((s) => s.loading);
  const loadOrder = usePickingStore((s) => s.loadOrder);
  const scan = usePickingStore((s) => s.scan);
  const setQty = usePickingStore((s) => s.setQty);

  const [toast, setToast] = useState<Toast>(null);
  const [flashLine, setFlashLine] = useState<string | null>(null);

  useEffect(() => {
    if (id) loadOrder(id);
  }, [id, loadOrder]);

  const showToast = (tst: Toast) => {
    setToast(tst);
    setTimeout(() => setToast(null), 1600);
  };

  const handleDetected = useCallback(
    (barcode: string) => {
      const res = scan(barcode);
      if (!res.ok) {
        showToast({ kind: "error", text: t("picking.wrongBarcode") });
        return;
      }
      setFlashLine(res.lineId!);
      setTimeout(() => setFlashLine(null), 600);
      showToast(res.complete ? { kind: "done", text: t("picking.lineComplete") } : { kind: "ok", text: "+1" });
    },
    [scan, t]
  );

  if (loading || !order) {
    return (
      <div className="mx-auto max-w-6xl p-4 lg:p-8">
        <PageHeader title={t("picking.title")} backTo="/picking" />
        <div className="flex items-center justify-center py-24 text-ink-300">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      </div>
    );
  }

  const progress = orderProgress(order);
  const { picked, requested } = orderTotals(order);
  const allDone = picked >= requested;
  const nextLine = order.lines.find((l) => l.pickedQty < l.requestedQty);

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
            <BarcodeScanner onDetected={handleDetected} sampleBarcode={nextLine?.product.barcode} />
          </div>

          <div className="card mt-4 p-4">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-semibold text-ink-500">{t("picking.progress")}</span>
              <span className="font-bold text-ink-900">{Math.round(progress)}%</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-ink-100">
              <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${progress}%` }} />
            </div>
            {nextLine ? (
              <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-400">
                <ArrowRight className="h-3.5 w-3.5" />
                {t("picking.location")}: <span className="font-mono font-semibold text-ink-600">{nextLine.location}</span>
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
            {order.lines.map((line) => {
              const done = line.pickedQty >= line.requestedQty;
              const partial = line.pickedQty > 0 && !done;
              const flashing = flashLine === line.id;
              return (
                <div
                  key={line.id}
                  className={`flex flex-col gap-3 rounded-2xl border bg-white p-4 shadow-card transition sm:flex-row sm:items-center ${
                    flashing ? "border-brand-400 ring-2 ring-brand-200" : "border-ink-100"
                  }`}
                >
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                        done ? "bg-emerald-100" : partial ? "bg-amber-100" : "bg-ink-100"
                      }`}
                    >
                      {done ? (
                        <Check className="h-5 w-5 text-emerald-600" />
                      ) : (
                        <span className={`text-sm font-bold ${partial ? "text-amber-600" : "text-ink-400"}`}>
                          {line.pickedQty}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-ink-900">{line.product.name}</p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-ink-400">
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" />
                          <span className="font-mono font-semibold text-ink-500">{line.location}</span>
                        </span>
                        <span className="font-mono">· {line.product.barcode}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => setQty(line.id, line.pickedQty - 1)}
                      className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink-100 text-ink-600 transition hover:bg-ink-200 active:scale-95"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <span className="w-16 text-center font-mono text-sm font-bold text-ink-900">
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

          <button
            onClick={() => navigate(`/picking/${order.id}/summary`)}
            className={`btn-lg mt-5 w-full ${allDone ? "btn-primary" : "btn-ghost"}`}
          >
            {allDone ? t("picking.completeOrder") : t("picking.orderSummary")}
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
