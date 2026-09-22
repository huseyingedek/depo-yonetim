import { useState, useMemo } from "react";
import { Loader2, Save, ChevronDown, Check, Package, AlertCircle } from "lucide-react";
import PageHeader from "../../components/PageHeader";
import { api } from "../../api/client";
import { sesBasarili, sesHata } from "../../sound";
import {
  ProductBarcodeCardItem,
  formatBarcodeUnitInfo,
} from "./ProductBarcodePage";

const NON_BARCODE_UNITS = new Set([
  "KG", "GR", "G", "MG", "TON",
  "DS", "DESI",
  "M", "M2", "M3", "CM", "MM",
  "L", "LT", "ML"
]);

type LeftTabType = "material" | "unit" | "barcode";
type BarcodeMode = "auto" | "manual" | null;
type Toast = { kind: "ok" | "done" | "error"; text: string } | null;

export default function BarcodeGeneratorPage() {
  // Sol Kart Sekme Durumu
  const [activeTab, setActiveTab] = useState<LeftTabType>("material");

  // Tab 1: Malzeme Arama Durumları
  const [searchTerm, setSearchTerm] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchDone, setSearchDone] = useState(false);
  const [searchResults, setSearchResults] = useState<ProductBarcodeCardItem[]>([]);
  const [selectedCard, setSelectedCard] = useState<ProductBarcodeCardItem | null>(null);

  // Tab 2: Birim Durumu (Sadece seçilen malzemenin sahip olduğu birimler)
  const [selectedUnit, setSelectedUnit] = useState<string>("");

  // Tab 3: Barkod Modu, Değeri ve Yazdırma Sayısı
  const [barcodeMode, setBarcodeMode] = useState<BarcodeMode>(null);
  const [customBarcode, setCustomBarcode] = useState("");
  const [printCount, setPrintCount] = useState<number>(1);

  // Seçilen malzemenin CANIAS'ta sahip olduğu geçerli birimler
  const currentAvailableUnits = useMemo(() => {
    if (!selectedCard) return [];
    const list =
      selectedCard.availableUnits && selectedCard.availableUnits.length > 0
        ? selectedCard.availableUnits
        : selectedCard.unit
          ? [selectedCard.unit]
          : [];
    return Array.from(
      new Set(
        list
          .map((u) => (formatBarcodeUnitInfo(u).short || u).trim().toUpperCase())
          .filter((u) => u && !NON_BARCODE_UNITS.has(u))
      )
    );
  }, [selectedCard]);

  // Bildirim ve Kaydetme Durumları
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const showToast = (tst: Toast) => {
    if (tst?.kind === "error") sesHata();
    else if (tst) sesBasarili();
    setToast(tst);
    setTimeout(() => setToast(null), 3500);
  };

  // Sekme Değişimi Kontrolü (Malzeme seçilmeden Birim'e, Birim seçilmeden Barkod'a geçilemez)
  const handleTabChange = (tabId: LeftTabType) => {
    if (tabId === "unit" && !selectedCard) {
      showToast({ kind: "error", text: "Lütfen önce sağ taraftan bir malzeme seçin." });
      return;
    }
    if (tabId === "barcode" && (!selectedCard || !selectedUnit)) {
      showToast({ kind: "error", text: "Lütfen önce birim seçin." });
      return;
    }
    setActiveTab(tabId);
  };

  // CANIAS MZYGetMaterial detayından malzeme kartlarını üretir 
  async function fetchCardsForMaterial(
    matCode: string,
    initialName = "",
    initialUnit = "",
    searchedBarcode = ""
  ): Promise<ProductBarcodeCardItem[]> {
    const matDetail = await api.getMaterialDetail(matCode);
    let name = initialName;
    let baseUnit = initialUnit;

    const hasMat = matDetail.ok && Array.isArray(matDetail.matList) && matDetail.matList.length > 0;
    if (hasMat) {
      const m = matDetail.matList[0];
      name = String(m.STEXT || m.MTEXT || m.NAME1 || m.NAME || name || "").trim();
      const qUnit = String(m.QUNIT || m.UNIT || m.IUNIT || "").trim().toUpperCase();
      if (qUnit) baseUnit = qUnit;
    }

    // Malzeme ne CANIAS detayında ne de stok listesinde mevcut değilse sahte fallback kartı üretme
    if (!hasMat && !initialName) {
      return [];
    }

    const rawBarcodeList = Array.isArray(matDetail.barcodeList) ? matDetail.barcodeList : [];
    const rawUnitList = Array.isArray(matDetail.unitList) ? matDetail.unitList : [];

    // Malzemenin CANIAS barkodlarında tanımlı birimlerini topla
    const barcodeUnitSet = new Set<string>();

    for (const b of rawBarcodeList) {
      const rawUnit = String(
        b.BUNIT || b.UNIT || b.BARCODEUNIT || b.B_UNIT || b.QUNIT || b.SKUNIT || b.unit || ""
      ).trim().toUpperCase();
      if (!rawUnit || NON_BARCODE_UNITS.has(rawUnit)) continue;
      const uShort = formatBarcodeUnitInfo(rawUnit).short || rawUnit;
      if (uShort && !NON_BARCODE_UNITS.has(uShort)) {
        barcodeUnitSet.add(uShort);
      }
    }

    // Eğer malzemenin CANIAS'ta henüz hiç tanımlı barkodu yoksa, ana birimi veya TBLUNITLIST'teki paket birimlerini al
    if (barcodeUnitSet.size === 0) {
      if (baseUnit && !NON_BARCODE_UNITS.has(baseUnit)) {
        const uShort = formatBarcodeUnitInfo(baseUnit).short || baseUnit;
        if (!NON_BARCODE_UNITS.has(uShort)) barcodeUnitSet.add(uShort);
      }
      for (const u of rawUnitList) {
        const uCode = String(u.QUNIT || u.UNIT || u.BUNIT || u.IUNIT || u.TUNIT || "").trim().toUpperCase();
        if (uCode && !NON_BARCODE_UNITS.has(uCode)) {
          const uShort = formatBarcodeUnitInfo(uCode).short || uCode;
          if (!NON_BARCODE_UNITS.has(uShort)) barcodeUnitSet.add(uShort);
        }
      }
      if (initialUnit && !NON_BARCODE_UNITS.has(initialUnit)) {
        const uShort = formatBarcodeUnitInfo(initialUnit).short || initialUnit;
        if (!NON_BARCODE_UNITS.has(uShort)) barcodeUnitSet.add(uShort);
      }
    }

    const availableUnits = Array.from(barcodeUnitSet).filter(Boolean);

    const cards: ProductBarcodeCardItem[] = [];
    const seenKey = new Set<string>();

    for (const b of rawBarcodeList) {
      const bCode = String(b.BARCODE || b.barcode || b.BARCODENUM || b.EAN || b.CODE || "").trim();
      const rawUnit = String(
        b.BUNIT || b.UNIT || b.BARCODEUNIT || b.B_UNIT || b.QUNIT || b.SKUNIT || b.unit || baseUnit
      ).trim().toUpperCase();

      if (!bCode) continue;

      const unitInfo = formatBarcodeUnitInfo(rawUnit);
      const key = `${matCode}_${bCode}_${unitInfo.short}_${rawUnit}`;
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
          availableUnits,
        });
      }
    }

    // Malzeme ERP'de mevcut ama henüz tanımlı hiç barkodu yoksa malzeme kartı oluştur
    if (cards.length === 0 && (hasMat || initialName)) {
      const unitInfo = formatBarcodeUnitInfo(baseUnit);
      cards.push({
        id: `${matCode}_${unitInfo.short}`,
        material: matCode,
        name: name || matCode,
        barcode: "",
        unit: unitInfo.short,
        unitLabel: unitInfo.label,
        isSearchedBarcode: false,
        availableUnits,
      });
    }

    return cards;
  }

  // 1. Sekme: İsim veya Ürün Kodu ile Malzeme Arama
  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    const term = searchTerm.trim();
    if (!term) {
      setErrorMsg("Lütfen arama terimi girin.");
      showToast({ kind: "error", text: "Lütfen malzeme adı veya kodu girin." });
      return;
    }

    setSearching(true);
    setSearchDone(false);

    try {
      let cards: ProductBarcodeCardItem[] = [];
      let apiError: string | null = null;

      // A) Doğrudan malzeme detayı / barkod çağrısı
      try {
        const directCards = await fetchCardsForMaterial(term);
        if (directCards.length > 0) {
          cards = directCards;
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        apiError = msg;
        // Bağlantı / sunucu hatalarında hemen fırlat
        if (/bağlantı|cevaplanmadı|proxy|zaman aşımı|fetch|500|network/i.test(msg)) {
          throw err;
        }
      }

      // B) Eğer doğrudan bulunamadıysa stok sorgusu (isim ve koda göre)
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
              if (uniqueMaterials.size >= 12) break;
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
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          if (!apiError) apiError = msg;
          if (/bağlantı|cevaplanmadı|proxy|zaman aşımı|fetch|500|network/i.test(msg)) {
            throw err;
          }
        }
      }

      // C) Hala kart bulunamadıysa barkod okuyucu
      if (cards.length === 0) {
        try {
          const readRes = await api.readBarcode(term);
          if (readRes.ok && readRes.material) {
            cards = await fetchCardsForMaterial(readRes.material, readRes.name, readRes.unit, term);
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          if (!apiError) apiError = msg;
        }
      }

      // Eğer hiç kart bulunamadıysa ve bir hata oluştuysa hata mesajını fırlat
      if (cards.length === 0 && apiError) {
        throw new Error(apiError);
      }

      // Aynı malzeme koduna sahip olanları tekilleştir (her malzeme kodundan sadece 1 kart)
      const seenMaterial = new Set<string>();
      const uniqueCards = cards.filter((c) => {
        const matKey = c.material.trim().toUpperCase();
        if (!matKey || seenMaterial.has(matKey)) return false;
        seenMaterial.add(matKey);
        return true;
      });

      setSearchResults(uniqueCards);
      setSearchDone(true);
      setSelectedCard(null);
      setSelectedUnit("");
      setBarcodeMode(null);
      setCustomBarcode("");
      setActiveTab("material");

      if (uniqueCards.length > 0) {
        showToast({ kind: "ok", text: `${uniqueCards.length} malzeme bulundu. Sağ taraftan malzeme seçiniz.` });
      } else {
        showToast({ kind: "error", text: "Aranan kriterde ürün bulunamadı." });
      }
    } catch (err: unknown) {
      setSearchResults([]);
      setSearchDone(true);
      const msg = err instanceof Error ? err.message : "Malzeme araması sırasında hata oluştu.";
      setErrorMsg(msg);
      showToast({ kind: "error", text: msg });
    } finally {
      setSearching(false);
    }
  };

  // Malzeme kartı seçimi (Sağ taraftan malzeme seçilince Birim tabına atar)
  const handleSelectCard = (item: ProductBarcodeCardItem) => {
    setSelectedCard(item);

    // Seçilen kartı sonuç listesinin en üstüne taşı
    setSearchResults((prev) => {
      const idx = prev.findIndex((c) => c.id === item.id);
      if (idx <= 0) return prev;
      const copy = [...prev];
      const [moved] = copy.splice(idx, 1);
      return [moved, ...copy];
    });

    // Kullanıcının birim ve barkod modunu seçebilmesi için seçimleri sıfırla ve Birim tabına geç
    setSelectedUnit("");
    setBarcodeMode(null);
    setCustomBarcode("");
    setActiveTab("unit");
    showToast({ kind: "ok", text: `Seçildi: ${item.name}` });
  };

  // 3. Sekme: Sıradaki Numarayı Ata seçimi
  const handleSelectAutoBarcode = () => {
    setBarcodeMode("auto");
    setCustomBarcode("");
  };

  // 3. Sekme: Kendin Gir seçimi
  const handleSelectManualBarcode = () => {
    setBarcodeMode("manual");
  };

  // Header Kaydet Butonu Tıklaması
  const handleSave = async () => {
    setErrorMsg("");
    setSuccessMsg("");

    if (!selectedCard) {
      showToast({ kind: "error", text: "Lütfen önce listeden bir malzeme seçin." });
      setActiveTab("material");
      return;
    }

    if (!selectedUnit) {
      showToast({ kind: "error", text: "Lütfen önce birim seçin." });
      setActiveTab("unit");
      return;
    }

    if (!barcodeMode) {
      showToast({
        kind: "error",
        text: "Lütfen 'Sıradaki Numarayı Ata' veya 'Kendin Gir' seçeneğini belirleyin.",
      });
      setActiveTab("barcode");
      return;
    }

    if (barcodeMode === "manual" && !customBarcode.trim()) {
      showToast({ kind: "error", text: "Lütfen bir barkod numarası yazın." });
      setActiveTab("barcode");
      return;
    }

    setSaving(true);

    try {
      const isAuto = barcodeMode === "auto";
      const newBarcode = isAuto ? "" : customBarcode.trim();

      // CANIAS MZYCreateBarcode servisine kaydetme bildirimi
      // PARAMETRELER: PSCOMPANY, PSMATERIAL, PSUNIT, PIAUTOGENERATE, PSNEWBARCODE, PIPRINTCOUNT, PITRACESTATUS
      const res = await api.createBarcode({
        company: "01",
        material: selectedCard.material,
        unit: selectedUnit,
        autoGenerate: isAuto ? 1 : 0,
        newBarcode: newBarcode,
        printCount: printCount,
      });

      if (res.ok) {
        const assignedCode = res.barcode || (!isAuto ? newBarcode : "Sıradaki Numara");
        const printText = printCount > 0 ? ` ve ${printCount} adet etiket yazdırıldı` : "";
        const okText = `Barkod (${assignedCode}) başarıyla oluşturuldu${printText}!`;
        setSuccessMsg(okText);
        showToast({ kind: "done", text: okText });
      } else {
        const errText = res.message || "Barkod oluşturulurken bir sorun oluştu.";
        setErrorMsg(errText);
        showToast({ kind: "error", text: errText });
      }
    } catch (err: unknown) {
      const errText = err instanceof Error ? err.message : "Kaydetme sırasında bir hata oluştu.";
      setErrorMsg(errText);
      showToast({ kind: "error", text: errText });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl p-3 sm:p-4 lg:p-6 space-y-4">
      {/* HEADER: Başlık ve En Sağda Mavi Kaydet Butonu */}
      <PageHeader
        title="Barkod Oluşturma"
        subtitle="Ürün seçin, birim ve barkod parametrelerini belirleyin"
        backTo="/label-printing"
        right={
          <button
            type="button"
            onClick={handleSave}
            disabled={
              saving ||
              !selectedCard ||
              !selectedUnit ||
              !barcodeMode ||
              (barcodeMode === "manual" && !customBarcode.trim())
            }
            className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-soft hover:bg-blue-700 transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Kaydediliyor...</span>
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                <span>Kaydet</span>
              </>
            )}
          </button>
        }
      />

      {/* Toast Bildirimi */}
      {toast && (
        <div
          className={`fixed top-5 right-5 z-50 flex items-center gap-2.5 rounded-2xl px-4 py-3 text-xs font-bold shadow-soft transition animate-fade-in ${toast.kind === "error"
            ? "bg-red-600 text-white"
            : toast.kind === "done"
              ? "bg-emerald-600 text-white"
              : "bg-blue-600 text-white"
            }`}
        >
          {toast.kind === "error" ? (
            <AlertCircle className="h-4 w-4" />
          ) : (
            <Check className="h-4 w-4" />
          )}
          <span>{toast.text}</span>
        </div>
      )}

      {/* Global Hata ve Başarı Banner'ları */}
      {errorMsg && (
        <div className="flex items-center gap-2.5 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="flex items-center gap-2.5 rounded-xl border border-blue-500/20 bg-blue-500/10 p-3 text-xs text-blue-600 dark:text-blue-400">
          <Check className="h-4 w-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* İKİ SÜTUNLU TRANSFER EKRANI DÜZENİ */}
      <div className="grid min-w-0 gap-2 md:grid-cols-[250px_minmax(0,1fr)] lg:grid-cols-[250px_minmax(0,1fr)]">
        {/* SOL KOLON: Sayfada Sabit/Sticky, 3 Tablı Sabit Ölçülü Kart */}
        <div className="min-w-0 md:sticky md:top-4 md:self-start">
          <div className="card p-1 sm:p-2">
            {/* 3 Tablı Sekme Barı (Sadece isimler) */}
            <div className="flex items-center justify-center gap-1.5 mb-3">
              {[
                { id: "material" as const, label: "Malzeme", disabled: false },
                { id: "unit" as const, label: "Birim", disabled: !selectedCard },
                { id: "barcode" as const, label: "Barkod", disabled: !selectedCard || !selectedUnit },
              ].map((tab) => {
                const isActive = activeTab === tab.id;
                const isDisabled = tab.disabled;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    disabled={isDisabled}
                    onClick={() => handleTabChange(tab.id)}
                    className={`flex h-9 min-w-0 flex-1 items-center justify-center truncate rounded-xl px-2 text-[11px] font-bold transition ${isDisabled
                      ? "bg-elevated/40 text-subtle/40 cursor-not-allowed opacity-40"
                      : isActive
                        ? "bg-blue-600 text-white shadow-soft active:scale-95"
                        : "bg-elevated text-subtle hover:text-fg hover:bg-elevated/80 active:scale-95"
                      }`}
                  >
                    <span className="truncate">{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* TAB İÇERİĞİ: Dinamik Ölçülü Alan */}
            <div className="pt-1">
              {/* TAB 1: MALZEME ARAMA */}
              {activeTab === "material" && (
                <div className="space-y-1">
                  <label className="text-xs font-bold text-fg block">
                    Malzeme Arama
                  </label>
                  <form onSubmit={handleSearch} className="flex items-center gap-1">
                    <div className="relative flex-1">
                      <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Açıklama veya ürün kodu girin"
                        className="field-input h-10 w-full px-1.5 text-[12px] placeholder:text-[12px]"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={searching || !searchTerm.trim()}
                      className="flex h-9 items-center justify-center rounded-xl bg-blue-600 px-1.5 text-xs font-bold text-white shadow-soft hover:bg-blue-700 transition active:scale-95 disabled:opacity-50 shrink-0"
                    >
                      <span>{searching ? "..." : "Ara"}</span>
                    </button>
                  </form>
                </div>
              )}

              {/* TAB 2: BİRİM SEÇİMİ (Sadece seçilen malzemenin sahip olduğu birimler sorulur) */}
              {activeTab === "unit" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-fg block">
                      Birim Seçimi
                    </label>
                    {currentAvailableUnits.length > 0 && (
                      <span className="text-[10px] text-subtle font-semibold">
                        {currentAvailableUnits.length} birim tanımlı
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-4">
                    {/* Birim Combo Box (SADECE bu malzemenin sahip olduğu birimler listelenir) */}
                    <div className="relative flex-1">
                      <select
                        value={selectedUnit}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val) {
                            setSelectedUnit(val);
                            setActiveTab("barcode");
                          }
                        }}
                        className="field-input h-10 px-3 text-xs font-bold appearance-none bg-surface cursor-pointer pr-8 border-line focus:border-blue-500"
                      >
                        <option value="" disabled>
                          {currentAvailableUnits.length > 0
                            ? "Birim Seçiniz..."
                            : "Tanımlı birim bulunamadı"}
                        </option>
                        {currentAvailableUnits.map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle pointer-events-none" />
                    </div>

                    {/* Combo Box Sağında SADECE Seçilen Birim (Mavi Renkte) */}
                    <div className="flex items-center justify-center min-w-[54px]">
                      <span className="text-2xl font-black font-mono text-blue-600 dark:text-blue-400 tracking-wider">
                        {selectedUnit || "-"}
                      </span>
                    </div>
                  </div>

                  {currentAvailableUnits.length === 0 && (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400">
                      Bu malzeme için CANIAS sisteminde tanımlı birim bulunamadı.
                    </p>
                  )}
                </div>
              )}

              {/* TAB 3: BARKOD MODU VE GİRİŞİ */}
              {activeTab === "barcode" && (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-fg block">
                      Barkod Seçeneği
                    </label>
                    {/* İki Buton Kartı: Sıradaki Numarayı Ata & Kendin Gir */}
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={handleSelectAutoBarcode}
                        className={`flex items-center justify-center p-2.5 rounded-xl border text-xs font-bold transition active:scale-95 text-center leading-tight ${barcodeMode === "auto"
                          ? "border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-500 shadow-xs"
                          : "border-line bg-elevated/40 text-subtle hover:text-fg hover:bg-elevated"
                          }`}
                      >
                        <span>Sıradaki Numarayı Ata</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleSelectManualBarcode}
                        className={`flex items-center justify-center p-2.5 rounded-xl border text-xs font-bold transition active:scale-95 text-center leading-tight ${barcodeMode === "manual"
                          ? "border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-500 shadow-xs"
                          : "border-line bg-elevated/40 text-subtle hover:text-fg hover:bg-elevated"
                          }`}
                      >
                        <span>Kendin Gir</span>
                      </button>
                    </div>
                  </div>

                  {/* Butonların Altında Barkod Metin Kutusu */}
                  <div>
                    <label className="text-[11px] font-semibold text-subtle mb-1 block">
                      Barkod Numarası
                    </label>
                    <input
                      type="text"
                      disabled={barcodeMode !== "manual"}
                      value={barcodeMode === "manual" ? customBarcode : ""}
                      onChange={(e) => setCustomBarcode(e.target.value.toUpperCase())}
                      placeholder={
                        !barcodeMode
                          ? "Lütfen yukarıdan bir seçenek belirleyin"
                          : barcodeMode === "auto"
                            ? "Sistem otomatik atayacak"
                            : "Barkod numarasını yazınız..."
                      }
                      className={`field-input h-10 px-3 text-xs font-mono font-bold transition ${barcodeMode !== "manual"
                        ? "bg-elevated/50 text-subtle/70 cursor-not-allowed border-dashed"
                        : "border-blue-300 dark:border-blue-800 text-fg focus:border-blue-600"
                        }`}
                    />
                  </div>

                  {/* Yazdırılacak Etiket Sayısı (PIPRINTCOUNT) */}
                  <div className="pt-1 border-t border-line/50">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-semibold text-subtle">
                        Etiket Baskı Adedi
                      </label>
                      <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400">
                        {printCount === 0 ? "Yazdırılmayacak (0)" : `${printCount} adet basılacak`}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setPrintCount((prev) => Math.max(0, prev - 1))}
                        disabled={printCount <= 0}
                        className="flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-elevated text-fg font-bold hover:bg-elevated/80 transition active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        -
                      </button>
                      <input
                        type="number"
                        min={0}
                        max={99}
                        value={printCount}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          setPrintCount(isNaN(val) ? 0 : Math.min(99, Math.max(0, val)));
                        }}
                        className="field-input h-9 text-center font-bold font-mono text-xs flex-1"
                      />
                      <button
                        type="button"
                        onClick={() => setPrintCount((prev) => Math.min(99, prev + 1))}
                        disabled={printCount >= 99}
                        className="flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-elevated text-fg font-bold hover:bg-elevated/80 transition active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        +
                      </button>
                    </div>
                    <p className="text-[10px] text-subtle mt-1">
                      * 0 girilirse yalnızca sisteme barkod tanımlanır, etiket yazdırılmaz.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sağ Kolon: Kartlar */}
        <div className="min-w-0 space-y-2.5">
          {searching ? (
            <div className="space-y-3">
              {[1, 2, 3].map((n) => (
                <div key={n} className="h-16 animate-pulse rounded-2xl bg-elevated/60" />
              ))}
            </div>
          ) : searchResults.length > 0 ? (
            <div className="space-y-2.5">
              {searchResults.map((r) => {
                const selected = selectedCard?.id === r.id;
                return (
                  <div
                    key={r.id}
                    id={`product-card-${r.id}`}
                    onClick={() => handleSelectCard(r)}
                    className={`relative flex min-h-[80px] h-[80px] cursor-pointer items-center justify-between rounded-2xl border px-4 py-2.5 text-left shadow-card transition-all ${selected
                      ? "border-blue-500 bg-blue-500/10 ring-2 ring-blue-500/30"
                      : "border-line bg-surface hover:border-blue-300"
                      }`}
                  >
                    <div className="min-w-0 flex-1 pr-3 flex flex-col justify-center">
                      <p
                        className="font-semibold text-fg text-xs sm:text-sm line-clamp-2 leading-snug"
                        title={r.name}
                      >
                        {r.name}
                      </p>
                      <p className="text-[11px] sm:text-xs font-mono text-subtle truncate mt-0.5">
                        {r.material}
                      </p>
                    </div>

                    <span
                      className={`chip text-xs font-bold shrink-0 ml-1 ${selected
                        ? "bg-blue-600 text-white shadow-xs"
                        : "bg-elevated text-subtle"
                        }`}
                    >
                      {selected ? "Seçildi" : "Seç"}
                    </span>
                  </div>
                );
              })}
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
                Arama yapmak için sol taraftaki panelden isim veya malzeme kodu giriniz.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}