import { useEffect, useMemo, useState } from "react";
import { Warehouse, Search, Plus, MapPin, Check, RefreshCw } from "lucide-react";
import { api } from "../../api/client";
import type { StockRow } from "../../types";
import Pagination, { usePagination } from "../../components/Pagination";
import LabelOrderQueueHeader, { type QueuedLabelOrder } from "./components/LabelOrderQueueHeader";

interface RealShelf {
  warehouse: string;
  stockPlace: string;
  materials: string[];
  totalStock: number;
}

export default function ShelfLocationPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [stockRows, setStockRows] = useState<StockRow[]>([]);
  const [loadingStock, setLoadingStock] = useState(false);
  const [selectedShelf, setSelectedShelf] = useState<RealShelf | null>(null);

  const [repeatCount, setRepeatCount] = useState<number>(1);

  // Queue state local to this page
  const [queuedOrders, setQueuedOrders] = useState<QueuedLabelOrder[]>([]);
  const [printing, setPrinting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  useEffect(() => {
    fetchRealShelves();
  }, []);

  const fetchRealShelves = async () => {
    setLoadingStock(true);
    try {
      // Fetch real stock & shelf places from CANIAS API
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
    const s = searchTerm.trim().toLowerCase();
    if (!s) return realShelves;
    return realShelves.filter(
      (sh) =>
        sh.stockPlace.toLowerCase().includes(s) ||
        sh.warehouse.toLowerCase().includes(s) ||
        `${sh.warehouse}/${sh.stockPlace}`.toLowerCase().includes(s) ||
        sh.materials.some((m) => m.toLowerCase().includes(s))
    );
  }, [realShelves, searchTerm]);

  const pg = usePagination(filteredShelves, 9);
  useEffect(() => pg.reset(), [searchTerm]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAddOrder = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    if (!selectedShelf) {
      setErrorMsg("Lütfen listeden bir raf seçin.");
      return;
    }

    const count = Number(repeatCount);
    if (!Number.isInteger(count) || count < 1 || count > 99) {
      setErrorMsg("Kopya sayısı 1 ile 99 arasında olmalıdır.");
      return;
    }

    const newOrder: QueuedLabelOrder = {
      id: "shelf-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6),
      title: `Depo Raf Etiketi: ${selectedShelf.warehouse}/${selectedShelf.stockPlace}`,
      subtitle: `Depo: ${selectedShelf.warehouse} · Raf: ${selectedShelf.stockPlace}`,
      copies: count,
      payload: {
        warehouse: selectedShelf.warehouse,
        stockPlace: selectedShelf.stockPlace,
        repeat: count,
      },
    };

    setQueuedOrders((prev) => [...prev, newOrder]);
    setSelectedShelf(null);
    setRepeatCount(1);
    setSuccessMsg(`Depo raf etiket siparişi eklendi (${selectedShelf.warehouse}/${selectedShelf.stockPlace} - ${count} kopya).`);
  };

  const handleRemoveOrder = (id: string) => {
    setQueuedOrders((prev) => prev.filter((o) => o.id !== id));
  };

  const handlePrintAll = async () => {
    if (queuedOrders.length === 0) return;
    setPrinting(true);
    setErrorMsg("");
    setSuccessMsg("");

    let successCount = 0;
    let failedCount = 0;

    for (const ord of queuedOrders) {
      try {
        const payload = ord.payload as { warehouse: string; stockPlace: string; repeat: number };
        const res = await api.printWHSP({
          warehouse: payload.warehouse,
          stockPlace: payload.stockPlace,
          repeat: payload.repeat,
          isContainer: 0,
        });
        if (res.ok) successCount++;
        else failedCount++;
      } catch {
        failedCount++;
      }
    }

    setPrinting(false);
    if (failedCount === 0) {
      setSuccessMsg(`Toplam ${successCount} adet raf etiket siparişi başarıyla CANIAS'a iletildi.`);
      setQueuedOrders([]);
    } else {
      setErrorMsg(`${successCount} etiket yazdırıldı, ${failedCount} adet siparişte hata oluştu.`);
    }
  };

  return (
    <div className="mx-auto max-w-6xl p-4 lg:p-8">
      <LabelOrderQueueHeader
        title="Depo Raf Etiketi Yazdırma"
        subtitle="CANIAS stok sistemindeki gerçek raf adreslerini aratıp etiket siparişi ekleyin"
        icon={Warehouse}
        iconBg="bg-rose-100 dark:bg-rose-900/30"
        iconFg="text-rose-600 dark:text-rose-400"
        queuedOrders={queuedOrders}
        onRemoveOrder={handleRemoveOrder}
        onPrintAll={handlePrintAll}
        printing={printing}
        errorMsg={errorMsg}
        successMsg={successMsg}
      />

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-bold text-fg">CANIAS Gerçek Depo Rafları ({realShelves.length})</h2>
        <button
          type="button"
          onClick={fetchRealShelves}
          disabled={loadingStock}
          className="flex items-center gap-1.5 text-xs font-semibold text-brand hover:underline"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loadingStock ? "animate-spin" : ""}`} />
          Rafları Yenile
        </button>
      </div>

      {/* Single Search Bar */}
      <div className="relative mb-5">
        <Search className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-subtle" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Raf Kodu veya Depo Ara (Örn: D1 veya D1$A1)..."
          className="field-input pl-11 uppercase"
        />
      </div>

      {/* Real Shelves 3x3 Grid Layout */}
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
              const isSelected = selectedShelf?.stockPlace === sh.stockPlace && selectedShelf?.warehouse === sh.warehouse;
              return (
                <div
                  key={`${sh.warehouse}-${sh.stockPlace}-${idx}`}
                  onClick={() => setSelectedShelf(sh)}
                  className={`relative flex cursor-pointer flex-col justify-between rounded-2xl border p-5 text-left shadow-card transition-all hover:shadow-soft ${
                    isSelected
                      ? "border-rose-500 bg-rose-500/10 ring-2 ring-rose-500/30"
                      : "border-line bg-surface hover:border-rose-300"
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
                        isSelected ? "bg-rose-600 text-white" : "bg-elevated text-subtle"
                      }`}
                    >
                      {isSelected ? <Check className="h-3.5 w-3.5 inline mr-1" /> : null}
                      {isSelected ? "Seçildi" : "Seç"}
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

      {/* Selected Item & Order Add Form (Read-only shelf input) */}
      <form onSubmit={handleAddOrder} className="mt-6 rounded-2xl border border-line bg-surface p-5 shadow-card">
        <h3 className="text-sm font-bold text-fg mb-3">Siparişe Eklenecek Depo Raf Etiketi Detayı</h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-fg">
              Seçilen Raf Adresi <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              readOnly
              disabled
              value={selectedShelf ? `${selectedShelf.warehouse} / ${selectedShelf.stockPlace}` : ""}
              placeholder="Yukarıdaki listeden bir raf seçin..."
              className="field-input w-full cursor-not-allowed bg-bg font-mono font-bold text-fg opacity-90"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-fg">
              Kopya Sayısı <span className="text-red-500">*</span>
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
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={!selectedShelf}
            className="btn-primary w-full sm:w-auto flex items-center justify-center gap-2 py-2.5 px-6 shadow-sm"
          >
            <Plus className="h-4 w-4" />
            <span>Etiket Siparişi Ekle</span>
          </button>
        </div>
      </form>
    </div>
  );
}
