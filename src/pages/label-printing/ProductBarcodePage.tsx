import { useState } from "react";
import { Search, Printer, Check, Loader2, Package, Tag, FileText } from "lucide-react";
import { api } from "../../api/client";
import type { StockRow } from "../../types";
import PageHeader from "../../components/PageHeader";

type TabType = "materialCode" | "barcode" | "description";

export default function ProductBarcodePage() {
  const [activeTab, setActiveTab] = useState<TabType>("materialCode");

  // Search & Results State
  const [searchTerm, setSearchTerm] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchDone, setSearchDone] = useState(false);
  const [searchResults, setSearchResults] = useState<StockRow[]>([]);
  const [selectedMaterials, setSelectedMaterials] = useState<StockRow[]>([]);
  const [repeatCount, setRepeatCount] = useState<number>(1);

  // Status & Printing State
  const [printing, setPrinting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    setSearchTerm("");
    setSearchDone(false);
    setSearchResults([]);
    setSelectedMaterials([]);
    setRepeatCount(1);
    setErrorMsg("");
    setSuccessMsg("");
  };

  // Search Handler per tab type
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
    setSearchDone(false);
    setSelectedMaterials([]);

    try {
      let rows: StockRow[] = [];
      if (activeTab === "materialCode") {
        rows = await api.queryStock({ material: term });
      } else if (activeTab === "barcode") {
        rows = await api.queryStock({ barcode: term });
      } else if (activeTab === "description") {
        const all = await api.queryStock({});
        rows = all.filter((r) => r.name.toLowerCase().includes(term.toLowerCase()));
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

  const toggleSelectMaterial = (item: StockRow) => {
    setSelectedMaterials((prev) => {
      const exists = prev.some((m) => m.material === item.material && m.batchNum === item.batchNum);
      if (exists) {
        return prev.filter((m) => !(m.material === item.material && m.batchNum === item.batchNum));
      }
      return [...prev, item];
    });
  };

  const isMaterialSelected = (item: StockRow) => {
    return selectedMaterials.some((m) => m.material === item.material && m.batchNum === item.batchNum);
  };

  // Main Print Handler (Called from top header print button)
  const handlePrintSelectedGrid = async () => {
    if (selectedMaterials.length === 0) {
      setErrorMsg("Lütfen listeden en az bir ürün seçin.");
      return;
    }
    setErrorMsg("");
    setSuccessMsg("");

    const count = Number(repeatCount);
    if (!Number.isInteger(count) || count < 1 || count > 99) {
      setErrorMsg("Kopya sayısı 1 ile 99 arasında olmalıdır.");
      return;
    }

    setPrinting(true);
    let successCount = 0;
    let failedCount = 0;
    let lastError = "";

    for (const mat of selectedMaterials) {
      try {
        const res = await api.printWHSP({
          company: "01",
          plant: "100",
          warehouse: mat.warehouse || "",
          stockPlace: mat.stockPlace || "",
          container: mat.material || mat.batchNum || "",
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
      setSuccessMsg(`Seçilen ${successCount} adet üründen ${count}'er kopya ürün barkodu yazdırıldı.`);
      setSelectedMaterials([]);
    } else {
      setErrorMsg(
        `${successCount} etiket yazdırıldı, ${failedCount} adet etikette hata oluştu.${lastError ? ` (Detay: ${lastError})` : ""
        }`
      );
    }
  };

  const isPrintDisabled = printing || selectedMaterials.length === 0;

  return (
    <div className="mx-auto max-w-6xl p-4 lg:p-8 space-y-6">
      {/* Top Header with Kopya Input & Green Print Button aligned right */}
      <PageHeader
        title="Ürün Barkodu Yazdırma"
        subtitle="Malzeme kodu, barkod veya açıklama ile aratarak ürün barkod etiketi yazdırın"
        backTo="/label-printing"
        right={
          <div className="hidden sm:flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-fg whitespace-nowrap">Kopya:</span>
              <input
                type="number"
                min={1}
                max={99}
                value={repeatCount}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  setRepeatCount(isNaN(v) ? 1 : Math.min(99, Math.max(1, v)));
                }}
                className="field-input w-16 py-1.5 px-2 text-center text-xs font-bold"
              />
            </div>

            <button
              type="button"
              onClick={handlePrintSelectedGrid}
              disabled={isPrintDisabled}
              className="flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
            >
              {printing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Yazdırılıyor...</span>
                </>
              ) : (
                <>
                  <Printer className="h-4 w-4" />
                  <span>Yazdır {selectedMaterials.length > 0 ? `(${selectedMaterials.length})` : ""}</span>
                </>
              )}
            </button>
          </div>
        }
      />

      {/* Mobile Action Bar */}
      <div className="flex items-center justify-between gap-3 sm:hidden mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-fg">Kopya:</span>
          <input
            type="number"
            min={1}
            max={99}
            value={repeatCount}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              setRepeatCount(isNaN(v) ? 1 : Math.min(99, Math.max(1, v)));
            }}
            className="field-input w-20 py-1.5 px-2 text-center text-xs font-bold"
          />
        </div>

        <button
          type="button"
          onClick={handlePrintSelectedGrid}
          disabled={isPrintDisabled}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
        >
          {printing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Printer className="h-4 w-4" />
          )}
          <span>Yazdır {selectedMaterials.length > 0 ? `(${selectedMaterials.length})` : ""}</span>
        </button>
      </div>

      {/* 3 Option Segmented Tab Bar */}
      <div className="flex flex-col sm:flex-row rounded-2xl border border-line bg-surface p-1.5 shadow-sm gap-1">
        <button
          type="button"
          onClick={() => handleTabChange("materialCode")}
          className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-3 px-3 text-xs font-bold transition-all ${
            activeTab === "materialCode"
              ? "bg-blue-600 text-white shadow-md"
              : "text-subtle hover:text-fg hover:bg-elevated"
          }`}
        >
          <Package className="h-4 w-4" />
          <span>1. Malzeme Kodu ile Arama</span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange("barcode")}
          className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-3 px-3 text-xs font-bold transition-all ${
            activeTab === "barcode"
              ? "bg-blue-600 text-white shadow-md"
              : "text-subtle hover:text-fg hover:bg-elevated"
          }`}
        >
          <Tag className="h-4 w-4" />
          <span>2. Barkod ile Arama</span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange("description")}
          className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-3 px-3 text-xs font-bold transition-all ${
            activeTab === "description"
              ? "bg-blue-600 text-white shadow-md"
              : "text-subtle hover:text-fg hover:bg-elevated"
          }`}
        >
          <FileText className="h-4 w-4" />
          <span>3. Ürün Açıklaması ile Arama</span>
        </button>
      </div>

      {/* Global Alerts */}
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

      {/* TAB CONTENT: Dedicated Search Card & Single Result Card per Tab */}
      <div className="rounded-2xl border border-line bg-surface p-6 shadow-card space-y-5">
        <div>
          <h3 className="text-base font-extrabold text-fg flex items-center gap-2">
            {activeTab === "materialCode" && (
              <>
                <Package className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                <span>Malzeme Kodu ile Arama ve Seçim</span>
              </>
            )}
            {activeTab === "barcode" && (
              <>
                <Tag className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                <span>Malzeme Barkodu (EAN) ile Arama ve Seçim</span>
              </>
            )}
            {activeTab === "description" && (
              <>
                <FileText className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                <span>Ürün Açıklaması ile Arama ve Seçim</span>
              </>
            )}
          </h3>
          <p className="text-xs text-subtle mt-0.5">
            {activeTab === "materialCode" && "Malzeme kodunu girin, çıkan ürünleri seçip sayfa başındaki Yazdır butonunu kullanın."}
            {activeTab === "barcode" && "Barkod numarasını (EAN) okutun veya yazın, çıkan ürünleri seçip sayfa başındaki Yazdır butonunu kullanın."}
            {activeTab === "description" && "Ürün adını veya açıklamasını yazın, eşleşen ürünleri seçip sayfa başındaki Yazdır butonunu kullanın."}
          </p>
        </div>

        {/* Dedicated Search Form per Option */}
        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-subtle" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={
                activeTab === "materialCode"
                  ? "Malzeme Kodu Girin (ör. MAL001)..."
                  : activeTab === "barcode"
                    ? "Barkod No veya EAN Girin..."
                    : "Ürün Açıklaması veya Adı Girin..."
              }
              className="field-input pl-11"
            />
          </div>

          <button
            type="submit"
            disabled={searching || !searchTerm.trim()}
            className="btn-primary flex items-center justify-center gap-2 py-2.5 px-6 shadow-sm shrink-0"
          >
            {searching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            <span>Ara</span>
          </button>
        </form>

        {/* Single Result Card (Only product code & name, no quantity, no 3x1 grid) */}
        {searching ? (
          <div className="h-24 animate-pulse rounded-2xl bg-elevated mt-2" />
        ) : searchResults.length > 0 ? (
          <div className="pt-2 border-t border-line">
            {(() => {
              const r = searchResults[0];
              const selected = isMaterialSelected(r);
              return (
                <div
                  onClick={() => toggleSelectMaterial(r)}
                  className={`relative flex cursor-pointer items-center justify-between rounded-2xl border p-5 text-left shadow-card transition-all ${
                    selected
                      ? "border-emerald-500 bg-emerald-500/10 ring-2 ring-emerald-500/30"
                      : "border-line bg-bg hover:border-emerald-300"
                  }`}
                >
                  <div>
                    <span className="font-mono text-lg font-extrabold text-fg">{r.material}</span>
                    <p className="mt-1 text-sm text-subtle font-medium">{r.name}</p>
                  </div>

                  <span
                    className={`chip text-xs font-bold ${
                      selected ? "bg-emerald-600 text-white" : "bg-elevated text-subtle"
                    }`}
                  >
                    {selected ? <Check className="h-4 w-4 inline mr-1" /> : null}
                    {selected ? "Seçildi" : "Seç"}
                  </span>
                </div>
              );
            })()}
          </div>
        ) : searchDone ? (
          <p className="text-xs text-subtle py-4 text-center">Aranan kriterde ürün kaydı bulunamadı.</p>
        ) : null}
      </div>
    </div>
  );
}
