import { useState } from "react";
import {
  Loader2,
  Check,
  Package,
  AlertCircle,
  Camera,
  CornerDownLeft,
  Copy,
} from "lucide-react";
import PageHeader from "../../components/PageHeader";
import MaterialDetailCard from "../../components/MaterialDetailCard";
import MaterialUnitsCard from "../../components/MaterialUnitsCard";
import CameraScanOverlay from "../../components/CameraScanOverlay";
import { api } from "../../api/client";
import { sesBasarili, sesHata } from "../../sound";
import {
  ProductBarcodeCardItem,
  formatBarcodeUnitInfo,
} from "./ProductBarcodePage";

// Koşul KALDIRILDI (Bora): her tanımlı birim barkodlanabilir — kısıt yok.
const NON_BARCODE_UNITS = new Set<string>();

type StepType = 1 | 2;
type BarcodeMode = "manual" | "auto";

export default function BarcodeGeneratorPage() {

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
  const [barcodeMode, setBarcodeMode] = useState<BarcodeMode>("auto"); // Varsayılan: Sıradaki numarayı al AÇIK
  const [customBarcode, setCustomBarcode] = useState("");
  const [copyCount, setCopyCount] = useState<string>("0"); // serbest metin — boş bırakılabilir

  // İşlem ve Bildirim Durumları
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [createdBarcode, setCreatedBarcode] = useState("");
  const [copied, setCopied] = useState(false);

  // Seçilen malzemenin CANIAS'ta sahip olduğu geçerli birimler
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

      // Tekilleştirme: her MALZEMEDEN yalnızca 1 kart (birimler ayrı komponentte
      // gösterilir → artık birim başına tekrar YOK).
      const seenMats = new Set<string>();
      const uniqueCards = cards.filter((c) => {
        const key = (c.material || "").trim().toUpperCase();
        if (seenMats.has(key)) return false;
        seenMats.add(key);
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

  // Step 2'ye Geçiş
  // Adım 2: Barkod Oluşturma İşlemini Otomatik Kabul Edip Çalıştırma
  // Bir malzeme+birim için mevcut barkodları getir (oluşturma teyidi + yeni no).
  const birimBarkodlari = async (mat: string, unit: string): Promise<string[]> => {
    try {
      const d = await api.getMaterialDetail(mat);
      const list = Array.isArray(d.barcodeList) ? d.barcodeList : [];
      const U = unit.toUpperCase();
      return list
        .filter((b) => String(b.BUNIT || b.UNIT || b.BARCODEUNIT || b.B_UNIT || b.QUNIT || b.unit || "").trim().toUpperCase() === U)
        .map((b) => String(b.BARCODE || b.barcode || b.BARCODENUM || b.EAN || b.CODE || "").trim())
        .filter(Boolean);
    } catch {
      return [];
    }
  };

  const handleCopyCreated = async () => {
    const bc = createdBarcode.trim();
    if (!bc) return;
    try {
      await navigator.clipboard.writeText(bc);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = bc;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch { /* yok */ }
      document.body.removeChild(ta);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  const handleOkutmayaDon = () => {
    // Yeni barkod okutmak için 1. adıma (arama/okutma ekranına) temiz dön.
    setStep(1);
    setSearchTerm("");
    setSearchResults([]);
    setSearchDone(false);
    setSelectedCard(null);
    setSelectedUnit("");
    setCustomBarcode("");
    setBarcodeMode("manual");
    setSuccessMsg("");
    setCreatedBarcode("");
    setCopied(false);
    setErrorMsg("");
  };

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
    setCreatedBarcode("");
    setCopied(false);

    const mat = selectedCard.material;
    const unit = selectedUnit;
    const barcodeValue = isAuto ? "" : (newBarcode || customBarcode).trim();

    try {
      // Oluşturma ÖNCESİ barkodlar (auto numarayı bulmak + teyit için).
      const oncekiSet = new Set(await birimBarkodlari(mat, unit));

      const res = await api.createBarcode({
        material: mat,
        unit,
        autoGenerate: isAuto ? 1 : 0,
        newBarcode: barcodeValue,
        printCount: parseInt(copyCount, 10) || 0,
      });

      if (!res.ok) {
        setErrorMsg(res.message || "Barkod oluşturulurken bir sorun oluştu.");
        sesHata();
        return;
      }

      // Oluşturma SONRASI: yeniden çek → gerçek barkodu bul ve TEYİT et.
      const sonraki = await birimBarkodlari(mat, unit);
      const created = isAuto
        ? (sonraki.find((b) => !oncekiSet.has(b)) || String(res.barcode || ""))
        : barcodeValue;

      const eklendi = isAuto
        ? Boolean(created)
        : sonraki.some((b) => b.toUpperCase() === barcodeValue.toUpperCase());
      if (!eklendi) {
        setErrorMsg("Barkod oluşturulamadı — kayıt doğrulanamadı. Lütfen tekrar deneyin.");
        sesHata();
        return;
      }

      setCreatedBarcode(created);
      setSuccessMsg(`${unit} birimi için barkod oluşturuldu.`);
      sesBasarili();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Kayıt işlemi sırasında bir hata oluştu.");
      sesHata();
    } finally {
      setSaving(false);
    }
  };

  // Birim seçilir seçilmez doğrudan 2. adıma geç (Devam beklemeden).
  const birimSecVeGec = (kart: ProductBarcodeCardItem, unit: string) => {
    setSelectedCard(kart);
    setSelectedUnit(unit);
    setBarcodeMode("auto");
    setCustomBarcode("");
    setCopyCount("0");
    setErrorMsg("");
    setSuccessMsg("");
    setCreatedBarcode("");
    setCopied(false);
    setStep(2);
  };

  const handleOlusturTikla = () => {
    if (saving) return;
    const isAuto = barcodeMode === "auto";
    if (!isAuto && !customBarcode.trim()) {
      setErrorMsg("Barkod numarası boş olamaz — yazın ya da 'Sıradaki numarayı al'ı açın.");
      sesHata();
      return;
    }
    handleExecuteCreate({ isAuto, newBarcode: customBarcode.trim() });
  };

  return (
    <div className="mx-auto max-w-2xl p-3 sm:p-4 lg:p-6 space-y-4">
      {/* ========================================================================= */}
      {/* ADIM 1: ARAMA & MALZEME KARTLARI SEÇİM EKRANI                            */}
      {/* ========================================================================= */}
      {step === 1 && (
        <>
          {/* HEADER: Barkod Oluşturma başlığı (Devam butonu yok — birim seçilince otomatik 2. adıma geçilir) */}
          <PageHeader
            title="Barkod Oluşturma"
            backTo="/home"
          />

          {/* ÜST GİRİŞ KARTI (Arama & İrsaliye Alanı) */}
          <div className="card p-4 sm:p-3 shadow-card space-y-1.5">
            {/* Barkod / Ürün Giriş Alanı */}
            <div className="space-y-0">
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
                  placeholder="Barkod veya Ürün Kodu ya da Açıklama girin..."
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
              <div className="space-y-4">
                {searchResults.map((r) => (
                  <div key={r.material} className="space-y-2">
                    {/* Malzeme kartı (resim/barkod/ölçü/özellik) */}
                    <MaterialDetailCard materialCode={r.material} showEditButton={false} />
                    {/* Birimler komponenti — barkod oluşturmak için birim seç */}
                    <MaterialUnitsCard
                      material={r.material}
                      selectedUnit={selectedCard?.material === r.material ? selectedUnit : ""}
                      onSelectUnit={(u) => birimSecVeGec(r, u)}
                    />
                  </div>
                ))}
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
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 space-y-3">
              <div className="flex items-center gap-3 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                <Check className="h-5 w-5 shrink-0" />
                <p>{successMsg}</p>
              </div>
              {createdBarcode && (
                <div className="flex items-center gap-2 rounded-xl border border-emerald-300/60 bg-white/70 px-3 py-2 dark:bg-black/20">
                  <span className="shrink-0 text-[11px] font-bold text-subtle">Barkod:</span>
                  <span className="min-w-0 flex-1 truncate font-mono text-base font-black text-fg">{createdBarcode}</span>
                  <button
                    type="button"
                    onClick={handleCopyCreated}
                    className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-line bg-surface px-2.5 text-[12px] font-bold text-subtle transition hover:bg-elevated hover:text-fg active:scale-95"
                  >
                    {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                    {copied ? "Kopyalandı" : "Kopyala"}
                  </button>
                </div>
              )}
              <button
                type="button"
                onClick={handleOkutmayaDon}
                className="w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-500 active:scale-[0.99]"
              >
                Okutmaya Geri Dön
              </button>
            </div>
          )}

          {errorMsg && (
            <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm font-semibold text-rose-600 dark:text-rose-400 flex items-center gap-3">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <p>{errorMsg}</p>
            </div>
          )}

          {/* ADIM 2 KARTI */}
          <div className="card p-5 sm:p-4 shadow-card space-y-3">
            {/* A. Barkod oluşturulacak birim (1. adımda seçildi; değiştirmek için Geri) */}
            <div className="flex items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-2.5 dark:border-blue-800 dark:bg-blue-950/40">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-blue-600/80 dark:text-blue-300/80">
                  Barkod oluşturulacak birim
                </p>
                <p className="truncate text-sm font-bold text-fg">{selectedCard.name}</p>
              </div>
              <span className="inline-flex h-9 shrink-0 items-center rounded-lg bg-blue-600 px-3 text-sm font-black text-white">
                {selectedUnit || "-"}
              </span>
            </div>

            {/* C. Barkod Numarası (barkod okuma alanı) — üstte.
                "Sıradaki numarayı al" AÇIKken pasif, KAPALIyken aktif. */}
            <div className="space-y-1.5">
              <label
                htmlFor="input-custom-barcode"
                className="text-xs font-semibold text-subtle block"
              >
                Barkod Numarası
              </label>
              <input
                type="text"
                id="input-custom-barcode"
                disabled={barcodeMode === "auto" || saving}
                value={customBarcode}
                onChange={(e) => setCustomBarcode(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleOlusturTikla();
                  }
                }}
                placeholder={
                  barcodeMode === "auto"
                    ? "Sıradaki numara otomatik alınacak"
                    : "Barkod numarasını yazınız…"
                }
                className={`field-input h-11 w-full text-sm font-mono font-bold transition ${barcodeMode === "auto"
                  ? "bg-elevated/50 text-subtle/50 cursor-not-allowed border-dashed"
                  : "border-blue-300 dark:border-blue-800 text-fg focus:border-blue-600"
                  }`}
              />

              {/* B. "Sıradaki numarayı al" anahtarı — Trace gibi, barkod alanının HEMEN ALTINDA.
                  Ekran açılışında AÇIK (1) gelir → barkod alanı pasif.
                  Aktif edilince barkod boşaltılır ve pasifleşir (ters ilişki). */}
              <button
                type="button"
                role="switch"
                aria-checked={barcodeMode === "auto"}
                aria-label="Sıradaki numarayı al aç/kapa"
                title={barcodeMode === "auto" ? "Sıradaki numarayı al AÇIK (1)" : "Sıradaki numarayı al KAPALI (0)"}
                disabled={saving}
                onClick={() => {
                  setBarcodeMode((m) => {
                    const next = m === "auto" ? "manual" : "auto";
                    if (next === "auto") setCustomBarcode(""); // aktif → barkodu boşalt
                    return next;
                  });
                  setErrorMsg("");
                }}
                className="mt-1.5 flex items-center gap-2.5 rounded-xl px-1 py-1 transition active:scale-95 disabled:opacity-60"
              >
                <span
                  className={`text-sm font-semibold ${barcodeMode === "auto" ? "text-blue-600" : "text-subtle"}`}
                >
                  Sıradaki numarayı al
                </span>
                <span
                  className={`relative flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 ${barcodeMode === "auto" ? "bg-blue-600" : "bg-slate-300 dark:bg-slate-600"
                    }`}
                >
                  <span
                    className={`absolute flex h-5 w-5 items-center justify-center rounded-full bg-white text-[10px] font-bold shadow transition-transform duration-200 ${barcodeMode === "auto" ? "translate-x-[22px] text-blue-600" : "translate-x-0.5 text-slate-500"
                      }`}
                  >
                    {barcodeMode === "auto" ? "1" : "0"}
                  </span>
                </span>
              </button>
            </div>

            {/* D. Kopya (yazdırma) sayısı */}
            <div className="space-y-1.5">
              <label
                htmlFor="input-copy-count"
                className="text-xs font-semibold text-subtle block"
              >
                Kopya (yazdırma) sayısı
              </label>
              <input
                type="text"
                inputMode="numeric"
                id="input-copy-count"
                disabled={saving}
                value={copyCount}
                onChange={(e) => {
                  let v = e.target.value.replace(/[^0-9]/g, "");
                  if (v.length > 1) v = v.replace(/^0+/, "") || "0"; // baştaki sıfırları temizle
                  if (v !== "" && parseInt(v, 10) > 99) v = "99"; // üst sınır
                  setCopyCount(v); // boş bırakmaya izin ver
                }}
                placeholder="0"
                className="field-input h-11 w-full text-sm font-semibold"
              />
              <p className="text-[11px] text-subtle">0 = yazdırma yok, yalnızca barkod oluştur.</p>
            </div>

            {/* E. Barkod Oluştur */}
            <button
              type="button"
              id="btn-barcode-create"
              disabled={saving || (barcodeMode === "manual" && !customBarcode.trim())}
              onClick={handleOlusturTikla}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-sm font-bold text-white shadow-lg shadow-blue-500/30 transition hover:bg-blue-500 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> İşleniyor…
                </>
              ) : (
                "Barkod Oluştur"
              )}
            </button>
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