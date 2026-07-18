import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Check, CheckCircle2, Loader2, Minus, Plus, Send } from "lucide-react";
import PageHeader from "../../components/PageHeader";
import BarcodeScanner from "../../components/BarcodeScanner";
import ToastView, { useToast } from "../../components/Toast";
import { api } from "../../api/client";
import type { CountLine, CountTask } from "../../types";

export default function CountDetailPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const [task, setTask] = useState<CountTask | null>(null);
  const [lines, setLines] = useState<CountLine[]>([]);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(false);
  const [done, setDone] = useState(false);
  const [caniasRef, setCaniasRef] = useState("");
  const [flashLine, setFlashLine] = useState<string | null>(null);
  const { toast, show } = useToast();

  useEffect(() => {
    if (!id) return;
    api.getCountTask(id).then((c) => {
      setTask(c ?? null);
      setLines(c ? c.lines.map((l) => ({ ...l })) : []);
      setLoading(false);
    });
  }, [id]);

  const setCounted = (lineId: string, qty: number | null) =>
    setLines((ls) => ls.map((l) => (l.id === lineId ? { ...l, countedQty: qty } : l)));

  const handleDetected = useCallback(
    (barcode: string) => {
      const line = lines.find((l) => l.product.barcode === barcode.trim());
      if (!line) {
        show({ kind: "error", text: t("picking.wrongBarcode") });
        return;
      }
      setLines((ls) => ls.map((l) => (l.id === line.id ? { ...l, countedQty: (l.countedQty ?? 0) + 1 } : l)));
      setFlashLine(line.id);
      setTimeout(() => setFlashLine(null), 600);
      show({ kind: "ok", text: "+1" });
    },
    [lines, show, t]
  );

  const complete = async () => {
    if (!task) return;
    setCompleting(true);
    const finalLines = lines.map((l) => ({ ...l, countedQty: l.countedQty ?? 0 }));
    const ref = await api.completeCount({ ...task, lines: finalLines });
    setCaniasRef(ref.caniasRef);
    setCompleting(false);
    setDone(true);
  };

  const countedCount = lines.filter((l) => l.countedQty !== null).length;
  const totalDiff = lines.reduce((s, l) => s + ((l.countedQty ?? l.systemQty) - l.systemQty), 0);

  if (loading || !task) {
    return (
      <div className="mx-auto max-w-3xl p-4 lg:p-8">
        <PageHeader title={t("count.title")} backTo="/count" />
        <div className="flex items-center justify-center py-24 text-subtle"><Loader2 className="h-6 w-6 animate-spin" /></div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-4 py-16 text-center">
        <div className="mb-5 flex h-24 w-24 animate-pop-in items-center justify-center rounded-full bg-rose-100">
          <CheckCircle2 className="h-12 w-12 text-rose-500" />
        </div>
        <h1 className="text-2xl font-extrabold text-fg">{t("count.completed")}</h1>
        <div className="mt-1 flex items-center gap-1.5 text-sm text-emerald-600"><Send className="h-4 w-4" /> {t("picking.sentToCanias")}</div>
        <div className="mt-6 w-full rounded-2xl border border-line bg-surface p-5 text-left shadow-card">
          <Row label={t("count.location")} value={task.location} mono />
          <Row label={t("picking.reference")} value={caniasRef} mono />
          <Row label={t("count.countedLines")} value={`${lines.length}`} />
          <Row label={t("count.totalDiff")} value={`${totalDiff > 0 ? "+" : ""}${totalDiff}`} danger={totalDiff !== 0} last />
        </div>
        <button onClick={() => navigate("/count", { replace: true })} className="btn-primary btn-lg mt-6 w-full">{t("common.backToMenu")}</button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl p-4 lg:p-8">
      <PageHeader
        title={task.location}
        subtitle={`${t("count.title")} · ${task.reference}`}
        backTo="/count"
        right={<span className="chip bg-rose-100 px-3 py-1 font-mono text-sm text-rose-600">{countedCount}/{lines.length}</span>}
      />

      <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
        <div className="lg:sticky lg:top-24 lg:self-start">
          <div className="card p-4">
            <BarcodeScanner onDetected={handleDetected} sampleBarcode={lines[0]?.product.barcode} />
          </div>
          <div className="card mt-4 p-4">
            <label className="field-label">{t("count.note")}</label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder={t("count.notePlaceholder")} className="w-full rounded-2xl border border-line bg-surface px-4 py-3 text-base outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100" />
          </div>
        </div>

        <div>
          <div className="space-y-2.5">
            {lines.map((line) => {
              const counted = line.countedQty;
              const diff = counted === null ? null : counted - line.systemQty;
              const flashing = flashLine === line.id;
              return (
                <div key={line.id} className={`rounded-2xl border bg-surface p-4 shadow-card transition ${flashing ? "border-rose-300 ring-2 ring-rose-200" : "border-line"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-fg">{line.product.name}</p>
                      <p className="font-mono text-xs text-subtle">{line.product.barcode}</p>
                    </div>
                    {diff !== null && (
                      <span className={`chip shrink-0 ${diff === 0 ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-600"}`}>
                        {t("count.difference")}: {diff > 0 ? "+" : ""}{diff}
                      </span>
                    )}
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-elevated p-2.5 text-center">
                      <p className="text-[11px] text-subtle">{t("count.systemQty")}</p>
                      <p className="font-mono text-lg font-bold text-muted">{line.systemQty}</p>
                    </div>
                    <div className="rounded-xl bg-brand-50 p-2.5">
                      <p className="mb-1 text-center text-[11px] text-brand-500">{t("count.countedQty")}</p>
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => setCounted(line.id, Math.max(0, (counted ?? 0) - 1))} className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface text-muted active:scale-95">
                          <Minus className="h-4 w-4" />
                        </button>
                        <input
                          value={counted ?? ""}
                          onChange={(e) => setCounted(line.id, e.target.value === "" ? null : Math.max(0, Number(e.target.value) || 0))}
                          inputMode="numeric"
                          placeholder="—"
                          className="w-full bg-transparent text-center font-mono text-lg font-bold text-brand-700 outline-none"
                        />
                        <button onClick={() => setCounted(line.id, (counted ?? 0) + 1)} className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white active:scale-95">
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <button onClick={complete} disabled={completing} className="btn-primary btn-lg mt-5 w-full">
            {completing ? <><Loader2 className="h-5 w-5 animate-spin" /> {t("picking.sentToCanias")}...</> : <><Check className="h-5 w-5" /> {t("count.completeCount")}</>}
          </button>
        </div>
      </div>

      <ToastView toast={toast} />
    </div>
  );
}

function Row({ label, value, mono, danger, last }: { label: string; value: string; mono?: boolean; danger?: boolean; last?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-2 ${last ? "" : "border-b border-line"}`}>
      <span className="text-sm text-subtle">{label}</span>
      <span className={`text-sm font-bold ${danger ? "text-rose-500" : "text-fg"} ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}
