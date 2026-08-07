import { useState } from "react";
import { Calendar, Search, Printer, Check, Loader2, Package } from "lucide-react";
import { api } from "../../api/client";
import type { StockRow } from "../../types";
import PageHeader from "../../components/PageHeader";

type TabType = "directDate" | "searchGrid";

export default function ExpiryLabelPage() {
  const [activeTab, setActiveTab] = useState<TabType>("directDate");

  // Form & Selection State
  const [directExpiryDate, setDirectExpiryDate] = useState("");
  const [repeatCount, setRepeatCount] = useState<number>(1);

  const [searchTerm, setSearchTerm] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchDone, setSearchDone] = useState(false);
  const [searchResults, setSearchResults] = useState<StockRow[]>([]);
  const [selectedMaterials, setSelectedMaterials] = useState<StockRow[]>([]);

  // Status & Printing State
  const [printing, setPrinting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const todayStr = new Date().toISOString().split("T")[0];

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    setDirectExpiryDate("");
    setSearchTerm("");
    setSearchDone(false);
    setSearchResults([]);
    setSelectedMaterials([]);
    setRepeatCount(1);
    setErrorMsg("");
    setSuccessMsg("");
  };

  // Search Handler for Tab 2 (Auto search barcode & material code)
  const handleSearchMaterial = async (e: React.FormEvent) => {
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
      let rows = await api.queryStock({ barcode: term });
      if (!rows || rows.length === 0) {
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

  const toggleSelectMaterial = (item: StockRow) => {
    setSelectedMaterials((prev) => {
      const exists = prev.some((m) => m.material === item.material && m.batchNum === item.batchNum);
      if (exists) return [];
      return [item];
    });
  };

  const isMaterialSelected = (item: StockRow) => {
    return selectedMaterials.some((m) => m.material === item.material && m.batchNum === item.batchNum);
  };

  // Main Print Action (Called from top header print button)
  const handlePrint = async () => {
    setErrorMsg("");
    setSuccessMsg("");

    const count = Number(repeatCount);
    if (!Number.isInteger(count) || count < 1 || count > 99) {
      setErrorMsg("Kopya sayısı 1 ile 99 arasında olmalıdır.");
      return;
    }

    if (activeTab === "directDate") {
      if (!directExpiryDate) {
        setErrorMsg("Lütfen Son Kullanma Tarihi (SKT) seçin.");
        return;
      }

      if (directExpiryDate < todayStr) {
        setErrorMsg("Son Kullanma Tarihi (SKT) geçmiş bir tarih olamaz. Lütfen bugün veya gelecek bir tarih seçin.");
        return;
      }

      const yearNum = parseInt(directExpiryDate.split("-")[0], 10);
      if (isNaN(yearNum) || yearNum > 2099) {
        setErrorMsg("Geçerli bir Son Kullanma Tarihi girin (Yıl en fazla 2099 olabilir).");
        return;
      }

      setPrinting(true);
      try {
        const res = await api.printWHSP({
          company: "01",
          plant: "100",
          container: directExpiryDate,
          repeat: count,
        });

        if (res.ok) {
          setSuccessMsg(`Doğrudan SKT etiket siparişi (${directExpiryDate} - ${count} kopya) başarıyla CANIAS'a iletildi.`);
          setDirectExpiryDate("");
          setRepeatCount(1);
        } else {
          setErrorMsg("SKT etiketi yazdırılırken CANIAS servisinde hata oluştu.");
        }
      } catch {
        setErrorMsg("CANIAS servisi ile iletişim kurulurken hata oluştu.");
      } finally {
        setPrinting(false);
      }
    } else {
      // searchGrid tab
      if (selectedMaterials.length === 0) {
        setErrorMsg("Lütfen listeden en az bir ürün seçin.");
        return;
      }

      setPrinting(true);
      let successCount = 0;
      let failedCount = 0;

      for (const mat of selectedMaterials) {
        const batch = mat.batchNum && mat.batchNum !== "*" ? mat.batchNum : mat.material;
        try {
          const res = await api.printWHSP({
            company: "01",
            plant: "100",
            warehouse: mat.warehouse || "",
            stockPlace: mat.stockPlace || "",
            container: batch,
            repeat: count,
          });
          if (res.ok) successCount++;
          else failedCount++;
        } catch {
          failedCount++;
        }
      }

      setPrinting(false);
      setRepeatCount(1);
      if (failedCount === 0) {
        setSuccessMsg(`Seçilen ${successCount} adet üründen ${count}'er kopya SKT etiketi yazdırıldı.`);
        setSelectedMaterials([]);
      } else {
        setErrorMsg(`${successCount} etiket yazdırıldı, ${failedCount} adet siparişte hata oluştu.`);
      }
    }
  };

  const isPrintDisabled =
    printing ||
    (activeTab === "directDate" ? !directExpiryDate : selectedMaterials.length === 0);

  return (
    <div className="mx-auto max-w-6xl p-4 lg:p-8 space-y-6">
      {/* Top Header with Kopya Input & Green Print Button aligned right */}
      <PageHeader
        title="SKT (Son Kullanma Tarihi) Etiketi Yazdırma"
        subtitle="Doğrudan SKT tarihi seçerek veya ürün aratarak etiket yazdırın"
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
              onClick={handlePrint}
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
                  <span>
                    Yazdır {activeTab === "searchGrid" && selectedMaterials.length > 0 ? `(${selectedMaterials.length})` : ""}
                  </span>
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
          onClick={handlePrint}
          disabled={isPrintDisabled}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
        >
          {printing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Printer className="h-4 w-4" />
          )}
          <span>
            Yazdır {activeTab === "searchGrid" && selectedMaterials.length > 0 ? `(${selectedMaterials.length})` : ""}
          </span>
        </button>
      </div>

      {/* Segmented Tab Bar */}
      <div className="flex rounded-2xl border border-line bg-surface p-1.5 shadow-sm">
        <button
          type="button"
          onClick={() => handleTabChange("directDate")}
          className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-xs font-bold transition-all ${activeTab === "directDate"
              ? "bg-blue-600 text-white shadow-md"
              : "text-subtle hover:text-fg hover:bg-elevated"
            }`}
        >
          <Calendar className="h-4 w-4" />
          <span>1. Yöntem: Doğrudan SKT Tarihi Girerek Yazdırma</span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange("searchGrid")}
          className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-xs font-bold transition-all ${activeTab === "searchGrid"
              ? "bg-blue-600 text-white shadow-md"
              : "text-subtle hover:text-fg hover:bg-elevated"
            }`}
        >
          <Package className="h-4 w-4" />
          <span>2. Yöntem: Ürün Barkodu / Kodu ile Arama (3x1 Grid)</span>
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

      {/* TAB 1: Doğrudan SKT Tarihi Girerek Yazdırma */}
      {activeTab === "directDate" && (
        <div className="rounded-2xl border border-line bg-surface p-6 shadow-card space-y-4">
          <div>
            <h3 className="text-base font-extrabold text-fg flex items-center gap-2">
              <Calendar className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              <span>Doğrudan SKT Tarihi Seçimi</span>
            </h3>
            <p className="text-xs text-subtle mt-0.5">
              Tarihi seçip sayfa başındaki Kopya ve Yazdır butonlarını kullanarak etiketi basabilirsiniz.
            </p>
          </div>

          <div className="max-w-md">
            <label className="mb-1.5 block text-xs font-semibold text-fg">
              Son Kullanma Tarihi (SKT) <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              required
              min={todayStr}
              max="2099-12-31"
              value={directExpiryDate}
              onChange={(e) => setDirectExpiryDate(e.target.value)}
              className="field-input w-full"
            />
          </div>
        </div>
      )}

      {/* TAB 2: Ürün Barkodu / Kodu ile Arama (3x1 Grid) */}
      {activeTab === "searchGrid" && (
        <div className="rounded-2xl border border-line bg-surface p-6 shadow-card space-y-5">
          <div>
            <h3 className="text-base font-extrabold text-fg flex items-center gap-2">
              <Package className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              <span>Ürün Barkodu / Kodu ile Arama ve Seçim</span>
            </h3>
            <p className="text-xs text-subtle mt-0.5">
              Arama yapın, çıkan kartlardan seçim yapıp sayfa başındaki Yazdır butonunu kullanın.
            </p>
          </div>

          {/* Unified Search Form */}
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
      )}
    </div>
  );
}
