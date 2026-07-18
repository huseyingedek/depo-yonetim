import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Check, CheckCircle2, Loader2, MapPin, Package } from "lucide-react";
import PageHeader from "../../components/PageHeader";
import BarcodeScanner from "../../components/BarcodeScanner";
import ToastView, { useToast } from "../../components/Toast";
import { api } from "../../api/client";
import type { PutawayItem } from "../../types";

export default function PutawayItemPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const [item, setItem] = useState<PutawayItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [verified, setVerified] = useState(false);
  const [location, setLocation] = useState("");
  const [placing, setPlacing] = useState(false);
  const [done, setDone] = useState(false);
  const { toast, show } = useToast();

  useEffect(() => {
    api.getPutawayItems().then((list) => {
      const found = list.find((i) => i.id === id) ?? null;
      setItem(found);
      setLocation(found?.suggestedLocation ?? "");
      setLoading(false);
    });
  }, [id]);

  const handleDetected = (barcode: string) => {
    if (!item) return;
    if (barcode.trim() === item.product.barcode) {
      setVerified(true);
      show({ kind: "done", text: t("transfer.productOk") });
    } else {
      show({ kind: "error", text: t("transfer.verifyProduct") });
    }
  };

  const place = async () => {
    if (!item || !location.trim()) {
      show({ kind: "error", text: t("putaway.locationRequired") });
      return;
    }
    setPlacing(true);
    await api.completePutaway(item.id, location.trim());
    setPlacing(false);
    setDone(true);
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl p-4 lg:p-8">
        <PageHeader title={t("putaway.title")} backTo="/putaway" />
        <div className="flex items-center justify-center py-24 text-subtle"><Loader2 className="h-6 w-6 animate-spin" /></div>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="mx-auto max-w-3xl p-4 lg:p-8">
        <PageHeader title={t("putaway.title")} backTo="/putaway" />
        <p className="py-16 text-center text-subtle">{t("common.noResults")}</p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-4 py-16 text-center">
        <div className="mb-5 flex h-24 w-24 animate-pop-in items-center justify-center rounded-full bg-violet-100">
          <CheckCircle2 className="h-12 w-12 text-violet-600" />
        </div>
        <h1 className="text-2xl font-extrabold text-fg">{t("putaway.placed")}!</h1>
        <div className="mt-4 w-full rounded-2xl border border-line bg-surface p-5 text-left shadow-card">
          <p className="truncate font-semibold text-fg">{item.product.name}</p>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
            <MapPin className="h-4 w-4 text-violet-500" /> <span className="font-mono font-semibold">{location}</span> · {item.qty} {item.product.unit}
          </p>
        </div>
        <button onClick={() => navigate("/putaway", { replace: true })} className="btn-primary btn-lg mt-6 w-full">
          {t("common.backToMenu")}
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl p-4 lg:p-8">
      <PageHeader title={t("putaway.title")} subtitle={item.sourceRef} backTo="/putaway" />

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <div className="card p-4">
          <BarcodeScanner onDetected={handleDetected} sampleBarcode={item.product.barcode} />
        </div>

        <div className="space-y-4">
          {/* Ürün */}
          <div className="card p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-elevated">
                <Package className="h-5 w-5 text-muted" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-fg">{item.product.name}</p>
                <p className="font-mono text-xs text-subtle">{item.product.barcode}</p>
              </div>
              {verified && (
                <span className="chip bg-emerald-100 text-emerald-700"><Check className="h-3.5 w-3.5" /> {t("transfer.productOk")}</span>
              )}
            </div>
          </div>

          {/* Miktar + Lokasyon */}
          <div className="card space-y-4 p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted">{t("putaway.quantity")}</span>
              <span className="font-mono text-lg font-bold text-fg">{item.qty} {item.product.unit}</span>
            </div>
            <div>
              <label className="field-label">{t("putaway.targetLocation")}</label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-violet-400" />
                <input value={location} onChange={(e) => setLocation(e.target.value)} className="field-input pl-11 font-mono font-semibold" placeholder="A-03-02" />
              </div>
              <p className="mt-1.5 text-xs text-subtle">{t("putaway.suggested")}: <span className="font-mono font-semibold text-violet-600">{item.suggestedLocation}</span></p>
            </div>
          </div>

          <button onClick={place} disabled={placing} className="btn-primary btn-lg w-full">
            {placing ? <Loader2 className="h-5 w-5 animate-spin" /> : t("putaway.place")}
          </button>
        </div>
      </div>

      <ToastView toast={toast} />
    </div>
  );
}
