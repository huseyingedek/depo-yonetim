import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Check, CheckCircle2, Loader2, Send, PackagePlus } from "lucide-react";
import PageHeader from "../../components/PageHeader";
import ProgressRing from "../../components/ProgressRing";
import { usePickingStore, orderProgress, orderTotals } from "../../store/pickingStore";

export default function PickingSummaryPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const order = usePickingStore((s) => s.order);
  const completing = usePickingStore((s) => s.completing);
  const complete = usePickingStore((s) => s.complete);
  const clear = usePickingStore((s) => s.clear);

  const [done, setDone] = useState(false);
  const [caniasRef, setCaniasRef] = useState("");

  useEffect(() => {
    if (!order) navigate("/picking", { replace: true });
  }, [order, navigate]);

  if (!order) return null;

  const progress = orderProgress(order);
  const { picked, missing, lineCount } = orderTotals(order);

  const handleComplete = async () => {
    const ref = await complete();
    setCaniasRef(ref);
    setDone(true);
  };

  if (done) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-4 py-16 text-center">
        <div className="mb-5 flex h-24 w-24 animate-pop-in items-center justify-center rounded-full bg-emerald-100">
          <CheckCircle2 className="h-12 w-12 text-emerald-600" />
        </div>
        <h1 className="text-2xl font-extrabold text-fg">{t("picking.completed")}</h1>
        <div className="mt-1 flex items-center gap-1.5 text-sm text-emerald-600">
          <Send className="h-4 w-4" />
          <span>{t("picking.sentToCanias")}</span>
        </div>

        <div className="mt-6 w-full rounded-2xl border border-line bg-surface p-5 shadow-card">
          <Row label={t("picking.order")} value={order.id} mono />
          <Row label={t("picking.reference")} value={caniasRef} mono />
          <Row label={t("picking.totalItems")} value={`${lineCount}`} />
          <Row label={t("picking.totalPicked")} value={`${picked}`} />
          {missing > 0 && <Row label={t("picking.totalMissing")} value={`${missing}`} danger last />}
        </div>

        <button
          onClick={() => {
            clear();
            navigate("/picking", { replace: true });
          }}
          className="btn-primary btn-lg mt-6 w-full"
        >
          {t("picking.backToOrders")}
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl p-4 lg:p-8">
      <PageHeader title={t("picking.orderSummary")} subtitle={order.id} backTo={`/picking/${order.id}`} />

      <div className="card p-6">
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:justify-center sm:gap-10">
          <ProgressRing value={progress} label={t("picking.progress")} />
          <div className="grid w-full max-w-xs grid-cols-3 gap-3 sm:w-auto">
            <Stat value={lineCount} label={t("picking.totalItems")} tone="ink" />
            <Stat value={picked} label={t("picking.totalPicked")} tone="brand" />
            <Stat value={missing} label={t("picking.totalMissing")} tone={missing > 0 ? "rose" : "emerald"} />
          </div>
        </div>
      </div>

      <div className="mt-5 space-y-2">
        {order.lines.map((line) => {
          const lineDone = line.pickedQty >= line.requestedQty;
          return (
            <div key={line.id} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3.5 shadow-card">
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                  lineDone ? "bg-emerald-100" : "bg-rose-100"
                }`}
              >
                <Check className={`h-4 w-4 ${lineDone ? "text-emerald-600" : "text-rose-400"}`} />
              </div>
              <p className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{line.product.name}</p>
              <span className="font-mono text-sm font-bold text-fg">
                {line.pickedQty}/{line.requestedQty}
              </span>
            </div>
          );
        })}
      </div>

      <button onClick={handleComplete} disabled={completing} className="btn-primary btn-lg mt-6 w-full sm:w-auto sm:px-10">
        {completing ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" /> {t("picking.sentToCanias")}...
          </>
        ) : (
          <>
            <PackagePlus className="h-5 w-5" /> {t("picking.placeInPackage")}
          </>
        )}
      </button>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
  danger,
  last,
}: {
  label: string;
  value: string;
  mono?: boolean;
  danger?: boolean;
  last?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between py-2 ${last ? "" : "border-b border-line"}`}>
      <span className="text-sm text-subtle">{label}</span>
      <span className={`text-sm font-bold ${danger ? "text-rose-500" : "text-fg"} ${mono ? "font-mono" : ""}`}>
        {value}
      </span>
    </div>
  );
}

function Stat({ value, label, tone }: { value: number; label: string; tone: "ink" | "brand" | "rose" | "emerald" }) {
  const tones = {
    ink: "text-fg",
    brand: "text-brand-600",
    rose: "text-rose-500",
    emerald: "text-emerald-600",
  };
  return (
    <div className="rounded-2xl border border-line bg-surface p-3 text-center shadow-card">
      <p className={`text-2xl font-extrabold ${tones[tone]}`}>{value}</p>
      <p className="mt-0.5 text-[11px] font-medium leading-tight text-subtle">{label}</p>
    </div>
  );
}
