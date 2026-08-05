import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ScanSearch, MapPin, Package, Loader2, Warehouse, X } from "lucide-react";
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

  // Tek sorgu — dolu olan alan(lar) gider, boş olan boş. (Bora: aynı servis.)
  const runQuery = async (sh: Shelf | null, code: string) => {
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

  const toplam = rows.reduce((s, b) => s + b.availStock, 0);
  const stokVar = toplam > 0;
  const busy = shelfBusy || queryBusy;

  return (
    <div className="mx-auto max-w-4xl p-4 lg:p-8">
      <PageHeader title={t("inquiry.title")} subtitle="Rafı ve/veya ürünü okut → stok / parti" backTo="/home" />

      <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
        {/* Sol: alt alta iki BAĞIMSIZ barkod alanı */}
        <div className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          {/* ── RAF ── */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[13px] font-semibold text-muted">Raf <span className="font-normal text-subtle">(opsiyonel)</span></span>
              {shelf && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                  <Warehouse className="h-3.5 w-3.5" /> {shelf.warehouse}/{shelf.stockPlace}
                  <button onClick={clearShelf} aria-label="Rafı temizle" className="ml-0.5 hover:text-emerald-900">
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
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[13px] font-semibold text-muted">Ürün <span className="font-normal text-subtle">(opsiyonel)</span></span>
              {productCode && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-cyan-50 px-2.5 py-0.5 font-mono text-xs font-semibold text-cyan-700">
                  <Package className="h-3.5 w-3.5" /> {productCode}
                  <button onClick={clearProduct} aria-label="Ürünü temizle" className="ml-0.5 hover:text-cyan-900">
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
        </div>

        {/* Sağ: sonuçlar */}
        <div>
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
              <p className="mt-1 max-w-xs px-6 text-xs text-subtle">Bu raf / ürün için stok kaydı yok.</p>
            </div>
          ) : (
            <div className="animate-slide-up space-y-4">
              {/* Özet */}
              <div className={`flex items-end justify-between rounded-2xl px-5 py-4 ${stokVar ? "bg-emerald-50" : "bg-rose-50"}`}>
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
                <span className={`shrink-0 font-mono text-3xl font-extrabold ${stokVar ? "text-emerald-700" : "text-rose-700"}`}>
                  {toplam} <span className="text-base font-semibold">{rows[0]?.unit}</span>
                </span>
              </div>

              {/* Satırlar */}
              <div className="card p-4">
                <div className="space-y-2">
                  {rows.map((b, i) => (
                    <div key={`${b.material}|${b.warehouse}|${b.stockPlace}|${b.batchNum || i}`} className="flex items-start justify-between gap-3 rounded-xl bg-elevated px-4 py-2.5">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="truncate font-mono text-sm font-bold text-fg">{b.material || "—"}</p>
                          {b.specialStock === "1" && (
                            <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700">SKT</span>
                          )}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[11px] text-subtle">
                          {(b.warehouse || b.stockPlace) && (
                            <span className="inline-flex items-center gap-1 break-all text-cyan-600">
                              <MapPin className="h-3 w-3 shrink-0" /> {b.warehouse}{b.stockPlace ? "/" + b.stockPlace : ""}
                            </span>
                          )}
                          {b.batchNum && b.batchNum !== "*" && <span>parti {b.batchNum}</span>}
                        </div>
                      </div>
                      <span className="shrink-0 font-mono text-sm font-bold text-fg">
                        {b.availStock} <span className="text-xs font-medium text-subtle">{b.unit}</span>
                      </span>
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
