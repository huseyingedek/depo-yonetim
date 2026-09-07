import { useState } from "react";
import { useNavigate, useParams, useSearchParams, useLocation } from "react-router-dom";
import { ArrowLeft, Save, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import PageHeader from "../../components/PageHeader";
import ToastView, { useToast } from "../../components/Toast";
import { api } from "../../api/client";
import { sesBasarili, sesHata } from "../../sound";
import type { ReceivedItem } from "./ReceivingDetailPage";

export default function ReceivingSummaryPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const { toast, show } = useToast();

  const waybillNo = searchParams.get("waybill") || location.state?.waybillNo || "";
  const targetWH = searchParams.get("targetWH") || location.state?.targetWarehouse || "00";
  const targetSP = searchParams.get("targetSP") || location.state?.targetStockPlace || "*";
  const vendorCode = searchParams.get("vendor") || location.state?.vendor || id || "";
  const vendorName = searchParams.get("vendorName") || location.state?.vendorName || "Tedarikçi";

  const storageKey = `mzy_receiving_items_${vendorCode || id || "active"}_${waybillNo || "active"}`;

  const [items] = useState<ReceivedItem[]>(() => {
    try {
      const stateItems = location.state?.items as ReceivedItem[] | undefined;
      if (Array.isArray(stateItems) && stateItems.length > 0) return stateItems;
      const local = localStorage.getItem(storageKey);
      if (local) {
        const parsed = JSON.parse(local);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
      return [];
    } catch {
      return [];
    }
  });

  const [isSaving, setIsSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const handleBack = () => {
    const backUrl = `/receiving/${encodeURIComponent(vendorCode || id || "")}?waybill=${encodeURIComponent(
      waybillNo
    )}&targetWH=${encodeURIComponent(targetWH)}&targetSP=${encodeURIComponent(targetSP)}&vendor=${encodeURIComponent(
      vendorCode
    )}&vendorName=${encodeURIComponent(vendorName)}`;

    navigate(backUrl, {
      state: {
        ...location.state,
        items,
        waybillNo,
        targetWarehouse: targetWH,
        targetStockPlace: targetSP,
        vendor: vendorCode,
        vendorName,
      },
    });
  };

  const handleSaveReceipt = async () => {
    if (items.length === 0) {
      sesHata();
      show({ kind: "error", text: "Kabul edilecek malzeme bulunamadı." });
      return;
    }

    setIsSaving(true);
    setErrorMessage("");

    try {
      const itemsPayload = items.map((it) => ({
        orderType: it.orderType || "OP",
        orderNum: it.orderNum || "SERBEST",
        itemNum: it.itemNum ?? 1,
        material: it.material,
        quantity: it.receivedQty,
        receivedQty: it.receivedQty,
        unit: it.unit || "AD",
        purQty: it.purQty !== undefined ? it.purQty : it.receivedQty,
        purUnit: it.purUnit || it.unit || "AD",
        specialStock: it.isSpecialLot || it.specialStock === "1" ? "1" : "0",
        isSpecialLot: it.isSpecialLot,
        batchNum: it.batchNum && it.batchNum !== "—" ? it.batchNum : "*",
        expiryDate: it.expiryDate || undefined,
      }));

      const res = await api.saveReceipt({
        vendor: vendorCode,
        waybillNo,
        warehouse: targetWH || "00",
        targetWarehouse: targetWH || "00",
        stockPlace: targetSP || "*",
        items: itemsPayload,
      });

      if (!res.ok) {
        sesHata();
        const msg = res.message || "Mal kabul kaydedilemedi.";
        setErrorMessage(msg);
        show({ kind: "error", text: msg });
        setTimeout(() => {
          setErrorMessage("");
        }, 4000);
        return;
      }

      sesBasarili();
      const successText =
        res.message || `${items.length} kalem malzemenin mal kabulü başarıyla tamamlandı.`;
      setSuccessMessage(successText);
      show({ kind: "success", text: successText });

      // LocalStorage temizle
      try {
        localStorage.removeItem(storageKey);
      } catch {}

      // 4 saniye sonra ana ekrana yönlendir
      setTimeout(() => {
        navigate("/receiving", { replace: true });
      }, 4000);
    } catch (err: unknown) {
      sesHata();
      const msg = err instanceof Error ? err.message : "Kayıt sırasında hata oluştu.";
      setErrorMessage(msg);
      show({ kind: "error", text: msg });
      setTimeout(() => {
        setErrorMessage("");
      }, 4000);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl p-4 lg:p-8 animate-fade-in space-y-4">
      <PageHeader
        title="Mal Kabul Özeti"
        subtitle={`${vendorName || vendorCode || id} · İrsaliye: ${waybillNo || "—"} · ${items.length} kalem`}
        onBack={handleBack}
        right={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleBack}
              disabled={isSaving || Boolean(successMessage)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface px-3.5 py-2 text-xs sm:text-sm font-semibold text-muted transition hover:bg-elevated disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <ArrowLeft className="h-4 w-4" />
              Geri
            </button>
            <button
              type="button"
              onClick={handleSaveReceipt}
              disabled={items.length === 0 || isSaving || Boolean(successMessage)}
              className="inline-flex items-center gap-1.5 sm:gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs sm:text-sm font-extrabold text-white shadow-md hover:bg-emerald-700 active:scale-95 transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Kaydediliyor...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  Bitir
                </>
              )}
            </button>
          </div>
        }
      />

      {/* Başarı Bildirimi */}
      {successMessage && (
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-500 bg-emerald-500/20 p-4 text-sm font-bold text-emerald-800 dark:text-emerald-200 animate-slide-up">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <div className="flex-1 font-extrabold text-sm">{successMessage}</div>
        </div>
      )}

      {/* Hata Bildirimi */}
      {errorMessage && (
        <div className="flex items-center gap-3 rounded-2xl border border-rose-500 bg-rose-500/20 p-4 text-sm font-bold text-rose-800 dark:text-rose-200 animate-slide-up">
          <AlertCircle className="h-5 w-5 text-rose-600 dark:text-rose-400 shrink-0" />
          <div className="flex-1 font-extrabold text-sm">{errorMessage}</div>
        </div>
      )}

      {/* Özet Tablosu: Yalnızca Ürün Kodu, Ürün Adı, Stok Birimi ve Okutulan Miktar */}
      {!items.length ? (
        <div className="rounded-2xl border border-line bg-surface p-10 text-center text-sm text-subtle">
          Henüz kabul edilen malzeme yok.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface shadow-card">
          <table className="w-full text-left text-xs table-auto">
            <thead className="border-b border-line bg-elevated">
              <tr>
                <th className="whitespace-nowrap px-4 py-3 font-bold text-black dark:text-white text-xs">
                  Malzeme Kodu
                </th>
                <th className="whitespace-nowrap px-4 py-3 font-bold text-black dark:text-white text-xs">
                  Malzeme Adı
                </th>
                <th className="whitespace-nowrap px-4 py-3 font-bold text-black dark:text-white text-xs">
                  Stok Birimi
                </th>
                <th className="whitespace-nowrap px-4 py-3 font-bold text-black dark:text-white text-xs text-right">
                  Kalan Miktar
                </th>
                <th className="whitespace-nowrap px-4 py-3 font-bold text-black dark:text-white text-xs text-right">
                  Okutulan Miktar
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => {
                const allocations = location.state?.allocations as
                  | Array<{
                      orderNum: string;
                      itemNum: string;
                      material?: string;
                      totalStockQty: number;
                      fulfilledStockQty: number;
                      remStockQty: number;
                      stockUnit: string;
                      remPurQty: number;
                      purUnit: string;
                    }>
                  | undefined;

                const matchingAlloc = allocations?.find(
                  (a) =>
                    (a.orderNum === item.orderNum && String(a.itemNum) === String(item.itemNum)) ||
                    a.material === item.material
                );

                const remainingQty = matchingAlloc
                  ? matchingAlloc.remStockQty
                  : Math.max(0, Number(((item.expectedQty || item.receivedQty) - item.receivedQty).toFixed(2)));

                const remainingUnit = matchingAlloc?.stockUnit || item.unit || "AD";

                return (
                  <tr
                    key={item.id || i}
                    className="border-b border-line last:border-0 hover:bg-elevated/20 transition-colors"
                  >
                    <td className="px-4 py-3 font-mono text-xs font-bold text-black dark:text-white whitespace-nowrap">
                      {item.material || "—"}
                    </td>
                    <td className="px-4 py-3 font-sans text-xs font-bold text-black dark:text-white min-w-[200px]">
                      {item.name || "—"}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs font-bold text-black dark:text-white whitespace-nowrap">
                      {item.unit || "AD"}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs font-bold text-black dark:text-white whitespace-nowrap text-right text-sm">
                      {remainingQty} {remainingUnit}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs font-bold text-black dark:text-white whitespace-nowrap text-right text-sm">
                      {item.receivedQty} {item.unit || "AD"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ToastView toast={toast} />
    </div>
  );
}
