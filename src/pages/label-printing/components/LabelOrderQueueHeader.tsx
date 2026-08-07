import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Printer,
  Trash2,
  ListOrdered,
  ChevronLeft,
  Loader2,
  AlertCircle,
  CheckCircle2,
  type LucideIcon,
} from "lucide-react";

export interface QueuedLabelOrder {
  id: string;
  title: string;
  subtitle?: string;
  copies: number;
  // Generic payload for printing
  payload: Record<string, unknown>;
}

interface LabelOrderQueueHeaderProps {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  iconBg: string;
  iconFg: string;
  queuedOrders: QueuedLabelOrder[];
  onRemoveOrder: (id: string) => void;
  onPrintAll: () => Promise<void>;
  printing: boolean;
  errorMsg?: string;
  successMsg?: string;
}

export default function LabelOrderQueueHeader({
  title,
  subtitle,
  icon: Icon,
  iconBg,
  iconFg,
  queuedOrders,
  onRemoveOrder,
  onPrintAll,
  printing,
  errorMsg,
  successMsg,
}: LabelOrderQueueHeaderProps) {
  const navigate = useNavigate();
  const [showQueuePopover, setShowQueuePopover] = useState(false);

  return (
    <div className="mb-6 space-y-3">
      {/* Top Navigation & Title Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/label-printing")}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-surface text-fg shadow-sm transition hover:bg-elevated"
            title="Etiket Menüsüne Dön"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${iconBg}`}>
            <Icon className={`h-6 w-6 ${iconFg}`} />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-fg sm:text-2xl">{title}</h1>
            <p className="text-xs text-subtle">{subtitle}</p>
          </div>
        </div>

        {/* Top Right Queue Controls */}
        <div className="relative flex items-center gap-2 self-end sm:self-auto">
          {/* Counter Badge Button */}
          <button
            type="button"
            onClick={() => setShowQueuePopover(!showQueuePopover)}
            className={`relative flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-bold transition ${
              queuedOrders.length > 0
                ? "border-brand-300 bg-brand-50 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300 dark:border-brand-800 shadow-sm"
                : "border-line bg-surface text-subtle hover:bg-elevated hover:text-fg"
            }`}
          >
            <ListOrdered className="h-4 w-4" />
            <span>Etiket Siparişleri</span>
            <span
              className={`ml-1 flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[11px] font-extrabold ${
                queuedOrders.length > 0
                  ? "bg-brand text-white"
                  : "bg-elevated text-subtle"
              }`}
            >
              {queuedOrders.length}
            </span>
          </button>

          {/* Batch Print Button */}
          <button
            type="button"
            onClick={onPrintAll}
            disabled={printing || queuedOrders.length === 0}
            className="btn-primary flex items-center gap-2 text-xs py-2 px-4 shadow-sm"
          >
            {printing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Yazdırılıyor...</span>
              </>
            ) : (
              <>
                <Printer className="h-4 w-4" />
                <span>Yazdır ({queuedOrders.length})</span>
              </>
            )}
          </button>

          {/* Queue Popover Drawer */}
          {showQueuePopover && (
            <div className="absolute right-0 top-12 z-50 w-80 sm:w-96 rounded-2xl border border-line bg-surface p-4 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between border-b border-line pb-3">
                <div className="flex items-center gap-2">
                  <ListOrdered className="h-4 w-4 text-brand" />
                  <h4 className="text-sm font-bold text-fg">Etiket Sipariş Listesi</h4>
                </div>
                <span className="text-xs font-semibold text-subtle">
                  {queuedOrders.length} Adet Sipariş
                </span>
              </div>

              <div className="mt-3 max-h-64 overflow-y-auto space-y-2 pr-1">
                {queuedOrders.length === 0 ? (
                  <p className="py-6 text-center text-xs text-subtle">
                    Henüz etiket siparişi eklenmedi. Aşağıdaki formdan ekleyebilirsiniz.
                  </p>
                ) : (
                  queuedOrders.map((ord, idx) => (
                    <div
                      key={ord.id}
                      className="flex items-center justify-between rounded-xl border border-line bg-bg p-3 text-xs shadow-xs"
                    >
                      <div className="min-w-0 pr-2">
                        <div className="flex items-center gap-1.5 font-bold text-fg">
                          <span className="text-brand font-mono">{idx + 1}.</span>
                          <span className="truncate">{ord.title}</span>
                        </div>
                        {ord.subtitle && (
                          <p className="mt-0.5 truncate text-[11px] text-subtle">
                            {ord.subtitle}
                          </p>
                        )}
                        <span className="mt-1 inline-block text-[10px] font-semibold text-brand">
                          {ord.copies} Kopya
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => onRemoveOrder(ord.id)}
                        className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-500/10 transition"
                        title="Siparişi Sil"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>

              {queuedOrders.length > 0 && (
                <div className="mt-3 border-t border-line pt-3 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setShowQueuePopover(false)}
                    className="text-xs font-medium text-subtle hover:text-fg"
                  >
                    Kapat
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowQueuePopover(false);
                      onPrintAll();
                    }}
                    disabled={printing}
                    className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5"
                  >
                    <Printer className="h-3.5 w-3.5" />
                    <span>Tümünü Yazdır</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Global Alerts */}
      {errorMsg && (
        <div className="flex items-start gap-2.5 rounded-xl border border-red-500/20 bg-red-500/10 p-3.5 text-xs text-red-600 dark:text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="flex items-start gap-2.5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3.5 text-xs text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{successMsg}</span>
        </div>
      )}
    </div>
  );
}
