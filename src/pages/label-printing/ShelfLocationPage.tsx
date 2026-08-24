import { useEffect, useMemo, useState } from "react";
import { Warehouse, Search, Printer, MapPin, Check, RefreshCw, Loader2 } from "lucide-react";
import { api } from "../../api/client";
import type { StockRow } from "../../types";
import PageHeader from "../../components/PageHeader";
import Pagination, { usePagination } from "../../components/Pagination";

interface RealShelf {
  warehouse: string;
  stockPlace: string;
  materials: string[];
  totalStock: number;
}

export default function ShelfLocationPage() {
  const [stockRows, setStockRows] = useState<StockRow[]>([]);
  const [loadingStock, setLoadingStock] = useState(false);
  const [q, setQ] = useState("");

  // Multi-selection state
  const [selectedShelves, setSelectedShelves] = useState<RealShelf[]>([]);
  const [repeatCount, setRepeatCount] = useState<number | string>(1);
  const [printing, setPrinting] = useState(false);

  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  useEffect(() => {
    fetchRealShelves();
  }, []);

  const fetchRealShelves = async () => {
    setLoadingStock(true);
    try {
      const rows = await api.queryStock({});
      setStockRows(rows || []);
    } catch {
      setStockRows([]);
    } finally {
      setLoadingStock(false);
    }
  };

  // Group CANIAS stock rows into unique real shelf locations
  const realShelves = useMemo(() => {
    const map = new Map<string, RealShelf>();
    for (const r of stockRows) {
      const sp = (r.stockPlace || "").trim();
      const wh = (r.warehouse || "").trim();
      if (!sp) continue;

      const key = `${wh}/${sp}`;
      if (!map.has(key)) {
        map.set(key, {
          warehouse: wh,
          stockPlace: sp,
          materials: r.material ? [r.material] : [],
          totalStock: r.availStock || 0,
        });
      } else {
        const item = map.get(key)!;
        if (r.material && !item.materials.includes(r.material)) {
          item.materials.push(r.material);
        }
        item.totalStock += r.availStock || 0;
      }
    }
    return Array.from(map.values());
  }, [stockRows]);

  // Filter real shelves by single search term
  const filteredShelves = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return realShelves;
    return realShelves.filter(
      (sh) =>
        sh.stockPlace.toLowerCase().includes(s) ||
        sh.warehouse.toLowerCase().includes(s) ||
        `${sh.warehouse}/${sh.stockPlace}`.toLowerCase().includes(s) ||
        sh.materials.some((m) => m.toLowerCase().includes(s))
    );
  }, [realShelves, q]);

  const pg = usePagination(filteredShelves, 9);
  useEffect(() => pg.reset(), [q]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleSelectShelf = (shelf: RealShelf) => {
    setSelectedShelves((prev) => {
      const exists = prev.some((s) => s.warehouse === shelf.warehouse && s.stockPlace === shelf.stockPlace);
      if (exists) {
        return prev.filter((s) => !(s.warehouse === shelf.warehouse && s.stockPlace === shelf.stockPlace));
      }
      return [...prev, shelf];
    });
  };

  const isShelfSelected = (shelf: RealShelf) => {
    return selectedShelves.some((s) => s.warehouse === shelf.warehouse && s.stockPlace === shelf.stockPlace);
  };

  const handlePrintSelected = async () => {
    if (selectedShelves.length === 0) return;
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

    for (const shelf of selectedShelves) {
      try {
        const res = await api.printWHSP({
          company: "01",
          plant: "100",
          warehouse: shelf.warehouse || "10",
          stockPlace: shelf.stockPlace || "",
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
      setSuccessMsg(`Seçilen ${successCount} adet raf etiketinden ${count}'er kopya yazdırıldı.`);
      setSelectedShelves([]);
    } else {
      setErrorMsg(
        `${successCount} raf etiketi yazdırıldı, ${failedCount} adet etikette hata oluştu.${
          lastError ? ` (Detay: ${lastError})` : ""
        }`
      );
    }
  };

  return (
    <div className="mx-auto max-w-6xl p-4 lg:p-8">
      {/* Top Header with Short Search, Kopya Input, & Print Button */}
      <PageHeader
        title="Depo Raf Etiketi Yazdırma"
        subtitle="Gerçek raf adreslerini seçip yazdırın"
        backTo="/label-printing"
        right={
          <div className="hidden sm:flex items-center gap-3">
            {/* Search Bar */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Raf veya Depo Ara..."
                className="field-input w-52 py-1.5 pl-9 text-xs uppercase"
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
              disabled={selectedShelves.length === 0 || printing}
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
                  <span>Yazdır ({selectedShelves.length})</span>
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
            placeholder="Raf veya Depo Ara..."
            className="field-input pl-9 text-xs uppercase"
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
            disabled={selectedShelves.length === 0 || printing}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
          >
            {printing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Printer className="h-4 w-4" />
            )}
            <span>Yazdır ({selectedShelves.length})</span>
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
          CANIAS Gerçek Depo Rafları ({realShelves.length})
          {selectedShelves.length > 0 && (
            <span className="ml-2 text-xs font-semibold text-brand">({selectedShelves.length} Raf Seçili)</span>
          )}
        </h2>
        <button
          type="button"
          onClick={fetchRealShelves}
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
      ) : filteredShelves.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 rounded-2xl border border-line bg-surface text-subtle">
          <Warehouse className="mb-2 h-10 w-10" />
          <p className="text-sm">CANIAS sisteminde aranan kriterlere uygun aktif raf kaydı bulunamadı.</p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {pg.pageItems.map((sh, idx) => {
              const selected = isShelfSelected(sh);
              return (
                <div
                  key={`${sh.warehouse}-${sh.stockPlace}-${idx}`}
                  onClick={() => toggleSelectShelf(sh)}
                  className={`relative flex cursor-pointer flex-col justify-between rounded-2xl border p-5 text-left shadow-card transition-all hover:shadow-soft ${
                    selected
                      ? "border-emerald-500 bg-emerald-500/10 ring-2 ring-emerald-500/30"
                      : "border-line bg-surface hover:border-emerald-300"
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <MapPin className="h-5 w-5 text-rose-500 shrink-0" />
                        <span className="font-mono text-base font-extrabold text-fg">{sh.stockPlace}</span>
                      </div>
                      <span className="chip bg-rose-100 text-rose-700 font-mono text-xs dark:bg-rose-900/30 dark:text-rose-300">
                        Depo {sh.warehouse}
                      </span>
                    </div>

                    {sh.materials.length > 0 && (
                      <p className="mt-2 line-clamp-1 text-xs text-subtle">
                        Malzeme: {sh.materials.slice(0, 2).join(", ")} {sh.materials.length > 2 ? "..." : ""}
                      </p>
                    )}
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t border-line/60 pt-3 text-xs">
                    <span className="font-mono text-subtle">
                      Toplam Stok: {sh.totalStock}
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
              label="Raf"
            />
          </div>
        </>
      )}
    </div>
  );
}
