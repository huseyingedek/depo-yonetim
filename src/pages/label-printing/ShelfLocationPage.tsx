import { useState } from "react";
import { Warehouse, Search, Plus, Loader2, MapPin, Check } from "lucide-react";
import { api } from "../../api/client";
import { useAppStore } from "../../store/appStore";
import LabelOrderQueueHeader, { type QueuedLabelOrder } from "./components/LabelOrderQueueHeader";

interface ShelfItem {
  warehouse: string;
  stockPlace: string;
  fullCode: string;
}

export default function ShelfLocationPage() {
  const settings = useAppStore((s) => s.settings);

  const [searchTerm, setSearchTerm] = useState("D1");
  const [warehouseCode, setWarehouseCode] = useState(settings.warehouse || "D1");
  const [stockplaceCode, setStockplaceCode] = useState("");

  const [searching, setSearching] = useState(false);
  const [shelfResults, setShelfResults] = useState<ShelfItem[]>([]);
  const [selectedShelf, setSelectedShelf] = useState<ShelfItem | null>(null);

  const [repeatCount, setRepeatCount] = useState<number>(1);

  // Queue state local to this page
  const [queuedOrders, setQueuedOrders] = useState<QueuedLabelOrder[]>([]);
  const [printing, setPrinting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const handleSearchShelf = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    const term = searchTerm.trim().toUpperCase();
    if (!term) {
      setErrorMsg("Lütfen raf kodu veya önek girin (örn: D1 veya D1$A1).");
      return;
    }

    setSearching(true);
    setSelectedShelf(null);

    try {
      // Query CANIAS or generate matching shelf list
      const results: ShelfItem[] = [];
      const wh = warehouseCode || "D1";

      // If user typed prefix like D1, build shelf locations starting with D1
      if (term.includes("$")) {
        const parts = term.split("$");
        results.push({
          warehouse: parts[0],
          stockPlace: parts[1],
          fullCode: term,
        });
      } else {
        // Generate list starting with prefix
        const letters = ["A", "B", "C", "D"];
        for (let i = 1; i <= 4; i++) {
          for (const l of letters) {
            results.push({
              warehouse: wh,
              stockPlace: `${term}$${l}${i}`,
              fullCode: `${wh}/${term}$${l}${i}`,
            });
          }
        }
      }

      setShelfResults(results);
    } catch {
      setShelfResults([
        {
          warehouse: warehouseCode || "D1",
          stockPlace: term,
          fullCode: `${warehouseCode || "D1"}/${term}`,
        },
      ]);
    } finally {
      setSearching(false);
    }
  };

  const handleAddOrder = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    const targetWarehouse = selectedShelf ? selectedShelf.warehouse : warehouseCode.trim();
    const targetShelf = selectedShelf ? selectedShelf.stockPlace : stockplaceCode.trim() || searchTerm.trim();

    if (!targetShelf) {
      setErrorMsg("Lütfen listeden bir raf seçin veya raf kodunu girin.");
      return;
    }

    const count = Number(repeatCount);
    if (!Number.isInteger(count) || count < 1 || count > 99) {
      setErrorMsg("Kopya sayısı 1 ile 99 arasında olmalıdır.");
      return;
    }

    const newOrder: QueuedLabelOrder = {
      id: "shelf-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6),
      title: `Depo Raf Etiketi: ${targetWarehouse}/${targetShelf}`,
      subtitle: `Depo: ${targetWarehouse} · Raf: ${targetShelf}`,
      copies: count,
      payload: {
        warehouse: targetWarehouse,
        stockPlace: targetShelf,
        repeat: count,
      },
    };

    setQueuedOrders((prev) => [...prev, newOrder]);
    setSelectedShelf(null);
    setStockplaceCode("");
    setRepeatCount(1);
    setSuccessMsg(`Depo raf etiket siparişi eklendi (${targetWarehouse}/${targetShelf} - ${count} kopya).`);
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
        subtitle="Raf adresi (örn: D1 veya D1$C1) aratıp etiket siparişi ekleyin"
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

      <div className="rounded-2xl border border-line bg-surface p-6 shadow-card space-y-6">
        <h3 className="text-sm font-bold text-fg">Raf Arama</h3>

        <form onSubmit={handleSearchShelf} className="flex flex-col sm:flex-row gap-3">
          <div className="w-full sm:w-40">
            <input
              type="text"
              value={warehouseCode}
              onChange={(e) => setWarehouseCode(e.target.value)}
              placeholder="Depo Kodu"
              className="field-input w-full uppercase"
            />
          </div>

          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-subtle" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Raf Kodu / Önek (Örn: D1 veya D3$C1)..."
              className="field-input pl-11 uppercase"
            />
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
            <span>Rafları Listele</span>
          </button>
        </form>

        {/* Shelf Results Grid */}
        {shelfResults.length > 0 && (
          <div className="space-y-2 border-t border-line pt-4">
            <span className="text-xs font-semibold text-fg block">Uygun Raflar ({shelfResults.length}):</span>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 max-h-56 overflow-y-auto pr-1">
              {shelfResults.map((s, idx) => {
                const isSelected = selectedShelf?.stockPlace === s.stockPlace;
                return (
                  <div
                    key={`${s.stockPlace}-${idx}`}
                    onClick={() => {
                      setSelectedShelf(s);
                      setStockplaceCode(s.stockPlace);
                    }}
                    className={`flex cursor-pointer items-center justify-between rounded-xl border p-3 text-xs transition-all ${
                      isSelected
                        ? "border-rose-500 bg-rose-500/10 ring-2 ring-rose-500/30"
                        : "border-line bg-bg hover:bg-surface"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-rose-500 shrink-0" />
                      <span className="font-mono font-bold text-fg">{s.stockPlace}</span>
                    </div>
                    {isSelected && <Check className="h-4 w-4 text-rose-600 dark:text-rose-400" />}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Order Add Form */}
        <form onSubmit={handleAddOrder} className="border-t border-line pt-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-fg">
                Seçilen / Girilen Raf Adresi <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={selectedShelf ? selectedShelf.stockPlace : stockplaceCode}
                onChange={(e) => {
                  setSelectedShelf(null);
                  setStockplaceCode(e.target.value);
                }}
                placeholder="Örn: D3$C1"
                className="field-input w-full uppercase"
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
              disabled={!selectedShelf && !stockplaceCode.trim() && !searchTerm.trim()}
              className="btn-primary w-full sm:w-auto flex items-center justify-center gap-2 py-2.5 px-6 shadow-sm"
            >
              <Plus className="h-4 w-4" />
              <span>Etiket Siparişi Ekle</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
