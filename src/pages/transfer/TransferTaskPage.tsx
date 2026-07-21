import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Check, CheckCircle2, Loader2, MapPin, ArrowRight, Package } from "lucide-react";
import PageHeader from "../../components/PageHeader";
import BarcodeScanner from "../../components/BarcodeScanner";
import ToastView, { useToast } from "../../components/Toast";
import { api } from "../../api/client";
import type { TransferTask } from "../../types";

export default function TransferTaskPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const [task, setTask] = useState<TransferTask | null>(null);
  const [loading, setLoading] = useState(true);
  const [verified, setVerified] = useState(false);
  const [toLocation, setToLocation] = useState("");
  const [processing, setProcessing] = useState(false);
  const [done, setDone] = useState(false);
  const { toast, show } = useToast();

  useEffect(() => {
    api.getTransferTasks().then((list) => {
      const found = list.find((tk) => tk.id === id) ?? null;
      setTask(found);
      setToLocation(found?.toLocation ?? "");
      setLoading(false);
    });
  }, [id]);

  const handleDetected = (barcode: string) => {
    if (!task) return;
    if (barcode.trim() === task.product.barcode) {
      setVerified(true);
      show({ kind: "done", text: t("transfer.productOk") });
    } else {
      show({ kind: "error", text: t("transfer.verifyProduct") });
    }
  };

  const complete = async () => {
    if (!task) return;
    setProcessing(true);
    await api.completeTransfer(task.id);
    setProcessing(false);
    setDone(true);
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl p-4 lg:p-8">
        <PageHeader title={t("transfer.title")} backTo="/transfer" />
        <div className="flex items-center justify-center py-24 text-subtle"><Loader2 className="h-6 w-6 animate-spin" /></div>
      </div>
    );
  }

  if (!task) {
    return (
      <div className="mx-auto max-w-3xl p-4 lg:p-8">
        <PageHeader title={t("transfer.title")} backTo="/transfer" />
        <p className="py-16 text-center text-subtle">{t("common.noResults")}</p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-4 py-16 text-center">
        <div className="mb-5 flex h-24 w-24 animate-pop-in items-center justify-center rounded-full bg-amber-100">
          <CheckCircle2 className="h-12 w-12 text-amber-600" />
        </div>
        <h1 className="text-2xl font-extrabold text-fg">{t("transfer.completed")}!</h1>
        <div className="mt-4 w-full rounded-2xl border border-line bg-surface p-5 text-left shadow-card">
          <p className="truncate font-semibold text-fg">{task.product.name}</p>
          <p className="mt-1 flex items-center gap-1.5 text-sm">
            <span className="font-mono font-semibold text-muted">{task.fromLocation}</span>
            <ArrowRight className="h-4 w-4 text-amber-500" />
            <span className="font-mono font-semibold text-amber-600">{toLocation}</span>
            <span className="text-subtle">· {task.qty} {task.product.unit}</span>
          </p>
        </div>
        <button onClick={() => navigate("/transfer", { replace: true })} className="btn-primary btn-lg mt-6 w-full">
          {t("common.backToMenu")}
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl p-4 lg:p-8">
      <PageHeader title={t("transfer.title")} subtitle={task.id} backTo="/transfer" />

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <div className="card p-4">
          <BarcodeScanner onDetected={handleDetected} />
        </div>

        <div className="space-y-4">
          <div className="card p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-elevated">
                <Package className="h-5 w-5 text-muted" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-fg">{task.product.name}</p>
                <p className="font-mono text-xs text-subtle">{task.product.barcode}</p>
              </div>
              {verified && <span className="chip bg-emerald-100 text-emerald-700"><Check className="h-3.5 w-3.5" /> {t("transfer.productOk")}</span>}
            </div>
          </div>

          <div className="card space-y-4 p-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-elevated p-3">
                <p className="text-xs text-subtle">{t("transfer.from")}</p>
                <p className="mt-0.5 flex items-center gap-1 font-mono font-bold text-fg"><MapPin className="h-4 w-4 text-subtle" />{task.fromLocation}</p>
              </div>
              <div className="rounded-xl bg-amber-50 p-3">
                <p className="text-xs text-amber-600">{t("transfer.to")}</p>
                <input value={toLocation} onChange={(e) => setToLocation(e.target.value)} className="mt-0.5 w-full bg-transparent font-mono font-bold text-amber-700 outline-none" />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted">{t("transfer.quantity")}</span>
              <span className="font-mono text-lg font-bold text-fg">{task.qty} {task.product.unit}</span>
            </div>
          </div>

          <button onClick={complete} disabled={processing} className="btn-primary btn-lg w-full">
            {processing ? <Loader2 className="h-5 w-5 animate-spin" /> : t("transfer.complete")}
          </button>
        </div>
      </div>

      <ToastView toast={toast} />
    </div>
  );
}
