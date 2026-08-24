import { useEffect, useMemo, useState } from "react";
import { Package, Search, Printer, RefreshCw, MapPin, Check, Loader2 } from "lucide-react";
import { api } from "../../api/client";
import { useAppStore } from "../../store/appStore";
import type { StockRow } from "../../types";
import PageHeader from "../../components/PageHeader";
import Pagination, { usePagination } from "../../components/Pagination";

export default function PackagingLabelPage() {
  const settings = useAppStore((s) => s.settings);

  const [stockRows, setStockRows] = useState<StockRow[]>([]);
  const [loadingStock, setLoadingStock] = useState(false);
  const [q, setQ] = useState("");

  // Multi-selection state
  const [selectedPallets, setSelectedPallets] = useState<StockRow[]>([]);
  const [repeatCount, setRepeatCount] = useState<number | string>(1);
  const [printing, setPrinting] = useState(false);

  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  useEffect(() => {
    fetchPalletStock();
  }, []);

  const fetchPalletStock = async () => {
    setLoadingStock(true);
    try {
      const rows = await api.queryStock({ container: true });
      setStockRows(rows || []);
    } catch {
      setStockRows([]);
    } finally {
      setLoadingStock(false);
    }
  };

  const filteredStockRows = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return stockRows;
    return stockRows.filter((r) => {
      const palletCode = (r.batchNum && r.batchNum !== "*" ? r.batchNum : r.stockPlace || r.material).toLowerCase();
      const name = (r.name || "").toLowerCase();
      const mat = (r.material || "").toLowerCase();
      return palletCode.includes(s) || name.includes(s) || mat.includes(s);
    });
  }, [stockRows, q]);

  const pg = usePagination(filteredStockRows, 9);
  useEffect(() => pg.reset(), [q]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleSelectPallet = (pallet: StockRow) => {
    setSelectedPallets((prev) => {
      const exists = prev.some(
        (p) => p.material === pallet.material && p.warehouse === pallet.warehouse && p.stockPlace === pallet.stockPlace && p.batchNum === pallet.batchNum
      );
      if (exists) {
        return prev.filter(
          (p) => !(p.material === pallet.material && p.warehouse === pallet.warehouse && p.stockPlace === pallet.stockPlace && p.batchNum === pallet.batchNum)
        );
      }
      return [...prev, pallet];
    });
  };

  const isPalletSelected = (pallet: StockRow) => {
    return selectedPallets.some(
      (p) => p.material === pallet.material && p.warehouse === pallet.warehouse && p.stockPlace === pallet.stockPlace && p.batchNum === pallet.batchNum
    );
  };

  const handlePrintSelected = async () => {
    if (selectedPallets.length === 0) return;
    setErrorMsg("");
    setSuccessMsg("");

    const count = Number(repeatCount);
    if (!Number.isInteger(count) || count < 1 || count > 99) {
      setErrorMsg("Kopya sayısı en az 1 olmalıdır (1-99 arası).");
      return;
    }

    setPrinting(true);
    let successCount = 0;
    let failedCount = 0;
    let lastError = "";

    for (const pallet of selectedPallets) {
      const code = (pallet.batchNum && pallet.batchNum !== "*" ? pallet.batchNum : pallet.stockPlace) || pallet.material;
      try {
        const res = await api.printContainer({
          company: "01",
          plant: "100",
          warehouse: pallet.warehouse || settings.warehouse || "10",
          container: code,
          repeat: count,
        });
        if (res.ok) {
          successCount++;
        } else {
          failedCount++;
          if (res.message) lastError = res.message;
        }
      } catch (err: unknown) {
        failedCount++;
        if (err instanceof Error) lastError = err.message;
      }
    }

    setPrinting(false);
    setRepeatCount(1);
    if (failedCount === 0) {
      setSuccessMsg(`Seçilen ${successCount} adet palet etiketinden ${count}'er kopya yazdırıldı.`);
      setSelectedPallets([]);
    } else {
      setErrorMsg(
        `${successCount} palet etiketi yazdırıldı, ${failedCount} adet etikette hata oluştu.${
          lastError ? ` (Detay: ${lastError})` : ""
        }`
      );
    }
  };

  return (
    <div className="mx-auto max-w-6xl p-4 lg:p-8">
      {/* Top Header with Short Search, Kopya Input, & Print Button */}
      <PageHeader
        title="Paketleme Etiketi Yazdırma"
        subtitle="Stoktaki paletleri seçip yazdırın"
        backTo="/label-printing"
        right={
          <div className="hidden sm:flex items-center gap-3">
            {/* Search Bar */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Palet veya Malzeme Ara..."
                className="field-input w-52 py-1.5 pl-9 text-xs"
              />
            </div>

            {/* Kopya Sayısı Input */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-fg whitespace-nowrap">Kopya:</span>
              <input
                type="number"
                min={0}
                max={99}
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
                className="field-input w-16 py-1.5 px-2 text-center text-xs font-bold"
              />
            </div>

            {/* Yazdır Button */}
            <button
              type="button"
              onClick={handlePrintSelected}
              disabled={selectedPallets.length === 0 || printing}
              className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
            >
              {printing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Yazdırılıyor...</span>
                </>
              ) : (
                <>
                  <Printer className="h-4 w-4" />
                  <span>Yazdır ({selectedPallets.length})</span>
                </>
              )}
            </button>
          </div>
        }
      />

      {/* Mobile Search & Action Bar */}
      <div className="mb-5 flex flex-col gap-3 sm:hidden">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Palet veya Malzeme Ara..."
            className="field-input pl-9 text-xs"
          />
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-fg">Kopya Sayısı:</span>
            <input
              type="number"
              min={0}
              max={99}
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
              className="field-input w-20 py-1.5 px-2 text-center text-xs font-bold"
            />
          </div>

          <button
            type="button"
            onClick={handlePrintSelected}
            disabled={selectedPallets.length === 0 || printing}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
          >
            {printing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Printer className="h-4 w-4" />
            )}
            <span>Yazdır ({selectedPallets.length})</span>
          </button>
        </div>
      </div>

      {/* Alerts */}
      {errorMsg && (
        <div className="mb-4 flex items-center gap-2.5 rounded-xl border border-red-500/20 bg-red-500/10 p-3.5 text-xs text-red-600 dark:text-red-400">
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="mb-4 flex items-center gap-2.5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3.5 text-xs text-emerald-600 dark:text-emerald-400">
          <span>{successMsg}</span>
        </div>
      )}

      {/* List Header */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-bold text-fg">
          Stoktaki Paletler ({stockRows.length})
          {selectedPallets.length > 0 && (
            <span className="ml-2 text-xs font-semibold text-brand">({selectedPallets.length} Palet Seçili)</span>
          )}
        </h2>
        <button
          type="button"
          onClick={fetchPalletStock}
          disabled={loadingStock}
          className="flex items-center gap-1.5 text-xs font-semibold text-brand hover:underline"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loadingStock ? "animate-spin" : ""}`} />
          Yenile
        </button>
      </div>

      {/* 3x3 Grid Layout */}
      {loadingStock ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-2xl bg-elevated" />
          ))}
        </div>
      ) : filteredStockRows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 rounded-2xl border border-line bg-surface text-subtle">
          <Package className="mb-2 h-10 w-10" />
          <p className="text-sm">Stokta aktif palet kaydı bulunamadı.</p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {pg.pageItems.map((r, idx) => {
              const selected = isPalletSelected(r);
              const palletCode = r.batchNum && r.batchNum !== "*" ? r.batchNum : r.stockPlace || r.material;

              return (
                <div
                  key={`${r.material}|${r.warehouse}|${r.stockPlace}|${r.batchNum || idx}`}
                  onClick={() => toggleSelectPallet(r)}
                  className={`relative flex cursor-pointer flex-col justify-between rounded-2xl border p-5 text-left shadow-card transition-all hover:shadow-soft ${
                    selected
                      ? "border-emerald-500 bg-emerald-500/10 ring-2 ring-emerald-500/30"
                      : "border-line bg-surface hover:border-emerald-300"
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between">
                      <span className="font-mono text-base font-extrabold text-fg">{palletCode}</span>
                      {r.warehouse && (
                        <span className="inline-flex items-center gap-1 font-mono text-xs font-semibold text-cyan-600 dark:text-cyan-400">
                          <MapPin className="h-3.5 w-3.5" /> Depo {r.warehouse}
                          {r.stockPlace ? " / " + r.stockPlace : ""}
                        </span>
                      )}
                    </div>
                    <p className="mt-2 line-clamp-2 text-xs text-subtle">{r.name || r.material}</p>
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t border-line/60 pt-3">
                    <span className="font-mono text-xs font-bold text-fg">
                      {r.availStock} <span className="text-[11px] font-normal text-subtle">{r.unit}</span>
                    </span>
                    <span
                      className={`chip text-[11px] ${
                        selected ? "bg-emerald-600 text-white" : "bg-elevated text-subtle"
                      }`}
                    >
                      {selected ? <Check className="h-3.5 w-3.5 inline mr-1" /> : null}
                      {selected ? "Seçildi" : "Seç"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4">
            <Pagination
              page={pg.page}
              pageCount={pg.pageCount}
              onChange={pg.setPage}
              rangeStart={pg.rangeStart}
              rangeEnd={pg.rangeEnd}
              total={pg.total}
              label="Palet"
            />
          </div>
        </>
      )}
    </div>
  );
}
