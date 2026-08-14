import { useState, useEffect } from "react";
import {
  X,
  Barcode,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Package,
  Calendar,
  Tag,
  Layers,
  Plus,
  Minus,
  Flame,
  AlertTriangle,
  Biohazard,
} from "lucide-react";
import BarcodeScanner from "../../components/BarcodeScanner";
import { api } from "../../api/client";

export interface ReceivedItem {
  id: string; // Unique client ID
  material: string; // Malzeme Kodu
  name: string; // Malzeme Adı
  image?: string; // Resim URL veya Base64
  orderNum: string; // Satın Alma Sipariş No (PURORDER)
  itemNum: number | string; // Kalem No (ITEMNUM)
  expectedQty: number; // Açık / Beklenen Miktar
  receivedQty: number; // Kabul Edilen Miktar
  unit: string; // Birim (AD, KG vb.)
  isSpecialLot: boolean; // DEFSPECIAL == "1"
  batchNum?: string; // Parti No (Lot)
  expiryDate?: string; // SKT
  // Ölçü Bilgileri
  dimensions?: {
    width: number;
    length: number;
    height: number;
    volume: number;
    netWeight: number;
    brutWeight: number;
  };
}

interface MaterialReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  onItemAdded: (item: ReceivedItem) => void;
  vendorCode: string;
  vendorName: string;
  waybillNo: string;
  sourceWarehouse: string;
  targetWarehouse: string;
}

