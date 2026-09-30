import { useState } from "react";
import { Warehouse, Printer, MapPin, Check, Loader2, Search } from "lucide-react";
import { api } from "../../api/client";
import PageHeader from "../../components/PageHeader";
import Pagination, { usePagination } from "../../components/Pagination";

type StockPlace = { code: string; name: string };

// Raf Etiketi Bastırma — Bora: DEPO verilir, o depodaki raflar (stok yerleri)
// MZYGetStockPlace (PSCOMPANY=01, PSPLANT=100, PSWAREHOUSE) ile listelenir.
// Seçilen raflar için baskı sayısı sorulur ve MZYPrintWHSP ile yazdırılır.
export default function ShelfLocationPage() {
  const [warehouse, setWarehouse] = useState("");
  const [loadedWarehouse, setLoadedWarehouse] = useState("");
  const [places, setPlaces] = useState<StockPlace[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [q, setQ] = useState("");

  const [selected, setSelected] = useState<StockPlace[]>([]);
  const [repeatCount, setRepeatCount] = useState<number | string>(1);
  const [printing, setPrinting] = useState(false);

  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const fetchPlaces = async () => {
    const wh = warehouse.trim();
    setErrorMsg("");
    setSuccessMsg("");
    if (!wh) {
      setErrorMsg("Lütfen depo (warehouse) girin.");
      return;
    }
    setLoading(true);
    setSearched(false);
    setSelected([]);
    try {
      // Bora: GetStockPlace → firma 01, tesis 100, depo = rafları istenen depo
      const rows = await api.getStockPlaces(wh);
      setPlaces(rows || []);
      setLoadedWarehouse(wh);
      setSearched(true);
    } catch (e) {
      setPlaces([]);
      setSearched(true);
      setErrorMsg(e instanceof Error ? e.message : "Raflar getirilemedi.");
    } finally {
      setLoading(false);
    }
  };

  const filtered = places.filter((p) => {
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return p.code.toLowerCase().includes(s) || (p.name || "").toLowerCase().includes(s);
  });

  const pg = usePagination(filtered, 12);

  const isSelected = (p: StockPlace) => selected.some((x) => x.code === p.code);
  const toggleSelect = (p: StockPlace) => {
    setSelected((prev) =>
      prev.some((x) => x.code === p.code) ? prev.filter((x) => x.code !== p.code) : [...prev, p]
    );
  };

  const handlePrintSelected = async () => {
    if (selected.length === 0) return;
    setErrorMsg("");
    setSuccessMsg("");

    const count = Number(repeatCount);
    if (!Number.isInteger(count) || count < 1 || count > 99) {
      setErrorMsg("Baskı sayısı en az 1 olmalıdır (1-99 arası).");
      return;
    }

    setPrinting(true);
    let successCount = 0;
    let failedCount = 0;
    let lastError = "";

    for (const p of selected) {
      try {
        const res = await api.printWHSP({
          warehouse: loadedWarehouse,
          stockPlace: p.code,
          repeat: count,
        });
        if (res.ok) successCount++;
        else {
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
      setSuccessMsg(`Seçilen ${successCount} raf etiketinden ${count}'er kopya yazdırma isteği iletildi.`);
      setSelected([]);
    } else {
      setErrorMsg(
        `${successCount} raf etiketi yazdırıldı, ${failedCount} adet etikette hata oluştu.${
          lastError ? ` (Detay: ${lastError})` : ""
        }`
      );
    }
  };

  return (
    <div className="mx-auto max-w-5xl p-4 lg:p-8 space-y-5">
      <PageHeader
        title="Depo Raf Etiketi Yazdırma"
        subtitle="Depoyu girin, raflar listelensin; seçip baskı sayısıyla yazdırın"
        backTo="/label-printing"
        right={
          places.length > 0 ? (
            <div className="hidden sm:flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-fg whitespace-nowrap">Kopya:</span>
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={repeatCount}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "") {
                      setRepeatCount("");
                      return;
                    }
                    const v = parseInt(val, 10);
                    if (!isNaN(v)) setRepeatCount(Math.min(99, Math.max(1, v)));
                  }}
                  onBlur={() => {
                    if (repeatCount === "" || Number(repeatCount) < 1) setRepeatCount(1);
                  }}
                  className="field-input w-16 py-1.5 px-2 text-center text-xs font-bold"
                />
              </div>
              <button
                type="button"
                onClick={handlePrintSelected}
                disabled={selected.length === 0 || printing}
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
                    <span>Yazdır ({selected.length})</span>
                  </>
                )}
              </button>
            </div>
          ) : undefined
        }
      />

      {/* Depo giriş kartı */}
      <div className="card p-4 shadow-card">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="mb-1.5 block text-xs font-semibold text-fg">
              Depo (Warehouse) <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Warehouse className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
              <input
                value={warehouse}
                onChange={(e) => setWarehouse(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    fetchPlaces();
                  }
                }}
                placeholder="Örn. 10"
                className="field-input w-full pl-9 text-sm font-mono font-bold uppercase"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={fetchPlaces}
            disabled={loading || !warehouse.trim()}
            className="btn-primary flex items-center justify-center gap-2 px-6 py-2.5 shadow-sm shrink-0 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            <span>Rafları Getir</span>
          </button>
        </div>
      </div>

      {/* Uyarılar */}
      {errorMsg && (
        <div className="flex items-center gap-2.5 rounded-xl border border-red-500/20 bg-red-500/10 p-3.5 text-xs text-red-600 dark:text-red-400">
          <span>{errorMsg}</span>
        </div>
      )}
      {successMsg && (
        <div className="flex items-center gap-2.5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3.5 text-xs text-emerald-600 dark:text-emerald-400">
          <span>{successMsg}</span>
        </div>
      )}

      {/* Mobil: Kopya + Yazdır */}
      {places.length > 0 && (
        <div className="flex items-center justify-between gap-3 sm:hidden">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-fg">Kopya:</span>
            <input
              type="number"
              min={1}
              max={99}
              value={repeatCount}
              onChange={(e) => {
                const val = e.target.value;
                if (val === "") {
                  setRepeatCount("");
                  return;
                }
                const v = parseInt(val, 10);
                if (!isNaN(v)) setRepeatCount(Math.min(99, Math.max(1, v)));
              }}
              onBlur={() => {
                if (repeatCount === "" || Number(repeatCount) < 1) setRepeatCount(1);
              }}
              className="field-input w-20 py-1.5 px-2 text-center text-xs font-bold"
            />
          </div>
          <button
            type="button"
            onClick={handlePrintSelected}
            disabled={selected.length === 0 || printing}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
          >
            {printing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
            <span>Yazdır ({selected.length})</span>
          </button>
        </div>
      )}

      {/* Raf listesi */}
      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-2xl bg-elevated" />
          ))}
        </div>
      ) : places.length > 0 ? (
        <>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-fg">
              Depo {loadedWarehouse} · Raflar ({places.length})
              {selected.length > 0 && (
                <span className="ml-2 text-xs font-semibold text-brand">({selected.length} seçili)</span>
              )}
            </h2>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-subtle" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Raf ara..."
                className="field-input w-40 py-1 pl-8 text-xs uppercase"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pg.pageItems.map((p) => {
              const sel = isSelected(p);
              return (
                <button
                  key={p.code}
                  type="button"
                  onClick={() => toggleSelect(p)}
                  className={`flex items-center justify-between gap-2 rounded-2xl border p-4 text-left shadow-card transition-all ${
                    sel
                      ? "border-emerald-500 bg-emerald-500/10 ring-2 ring-emerald-500/30"
                      : "border-line bg-surface hover:border-emerald-300"
                  }`}
                >
                  <span className="inline-flex min-w-0 items-center gap-2">
                    <MapPin className="h-4 w-4 shrink-0 text-rose-500" />
                    <span className="min-w-0">
                      <span className="block truncate font-mono text-sm font-bold text-fg">{p.code}</span>
                      {p.name && p.name !== p.code && (
                        <span className="block truncate text-[11px] text-subtle">{p.name}</span>
                      )}
                    </span>
                  </span>
                  <span
                    className={`chip shrink-0 text-[11px] ${
                      sel ? "bg-emerald-600 text-white" : "bg-elevated text-subtle"
                    }`}
                  >
                    {sel ? <Check className="mr-1 inline h-3.5 w-3.5" /> : null}
                    {sel ? "Seçildi" : "Seç"}
                  </span>
                </button>
              );
            })}
          </div>

          <Pagination
            page={pg.page}
            pageCount={pg.pageCount}
            onChange={pg.setPage}
            rangeStart={pg.rangeStart}
            rangeEnd={pg.rangeEnd}
            total={pg.total}
            label="Raf"
          />
        </>
      ) : searched ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-line bg-surface py-16 text-subtle">
          <Warehouse className="mb-2 h-10 w-10 opacity-40" />
          <p className="text-sm">Depo {loadedWarehouse} için raf (stok yeri) bulunamadı.</p>
        </div>
      ) : null}
    </div>
  );
}
