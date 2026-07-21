import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ScanSearch, MapPin, Package, Loader2, ChevronDown, ChevronUp, PackageX } from "lucide-react";
import PageHeader from "../../components/PageHeader";
import BarcodeScanner from "../../components/BarcodeScanner";
import { api } from "../../api/client";
import type { ProductStock } from "../../types";

const VISIBLE = 5; // ilk gösterilecek lokasyon sayısı

export default function InquiryPage() {
  const { t } = useTranslation();
  const [result, setResult] = useState<ProductStock | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const query = async (barcode: string) => {
    const code = barcode.trim();
    if (!code) return;
    setLoading(true);
    setNotFound(false);
    setShowAll(false);
    const res = await api.queryProduct(code);
    setResult(res ?? null);
    setNotFound(!res);
    setLoading(false);
  };

  const locations = result?.locations ?? [];
  const shown = showAll ? locations : locations.slice(0, VISIBLE);

  return (
    <div className="mx-auto max-w-4xl p-4 lg:p-8">
      <PageHeader title={t("inquiry.title")} subtitle={t("inquiry.subtitle")} backTo="/home" />

      <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
        {/* Sorgu */}
        <div className="lg:sticky lg:top-24 lg:self-start">
          <div className="card p-4">
            <BarcodeScanner onDetected={query} />
          </div>
        </div>

        {/* Sonuç */}
        <div>
          {loading ? (
            <div className="flex items-center justify-center py-24 text-subtle"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : notFound ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-surface py-16 text-center">
              <PackageX className="mb-2 h-10 w-10 text-subtle" />
              <p className="text-sm text-subtle">{t("inquiry.notFound")}</p>
            </div>
          ) : !result ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-surface py-16 text-center">
              <ScanSearch className="mb-2 h-10 w-10 text-subtle" />
              <p className="max-w-xs px-6 text-sm text-subtle">{t("inquiry.scanOrEnter")}</p>
            </div>
          ) : (
            <div className="animate-slide-up space-y-4">
              {/* Ürün + toplam stok */}
              <div className="card p-5">
                <div className="flex items-start gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-100">
                    <Package className="h-6 w-6 text-cyan-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-fg">{result.product.name}</p>
                    <p className="font-mono text-xs text-subtle">{result.product.code} · {result.product.barcode}</p>
                  </div>
                </div>
                <div className="mt-4 flex items-end justify-between rounded-2xl bg-cyan-50 px-4 py-3">
                  <span className="text-sm font-medium text-cyan-700">{t("inquiry.totalStock")}</span>
                  <span className="font-mono text-3xl font-extrabold text-cyan-700">{result.totalStock} <span className="text-base font-semibold">{result.product.unit}</span></span>
                </div>
              </div>

              {/* Lokasyonlar */}
              <div className="card p-5">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-muted">{t("inquiry.locations")}</h3>
                  <span className="chip bg-elevated text-muted">{locations.length}</span>
                </div>
                <div className="space-y-2">
                  {shown.map((loc) => (
                    <div key={loc.location} className="flex items-center justify-between rounded-xl bg-elevated px-4 py-2.5">
                      <span className="inline-flex items-center gap-2 font-mono font-semibold text-muted">
                        <MapPin className="h-4 w-4 text-cyan-500" /> {loc.location}
                      </span>
                      <span className="font-mono font-bold text-fg">{loc.qty} <span className="text-xs font-medium text-subtle">{result.product.unit}</span></span>
                    </div>
                  ))}
                </div>
                {locations.length > VISIBLE && (
                  <button onClick={() => setShowAll((v) => !v)} className="mt-3 flex w-full items-center justify-center gap-1 text-sm font-semibold text-cyan-600">
                    {showAll ? <>{t("inquiry.showLess")} <ChevronUp className="h-4 w-4" /></> : <>{t("inquiry.showAll")} ({locations.length}) <ChevronDown className="h-4 w-4" /></>}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
