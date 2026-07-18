import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Minus, Plus, Check, Loader2, ArrowRight, Tag, Calendar, X } from "lucide-react";
import PageHeader from "../../components/PageHeader";
import BarcodeScanner from "../../components/BarcodeScanner";
import ToastView, { useToast } from "../../components/Toast";
import { useReceivingStore, receiptProgress, receiptTotals } from "../../store/receivingStore";
import type { ReceiptLine } from "../../types";

export default function ReceivingDetailPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const receipt = useReceivingStore((s) => s.receipt);
  const loading = useReceivingStore((s) => s.loading);
  const loadReceipt = useReceivingStore((s) => s.loadReceipt);
  const scan = useReceivingStore((s) => s.scan);
  const applyLot = useReceivingStore((s) => s.applyLot);
  const setQty = useReceivingStore((s) => s.setQty);

  const { toast, show } = useToast();
  const [flashLine, setFlashLine] = useState<string | null>(null);
  const [lotLine, setLotLine] = useState<ReceiptLine | null>(null);

  useEffect(() => {
    if (id) loadReceipt(id);
  }, [id, loadReceipt]);

  const handleDetected = useCallback(
    (barcode: string) => {
      const res = scan(barcode);
      if (!res.ok) {
        show({ kind: "error", text: t("picking.wrongBarcode") });
        return;
      }
      if (res.needsLot) {
        const line = receipt?.lines.find((l) => l.id === res.lineId) ?? null;
        setLotLine(line);
        return;
      }
      setFlashLine(res.lineId!);
      setTimeout(() => setFlashLine(null), 600);
      show(res.complete ? { kind: "done", text: t("picking.lineComplete") } : { kind: "ok", text: "+1" });
    },
    [scan, show, t, receipt]
  );

  if (loading || !receipt) {
    return (
      <div className="mx-auto max-w-6xl p-4 lg:p-8">
        <PageHeader title={t("receiving.title")} backTo="/receiving" />
        <div className="flex items-center justify-center py-24 text-ink-300">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      </div>
    );
  }

  const progress = receiptProgress(receipt);
  const { received, expected } = receiptTotals(receipt);
  const allDone = received >= expected;
  const nextLine = receipt.lines.find((l) => l.receivedQty < l.expectedQty);

  return (
    <div className="mx-auto max-w-6xl p-4 lg:p-8">
      <PageHeader
        title={receipt.id}
        subtitle={`${receipt.supplier} · ${receipt.reference}`}
        backTo="/receiving"
        right={<span className="chip bg-emerald-100 px-3 py-1 font-mono text-sm text-emerald-700">{received}/{expected}</span>}
      />

      <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
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
              <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${progress}%` }} />
            </div>
            {nextLine ? (
              <p className="mt-3 flex items-center gap-1.5 truncate text-xs text-ink-400">
                <ArrowRight className="h-3.5 w-3.5 shrink-0" /> {nextLine.product.name}
              </p>
            ) : (
              <p className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
                <Check className="h-3.5 w-3.5" /> {t("picking.allComplete")}
              </p>
            )}
          </div>
        </div>

        <div>
          <div className="space-y-2.5">
            {receipt.lines.map((line) => {
              const done = line.receivedQty >= line.expectedQty;
              const partial = line.receivedQty > 0 && !done;
              const flashing = flashLine === line.id;
              return (
                <div
                  key={line.id}
                  className={`flex flex-col gap-3 rounded-2xl border bg-white p-4 shadow-card transition sm:flex-row sm:items-center ${
                    flashing ? "border-emerald-400 ring-2 ring-emerald-200" : "border-ink-100"
                  }`}
                >
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${done ? "bg-emerald-100" : partial ? "bg-amber-100" : "bg-ink-100"}`}>
                      {done ? <Check className="h-5 w-5 text-emerald-600" /> : <span className={`text-sm font-bold ${partial ? "text-amber-600" : "text-ink-400"}`}>{line.receivedQty}</span>}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-ink-900">{line.product.name}</p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-400">
                        <span className="font-mono">{line.product.barcode}</span>
                        {line.tracksLot && (
                          <button onClick={() => setLotLine(line)} className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 font-semibold text-violet-600">
                            <Tag className="h-3 w-3" />
                            {line.lot ? `${line.lot} · ${line.expiry}` : t("receiving.lotInfo")}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={() => setQty(line.id, line.receivedQty - 1)} className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink-100 text-ink-600 transition hover:bg-ink-200 active:scale-95">
                      <Minus className="h-4 w-4" />
                    </button>
                    <span className="w-16 text-center font-mono text-sm font-bold text-ink-900">{line.receivedQty} / {line.expectedQty}</span>
                    <button onClick={() => (line.tracksLot ? setLotLine(line) : setQty(line.id, line.receivedQty + 1))} className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-white transition hover:bg-emerald-700 active:scale-95">
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <button
            onClick={() => navigate(`/receiving/${receipt.id}/summary`)}
            className={`btn-lg mt-5 w-full ${allDone ? "btn-primary" : "btn-ghost"}`}
          >
            {allDone ? t("receiving.completeReceipt") : t("picking.orderSummary")}
          </button>
        </div>
      </div>

      {lotLine && (
        <LotModal
          line={lotLine}
          onClose={() => setLotLine(null)}
          onSave={(lot, expiry, qty) => {
            applyLot(lotLine.id, lot, expiry, qty);
            setLotLine(null);
            show({ kind: "done", text: t("picking.lineComplete") });
          }}
        />
      )}

      <ToastView toast={toast} />
    </div>
  );
}