export default function MaterialReceiptModal({
  isOpen,
  onClose,
  onItemAdded,
  vendorCode,
  vendorName,
}: MaterialReceiptModalProps) {
  // Modal Stages: "scan" | "matsize" | "details"
  const [stage, setStage] = useState<"scan" | "matsize" | "details">("scan");

  // Barcode & Query State
  const [barcodeInput, setBarcodeInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // CANIAS Material Detail State
  const [materialData, setMaterialData] = useState<{
    material: string;
    name: string;
    image?: string;
    unit: string;
    defSpecial: string;
    matSize: Record<string, unknown>;
  } | null>(null);

  // SetMatSize Form State
  const [matSizeForm, setMatSizeForm] = useState({
    pwidth: 0,
    plength: 0,
    pheight: 0,
    lunit: "CM",
    volume: 0,
    vunit: "M3",
    netweight: 0,
    nwunit: "KG",
    brutweight: 0,
    bwunit: "KG",
    isexplos: false,
    isspoil: false,
    aklisbreakable: false,
    aklisliquid: false,
    aklistoxic: false,
    aklpalpos: 1,
  });
  const [isSavingMatSize, setIsSavingMatSize] = useState(false);

  // Open Orders State (Sorted FIFO - Oldest to Newest)
  const [openOrders, setOpenOrders] = useState<Record<string, unknown>[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Record<string, unknown> | null>(null);

  // Item Receipt Entry State
  const [receiptQty, setReceiptQty] = useState<number>(1);
  const [lotNumber, setLotNumber] = useState<string>("");
  const [expiryDate, setExpiryDate] = useState<string>("");
  const [lotError, setLotError] = useState<string>("");

  useEffect(() => {
    if (isOpen) {
      setStage("scan");
      setBarcodeInput("");
      setErrorMessage(null);
      setMaterialData(null);
      setOpenOrders([]);
      setSelectedOrder(null);
      setReceiptQty(1);
      setLotNumber("");
      setExpiryDate("");
      setLotError("");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Helper: Turkish number / decimal parser
  const parseNum = (val: unknown): number => {
    if (typeof val === "number") return val;
    if (typeof val === "string") {
      const cleaned = val.replace(/\s/g, "").replace(",", ".");
      const n = parseFloat(cleaned);
      return isNaN(n) ? 0 : n;
    }
    return 0;
  };

  // Helper: Format Image URL / Base64 from CANIAS response
  const formatImageSrc = (raw: unknown): string | undefined => {
    if (!raw || typeof raw !== "string") return undefined;
    const str = raw.trim();
    if (!str) return undefined;
    if (str.startsWith("http://") || str.startsWith("https://") || str.startsWith("data:image/")) {
      return str;
    }
    return `data:image/jpeg;base64,${str}`;
  };

  // Step 1: Process Scanned Barcode -> MZYGetMaterial & MZYGetOpenOrder
  const handleProcessBarcode = async (scanned: string) => {
    const trimmed = (scanned || "").trim();
    if (!trimmed) {
      setErrorMessage("Lütfen geçerli bir barkod okutunuz.");
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      // 1. Call MZYGetMaterial
      const matRes = await api.getMaterialDetail(trimmed);
      const matListRow = (matRes.matList?.[0] as Record<string, unknown>) || {};
      const matSizeRow = (matRes.matSize as Record<string, unknown>) || {};

      const matCode = String(matListRow.MATERIAL || matListRow.STOKKODU || trimmed);
      const matName = String(matListRow.NAME1 || matListRow.STEXT || matListRow.AÇIKLAMA || "Malzeme Tanımı");
      const matUnit = String(matListRow.UNIT || matListRow.BİRİM || "AD");
      const defSpecial = String(matListRow.DEFSPECIAL || matListRow.SPECIALSTOCK || "").trim();
      const rawImg =
        matListRow.IMAGE ||
        matListRow.PICTURE ||
        matListRow.IMAGEURL ||
        matListRow.IMAGEDATA ||
        matListRow.RESIM ||
        matListRow.PHOTO ||
        matRes.image;
      const matImage = formatImageSrc(rawImg);

      const pwidth = parseNum(matSizeRow.PWIDTH);
      const plength = parseNum(matSizeRow.PLENGTH);
      const pheight = parseNum(matSizeRow.PHEIGHT);
      const netweight = parseNum(matSizeRow.NETWEIGHT);
      const brutweight = parseNum(matSizeRow.BRUTWEIGHT);
      const volume = parseNum(matSizeRow.VOLUME || (pwidth * plength * pheight) / 1000000);

      const parsedMatSize = {
        pwidth,
        plength,
        pheight,
        lunit: String(matSizeRow.LUNIT || matSizeRow.PUNIT || "CM"),
        volume,
        vunit: String(matSizeRow.VUNIT || "M3"),
        netweight,
        nwunit: String(matSizeRow.NWUNIT || "KG"),
        brutweight,
        bwunit: String(matSizeRow.BWUNIT || "KG"),
        isexplos: Number(matSizeRow.ISEXPLOS) === 1,
        isspoil: Number(matSizeRow.ISSPOIL) === 1,
        aklisbreakable: Number(matSizeRow.AKLISBREAKABLE) === 1,
        aklisliquid: Number(matSizeRow.AKLISLIQUID) === 1,
        aklistoxic: Number(matSizeRow.AKLISTOXIC) === 1,
        aklpalpos: Number(matSizeRow.AKLPALPOS) || 1,
      };

      setMatSizeForm(parsedMatSize);
      setMaterialData({
        material: matCode,
        name: matName,
        image: matImage,
        unit: matUnit,
        defSpecial,
        matSize: matSizeRow,
      });

      // 2. Check if any critical dimension is zero or empty
      const isDimensionZero =
        pwidth <= 0 ||
        plength <= 0 ||
        pheight <= 0 ||
        netweight <= 0 ||
        brutweight <= 0;

      // 3. Call MZYGetOpenOrder with PSVENDOR
      const orderRes = await api.getOpenOrders({
        barcode: trimmed,
        vendor: vendorCode,
      });
      const rawOrders = (orderRes.orders || []) as Record<string, unknown>[];

      // Sort open orders FIFO: Oldest to Newest (by ORDERDATE or PURORDER)
      const sortedOrders = [...rawOrders].sort((a, b) => {
        const dateA = String(a.ORDERDATE || a.CREATEDAT || a.PURORDER || "");
        const dateB = String(b.ORDERDATE || b.CREATEDAT || b.PURORDER || "");
        return dateA.localeCompare(dateB);
      });

      setOpenOrders(sortedOrders);

      if (sortedOrders.length > 0) {
        const topOrder = sortedOrders[0];
        setSelectedOrder(topOrder);
        const remQty = parseNum(topOrder.REMAININGQTY || topOrder.QUANTITY || 1);
        setReceiptQty(remQty > 0 ? remQty : 1);
      } else {
        setSelectedOrder(null);
        setReceiptQty(1);
      }

      // If dimensions are missing/zero, trigger mandatory SetMatSize screen
      if (isDimensionZero) {
        setStage("matsize");
      } else {
        setStage("details");
      }
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : "Malzeme bilgileri CANIAS üzerinden alınamadı."
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Step 2: Save MzySetMatSize and proceed
  const handleSaveMatSize = async () => {
    if (!materialData?.material) return;

    if (
      matSizeForm.pwidth <= 0 ||
      matSizeForm.plength <= 0 ||
      matSizeForm.pheight <= 0 ||
      matSizeForm.netweight <= 0 ||
      matSizeForm.brutweight <= 0
    ) {
      setErrorMessage("Lütfen tüm ölçü ve ağırlık değerlerini sıfırdan büyük giriniz.");
      return;
    }

    setIsSavingMatSize(true);
    setErrorMessage(null);

    try {
      const calcVol =
        matSizeForm.volume > 0
          ? matSizeForm.volume
          : (matSizeForm.pwidth * matSizeForm.plength * matSizeForm.pheight) / 1000000;

      const res = await api.setMatSize({
        material: materialData.material,
        volume: calcVol,
        vunit: matSizeForm.vunit,
        pwidth: matSizeForm.pwidth,
        plength: matSizeForm.plength,
        pheight: matSizeForm.pheight,
        netweight: matSizeForm.netweight,
        nwunit: matSizeForm.nwunit,
        brutweight: matSizeForm.brutweight,
        bwunit: matSizeForm.bwunit,
        isexplos: matSizeForm.isexplos,
        isspoil: matSizeForm.isspoil,
        aklisbreakable: matSizeForm.aklisbreakable,
        aklisliquid: matSizeForm.aklisliquid,
        aklistoxic: matSizeForm.aklistoxic,
        aklpalpos: matSizeForm.aklpalpos,
      });

      if (!res.ok) {
        setErrorMessage(res.message || "Ölçü bilgileri kaydedilemedi.");
        return;
      }

      // Successfully saved dimensions, now proceed to Details & Quantity entry
      setStage("details");
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Ölçü kayıt hatası oluştu.");
    } finally {
      setIsSavingMatSize(false);
    }
  };

  // Step 3: Finalize and add received item to main 3x3 grid
  const handleConfirmItem = () => {
    if (!materialData) return;

    // DEFSPECIAL check: "1" means lot/batch is required
    const isSpecialLot = materialData.defSpecial === "1";
    if (isSpecialLot && !lotNumber.trim()) {
      setLotError("Bu malzeme partili olduğu için Parti No girilmesi zorunludur.");
      return;
    }

    if (receiptQty <= 0) {
      setErrorMessage("Kabul miktarı en az 1 olmalıdır.");
      return;
    }

    const orderNum = String(selectedOrder?.PURORDER || selectedOrder?.ORDERNUM || "AÇIK-SIP");
    const itemNum = String(selectedOrder?.ITEMNUM || selectedOrder?.LINE || "1");
    const expectedQty = parseNum(selectedOrder?.REMAININGQTY || selectedOrder?.QUANTITY || receiptQty);

    const newItem: ReceivedItem = {
      id: `${materialData.material}-${Date.now()}`,
      material: materialData.material,
      name: materialData.name,
      image: materialData.image,
      orderNum,
      itemNum,
      expectedQty,
      receivedQty: receiptQty,
      unit: materialData.unit,
      isSpecialLot,
      batchNum: lotNumber.trim() || undefined,
      expiryDate: expiryDate || undefined,
      dimensions: {
        width: matSizeForm.pwidth,
        length: matSizeForm.plength,
        height: matSizeForm.pheight,
        volume: matSizeForm.volume,
        netWeight: matSizeForm.netweight,
        brutWeight: matSizeForm.brutweight,
      },
    };

    onItemAdded(newItem);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/60 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto animate-fade-in">
      <div className="relative w-full max-w-2xl rounded-3xl border border-line bg-surface p-5 sm:p-6 shadow-2xl transition-all">
        {/* Header */}
        <div className="flex items-start justify-between pb-3.5 border-b border-line">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-600/10 text-emerald-600 dark:text-emerald-400">
                <Barcode className="h-4 w-4" />
              </span>
              <h3 className="text-base font-extrabold text-fg">
                {stage === "scan" && "Malzeme Barkodu Okut"}
                {stage === "matsize" && "Zorunlu Ölçü ve Nitelik Girişi"}
                {stage === "details" && "Malzeme Kabul Detayı"}
              </h3>
            </div>
            <p className="mt-0.5 text-xs text-subtle truncate max-w-md">
              Tedarikçi: <strong className="text-fg">{vendorName}</strong> ({vendorCode})
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-1.5 text-subtle hover:bg-elevated hover:text-fg transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Global Error Banner */}
        {errorMessage && (
          <div className="mt-3.5 flex items-center gap-2 rounded-xl bg-red-500/10 border border-red-500/30 p-2.5 text-xs text-red-600 dark:text-red-400 font-semibold">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span className="flex-1">{errorMessage}</span>
          </div>
        )}

        {/* STAGE 1: SCAN BARCODE */}
        {stage === "scan" && (
          <div className="mt-4 space-y-4">
            <div className="rounded-2xl border border-line bg-elevated/40 p-4">
              <BarcodeScanner
                prompt="Malzemenin barkodunu kameraya tutun veya yazın"
                placeholder="Örn: 8691234567890"
                prefill={barcodeInput}
                onDetected={handleProcessBarcode}
                hideCardWrapper
              />
            </div>

            {isLoading && (
              <div className="flex flex-col items-center justify-center py-8 text-center text-subtle">
                <Loader2 className="mb-2 h-7 w-7 animate-spin text-emerald-600" />
                <p className="text-xs font-bold text-fg">CANIAS Malzeme Bilgileri ve Açık Siparişler Getiriliyor...</p>
                <p className="text-[11px] text-subtle mt-0.5">MZYGetMaterial & MZYGetOpenOrder sorgulanıyor</p>
              </div>
            )}
          </div>
        )}

        {/* STAGE 2: MANDATORY SET MAT SIZE (If any dimension is 0) */}
        {stage === "matsize" && materialData && (
          <div className="mt-4 space-y-4">
            <div className="rounded-2xl bg-amber-500/10 border border-amber-500/30 p-3 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <strong>Ölçü ve Güvenlik Nitelikleri Eksik!</strong>
                <p className="text-[11px] mt-0.5">
                  Bu malzemenin sistemde en, boy, yükseklik veya ağırlık bilgileri sıfır olduğu için devam etmeden önce doldurulması zorunludur (MzySetMatSize).
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-line bg-surface p-4 space-y-3.5 max-h-[50vh] overflow-y-auto pr-1">
              {/* Product mini header with image */}
              <div className="flex items-center gap-3 pb-3 border-b border-line">
                {materialData.image ? (
                  <img
                    src={materialData.image}
                    alt={materialData.name}
                    className="h-12 w-12 rounded-xl object-cover border border-line shadow-sm shrink-0"
                  />
                ) : (
                  <div className="flex h-12 w-12 rounded-xl bg-emerald-600/10 text-emerald-600 dark:text-emerald-400 items-center justify-center shrink-0 border border-emerald-500/20">
                    <Package className="h-6 w-6" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <h4 className="text-xs font-bold text-fg truncate">{materialData.name}</h4>
                  <p className="text-[11px] font-mono text-subtle">{materialData.material}</p>
                </div>
              </div>

              {/* Dimensions: Width, Length, Height */}
              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label className="text-[11px] font-bold text-fg mb-1 block">En / Genişlik ({matSizeForm.lunit}) *</label>
                  <input
                    type="number"
                    value={matSizeForm.pwidth || ""}
                    onChange={(e) => setMatSizeForm({ ...matSizeForm, pwidth: Number(e.target.value) || 0 })}
                    placeholder="0"
                    className="field-input w-full text-center font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-fg mb-1 block">Boy / Uzunluk ({matSizeForm.lunit}) *</label>
                  <input
                    type="number"
                    value={matSizeForm.plength || ""}
                    onChange={(e) => setMatSizeForm({ ...matSizeForm, plength: Number(e.target.value) || 0 })}
                    placeholder="0"
                    className="field-input w-full text-center font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-fg mb-1 block">Yükseklik ({matSizeForm.lunit}) *</label>
                  <input
                    type="number"
                    value={matSizeForm.pheight || ""}
                    onChange={(e) => setMatSizeForm({ ...matSizeForm, pheight: Number(e.target.value) || 0 })}
                    placeholder="0"
                    className="field-input w-full text-center font-mono font-bold"
                  />
                </div>
              </div>

              {/* Weights: Net, Brut & Volume */}
              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label className="text-[11px] font-bold text-fg mb-1 block">Net Ağırlık ({matSizeForm.nwunit}) *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={matSizeForm.netweight || ""}
                    onChange={(e) => setMatSizeForm({ ...matSizeForm, netweight: Number(e.target.value) || 0 })}
                    placeholder="0.00"
                    className="field-input w-full text-center font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-fg mb-1 block">Brüt Ağırlık ({matSizeForm.bwunit}) *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={matSizeForm.brutweight || ""}
                    onChange={(e) => setMatSizeForm({ ...matSizeForm, brutweight: Number(e.target.value) || 0 })}
                    placeholder="0.00"
                    className="field-input w-full text-center font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-fg mb-1 block">Hacim ({matSizeForm.vunit})</label>
                  <input
                    type="number"
                    step="0.001"
                    value={
                      matSizeForm.volume ||
                      ((matSizeForm.pwidth * matSizeForm.plength * matSizeForm.pheight) / 1000000 || "")
                    }
                    onChange={(e) => setMatSizeForm({ ...matSizeForm, volume: Number(e.target.value) || 0 })}
                    placeholder="0.000"
                    className="field-input w-full text-center font-mono font-bold"
                  />
                </div>
              </div>

              {/* Security & Attribute Flags (0 or 1 switches) */}
              <div className="pt-2 border-t border-line">
                <label className="text-[11px] font-bold text-fg mb-2 block">Güvenlik ve Saklama Nitelikleri</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <label className="flex items-center gap-2 p-2 rounded-xl border border-line bg-elevated/40 cursor-pointer text-xs">
                    <input
                      type="checkbox"
                      checked={matSizeForm.isspoil}
                      onChange={(e) => setMatSizeForm({ ...matSizeForm, isspoil: e.target.checked })}
                      className="rounded text-emerald-600"
                    />
                    <span className="font-semibold text-fg">Bozulabilir</span>
                  </label>

                  <label className="flex items-center gap-2 p-2 rounded-xl border border-line bg-elevated/40 cursor-pointer text-xs">
                    <input
                      type="checkbox"
                      checked={matSizeForm.aklisbreakable}
                      onChange={(e) => setMatSizeForm({ ...matSizeForm, aklisbreakable: e.target.checked })}
                      className="rounded text-emerald-600"
                    />
                    <span className="font-semibold text-fg">Kırılabilir</span>
                  </label>

                  <label className="flex items-center gap-2 p-2 rounded-xl border border-line bg-elevated/40 cursor-pointer text-xs">
                    <input
                      type="checkbox"
                      checked={matSizeForm.aklisliquid}
                      onChange={(e) => setMatSizeForm({ ...matSizeForm, aklisliquid: e.target.checked })}
                      className="rounded text-emerald-600"
                    />
                    <span className="font-semibold text-fg">Sıvı</span>
                  </label>

                  <label className="flex items-center gap-2 p-2 rounded-xl border border-line bg-elevated/40 cursor-pointer text-xs">
                    <input
                      type="checkbox"
                      checked={matSizeForm.isexplos}
                      onChange={(e) => setMatSizeForm({ ...matSizeForm, isexplos: e.target.checked })}
                      className="rounded text-emerald-600"
                    />
                    <span className="font-semibold text-fg flex items-center gap-1">
                      <Flame className="h-3 w-3 text-red-500" /> Patlayıcı
                    </span>
                  </label>

                  <label className="flex items-center gap-2 p-2 rounded-xl border border-line bg-elevated/40 cursor-pointer text-xs">
                    <input
                      type="checkbox"
                      checked={matSizeForm.aklistoxic}
                      onChange={(e) => setMatSizeForm({ ...matSizeForm, aklistoxic: e.target.checked })}
                      className="rounded text-emerald-600"
                    />
                    <span className="font-semibold text-fg flex items-center gap-1">
                      <Biohazard className="h-3 w-3 text-amber-500" /> Zehirli
                    </span>
                  </label>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setStage("scan")}
                className="rounded-xl border border-line px-4 py-2 text-xs font-semibold text-subtle hover:bg-elevated transition"
              >
                Geri Dön
              </button>
              <button
                type="button"
                onClick={handleSaveMatSize}
                disabled={isSavingMatSize}
                className="flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white shadow-md hover:bg-emerald-700 transition"
              >
                {isSavingMatSize ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Kaydediliyor...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" /> Ölçüleri Kaydet ve İlerle
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* STAGE 3: PRODUCT DETAILS, LOT (IF DEFSPECIAL==1) & QUANTITY ENTRY */}
        {stage === "details" && materialData && (
          <div className="mt-4 space-y-4">
            {/* Product Card with Picture */}
            <div className="rounded-2xl border border-line bg-elevated/40 p-3.5 flex items-center gap-3.5">
              {materialData.image ? (
                <img
                  src={materialData.image}
                  alt={materialData.name}
                  className="h-16 w-16 rounded-xl object-cover border border-line shadow-sm shrink-0"
                />
              ) : (
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-emerald-600/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  <Package className="h-8 w-8" />
                </div>
              )}

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="chip bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 font-mono text-[10px]">
                    {materialData.material}
                  </span>
                  {materialData.defSpecial === "1" ? (
                    <span className="chip bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300 font-bold text-[10px] flex items-center gap-1">
                      <Tag className="h-3 w-3" /> Partili Malzeme
                    </span>
                  ) : (
                    <span className="chip bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 text-[10px]">
                      Standart
                    </span>
                  )}
                </div>
                <h4 className="font-extrabold text-fg text-sm truncate mt-1">{materialData.name}</h4>
                <p className="text-[11px] text-subtle mt-0.5">
                  Birim: <strong className="text-fg">{materialData.unit}</strong> · Ölçü:{" "}
                  {matSizeForm.pwidth}x{matSizeForm.plength}x{matSizeForm.pheight} cm ({matSizeForm.brutweight} kg)
                </p>
              </div>
            </div>

            {/* Open Purchase Orders (FIFO Sorted: Oldest to Newest) */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-fg flex items-center gap-1.5">
                  <Layers className="h-3.5 w-3.5 text-emerald-600" />
                  Açık Satın Alma Siparişleri (FIFO - Eskiden Yeniye)
                </label>
                <span className="text-[11px] font-semibold text-subtle">{openOrders.length} Sipariş Bulundu</span>
              </div>

              {openOrders.length > 0 ? (
                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                  {openOrders.map((ord, idx) => {
                    const ordNum = String(ord.PURORDER || ord.ORDERNUM || "");
                    const itemNum = String(ord.ITEMNUM || ord.LINE || idx + 1);
                    const qty = parseNum(ord.REMAININGQTY || ord.QUANTITY || 0);
                    const isSel =
                      selectedOrder &&
                      String(selectedOrder.PURORDER || selectedOrder.ORDERNUM) === ordNum &&
                      String(selectedOrder.ITEMNUM || selectedOrder.LINE) === itemNum;

                    return (
                      <div
                        key={`${ordNum}-${itemNum}-${idx}`}
                        onClick={() => {
                          setSelectedOrder(ord);
                          setReceiptQty(qty > 0 ? qty : 1);
                        }}
                        className={`flex items-center justify-between p-2.5 rounded-xl border text-xs cursor-pointer transition ${
                          isSel
                            ? "border-emerald-500 bg-emerald-500/10 font-bold text-fg ring-1 ring-emerald-500/30"
                            : "border-line bg-surface hover:bg-elevated text-subtle"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600/20 text-emerald-600 text-[10px] font-bold">
                            {idx + 1}
                          </span>
                          <span>
                            Sipariş: <strong className="text-fg">{ordNum}</strong> (Kalem: {itemNum})
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="chip bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300 font-mono">
                            Kalan: {qty} {materialData.unit}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-line bg-elevated/40 p-3 text-center text-xs text-subtle">
                  Bu malzeme için tedarikçiye ait açık sipariş kaydı bulunamadı (Serbest kabul).
                </div>
              )}
            </div>

            {/* LOT / BATCH ENTRY (Required ONLY if DEFSPECIAL === "1") */}
            {materialData.defSpecial === "1" && (
              <div className="rounded-2xl border border-violet-500/30 bg-violet-500/5 p-3.5 space-y-3">
                <div className="flex items-center gap-2 text-violet-700 dark:text-violet-300 text-xs font-bold">
                  <Tag className="h-4 w-4" /> Parti (Lot) ve SKT Bilgileri *
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-bold text-fg mb-1 block">Parti Numarası (Lot No) *</label>
                    <input
                      type="text"
                      value={lotNumber}
                      onChange={(e) => {
                        setLotNumber(e.target.value);
                        if (lotError) setLotError("");
                      }}
                      placeholder="Örn: LOT-202608-01"
                      className={`field-input w-full font-mono text-xs ${
                        lotError ? "border-red-500 focus:ring-red-500" : ""
                      }`}
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-fg mb-1 block">Son Kullanma Tarihi (SKT)</label>
                    <div className="relative">
                      <input
                        type="date"
                        value={expiryDate}
                        onChange={(e) => setExpiryDate(e.target.value)}
                        className="field-input w-full pl-9 text-xs"
                      />
                      <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
                    </div>
                  </div>
                </div>
                {lotError && (
                  <p className="text-[11px] font-semibold text-red-500 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" /> {lotError}
                  </p>
                )}
              </div>
            )}

            {/* QUANTITY INPUT */}
            <div>
              <label className="text-xs font-bold text-fg mb-1.5 block">
                Kabul Edilecek Miktar ({materialData.unit}) *
              </label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setReceiptQty((q) => Math.max(1, q - 1))}
                  className="flex h-11 w-11 items-center justify-center rounded-xl bg-elevated text-subtle hover:bg-line active:scale-95 transition"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <input
                  type="number"
                  min="1"
                  value={receiptQty}
                  onChange={(e) => setReceiptQty(Math.max(1, Number(e.target.value) || 1))}
                  className="field-input flex-1 text-center font-mono text-base font-extrabold"
                />
                <button
                  type="button"
                  onClick={() => setReceiptQty((q) => q + 1)}
                  className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 active:scale-95 transition"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Footer Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-line">
              <button
                type="button"
                onClick={() => setStage("scan")}
                className="rounded-xl border border-line px-4 py-2 text-xs font-semibold text-subtle hover:bg-elevated transition"
              >
                Farklı Barkod Okut
              </button>
              <button
                type="button"
                onClick={handleConfirmItem}
                className="flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white shadow-md hover:bg-emerald-700 transition active:scale-95"
              >
                <CheckCircle2 className="h-4 w-4" /> Ürünü Kabul Et ve Listeye Ekle
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
