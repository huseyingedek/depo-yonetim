import { useState } from "react";
import { CalendarDays, Search, Plus, Loader2, Package, Check, Calendar } from "lucide-react";
import { api } from "../../api/client";
import type { StockRow } from "../../types";
import Pagination, { usePagination } from "../../components/Pagination";
import LabelOrderQueueHeader, { type QueuedLabelOrder } from "./components/LabelOrderQueueHeader";

type SearchType = "barcode" | "material";

export default function ExpiryLabelPage() {
  // Section 1 State (Search & 3x3 Grid)
  const [searchTerm, setSearchTerm] = useState("");
  const [searchType, setSearchType] = useState<SearchType>("barcode");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<StockRow[]>([]);
  const [selectedMaterial, setSelectedMaterial] = useState<StockRow | null>(null);
  const [repeatCountGrid, setRepeatCountGrid] = useState<number>(1);

  // Section 2 State (Direct SKT Date Form)
  const [directExpiryDate, setDirectExpiryDate] = useState("");
  const [repeatCountDirect, setRepeatCountDirect] = useState<number>(1);

  // Pagination for Section 1 3x3 Grid
  const pg = usePagination(searchResults, 9);
  const [searchDone, setSearchDone] = useState(false);

  // Queue state local to this page
  const [queuedOrders, setQueuedOrders] = useState<QueuedLabelOrder[]>([]);
  const [printing, setPrinting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const handleSearchMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    const term = searchTerm.trim();
    if (!term) {
      setErrorMsg("Lütfen barkod numarası veya ürün kodu girin.");
      return;
    }

    setSearching(true);
    setSelectedMaterial(null);
    setSearchDone(false);

    try {
      let rows: StockRow[] = [];
      if (searchType === "barcode") {
        rows = await api.queryStock({ barcode: term });
      } else {
        rows = await api.queryStock({ material: term });
      }

      setSearchResults(rows || []);
      setSearchDone(true);
    } catch (err: unknown) {
      setSearchResults([]);
      setSearchDone(true);
      setErrorMsg(err instanceof Error ? err.message : "CANIAS servisi ile iletişim kurulurken hata oluştu.");
    } finally {
      setSearching(false);
    }
  };

  // Add order from Section 1 (Grid selection)
  const handleAddGridOrder = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    if (!selectedMaterial) {
      setErrorMsg("Lütfen ızgaradan bir ürün/parti seçin.");
      return;
    }

    const count = Number(repeatCountGrid);
    if (!Number.isInteger(count) || count < 1 || count > 99) {
      setErrorMsg("Kopya sayısı 1 ile 99 arasında olmalıdır.");
      return;
    }

    const batch = selectedMaterial.batchNum && selectedMaterial.batchNum !== "*" ? selectedMaterial.batchNum : selectedMaterial.material;

    const newOrder: QueuedLabelOrder = {
      id: "exp-grid-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6),
      title: `SKT Etiketi: ${selectedMaterial.material}`,
      subtitle: `Parti/Batch: ${batch} · ${selectedMaterial.name}`,
      copies: count,
      payload: {
        container: batch,
        material: selectedMaterial.material,
        warehouse: selectedMaterial.warehouse || "",
        stockPlace: selectedMaterial.stockPlace || "",
        repeat: count,
      },
    };

    setQueuedOrders((prev) => [...prev, newOrder]);
    setSelectedMaterial(null);
    setRepeatCountGrid(1);
    setSuccessMsg(`Ürün seçimli SKT etiket siparişi eklendi (${selectedMaterial.material} - ${count} kopya).`);
  };

  // Add order from Section 2 (Direct SKT date)
  const handleAddDirectOrder = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    if (!directExpiryDate) {
      setErrorMsg("Lütfen Son Kullanma Tarihi (SKT) seçin.");
      return;
    }

    const todayStr = new Date().toISOString().split("T")[0];
    if (directExpiryDate < todayStr) {
      setErrorMsg("Son Kullanma Tarihi (SKT) geçmiş bir tarih olamaz. Lütfen bugün veya gelecek bir tarih seçin.");
      return;
    }

    const yearNum = parseInt(directExpiryDate.split("-")[0], 10);
    if (isNaN(yearNum) || yearNum > 2099) {
      setErrorMsg("Geçerli bir Son Kullanma Tarihi girin (Yıl en fazla 2099 olabilir).");
      return;
    }

    const count = Number(repeatCountDirect);
    if (!Number.isInteger(count) || count < 1 || count > 99) {
      setErrorMsg("Kopya sayısı 1 ile 99 arasında olmalıdır.");
      return;
    }

    const newOrder: QueuedLabelOrder = {
      id: "exp-dir-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6),
      title: `SKT Etiketi: ${directExpiryDate}`,
      subtitle: `Doğrudan SKT Tarihi: ${directExpiryDate}`,
      copies: count,
      payload: {
        expiryDate: directExpiryDate,
        container: directExpiryDate,
        repeat: count,
      },
    };

    setQueuedOrders((prev) => [...prev, newOrder]);
    setDirectExpiryDate("");
    setRepeatCountDirect(1);
    setSuccessMsg(`Doğrudan SKT etiket siparişi eklendi (${directExpiryDate} - ${count} kopya).`);
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
        const payload = ord.payload as {
          container: string;
          repeat: number;
          warehouse?: string;
          stockPlace?: string;
        };
        const res = await api.printWHSP({
          company: "01",
          plant: "100",
          warehouse: payload.warehouse || "",
          stockPlace: payload.stockPlace || "",
          container: payload.container,
          repeat: payload.repeat,
        });
        if (res.ok) successCount++;
        else failedCount++;
      } catch {
        failedCount++;
      }
    }

    setPrinting(false);
    if (failedCount === 0) {
      setSuccessMsg(`Toplam ${successCount} adet SKT etiket siparişi başarıyla CANIAS'a iletildi.`);
      setQueuedOrders([]);
    } else {
      setErrorMsg(`${successCount} etiket yazdırıldı, ${failedCount} adet siparişte hata oluştu.`);
    }
  };

  return (
    <div className="mx-auto max-w-6xl p-4 lg:p-8 space-y-8">
      <LabelOrderQueueHeader
        title="SKT (Son Kullanma Tarihi) Etiketi Yazdırma"
        subtitle="Ürün barkodu / kodu ile aratarak veya doğrudan SKT tarihi girerek etiket siparişi oluşturun"
        icon={CalendarDays}
        iconBg="bg-amber-100 dark:bg-amber-900/30"
        iconFg="text-amber-600 dark:text-amber-400"
        queuedOrders={queuedOrders}
        onRemoveOrder={handleRemoveOrder}
        onPrintAll={handlePrintAll}
        printing={printing}
        errorMsg={errorMsg}
        successMsg={successMsg}
      />

      {/* BÖLÜM 1: Ürün Barkodu / Kodu ile Arama ve 3x3 Grid Seçimi */}
      <div className="rounded-2xl border border-line bg-surface p-6 shadow-card space-y-5">
        <div>
          <h3 className="text-base font-extrabold text-fg flex items-center gap-2">
            <Package className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            <span>1. Yöntem: Ürün Barkodu / Kodu ile Arama ve Seçim</span>
          </h3>
          <p className="text-xs text-subtle mt-0.5">
            Arama yapın, ürünü seçip kopya sayısı ile siparişe ekleyin.
          </p>
        </div>

        {/* Search Bar + Select Type */}
        <form onSubmit={handleSearchMaterial} className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-subtle" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Barkod No veya Ürün Kodu Girin..."
              className="field-input pl-11"
            />
          </div>

          <div className="w-full sm:w-52">
            <select
              value={searchType}
              onChange={(e) => setSearchType(e.target.value as SearchType)}
              className="field-input w-full cursor-pointer font-medium"
            >
              <option value="barcode">Malzeme Barkodu</option>
              <option value="material">Ürün Kodu (Malzeme Kodu)</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={searching || !searchTerm.trim()}
            className="btn-primary flex items-center justify-center gap-2 py-2.5 px-5 shadow-sm shrink-0"
          >
            {searching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            <span>Ara</span>
          </button>
        </form>

        {/* 3x3 Grid Results */}
        {searching ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 pt-2">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-28 animate-pulse rounded-2xl bg-elevated" />
            ))}
          </div>
        ) : searchResults.length > 0 ? (
          <div className="space-y-4 pt-2 border-t border-line">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {pg.pageItems.map((r, idx) => {
                const isSelected = selectedMaterial === r;
                return (
                  <div
                    key={`${r.material}-${idx}`}
                    onClick={() => setSelectedMaterial(r)}
                    className={`relative flex cursor-pointer flex-col justify-between rounded-2xl border p-4 text-left shadow-card transition-all hover:shadow-soft ${isSelected
                        ? "border-amber-500 bg-amber-500/10 ring-2 ring-amber-500/30"
                        : "border-line bg-bg hover:border-amber-300"
                      }`}
                  >
                    <div>
                      <div className="flex items-start justify-between">
                        <span className="font-mono text-base font-extrabold text-fg">{r.material}</span>
                        {r.batchNum && (
                          <span className="chip bg-amber-100 text-amber-800 font-mono text-[10px] dark:bg-amber-900/40 dark:text-amber-300">
                            Batch: {r.batchNum}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs text-subtle">{r.name}</p>
                    </div>

                    <div className="mt-3 flex items-center justify-between border-t border-line/60 pt-2 text-xs">
                      <span className="font-mono text-subtle font-semibold">
                        Stok: {r.availStock} {r.unit}
                      </span>
                      <span
                        className={`chip text-[11px] ${isSelected ? "bg-amber-600 text-white" : "bg-elevated text-subtle"
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

            <Pagination
              page={pg.page}
              pageCount={pg.pageCount}
              onChange={pg.setPage}
              rangeStart={pg.rangeStart}
              rangeEnd={pg.rangeEnd}
              total={pg.total}
              label="Ürün"
            />
          </div>
        ) : searchDone ? (
          <p className="text-xs text-subtle py-4 text-center">Aranan kriterde ürün kaydı bulunamadı.</p>
        ) : null}

        {/* Section 1 Add Order Form */}
        <form onSubmit={handleAddGridOrder} className="border-t border-line pt-4 space-y-3">
          {selectedMaterial && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
              <span className="block font-semibold text-amber-600 dark:text-amber-400">Seçilen Malzeme:</span>
              <div className="mt-1 font-mono font-bold text-fg">
                {selectedMaterial.material} — {selectedMaterial.name} (Parti: {selectedMaterial.batchNum || "-"})
              </div>
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
                value={repeatCountGrid}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  setRepeatCountGrid(isNaN(v) ? 1 : Math.min(99, Math.max(1, v)));
                }}
                className="field-input w-full"
              />
            </div>

            <button
              type="submit"
              disabled={!selectedMaterial}
              className="btn-primary w-full sm:w-auto flex items-center justify-center gap-2 py-2.5 px-6 shadow-sm"
            >
              <Plus className="h-4 w-4" />
              <span>1. Yöntem ile Sipariş Ekle</span>
            </button>
          </div>
        </form>
      </div>

      {/* BÖLÜM 2: Doğrudan SKT Tarihi Girebileceği Bağımsız Alan */}
      <div className="rounded-2xl border border-line bg-surface p-6 shadow-card space-y-5">
        <div>
          <h3 className="text-base font-extrabold text-fg flex items-center gap-2">
            <Calendar className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            <span>2. Yöntem: Doğrudan SKT Tarihi Girerek Etiket Siparişi</span>
          </h3>
          <p className="text-xs text-subtle mt-0.5">
            Arama yapmadan doğrudan Son Kullanma Tarihi (SKT) seçip etiket siparişi oluşturabilirsiniz.
          </p>
        </div>

        <form onSubmit={handleAddDirectOrder} className="space-y-4">
          <div className="flex flex-col sm:flex-row items-end justify-between gap-4">
            <div className="w-full sm:flex-1">
              <label className="mb-1.5 block text-xs font-semibold text-fg">
                Son Kullanma Tarihi (SKT) <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                required
                min={new Date().toISOString().split("T")[0]}
                max="2099-12-31"
                value={directExpiryDate}
                onChange={(e) => setDirectExpiryDate(e.target.value)}
                className="field-input w-full"
              />
            </div>

            <div className="w-full sm:w-48">
              <label className="mb-1.5 block text-xs font-semibold text-fg">
                Kopya Sayısı <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min={1}
                max={99}
                required
                value={repeatCountDirect}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  setRepeatCountDirect(isNaN(v) ? 1 : Math.min(99, Math.max(1, v)));
                }}
                className="field-input w-full"
              />
            </div>

            <button
              type="submit"
              disabled={!directExpiryDate}
              className="btn-primary w-full sm:w-auto flex items-center justify-center gap-2 py-2.5 px-6 shadow-sm shrink-0"
            >
              <Plus className="h-4 w-4" />
              <span>2. Yöntem ile Sipariş Ekle</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
