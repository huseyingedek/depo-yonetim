import { useState, useEffect } from "react";
import { Package, X, CheckCircle2, AlertCircle, Loader2, RefreshCw, Printer } from "lucide-react";
import BarcodeScanner from "../../../components/BarcodeScanner";
import { api } from "../../../api/client";
import { useAppStore } from "../../../store/appStore";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function PackagingLabelModal({ isOpen, onClose }: Props) {
  const settings = useAppStore((s) => s.settings);

  const [containerCode, setContainerCode] = useState("");
  const [repeatCount, setRepeatCount] = useState<number>(1);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  useEffect(() => {
    if (isOpen) {
      setContainerCode("");
      setRepeatCount(1);
      setErrorMsg("");
      setSuccessMsg("");
      setLoading(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const resetForm = () => {
    setContainerCode("");
    setRepeatCount(1);
    setSuccessMsg("");
    setErrorMsg("");
  };

  const handlePrintSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    const code = containerCode.trim();
    if (!code) {
      setErrorMsg("Konteyner / Palet numarası boş bırakılamaz.");
      return;
    }

    const count = Number(repeatCount);
    if (!Number.isInteger(count) || count < 1) {
      setErrorMsg("Kopya (tekrar) sayısı en az 1 olmalıdır.");
      return;
    }

    setLoading(true);

    try {
      const res = await api.printContainer({
        warehouse: settings.warehouse || "10",
        container: code,
        repeat: count,
      });

      if (res.ok) {
        setSuccessMsg(res.message || `${code} paketleme etiketi yazdırma isteği CANIAS'a iletildi.`);
      } else {
        setErrorMsg(res.message || "Etiket yazdırma başarısız oldu.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Yazdırma işlemi sırasında hata oluştu.";
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg rounded-2xl border border-line bg-surface p-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 dark:bg-blue-900/30">
              <Package className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-fg">Paketleme Etiketi Yazdırma</h3>
              <p className="text-xs text-subtle">Koli / Palet etiketi parametrelerini girin (Servis: MZYPrintContainer)</p>
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
              Palet / Koli / Konteyner Kodu <span className="text-red-500">*</span>
            </label>
            <div className="space-y-2">
              <input
                type="text"
                required
                value={containerCode}
                onChange={(e) => setContainerCode(e.target.value)}
                placeholder="Örn: PALET001 veya KOLI-892"
                className="field-input w-full"
              />
              <div className="pt-1">
                <BarcodeScanner
                  prompt="Koli / Palet Barkodunu Okutun"
                  prefill={containerCode}
                  onDetected={(code) => setContainerCode(code)}
                />
              </div>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-fg">
              Kopya / Tekrar Sayısı (PIREPEAT) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              min={1}
              max={99}
              required
              value={repeatCount}
              onChange={(e) => setRepeatCount(Math.max(1, parseInt(e.target.value) || 1))}
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
