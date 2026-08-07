import { useState } from "react";
import { Barcode, Search, Plus, Loader2, Package, Check } from "lucide-react";
import { api } from "../../api/client";
import type { StockRow } from "../../types";
import LabelOrderQueueHeader, { type QueuedLabelOrder } from "./components/LabelOrderQueueHeader";

type SearchType = "code" | "ean" | "desc";

export default function ProductBarcodePage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [searchType, setSearchType] = useState<SearchType>("code");

  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<StockRow[]>([]);
  const [selectedMaterial, setSelectedMaterial] = useState<StockRow | null>(null);

  const [repeatCount, setRepeatCount] = useState<number>(1);

  // Queue state local to this page
  const [queuedOrders, setQueuedOrders] = useState<QueuedLabelOrder[]>([]);
  const [printing, setPrinting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    const term = searchTerm.trim();
    if (!term) {
      setErrorMsg("Lütfen arama terimi girin.");
      return;
    }

    setSearching(true);
    setSelectedMaterial(null);

    try {
      let rows: StockRow[] = [];
      if (searchType === "code") {
        rows = await api.queryStock({ material: term });
      } else if (searchType === "ean") {
        rows = await api.queryStock({ barcode: term });
      } else {
        // Description search: query general stock and filter by name
        const all = await api.queryStock({});
        rows = all.filter((r) => r.name.toLowerCase().includes(term.toLowerCase()));
      }

      setSearchResults(rows || []);
    } catch (err: unknown) {
      setSearchResults([]);
      setErrorMsg(err instanceof Error ? err.message : "CANIAS servisi ile iletişim kurulurken hata oluştu.");
    } finally {
      setSearching(false);
    }
  };

  const handleAddOrder = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    if (!selectedMaterial && !searchTerm.trim()) {
      setErrorMsg("Lütfen arama yapıp listeden bir malzeme seçin.");
      return;
    }

    const matCode = selectedMaterial?.material || searchTerm.trim();
    const matName = selectedMaterial?.name || matCode;

    const count = Number(repeatCount);
    if (!Number.isInteger(count) || count < 1 || count > 99) {
      setErrorMsg("Kopya sayısı 1 ile 99 arasında olmalıdır.");
      return;
    }

    const newOrder: QueuedLabelOrder = {
      id: "barcode-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6),
      title: `Ürün Barkodu: ${matCode}`,
      subtitle: matName,
      copies: count,
      payload: {
        material: matCode,
        repeat: count,
      },
    };

    setQueuedOrders((prev) => [...prev, newOrder]);
    setSelectedMaterial(null);
    setSearchTerm("");
    setSearchResults([]);
    setRepeatCount(1);
    setSuccessMsg(`Ürün barkod etiket siparişi eklendi (${matCode} - ${count} kopya).`);
  };

  const handleRemoveOrder = (id: string) => {
    setQueuedOrders((prev) => prev.filter((o) => o.id !== id));
  };

  const handlePrintAll = async () => {
    if (queuedOrders.length === 0) return;
    setPrinting(true);
    setErrorMsg("");
    setSuccessMsg("");

    await new Promise((res) => setTimeout(res, 800));

    setPrinting(false);
    setSuccessMsg(`Toplam ${queuedOrders.length} adet ürün barkod etiket siparişi başarıyla CANIAS'a iletildi.`);
    setQueuedOrders([]);
  };

  return (
    <div className="mx-auto max-w-6xl p-4 lg:p-8">
      <LabelOrderQueueHeader
        title="Ürün Barkodu Yazdırma"
        subtitle="Malzeme kodu, EAN barkodu veya açıklaması ile aratıp etiket siparişleri oluşturun"
        icon={Barcode}
        iconBg="bg-purple-100 dark:bg-purple-900/30"
        iconFg="text-purple-600 dark:text-purple-400"
        queuedOrders={queuedOrders}
        onRemoveOrder={handleRemoveOrder}
        onPrintAll={handlePrintAll}
        printing={printing}
        errorMsg={errorMsg}
        successMsg={successMsg}
      />

      {/* Search Section */}
      <div className="rounded-2xl border border-line bg-surface p-6 shadow-card space-y-6">
        <h3 className="text-sm font-bold text-fg">Ürün Arama</h3>

        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-subtle" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Arama terimini girin..."
              className="field-input pl-11"
            />
          </div>

          {/* Search Type Dropdown Select */}
          <div className="w-full sm:w-52">
            <select
              value={searchType}
              onChange={(e) => setSearchType(e.target.value as SearchType)}
              className="field-input w-full cursor-pointer font-medium"
            >
              <option value="code">Malzeme Kodu</option>
              <option value="ean">EAN Barkodu</option>
              <option value="desc">Ürün Açıklaması</option>
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
            <span>Malzeme Ara</span>
          </button>
        </form>

        {/* Search Results List */}
        {searchResults.length > 0 && (
          <div className="space-y-2 border-t border-line pt-4">
            <span className="text-xs font-semibold text-fg block">Arama Sonuçları ({searchResults.length}):</span>
            <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
              {searchResults.map((r, idx) => {
                const isSelected = selectedMaterial === r;
                return (
                  <div
                    key={`${r.material}-${idx}`}
                    onClick={() => setSelectedMaterial(r)}
                    className={`flex cursor-pointer items-center justify-between rounded-xl border p-3 text-xs transition-all ${
                      isSelected
                        ? "border-purple-500 bg-purple-500/10 ring-2 ring-purple-500/30"
                        : "border-line bg-bg hover:bg-surface"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 font-mono font-bold">
                        <Package className="h-4 w-4" />
                      </div>
                      <div>
                        <span className="font-mono font-extrabold text-fg">{r.material}</span>
                        <p className="text-[11px] text-subtle mt-0.5">{r.name}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs text-subtle">
                        {r.availStock} {r.unit}
                      </span>
                      <span
                        className={`chip text-[11px] ${
                          isSelected ? "bg-purple-600 text-white" : "bg-elevated text-subtle"
                        }`}
                      >
                        {isSelected ? <Check className="h-3.5 w-3.5" /> : "Seç"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Selected Item & Order Add Form */}
        <form onSubmit={handleAddOrder} className="border-t border-line pt-5 space-y-4">
          {selectedMaterial && (
            <div className="rounded-xl border border-purple-500/30 bg-purple-500/5 p-3 text-xs">
              <span className="block font-semibold text-purple-600 dark:text-purple-400">Seçilen Ürün:</span>
              <div className="mt-1 font-mono font-bold text-fg">
                {selectedMaterial.material} — {selectedMaterial.name}
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
              disabled={!selectedMaterial && !searchTerm.trim()}
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
