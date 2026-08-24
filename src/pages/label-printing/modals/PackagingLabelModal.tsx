import { useState, useEffect } from "react";
import { Package, X, CheckCircle2, AlertCircle, Loader2, RefreshCw, Printer, MapPin } from "lucide-react";
import { api } from "../../../api/client";
import { useAppStore } from "../../../store/appStore";
import type { StockRow } from "../../../types";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function PackagingLabelModal({ isOpen, onClose }: Props) {
  const settings = useAppStore((s) => s.settings);

  const [containerCode, setContainerCode] = useState("");
  const [repeatCount, setRepeatCount] = useState<number | string>(1);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const [stockRows, setStockRows] = useState<StockRow[]>([]);
  const [loadingStock, setLoadingStock] = useState(false);
  const [selectedRow, setSelectedRow] = useState<StockRow | null>(null);

  useEffect(() => {
    if (isOpen) {
      setContainerCode("");
      setRepeatCount(1);
      setErrorMsg("");
      setSuccessMsg("");
      setLoading(false);
      setSelectedRow(null);
      fetchPalletStock();
    }
  }, [isOpen]);

  const fetchPalletStock = async () => {
    setLoadingStock(true);
    try {
      // Bora, 05.08: MZYGetStock ile stoktaki paletleri/konteynerları listele (PICONTAINER: 1)
      const rows = await api.queryStock({ container: true });
      setStockRows(rows || []);
    } catch {
      setStockRows([]);
    } finally {
      setLoadingStock(false);
    }
  };

  if (!isOpen) return null;

  const resetForm = () => {
    setContainerCode("");
    setSelectedRow(null);
    setRepeatCount(1);
    setSuccessMsg("");
    setErrorMsg("");
  };

  const handleSelectRow = (r: StockRow) => {
    setSelectedRow(r);
    const code = r.batchNum && r.batchNum !== "*" ? r.batchNum : r.stockPlace || r.material;
    setContainerCode(code);
  };

  const handlePrintSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    const code = (
      selectedRow?.batchNum && selectedRow.batchNum !== "*"
        ? selectedRow.batchNum
        : selectedRow?.stockPlace
    ) || containerCode.trim();

    if (!code) {
      setErrorMsg("Lütfen listeden bir palet seçin.");
      return;
    }

    const count = Number(repeatCount);
    if (!Number.isInteger(count) || count < 1 || count > 99) {
      setErrorMsg("Kopya (tekrar) sayısı en az 1 olmalıdır (1-99 arası).");
      return;
    }

    setLoading(true);

    try {
      // Bora, 05.08: MZYPrintContainer ile batchnumber PSCONTAINER parametresine gönderilir.
      const res = await api.printContainer({
        warehouse: selectedRow?.warehouse || settings.warehouse || "10",
        container: code,
        repeat: count,
      });

      if (res.ok) {
        setSuccessMsg(res.message || `Palet/Paket etiketi (${code} - ${count} kopya) yazdırma isteği CANIAS'a iletildi.`);
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
      <div className="relative flex max-h-[90vh] w-full max-w-xl flex-col rounded-2xl border border-line bg-surface p-6 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line pb-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 dark:bg-blue-900/30">
              <Package className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-fg">Paketleme Etiketi Yazdırma</h3>
              <p className="text-xs text-subtle">Stoktaki paletleri listeden seçin ve etiket yazdırın (MZYPrintContainer)</p>
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

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto pt-4 space-y-4">
          {/* Alerts */}
          {errorMsg && (
            <div className="flex items-start gap-2.5 rounded-xl border border-red-500/20 bg-red-500/10 p-3.5 text-xs text-red-600 dark:text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="flex items-start justify-between gap-2.5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3.5 text-xs text-emerald-600 dark:text-emerald-400">
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

          {/* Form & Selection */}
          <form onSubmit={handlePrintSubmit} className="space-y-4">
            {/* Palet Seçim Listesi */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-fg">
                  Stoktaki Paletler
                </span>
                <button
                  type="button"
                  onClick={fetchPalletStock}
                  disabled={loadingStock}
                  className="flex items-center gap-1 text-[11px] font-semibold text-brand hover:underline"
                >
                  <RefreshCw className={`h-3 w-3 ${loadingStock ? "animate-spin" : ""}`} />
                  Yenile
                </button>
              </div>

              {/* List Container */}
              <div className="max-h-56 overflow-y-auto rounded-xl border border-line bg-bg p-2 space-y-1.5">
                {loadingStock ? (
                  <div className="flex items-center justify-center py-8 text-xs text-subtle gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>CANIAS stoktaki paletler yükleniyor...</span>
                  </div>
                ) : stockRows.length === 0 ? (
                  <div className="py-6 text-center text-xs text-subtle">
                    Stokta aktif palet kaydı bulunamadı.
                  </div>
                ) : (
                  stockRows.map((r, idx) => {
                    const isSelected =
                      selectedRow === r ||
                      (selectedRow?.batchNum && selectedRow.batchNum === r.batchNum && selectedRow.stockPlace === r.stockPlace);
                    const palletCode = r.batchNum && r.batchNum !== "*" ? r.batchNum : r.stockPlace;

                    return (
                      <div
                        key={`${r.material}|${r.warehouse}|${r.stockPlace}|${r.batchNum || idx}`}
                        onClick={() => handleSelectRow(r)}
                        className={`flex cursor-pointer items-start justify-between rounded-lg p-2.5 text-xs transition-all border ${
                          isSelected
                            ? "border-brand bg-brand/10 font-medium shadow-sm"
                            : "border-transparent bg-surface hover:bg-elevated text-fg"
                        }`}
                      >
                        <div className="min-w-0 pr-2">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-fg">{palletCode || r.material}</span>
                            {r.warehouse && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] text-cyan-600 font-mono">
                                <MapPin className="h-3 w-3" /> {r.warehouse}{r.stockPlace ? "/" + r.stockPlace : ""}
                              </span>
                            )}
                          </div>
                          <p className="truncate text-[11px] text-subtle mt-0.5">{r.name || r.material}</p>
                        </div>
                        <div className="shrink-0 text-right font-mono text-xs font-bold text-fg">
                          {r.availStock} <span className="text-[10px] font-normal text-subtle">{r.unit}</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Seçilen Palet Bilgisi Gösterimi */}
            {selectedRow && (
              <div className="rounded-xl border border-brand/30 bg-brand/5 p-3 text-xs">
                <span className="block text-[11px] font-semibold text-brand">Seçilen Palet:</span>
                <div className="mt-1 flex items-center justify-between font-mono font-bold text-fg">
                  <span>Parti No: {selectedRow.batchNum || selectedRow.stockPlace}</span>
                  <span>{selectedRow.warehouse}/{selectedRow.stockPlace}</span>
                </div>
              </div>
            )}

            {/* Kopya Sayısı */}
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

            {/* Actions */}
            <div className="mt-6 flex items-center justify-end gap-3 border-t border-line pt-4 shrink-0">
              <button type="button" onClick={onClose} disabled={loading} className="btn-ghost">
                İptal
              </button>
              <button type="submit" disabled={loading || !selectedRow} className="btn-primary flex items-center gap-2">
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
    </div>
  );
}
