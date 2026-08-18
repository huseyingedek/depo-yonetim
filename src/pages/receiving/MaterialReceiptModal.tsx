import { useState, useEffect, useCallback, useMemo } from "react";
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
  Truck,
  Check,
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
  onItemAdded?: (item: ReceivedItem) => void;
  onItemsAdded?: (items: ReceivedItem[]) => void;
  vendorCode: string;
  vendorName: string;
  waybillNo: string;
  sourceWarehouse: string;
  targetWarehouse: string;
  initialBarcode?: string;
}

export default function MaterialReceiptModal({
  isOpen,
  onClose,
  onItemAdded,
  onItemsAdded,
  vendorCode,
  initialBarcode,
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

  // Item Receipt Entry State
  const [receiptQty, setReceiptQty] = useState<number>(1);
  const [lotNumber, setLotNumber] = useState<string>("");
  const [expiryDate, setExpiryDate] = useState<string>("");
  const [lotError, setLotError] = useState<string>("");

  // Helper: Turkish number / decimal parser
  const parseNum = (val: unknown): number => {
    if (val === null || val === undefined) return 0;
    if (typeof val === "number") return isNaN(val) ? 0 : val;
    if (typeof val === "string") {
      const cleaned = val.replace(/\s/g, "").replace(",", ".");
      const n = parseFloat(cleaned);
      return isNaN(n) ? 0 : n;
    }
    return 0;
  };

  // Helper: CANIAS Açık Sipariş Miktarı / Kalan Bakiye Çıkarıcı
  const getOrderRemainingQty = (ord: Record<string, unknown>): number => {
    if (!ord || typeof ord !== "object") return 0;

    // 1. Doğrudan bilinen tüm CANIAS kolon adları
    const candidates = [
      ord.REMQUANTITY,
      ord.REMQTY,
      ord.REMAININGQTY,
      ord.REMAININGQUANTITY,
      ord.OPENQTY,
      ord.OPENQUANTITY,
      ord.RESTQTY,
      ord.RESTQUANTITY,
      ord.PENDINGQTY,
      ord.BALQTY,
      ord.BALANCE,
      ord.KALAN,
      ord.KALANMIKTAR,
      ord.ACIKMIKTAR,
      ord.ACIK,
      ord.QUANTITY,
      ord.QTY,
      ord.ORDERQTY,
      ord.PURQTY,
      ord.ORDERQUANTITY,
      ord.PURQUANTITY,
      ord.REQQUANTITY,
      ord.PDCQUANTITY,
      ord.AKLSQUANTITY,
    ];

    for (const c of candidates) {
      if (c !== undefined && c !== null && c !== "") {
        const num = parseNum(c);
        if (num > 0) return num;
      }
    }

    // 2. Dinamik regex arama (CANIAS tablosundan dönen herhangi bir miktar/bakiye kolonu)
    for (const [k, v] of Object.entries(ord)) {
      if (
        /remquantity|remqty|remaining|openqty|restqty|balance|kalan|acik|quantity|qty|orderqty|miktar/i.test(k) &&
        !/net|gross|amount|total|tutar|price|fiyat|cost|curr|val|unit|date|tarih/i.test(k)
      ) {
        const num = parseNum(v);
        if (num > 0) return num;
      }
    }

    return 0;
  };

  // Helper: CANIAS Kalem No Çıkarıcı (Asla 0 dönmez, 0 ise sıra numarasını kullanır)
  const getOrderItemNum = (ord: Record<string, unknown>, fallbackIndex: number): string => {
    if (!ord || typeof ord !== "object") return String(fallbackIndex + 1);

    const candidates = [
      ord.ITEMNUM,
      ord.ITEM,
      ord.ITEMNO,
      ord.LINE,
      ord.LINENO,
      ord.POITEM,
      ord.PURITEM,
      ord.DOCITEM,
      ord.POSNO,
      ord.ORDERITEM,
      ord.KALEMNO,
      ord.KALEM,
      ord.ROWNUM,
      ord.ORDITEM,
    ];

    for (const c of candidates) {
      if (c !== undefined && c !== null) {
        const s = String(c).trim();
        if (s !== "" && s !== "0") {
          return s;
        }
      }
    }

    return String(fallbackIndex + 1);
  };

  // Helper: CANIAS Sipariş Tarihi Çıkarıcı
  const getOrderDate = (ord: Record<string, unknown>): string => {
    if (!ord || typeof ord !== "object") return "";

    const candidates = [
      ord.ORDERDATE,
      ord.DOCDATE,
      ord.CREATEDAT,
      ord.CREATEDATE,
      ord.VALIDFROM,
      ord.PURDATE,
      ord.DATE,
      ord.DELIVERYDATE,
      ord.PODATE,
    ];

    for (const c of candidates) {
      if (c !== undefined && c !== null) {
        const s = String(c).trim();
        if (s !== "") return s;
      }
    }
    return "";
  };

  // Helper: CANIAS Sipariş No Çıkarıcı
  const getOrderNum = (ord: Record<string, unknown>, fallbackIndex: number): string => {
    if (!ord || typeof ord !== "object") return `SIP-${fallbackIndex + 1}`;

    const candidates = [
      ord.PURORDER,
      ord.ORDERNUM,
      ord.ORDERNO,
      ord.POORDER,
      ord.PO_NUMBER,
      ord.DOCNUM,
      ord.DOCNO,
      ord.ORDER_NUM,
      ord.ORDER,
    ];

    for (const c of candidates) {
      if (c !== undefined && c !== null) {
        const s = String(c).trim();
        if (s !== "") return s;
      }
    }
    return `SIP-${fallbackIndex + 1}`;
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
  const handleProcessBarcode = useCallback(async (scanned: string) => {
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
      const matListRows = Array.isArray(matRes.matList) ? matRes.matList : [];
      const matListRow = (matListRows[0] as Record<string, unknown>) || {};

      const rawSize = matRes.matSize;
      const matSizeRow: Record<string, unknown> = Array.isArray(rawSize)
        ? ((rawSize[0] as Record<string, unknown>) || {})
        : rawSize && typeof rawSize === "object" && "ROW" in rawSize
          ? (((Array.isArray(rawSize.ROW) ? rawSize.ROW[0] : rawSize.ROW) as Record<string, unknown>) || {})
          : ((rawSize as Record<string, unknown>) || {});

      const matCode = String(matListRow.MATERIAL || matListRow.STOKKODU || trimmed);
      const matName = String(matListRow.NAME1 || matListRow.STEXT || matListRow.AÇIKLAMA || "Malzeme Tanımı");
      const matUnit = String(matListRow.UNIT || matListRow.BİRİM || "AD");
      const defSpecial = String(matListRow.DEFSPECIAL ?? matListRow.SPECIALSTOCK ?? matListRow.SPECIAL ?? "").trim();
      const rawImg =
        matListRow.IMAGE ||
        matListRow.PICTURE ||
        matListRow.IMAGEURL ||
        matListRow.IMAGEDATA ||
        matListRow.RESIM ||
        matListRow.PHOTO ||
        matRes.image;
      const matImage = formatImageSrc(rawImg);

      const pwidth = parseNum(matSizeRow.PWIDTH || matSizeRow.WIDTH || matSizeRow.EN);
      const plength = parseNum(matSizeRow.PLENGTH || matSizeRow.LENGTH || matSizeRow.BOY);
      const pheight = parseNum(matSizeRow.PHEIGHT || matSizeRow.HEIGHT || matSizeRow.YUKSEKLIK);
      const netweight = parseNum(matSizeRow.NETWEIGHT || matSizeRow.NETAGIRLIK);
      const brutweight = parseNum(matSizeRow.BRUTWEIGHT || matSizeRow.GROSSWEIGHT || matSizeRow.BRUTAGIRLIK);
      const volume = parseNum(matSizeRow.VOLUME || matSizeRow.HACIM || (pwidth * plength * pheight) / 1000000);

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

      // Sort open orders strictly FIFO: Oldest to Newest (by ORDERDATE or PURORDER)
      const sortedOrders = [...rawOrders].sort((a, b) => {
        const dateA = getOrderDate(a) || getOrderNum(a, 0);
        const dateB = getOrderDate(b) || getOrderNum(b, 0);
        return dateA.localeCompare(dateB);
      });

      setOpenOrders(sortedOrders);

      // Default receipt quantity: starts at 0
      setReceiptQty(0);

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
  }, [vendorCode]);

  useEffect(() => {
    if (isOpen) {
      setErrorMessage(null);
      setMaterialData(null);
      setOpenOrders([]);
      setReceiptQty(0);
      setLotNumber("");
      setExpiryDate("");
      setLotError("");

      if (initialBarcode && initialBarcode.trim()) {
        setBarcodeInput(initialBarcode.trim());
        handleProcessBarcode(initialBarcode.trim());
      } else {
        setStage("scan");
        setBarcodeInput("");
      }
    }
  }, [isOpen, initialBarcode, handleProcessBarcode]);

  // FIFO Otomatik Miktar Dağıtımı Hesaplayıcısı (Eskiden Yeniye Sırayla Düşüm)
  const fifoAllocation = useMemo(() => {
    let remainingToDistribute = Math.max(0, receiptQty);
    const allocatedOrders: Array<{
      order: Record<string, unknown>;
      orderNum: string;
      itemNum: string;
      orderDate: string;
      remainingQty: number;
      allocatedQty: number;
      remainingAfter: number;
      isFullyAllocated: boolean;
      isPartiallyAllocated: boolean;
    }> = [];

    openOrders.forEach((ord, idx) => {
      const orderNum = getOrderNum(ord, idx);
      const itemNum = getOrderItemNum(ord, idx);
      const orderDate = getOrderDate(ord);
      const rawRem = getOrderRemainingQty(ord);
      const remainingQty = rawRem > 0 ? rawRem : 1;

      const alloc = Math.min(remainingToDistribute, remainingQty);
      remainingToDistribute -= alloc;

      allocatedOrders.push({
        order: ord,
        orderNum,
        itemNum,
        orderDate,
        remainingQty,
        allocatedQty: alloc,
        remainingAfter: Math.max(0, remainingQty - alloc),
        isFullyAllocated: remainingQty > 0 && alloc === remainingQty,
        isPartiallyAllocated: alloc > 0 && alloc < remainingQty,
      });
    });

    return {
      allocations: allocatedOrders,
      unallocatedQty: remainingToDistribute, // Açık siparişlerin toplamını aşan serbest miktar
    };
  }, [openOrders, receiptQty]);

  if (!isOpen) return null;

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

  // Step 3: Finalize and add received items according to FIFO allocation
  const handleConfirmItem = () => {
    if (!materialData) return;

    // DEFSPECIAL check: "1" means lot/batch is required
    const isSpecialLot = String(materialData.defSpecial).trim() === "1";
    if (isSpecialLot && !lotNumber.trim()) {
      setLotError("Bu malzeme partili olduğu için Parti No girilmesi zorunludur.");
      return;
    }

    if (receiptQty <= 0) {
      setErrorMessage("Kabul miktarı en az 1 olmalıdır.");
      return;
    }

    const itemsToEmit: ReceivedItem[] = [];
    const { allocations, unallocatedQty } = fifoAllocation;

    const activeAllocations = allocations.filter((a) => a.allocatedQty > 0);

    if (activeAllocations.length > 0) {
      for (const a of activeAllocations) {
        itemsToEmit.push({
          id: `${materialData.material}-${a.orderNum}-${a.itemNum}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          material: materialData.material,
          name: materialData.name,
          image: materialData.image,
          orderNum: a.orderNum,
          itemNum: a.itemNum,
          expectedQty: a.remainingQty,
          receivedQty: a.allocatedQty,
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
        });
      }

      // If quantity exceeds all open orders, add remainder as unallocated/free line
      if (unallocatedQty > 0) {
        itemsToEmit.push({
          id: `${materialData.material}-SERBEST-${Date.now()}`,
          material: materialData.material,
          name: materialData.name,
          image: materialData.image,
          orderNum: "AÇIK-SIP",
          itemNum: "1",
          expectedQty: unallocatedQty,
          receivedQty: unallocatedQty,
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
        });
      }
    } else {
      // No open orders at all -> Serbest kabul
      itemsToEmit.push({
        id: `${materialData.material}-${Date.now()}`,
        material: materialData.material,
        name: materialData.name,
        image: materialData.image,
        orderNum: "AÇIK-SIP",
        itemNum: "1",
        expectedQty: receiptQty,
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
      });
    }

    if (onItemsAdded) {
      onItemsAdded(itemsToEmit);
    } else if (onItemAdded) {
      itemsToEmit.forEach((it) => onItemAdded(it));
    }

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/70 backdrop-blur-sm p-3 sm:p-5 overflow-y-auto animate-fade-in">
      <div className={`relative w-full rounded-3xl border border-line bg-surface p-5 sm:p-6 shadow-2xl transition-all ${stage === "details" ? "max-w-5xl" : "max-w-2xl"
        }`}>
        {/* Header (Kompakt ve az yer kaplayan başlık) */}
        <div className="flex items-center justify-between pb-2.5 border-b border-line">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-600/10 text-emerald-600 dark:text-emerald-400">
              <Barcode className="h-3.5 w-3.5" />
            </span>
            <h3 className="text-xs sm:text-sm font-extrabold text-fg">
              {stage === "scan" && "Malzeme Barkodu Okut"}
              {stage === "matsize" && "Zorunlu Ölçü ve Nitelik Girişi"}
              {stage === "details" && "Malzeme Kabul Detayı ve Sipariş Eşleştirme"}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-subtle hover:bg-elevated hover:text-fg transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Global Error Banner */}
        {errorMessage && (
          <div className="mt-3 flex items-center gap-2 rounded-xl bg-red-500/10 border border-red-500/30 p-2.5 text-xs text-red-600 dark:text-red-400 font-semibold animate-shake">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span className="flex-1">{errorMessage}</span>
          </div>
        )}

        {/* STAGE 1: SCAN BARCODE */}
        {stage === "scan" && (
          <div className="mt-4 space-y-4">
            <div className="rounded-2xl border border-line bg-elevated/40 p-4">
              <BarcodeScanner
                prompt="Malzemenin barkodunu okutun veya yazın"
                placeholder="Örn: 8691234567890"
                prefill={barcodeInput}
                onDetected={handleProcessBarcode}
                hideCardWrapper
              />
            </div>

            {isLoading && (
              <div className="flex flex-col items-center justify-center py-8 text-center text-subtle">
                <Loader2 className="mb-2 h-8 w-8 animate-spin text-emerald-600" />
                <p className="text-xs font-bold text-fg">CANIAS Malzeme Bilgileri ve Açık Siparişler Getiriliyor...</p>
              </div>
            )}
          </div>
        )}

        {/* STAGE 2: MANDATORY SET MAT SIZE */}
        {stage === "matsize" && materialData && (
          <div className="mt-3.5 space-y-3.5">
            <div className="rounded-2xl bg-amber-500/10 border border-amber-500/30 p-3 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <strong>Ölçü ve Güvenlik Nitelikleri Eksik!</strong>
                <p className="text-[11px] mt-0.5">
                  Bu malzemenin sistemde en, boy, yükseklik veya ağırlık bilgileri sıfır olduğu için devam etmeden önce doldurulması zorunludur.
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

              {/* Security & Attribute Flags */}
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

        {/* STAGE 3: DETAILS POPUP (Sol Taraf: Ürün & Miktar Girişi, Sağ Taraf: FIFO Otomatik Sipariş Dağıtımı) */}
        {stage === "details" && materialData && (
          <div className="mt-2.5 space-y-3">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
              {/* SOL SÜTUN (Ürün Kartı, Parti Bilgisi ve Miktar Girişi - Kompakt) */}
              <div className="lg:col-span-4 xl:col-span-4 space-y-2.5">
                {/* Product Card with Picture - Kompakt */}
                <div className="rounded-2xl border border-line bg-elevated/40 p-2.5 flex items-center gap-2.5">
                  {materialData.image ? (
                    <img
                      src={materialData.image}
                      alt={materialData.name}
                      className="h-11 w-11 rounded-xl object-cover border border-line shadow-xs shrink-0"
                    />
                  ) : (
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-600/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                      <Package className="h-5 w-5" />
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="chip bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 font-mono text-[9px] font-bold px-1.5 py-0.5">
                        {materialData.material}
                      </span>
                      {String(materialData.defSpecial).trim() === "1" ? (
                        <span className="chip bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300 font-bold text-[9px] px-1.5 py-0.5 flex items-center gap-1">
                          <Tag className="h-2.5 w-2.5" /> Partili
                        </span>
                      ) : (
                        <span className="chip bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 text-[9px] px-1.5 py-0.5">
                          Standart
                        </span>
                      )}
                    </div>
                    <h4 className="font-extrabold text-fg text-xs truncate mt-0.5" title={materialData.name}>
                      {materialData.name}
                    </h4>
                    <p className="text-[10px] text-subtle">
                      Birim: <strong className="text-fg">{materialData.unit}</strong>
                      {matSizeForm.pwidth > 0 && ` · ${matSizeForm.pwidth}x${matSizeForm.plength}x${matSizeForm.pheight} cm`}
                    </p>
                  </div>
                </div>

                {/* LOT / BATCH ENTRY (Required ONLY if DEFSPECIAL === "1") */}
                {String(materialData.defSpecial).trim() === "1" && (
                  <div className="rounded-2xl border border-violet-500/30 bg-violet-500/5 p-3 space-y-2.5">
                    <div className="flex items-center gap-1.5 text-violet-700 dark:text-violet-300 text-xs font-bold">
                      <Tag className="h-3.5 w-3.5" /> Parti (Lot) ve SKT *
                    </div>
                    <div className="space-y-2">
                      <div>
                        <label className="text-[10px] font-bold text-fg mb-0.5 block">Parti No (Lot No) *</label>
                        <input
                          type="text"
                          value={lotNumber}
                          onChange={(e) => {
                            setLotNumber(e.target.value);
                            if (lotError) setLotError("");
                          }}
                          placeholder="Örn: LOT-202608-01"
                          className={`field-input w-full font-mono text-xs ${lotError ? "border-red-500 focus:ring-red-500" : ""
                            }`}
                          autoFocus
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-fg mb-0.5 block">SKT</label>
                        <div className="relative">
                          <input
                            type="date"
                            value={expiryDate}
                            onChange={(e) => setExpiryDate(e.target.value)}
                            className="field-input w-full pl-8 text-xs"
                          />
                          <Calendar className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-subtle" />
                        </div>
                      </div>
                    </div>
                    {lotError && (
                      <p className="text-[10px] font-semibold text-red-500 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" /> {lotError}
                      </p>
                    )}
                  </div>
                )}

                {/* QUANTITY INPUT SECTION */}
                <div className="rounded-2xl border border-line bg-surface p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-extrabold text-fg">
                      Kabul Edilecek Miktar ({materialData.unit}) <span className="text-red-500">*</span>
                    </label>
                    <span className="text-[11px] font-semibold text-subtle">
                      Adet: <strong className="text-emerald-600 dark:text-emerald-400 font-mono">{receiptQty}</strong>
                    </span>
                  </div>

                  {/* Quantity Stepper */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setReceiptQty((q) => Math.max(0, q - 1))}
                      className="flex h-10 w-10 items-center justify-center rounded-xl bg-elevated text-subtle hover:bg-line active:scale-95 transition shrink-0"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <input
                      type="number"
                      min="0"
                      value={receiptQty === 0 ? "" : receiptQty}
                      placeholder="0"
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        setReceiptQty(isNaN(val) ? 0 : Math.max(0, val));
                      }}
                      className="field-input flex-1 text-center font-mono text-lg font-extrabold text-fg py-1.5"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => setReceiptQty((q) => q + 1)}
                      className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 active:scale-95 transition shrink-0"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Hızlı Artırma ve Sıfırlama Butonları (+5, +10, +50, Sıfırla) */}
                  <div className="grid grid-cols-4 gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => setReceiptQty((prev) => prev + 5)}
                      className="rounded-lg border border-line bg-elevated/70 py-1.5 text-xs font-extrabold text-fg hover:bg-emerald-600 hover:text-white transition active:scale-95 shadow-xs"
                    >
                      +5
                    </button>
                    <button
                      type="button"
                      onClick={() => setReceiptQty((prev) => prev + 10)}
                      className="rounded-lg border border-line bg-elevated/70 py-1.5 text-xs font-extrabold text-fg hover:bg-emerald-600 hover:text-white transition active:scale-95 shadow-xs"
                    >
                      +10
                    </button>
                    <button
                      type="button"
                      onClick={() => setReceiptQty((prev) => prev + 50)}
                      className="rounded-lg border border-line bg-elevated/70 py-1.5 text-xs font-extrabold text-fg hover:bg-emerald-600 hover:text-white transition active:scale-95 shadow-xs"
                    >
                      +50
                    </button>
                    <button
                      type="button"
                      onClick={() => setReceiptQty(0)}
                      className="rounded-lg border border-line bg-elevated/40 py-1.5 text-xs font-bold text-subtle hover:bg-red-500/20 hover:text-red-500 hover:border-red-500/30 transition active:scale-95 shadow-xs"
                    >
                      Sıfırla
                    </button>
                  </div>
                </div>
              </div>

              {/* SAĞ SÜTUN (FIFO'ya Göre Otomatik Eşleşen Aktif Siparişler Listesi - Geniş) */}
              <div className="lg:col-span-8 xl:col-span-8 space-y-2.5">
                <div className="flex items-center justify-between pb-1 border-b border-line">
                  <label className="text-xs font-extrabold text-fg flex items-center gap-1.5">
                    <Layers className="h-4 w-4 text-emerald-600" />
                    Aktif Satın Alma Siparişleri (FIFO Sırası)
                  </label>
                  <span className="chip bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 text-[11px] font-bold">
                    {openOrders.length} Aktif Sipariş
                  </span>
                </div>

                <p className="text-[11px] text-subtle leading-relaxed">
                  Girdiğiniz <strong>{receiptQty} {materialData.unit}</strong> miktar, en eski siparişten başlayarak (FIFO) otomatik olarak düşülecektir.
                </p>

                {openOrders.length > 0 ? (
                  <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1">
                    {fifoAllocation.allocations.map((alloc, idx) => {
                      const isAllocated = alloc.allocatedQty > 0;

                      return (
                        <div
                          key={`${alloc.orderNum}-${alloc.itemNum}-${idx}`}
                          className={`p-3 rounded-2xl border text-xs transition-all ${isAllocated
                              ? "border-2 border-emerald-500 bg-emerald-500/10 dark:bg-emerald-950/30 shadow-md ring-1 ring-emerald-500/30"
                              : "border-line bg-surface opacity-60"
                            }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[10px] font-extrabold ${isAllocated
                                  ? "bg-emerald-600 text-white"
                                  : "bg-elevated text-subtle border border-line"
                                }`}>
                                #{idx + 1}
                              </span>
                              <div>
                                <h5 className="font-extrabold text-fg text-xs">
                                  Sipariş: <strong className="text-emerald-700 dark:text-emerald-400 font-mono">{alloc.orderNum}</strong>
                                </h5>
                                <p className="text-[11px] text-subtle">
                                  Kalem No: <strong className="text-fg">{alloc.itemNum}</strong>
                                  {alloc.orderDate ? ` · Tarih: ${alloc.orderDate}` : ""}
                                </p>
                                <p className="text-[10px] text-subtle mt-0.5">
                                  Mevcut Açık Bakiye: <strong className="text-fg font-mono">{alloc.remainingQty} {materialData.unit}</strong>
                                </p>
                              </div>
                            </div>

                            <div className="text-right shrink-0">
                              {isAllocated ? (
                                <div className="space-y-1">
                                  <span className="chip bg-emerald-600 text-white font-mono font-extrabold text-xs flex items-center gap-1 justify-end">
                                    <Check className="h-3 w-3" /> Bu Siparişten Düşen: {alloc.allocatedQty} {materialData.unit}
                                  </span>
                                  {alloc.isFullyAllocated ? (
                                    <span className="block text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                                      Tamamı Karşılandı ✓
                                    </span>
                                  ) : (
                                    <span className="block text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                                      Kalan Bakiye: {alloc.remainingAfter} {materialData.unit}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="chip bg-elevated text-subtle font-mono text-[10px]">
                                  Sıra Gelmedi (0 {materialData.unit})
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {fifoAllocation.unallocatedQty > 0 && (
                      <div className="p-3 rounded-2xl border border-dashed border-amber-500/40 bg-amber-500/10 text-xs text-amber-800 dark:text-amber-200 flex items-center justify-between">
                        <div>
                          <strong className="block">Sipariş Üstü / Serbest Miktar</strong>
                          <span className="text-[11px]">Tüm açık siparişler karşılandıktan sonra kalan bakiye</span>
                        </div>
                        <span className="chip bg-amber-600 text-white font-mono font-bold">
                          +{fifoAllocation.unallocatedQty} {materialData.unit}
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-line bg-elevated/30 p-6 text-center text-subtle space-y-2">
                    <Truck className="h-8 w-8 mx-auto text-muted" />
                    <p className="text-xs font-bold text-fg">Açık Sipariş Bulunamadı</p>
                    <p className="text-[11px] text-subtle max-w-xs mx-auto">
                      Bu malzeme için tedarikçiye ait aktif sipariş kaydı bulunmuyor. Serbest mal kabul olarak eklenecektir.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Footer Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-line">
              <button
                type="button"
                onClick={() => setStage("scan")}
                className="rounded-xl border border-line px-4 py-2.5 text-xs font-semibold text-subtle hover:bg-elevated transition"
              >
                Farklı Barkod Okut
              </button>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl border border-line px-4 py-2.5 text-xs font-semibold text-subtle hover:bg-elevated transition"
                >
                  Vazgeç
                </button>
                <button
                  type="button"
                  onClick={handleConfirmItem}
                  className="flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-2.5 text-xs font-extrabold text-white shadow-lg hover:bg-emerald-700 active:scale-95 transition"
                >
                  <CheckCircle2 className="h-4 w-4" /> Ürünü Kabul Et ve Listeye Ekle
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
