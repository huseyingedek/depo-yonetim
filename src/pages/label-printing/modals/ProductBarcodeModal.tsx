import { useState, useEffect } from "react";
import { Barcode, X, CheckCircle2, AlertCircle, Loader2, RefreshCw, Printer } from "lucide-react";
import BarcodeScanner from "../../../components/BarcodeScanner";
import { api } from "../../../api/client";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function ProductBarcodeModal({ isOpen, onClose }: Props) {
  const [materialCode, setMaterialCode] = useState("");
  const [repeatCount, setRepeatCount] = useState<number>(1);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  useEffect(() => {
    if (isOpen) {
      setMaterialCode("");
      setRepeatCount(1);
      setErrorMsg("");
      setSuccessMsg("");
      setLoading(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const resetForm = () => {
    setMaterialCode("");
    setRepeatCount(1);
    setSuccessMsg("");
    setErrorMsg("");
  };

  const handlePrintSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    const mat = materialCode.trim();
    if (!mat) {
      setErrorMsg("Malzeme Kodu veya Barkod girilmelidir.");
      return;
    }

    const count = Number(repeatCount);
    if (!Number.isInteger(count) || count < 1 || count > 99) {
      setErrorMsg("Kopya (tekrar) sayısı 1 ile 99 arasında olmalıdır.");
      return;
    }

    setLoading(true);

    try {
      const res = await api.printMaterial({
        container: mat,
        repeat: count,
      });
      if (res.ok) {
        setSuccessMsg(res.message || `Ürün barkod etiketi (${mat} - ${count} kopya) yazdırma isteği CANIAS'a iletildi.`);
      } else {
        setErrorMsg(res.message || "Ürün barkod etiketi yazdırma başarısız oldu.");
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
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-100 dark:bg-purple-900/30">
              <Barcode className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-fg">Ürün Barkodu Yazdırma</h3>
              <p className="text-xs text-subtle">Ürün, malzeme ve EAN/UPC barkod etiketleri</p>
            </div>
          </div>
          <button onClick={onClose} disabled={loading} className="rounded-lg p-1.5 text-subtle hover:bg-bg hover:text-fg">
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
              Malzeme Kodu veya EAN Barkod <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={materialCode}
              onChange={(e) => setMaterialCode(e.target.value)}
              placeholder="Örn: UD009 veya 8690723511208"
              className="field-input w-full"
            />
            <div className="mt-2">
              <BarcodeScanner
                prompt="Ürün Barkodunu Okutun"
                prefill={materialCode}
                onDetected={(code) => setMaterialCode(code)}
              />
            </div>
          </div>

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
