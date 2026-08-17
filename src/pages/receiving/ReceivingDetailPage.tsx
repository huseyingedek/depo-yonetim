import { useState, useRef } from "react";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
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
  Camera,
  CornerDownLeft,
  X,
  AlertCircle,
} from "lucide-react";
import PageHeader from "../../components/PageHeader";
import ToastView, { useToast } from "../../components/Toast";
import MaterialReceiptModal, { type ReceivedItem } from "./MaterialReceiptModal";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { api } from "../../api/client";

export default function ReceivingDetailPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  // State passed from ReceivingSupplierSelectPage or URL searchParams
  const supplierState = location.state?.supplier as { id: string; name: string; poNumber: string; barcode?: string } | undefined;
  const vendorCode = searchParams.get("vendor") || supplierState?.id || "800980";
  const vendorName = searchParams.get("vendorName") || supplierState?.name || "Tedarikçi";

  const waybillNo = searchParams.get("waybill") || location.state?.waybillNo || "";
  const sourceWH = searchParams.get("sourceWH") || location.state?.sourceWarehouse || "";
  const targetWH = searchParams.get("targetWH") || location.state?.targetWarehouse || "";

  // Left top barcode scanner state
  const [barcodeInput, setBarcodeInput] = useState("");
  const [modalBarcode, setModalBarcode] = useState<string | undefined>(undefined);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);

  // Accumulated Scanned Products State (Right-side Vertical Cards Feed)
  const [receivedItems, setReceivedItems] = useState<ReceivedItem[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);

  const { toast, show } = useToast();

  // Camera Scanner Lifecycle
  const startCamera = () => {
    setCameraOpen(true);
    setCameraError(false);
    let active = true;
    const reader = new BrowserMultiFormatReader();

    reader
      .decodeFromVideoDevice(undefined, videoRef.current!, (result) => {
        if (result && active) {
          const text = result.getText().trim();
          if (text) {
            handleBarcodeSubmitted(text);
            setCameraOpen(false);
          }
        }
      })
      .then((controls) => {
        if (active) controlsRef.current = controls;
        else controls.stop();
      })
      .catch(() => {
        if (active) setCameraError(true);
      });
  };

  const stopCamera = () => {
    setCameraOpen(false);
    controlsRef.current?.stop();
    controlsRef.current = null;
  };

  // Submit Barcode -> Trigger Detail Modal
  const handleBarcodeSubmitted = (code?: string) => {
    const raw = code || barcodeInput;
    const trimmed = (raw || "").trim();
    if (!trimmed) return;
    setModalBarcode(trimmed);
    setBarcodeInput("");
    setIsModalOpen(true);
  };

  // Handler: Add or update received items in the list
  const handleItemsAdded = (items: ReceivedItem[]) => {
    if (!items || items.length === 0) return;

    setReceivedItems((prev) => {
      let updated = [...prev];
      for (const item of items) {
        const existingIdx = updated.findIndex(
          (x) =>
            x.material === item.material &&
            x.orderNum === item.orderNum &&
            x.itemNum === item.itemNum &&
            x.batchNum === item.batchNum
        );

        if (existingIdx >= 0) {
          updated[existingIdx] = {
            ...updated[existingIdx],
            receivedQty: updated[existingIdx].receivedQty + item.receivedQty,
          };
        } else {
          updated = [item, ...updated];
        }
      }
      return updated;
    });

    const totalQty = items.reduce((sum, it) => sum + it.receivedQty, 0);
    show({
      kind: "ok",
      text: `${items[0].name} (${totalQty} ${items[0].unit}) ${items.length > 1 ? `(${items.length} siparişe dağıtıldı)` : ""} mal kabul listesine eklendi.`,
    });
  };

  const handleItemAdded = (item: ReceivedItem) => {
    handleItemsAdded([item]);
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
  const totalQuantity = receivedItems.reduce((sum, it) => sum + it.receivedQty, 0);
  const totalExpected = receivedItems.reduce((sum, it) => sum + it.expectedQty, 0);

  return (
    <div className="mx-auto max-w-7xl p-3.5 sm:p-6 lg:p-8 animate-fade-in">
      {/* Page Header (Başlık altındaki irsaliye/tedarikçi/depo yazısı kaldırıldı) */}
      <PageHeader
        title={`Mal Kabul: ${vendorName}`}
        backTo="/receiving"
        right={
          <div className="flex items-center gap-2.5">
            <span className="chip bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 font-mono text-xs sm:text-sm px-3 py-1.5 font-extrabold border border-emerald-500/20 shadow-sm">
              {totalQuantity} / {totalExpected > 0 ? totalExpected : totalQuantity} AD
            </span>

            {/* Sağ Üst: Mal Kabulü Bitir Butonu */}
            <button
              type="button"
              onClick={() => setIsConfirmModalOpen(true)}
              disabled={receivedItems.length === 0 || isSaving}
              className="flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2 text-xs sm:text-sm font-extrabold text-white shadow-md hover:bg-emerald-700 active:scale-95 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Kaydediliyor...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" /> Mal Kabulü Bitir
                </>
              )}
            </button>
          </div>
        }
      />

      {/* Save Success Notice */}
      {saveSuccessMessage && (
        <div className="mb-4 flex items-center gap-2.5 rounded-2xl border border-emerald-500 bg-emerald-500/20 p-4 text-xs font-bold text-emerald-800 dark:text-emerald-200 animate-slide-up">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
          <span>{saveSuccessMessage} Yönlendiriliyor...</span>
        </div>
      )}

      {/* Main Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* ========================================================================= */}
        {/* SOL TARAF: BARKOD OKUTMA + MİNİMAL İLERLEME */}
        {/* ========================================================================= */}
        <div className="lg:col-span-4 xl:col-span-4 space-y-3.5">
          {/* 1. SOL ÜST: Ürün Barkodunu Okutun (Klavye & Kamera yazısı kaldırıldı) */}
          <div className="rounded-3xl border border-line bg-surface p-5 shadow-card space-y-3.5">
            <label className="text-xs font-extrabold text-fg flex items-center gap-1.5">
              <Barcode className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              Ürün Barkodunu Okutun
            </label>

            <div className="flex items-center gap-2">
              <div className="relative flex-1 min-w-0">
                <input
                  type="text"
                  value={barcodeInput}
                  onChange={(e) => setBarcodeInput(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === "Enter" && handleBarcodeSubmitted()}
                  placeholder="Barkod okutun veya yazın..."
                  className="field-input w-full pr-10 font-mono text-xs font-bold tracking-wider"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => handleBarcodeSubmitted()}
                  disabled={!barcodeInput.trim()}
                  className="absolute right-2 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-lg text-subtle hover:bg-elevated hover:text-fg disabled:opacity-30 transition"
                  title="Sorgula"
                >
                  <CornerDownLeft className="h-4 w-4" />
                </button>
              </div>

              {/* Kamera İkonu Butonu */}
              <button
                type="button"
                onClick={() => (cameraOpen ? stopCamera() : startCamera())}
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border transition ${
                  cameraOpen
                    ? "border-emerald-600 bg-emerald-600 text-white shadow-md"
                    : "border-line bg-elevated/60 text-subtle hover:bg-elevated hover:text-fg"
                }`}
                title="Kamera ile Barkod Tara"
              >
                {cameraOpen ? <X className="h-5 w-5" /> : <Camera className="h-5 w-5" />}
              </button>
            </div>

            {/* Inline Kamera Görüntüsü */}
            {cameraOpen && (
              <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-ink-950 border border-emerald-500/40 shadow-inner animate-fade-in">
                {!cameraError ? (
                  <>
                    <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                      <div className="relative h-44 w-52">
                        <span className="absolute left-0 top-0 h-5 w-5 rounded-tl-lg border-l-4 border-t-4 border-emerald-400" />
                        <span className="absolute right-0 top-0 h-5 w-5 rounded-tr-lg border-r-4 border-t-4 border-emerald-400" />
                        <span className="absolute bottom-0 left-0 h-5 w-5 rounded-bl-lg border-b-4 border-l-4 border-emerald-400" />
                        <span className="absolute bottom-0 right-0 h-5 w-5 rounded-br-lg border-b-4 border-r-4 border-emerald-400" />
                        <div className="absolute inset-x-2 top-2 h-0.5 animate-scan-line bg-emerald-400 shadow-[0_0_12px_2px_rgba(16,185,129,0.8)]" />
                      </div>
                    </div>
                    <p className="absolute inset-x-0 bottom-2.5 text-center text-[11px] font-bold text-white/90">
                      Barkodu yeşil çerçevenin içine hizalayın
                    </p>
                  </>
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center text-xs text-white/80">
                    <p>Kamera açılamadı. Lütfen kamera izinlerini kontrol ediniz.</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 2. SOL ÜSTÜN ALTI: Minimal İlerleme Göstergesi */}
          <div className="flex items-center justify-between rounded-2xl border border-line bg-elevated/40 px-3.5 py-2.5 text-xs">
            <span className="font-bold text-subtle">İlerleme</span>
            <span className="font-mono text-xs font-extrabold text-emerald-600 dark:text-emerald-400">
              {totalQuantity}/{totalExpected > 0 ? totalExpected : totalQuantity}
            </span>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* SAĞ TARAF: AŞAĞIYA DOĞRU DİZİLEN KABUL EDİLEN ÜRÜNLER KARTLARI LİSTESİ */}
        {/* ========================================================================= */}
        <div className="lg:col-span-8 xl:col-span-8 space-y-3.5">
          {receivedItems.length === 0 ? (
            <div className="h-64 rounded-3xl border-2 border-dashed border-line bg-surface/40 shadow-inner" />
          ) : (
            <div className="space-y-3.5">
              {receivedItems.map((item) => (
                <div
                  key={item.id}
                  className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-3xl border border-line bg-surface p-4 sm:p-5 shadow-card hover:border-emerald-500/40 hover:shadow-soft transition-all duration-200"
                >
                  {/* Left part: Picture + Product Meta */}
                  <div className="flex items-start gap-3.5 min-w-0 flex-1">
                    {item.image ? (
                      <img
                        src={item.image}
                        alt={item.name}
                        className="h-16 w-16 rounded-2xl object-cover border border-line shrink-0 shadow-sm"
                      />
                    ) : (
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-emerald-600/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                        <Package className="h-8 w-8" />
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="chip bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 font-mono text-[11px] font-bold">
                          {item.material}
                        </span>
                        {item.isSpecialLot && (
                          <span className="chip bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300 font-bold text-[10px] flex items-center gap-1">
                            <Tag className="h-2.5 w-2.5" /> Partili Malzeme
                          </span>
                        )}
                        <span className="chip bg-slate-100 dark:bg-slate-800 text-subtle text-[10px]">
                          Sipariş: {item.orderNum} (K: {item.itemNum})
                        </span>
                      </div>

                      <h4 className="mt-1 font-bold text-fg text-sm truncate leading-snug" title={item.name}>
                        {item.name}
                      </h4>

                      {/* Lot / Batch Badge if present */}
                      {item.batchNum && (
                        <div className="mt-1.5 flex items-center gap-2 text-xs font-semibold text-violet-700 dark:text-violet-300">
                          <Tag className="h-3 w-3 shrink-0" />
                          <span>Parti: <strong className="font-mono">{item.batchNum}</strong></span>
                          {item.expiryDate && <span className="text-subtle">· SKT: {item.expiryDate}</span>}
                        </div>
                      )}

                      {/* Dimensions Badge if present */}
                      {item.dimensions && item.dimensions.width > 0 && (
                        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-subtle font-mono">
                          <Ruler className="h-3 w-3 text-muted shrink-0" />
                          <span>
                            {item.dimensions.width}x{item.dimensions.length}x{item.dimensions.height} cm · {item.dimensions.brutWeight} kg
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right part: Quantity Stepper + Delete Action */}
                  <div className="flex items-center justify-between sm:justify-end gap-4 w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-t-0 border-line">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleUpdateQty(item.id, -1)}
                        className="flex h-9 w-9 items-center justify-center rounded-xl bg-elevated text-subtle hover:bg-line transition active:scale-95"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <div className="min-w-12 text-center">
                        <span className="font-mono text-sm sm:text-base font-extrabold text-emerald-600 dark:text-emerald-400">
                          {item.receivedQty}
                        </span>
                        <span className="text-[10px] text-subtle block font-semibold">
                          / {item.expectedQty} {item.unit}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleUpdateQty(item.id, 1)}
                        className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition active:scale-95"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemoveItem(item.id)}
                      className="rounded-xl p-2 text-subtle hover:bg-red-500/10 hover:text-red-500 transition"
                      title="Listeden Kaldır"
                    >
                      <Trash2 className="h-4.5 w-4.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Mal Kabulü Tamamla Onay Modalı */}
      {isConfirmModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/70 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-md rounded-3xl border border-line bg-surface p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-600/10 text-emerald-600 dark:text-emerald-400">
                <AlertCircle className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-fg">Mal Kabulü Bitir</h3>
                <p className="text-xs text-subtle mt-0.5">İşlemi onaylıyor musunuz?</p>
              </div>
            </div>

            <div className="rounded-2xl border border-line bg-elevated/40 p-3.5 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-subtle">Kabul Edilen Kalem:</span>
                <strong className="text-fg font-mono">{receivedItems.length} Kalem</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-subtle">Toplam Kabul Edilen Adet:</span>
                <strong className="text-emerald-600 dark:text-emerald-400 font-mono font-bold">{totalQuantity} AD</strong>
              </div>
            </div>

            <p className="text-xs text-subtle leading-relaxed">
              Kabul edilen ürünler CANIAS sistemine kaydedilecek ve mal kabul işlemi tamamlanacaktır. Emin misiniz?
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-line">
              <button
                type="button"
                onClick={() => setIsConfirmModalOpen(false)}
                className="rounded-xl border border-line px-4 py-2.5 text-xs font-semibold text-subtle hover:bg-elevated transition"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsConfirmModalOpen(false);
                  handleSaveReceipt();
                }}
                disabled={isSaving}
                className="flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-extrabold text-white shadow-lg hover:bg-emerald-700 active:scale-95 transition"
              >
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Evet, Tamamla
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Material Scanning & Dimension / FIFO Open Orders Receipt Modal */}
      <MaterialReceiptModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setModalBarcode(undefined);
        }}
        onItemAdded={handleItemAdded}
        onItemsAdded={handleItemsAdded}
        vendorCode={vendorCode}
        vendorName={vendorName}
        waybillNo={waybillNo}
        sourceWarehouse={sourceWH}
        targetWarehouse={targetWH}
        initialBarcode={modalBarcode}
      />

      <ToastView toast={toast} />
    </div>
  );
}
