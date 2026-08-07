import { useEffect, useState } from "react";
import { Package, RefreshCw, MapPin, Plus } from "lucide-react";
import { api } from "../../api/client";
import { useAppStore } from "../../store/appStore";
import type { StockRow } from "../../types";
import Pagination, { usePagination } from "../../components/Pagination";
import LabelOrderQueueHeader, { type QueuedLabelOrder } from "./components/LabelOrderQueueHeader";

export default function PackagingLabelPage() {
  const settings = useAppStore((s) => s.settings);

  const [stockRows, setStockRows] = useState<StockRow[]>([]);
  const [loadingStock, setLoadingStock] = useState(false);
  const [selectedRow, setSelectedRow] = useState<StockRow | null>(null);
  const [repeatCount, setRepeatCount] = useState<number>(1);

  // Queue state local to this page
  const [queuedOrders, setQueuedOrders] = useState<QueuedLabelOrder[]>([]);
  const [printing, setPrinting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const pg = usePagination(stockRows, 9);

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

  const handleAddOrder = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    if (!selectedRow) {
      setErrorMsg("Lütfen listeden bir palet/paket seçin.");
      return;
    }

    const code =
      (selectedRow.batchNum && selectedRow.batchNum !== "*"
        ? selectedRow.batchNum
        : selectedRow.stockPlace) || selectedRow.material;

    const count = Number(repeatCount);
    if (!Number.isInteger(count) || count < 1 || count > 99) {
      setErrorMsg("Kopya sayısı 1 ile 99 arasında olmalıdır.");
      return;
    }

    const newOrder: QueuedLabelOrder = {
      id: "pkg-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6),
      title: `Palet: ${code}`,
      subtitle: `${selectedRow.name || selectedRow.material} (${selectedRow.warehouse}/${selectedRow.stockPlace || "-"})`,
      copies: count,
      payload: {
        warehouse: selectedRow.warehouse || settings.warehouse || "10",
        container: code,
        repeat: count,
      },
    };

    setQueuedOrders((prev) => [...prev, newOrder]);
    setSelectedRow(null);
    setRepeatCount(1);
    setSuccessMsg(`Etiket siparişi eklendi (${code} - ${count} kopya). Sipariş sayacından inceleyebilirsiniz.`);
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
        const payload = ord.payload as { warehouse: string; container: string; repeat: number };
        const res = await api.printContainer(payload);
        if (res.ok) successCount++;
        else failedCount++;
      } catch {
        failedCount++;
      }
    }

    setPrinting(false);
    if (failedCount === 0) {
      setSuccessMsg(`Toplam ${successCount} adet etiket siparişi başarıyla CANIAS'a iletildi ve yazdırıldı.`);
      setQueuedOrders([]);
    } else {
      setErrorMsg(`${successCount} etiket yazdırıldı, ${failedCount} adet siparişte hata oluştu.`);
    }
  };

  return (
    <div className="mx-auto max-w-6xl p-4 lg:p-8">
      <LabelOrderQueueHeader
        title="Paketleme Etiketi Yazdırma"
        subtitle="Stoktaki palet ve paket etiketlerini siparişe ekleyip yazdırın (MZYPrintContainer)"
        icon={Package}
        iconBg="bg-blue-100 dark:bg-blue-900/30"
        iconFg="text-blue-600 dark:text-blue-400"
        queuedOrders={queuedOrders}
        onRemoveOrder={handleRemoveOrder}
        onPrintAll={handlePrintAll}
        printing={printing}
        errorMsg={errorMsg}
        successMsg={successMsg}
      />

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-bold text-fg">Stoktaki Paletler ({stockRows.length})</h2>
        <button
          type="button"
          onClick={fetchPalletStock}
          disabled={loadingStock}
          className="flex items-center gap-1.5 text-xs font-semibold text-brand hover:underline"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loadingStock ? "animate-spin" : ""}`} />
          Stok Yenile
        </button>
      </div>

      {/* 3x3 Grid Items */}
      {loadingStock ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-2xl bg-elevated" />
          ))}
        </div>
      ) : stockRows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 rounded-2xl border border-line bg-surface text-subtle">
          <Package className="mb-2 h-10 w-10" />
          <p className="text-sm">Stokta aktif palet kaydı bulunamadı.</p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {pg.pageItems.map((r, idx) => {
              const isSelected = selectedRow === r;
              const palletCode = r.batchNum && r.batchNum !== "*" ? r.batchNum : r.stockPlace || r.material;

              return (
                <div
                  key={`${r.material}|${r.warehouse}|${r.stockPlace}|${r.batchNum || idx}`}
                  onClick={() => setSelectedRow(r)}
                  className={`relative flex cursor-pointer flex-col justify-between rounded-2xl border p-5 text-left shadow-card transition-all hover:shadow-soft ${
                    isSelected
                      ? "border-brand bg-brand/10 ring-2 ring-brand/30"
                      : "border-line bg-surface hover:border-brand-300"
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
                        isSelected ? "bg-brand text-white" : "bg-elevated text-subtle"
                      }`}
                    >
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
              label="Palet"
            />
          </div>
        </>
      )}

      {/* Selected Item & Order Add Form */}
      <form onSubmit={handleAddOrder} className="mt-6 rounded-2xl border border-line bg-surface p-5 shadow-card">
        <h3 className="text-sm font-bold text-fg mb-3">Siparişe Eklenecek Etiket Detayı</h3>
        
        {selectedRow ? (
          <div className="mb-4 rounded-xl border border-brand/30 bg-brand/5 p-3 text-xs">
            <span className="block font-semibold text-brand">Seçilen Palet:</span>
            <div className="mt-1 flex flex-wrap items-center justify-between font-mono font-bold text-fg gap-2">
              <span>Palet/Parti: {selectedRow.batchNum || selectedRow.stockPlace}</span>
              <span>Malzeme: {selectedRow.material}</span>
              <span>Konum: {selectedRow.warehouse}/{selectedRow.stockPlace}</span>
            </div>
          </div>
        ) : (
          <div className="mb-4 rounded-xl border border-line bg-bg p-3 text-xs text-subtle">
            Yukarıdaki 3x3 ızgaradan yazdırmak istediğiniz paleti tıklayarak seçin.
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-end gap-4">
          <div className="w-full sm:w-48">
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

          <button
            type="submit"
            disabled={!selectedRow}
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
