import { useState, useRef } from "react";
import { Printer, Check, Loader2, Package, Camera, CornerDownLeft } from "lucide-react";
import { api } from "../../api/client";
import PageHeader from "../../components/PageHeader";
import MaterialDetailCard from "../../components/MaterialDetailCard";
import CameraScanOverlay from "../../components/CameraScanOverlay";

export interface ProductBarcodeCardItem {
  id: string; // `${material}_${barcode}_${unit}`
  material: string;
  name: string;
  barcode: string;
  unit: string;
  unitLabel: string;
  isSearchedBarcode?: boolean;
  availableUnits?: string[];
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
  // Search & Results State
  const [searchTerm, setSearchTerm] = useState("");
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchDone, setSearchDone] = useState(false);
  const [searchResults, setSearchResults] = useState<ProductBarcodeCardItem[]>([]);
  const [selectedCards, setSelectedCards] = useState<ProductBarcodeCardItem[]>([]);
  const [repeatCount, setRepeatCount] = useState<number | string>(1);

  // Status & Printing State
  const [printing, setPrinting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const activeMaterialCode = selectedCards[0]?.material || searchResults[0]?.material || "";
  const activeBarcode = selectedCards[0]?.barcode || searchResults[0]?.barcode || "";
  const detailCardRef = useRef<HTMLDivElement>(null);

  // Birleşik Arama — Barkod Oluşturma ekranındaki ile AYNI: tek alandan
  // malzeme kodu / barkod / açıklama aratılır (sekme yok). Enter veya kamera tetikler.
  const handleSearch = async (termToSearch?: string) => {
    const term = (termToSearch !== undefined ? termToSearch : searchTerm).trim();
    setErrorMsg("");
    setSuccessMsg("");
    if (!term) {
      setErrorMsg("Lütfen arama terimi girin.");
      return;
    }

    setSearching(true);
    setSearchDone(false);
    setSelectedCards([]);

    try {
      let cards: ProductBarcodeCardItem[] = [];

      // 1) Doğrudan malzeme kodu / barkod detayı (MZYGetMaterial)
      try {
        const direct = await fetchCardsForMaterial(term, "", "AD", term);
        if (direct.length > 0 && !(direct.length === 1 && direct[0].name === direct[0].material)) {
          cards = direct;
        }
      } catch {
        // Devam et
      }

      // 2) Barkod okuma servisi (MZYReadBarcode) → malzemeyi çöz
      if (cards.length === 0) {
        try {
          const readRes = await api.readBarcode(term);
          if (readRes.ok && readRes.material) {
            cards = await fetchCardsForMaterial(readRes.material, readRes.name, readRes.unit, term);

            // Okutulan barkodun listede olduğundan emin ol, en başa al
            const hasExact = cards.some((c) => c.barcode.toLowerCase() === term.toLowerCase());
            if (!hasExact) {
              const unitInfo = formatBarcodeUnitInfo(readRes.unit || "AD");
              cards.unshift({
                id: `${readRes.material}_${term}_${unitInfo.short}`,
                material: readRes.material,
                name: readRes.name || readRes.material,
                barcode: term,
                unit: unitInfo.short,
                unitLabel: unitInfo.label,
                isSearchedBarcode: true,
              });
            }
            cards.sort((a, b) => (b.isSearchedBarcode ? 1 : 0) - (a.isSearchedBarcode ? 1 : 0));
          }
        } catch {
          // Devam et
        }
      }

      // 3) Stok sorgusu (MZYGetStock) — barkod, olmazsa malzeme koduyla
      if (cards.length === 0) {
        try {
          let stockRows = await api.queryStock({ barcode: term });
          if (!stockRows || stockRows.length === 0) {
            stockRows = await api.queryStock({ material: term });
          }
          if (stockRows && stockRows.length > 0) {
            const primary = stockRows[0];
            cards = await fetchCardsForMaterial(primary.material, primary.name, primary.unit, term);
          }
        } catch {
          // Devam et
        }
      }

      // 4) Açıklama / genel arama (isim veya kod filtresi, ilk 10 farklı ürün)
      if (cards.length === 0) {
        try {
          const allStock = await api.queryStock({});
          const lower = term.toLowerCase();
          const matches = allStock.filter(
            (r) =>
              (r.name && r.name.toLowerCase().includes(lower)) ||
              (r.material && r.material.toLowerCase().includes(lower))
          );

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

  const selectAndBringToTop = (item: ProductBarcodeCardItem) => {
    setSelectedCards([item]);

    // Seçilen kartı sonuç listesinin en üstüne taşı
    setSearchResults((prev) => {
      const idx = prev.findIndex((c) => c.id === item.id);
      if (idx <= 0) return prev;
      const copy = [...prev];
      const [moved] = copy.splice(idx, 1);
      return [moved, ...copy];
    });

    // Kullanıcı aşağıda ise yukarıdaki detay kartına ve yeni seçilen karta yumuşakça kaydır
    setTimeout(() => {
      detailCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  };

  const toggleSelectCard = (item: ProductBarcodeCardItem) => {
    selectAndBringToTop(item);
  };

  const handleCardBarcodeSelect = (barcode: string) => {
    const trimmed = (barcode || "").trim().toLowerCase();
    if (!trimmed) return;

    // Önce aktif malzemenin bu barkoduna ait kartı bul, yoksa listedeki eşleşen kartı seç
    const matchingCard =
      searchResults.find(
        (c) =>
          c.material.toLowerCase() === activeMaterialCode.toLowerCase() &&
          c.barcode.toLowerCase() === trimmed
      ) ||
      searchResults.find((c) => c.barcode.toLowerCase() === trimmed);

    if (matchingCard) {
      selectAndBringToTop(matchingCard);
    }
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
    <div className="mx-auto max-w-7xl p-4 lg:p-8 space-y-4">
      {/* Top Header with Kopya Input & Green Print Button aligned right */}
      <PageHeader
        title="Ürün Barkodu Yazdırma"
        subtitle="Ürünleri arayın, seçin ve etiket yazdırın"
        backTo="/home"
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
      <div className="flex items-center justify-between gap-3 sm:hidden">
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

      {/* Arama: sonuç varken kompakt çubuk (yer kaplamasın), yoksa tam arama kutusu */}
      {searchDone && searchResults.length > 0 ? (
        <div className="flex items-center justify-between gap-2 rounded-2xl border border-line bg-surface px-3.5 py-2.5 shadow-card">
          <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-subtle">
            Arama:{" "}
            <span className="truncate font-semibold text-fg">{searchTerm || "—"}</span>
            <span className="shrink-0 text-subtle">· {searchResults.length} sonuç</span>
          </span>
          <button
            type="button"
            onClick={() => {
              setSearchTerm("");
              setSearchResults([]);
              setSearchDone(false);
              setSelectedCards([]);
              setErrorMsg("");
              setSuccessMsg("");
            }}
            className="shrink-0 text-xs font-semibold text-brand-600 hover:underline"
          >
            Yeni arama
          </button>
        </div>
      ) : (
      <div className="card p-4 sm:p-3 shadow-card">
        <div className="relative flex items-center">
          <input
            type="text"
            id="input-product-search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleSearch(searchTerm);
              }
            }}
            enterKeyHint="search"
            inputMode="text"
            autoComplete="off"
            placeholder="Barkod veya Ürün Kodu ya da Açıklama girin..."
            className="field-input w-full pr-20 h-11 text-sm font-medium"
          />
          <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-1">
            {/* Enter / Ara Butonu */}
            <button
              type="button"
              onClick={() => handleSearch(searchTerm)}
              disabled={!searchTerm.trim() || searching}
              aria-label="Ara"
              title="Ara"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-subtle transition hover:bg-elevated hover:text-fg disabled:opacity-30"
            >
              {searching ? (
                <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
              ) : (
                <CornerDownLeft className="h-4 w-4" />
              )}
            </button>
            {/* Kamera Butonu */}
            <button
              type="button"
              onClick={() => setIsCameraOpen(true)}
              aria-label="Kamera ile barkod oku"
              title="Kamera ile barkod oku"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-subtle transition hover:bg-elevated hover:text-fg"
            >
              <Camera className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
      )}

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

      {/* Sonuçlar */}
      {searching ? (
        <div className="space-y-2.5">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-20 animate-pulse rounded-2xl bg-elevated/60 border border-line" />
          ))}
        </div>
      ) : searchResults.length > 0 ? (
        <div ref={detailCardRef} className="grid gap-4 scroll-mt-20 lg:grid-cols-2">
          {/* Sol: Seçili Malzemenin 3D ve Detay Kartı */}
          {activeMaterialCode && (
            <div className="min-w-0 lg:sticky lg:top-4 lg:self-start">
              <MaterialDetailCard
                materialCode={activeMaterialCode}
                barcode={activeBarcode}
                onBarcodeSelect={handleCardBarcodeSelect}
              />
            </div>
          )}

          {/* Sağ: Arama Sonuçları Listesi */}
          <div className="min-w-0 space-y-3">
            {searchResults.map((r) => {
              const selected = isCardSelected(r);
              return (
                <div
                  key={r.id}
                  id={`product-card-${r.id}`}
                  onClick={() => toggleSelectCard(r)}
                  className={`relative flex cursor-pointer items-center justify-between gap-3 rounded-2xl border p-4 text-left shadow-card transition-all ${selected
                    ? "border-emerald-500 bg-emerald-500/10 ring-2 ring-emerald-500/30"
                    : "border-line bg-bg hover:border-emerald-300"
                    }`}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    {/* Birim rozeti — MaterialDetailCard ile aynı renk ailesi */}
                    <span
                      className={`inline-flex h-7 w-12 shrink-0 items-center justify-center rounded-lg border text-[11px] font-bold ${formatBarcodeUnitInfo(r.unit).badgeClass}`}
                    >
                      {r.unit}
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="font-mono text-sm font-bold text-fg">{r.barcode}</span>
                        <span className="font-mono text-xs font-semibold text-subtle">{r.material}</span>
                      </div>
                      <p className="truncate text-xs text-subtle">{r.name}</p>
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
        </div>
      ) : searchDone ? (
        <div className="card p-8 text-center">
          <Package className="h-8 w-8 text-subtle mx-auto mb-2 opacity-50" />
          <p className="text-xs text-subtle">Aranan kriterde ürün kaydı bulunamadı.</p>
        </div>
      ) : (
        <div className="card p-8 text-center border-dashed">
          <Package className="h-8 w-8 text-subtle mx-auto mb-2 opacity-40" />
          <p className="text-xs text-subtle">
            Arama yapmak için yukarıdaki alandan ürün kodu, açıklama ya da barkod okutunuz.
          </p>
        </div>
      )}

      {/* Kamera Tarama Modal / Overlay */}
      {isCameraOpen && (
        <CameraScanOverlay
          onDetected={(code) => {
            setIsCameraOpen(false);
            setSearchTerm(code);
            handleSearch(code);
          }}
          onClose={() => setIsCameraOpen(false)}
          prompt="Açıklama, ürün kodu ya da barkod okutun"
        />
      )}
    </div>
  );
}