function LotModal({
  line,
  onClose,
  onSave,
}: {
  line: ReceiptLine;
  onClose: () => void;
  onSave: (lot: string, expiry: string, qty: number) => void;
}) {
  const { t } = useTranslation();
  const [lot, setLot] = useState(line.lot ?? "");
  const [expiry, setExpiry] = useState(line.expiry ?? "");
  const [qty, setQty] = useState(line.receivedQty || line.expectedQty);
  const [err, setErr] = useState(false);

  const save = () => {
    if (!lot.trim() || !expiry.trim()) {
      setErr(true);
      return;
    }
    onSave(lot.trim(), expiry, qty);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/40 p-0 sm:items-center sm:p-4">
      <div className="w-full max-w-md animate-slide-up rounded-t-3xl bg-white p-6 shadow-soft sm:rounded-3xl">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h3 className="text-lg font-bold text-ink-900">{t("receiving.lotInfo")}</h3>
            <p className="truncate text-sm text-ink-400">{line.product.name}</p>
          </div>
          <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-xl text-ink-400 hover:bg-ink-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <label className="field-label">{t("receiving.lotNumber")}</label>
        <div className="relative mb-4">
          <Tag className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-300" />
          <input autoFocus value={lot} onChange={(e) => setLot(e.target.value)} placeholder="L20260718" className="field-input pl-11 font-mono" />
        </div>

        <label className="field-label">{t("receiving.expiry")}</label>
        <div className="relative mb-4">
          <Calendar className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-300" />
          <input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} className="field-input pl-11" />
        </div>

        <label className="field-label">{t("receiving.quantity")} ({t("receiving.expected")}: {line.expectedQty})</label>
        <div className="mb-4 flex items-center gap-3">
          <button onClick={() => setQty((q) => Math.max(0, q - 1))} className="flex h-12 w-12 items-center justify-center rounded-xl bg-ink-100 text-ink-600 active:scale-95">
            <Minus className="h-5 w-5" />
          </button>
          <input value={qty} onChange={(e) => setQty(Math.max(0, Number(e.target.value) || 0))} inputMode="numeric" className="field-input flex-1 text-center font-mono text-lg font-bold" />
          <button onClick={() => setQty((q) => q + 1)} className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-600 text-white active:scale-95">
            <Plus className="h-5 w-5" />
          </button>
        </div>

        {err && <p className="mb-2 text-sm font-medium text-rose-500">{t("receiving.lotRequired")}</p>}

        <button onClick={save} className="btn-primary btn-lg btn-block">
          {t("receiving.saveLot")}
        </button>
      </div>
    </div>
  );
}
