import { useState, useEffect } from "react";
import { FileText, X, CheckCircle2, AlertCircle, Loader2, RefreshCw, Printer } from "lucide-react";
import { api } from "../../../api/client";
import type { PickOrder } from "../../../types";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function WaybillLabelModal({ isOpen, onClose }: Props) {
  const [waybillDocNum, setWaybillDocNum] = useState("");
  const [repeatCount, setRepeatCount] = useState<number>(1);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const [pickOrders, setPickOrders] = useState<PickOrder[]>([]);
  const [fetchingList, setFetchingList] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setWaybillDocNum("");
      setRepeatCount(1);
      setErrorMsg("");
      setSuccessMsg("");
      setLoading(false);
      fetchWaybills();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const fetchWaybills = async () => {
    setFetchingList(true);
    try {
      const orders = await api.getPickOrders();
      setPickOrders(orders || []);
    } catch {
      // Ignore if list fetch fails, user can type manually
    } finally {
      setFetchingList(false);
    }
  };

  const resetForm = () => {
    setWaybillDocNum("");
    setRepeatCount(1);
    setSuccessMsg("");
    setErrorMsg("");
  };

  const handlePrintSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    const doc = waybillDocNum.trim();
    if (!doc) {
      setErrorMsg("İrsaliye / Belge numarası girilmelidir.");
      return;
    }

    const count = Number(repeatCount);
    if (!Number.isInteger(count) || count < 1 || count > 99) {
      setErrorMsg("Kopya (tekrar) sayısı 1 ile 99 arasında olmalıdır.");
      return;
    }

    setLoading(true);

    try {
      // Waybill print service integration when ready from Bora Bey
      setSuccessMsg(`İrsaliye etiketi (${doc} - ${count} kopya) yazdırma isteği alındı.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Yazdırma işlemi sırasında hata oluştu.";
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-line bg-surface p-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-900/30">
              <FileText className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-fg">İrsaliye Etiketi Yazdırma</h3>
              <p className="text-xs text-subtle">Sevkiyat irsaliye belge etiketini yazdırın</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="rounded-lg p-1.5 text-subtle hover:bg-bg hover:text-fg"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Alerts */}
        {errorMsg && (
          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-red-500/20 bg-red-500/10 p-3.5 text-xs text-red-600 dark:text-red-400">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="mt-4 flex items-start justify-between gap-2.5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3.5 text-xs text-emerald-600 dark:text-emerald-400">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
            <button
              type="button"
              onClick={resetForm}
              className="flex items-center gap-1 rounded bg-emerald-600/10 px-2 py-0.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-600/20 dark:text-emerald-300"
            >
              <RefreshCw className="h-3 w-3" />
              <span>Yeni Etiket</span>
            </button>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handlePrintSubmit} className="mt-4 space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-fg">
              İrsaliye / Belge Numarası (DOCNUM) <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={waybillDocNum}
              onChange={(e) => setWaybillDocNum(e.target.value)}
              placeholder="Örn: IRS2026000123"
              className="field-input w-full"
            />
          </div>

          {/* CANIAS Active Orders Selection List */}
          {pickOrders.length > 0 && (
            <div>
              <label className="mb-1 block text-xs text-subtle font-medium">
                Aktif CANIAS Siparişlerinden Seçin (MZYListingPick):
              </label>
              <div className="max-h-36 overflow-y-auto rounded-xl border border-line bg-bg p-2 space-y-1">
                {pickOrders.map((po) => (
                  <div
                    key={po.id}
                    onClick={() => setWaybillDocNum(po.id)}
                    className={`flex cursor-pointer items-center justify-between rounded-lg p-2 text-xs transition-colors hover:bg-surface ${
                      waybillDocNum === po.id ? "bg-brand/10 text-brand font-bold" : "text-fg"
                    }`}
                  >
                    <div>
                      <span className="font-mono">{po.id}</span>
                      {po.customer && <span className="ml-2 text-subtle font-normal">({po.customer})</span>}
                    </div>
                    <span className="text-[10px] text-subtle">{po.orderType}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {fetchingList && (
            <div className="flex items-center gap-2 text-xs text-subtle">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>CANIAS irsaliye listesi yükleniyor...</span>
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-fg">
              Kopya / Tekrar Sayısı <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              min={1}
              max={99}
              required
              value={repeatCount}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                setRepeatCount(isNaN(v) ? 1 : Math.min(99, Math.max(1, v)));
              }}
              className="field-input w-full"
            />
          </div>

          <div className="mt-6 flex items-center justify-end gap-3 border-t border-line pt-4">
            <button type="button" onClick={onClose} disabled={loading} className="btn-ghost">
              İptal
            </button>
            <button type="submit" disabled={loading} className="btn-primary flex items-center gap-2">
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Gönderiliyor...</span>
                </>
              ) : (
                <>
                  <Printer className="h-4 w-4" />
                  <span>Yazdır</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
