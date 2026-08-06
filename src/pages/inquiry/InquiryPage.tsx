import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ScanSearch, MapPin, Package, Loader2, Warehouse, X, Printer, CheckCircle2, AlertCircle } from "lucide-react";
import PageHeader from "../../components/PageHeader";
import BarcodeScanner from "../../components/BarcodeScanner";
import { api } from "../../api/client";
import type { StockRow } from "../../types";

// ─────────────────────────────────────────────────────────────────────────────
// ÜRÜN SORGULAMA — Raf ve Ürün BAĞIMSIZ (Bora, 05.08).
//   • Alt alta iki alan: ister sadece rafı, ister sadece ürünü, ister ikisini.
//   • Sıra zorunluluğu YOK.
//   • İkisi de TEK servis: MZYGetStock (Bora: "ikisi için de getstock").
//       - Ürün okutulur → PSBARCODE dolu, raf boş
//       - Raf okutulur   → depo/stok yeri dolu, ürün boş
//       - İkisi birden   → ikisi de dolu
//     Diğer parametreler öndeğer (bkz. api.queryStock).
//   • Raf barkodu (D3$C1) depo+stok yerine MZYReadBarcodeSP ile çözülüp öyle
//     gönderilir (mevcut yapının aynısı).
// ─────────────────────────────────────────────────────────────────────────────

type Shelf = { warehouse: string; stockPlace: string };

// Filtreleme SERVİSTE yapılır (Bora, 05.08): switch'ler MZYGetStock'a iki
// parametre gönderir → PICONTAINER (konteynerları da getir, öndeğer 0) ve
// PIISPICKWH (yalnızca toplama depoları, öndeğer 1). Depo listesi WMS destek
// tablosundan gelir; istemcide sabit liste yok. Switch değişince yeniden sorgu.

function Switch({ on, onToggle, label, hint }: { on: boolean; onToggle: () => void; label: string; hint?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      className="flex w-full items-center justify-between gap-3 text-left"
    >
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold text-fg">{label}</span>
        {hint && <span className="block text-[11px] text-subtle">{hint}</span>}
      </span>
      <span className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? "bg-brand-500" : "bg-elevated"}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
      </span>
    </button>
  );
}

