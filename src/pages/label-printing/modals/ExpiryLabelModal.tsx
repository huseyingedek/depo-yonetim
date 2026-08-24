import { useState, useEffect } from "react";
import { CalendarDays, X, CheckCircle2, AlertCircle, Loader2, RefreshCw, Printer } from "lucide-react";
import { api } from "../../../api/client";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function ExpiryLabelModal({ isOpen, onClose }: Props) {
  const [materialCode, setMaterialCode] = useState("");
  const [batchNum, setBatchNum] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [repeatCount, setRepeatCount] = useState<number | string>(1);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  useEffect(() => {
    if (isOpen) {
      setMaterialCode("");
      setBatchNum("");
      setExpiryDate("");
      setRepeatCount(1);
      setErrorMsg("");
      setSuccessMsg("");
      setLoading(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const resetForm = () => {
    setMaterialCode("");
    setBatchNum("");
    setExpiryDate("");
    setRepeatCount(1);
    setSuccessMsg("");
    setErrorMsg("");
  };

  const handlePrintSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    const mat = materialCode.trim();
    const lot = batchNum.trim();
    const exp = expiryDate.trim();

    if (!mat) {
      setErrorMsg("Malzeme Kodu girilmelidir.");
      return;
    }
    if (!lot && !exp) {
      setErrorMsg("Lütfen Parti / Lot Numarası veya Son Kullanma Tarihi girin.");
      return;
    }

    const count = Number(repeatCount);
    if (!Number.isInteger(count) || count < 1 || count > 99) {
      setErrorMsg("Kopya (tekrar) sayısı en az 1 olmalıdır (1-99 arası).");
      return;
    }

    setLoading(true);

    try {
      // Bora: SKT / Parti / Batch etiketi basımı MZYPrintBarcode ile
      const targetBarcode = lot || exp;
      const res = await api.printBarcode({
        company: "01",
        plant: "100",
        barcode: targetBarcode,
        repeat: count,
      });

      if (res.ok) {
        setSuccessMsg(
          res.message ||
            `SKT/Parti etiketi (${mat} - ${lot ? `Lot: ${lot}` : `SKT: ${exp}`} - ${count} kopya) yazdırma isteği CANIAS'a iletildi.`
        );
      } else {
        setErrorMsg(res.message || "SKT etiketi yazdırma başarısız oldu.");
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
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-900/30">
              <CalendarDays className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-fg">SKT Etiketi Yazdırma</h3>
              <p className="text-xs text-subtle">Parti, lot ve son kullanma tarihli ürün etiketleri</p>
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
              Malzeme Kodu <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={materialCode}
              onChange={(e) => setMaterialCode(e.target.value)}
              placeholder="Örn: UD009"
              className="field-input w-full"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-fg">
              Parti / Lot Numarası
            </label>
            <input
              type="text"
              value={batchNum}
              onChange={(e) => setBatchNum(e.target.value)}
              placeholder="Örn: LOT-2026-08"
              className="field-input w-full"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-fg">
              Son Kullanma Tarihi (SKT)
            </label>
            <input
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
              className="field-input w-full"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-fg">
              Kopya / Tekrar Sayısı <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              min={0}
              max={99}
              required
              value={repeatCount}
              onChange={(e) => {
                const val = e.target.value;
                if (val === "") {
                  setRepeatCount("");
                  return;
                }
                const v = parseInt(val, 10);
                if (!isNaN(v)) {
                  setRepeatCount(Math.min(99, Math.max(0, v)));
                }
              }}
              onBlur={() => {
                if (repeatCount === "") {
                  setRepeatCount(0);
                }
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
