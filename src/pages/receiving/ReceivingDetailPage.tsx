import { useState } from "react";
import { useNavigate, useParams, useSearchParams, useLocation } from "react-router-dom";
import {
  Barcode,
  Package,
  Plus,
  Minus,
  Trash2,
  CheckCircle2,
  Loader2,
  Tag,
  Ruler,
  Save,
  Layers,
} from "lucide-react";
import PageHeader from "../../components/PageHeader";
import ToastView, { useToast } from "../../components/Toast";
import MaterialReceiptModal, { type ReceivedItem } from "./MaterialReceiptModal";
import { api } from "../../api/client";

export default function ReceivingDetailPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { id: poParam } = useParams<{ id: string }>();

  // State passed from ReceivingSupplierSelectPage
  const supplierState = location.state?.supplier as { id: string; name: string; poNumber: string; barcode?: string } | undefined;
  const vendorCode = supplierState?.id || "800980";
  const vendorName = supplierState?.name || "Tedarikçi";
  const currentPo = poParam || supplierState?.poNumber || "SIP-GENEL";

  const waybillNo = searchParams.get("waybill") || location.state?.waybillNo || "";
  const sourceWH = searchParams.get("sourceWH") || location.state?.sourceWarehouse || "";
  const targetWH = searchParams.get("targetWH") || location.state?.targetWarehouse || "";

  // Accumulated Scanned Products State (3x3 Grid)
  const [receivedItems, setReceivedItems] = useState<ReceivedItem[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);

  const { toast, show } = useToast();

  // Handler: Add or update received item in 3x3 list
  const handleItemAdded = (item: ReceivedItem) => {
    setReceivedItems((prev) => {
      // If exact same material, batch, and order already exists, add quantity
      const existingIdx = prev.findIndex(
        (x) =>
          x.material === item.material &&
          x.orderNum === item.orderNum &&
          x.itemNum === item.itemNum &&
          x.batchNum === item.batchNum
      );

      if (existingIdx >= 0) {
        const updated = [...prev];
        updated[existingIdx] = {
          ...updated[existingIdx],
          receivedQty: updated[existingIdx].receivedQty + item.receivedQty,
        };
        return updated;
      }
      // Insert new item at beginning (sol üstten başlayarak birikir)
      return [item, ...prev];
    });

    show({
      kind: "ok",
      text: `${item.name} (${item.receivedQty} ${item.unit}) mal kabul listesine eklendi.`,
    });
  };

  // Quantity Increment / Decrement
  const handleUpdateQty = (id: string, delta: number) => {
    setReceivedItems((prev) =>
      prev
        .map((item) => {
          if (item.id === id) {
            const nextQty = Math.max(1, item.receivedQty + delta);
            return { ...item, receivedQty: nextQty };
          }
          return item;
        })
        .filter((item) => item.receivedQty > 0)
    );
  };

  // Remove Item
  const handleRemoveItem = (id: string) => {
    setReceivedItems((prev) => prev.filter((item) => item.id !== id));
    show({ kind: "error", text: "Ürün mal kabul listesinden çıkarıldı." });
  };

  // Save / Complete Receipt via MZYSAVEINVPURORDER
  const handleSaveReceipt = async () => {
    if (receivedItems.length === 0) {
      show({ kind: "error", text: "Lütfen en az bir ürün okutarak kabul ediniz." });
      return;
    }

    setIsSaving(true);
    try {
      const itemsPayload = receivedItems.map((it) => ({
        orderNum: it.orderNum,
        itemNum: it.itemNum,
        material: it.material,
        quantity: it.receivedQty,
        batchNum: it.batchNum,
        expiryDate: it.expiryDate,
      }));

      const res = await api.saveReceipt({
        vendor: vendorCode,
        waybillNo,
        sourceWarehouse: sourceWH,
        targetWarehouse: targetWH,
        items: itemsPayload,
      });

      if (!res.ok) {
        show({ kind: "error", text: res.message || "Mal kabul kaydedilemedi." });
        return;
      }

      setSaveSuccessMessage(
        res.message || `${receivedItems.length} kalem ürünün mal kabulü başarıyla tamamlandı.`
      );

      setTimeout(() => {
        navigate("/receiving");
      }, 2000);
    } catch (err: unknown) {
      show({
        kind: "error",
        text: err instanceof Error ? err.message : "Kayıt sırasında hata oluştu.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Total Statistics
  const totalItemCount = receivedItems.length;
  const totalQuantity = receivedItems.reduce((sum, it) => sum + it.receivedQty, 0);
  const totalExpected = receivedItems.reduce((sum, it) => sum + it.expectedQty, 0);

  return (
    <div className="mx-auto max-w-7xl p-3.5 sm:p-6 lg:p-8 animate-fade-in">
      {/* Page Header with 'Kaçta Kaç' Progress Badge & 'Barkod Okut' Action Button */}
      <PageHeader
        title={`Mal Kabul: ${vendorName}`}
        subtitle={`İrsaliye No: ${waybillNo || "-"} · Tedarikçi: ${vendorCode} · Sipariş: ${currentPo}${targetWH ? ` · Depo: ${targetWH}` : ""}`}
        backTo="/receiving"
        right={
          <div className="flex items-center gap-2.5">
            {/* Kaçta Kaç Yapıldığı Rozeti */}
            <span className="chip bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 font-mono text-xs sm:text-sm px-3 py-1.5 font-extrabold border border-emerald-500/20 shadow-sm">
              {totalQuantity} / {totalExpected > 0 ? totalExpected : totalQuantity} AD
            </span>

            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2 text-xs sm:text-sm font-extrabold text-white shadow-md hover:bg-emerald-700 active:scale-95 transition-all"
            >
              <Barcode className="h-4 w-4 shrink-0" />
              <span>Barkod Okut</span>
            </button>
          </div>
        }
      />

      {/* Save Success Notice */}
      {saveSuccessMessage && (
        <div className="mb-4 flex items-center gap-2.5 rounded-2xl border border-emerald-500 bg-emerald-500/20 p-4 text-xs font-bold text-emerald-800 dark:text-emerald-200 animate-slide-up">
          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          <span>{saveSuccessMessage} Yönlendiriliyor...</span>
        </div>
      )}

      {/* 3x3 Grid Layout (Okutulan ürünler sol üstten başlayarak birikir) */}
      <div className="mb-6">
        <div className="mb-2.5 flex items-center justify-between">
          <h3 className="text-xs sm:text-sm font-extrabold text-fg flex items-center gap-2">
            <Layers className="h-4 w-4 text-emerald-600" />
            Okutulan & Kabul Edilen Ürünler
          </h3>
          <span className="text-xs text-subtle font-semibold">
            {totalItemCount > 0 ? `${totalItemCount} Kalem Okundu` : "Liste Boş"}
          </span>
        </div>

        {receivedItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 rounded-3xl border-2 border-dashed border-line bg-surface p-8 text-center shadow-card">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-600/10 text-emerald-600 mb-3.5">
              <Barcode className="h-8 w-8" />
            </div>
            <h4 className="text-sm font-extrabold text-fg">Henüz Malzeme Okutulmadı</h4>
            <p className="mt-1 text-xs text-subtle max-w-md">
              Sağ üstteki <strong>"Barkod Okut"</strong> butonuna tıklayarak veya el terminaliyle ürün barkodunu okutarak mal kabule başlayınız.
            </p>
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="mt-4 flex items-center gap-2 rounded-2xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-md hover:bg-emerald-700 transition"
            >
              <Barcode className="h-4 w-4" /> Barkod Okutmaya Başla
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {receivedItems.map((item) => (
              <div
                key={item.id}
                className="relative flex flex-col justify-between rounded-2xl border border-line bg-surface p-4 shadow-card hover:border-emerald-500/40 hover:shadow-soft transition-all duration-200"
              >
                {/* Card Top: Picture + Product Info + Delete */}
                <div>
                  <div className="flex items-start justify-between gap-3">
                    {/* Picture */}
                    {item.image ? (
                      <img
                        src={item.image}
                        alt={item.name}
                        className="h-14 w-14 rounded-xl object-cover border border-line shrink-0 shadow-sm"
                      />
                    ) : (
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-emerald-600/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                        <Package className="h-7 w-7" />
                      </div>
                    )}

                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="chip bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 font-mono text-[10px]">
                          {item.material}
                        </span>
                        {item.isSpecialLot && (
                          <span className="chip bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300 font-bold text-[10px] flex items-center gap-1">
                            <Tag className="h-2.5 w-2.5" /> Partili
                          </span>
                        )}
                      </div>
                      <h4 className="mt-1 font-bold text-fg text-xs truncate leading-snug" title={item.name}>
                        {item.name}
                      </h4>
                      <p className="mt-0.5 text-[11px] text-subtle truncate">
                        Sipariş: <strong className="text-fg">{item.orderNum}</strong> (Kalem: {item.itemNum})
                      </p>
                    </div>

                    {/* Delete Button */}
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(item.id)}
                      className="rounded-lg p-1 text-subtle hover:bg-red-500/10 hover:text-red-500 transition"
                      title="Listeden Kaldır"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Lot / Batch Badge if present */}
                  {item.batchNum && (
                    <div className="mt-2.5 flex items-center gap-1.5 rounded-lg bg-violet-50 dark:bg-violet-950/20 border border-violet-500/20 px-2 py-1 text-[11px] text-violet-700 dark:text-violet-300 font-mono font-semibold">
                      <Tag className="h-3 w-3 shrink-0" />
                      <span>Parti: {item.batchNum}</span>
                      {item.expiryDate && <span className="text-subtle ml-auto">SKT: {item.expiryDate}</span>}
                    </div>
                  )}

                  {/* Dimensions Badge if present */}
                  {item.dimensions && item.dimensions.width > 0 && (
                    <div className="mt-1.5 flex items-center gap-1 text-[10px] text-subtle font-mono">
                      <Ruler className="h-3 w-3 text-muted shrink-0" />
                      <span>
                        {item.dimensions.width}x{item.dimensions.length}x{item.dimensions.height} cm · {item.dimensions.brutWeight} kg
                      </span>
                    </div>
                  )}
                </div>

                {/* Card Bottom: Quantity Counter */}
                <div className="mt-3.5 pt-3 border-t border-line flex items-center justify-between">
                  <span className="text-xs font-bold text-subtle">
                    Kabul: <span className="font-extrabold text-emerald-600 dark:text-emerald-400 font-mono">{item.receivedQty}</span> / {item.expectedQty} {item.unit}
                  </span>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleUpdateQty(item.id, -1)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg bg-elevated text-subtle hover:bg-line transition active:scale-95"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="min-w-6 text-center font-mono text-xs font-extrabold text-fg">
                      {item.receivedQty}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleUpdateQty(item.id, 1)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition active:scale-95"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bottom Sticky Completion Bar */}
      {receivedItems.length > 0 && (
        <div className="sticky bottom-4 z-20 rounded-2xl border border-line bg-surface/95 backdrop-blur p-3.5 shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-3">
          <div>
            <p className="text-xs font-extrabold text-fg">
              Toplam <span className="text-emerald-600">{totalItemCount} Kalem</span> ve{" "}
              <span className="text-emerald-600">{totalQuantity} Adet</span> ürün kabul edildi.
            </p>
            <p className="text-[11px] text-subtle mt-0.5">
              İrsaliye: <strong className="text-fg">{waybillNo || "-"}</strong> · Kabul Deposu: <strong className="text-fg">{targetWH || "-"}</strong>
            </p>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 rounded-xl border border-line bg-elevated px-4 py-2.5 text-xs font-bold text-fg hover:bg-line transition"
            >
              <Barcode className="h-4 w-4" /> Barkod Okut (+1)
            </button>

            <button
              type="button"
              onClick={handleSaveReceipt}
              disabled={isSaving}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-2.5 text-xs sm:text-sm font-extrabold text-white shadow-lg hover:bg-emerald-700 active:scale-95 transition disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Kaydediliyor...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" /> Mal Kabulü Tamamla ve Sakla
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Material Scanning & Dimension / Open Orders Receipt Modal */}
      <MaterialReceiptModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onItemAdded={handleItemAdded}
        vendorCode={vendorCode}
        vendorName={vendorName}
        waybillNo={waybillNo}
        sourceWarehouse={sourceWH}
        targetWarehouse={targetWH}
      />

      <ToastView toast={toast} />
    </div>
  );
}
