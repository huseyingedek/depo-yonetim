import { useState, useMemo, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Loader2,
  ChevronDown,
  Check,
  Package,
  AlertCircle,
  Camera,
  CornerDownLeft,
} from "lucide-react";
import PageHeader from "../../components/PageHeader";
import CameraScanOverlay from "../../components/CameraScanOverlay";
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

type StepType = 1 | 2;
type BarcodeMode = "manual" | "auto";

export default function BarcodeGeneratorPage() {
  const navigate = useNavigate();
  const redirectTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Temizlik: component unmount olduğunda timer'ı temizle
  useEffect(() => {
    return () => {
      if (redirectTimerRef.current) {
        clearTimeout(redirectTimerRef.current);
      }
    };
  }, []);

  // Adım Akışı: 1 = Malzeme Arama & Kart Seçimi, 2 = Birim & Barkod Tanımlama
  const [step, setStep] = useState<StepType>(1);

  // --- ADIM 1: ARAMA & LİSTELEME DURUMLARI ---
  const [searchTerm, setSearchTerm] = useState("");
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchDone, setSearchDone] = useState(false);
  const [searchResults, setSearchResults] = useState<ProductBarcodeCardItem[]>([]);
  const [selectedCard, setSelectedCard] = useState<ProductBarcodeCardItem | null>(null);

  // --- ADIM 2: BİRİM & BARKOD DURUMLARI ---
  const [selectedUnit, setSelectedUnit] = useState<string>("");
  const [barcodeMode, setBarcodeMode] = useState<BarcodeMode>("manual"); // Varsayılan: Kendin Gir
  const [customBarcode, setCustomBarcode] = useState("");

  // İşlem ve Bildirim Durumları
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Seçilen malzemenin CANIAS'ta sahip olduğu geçerli birimler
  const availableUnitsForSelected = useMemo(() => {
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

  // Türkçe karakter duyarsız arama normalizasyonu
  function trNormalize(str: string): string {
    return str
      .toLocaleLowerCase("tr-TR")
      .replace(/ı/g, "i")
      .replace(/ş/g, "s")
      .replace(/ğ/g, "g")
      .replace(/ü/g, "u")
      .replace(/ö/g, "o")
      .replace(/ç/g, "c")
      .trim();
  }

  // CANIAS MZYGetMaterial detayından malzeme kartlarını üretir
  // Kural: Aynı ürünün her birimi için sadece 1 kart üretilir (Örn: 1 AD, 1 KO, 3 PK -> 1 AD, 1 KO, 1 PK)
  async function fetchCardsForMaterial(
    matCode: string,
    initialName = "",
    initialUnit = "",
    searchedBarcode = ""
  ): Promise<ProductBarcodeCardItem[]> {
    const matDetail = await api.getMaterialDetail(matCode);
    let name = initialName;
    let baseUnit = initialUnit;

    const rawMatList = matDetail.ok && Array.isArray(matDetail.matList) ? matDetail.matList : [];
    const m = rawMatList.find((row) => {
      const code = String(row.MATERIAL || row.MATCODE || row.ITEMCODE || "").trim();
      const text = String(row.STEXT || row.MTEXT || row.NAME1 || row.NAME || "").trim();
      return Boolean(code || text);
    });

    const rawBarcodeList = Array.isArray(matDetail.barcodeList) ? matDetail.barcodeList : [];
    const hasRealBarcodes = rawBarcodeList.some((b) =>
      Boolean(String(b.BARCODE || b.barcode || b.BARCODENUM || b.EAN || b.CODE || "").trim())
    );

    const hasRealMat = Boolean(m || hasRealBarcodes);

    if (m) {
      const realCode = String(m.MATERIAL || m.MATCODE || m.ITEMCODE || "").trim();
      if (realCode) matCode = realCode;
      name = String(m.STEXT || m.MTEXT || m.NAME1 || m.NAME || name || "").trim();
      const qUnit = String(m.QUNIT || m.UNIT || m.IUNIT || "").trim().toUpperCase();
      if (qUnit) baseUnit = qUnit;
    }

    if (!hasRealMat && !initialName) {
      return [];
    }

    const rawUnitList = Array.isArray(matDetail.unitList) ? matDetail.unitList : [];

    // Malzemenin geçerli birimlerini topla
    const unitSet = new Set<string>();

    for (const b of rawBarcodeList) {
      const rawUnit = String(
        b.BUNIT || b.UNIT || b.BARCODEUNIT || b.B_UNIT || b.QUNIT || b.SKUNIT || b.unit || ""
      ).trim().toUpperCase();
      if (!rawUnit || NON_BARCODE_UNITS.has(rawUnit)) continue;
      const uShort = formatBarcodeUnitInfo(rawUnit).short || rawUnit;
      if (uShort && !NON_BARCODE_UNITS.has(uShort)) {
        unitSet.add(uShort);
      }
    }

    for (const u of rawUnitList) {
      const uCode = String(u.QUNIT || u.UNIT || u.BUNIT || u.IUNIT || u.TUNIT || "").trim().toUpperCase();
      if (uCode && !NON_BARCODE_UNITS.has(uCode)) {
        const uShort = formatBarcodeUnitInfo(uCode).short || uCode;
        if (!NON_BARCODE_UNITS.has(uShort)) unitSet.add(uShort);
      }
    }

    if (baseUnit && !NON_BARCODE_UNITS.has(baseUnit)) {
      const uShort = formatBarcodeUnitInfo(baseUnit).short || baseUnit;
      if (!NON_BARCODE_UNITS.has(uShort)) unitSet.add(uShort);
    }
    if (initialUnit && !NON_BARCODE_UNITS.has(initialUnit)) {
      const uShort = formatBarcodeUnitInfo(initialUnit).short || initialUnit;
      if (!NON_BARCODE_UNITS.has(uShort)) unitSet.add(uShort);
    }

    if (unitSet.size === 0) {
      unitSet.add("AD");
    }

    const availableUnits = Array.from(unitSet);

    // KURAL: Gelen yanıtta aynı birimden birden fazla barkod olsa dahi her birimden birer kart üretilir
    const cards: ProductBarcodeCardItem[] = [];

    for (const u of availableUnits) {
      // Bu birime ait varsa mevcut bir barkod bul
      const matchedBarcodeItem = rawBarcodeList.find((b) => {
        const rawUnit = String(
          b.BUNIT || b.UNIT || b.BARCODEUNIT || b.B_UNIT || b.QUNIT || b.SKUNIT || b.unit || ""
        ).trim().toUpperCase();
        const uShort = formatBarcodeUnitInfo(rawUnit).short || rawUnit;
        return uShort === u;
      });

      const bCode = matchedBarcodeItem
        ? String(
            matchedBarcodeItem.BARCODE ||
            matchedBarcodeItem.barcode ||
            matchedBarcodeItem.BARCODENUM ||
            matchedBarcodeItem.EAN ||
            matchedBarcodeItem.CODE ||
            ""
          ).trim()
        : "";

      const unitInfo = formatBarcodeUnitInfo(u);

      cards.push({
        id: `${matCode}_${u}`,
        material: matCode,
        name: name || matCode,
        barcode: bCode,
        unit: u,
        unitLabel: unitInfo.label,
        isSearchedBarcode: Boolean(
          searchedBarcode && bCode && bCode.toLowerCase() === searchedBarcode.toLowerCase()
        ),
        availableUnits,
      });
    }

    return cards;
  }

  // Malzeme Arama İşlevi (Enter veya Kamera okutulduğunda tetiklenir)
  const handleSearch = async (termToSearch?: string) => {
    const term = (termToSearch !== undefined ? termToSearch : searchTerm).trim();
    if (!term) return;

    setErrorMsg("");
    setSuccessMsg("");
    setSearching(true);
    setSearchDone(false);
    setSelectedCard(null);

    try {
      let cards: ProductBarcodeCardItem[] = [];
      let apiError: string | null = null;

      // A) Doğrudan malzeme detayı / barkod çağrısı
      try {
        const directCards = await fetchCardsForMaterial(term, "", "", term);
        if (directCards.length > 0 && directCards[0].name.toLowerCase() !== term.toLowerCase()) {
          cards = directCards;
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        apiError = msg;
        if (/bağlantı|cevaplanmadı|proxy|zaman aşımı|fetch|500|network/i.test(msg)) {
          throw err;
        }
      }

      // B) Stok sorgusu (Açıklama veya malzeme koduna göre arama)
      if (cards.length === 0) {
        try {
          const allStock = await api.queryStock({});
          const normTerm = trNormalize(term);
          const matches = allStock.filter((r) => {
            const rName = r.name ? trNormalize(r.name) : "";
            const rMat = r.material ? trNormalize(r.material) : "";
            return rName.includes(normTerm) || rMat.includes(normTerm);
          });

          const uniqueMaterials = new Map<string, { name: string; unit: string }>();
          for (const r of matches) {
            if (r.material && !uniqueMaterials.has(r.material)) {
              uniqueMaterials.set(r.material, { name: r.name, unit: r.unit });
              if (uniqueMaterials.size >= 25) break;
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

      // C) Hala kart bulunamadıysa readBarcode servisi
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

      if (cards.length === 0 && apiError) {
        throw new Error(apiError);
      }

      // Tekilleştirme: Her (material_unit) kombinasyonundan yalnızca 1 kart
      const seenCardIds = new Set<string>();
      const uniqueCards = cards.filter((c) => {
        if (seenCardIds.has(c.id)) return false;
        seenCardIds.add(c.id);
        return true;
      });

      setSearchResults(uniqueCards);
      setSearchDone(true);
    } catch (err: unknown) {
      setSearchResults([]);
      setSearchDone(true);
      const msg = err instanceof Error ? err.message : "Arama sırasında bir hata oluştu.";
      setErrorMsg(msg);
      sesHata();
    } finally {
      setSearching(false);
    }
  };

  // Kart Seçimi: Seçilen kart listenin en üstüne taşınır, Header'daki Devam butonu aktifleşir
  const handleSelectCard = (item: ProductBarcodeCardItem) => {
    setSelectedCard(item);

    // Kural: "seçilen kart yukarı taşınacak eğer alt sıralardaysa"
    setSearchResults((prev) => {
      const idx = prev.findIndex((c) => c.id === item.id);
      if (idx <= 0) return prev;
      const copy = [...prev];
      const [moved] = copy.splice(idx, 1);
      return [moved, ...copy];
    });
  };

  // Step 2'ye Geçiş
  const handleContinueToStep2 = () => {
    if (!selectedCard) return;
    // ComboBox'tan seçim yapılana kadar butonların kilitli kalması kuralı gereği boş başlatılır
    setSelectedUnit("");
    setCustomBarcode("");
    setBarcodeMode("manual");
    setErrorMsg("");
    setSuccessMsg("");
    setStep(2);
  };

  // Adım 2: Barkod Oluşturma İşlemini Otomatik Kabul Edip Çalıştırma
  const handleExecuteCreate = async ({
    isAuto,
    newBarcode,
  }: {
    isAuto: boolean;
    newBarcode?: string;
  }) => {
    if (!selectedCard || !selectedUnit || saving) return;

    if (!isAuto && (!newBarcode || !newBarcode.trim())) {
      setErrorMsg("Lütfen geçerli bir barkod numarası yazınız.");
      sesHata();
      return;
    }

    setSaving(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      const barcodeValue = isAuto ? "" : (newBarcode || customBarcode).trim();

      // CANIAS MZYCreateBarcode servisine kaydetme isteği
      const res = await api.createBarcode({
        company: "01",
        material: selectedCard.material,
        unit: selectedUnit,
        autoGenerate: isAuto ? 1 : 0,
        newBarcode: barcodeValue,
        printCount: 0,
      });

      if (res.ok) {
        const assigned = res.barcode || (isAuto ? "Sıradaki Numara" : barcodeValue);
        const okText = `Barkod (${assigned}) başarıyla oluşturuldu!`;
        setSuccessMsg(okText);
        sesBasarili();
      } else {
        const errText = res.message || "Barkod oluşturulurken bir sorun oluştu.";
        setErrorMsg(errText);
        sesHata();
      }
    } catch (err: unknown) {
      const errText = err instanceof Error ? err.message : "Kayıt işlemi sırasında bir hata oluştu.";
      setErrorMsg(errText);
      sesHata();
    } finally {
      setSaving(false);
      // KURAL: 3 saniye sonra kullanıcı otomatik olarak anasayfaya (/home) yönlendirilecek
      redirectTimerRef.current = setTimeout(() => {
        navigate("/home");
      }, 3000);
    }
  };

  const isStep2Locked = !selectedUnit;

  return (
    <div className="mx-auto max-w-2xl p-3 sm:p-4 lg:p-6 space-y-4">
      {/* ========================================================================= */}
      {/* ADIM 1: ARAMA & MALZEME KARTLARI SEÇİM EKRANI                            */}
      {/* ========================================================================= */}
      {step === 1 && (
        <>
          {/* HEADER: Barkod Oluşturma Başlığı ve Sağda Devam Butonu */}
          <PageHeader
            title="Barkod Oluşturma"
            backTo="/label-printing"
            right={
              <button
                type="button"
                id="btn-step1-devam"
                disabled={!selectedCard}
                onClick={handleContinueToStep2}
                className={`flex h-10 items-center justify-center rounded-xl px-5 text-sm font-bold transition-all ${
                  selectedCard
                    ? "bg-blue-600 text-white shadow-lg shadow-blue-500/30 hover:bg-blue-500 active:scale-95 ring-2 ring-blue-400 cursor-pointer"
                    : "bg-elevated text-subtle/50 border border-line cursor-not-allowed opacity-50"
                }`}
              >
                Devam
              </button>
            }
          />

          {/* ÜST GİRİŞ KARTI (Arama & İrsaliye Alanı) */}
          <div className="card p-4 sm:p-5 shadow-card space-y-3.5">
            {/* Barkod / Ürün Giriş Alanı */}
            <div className="space-y-1">
              <div className="relative flex items-center">
                <input
                  type="text"
                  id="input-barcode-search"
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
                  placeholder="Barkod / Ürün Kodu / Açıklama girin..."
                  className="field-input w-full pr-20 h-11 text-sm font-medium"
                />
                <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-1">
                  {/* Enter Butonu */}
                  <button
                    type="button"
                    id="btn-search-enter"
                    onClick={() => handleSearch(searchTerm)}
                    disabled={!searchTerm.trim() || searching}
                    aria-label="Ara"
                    title="Ara"
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-subtle transition hover:bg-elevated hover:text-fg disabled:opacity-30"
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
                    id="btn-search-camera"
                    onClick={() => setIsCameraOpen(true)}
                    aria-label="Kamera ile barkod oku"
                    title="Kamera ile barkod oku"
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-subtle transition hover:bg-elevated hover:text-fg"
                  >
                    <Camera className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <p className="text-xs text-subtle pl-1">
                Açıklama, ürün kodu ya da barkod girin
              </p>
            </div>
          </div>

          {/* Hata Bildirimi */}
          {errorMsg && (
            <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-3.5 text-xs sm:text-sm font-semibold text-rose-600 dark:text-rose-400 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* SONUÇ KARTLARI LİSTESİ */}
          <div className="space-y-2.5">
            {searching ? (
              <div className="space-y-2.5">
                {[1, 2, 3].map((n) => (
                  <div
                    key={n}
                    className="h-20 animate-pulse rounded-2xl bg-elevated/60 border border-line"
                  />
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
                      className={`relative flex min-h-[80px] h-[80px] cursor-pointer items-center justify-between rounded-2xl border px-4 py-2.5 text-left shadow-card transition-all ${
                        selected
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

                      <div className="flex items-center gap-2 shrink-0">
                        {/* Birim Çipi (Renksiz / Nötr) */}
                        <span className="chip text-xs font-bold border border-line bg-elevated text-subtle">
                          {r.unit}
                        </span>
                        {/* Seçim Rozeti */}
                        <span
                          className={`chip text-xs font-bold shrink-0 ml-1 ${
                            selected
                              ? "bg-blue-600 text-white shadow-xs"
                              : "bg-elevated text-subtle"
                          }`}
                        >
                          {selected ? "Seçildi" : "Seç"}
                        </span>
                      </div>
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
                  Arama yapmak için yukarıdaki alandan ürün kodu, açıklama ya da barkod okutunuz.
                </p>
              </div>
            )}
          </div>
        </>
      )}

      {/* ========================================================================= */}
      {/* ADIM 2: BİRİM VE BARKOD TANIMLAMA EKRANI                                 */}
      {/* ========================================================================= */}
      {step === 2 && selectedCard && (
        <>
          {/* HEADER: Geri butonu Adım 1'e döndürür */}
          <PageHeader
            title="Barkod Oluşturma"
            subtitle={`${selectedCard.name} (${selectedCard.material})`}
            onBack={() => {
              if (saving) return;
              setStep(1);
            }}
          />

          {/* İŞLEM VE BİLDİRİM BANNERLARI */}
          {successMsg && (
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-3">
              <Check className="h-5 w-5 shrink-0" />
              <div>
                <p>{successMsg}</p>
                <p className="text-xs text-emerald-600/80 mt-0.5">
                  3 saniye sonra anasayfaya yönlendirileceksiniz...
                </p>
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm font-semibold text-rose-600 dark:text-rose-400 flex items-center gap-3">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <div>
                <p>{errorMsg}</p>
                <p className="text-xs text-rose-600/80 mt-0.5">
                  3 saniye sonra anasayfaya yönlendirileceksiniz...
                </p>
              </div>
            </div>
          )}

          {/* ADIM 2 KARTI */}
          <div className="card p-5 sm:p-6 shadow-card space-y-5">
            {/* A. Birim Seçim ComboBox'ı */}
            <div className="space-y-1.5">
              <label
                htmlFor="select-material-unit"
                className="text-xs font-bold text-fg block"
              >
                Birim Seçimi
              </label>
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <select
                    id="select-material-unit"
                    disabled={saving}
                    value={selectedUnit}
                    onChange={(e) => {
                      setSelectedUnit(e.target.value);
                      setErrorMsg("");
                    }}
                    className="field-input h-11 w-full px-3 text-sm font-semibold appearance-none bg-surface cursor-pointer pr-9 border-line focus:border-blue-500"
                  >
                    <option value="" disabled>
                      {availableUnitsForSelected.length > 0
                        ? "Birim Seçiniz..."
                        : "Tanımlı birim bulunamadı"}
                    </option>
                    {availableUnitsForSelected.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle pointer-events-none" />
                </div>

                {/* Seçilen Birim: ComboBox'ın sağında mavi ve aynı puntoda */}
                <div className="flex items-center justify-center min-w-[50px] h-11 px-3 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800">
                  <span className="text-sm font-bold text-blue-600 dark:text-blue-400">
                    {selectedUnit || "-"}
                  </span>
                </div>
              </div>
            </div>

            {/* B. Barkod Modu Seçenekleri ("Kendin Gir" & "Sıradakini Al") */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-fg block">
                Barkod Seçeneği
              </label>
              <div className="grid grid-cols-2 gap-3">
                {/* Sol Buton: Kendin Gir (Varsayılan Açık) */}
                <button
                  type="button"
                  id="btn-mode-manual"
                  disabled={isStep2Locked || saving}
                  onClick={() => setBarcodeMode("manual")}
                  className={`flex items-center justify-center p-3 rounded-xl border text-xs sm:text-sm font-bold transition active:scale-95 text-center ${
                    isStep2Locked
                      ? "opacity-40 cursor-not-allowed border-line bg-elevated/20 text-subtle"
                      : barcodeMode === "manual"
                        ? "border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-500 shadow-xs"
                        : "border-line bg-elevated/40 text-subtle hover:text-fg hover:bg-elevated"
                  }`}
                >
                  Kendin Gir
                </button>

                {/* Sağ Buton: Sıradakini Al (Tıklanınca otomatik kabul edip işlemi yürütür) */}
                <button
                  type="button"
                  id="btn-mode-auto"
                  disabled={isStep2Locked || saving}
                  onClick={() => {
                    if (isStep2Locked || saving) return;
                    setBarcodeMode("auto");
                    handleExecuteCreate({ isAuto: true });
                  }}
                  className={`flex items-center justify-center p-3 rounded-xl border text-xs sm:text-sm font-bold transition active:scale-95 text-center ${
                    isStep2Locked
                      ? "opacity-40 cursor-not-allowed border-line bg-elevated/20 text-subtle"
                      : barcodeMode === "auto"
                        ? "border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-500 shadow-xs"
                        : "border-line bg-elevated/40 text-subtle hover:text-fg hover:bg-elevated"
                  }`}
                >
                  {saving && barcodeMode === "auto" ? (
                    <span className="flex items-center gap-1.5">
                      <Loader2 className="h-4 w-4 animate-spin" /> İşleniyor...
                    </span>
                  ) : (
                    "Sıradakini Al"
                  )}
                </button>
              </div>
            </div>

            {/* C. Kendin Gir Barkod Giriş Alanı */}
            {barcodeMode === "manual" && (
              <div className="space-y-1.5 pt-1">
                <label
                  htmlFor="input-custom-barcode"
                  className="text-xs font-semibold text-subtle block"
                >
                  Barkod Numarası
                </label>
                <div className="relative flex items-center">
                  <input
                    type="text"
                    id="input-custom-barcode"
                    disabled={isStep2Locked || saving}
                    value={customBarcode}
                    onChange={(e) => setCustomBarcode(e.target.value.toUpperCase())}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        if (customBarcode.trim() && !saving && !isStep2Locked) {
                          handleExecuteCreate({
                            isAuto: false,
                            newBarcode: customBarcode.trim(),
                          });
                        }
                      }
                    }}
                    placeholder={
                      isStep2Locked
                        ? "Önce yukarıdan birim seçiniz"
                        : "Barkod numarasını yazıp Enter'a basınız..."
                    }
                    className={`field-input h-11 w-full pr-12 text-sm font-mono font-bold transition ${
                      isStep2Locked
                        ? "bg-elevated/50 text-subtle/50 cursor-not-allowed border-dashed"
                        : "border-blue-300 dark:border-blue-800 text-fg focus:border-blue-600"
                    }`}
                  />
                  <div className="absolute right-1.5 top-1/2 -translate-y-1/2">
                    <button
                      type="button"
                      id="btn-confirm-custom-barcode"
                      disabled={isStep2Locked || saving || !customBarcode.trim()}
                      onClick={() => {
                        if (customBarcode.trim() && !saving && !isStep2Locked) {
                          handleExecuteCreate({
                            isAuto: false,
                            newBarcode: customBarcode.trim(),
                          });
                        }
                      }}
                      aria-label="Onayla"
                      title="Onayla"
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-subtle transition hover:bg-elevated hover:text-fg disabled:opacity-30"
                    >
                      {saving && barcodeMode === "manual" ? (
                        <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                      ) : (
                        <CornerDownLeft className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
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