export default function InquiryPage() {
  const { t } = useTranslation();
  const [shelf, setShelf] = useState<Shelf | null>(null);
  const [productCode, setProductCode] = useState("");
  const [rows, setRows] = useState<StockRow[]>([]);
  const [queried, setQueried] = useState(false);

  const [shelfBusy, setShelfBusy] = useState(false);
  const [queryBusy, setQueryBusy] = useState(false);
  const [shelfError, setShelfError] = useState<string | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);

  const [printingIndex, setPrintingIndex] = useState<number | null>(null);
  const [toastMsg, setToastMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Filtre switch'leri — öndeğerler Bora spec: konteyner KAPALI(0), toplama AÇIK(1).
  const [konteynerGetir, setKonteynerGetir] = useState(false);
  const [sadeceToplama, setSadeceToplama] = useState(true);

  // Bora, 05.08: Satır Etiketi Basma (MZYPrintWHSP)
  //   • PSCOMPANY: "01", PSPLANT: "100", PSWAREHOUSE: satırın deposu, PSSTOCKPLACE: satırın stok yeri
  //   • PSCONTAINER: parti/batchnum
  //   • PIISCONTAINER: konteyner deseni ise 1, değilse 0
  const handlePrintRowLabel = async (b: StockRow, index: number) => {
    setPrintingIndex(index);
    setToastMsg(null);
    try {
      const isContainer = /^[A-Za-z]{2,}\d{6,}$/.test(b.stockPlace.trim());
      const res = await api.printWHSP({
        company: "01",
        plant: "100",
        warehouse: b.warehouse,
        stockPlace: b.stockPlace,
        container: b.batchNum && b.batchNum !== "*" ? b.batchNum : "",
        isContainer: isContainer ? 1 : 0,
        repeat: 1,
      });

      if (res.ok) {
        setToastMsg({
          type: "success",
          text: res.message || `${b.material || "Ürün"} (${b.warehouse}/${b.stockPlace}) etiket yazdırma isteği iletildi.`,
        });
      } else {
        setToastMsg({
          type: "error",
          text: res.message || "Etiket yazdırma başarısız oldu.",
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Yazdırma işlemi sırasında hata oluştu.";
      setToastMsg({ type: "error", text: msg });
    } finally {
      setPrintingIndex(null);
    }
  };

  // Tek sorgu — dolu olan alan(lar) gider, boş olan boş. (Bora: aynı servis.)
  // Filtreler serviste: switch değerleri PICONTAINER / PIISPICKWH olarak gider.
  const runQuery = async (
    sh: Shelf | null,
    code: string,
    filt?: { konteyner?: boolean; sadeceTop?: boolean }
  ) => {
    if (!sh && !code) {
      setRows([]);
      setQueried(false);
      setQueryError(null);
      return;
    }
    setQueryBusy(true);
    setQueryError(null);
    try {
      const r = await api.queryStock({
        barcode: code,
        warehouse: sh?.warehouse ?? "",
        stockPlace: sh?.stockPlace ?? "",
        container: filt?.konteyner ?? konteynerGetir,
        onlyPickWarehouse: filt?.sadeceTop ?? sadeceToplama,
      });
      setRows(r);
      setQueried(true);
    } catch (e) {
      setQueryError(e instanceof Error ? e.message : String(e));
      setRows([]);
      setQueried(true);
    } finally {
      setQueryBusy(false);
    }
  };

  const handleProduct = (code: string) => {
    const barkod = code.trim();
    if (!barkod || queryBusy) return;
    setProductCode(barkod);
    void runQuery(shelf, barkod);
  };

  const handleShelf = async (code: string) => {
    const barkod = code.trim();
    if (!barkod || shelfBusy) return;
    setShelfBusy(true);
    setShelfError(null);
    try {
      const r = await api.readShelfBarcode(barkod);
      if (!r.ok) {
        setShelfError(r.message || "Raf okunamadı");
        return;
      }
      const sh: Shelf = { warehouse: r.warehouse, stockPlace: r.stockPlace };
      setShelf(sh);
      await runQuery(sh, productCode);
    } catch (e) {
      setShelfError(e instanceof Error ? e.message : String(e));
    } finally {
      setShelfBusy(false);
    }
  };

  const clearShelf = () => {
    setShelf(null);
    setShelfError(null);
    void runQuery(null, productCode);
  };

  const clearProduct = () => {
    setProductCode("");
    void runQuery(shelf, "");
  };

  // Switch değişince yeniden sorgu (filtre serviste yapılır).
  const toggleSadeceToplama = () => {
    const yeni = !sadeceToplama;
    setSadeceToplama(yeni);
    if (queried) void runQuery(shelf, productCode, { sadeceTop: yeni });
  };
  const toggleKonteyner = () => {
    const yeni = !konteynerGetir;
    setKonteynerGetir(yeni);
    if (queried) void runQuery(shelf, productCode, { konteyner: yeni });
  };

  const birimToplam = rows.reduce<Record<string, number>>((acc, b) => {
    const u = b.unit || "?";
    acc[u] = (acc[u] ?? 0) + b.availStock;
    return acc;
  }, {});
  const birimler = Object.entries(birimToplam).sort((a, b) => b[1] - a[1]);
  const stokVar = birimler.some(([, v]) => v > 0);
  const busy = shelfBusy || queryBusy;

  return (
    <div className="mx-auto max-w-4xl p-4 lg:p-8">
      <PageHeader title={t("inquiry.title")} subtitle="Rafı ve/veya ürünü okut → stok / parti" backTo="/home" />

      <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
        {/* Sol: alt alta iki BAĞIMSIZ barkod alanı */}
        <div className="min-w-0 space-y-4 lg:sticky lg:top-24 lg:self-start">
          {/* ── RAF ── */}
          <div className="min-w-0">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="shrink-0 text-[13px] font-semibold text-muted">Raf <span className="font-normal text-subtle">(opsiyonel)</span></span>
              {shelf && (
                <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                  <Warehouse className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{shelf.warehouse}/{shelf.stockPlace}</span>
                  <button onClick={clearShelf} aria-label="Rafı temizle" className="ml-0.5 shrink-0 hover:text-emerald-900">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              )}
            </div>
            <BarcodeScanner onDetected={handleShelf} prompt="Raf barkodunu okutun" />
            {shelfBusy && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-subtle">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> raf okunuyor…
              </p>
            )}
            {shelfError && <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{shelfError}</p>}
          </div>

          {/* ── ÜRÜN ── */}
          <div className="min-w-0">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="shrink-0 text-[13px] font-semibold text-muted">Ürün <span className="font-normal text-subtle">(opsiyonel)</span></span>
              {productCode && (
                <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-cyan-50 px-2.5 py-0.5 font-mono text-xs font-semibold text-cyan-700">
                  <Package className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{productCode}</span>
                  <button onClick={clearProduct} aria-label="Ürünü temizle" className="ml-0.5 shrink-0 hover:text-cyan-900">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              )}
            </div>
            <BarcodeScanner onDetected={handleProduct} prompt="Ürün barkodunu okutun" />
            {queryBusy && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-subtle">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> sorgulanıyor…
              </p>
            )}
            {queryError && <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{queryError}</p>}
          </div>

          {/* ── FİLTRELER (aç/kapa) ── */}
          <div className="card space-y-3 p-4">
            <p className="text-[13px] font-semibold text-muted">Filtreler</p>
            <Switch
              on={sadeceToplama}
              onToggle={toggleSadeceToplama}
              label="Sadece toplama depoları"
              hint="Toplama dışı depoları gizle"
            />
            <Switch
              on={konteynerGetir}
              onToggle={toggleKonteyner}
              label="Konteynerları da getir"
              hint="İrsaliye / HU stok yerleri"
            />
          </div>
        </div>

        {/* Sağ: sonuçlar */}
        <div className="min-w-0">
          {!queried ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-surface py-16 text-center">
              <ScanSearch className="mb-2 h-10 w-10 text-subtle" />
              <p className="max-w-xs px-6 text-sm text-subtle">
                Rafı ve/veya ürünü okutun; stok durumu ve partiler burada listelenir.
              </p>
            </div>
          ) : busy && rows.length === 0 ? (
            <div className="flex items-center justify-center rounded-2xl border border-dashed border-line bg-surface py-16 text-subtle">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-surface py-16 text-center">
              <Package className="mb-2 h-10 w-10 text-subtle" />
              <p className="text-sm font-semibold text-rose-600">Kayıt bulunamadı</p>
              <p className="mt-1 max-w-xs px-6 text-xs text-subtle">Bu raf / ürün için (seçili filtrelerle) stok kaydı yok.</p>
            </div>
          ) : (
            <div className="animate-slide-up space-y-4">
              {/* Özet */}
              <div className={`flex items-center justify-between gap-3 rounded-2xl px-5 py-4 ${stokVar ? "bg-emerald-50" : "bg-rose-50"}`}>
                <div className="min-w-0">
                  <span className={`text-sm font-semibold ${stokVar ? "text-emerald-700" : "text-rose-700"}`}>
                    {stokVar ? "Toplam stok" : "Stok yok"}
                  </span>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                    {shelf && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-white/70 px-2 py-0.5 font-mono font-semibold text-emerald-700">
                        <Warehouse className="h-3 w-3" /> {shelf.warehouse}/{shelf.stockPlace}
                      </span>
                    )}
                    {productCode && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-white/70 px-2 py-0.5 font-mono font-semibold text-cyan-700">
                        <Package className="h-3 w-3" /> {productCode}
                      </span>
                    )}
                    <span className="text-subtle">· {rows.length} kayıt</span>
                  </div>
                </div>
                {/* Birim bazında ayrı toplamlar — farklı birimler toplanmaz */}
                <div className={`shrink-0 text-right ${stokVar ? "text-emerald-700" : "text-rose-700"}`}>
                  {birimler.length ? (
                    birimler.map(([u, v]) => (
                      <div key={u} className={`font-mono font-extrabold leading-tight ${birimler.length === 1 ? "text-3xl" : "text-xl"}`}>
                        {v} <span className="text-sm font-semibold">{u}</span>
                      </div>
                    ))
                  ) : (
                    <div className="font-mono text-3xl font-extrabold">0</div>
                  )}
                </div>
              </div>

              {/* Toast Bildirimi */}
              {toastMsg && (
                <div
                  className={`flex items-center justify-between gap-2.5 rounded-xl border p-3.5 text-xs ${
                    toastMsg.type === "success"
                      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                      : "border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-300"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {toastMsg.type === "success" ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0" />
                    ) : (
                      <AlertCircle className="h-4 w-4 shrink-0" />
                    )}
                    <span>{toastMsg.text}</span>
                  </div>
                  <button
                    onClick={() => setToastMsg(null)}
                    className="rounded p-1 text-subtle hover:bg-black/5 dark:hover:bg-white/10"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              {/* Satırlar */}
              <div className="card p-4">
                <div className="space-y-2">
                  {rows.map((b, i) => (
                    <div
                      key={`${b.material}|${b.warehouse}|${b.stockPlace}|${b.batchNum || i}`}
                      className="flex items-center justify-between gap-3 rounded-xl bg-elevated px-4 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-semibold text-fg">{b.name || b.material || "—"}</p>
                          {b.specialStock === "1" && (
                            <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700">SKT</span>
                          )}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[11px] text-subtle">
                          {b.name && b.material && <span className="font-semibold text-muted">{b.material}</span>}
                          {(b.warehouse || b.stockPlace) && (
                            <span className="inline-flex items-center gap-1 break-all text-cyan-600">
                              <MapPin className="h-3 w-3 shrink-0" /> {b.warehouse}{b.stockPlace ? "/" + b.stockPlace : ""}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-4 shrink-0">
                        <div className="text-right">
                          <div className="font-mono text-sm font-bold text-fg">
                            {b.availStock} <span className="text-xs font-medium text-subtle">{b.unit}</span>
                          </div>
                          {b.batchNum && b.batchNum !== "*" && (
                            <div className="mt-0.5 font-mono text-[11px] text-subtle">parti {b.batchNum}</div>
                          )}
                        </div>

                        {/* Etiket Yazdır Butonu (Bora spec: MZYPrintWHSP) */}
                        <button
                          type="button"
                          disabled={printingIndex === i}
                          onClick={() => handlePrintRowLabel(b, i)}
                          title="Etiket Bas (MZYPrintWHSP)"
                          className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface text-subtle hover:border-brand hover:bg-brand/10 hover:text-brand transition-all active:scale-95 disabled:opacity-50"
                        >
                          {printingIndex === i ? (
                            <Loader2 className="h-4 w-4 animate-spin text-brand" />
                          ) : (
                            <Printer className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
