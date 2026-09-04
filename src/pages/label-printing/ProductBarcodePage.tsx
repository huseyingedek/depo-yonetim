import { useState } from "react";
import { Search, Printer, Check, Loader2, Package, Tag, FileText } from "lucide-react";
import { api } from "../../api/client";
import PageHeader from "../../components/PageHeader";

type TabType = "materialCode" | "barcode" | "description";

export interface ProductBarcodeCardItem {
  id: string; // `${material}_${barcode}_${unit}`
  material: string;
  name: string;
  barcode: string;
  unit: string;
  unitLabel: string;
  isSearchedBarcode?: boolean;
}

export function formatBarcodeUnitInfo(rawUnit: string): {
  label: string;
  short: string;
  badgeClass: string;
} {
  const u = (rawUnit || "AD").trim().toUpperCase();
  switch (u) {
    case "KO":
    case "KOLİ":
    case "KOLI":
      return {
        label: "Koli (KO)",
        short: "KO",
        badgeClass: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
      };
    case "PK":
    case "PAKET":
    case "PAK":
      return {
        label: "Paket (PK)",
        short: "PK",
        badgeClass: "bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-500/30",
      };
    case "AD":
    case "ADET":
      return {
        label: "Adet (AD)",
        short: "AD",
        badgeClass: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
      };
    case "KT":
    case "KUTU":
      return {
        label: "Kutu (KT)",
        short: "KT",
        badgeClass: "bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/30",
      };
    case "PL":
    case "PALET":
      return {
        label: "Palet (PL)",
        short: "PL",
        badgeClass: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-400 border-indigo-500/30",
      };
    case "BR":
    case "BAĞ":
    case "BAG":
      return {
        label: "Bağ (BR)",
        short: "BR",
        badgeClass: "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30",
      };
    case "SET":
      return {
        label: "Set",
        short: "SET",
        badgeClass: "bg-teal-500/15 text-teal-700 dark:text-teal-400 border-teal-500/30",
      };
    default:
      return {
        label: `${u}`,
        short: u,
        badgeClass: "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30",
      };
  }
}

// CANIAS MZYGetMaterial detayından veya fallbacklerden tüm barkod kartlarını üretir
async function fetchCardsForMaterial(
  matCode: string,
  fallbackName = "",
  fallbackUnit = "AD",
  searchedBarcode = ""
): Promise<ProductBarcodeCardItem[]> {
  try {
    const matDetail = await api.getMaterialDetail(matCode);
    let name = fallbackName;
    let baseUnit = fallbackUnit;

    if (matDetail.ok && Array.isArray(matDetail.matList) && matDetail.matList.length > 0) {
      const m = matDetail.matList[0];
      name = String(m.STEXT || m.MTEXT || m.NAME1 || m.NAME || name || matCode).trim();
      baseUnit = String(m.QUNIT || m.UNIT || m.IUNIT || baseUnit).trim().toUpperCase();
    }

    const rawBarcodeList = Array.isArray(matDetail.barcodeList) ? matDetail.barcodeList : [];
    const cards: ProductBarcodeCardItem[] = [];
    const seenKey = new Set<string>();

    for (const b of rawBarcodeList) {
      const bCode = String(b.BARCODE || b.barcode || b.BARCODENUM || b.EAN || b.CODE || "").trim();
      const rawUnit = String(
        b.BUNIT || b.UNIT || b.BARCODEUNIT || b.B_UNIT || b.QUNIT || b.SKUNIT || b.unit || baseUnit
      ).trim().toUpperCase();

      if (!bCode) continue;

      const unitInfo = formatBarcodeUnitInfo(rawUnit);
      const key = `${matCode}_${bCode}_${unitInfo.short}`;
      if (!seenKey.has(key)) {
        seenKey.add(key);
        cards.push({
          id: key,
          material: matCode,
          name: name || matCode,
          barcode: bCode,
          unit: unitInfo.short,
          unitLabel: unitInfo.label,
          isSearchedBarcode: searchedBarcode ? bCode.toLowerCase() === searchedBarcode.toLowerCase() : false,
        });
      }
    }

    // Eğer barcodeList boşsa veya sadece malzeme kodu varsa
    if (cards.length === 0) {
      const unitInfo = formatBarcodeUnitInfo(baseUnit);
      cards.push({
        id: `${matCode}_${matCode}_${unitInfo.short}`,
        material: matCode,
        name: name || matCode,
        barcode: matCode,
        unit: unitInfo.short,
        unitLabel: unitInfo.label,
        isSearchedBarcode: searchedBarcode ? matCode.toLowerCase() === searchedBarcode.toLowerCase() : false,
      });
    }

    return cards;
  } catch {
    const unitInfo = formatBarcodeUnitInfo(fallbackUnit);
    return [
      {
        id: `${matCode}_${matCode}_${unitInfo.short}`,
        material: matCode,
        name: fallbackName || matCode,
        barcode: matCode,
        unit: unitInfo.short,
        unitLabel: unitInfo.label,
        isSearchedBarcode: searchedBarcode ? matCode.toLowerCase() === searchedBarcode.toLowerCase() : false,
      },
    ];
  }
}

