import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ScanSearch, MapPin, Package, Loader2, Warehouse, X } from "lucide-react";
import PageHeader from "../../components/PageHeader";
import BarcodeScanner from "../../components/BarcodeScanner";
import { api } from "../../api/client";
import type { BarcodeResult, StockBatch } from "../../types";

/**
 * ÜRÜN SORGULAMA — barkod okut, stok var mı/parti listesi gör.
 * Akış (Bora): raf okut (readBarcodeSP) → ürün okut (readBarcode) → readBarcode
 * olumlu + availStock>0 ise MZYGetStock ile parti listesi (BATCHNUM + AVAILSTOCK).
 */
export default function InquiryPage() {
  const { t } = useTranslation();
  const [shelf, setShelf] = useState<{ warehouse: string; stockPlace: string } | null>(null);
  const [product, setProduct] = useState<BarcodeResult | null>(null);
  const [batches, setBatches] = useState<StockBatch[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDetected = async (code: string) => {
    const barkod = code.trim();
    if (!barkod || busy) return;
    setBusy(true);
    setError(null);
    try {
      // 1) Raf yoksa: raf okut
      if (!shelf) {
        const r = await api.readShelfBarcode(barkod);
        if (!r.ok) { setError(r.message || "Raf okunamadı"); return; }
        setShelf({ warehouse: r.warehouse, stockPlace: r.stockPlace });
        return;
      }
      // 2) Ürün okut → readBarcode → availStock>0 ise parti listesi (getStock)
      setProduct(null);
      setBatches([]);
      const scan = await api.readBarcode(barkod, shelf.warehouse, shelf.stockPlace, 1);
      if (!scan.ok) { setError(scan.message || "Barkod tanınmadı"); return; }
      setProduct(scan);
      if (scan.availStock > 0) {
        const b = await api.getStock(scan.material, shelf.warehouse, shelf.stockPlace);
        setBatches(b);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const toplam = batches.reduce((s, b) => s + b.availStock, 0);
  const stokVar = toplam > 0 || (product?.availStock ?? 0) > 0;

  return (
    <div className="mx-auto max-w-4xl p-4 lg:p-8">
      <PageHeader title={t("inquiry.title")} subtitle="Barkod okut → stok / parti" backTo="/home" />

      <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
        {/* Okutma */}
        <div className="lg:sticky lg:top-24 lg:self-start">
          <div className="card p-4">
            {shelf ? (
              <div className="mb-3 flex items-center justify-between rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
                <span className="inline-flex items-center gap-1.5">
                  <Warehouse className="h-4 w-4" /> {shelf.warehouse}/{shelf.stockPlace}
                </span>
                <button onClick={() => { setShelf(null); setProduct(null); setBatches([]); }} aria-label="Rafı değiştir">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">Önce rafı okutun</div>
            )}
            <BarcodeScanner onDetected={handleDetected} prompt={shelf ? "Ürün barkodunu okutun" : "Raf barkodunu okutun"} />
            {busy && <p className="mt-2 flex items-center gap-1.5 text-xs text-subtle"><Loader2 className="h-3.5 w-3.5 animate-spin" /> sorgulanıyor…</p>}
            {error && <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{error}</p>}
          </div>
        </div>

        {/* Sonuç */}
        <div>
          {!product ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-surface py-16 text-center">
              <ScanSearch className="mb-2 h-10 w-10 text-subtle" />
              <p className="max-w-xs px-6 text-sm text-subtle">Rafı ve ürünü okutun; stok durumu ve partiler burada listelenir.</p>
            </div>
          ) : (
            <div className="animate-slide-up space-y-4">
              {/* Ürün + stok var/yok */}
              <div className="card p-5">
                <div className="flex items-start gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-100">
                    <Package className="h-6 w-6 text-cyan-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-fg">{product.name || product.material}</p>
                    <p className="font-mono text-xs text-subtle">{product.material}{product.unit ? " · " + product.unit : ""}</p>
                  </div>
                </div>
                <div className={`mt-4 flex items-end justify-between rounded-2xl px-4 py-3 ${stokVar ? "bg-emerald-50" : "bg-rose-50"}`}>
                  <span className={`text-sm font-semibold ${stokVar ? "text-emerald-700" : "text-rose-700"}`}>{stokVar ? "Stok var" : "Stok yok"}</span>
                  <span className={`font-mono text-3xl font-extrabold ${stokVar ? "text-emerald-700" : "text-rose-700"}`}>
                    {toplam || product.availStock} <span className="text-base font-semibold">{product.unit}</span>
                  </span>
                </div>
              </div>

              {/* Parti listesi */}
              {batches.length > 0 && (
                <div className="card p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-muted">Partiler</h3>
                    <span className="chip bg-elevated text-muted">{batches.length}</span>
                  </div>
                  <div className="space-y-2">
                    {batches.map((b) => (
                      <div key={b.batchNum} className="flex items-center justify-between rounded-xl bg-elevated px-4 py-2.5">
                        <span className="inline-flex items-center gap-2 font-mono font-semibold text-muted">
                          <MapPin className="h-4 w-4 text-cyan-500" /> {b.batchNum || "—"}
                        </span>
                        <span className="font-mono font-bold text-fg">
                          {b.availStock} <span className="text-xs font-medium text-subtle">{b.unit || product.unit}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