export default function ProductBarcodePage() {
  const [activeTab, setActiveTab] = useState<TabType>("materialCode");

  // Search & Results State
  const [searchTerm, setSearchTerm] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchDone, setSearchDone] = useState(false);
  const [searchResults, setSearchResults] = useState<ProductBarcodeCardItem[]>([]);
  const [selectedCards, setSelectedCards] = useState<ProductBarcodeCardItem[]>([]);
  const [repeatCount, setRepeatCount] = useState<number | string>(1);

  // Status & Printing State
  const [printing, setPrinting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    setSearchTerm("");
    setSearchDone(false);
    setSearchResults([]);
    setSelectedCards([]);
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
    setSelectedCards([]);

    try {
      let cards: ProductBarcodeCardItem[] = [];

      // 1. SEKME: Malzeme Kodu ile Arama
      if (activeTab === "materialCode") {
        cards = await fetchCardsForMaterial(term);

        // Eğer malzeme kodundan doğrudan gelmediyse stock ve barcode fallbacklerini dene
        if (cards.length === 0 || (cards.length === 1 && cards[0].name === cards[0].material)) {
          try {
            const stockRows = await api.queryStock({ material: term });
            if (stockRows && stockRows.length > 0) {
              const primary = stockRows[0];
              const detailCards = await fetchCardsForMaterial(primary.material, primary.name, primary.unit);
              if (detailCards.length > 0) {
                cards = detailCards;
              }
            }
          } catch {
            // Devam et
          }
        }

        // Eğer hala bulunamadıysa terim barkod olabilir, barkod olarak dene
        if (cards.length === 0 || (cards.length === 1 && cards[0].name === cards[0].material)) {
          try {
            const readRes = await api.readBarcode(term);
            if (readRes.ok && readRes.material) {
              cards = await fetchCardsForMaterial(readRes.material, readRes.name, readRes.unit, term);
            }
          } catch {
            // Devam et
          }
        }
      }

      // 2. SEKME: Barkod ile Arama
      else if (activeTab === "barcode") {
        let matCode = "";
        let matName = "";
        let scannedUnit = "AD";

        try {
          const readRes = await api.readBarcode(term);
          if (readRes.ok && readRes.material) {
            matCode = readRes.material;
            matName = readRes.name;
            scannedUnit = readRes.unit || "AD";
          }
        } catch {
          // Devam et
        }

        // Eğer readBarcode bulunamadıysa MZYGetMaterial dene
        if (!matCode) {
          try {
            const matDetail = await api.getMaterialDetail(term);
            if (matDetail.ok && Array.isArray(matDetail.matList) && matDetail.matList.length > 0) {
              matCode = String(matDetail.matList[0].MATERIAL || matDetail.matList[0].MATCODE || term).trim();
              matName = String(matDetail.matList[0].STEXT || matDetail.matList[0].MTEXT || matDetail.matList[0].NAME || "").trim();
              scannedUnit = String(matDetail.matList[0].QUNIT || matDetail.matList[0].UNIT || "AD").trim();
            }
          } catch {
            // Devam et
          }
        }

        // Eğer hala bulunamadıysa queryStock({ barcode: term }) dene
        if (!matCode) {
          try {
            const stockRows = await api.queryStock({ barcode: term });
            if (stockRows && stockRows.length > 0) {
              matCode = stockRows[0].material;
              matName = stockRows[0].name;
              scannedUnit = stockRows[0].unit;
            }
          } catch {
            // Devam et
          }
        }

        if (matCode) {
          cards = await fetchCardsForMaterial(matCode, matName, scannedUnit, term);

          // Okutulan barkodun tam listede olduğundan emin ol
          const hasExactScanned = cards.some((c) => c.barcode.toLowerCase() === term.toLowerCase());
          if (!hasExactScanned) {
            const unitInfo = formatBarcodeUnitInfo(scannedUnit);
            cards.unshift({
              id: `${matCode}_${term}_${unitInfo.short}`,
              material: matCode,
              name: matName || matCode,
              barcode: term,
              unit: unitInfo.short,
              unitLabel: unitInfo.label,
              isSearchedBarcode: true,
            });
          }

          // Aranan barkodu en başa al
          cards.sort((a, b) => (b.isSearchedBarcode ? 1 : 0) - (a.isSearchedBarcode ? 1 : 0));
        }
      }

      // 3. SEKME: Ürün Açıklaması ile Arama
      else if (activeTab === "description") {
        try {
          const allStock = await api.queryStock({});
          const lower = term.toLowerCase();
          const matches = allStock.filter(
            (r) =>
              (r.name && r.name.toLowerCase().includes(lower)) ||
              (r.material && r.material.toLowerCase().includes(lower))
          );

          // Tekil malzemeleri al (Aşırı istek göndermemek için ilk 10 farklı ürün)
          const uniqueMaterials = new Map<string, { name: string; unit: string }>();
          for (const r of matches) {
            if (r.material && !uniqueMaterials.has(r.material)) {
              uniqueMaterials.set(r.material, { name: r.name, unit: r.unit });
              if (uniqueMaterials.size >= 10) break;
            }
          }

          if (uniqueMaterials.size > 0) {
            const cardGroups = await Promise.all(
              Array.from(uniqueMaterials.entries()).map(([mCode, info]) =>
                fetchCardsForMaterial(mCode, info.name, info.unit)
              )
            );
            cards = cardGroups.flat();
          }
        } catch {
          // Devam et
        }
      }

      setSearchResults(cards);
      setSearchDone(true);

      // Varsayılan seçim: Aranan barkod varsa o, yoksa ilk kart
      if (cards.length > 0) {
        const preselect = cards.find((c) => c.isSearchedBarcode) || cards[0];
        setSelectedCards([preselect]);
      }
    } catch (err: unknown) {
      setSearchResults([]);
      setSearchDone(true);
      setErrorMsg(err instanceof Error ? err.message : "CANIAS servisi ile iletişim kurulurken hata oluştu.");
    } finally {
      setSearching(false);
    }
  };

  const toggleSelectCard = (item: ProductBarcodeCardItem) => {
    setSelectedCards((prev) => {
      const exists = prev.some((c) => c.id === item.id);
      if (exists) return [];
      return [item];
    });
  };

  const isCardSelected = (item: ProductBarcodeCardItem) => {
    return selectedCards.some((c) => c.id === item.id);
  };

  // Main Print Handler (Called from top header print button)
  const handlePrintSelectedGrid = async () => {
    if (selectedCards.length === 0) {
      setErrorMsg("Lütfen listeden en az bir ürün seçin.");
      return;
    }
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

    for (const card of selectedCards) {
      try {
        const res = await api.printMaterial({
          company: "01",
          plant: "100",
          barcode: card.barcode || card.material || "",
          unit: card.unit || "",
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
      setSuccessMsg(`Seçilen ürün etiketi (${count} kopya) yazdırma isteği iletildi.`);
      setSelectedCards([]);
    } else {
      setErrorMsg(
        `${successCount} etiket yazdırıldı, ${failedCount} adet etikette hata oluştu.${lastError ? ` (Detay: ${lastError})` : ""
        }`
      );
    }
  };

  const isPrintDisabled = selectedCards.length === 0 || printing;

  return (
    <div className="mx-auto max-w-6xl p-4 lg:p-8">
      {/* Top Header with Kopya Input & Green Print Button aligned right */}
      <PageHeader
        title="Ürün Barkodu Yazdırma"
        subtitle="Ürünleri arayın, seçin ve etiket yazdırın"
        backTo="/label-printing"
        right={
          <div className="hidden sm:flex items-center gap-3">
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
                  <span>Yazdır {selectedCards.length > 0 ? `(${selectedCards.length})` : ""}</span>
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
          onClick={handlePrintSelectedGrid}
          disabled={isPrintDisabled}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
        >
          {printing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Printer className="h-4 w-4" />
          )}
          <span>Yazdır {selectedCards.length > 0 ? `(${selectedCards.length})` : ""}</span>
        </button>
      </div>

      {/* 3 Option Segmented Tab Bar */}
      <div className="flex flex-col sm:flex-row rounded-2xl border border-line bg-surface p-1.5 shadow-sm gap-1">
        <button
          type="button"
          onClick={() => handleTabChange("materialCode")}
          className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-3 px-3 text-xs font-bold transition-all ${activeTab === "materialCode"
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
          className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-3 px-3 text-xs font-bold transition-all ${activeTab === "barcode"
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
          className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-3 px-3 text-xs font-bold transition-all ${activeTab === "description"
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

      {/* TAB CONTENT: Dedicated Search Card & Results */}
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

        {/* Result Cards in Classic/Original Layout with KO, PK, AD Badge */}
        {searching ? (
          <div className="h-24 animate-pulse rounded-2xl bg-elevated mt-2" />
        ) : searchResults.length > 0 ? (
          <div className="pt-2 border-t border-line space-y-3">
            {searchResults.map((r) => {
              const selected = isCardSelected(r);
              const unitInfo = formatBarcodeUnitInfo(r.unit);
              return (
                <div
                  key={r.id}
                  onClick={() => toggleSelectCard(r)}
                  className={`relative flex cursor-pointer items-center justify-between rounded-2xl border p-5 text-left shadow-card transition-all ${selected
                    ? "border-emerald-500 bg-emerald-500/10 ring-2 ring-emerald-500/30"
                    : "border-line bg-bg hover:border-emerald-300"
                    }`}
                >

                  <div>
                    <div className="flex items-center gap-8">
                      <p>{r.barcode}</p>
                      <p>{r.unit}</p>
                      <p>{r.material}</p>
                      <p>{r.name}</p>
                    </div>
                  </div>



                  <span
                    className={`chip text-xs font-bold ${selected ? "bg-emerald-600 text-white" : "bg-elevated text-subtle"
                      }`}
                  >
                    {selected ? <Check className="h-4 w-4 inline mr-1" /> : null}
                    {selected ? "Seçildi" : "Seç"}
                  </span>
                </div>
              );
            })}
          </div>
        ) : searchDone ? (
          <p className="text-xs text-subtle py-4 text-center">Aranan kriterde ürün kaydı bulunamadı.</p>
        ) : null}
      </div>
    </div>
  );
}
