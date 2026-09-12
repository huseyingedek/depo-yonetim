import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useParams, useSearchParams, useLocation } from "react-router-dom";
import {
  Package,
  Plus,
  Minus,
  Loader2,
  Tag,
  Ruler,
  Pencil,
  Save,
  Camera,
  CornerDownLeft,
  X,
  Check,
  ChevronDown,
  ImageIcon,
  GlassWater,
  Droplets,
  Flame,
  Clock,
  Skull,
  Trash2,
  Layers,
} from "lucide-react";
import PageHeader from "../../components/PageHeader";
import ToastView, { useToast } from "../../components/Toast";
import Dimension3DBoxVisual from "../../components/Dimension3DBoxVisual";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { api } from "../../api/client";
import { isoDateToBatch } from "../../store/pickingLogic";
import { sesBasarili, sesHata } from "../../sound";

export interface ReceivedItem {
  id: string; // Unique client ID
  material: string; // Malzeme Kodu
  name: string; // Malzeme Adı
  image?: string; // Resim URL veya Base64
  orderNum: string; // Satın Alma Sipariş No (PURORDER)
  itemNum: number | string; // Kalem No (ITEMNUM)
  expectedQty: number; // Açık / Beklenen Miktar
  receivedQty: number; // Kabul Edilen Miktar (Stok Birimi)
  unit: string; // Stok Birimi (AD, KG vb.)
  purQty?: number; // Kabul Edilen Miktar (Sipariş Birimi bazında)
  purUnit?: string; // Sipariş Birimi (KO, PK, KT vb.)
  isSpecialLot: boolean; // DEFSPECIAL == "1"
  batchNum?: string; // Parti No (Lot)
  expiryDate?: string; // SKT
  orderType?: string; // Belge Tipi (OP vb.)
  warehouse?: string; // Depo
  stockPlace?: string; // Stok Yeri
  specialStock?: string; // Özel Stok
  dimensions?: {
    width: number;
    length: number;
    height: number;
    volume: number;
    netWeight: number;
    netWeightUnit?: string;
    brutWeight: number;
    brutWeightUnit?: string;
  };
}

// Helper: Sayı ayrıştırma
function parseNum(val: unknown): number {
  if (val === null || val === undefined) return 0;
  if (Array.isArray(val)) return parseNum(val[0]);
  if (typeof val === "number") return isNaN(val) ? 0 : val;
  if (typeof val === "string") {
    const cleaned = val.replace(/\s/g, "").replace(",", ".");
    const n = parseFloat(cleaned);
    return isNaN(n) ? 0 : n;
  }
  return 0;
}

// Helper: CANIAS Açık Sipariş Kalan Miktarını Bulma
function getOrderRemainingQty(ord: Record<string, unknown>): number {
  if (!ord || typeof ord !== "object") return 0;

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
}

// Helper: Kalem No Çıkarıcı
function getOrderItemNum(ord: Record<string, unknown>, fallbackIndex: number): string {
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
}

// Helper: Sipariş Tarihi Çıkarıcı
function getOrderDate(ord: Record<string, unknown>): string {
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
}

// Helper: Sipariş No Çıkarıcı
function getOrderNum(ord: Record<string, unknown>, fallbackIndex: number): string {
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
}

// Helper: Sipariş / Belge Tipi Çıkarıcı
function getOrderType(ord: Record<string, unknown> | undefined): string {
  if (!ord || typeof ord !== "object") return "OP";
  const candidates = [
    ord.ORDERTYPE,
    ord.DOCTYPE,
    ord.BELGETIPI,
    ord.DOC_TYPE,
    ord.POTYPE,
    ord.TYPE,
    ord.PURTYPE,
  ];
  for (const c of candidates) {
    if (c !== undefined && c !== null) {
      const s = String(c).trim();
      if (s !== "") return s;
    }
  }
  return "OP";
}

// Helper: Resim Kaynağı Biçimlendirici
function formatImageSrc(raw: unknown): string | undefined {
  if (!raw || typeof raw !== "string") return undefined;
  const str = raw.trim();
  if (!str) return undefined;
  if (str.startsWith("http://") || str.startsWith("https://") || str.startsWith("data:image/")) {
    return str;
  }
  return `data:image/jpeg;base64,${str}`;
}

// Helper: CANIAS ve farklı veri kaynaklarından boyut/ağırlık değerini tüm takma adlarla bulma
function extractDimensionValue(
  sources: (Record<string, unknown> | undefined)[],
  candidates: string[],
  regexPattern?: RegExp
): number {
  for (const src of sources) {
    if (!src || typeof src !== "object") continue;

    // 1. Doğrudan aday kolon adları
    for (const key of candidates) {
      if (src[key] !== undefined && src[key] !== null && src[key] !== "") {
        const val = parseNum(src[key]);
        if (val > 0) return val;
      }
    }

    // 2. Büyük/küçük harf ve alt çizgi duyarsız eşleşme
    const srcEntries = Object.entries(src);
    for (const cand of candidates) {
      const normalizedCand = cand.toUpperCase().replace(/[_\-\s]/g, "");
      for (const [k, v] of srcEntries) {
        if (k.toUpperCase().replace(/[_\-\s]/g, "") === normalizedCand) {
          const val = parseNum(v);
          if (val > 0) return val;
        }
      }
    }

    // 3. Regex eşleşmesi
    if (regexPattern) {
      for (const [k, v] of srcEntries) {
        if (regexPattern.test(k) && !/price|fiyat|cost|curr|val|unit|date|tarih/i.test(k)) {
          const val = parseNum(v);
          if (val > 0) return val;
        }
      }
    }
  }
  return 0;
}

// Helper: CANIAS ve farklı veri kaynaklarından birim değerini bulma (NWUNIT, BWUNIT, LUNIT, VUNIT vb.)
function extractUnitValue(
  sources: (Record<string, unknown> | undefined)[],
  candidates: string[],
  defaultUnit = "KG"
): string {
  for (const src of sources) {
    if (!src || typeof src !== "object") continue;

    for (const key of candidates) {
      if (src[key] !== undefined && src[key] !== null && String(src[key]).trim() !== "") {
        const u = String(src[key]).trim().toUpperCase();
        if (u === "G" || u === "GR" || u === "GRAM") return "GR";
        if (u === "KG" || u === "KILOGRAM") return "KG";
        if (u === "MG") return "MG";
        if (u === "TON" || u === "T") return "TON";
        if (u === "CM" || u === "MM" || u === "M") return u;
        if (u === "DS" || u === "DESI" || u === "M3") return u;
        return u;
      }
    }

    const srcEntries = Object.entries(src);
    for (const cand of candidates) {
      const normalizedCand = cand.toUpperCase().replace(/[_\-\s]/g, "");
      for (const [k, v] of srcEntries) {
        if (k.toUpperCase().replace(/[_\-\s]/g, "") === normalizedCand && v !== undefined && v !== null && String(v).trim() !== "") {
          const u = String(v).trim().toUpperCase();
          if (u === "G" || u === "GR" || u === "GRAM") return "GR";
          if (u === "KG" || u === "KILOGRAM") return "KG";
          if (u === "MG") return "MG";
          if (u === "TON" || u === "T") return "TON";
          return u;
        }
      }
    }
  }
  return defaultUnit;
}

// Güvenlik & Özel Nitelik Değeri Ayıklayıcı (CANIAS Boolean/1/true uyumlu)
function checkAttr(sources: (Record<string, unknown> | undefined)[], keys: string[]): boolean {
  for (const src of sources) {
    if (!src || typeof src !== "object") continue;
    for (const k of keys) {
      if (k in src) {
        const val = src[k];
        if (
          val === true ||
          val === 1 ||
          val === "1" ||
          String(val).toLowerCase() === "true" ||
          String(val).toUpperCase() === "Y" ||
          String(val).toUpperCase() === "E"
        ) {
          return true;
        }
      }
      for (const [sk, sv] of Object.entries(src)) {
        if (sk.toUpperCase() === k.toUpperCase()) {
          if (
            sv === true ||
            sv === 1 ||
            sv === "1" ||
            String(sv).toLowerCase() === "true" ||
            String(sv).toUpperCase() === "Y" ||
            String(sv).toUpperCase() === "E"
          ) {
            return true;
          }
        }
      }
    }
  }
  return false;
}

export default function ReceivingDetailPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();

  // URL / State Bilgileri
  const supplierState = location.state?.supplier as
    | { id: string; name: string; poNumber: string; barcode?: string }
    | undefined;
  const vendorCode = searchParams.get("vendor") || supplierState?.id || id || "800980";
  const vendorName = searchParams.get("vendorName") || supplierState?.name || location.state?.vendorName || "Tedarikçi";

  const waybillNo = searchParams.get("waybill") || location.state?.waybillNo || "";
  const rawTargetWH = searchParams.get("targetWH") || location.state?.targetWarehouse || "00";
  const rawTargetSP = searchParams.get("targetSP") || location.state?.targetStockPlace || "*";

  const targetWH = rawTargetWH.includes("$") ? rawTargetWH.split("$")[0].trim() : rawTargetWH.trim();
  const targetSP = rawTargetWH.includes("$") ? rawTargetWH.split("$")[1].trim() : rawTargetSP.trim();

  const storageKey = `mzy_receiving_items_${vendorCode || id}_${waybillNo || "active"}`;

  // Toast bildirimleri
  const { toast, show } = useToast();

  // ---------------------------------------------------------------------------
  // 2 AŞAMALI (1 ÜRÜN · 2 ADET) ADIM VE DURUM YÖNETİMİ
  // ---------------------------------------------------------------------------
  const [activeStep, setActiveStep] = useState<"product" | "lot" | "quantity">("product");
  const [isProductScanned, setIsProductScanned] = useState(false);
  const [areDimensionsDone, setAreDimensionsDone] = useState(false);

  // 1. Adım: Barkod Okutma State'leri
  const [barcodeInput, setBarcodeInput] = useState("");
  const [isQueryingBarcode, setIsQueryingBarcode] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);

  // Okutulan Malzemenin Aktif Verisi
  const [currentMaterial, setCurrentMaterial] = useState<{
    material: string;
    name: string;
    image?: string;
    unit: string;
    isSpecialLot: boolean;
    barcodes: Array<{ barcode: string; unit: string }>;
    selectedBarcode: string;
    packageMultiplier?: number;
    unitMultipliers?: Record<string, number>;
    specialAttributes?: {
      isexplos: boolean;
      isspoil: boolean;
      aklisbreakable: boolean;
      aklisliquid: boolean;
      aklistoxic: boolean;
      isheavy?: boolean;
      aklpalpos?: number;
    };
    dimensions?: {
      width: number;
      length: number;
      height: number;
      volume: number;
      netWeight: number;
      netWeightUnit?: string;
      brutWeight: number;
      brutWeightUnit?: string;
    };
  } | null>(null);

  // Ölçü Formu Önbelleği
  const [matSizeForm, setMatSizeForm] = useState<Record<string, unknown> | null>(null);

  // Ölçü Ekranını Mevcut Ürün Değerleriyle Açma (Yeni Sayfaya Yönlendirme)
  const handleOpenDimensionModal = () => {
    if (!currentMaterial) return;
    const formToSend = {
      pwidth: currentMaterial.dimensions?.width || 0,
      plength: currentMaterial.dimensions?.length || 0,
      pheight: currentMaterial.dimensions?.height || 0,
      lunit: "CM",
      volume: currentMaterial.dimensions?.volume || 0,
      vunit: "DS",
      netweight: currentMaterial.dimensions?.netWeight || 0,
      nwunit: "KG",
      brutweight: currentMaterial.dimensions?.brutWeight || 0,
      bwunit: "KG",
      isexplos: Boolean(currentMaterial.specialAttributes?.isexplos),
      isspoil: Boolean(currentMaterial.specialAttributes?.isspoil),
      aklisbreakable: Boolean(currentMaterial.specialAttributes?.aklisbreakable),
      aklisliquid: Boolean(currentMaterial.specialAttributes?.aklisliquid),
      aklistoxic: Boolean(currentMaterial.specialAttributes?.aklistoxic),
      aklpalpos: 1,
    };

    navigate(
      `/receiving/${encodeURIComponent(vendorCode)}/olculer?waybill=${encodeURIComponent(
        waybillNo
      )}&targetWH=${encodeURIComponent(targetWH)}&vendor=${encodeURIComponent(
        vendorCode
      )}&vendorName=${encodeURIComponent(vendorName)}`,
      {
        state: {
          currentMaterial: currentMaterial,
          material: currentMaterial.material,
          name: currentMaterial.name,
          image: currentMaterial.image,
          unit: currentMaterial.unit,
          isSpecialLot: currentMaterial.isSpecialLot,
          barcodes: currentMaterial.barcodes,
          selectedBarcode: currentMaterial.selectedBarcode,
          packageMultiplier: currentMaterial.packageMultiplier,
          unitMultipliers: currentMaterial.unitMultipliers,
          dimensions: currentMaterial.dimensions,
          specialAttributes: currentMaterial.specialAttributes,
          matSizeForm: matSizeForm || formToSend,
          openOrders,
          items: receivedItems,
          waybillNo,
          targetWarehouse: targetWH,
          vendor: vendorCode,
          vendorName,
          activeStep,
          areDimensionsDone,
        },
      }
    );
  };

  // Aktif Öz Nitelikler Listesi (Takipli ilk sırada sipariş toplama tasarımıyla, Bozulur yeşil, Kırılabilir en sonda ve açık sarı)
  const activeSpecialAttrs = useMemo(() => {
    if (!currentMaterial) return [];
    const attrs: Array<{ id: string; label: string; icon: typeof Flame; colorClass: string }> = [];
    const sp = currentMaterial.specialAttributes;

    // 1. Parti Takipli (Sipariş toplamaki birebir pill/rozet tasarımı - İlk sırada)
    if (currentMaterial.isSpecialLot) {
      attrs.push({
        id: "special_lot",
        label: "Parti takipli",
        icon: Clock,
        colorClass: "rounded-full border border-amber-300 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-500/30 text-amber-700 dark:text-amber-300 font-bold text-[9.5px] sm:text-[10px]",
      });
    }

    // 2. Bozulur (Yeşil)
    if (sp?.isspoil) {
      attrs.push({
        id: "spoil",
        label: "Bozulur",
        icon: Clock,
        colorClass: "rounded border border-green-500/40 bg-green-500/15 text-green-800 dark:text-green-300 font-black text-[9px] sm:text-[9.5px]",
      });
    }

    // 3. Yanıcı (Kırmızı)
    if (sp?.isexplos) {
      attrs.push({
        id: "explos",
        label: "Yanıcı",
        icon: Flame,
        colorClass: "rounded border border-rose-500/40 bg-rose-500/15 text-rose-800 dark:text-rose-300 font-black text-[9px] sm:text-[9.5px]",
      });
    }

    // 4. Sıvı (Mavi)
    if (sp?.aklisliquid) {
      attrs.push({
        id: "liquid",
        label: "Sıvı",
        icon: Droplets,
        colorClass: "rounded border border-blue-500/40 bg-blue-500/15 text-blue-800 dark:text-blue-300 font-black text-[9px] sm:text-[9.5px]",
      });
    }

    // 5. Toksik (Mor)
    if (sp?.aklistoxic) {
      attrs.push({
        id: "toxic",
        label: "Toksik",
        icon: Skull,
        colorClass: "rounded border border-purple-500/40 bg-purple-500/15 text-purple-800 dark:text-purple-300 font-black text-[9px] sm:text-[9.5px]",
      });
    }

    // 6. Ağır Yük (İndigo)
    if (sp?.isheavy) {
      attrs.push({
        id: "heavy",
        label: "Ağır Yük",
        icon: Layers,
        colorClass: "rounded border border-indigo-500/40 bg-indigo-500/15 text-indigo-800 dark:text-indigo-300 font-black text-[9px] sm:text-[9.5px]",
      });
    }

    // 7. Kırılabilir (Her zaman EN SONDA - Açık sarı)
    if (sp?.aklisbreakable) {
      attrs.push({
        id: "breakable",
        label: "Kırılabilir",
        icon: GlassWater,
        colorClass: "rounded border border-yellow-300/80 bg-yellow-50 text-yellow-900 dark:bg-yellow-950/40 dark:border-yellow-500/30 dark:text-yellow-300 font-black text-[9px] sm:text-[9.5px]",
      });
    }

    return attrs;
  }, [currentMaterial?.specialAttributes, currentMaterial?.isSpecialLot]);

  // 2. Adım: Adet, Parti & SKT State'leri
  const [receiptQty, setReceiptQty] = useState<number>(0);
  const [lotNumber, setLotNumber] = useState<string>("");
  const [expiryDate, setExpiryDate] = useState<string>("");
  const [lotError, setLotError] = useState<string>("");

  // Miktar, OKUTULAN/SEÇİLİ barkodun biriminde girilir; çarpanı stok birimine (AD) çevirir.
  // Örn: 50'lik KT barkodu → 2 girilirse 2×50 = 100 AD. Etikette barkodun birimi görünür (KT/KO/AD).
  const selectedBarcodeObj = useMemo(() => {
    if (!currentMaterial || !currentMaterial.barcodes || currentMaterial.barcodes.length === 0) return undefined;
    return (
      currentMaterial.barcodes.find((b) => b.barcode === currentMaterial.selectedBarcode) ||
      currentMaterial.barcodes[0]
    );
  }, [currentMaterial]);

  const activeBarcodeUnit = useMemo(() => {
    return String(selectedBarcodeObj?.unit || currentMaterial?.unit || "AD").trim().toUpperCase();
  }, [selectedBarcodeObj, currentMaterial?.unit]);

  const activeBarcodeMultiplier = useMemo(() => {
    if (!currentMaterial) return 1;
    if (currentMaterial.unitMultipliers?.[activeBarcodeUnit]) {
      return currentMaterial.unitMultipliers[activeBarcodeUnit];
    }
    if (activeBarcodeUnit === "AD") return 1;
    return currentMaterial.packageMultiplier || 1;
  }, [currentMaterial, activeBarcodeUnit]);

  // Açık Siparişler (FIFO Sıralı)
  const [openOrders, setOpenOrders] = useState<Record<string, unknown>[]>([]);

  // Okutulanlar Listesi (Sadece aktif oturum veya kayitlar sayfasından dönüşte aktarılır)
  const [receivedItems, setReceivedItems] = useState<ReceivedItem[]>(() => {
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

  // LocalStorage senkronizasyonu
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(receivedItems));
    } catch { }
  }, [receivedItems, storageKey]);

  // Adım ve malzeme geri yükleme (Kayıtlar sayfasından dönüşte)
  useEffect(() => {
    if (location.state?.items && Array.isArray(location.state.items)) {
      setReceivedItems(location.state.items);
    }
    if (location.state?.matSizeSaved) {
      if (location.state.currentMaterial) {
        setCurrentMaterial((prev) => ({
          ...prev,
          ...location.state.currentMaterial,
          packageMultiplier: location.state.currentMaterial.packageMultiplier ?? prev?.packageMultiplier,
          unitMultipliers: location.state.currentMaterial.unitMultipliers ?? prev?.unitMultipliers,
        }));
        setIsProductScanned(true);
      }
      if (location.state.matSizeForm) {
        setMatSizeForm(location.state.matSizeForm);
      }
      if (location.state.openOrders) {
        setOpenOrders(location.state.openOrders);
      }
      setAreDimensionsDone(true);
      setActiveStep(location.state.currentMaterial?.isSpecialLot ? "lot" : "quantity");
    } else if (location.state?.currentMaterial) {
      setCurrentMaterial((prev) => ({
        ...prev,
        ...location.state.currentMaterial,
        packageMultiplier: location.state.currentMaterial.packageMultiplier ?? prev?.packageMultiplier,
        unitMultipliers: location.state.currentMaterial.unitMultipliers ?? prev?.unitMultipliers,
      }));
      setIsProductScanned(true);
      if (location.state.matSizeForm) setMatSizeForm(location.state.matSizeForm);
      if (location.state.openOrders) setOpenOrders(location.state.openOrders);
      if (location.state.areDimensionsDone !== undefined) {
        setAreDimensionsDone(Boolean(location.state.areDimensionsDone));
      }
      if (location.state.activeStep) {
        const st = location.state.activeStep;
        setActiveStep(st === "quantity" ? "quantity" : st === "lot" ? "lot" : "product");
      }
    }
  }, [location.state]);



  // Kamera Barkod Okuyucu Döngüsü
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
            handleScanBarcode(text);
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

  // ---------------------------------------------------------------------------
  // 1. ADIM: ÜRÜN BARKODU OKUTMA VE ÖLÇÜ KONTROLÜ
  // ---------------------------------------------------------------------------
  const handleScanBarcode = useCallback(
    async (codeToScan?: string) => {
      const targetBarcode = (codeToScan || barcodeInput || "").trim();
      if (!targetBarcode) return;

      setIsQueryingBarcode(true);
      setLotError("");

      try {
        // 1. MZYGetMaterial ile malzeme detaylarını çek
        const matRes = await api.getMaterialDetail(targetBarcode);
        const matListRows = Array.isArray(matRes.matList) ? matRes.matList : [];
        const matListRow = (matListRows[0] as Record<string, unknown>) || {};

        const rawSize = matRes.matSize;
        const matSizeRow: Record<string, unknown> = Array.isArray(rawSize)
          ? ((rawSize[0] as Record<string, unknown>) || {})
          : rawSize && typeof rawSize === "object" && "ROW" in rawSize
            ? (((Array.isArray(rawSize.ROW) ? rawSize.ROW[0] : rawSize.ROW) as Record<string, unknown>) || {})
            : ((rawSize as Record<string, unknown>) || {});

        const matCode = String(matListRow.MATERIAL || matListRow.STOKKODU || targetBarcode);
        const matName = String(matListRow.NAME1 || matListRow.STEXT || matListRow.AÇIKLAMA || matListRow.MTEXT || "Malzeme");
        const matUnit = String(matListRow.UNIT || matListRow.BİRİM || matListRow.SKUNIT || "AD");
        const defSpecial = String(matListRow.DEFSPECIAL ?? matListRow.SPECIALSTOCK ?? matListRow.SPECIAL ?? "").trim();
        const isSpecialLot = defSpecial === "1";

        const rawImg =
          matListRow.IMAGE ||
          matListRow.PICTURE ||
          matListRow.IMAGEURL ||
          matListRow.IMAGEDATA ||
          matListRow.RESIM ||
          matListRow.PHOTO ||
          matRes.image;
        const matImage = formatImageSrc(rawImg);

        const nestedSize = (matListRow.MATSIZE as Record<string, unknown>)?.ROW || matListRow.MATSIZE;
        const nestedSizeRow: Record<string, unknown> =
          nestedSize && typeof nestedSize === "object" ? (nestedSize as Record<string, unknown>) : {};

        const dimSources = [nestedSizeRow, matSizeRow, matListRow, ...(matListRows as Record<string, unknown>[])];

        const plength = extractDimensionValue(
          dimSources,
          [
            "PLENGTH",
            "LENGTH",
            "UZUNLUK",
            "BOY",
            "DERINLIK",
            "DEPTH",
            "PDEPTH",
            "LENGHT",
            "PLENGHT",
            "PBOY",
            "PUZUNLUK",
            "MLENGTH",
            "ILENGTH",
            "SIZEL",
            "DIML",
            "P_LENGTH",
            "P_BOY",
            "P_UZUNLUK",
            "BOYU",
            "UZUNLUGU",
            "LONGITUDE",
            "LONG",
          ],
          /^(p_?)?(length|lenght|boy|uzunluk|depth|derinlik)/i
        );

        const pwidth = extractDimensionValue(
          dimSources,
          [
            "PWIDTH",
            "WIDTH",
            "EN",
            "GENISLIK",
            "PGENISLIK",
            "PEN",
            "MWIDTH",
            "IWIDTH",
            "WIDHT",
            "PWIDHT",
            "SIZEW",
            "DIMW",
            "P_WIDTH",
            "P_EN",
            "P_GENISLIK",
            "ENI",
            "GENISLIGI",
          ],
          /^(p_?)?(width|widht|en|genislik)/i
        );

        const pheight = extractDimensionValue(
          dimSources,
          [
            "PHEIGHT",
            "HEIGHT",
            "YUKSEKLIK",
            "PYUKSEKLIK",
            "MHEIGHT",
            "IHEIGHT",
            "HEIGTH",
            "PHEIGTH",
            "SIZEH",
            "DIMH",
            "P_HEIGHT",
            "P_YUKSEKLIK",
            "YUKSEKLIGI",
          ],
          /^(p_?)?(height|heigth|yukseklik)/i
        );

        const netweight = extractDimensionValue(
          dimSources,
          [
            "NETWEIGHT",
            "NETAGIRLIK",
            "NET_WEIGHT",
            "NET_AGIRLIK",
            "NWEIGHT",
            "NETW",
            "NETAGIRLIGI",
            "NET",
          ],
          /^net(weight|agirlik|w)?$/i
        );

        const brutweight = extractDimensionValue(
          dimSources,
          [
            "BRUTWEIGHT",
            "GROSSWEIGHT",
            "BRUTAGIRLIK",
            "BRUT_WEIGHT",
            "BRUT_AGIRLIK",
            "BWEIGHT",
            "GWEIGHT",
            "BRUTW",
            "GROSSW",
            "BRUTAGIRLIGI",
            "GROSSAGIRLIK",
            "BRUT",
            "GROSS",
          ],
          /^(brut|gross)(weight|agirlik|w)?$/i
        );

        const volume =
          extractDimensionValue(
            dimSources,
            ["VOLUME", "HACIM", "PVOLUME", "VOL", "HACMI", "DS", "DESI"],
            /^(p_?)?(volume|hacim|vol|desi)$/i
          ) || (pwidth > 0 && plength > 0 && pheight > 0 ? Number(((pwidth * plength * pheight) / 3000).toFixed(2)) : 0);

        const nwunit = extractUnitValue(
          dimSources,
          ["NWUNIT", "WUNIT", "WEIGHTUNIT", "NETWUNIT", "NETUNIT", "NUNIT", "P_NWUNIT", "UNIT_NET"],
          String(matSizeRow.NWUNIT || nestedSizeRow.NWUNIT || "KG")
        );

        const bwunit = extractUnitValue(
          dimSources,
          ["BWUNIT", "WUNIT", "WEIGHTUNIT", "BRUTWUNIT", "BRUTUNIT", "BUNIT_WEIGHT", "P_BWUNIT", "UNIT_BRUT"],
          String(matSizeRow.BWUNIT || nestedSizeRow.BWUNIT || "KG")
        );

        const parsedMatSize = {
          pwidth,
          plength,
          pheight,
          lunit: String(matSizeRow.LUNIT || matSizeRow.PUNIT || nestedSizeRow.LUNIT || nestedSizeRow.PUNIT || "CM"),
          volume,
          vunit: String(matSizeRow.VUNIT || nestedSizeRow.VUNIT || "DS"),
          netweight,
          nwunit,
          brutweight,
          bwunit,
          isexplos: Number(matSizeRow.ISEXPLOS ?? nestedSizeRow.ISEXPLOS) === 1,
          isspoil: Number(matSizeRow.ISSPOIL ?? nestedSizeRow.ISSPOIL) === 1,
          aklisbreakable: Number(matSizeRow.AKLISBREAKABLE ?? nestedSizeRow.AKLISBREAKABLE) === 1,
          aklisliquid: Number(matSizeRow.AKLISLIQUID ?? nestedSizeRow.AKLISLIQUID) === 1,
          aklistoxic: Number(matSizeRow.AKLISTOXIC ?? nestedSizeRow.AKLISTOXIC) === 1,
          aklpalpos: Number(matSizeRow.AKLPALPOS ?? nestedSizeRow.AKLPALPOS) || 1,
        };

        setMatSizeForm(parsedMatSize);

        // 2. Barkodlar TBLBARCODELIST, birim çevrimleri TBLUNITLIST altında gelir — hepsi TEK yanıtta.
        const rawBarcodeList = Array.isArray(matRes.barcodeList) ? matRes.barcodeList : [];
        const rawUnitList = Array.isArray(matRes.unitList) ? matRes.unitList : [];
        const seenBarcodes = new Set<string>();
        const barcodes: Array<{ barcode: string; unit: string }> = [];
        const unitMultipliers: Record<string, number> = { "AD": 1 };

        // Birim çarpanları CANIAS'ın TBLUNITLIST tablosundan (ör. 1 KT = 12 AD).
        for (const u of rawUnitList) {
          const uCode = String(u.QUNIT || u.UNIT || "").trim().toUpperCase();
          const uFct = parseNum(u.PERUNIT ?? u.FCT ?? u.VALUE);
          if (uCode && uFct > 0) unitMultipliers[uCode] = uFct;
        }

        const scannedBarcodeRow = rawBarcodeList.find(
          (b) => String(b.BARCODE || b.barcode || "").trim() === targetBarcode
        );
        const scannedUnit = String(
          scannedBarcodeRow?.BUNIT || scannedBarcodeRow?.UNIT || matUnit || "AD"
        ).trim().toUpperCase();

        // TBLUNITLIST'te bulunamadıysa okutulan barkodun QUANTITY'sini yedek çarpan olarak kullan.
        const scannedMultiplier = parseNum(matListRow.QUANTITY || 1) || 1;
        if (scannedUnit && scannedMultiplier > 0 && !unitMultipliers[scannedUnit]) {
          unitMultipliers[scannedUnit] = scannedMultiplier;
        }

        // Malzemenin TÜM barkodlarını kendi BUNIT'leriyle ekle (AD, KT, KO, PK ...).
        for (const b of rawBarcodeList) {
          const bCode = String(b.BARCODE || b.barcode || "").trim();
          const bUnit = String(
            b.BUNIT || b.UNIT || b.BARCODEUNIT || b.B_UNIT || b.unit || matUnit || "AD"
          ).trim().toUpperCase();
          if (bCode && !seenBarcodes.has(bCode)) {
            seenBarcodes.add(bCode);
            barcodes.push({ barcode: bCode, unit: bUnit });
          }
        }

        // Okutulan barkod listede yoksa yine de ekle.
        if (targetBarcode && !seenBarcodes.has(targetBarcode)) {
          seenBarcodes.add(targetBarcode);
          barcodes.push({ barcode: targetBarcode, unit: scannedUnit || matUnit || "AD" });
        }

        // 3. MZYGetOpenOrder ile açık siparişleri getir (Barkod, Malzeme Kodu ve Tedarikçi Fallback'li)
        let rawOrders: Record<string, unknown>[] = [];
        const orderRes = await api.getOpenOrders({
          barcode: targetBarcode,
          vendor: vendorCode,
        });
        if (orderRes.orders && orderRes.orders.length > 0) {
          rawOrders = orderRes.orders as Record<string, unknown>[];
        }

        // Eğer okutulan barkodla bulunamadıysa ve malzeme kodu farklıysa malzeme kodu ile dene
        if (rawOrders.length === 0 && matCode && matCode !== targetBarcode) {
          const matOrderRes = await api.getOpenOrders({
            barcode: matCode,
            vendor: vendorCode,
          });
          if (matOrderRes.orders && matOrderRes.orders.length > 0) {
            rawOrders = matOrderRes.orders as Record<string, unknown>[];
          }
        }

        // Barkod+tedarikçi ile bulunamadıysa YALNIZCA tedarikçi (PSVENDOR) ile çek.
        // İçerdeki GetOpenOrder HER KOŞULDA PSVENDOR gönderir — tedarikçisiz istek atılmaz.
        // Dönen listeyi okutulan malzemeye göre istemcide süz (alakasız kalemler girmesin).
        if (rawOrders.length === 0 && vendorCode) {
          const vendorOnlyRes = await api.getOpenOrders({
            vendor: vendorCode,
          });
          const vendorOrders = (vendorOnlyRes.orders as Record<string, unknown>[]) || [];
          if (vendorOrders.length > 0) {
            const kodlar = [targetBarcode, matCode]
              .map((k) => String(k || "").trim())
              .filter(Boolean);
            const eslesen = vendorOrders.filter((o) => {
              const mat = String(o.MATERIAL || o.PSMATERIAL || o.MATERIALCODE || "").trim();
              const bc = String(o.BARCODE || o.PSBARCODE || "").trim();
              return kodlar.some((k) => k === mat || k === bc);
            });
            rawOrders = eslesen;
          }
        }

        const sortedOrders = [...rawOrders].sort((a, b) => {
          const dateA = getOrderDate(a) || getOrderNum(a, 0);
          const dateB = getOrderDate(b) || getOrderNum(b, 0);
          return dateB.localeCompare(dateA); // Yeniden eskiye sıralama (LIFO)
        });

        setOpenOrders(sortedOrders);

        // Varsayılan adet: 0 olarak başlar
        setReceiptQty(0);

        // Ölçü tamlık kontrolü (Tüm boyutlar ve ağırlıklar > 0 mı?)
        const hasAllDimensions =
          pwidth > 0 &&
          plength > 0 &&
          pheight > 0 &&
          netweight > 0 &&
          brutweight > 0;

        const specialAttributes = {
          isexplos: checkAttr(dimSources, ["ISEXPLOS", "ISEXPLOSIVE", "EXPLOSIVE", "YANICI", "PATLAYICI", "IS_EXPLOS"]),
          isspoil: checkAttr(dimSources, ["ISSPOIL", "ISSPOILAGE", "SPOIL", "BOZULABILIR", "BOZULUR", "IS_SPOIL"]),
          aklisbreakable: checkAttr(dimSources, ["AKLISBREAKABLE", "ISBREAKABLE", "BREAKABLE", "KIRILABILIR", "KIRILIR", "AKL_ISBREAKABLE"]),
          aklisliquid: checkAttr(dimSources, ["AKLISLIQUID", "ISLIQUID", "LIQUID", "SIVI", "AKL_ISLIQUID"]),
          aklistoxic: checkAttr(dimSources, ["AKLISTOXIC", "ISTOXIC", "TOXIC", "TOKSIK", "ZEHIRLI", "AKL_ISTOXIC"]),
          isheavy: checkAttr(dimSources, ["AKLISHEAVY", "ISHEAVY", "HEAVY", "AGIR", "AGIRYUK"]),
          aklpalpos: Number(matSizeRow.AKLPALPOS ?? nestedSizeRow.AKLPALPOS) || 1,
        };

        const matObj = {
          material: matCode,
          name: matName,
          image: matImage,
          unit: matUnit,
          isSpecialLot,
          barcodes,
          selectedBarcode: targetBarcode || barcodes[0]?.barcode || "",
          packageMultiplier: scannedMultiplier,
          unitMultipliers,
          specialAttributes,
          dimensions: {
            width: pwidth,
            length: plength,
            height: pheight,
            volume,
            netWeight: netweight,
            netWeightUnit: nwunit,
            brutWeight: brutweight,
            brutWeightUnit: bwunit,
          },
        };

        setCurrentMaterial(matObj);
        setIsProductScanned(true);

        if (!hasAllDimensions) {
          // Ölçüler eksik -> Ölçü Sayfasına yönlendir
          setAreDimensionsDone(false);
          sesBasarili();
          navigate(
            `/receiving/${encodeURIComponent(vendorCode)}/olculer?waybill=${encodeURIComponent(
              waybillNo
            )}&targetWH=${encodeURIComponent(targetWH)}&vendor=${encodeURIComponent(
              vendorCode
            )}&vendorName=${encodeURIComponent(vendorName)}`,
            {
              state: {
                material: matObj.material,
                name: matObj.name,
                image: matObj.image,
                unit: matObj.unit,
                isSpecialLot: matObj.isSpecialLot,
                barcodes: matObj.barcodes,
                selectedBarcode: matObj.selectedBarcode,
                dimensions: matObj.dimensions,
                specialAttributes: matObj.specialAttributes,
                matSizeForm: {
                  pwidth,
                  plength,
                  pheight,
                  lunit: "CM",
                  volume,
                  vunit: "DS",
                  netweight,
                  nwunit: "KG",
                  brutweight,
                  bwunit: "KG",
                  ...specialAttributes,
                  aklpalpos: 1,
                },
                openOrders: sortedOrders,
                items: receivedItems,
                waybillNo,
                targetWarehouse: targetWH,
                vendor: vendorCode,
                vendorName,
                activeStep: "product",
                areDimensionsDone: false,
              },
            }
          );
        } else {
          // Bütün ölçü değerleri var -> 1. yer yeşil; partili malzemede Parti adımına, değilse Miktara geç.
          setAreDimensionsDone(true);
          setActiveStep(matObj.isSpecialLot ? "lot" : "quantity");
          sesBasarili();
        }
      } catch (err: unknown) {
        sesHata();
        show({
          kind: "error",
          text: err instanceof Error ? err.message : "Malzeme bilgileri CANIAS üzerinden alınamadı.",
        });
      } finally {
        setIsQueryingBarcode(false);
      }
    },
    [barcodeInput, vendorCode, show]
  );

  // ---------------------------------------------------------------------------
  // KABUL EDİLEN TOPLAM MALZEME MİKTARI VE SİPARİŞ KARŞILAMA HESAPLAYICISI
  // ---------------------------------------------------------------------------
  const completedMaterialQty = useMemo(() => {
    if (!currentMaterial) return 0;
    return receivedItems
      .filter((it) => it.material === currentMaterial.material)
      .reduce((sum, it) => sum + (it.receivedQty || 0), 0);
  }, [receivedItems, currentMaterial]);

  // Açık Siparişlerin Başlangıç Toplam Adedi (Stok Birimi Bazında)
  const totalInitialOrderQty = useMemo(() => {
    if (!openOrders || openOrders.length === 0) return 0;
    return openOrders.reduce((sum, ord) => {
      const q = getOrderRemainingQty(ord);
      const purUnit = String(ord?.PURUNIT || ord?.QUNIT || currentMaterial?.unit || "AD").trim().toUpperCase();
      const stockUnit = String(ord?.SKUNIT || ord?.STOCKUNIT || currentMaterial?.unit || "AD").trim().toUpperCase();
      let factor = 1;
      if (purUnit !== stockUnit) {
        if (currentMaterial?.unitMultipliers?.[purUnit]) {
          factor = currentMaterial.unitMultipliers[purUnit];
        } else if (currentMaterial?.packageMultiplier && currentMaterial.packageMultiplier > 1) {
          factor = currentMaterial.packageMultiplier;
        } else {
          const conv1 = parseNum(ord.CONV1 || ord.PCONV1 || 1);
          const conv2 = parseNum(ord.CONV2 || ord.PCONV2 || 1);
          if (conv1 > 0 && conv2 > 0 && conv1 !== conv2) {
            factor = conv2 / conv1;
          }
        }
      }
      return sum + (q > 0 ? q * factor : 1);
    }, 0);
  }, [openOrders, currentMaterial]);

  // Açık Siparişlerde Kalan Toplam Bakiye (Kabul Edilebilecek Maksimum Miktar - Stok Birimi)
  const totalAvailableQty = useMemo(() => {
    return Math.max(0, totalInitialOrderQty - completedMaterialQty);
  }, [totalInitialOrderQty, completedMaterialQty]);

  // Sipariş Karşılama Durumu (Stok Birimi Bazında Dağıtım ve Sipariş Birimine Çevrim)
  const orderFulfillment = useMemo(() => {
    let remainingToDistribute = Math.max(0, completedMaterialQty);
    const allocations: Array<{
      order: Record<string, unknown>;
      orderNum: string;
      itemNum: string;
      orderDate: string;
      totalPurQty: number;
      fulfilledPurQty: number;
      remPurQty: number;
      totalStockQty: number;
      fulfilledStockQty: number;
      remStockQty: number;
      purUnit: string;
      stockUnit: string;
      factor: number;
      isFullyAllocated: boolean;
      isPartiallyAllocated: boolean;
    }> = [];

    openOrders.forEach((ord, idx) => {
      const orderNum = getOrderNum(ord, idx);
      const itemNum = getOrderItemNum(ord, idx);
      const orderDate = getOrderDate(ord);
      const purUnit = String(ord?.PURUNIT || ord?.QUNIT || currentMaterial?.unit || "AD").trim().toUpperCase();
      const stockUnit = String(ord?.SKUNIT || ord?.STOCKUNIT || currentMaterial?.unit || "AD").trim().toUpperCase();

      const rawPurQty = getOrderRemainingQty(ord);
      const totalPurQty = rawPurQty > 0 ? rawPurQty : 1;

      let factor = 1;
      if (purUnit !== stockUnit) {
        if (currentMaterial?.unitMultipliers?.[purUnit]) {
          factor = currentMaterial.unitMultipliers[purUnit];
        } else if (currentMaterial?.packageMultiplier && currentMaterial.packageMultiplier > 1) {
          factor = currentMaterial.packageMultiplier;
        } else {
          const conv1 = parseNum(ord.CONV1 || ord.PCONV1 || 1);
          const conv2 = parseNum(ord.CONV2 || ord.PCONV2 || 1);
          if (conv1 > 0 && conv2 > 0 && conv1 !== conv2) {
            factor = conv2 / conv1;
          }
        }
      }

      const totalStockQty = Number((totalPurQty * factor).toFixed(2));
      const fulfilledStockQty = Math.min(remainingToDistribute, totalStockQty);
      remainingToDistribute = Math.max(0, remainingToDistribute - fulfilledStockQty);

      const fulfilledPurQty = factor > 1 ? Number((fulfilledStockQty / factor).toFixed(2)) : fulfilledStockQty;
      const remPurQty = Math.max(0, Number((totalPurQty - fulfilledPurQty).toFixed(2)));
      const remStockQty = Math.max(0, Number((totalStockQty - fulfilledStockQty).toFixed(2)));

      allocations.push({
        order: ord,
        orderNum,
        itemNum,
        orderDate,
        totalPurQty,
        fulfilledPurQty,
        remPurQty,
        totalStockQty,
        fulfilledStockQty,
        remStockQty,
        purUnit,
        stockUnit,
        factor,
        isFullyAllocated: totalStockQty > 0 && fulfilledStockQty >= totalStockQty,
        isPartiallyAllocated: fulfilledStockQty > 0 && fulfilledStockQty < totalStockQty,
      });
    });

    return {
      allocations,
      totalFulfilled: completedMaterialQty,
    };
  }, [openOrders, completedMaterialQty, currentMaterial]);

  // ---------------------------------------------------------------------------
  // 2. ADIM: MİKTAR GİRİŞİ TAMAMLAMA (BİTİR BUTONU)
  // ---------------------------------------------------------------------------
  const handleCompleteItemReceipt = () => {
    if (!currentMaterial) return;

    if (receiptQty <= 0) {
      sesHata();
      show({ kind: "err", text: "Lütfen 0'dan büyük bir kabul miktarı giriniz." });
      return;
    }

    const maxAllowedInActiveUnit = activeBarcodeMultiplier > 1
      ? Math.floor(totalAvailableQty / activeBarcodeMultiplier)
      : totalAvailableQty;

    // Açık siparişlerin kalan toplam bakiyesinden fazlaysa izin verme ve 0'a çek
    if (totalInitialOrderQty > 0 && receiptQty > maxAllowedInActiveUnit) {
      sesHata();
      show({
        kind: "err",
        text: `Fazla miktar girdiniz! Açık siparişlerin kalan bakiyesinden (${maxAllowedInActiveUnit} ${activeBarcodeUnit}) daha fazla miktar kabul edilemez.`,
      });
      setReceiptQty(0);
      return;
    }

    if (currentMaterial.isSpecialLot && !lotNumber.trim()) {
      sesHata();
      setLotError("Bu malzeme partili olduğu için Parti No girilmesi zorunludur.");
      show({ kind: "err", text: "Lütfen Parti Numarasını giriniz." });
      setActiveStep("lot"); // Parti adımına dön ki giriş alanı ve hata görünsün
      return;
    }

    // Depocunun girdiği miktarı stok birimine çevir (Örn: 5 KO * 24 = 120 AD)
    const totalReceivedStockQty = receiptQty * activeBarcodeMultiplier;
    let remainingToDistribute = totalReceivedStockQty;
    const newItems: ReceivedItem[] = [];

    if (openOrders.length > 0) {
      for (let idx = 0; idx < openOrders.length; idx++) {
        if (remainingToDistribute <= 0) break;
        const ord = openOrders[idx];
        const orderNum = getOrderNum(ord, idx);
        const itemNum = getOrderItemNum(ord, idx);
        const purUnit = String(ord?.PURUNIT || ord?.QUNIT || currentMaterial?.unit || "AD").trim().toUpperCase();
        const stockUnit = String(ord?.SKUNIT || ord?.STOCKUNIT || currentMaterial?.unit || "AD").trim().toUpperCase();

        const rawRem = getOrderRemainingQty(ord);
        const totalPurQty = rawRem > 0 ? rawRem : 1;

        let factor = 1;
        if (purUnit !== stockUnit) {
          if (currentMaterial?.unitMultipliers?.[purUnit]) {
            factor = currentMaterial.unitMultipliers[purUnit];
          } else if (currentMaterial?.packageMultiplier && currentMaterial.packageMultiplier > 1) {
            factor = currentMaterial.packageMultiplier;
          } else {
            const conv1 = parseNum(ord.CONV1 || ord.PCONV1 || 1);
            const conv2 = parseNum(ord.CONV2 || ord.PCONV2 || 1);
            if (conv1 > 0 && conv2 > 0 && conv1 !== conv2) {
              factor = conv2 / conv1;
            }
          }
        }

        const totalStockQty = Number((totalPurQty * factor).toFixed(2));

        const alreadyAllocated = receivedItems
          .filter((it) => it.material === currentMaterial.material && String(it.orderNum) === String(orderNum) && String(it.itemNum) === String(itemNum))
          .reduce((sum, it) => sum + it.receivedQty, 0);

        const availableInThisOrder = Math.max(0, totalStockQty - alreadyAllocated);
        if (availableInThisOrder > 0) {
          const alloc = Math.min(remainingToDistribute, availableInThisOrder);
          remainingToDistribute -= alloc;

          const allocPurQty = factor > 0 ? Number((alloc / factor).toFixed(2)) : alloc;
          newItems.push({
            id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            material: currentMaterial.material,
            name: currentMaterial.name,
            image: currentMaterial.image,
            orderType: getOrderType(ord) || "OP",
            orderNum,
            itemNum,
            warehouse: targetWH || "00",
            stockPlace: (ord.STOCKPLACE && ord.STOCKPLACE !== "*" ? String(ord.STOCKPLACE).trim() : targetSP) || "*",
            specialStock: currentMaterial.isSpecialLot ? "1" : "*",
            expectedQty: totalStockQty,
            receivedQty: alloc,
            unit: currentMaterial.unit || "AD",
            purQty: allocPurQty,
            purUnit: purUnit || activeBarcodeUnit || "AD",
            isSpecialLot: currentMaterial.isSpecialLot,
            batchNum: currentMaterial.isSpecialLot && lotNumber.trim() ? lotNumber.trim() : "*",
            expiryDate: expiryDate.trim() || undefined,
            dimensions: currentMaterial.dimensions,
          });
        }
      }

      // Kalan veya serbest miktar varsa ekle
      if (remainingToDistribute > 0) {
        const excessPurQty = activeBarcodeMultiplier > 0
          ? Number((remainingToDistribute / activeBarcodeMultiplier).toFixed(2))
          : remainingToDistribute;
        newItems.push({
          id: `item-excess-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          material: currentMaterial.material,
          name: currentMaterial.name,
          image: currentMaterial.image,
          orderType: openOrders[0] ? getOrderType(openOrders[0]) : "OP",
          orderNum: openOrders[0] ? getOrderNum(openOrders[0], 0) : "SERBEST",
          itemNum: openOrders[0] ? getOrderItemNum(openOrders[0], 0) : 1,
          warehouse: targetWH || "00",
          stockPlace: targetSP || "*",
          specialStock: currentMaterial.isSpecialLot ? "1" : "*",
          expectedQty: remainingToDistribute,
          receivedQty: remainingToDistribute,
          unit: currentMaterial.unit || "AD",
          purQty: excessPurQty,
          purUnit: activeBarcodeUnit || "AD",
          isSpecialLot: currentMaterial.isSpecialLot,
          batchNum: currentMaterial.isSpecialLot && lotNumber.trim() ? lotNumber.trim() : "*",
          expiryDate: expiryDate.trim() || undefined,
          dimensions: currentMaterial.dimensions,
        });
      }
    } else {
      // Açık sipariş yoksa doğrudan serbest kabul olarak ekle
      const directPurQty = activeBarcodeMultiplier > 0
        ? Number((totalReceivedStockQty / activeBarcodeMultiplier).toFixed(2))
        : totalReceivedStockQty;
      newItems.push({
        id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        material: currentMaterial.material,
        name: currentMaterial.name,
        image: currentMaterial.image,
        orderType: "OP",
        orderNum: "SERBEST",
        itemNum: 1,
        warehouse: targetWH || "00",
        stockPlace: targetSP || "*",
        specialStock: currentMaterial.isSpecialLot ? "1" : "*",
        expectedQty: totalReceivedStockQty,
        receivedQty: totalReceivedStockQty,
        unit: currentMaterial.unit || "AD",
        purQty: directPurQty,
        purUnit: activeBarcodeUnit || "AD",
        isSpecialLot: currentMaterial.isSpecialLot,
        batchNum: currentMaterial.isSpecialLot && lotNumber.trim() ? lotNumber.trim() : "*",
        expiryDate: expiryDate.trim() || undefined,
        dimensions: currentMaterial.dimensions,
      });
    }

    // Okutulanlar listesine ekle
    setReceivedItems((prev) => {
      let updated = [...prev];
      for (const it of newItems) {
        const idx = updated.findIndex(
          (x) =>
            x.material === it.material &&
            x.orderNum === it.orderNum &&
            x.itemNum === it.itemNum &&
            x.batchNum === it.batchNum
        );
        if (idx >= 0) {
          updated[idx] = {
            ...updated[idx],
            receivedQty: updated[idx].receivedQty + it.receivedQty,
            purQty: Number(((updated[idx].purQty || 0) + (it.purQty || 0)).toFixed(2)),
          };
        } else {
          updated = [it, ...updated];
        }
      }
      return updated;
    });

    sesBasarili();
    show({
      kind: "ok",
      text: activeBarcodeMultiplier > 1
        ? `${currentMaterial.name} (${receiptQty} ${activeBarcodeUnit} = ${totalReceivedStockQty} ${currentMaterial.unit || "AD"}) kabul edildi.`
        : `${currentMaterial.name} (${receiptQty} ${activeBarcodeUnit}) kabul edildi.`,
    });

    // 1. Aşamaya sıfırla (Yeni barkoda hazır ol)
    setBarcodeInput("");
    setIsProductScanned(false);
    setAreDimensionsDone(false);
    setActiveStep("product");
    setReceiptQty(0);
    setLotNumber("");
    setExpiryDate("");
    setLotError("");
  };

  // ---------------------------------------------------------------------------
  // MAL KABULÜ BİTİR (ÖZET EKRANINA YÖNLENDİRME)
  // ---------------------------------------------------------------------------
  const handleOpenSummary = () => {
    if (receivedItems.length === 0) {
      sesHata();
      show({ kind: "error", text: "Lütfen en az bir malzeme okutarak kabul ediniz." });
      return;
    }

    navigate(
      `/receiving/${encodeURIComponent(vendorCode)}/summary?waybill=${encodeURIComponent(
        waybillNo
      )}&targetWH=${encodeURIComponent(targetWH)}&targetSP=${encodeURIComponent(targetSP)}&vendor=${encodeURIComponent(
        vendorCode
      )}&vendorName=${encodeURIComponent(vendorName)}`,
      {
        state: {
          items: receivedItems,
          allocations: orderFulfillment.allocations,
          waybillNo,
          targetWarehouse: targetWH,
          targetStockPlace: targetSP,
          vendor: vendorCode,
          vendorName,
          currentMaterial,
          openOrders,
          areDimensionsDone,
          activeStep,
        },
      }
    );
  };

  return (
    <div className="mx-auto max-w-7xl p-2 sm:p-4 lg:p-6 animate-fade-in space-y-3 sm:space-y-4">
      {/* Üst Başlık ve Aksiyonlar */}
      <PageHeader
        title={`Mal Kabul: ${vendorName}`}
        subtitle={`İrsaliye: ${waybillNo || "—"} · Depo: ${targetWH || "—"}`}
        backTo="/receiving"
        right={
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Mal Kabulü Bitir Butonu */}
            <button
              type="button"
              onClick={handleOpenSummary}
              disabled={receivedItems.length === 0}
              className="flex items-center gap-1.5 sm:gap-2 rounded-xl bg-brand-600 px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-extrabold text-white shadow-md hover:bg-brand-700 active:scale-95 transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <Save className="h-4 w-4" /> Mal Kabulü Bitir
            </button>
          </div>
        }
      />

      {/* ANA GRID - 2 SÜTUNLU VE EŞİT YÜKSEKLİKLİ HİZALANMIŞ YAPI */}
      <div className="grid grid-cols-1 sm:grid-cols-12 md:grid-cols-12 landscape:grid-cols-12 gap-2.5 sm:gap-3 items-stretch">
        {/* ========================================================================= */}
        {/* 1. SATIR: SOL ANA KART & SAĞ MALZEME DETAY KARTI (TAM EŞİT ÜST VE ALT HİZA)*/}
        {/* ========================================================================= */}

        {/* SOL ANA KART: 1 MALZEME · 2 MİKTAR ADIMLARI */}
        <div
          className={`col-span-1 sm:col-span-5 md:col-span-4 lg:col-span-4 xl:col-span-4 landscape:col-span-4 rounded-3xl border border-line bg-surface p-3 sm:p-3.5 shadow-card flex flex-col justify-between space-y-2.5 min-w-0 h-full ${currentMaterial?.isSpecialLot
            ? "min-h-[290px] sm:min-h-[300px]"
            : "min-h-[205px] sm:min-h-[215px]"
            }`}
        >
          {/* Adım tab'ları — sipariş toplama/yerleştirme ile birebir aynı pill stili */}
          <div className="mb-3 flex items-center gap-1.5">
            {(
              [
                ["product", "Malzeme"],
                ["lot", "Parti"],
                ["quantity", "Miktar"],
              ] as const
            ).map(([s, label], i) => {
              const urunHazir = isProductScanned && areDimensionsDone;
              const partili = !!currentMaterial?.isSpecialLot;
              const active = activeStep === s;
              const done =
                (s === "product" && urunHazir) ||
                (s === "lot" && urunHazir && partili && !!lotNumber.trim());
              // Parti tabı sadece parti-takipli üründe tıklanabilir (aksi halde görünür ama pasif — picking gibi).
              const tiklanabilir =
                s === "product" ||
                (s === "lot" && urunHazir && partili) ||
                (s === "quantity" && urunHazir);
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    if (s === "product") setActiveStep("product");
                    else if (s === "lot" && urunHazir && partili) setActiveStep("lot");
                    else if (s === "quantity" && urunHazir) setActiveStep("quantity");
                  }}
                  disabled={!tiklanabilir}
                  className={`flex min-w-0 flex-1 items-center justify-center gap-1 truncate rounded-xl px-1.5 py-1.5 text-[11px] font-semibold transition-all duration-200 ease-soft ${
                    active
                      ? "bg-brand-600 text-white shadow-soft"
                      : done
                        ? "bg-emerald-100 text-emerald-700"
                        : tiklanabilir
                          ? "bg-elevated text-subtle hover:bg-elevated"
                          : "bg-elevated text-subtle/50 cursor-default"
                  }`}
                >
                  <span className="shrink-0 font-mono">{done && !active ? "✓" : i + 1}</span>
                  <span className="truncate">{label}</span>
                </button>
              );
            })}
          </div>

          {/* ------------------------------------------------------------------- */}
          {/* ADIM 1 GÖRÜNÜMÜ: MALZEME BARKODU OKUTMA */}
          {/* ------------------------------------------------------------------- */}
          {activeStep === "product" && (
            <div className="space-y-2 sm:space-y-2.5 animate-fade-in flex-1 flex flex-col justify-between">
              <div>
                <label className="text-xs font-extrabold text-fg block mb-1">
                  Malzeme Barkodunu Okutun
                </label>

                <div className="flex items-center gap-2">
                  <div className="relative flex-1 min-w-0">
                    <input
                      type="text"
                      value={barcodeInput}
                      onChange={(e) => setBarcodeInput(e.target.value.toUpperCase())}
                      onKeyDown={(e) => e.key === "Enter" && handleScanBarcode()}
                      placeholder="Malzeme barkodu okutun veya yazın..."
                      disabled={isQueryingBarcode}
                      className="field-input w-full pr-10 font-mono text-xs sm:text-sm font-bold tracking-wider h-10"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => handleScanBarcode()}
                      disabled={!barcodeInput.trim() || isQueryingBarcode}
                      className="absolute right-2 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-lg text-subtle hover:bg-elevated hover:text-fg disabled:opacity-30 transition"
                      title="Sorgula"
                    >
                      {isQueryingBarcode ? (
                        <Loader2 className="h-4 w-4 animate-spin text-brand-600" />
                      ) : (
                        <CornerDownLeft className="h-4 w-4" />
                      )}
                    </button>
                  </div>

                  {/* Kamera Aç/Kapat Butonu */}
                  <button
                    type="button"
                    onClick={() => (cameraOpen ? stopCamera() : startCamera())}
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition ${cameraOpen
                      ? "border-brand-600 bg-brand-600 text-white shadow-md"
                      : "border-line bg-elevated/60 text-subtle hover:bg-elevated hover:text-fg"
                      }`}
                    title="Kamera ile Barkod Tara"
                  >
                    {cameraOpen ? <X className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Inline Kamera Ekranı */}
              {cameraOpen && (
                <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-ink-950 border border-brand-500/40 shadow-inner animate-fade-in">
                  {!cameraError ? (
                    <>
                      <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                        <div className="relative h-44 w-52">
                          <span className="absolute left-0 top-0 h-5 w-5 rounded-tl-lg border-l-4 border-t-4 border-brand-400" />
                          <span className="absolute right-0 top-0 h-5 w-5 rounded-tr-lg border-r-4 border-t-4 border-brand-400" />
                          <span className="absolute bottom-0 left-0 h-5 w-5 rounded-bl-lg border-b-4 border-l-4 border-brand-400" />
                          <span className="absolute bottom-0 right-0 h-5 w-5 rounded-br-lg border-b-4 border-r-4 border-brand-400" />
                          <div className="absolute inset-x-2 top-2 h-0.5 animate-scan-line bg-brand-400 shadow-[0_0_12px_2px_rgba(16,185,129,0.8)]" />
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
          )}

          {/* ------------------------------------------------------------------- */}
          {/* ADIM 2 GÖRÜNÜMÜ: PARTİ & SKT (her malzemede görünür) */}
          {/* ------------------------------------------------------------------- */}
          {/* Parti adımı YALNIZCA parti-takipli malzemede içerik gösterir; normal üründe tab pasif kalır. */}
          {activeStep === "lot" && currentMaterial && currentMaterial.isSpecialLot && (
            <div className="space-y-2 animate-fade-in flex-1 flex flex-col justify-between">
              <div className="space-y-1.5 rounded-2xl border border-violet-500/30 bg-violet-500/10 p-2.5 text-xs">
                <div className="flex items-center gap-1.5 font-bold text-violet-800 dark:text-violet-200">
                  <Tag className="h-3.5 w-3.5" />
                  <span>Parti &amp; SKT Girişi (Zorunlu)</span>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-subtle block mb-0.5">Parti No (Lot) *</label>
                  <input
                    type="text"
                    value={lotNumber}
                    onChange={(e) => {
                      setLotNumber(e.target.value.toUpperCase());
                      if (lotError) setLotError("");
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && lotNumber.trim()) {
                        setLotError("");
                        setActiveStep("quantity");
                      }
                    }}
                    placeholder="Parti numarasını giriniz"
                    autoFocus
                    className={`field-input w-full font-mono text-xs font-bold h-9 py-0.5 ${lotError ? "border-red-500" : ""}`}
                  />
                  {lotError && <p className="text-[10px] text-red-500 mt-0.5 font-semibold">{lotError}</p>}
                </div>
                <div>
                  <label className="text-[10px] font-bold text-subtle block mb-0.5">Son Kullanma Tarihi (SKT)</label>
                  <input
                    type="date"
                    value={expiryDate}
                    onChange={(e) => {
                      setExpiryDate(e.target.value);
                      // Tarih seçilince Parti No'yu ters çevirip yaz (yyyy-mm-dd → YYYYMMDD) — toplamadaki gibi.
                      const parti = isoDateToBatch(e.target.value);
                      if (parti) {
                        setLotNumber(parti);
                        if (lotError) setLotError("");
                      }
                    }}
                    className="field-input w-full font-mono text-xs h-9 py-0.5"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (!lotNumber.trim()) {
                    sesHata();
                    setLotError("Bu malzeme partili olduğu için Parti No girilmesi zorunludur.");
                    return;
                  }
                  setLotError("");
                  setActiveStep("quantity");
                }}
                className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand-600 py-2.5 text-sm font-bold text-white shadow-md transition hover:bg-brand-700 active:scale-95"
              >
                Miktara Geç
              </button>
            </div>
          )}

          {/* ------------------------------------------------------------------- */}
          {/* ADIM 3 GÖRÜNÜMÜ: MİKTAR GİRİŞİ */}
          {/* ------------------------------------------------------------------- */}
          {activeStep === "quantity" && currentMaterial && (
            <div className="space-y-2 animate-fade-in flex-1 flex flex-col justify-between">
              {/* Miktar Stepper Girişi */}
              <div>
                <div className="mb-1">
                  <label className="text-xs font-bold text-fg block">
                    Kabul Edilecek Miktar ({activeBarcodeUnit}) <span className="text-red-500">*</span>
                  </label>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setReceiptQty((prev) => Math.max(0, prev - 1))}
                    className="flex h-10 w-10 items-center justify-center rounded-xl bg-elevated text-subtle hover:bg-line transition active:scale-95 shrink-0"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={receiptQty === 0 ? "" : receiptQty}
                    placeholder="0"
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (raw === "") {
                        setReceiptQty(0);
                        return;
                      }
                      const val = parseInt(raw, 10);
                      setReceiptQty(isNaN(val) ? 0 : Math.max(0, val));
                    }}
                    className="field-input flex-1 text-center font-mono text-base sm:text-lg font-extrabold text-brand-600 dark:text-brand-400 h-10 py-1"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setReceiptQty((prev) => prev + 1)}
                    className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white hover:bg-brand-700 transition active:scale-95 shadow-md shrink-0"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>

                {/* Hızlı Butonlar ve Bitir Butonu (Sıfırla, +5, +10, Bitir) */}
                <div className="grid grid-cols-4 gap-1.5 pt-1.5">
                  {/* 1. Sıfırla (Çöp Kutusu İkonu) */}
                  <button
                    type="button"
                    onClick={() => setReceiptQty(0)}
                    className="flex items-center justify-center rounded-xl border border-line bg-elevated/50 py-2 text-subtle hover:bg-red-500/20 hover:text-red-500 hover:border-red-500/30 transition active:scale-95 shadow-xs"
                    title="Miktarı Sıfırla (0)"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>

                  {/* 2. +5, 3. +10 */}
                  {[5, 10].map((inc) => (
                    <button
                      key={inc}
                      type="button"
                      onClick={() => setReceiptQty((prev) => prev + inc)}
                      className="rounded-xl border border-line bg-elevated/80 py-2 text-xs sm:text-sm font-black text-fg hover:bg-brand-600 hover:text-white hover:border-brand-600 transition active:scale-95 shadow-xs"
                    >
                      +{inc}
                    </button>
                  ))}

                  {/* 4. Kabul Et (En sağda) */}
                  <button
                    type="button"
                    onClick={handleCompleteItemReceipt}
                    disabled={!isProductScanned || !areDimensionsDone || receiptQty <= 0}
                    className="flex flex-col items-center justify-center rounded-xl bg-brand-600 py-1 text-[10px] sm:text-[11px] font-black leading-tight text-white shadow-md hover:bg-brand-700 active:scale-95 transition disabled:opacity-35 disabled:cursor-not-allowed"
                    title="Malzemeyi Kabul Et / Listeye Ekle"
                  >
                    <span>Kabul</span>
                    <span>Et</span>
                  </button>
                </div>
              </div>

              {/* Stok / Sipariş birimi canlı karşılığı (toplama emrindeki gibi) */}
              {(() => {
                const stockUnit = String(currentMaterial.unit || "AD").toUpperCase();
                const mult = activeBarcodeMultiplier || 1;
                const stockQty = Number((receiptQty * mult).toFixed(2));
                const al = orderFulfillment.allocations[0];
                const purUnit = al ? al.purUnit : stockUnit;
                const purFactor = al && al.factor > 0 ? al.factor : 1;
                const purQty = purFactor > 1 ? Number((stockQty / purFactor).toFixed(2)) : stockQty;
                const showPur = !!al && !!purUnit && purUnit !== stockUnit;
                const showBarcodeConv = mult > 1 && activeBarcodeUnit !== stockUnit;
                const entered = receiptQty > 0;
                // Aynı çevrim (ör. barkod birimi = sipariş birimi) iki kez yazılmasın diye Set ile tekilleştir.
                const chipSet = new Set<string>();
                if (showBarcodeConv) chipSet.add(`1 ${activeBarcodeUnit} = ${mult} ${stockUnit}`);
                if (showPur && purFactor > 1) chipSet.add(`1 ${purUnit} = ${purFactor} ${stockUnit}`);
                const chips = [...chipSet];
                if (!entered && chips.length === 0) return null;
                return (
                  <div className="space-y-1.5">
                    {/* Miktar karşılığı — okununca stok (+ sipariş) birimi */}
                    {entered && (
                      <div className="flex items-center justify-between gap-2 rounded-xl border border-line bg-surface px-3 py-2 shadow-xs">
                        <span className="text-[11px] font-semibold text-subtle">Karşılığı</span>
                        <div className="flex items-baseline gap-1.5 font-mono">
                          <span className="text-lg font-black text-brand-600 dark:text-brand-400">{stockQty}</span>
                          <span className="text-xs font-bold text-subtle">{stockUnit}</span>
                          {showPur && (
                            <span className="text-[13px] font-semibold text-subtle">= {purQty} {purUnit}</span>
                          )}
                        </div>
                      </div>
                    )}
                    {/* Çevrim rozeti — sipariş toplama ekranındaki amber pill ile birebir */}
                    {chips.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {chips.map((c, i) => (
                          <span
                            key={i}
                            className="rounded-lg bg-amber-100 px-2 py-1 font-mono text-[13px] font-bold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                          >
                            {c}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Parti/SKT girişi artık ayrı "Parti" adımında (yukarıdaki tab). */}
            </div>
          )}
        </div>

        {/* SAĞ ANA KART: MALZEME BİLGİ VE ÖLÇÜ KARTI */}
        <div
          className={`col-span-1 sm:col-span-7 md:col-span-8 lg:col-span-8 xl:col-span-8 landscape:col-span-8 rounded-3xl border border-line bg-surface pt-1.5 pb-1.5 px-3 sm:pt-1.5 sm:pb-2 sm:px-3.5 shadow-card flex flex-col justify-start min-w-0 h-full ${currentMaterial?.isSpecialLot
            ? "min-h-[290px] sm:min-h-[300px]"
            : "min-h-[205px] sm:min-h-[215px]"
            }`}
        >
          {currentMaterial ? (
            <div className="w-full flex-1 flex flex-col justify-start gap-1 sm:gap-1.5">
              {/* 1. Satır: En Üstte Malzeme İsmi */}
              <div className="flex items-center justify-between gap-2 border-b border-line/40 pt-0 pb-1 min-w-0">
                {/* Malzeme İsmi (Belirgin & Büyük) */}
                <h4 className="font-black text-fg text-[15px] sm:text-base leading-snug truncate flex-1 min-w-0 tracking-tight" title={currentMaterial.name}>
                  {currentMaterial.name}
                </h4>
              </div>

              {/* 3. Satır: Fotoğraf + 3D Şema + Sağ Bilgi & Barkod Paneli */}
              <div className="flex-1 flex items-stretch gap-0 w-full min-w-0 pt-0.5 pb-0 min-h-0">
                {/* 1. Bölüm: Solda Ürün Görseli ve Altında Ürün Kodu */}
                <div className="flex flex-col items-center shrink-0 mr-1.5 self-start w-24 sm:w-26 min-w-0">
                  {/* Ürün Görseli (Boyutu ve konumu aynı kalır) */}
                  <div className="h-24 w-24 sm:h-26 sm:w-26 rounded-2xl overflow-hidden shrink-0 border border-line bg-elevated/40 flex items-center justify-center shadow-xs">
                    {currentMaterial.image ? (
                      <img
                        src={currentMaterial.image}
                        alt={currentMaterial.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center text-subtle/70 gap-1 p-1 text-center">
                        <ImageIcon className="h-5 w-5 text-subtle/50" />
                        <span className="text-[8px] font-bold">Fotoğraf Yok</span>
                      </div>
                    )}
                  </div>

                  {/* Resmin Altındaki Ürün Kodu (Kartsız, yalın metin) */}
                  <span
                    className="mt-1 w-full text-center font-mono font-bold text-[11px] sm:text-xs text-fg truncate select-all"
                    title={currentMaterial.material}
                  >
                    {currentMaterial.material}
                  </span>
                </div>

                {/* Çizgi 1: Resim ile 3D Model Arasındaki Ayırıcı Çizgi */}
                <div className="h-full min-h-[96px] w-px bg-line shrink-0 self-stretch mr-1" />

                {/* 2. Bölüm: 3D Şema */}
                <div className="shrink-0 flex items-start justify-start overflow-visible self-start">
                  {currentMaterial.dimensions && currentMaterial.dimensions.width > 0 ? (
                    <div className="relative flex flex-col items-center">
                      <Dimension3DBoxVisual
                        width={currentMaterial.dimensions.width}
                        length={currentMaterial.dimensions.length}
                        height={currentMaterial.dimensions.height}
                        unit="CM"
                        compact={true}
                      />
                      {/* Ölçüm Değiştir Butonu: En / CM Yazısının Sağına Tek Satır */}
                      <button
                        type="button"
                        onClick={handleOpenDimensionModal}
                        className="absolute left-[88px] bottom-[3px] inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-brand-500/15 hover:bg-brand-500/25 text-brand-700 dark:text-brand-300 border border-brand-500/30 transition cursor-pointer font-sans text-[9px] font-black shadow-2xs active:scale-95 group leading-none z-10 whitespace-nowrap"
                        title="Ölçü ve Boyutları Değiştir (CANIAS'a Kaydeder)"
                      >
                        <span>Ölçüm Değiştir</span>
                        <Pencil className="h-2 w-2 text-brand-600 dark:text-brand-400 group-hover:rotate-12 transition-transform shrink-0" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center text-center p-1.5 gap-1 text-subtle/70 my-auto ml-2">
                      <Ruler className="h-4 w-4 text-amber-500/60" />
                      <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                        Ölçü tanımlanmamış
                      </span>
                      <button
                        type="button"
                        onClick={handleOpenDimensionModal}
                        className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-brand-500/15 hover:bg-brand-500/25 text-brand-700 dark:text-brand-300 border border-brand-500/30 transition cursor-pointer font-sans text-[9.5px] font-black shadow-2xs active:scale-95 group leading-none"
                        title="Ölçü Ekle"
                      >
                        <span>Ölçüm Ekle</span>
                        <Pencil className="h-2.5 w-2.5 text-brand-600 dark:text-brand-400 shrink-0" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Çizgi 2: Boy Yazısının Sağındaki Ayırıcı Çizgi */}
                <div className="h-full min-h-[96px] w-px bg-line shrink-0 self-stretch ml-1.5 mr-2" />

                {/* 3. Bölüm: Sağ Bilgi & Barkod Paneli (Kartın En Altına Kadar Uzanır) */}
                <div className="flex-1 min-w-0 flex flex-col justify-between h-full min-h-0">
                  {/* Üst Kısım: 2x2 Simetrik Grid (Ürün, Net, Hacim, Brüt) */}
                  <div className="grid grid-cols-2 gap-x-2.5 gap-y-1 text-xs sm:text-[12px] leading-tight">
                    {/* Sol Üst: Eski Ürün yerine Stok Birimi (SKUNIT) */}
                    <div className="flex items-center gap-1 min-w-0">
                      <span className="text-subtle font-bold text-[11px] sm:text-[11.5px] shrink-0">Stok Birimi:</span>
                      <span className="font-mono font-black text-fg text-xs sm:text-[12.5px] truncate">
                        {currentMaterial.unit || "AD"}
                      </span>
                    </div>

                    {/* Sağ Üst: Net (Parti Yerine) */}
                    <div className="flex items-center gap-1 min-w-0">
                      <span className="text-subtle font-bold text-[11px] sm:text-[11.5px] shrink-0">Net:</span>
                      <span className="font-mono font-black text-fg text-xs sm:text-[12.5px] truncate">
                        {currentMaterial.dimensions?.netWeight ?? 0} {currentMaterial.dimensions?.netWeightUnit || "KG"}
                      </span>
                    </div>

                    {/* Sol Alt: Desi (DS) */}
                    <div className="flex items-center gap-1 min-w-0">
                      <span className="text-subtle font-bold text-[11px] sm:text-[11.5px] shrink-0">Desi:</span>
                      <span className="font-mono font-black text-fg text-xs sm:text-[12.5px] truncate">
                        {currentMaterial.dimensions?.volume && currentMaterial.dimensions.volume > 0
                          ? currentMaterial.dimensions.volume
                          : Number(
                            ((currentMaterial.dimensions?.width || 0) *
                              (currentMaterial.dimensions?.length || 0) *
                              (currentMaterial.dimensions?.height || 0)) /
                            3000
                          ).toFixed(2)}{" "}
                        DS
                      </span>
                    </div>

                    {/* Sağ Alt: Brüt */}
                    <div className="flex items-center gap-1 min-w-0">
                      <span className="text-subtle font-bold text-[11px] sm:text-[11.5px] shrink-0">Brüt:</span>
                      <span className="font-mono font-black text-fg text-xs sm:text-[12.5px] truncate">
                        {currentMaterial.dimensions?.brutWeight ?? 0} {currentMaterial.dimensions?.brutWeightUnit || "KG"}
                      </span>
                    </div>
                  </div>

                  {/* Orta Kısım: Öz Nitelikler (Hacim & Brüt'ün Altı, Barkodun Üstü - İkonsuz, Sadece Yazı 3'lü Kolon) */}
                  {activeSpecialAttrs.length > 0 && (
                    <div className="grid grid-cols-3 gap-1 my-1 pt-1 border-t border-line/40">
                      {activeSpecialAttrs.map((attr) => (
                        <span
                          key={attr.id}
                          className={`inline-flex items-center justify-center px-1 py-0.5 leading-tight tracking-tight shadow-2xs truncate select-none text-center ${attr.colorClass}`}
                          title={attr.label}
                        >
                          <span className="truncate">{attr.label}</span>
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Alt Kısım: Barcode Combobox / Select (Kartın En Alt Kenarında, Barkod Kelimesi Olmadan) */}
                  <div className="w-full mt-auto pt-1.5 pb-0.5 border-t border-line/40 flex items-center justify-start">
                    <div className="relative inline-flex items-center w-auto max-w-full">
                      <select
                        value={currentMaterial.selectedBarcode}
                        onChange={(e) =>
                          setCurrentMaterial((prev) =>
                            prev ? { ...prev, selectedBarcode: e.target.value } : prev
                          )
                        }
                        className="text-[10px] sm:text-[10.5px] font-mono font-black py-0 pl-1.5 pr-5 h-5.5 sm:h-6 rounded-md border border-line bg-surface text-fg shadow-2xs cursor-pointer focus:outline-none focus:border-brand-500 appearance-none w-auto tracking-wide shrink-0 leading-none"
                        title="Barkod Seçimi"
                      >
                        {currentMaterial.barcodes.map((b) => {
                          const u = (b.unit || "").toUpperCase();
                          return (
                            <option key={b.barcode} value={b.barcode}>
                              {b.barcode} ({u || "AD"})
                            </option>
                          );
                        })}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-1 h-2.5 w-2.5 text-subtle" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 min-h-[140px] text-center text-subtle text-xs flex flex-col items-center justify-center gap-2">
              <Package className="h-7 w-7 text-subtle/40" />
              <span className="font-medium">Barkod okutulduğunda malzeme detayları burada görüntülenecektir.</span>
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* 2. SATIR: SOLDA OKUTULANLAR BARI & SAĞDA AÇIK SİPARİŞLER KARTLARI         */}
        {/* ========================================================================= */}

        {/* SOL ALT: KABUL EDİLENLER BARI */}
        <div className="col-span-1 sm:col-span-5 md:col-span-4 lg:col-span-4 xl:col-span-4 landscape:col-span-4 self-start">
          <div className="rounded-2xl border border-line bg-surface p-2.5 sm:p-3 shadow-xs hover:border-brand-500/40 transition flex items-center min-h-[66px] sm:min-h-[68px]">
            <button
              type="button"
              onClick={() =>
                navigate(
                  `/receiving/${encodeURIComponent(vendorCode)}/kayitlar?waybill=${encodeURIComponent(
                    waybillNo
                  )}&targetWH=${encodeURIComponent(targetWH)}&targetSP=${encodeURIComponent(targetSP)}&vendor=${encodeURIComponent(
                    vendorName
                  )}`,
                  {
                    state: {
                      items: receivedItems,
                      waybillNo,
                      targetWarehouse: targetWH,
                      targetStockPlace: targetSP,
                      vendor: vendorCode,
                      vendorName,
                      currentMaterial,
                      openOrders,
                      areDimensionsDone,
                      activeStep,
                    },
                  }
                )
              }
              className="flex w-full items-center justify-between text-xs font-bold text-brand-600 dark:text-brand-400 hover:underline cursor-pointer"
            >
              <span>Kabul edilenler ({receivedItems.length})</span>
              <span aria-hidden>→</span>
            </button>
          </div>
        </div>

        {/* SAĞ ALT: AÇIK SİPARİŞ KARTLARI (Varsa) */}
        <div className="col-span-1 sm:col-span-7 md:col-span-8 lg:col-span-8 xl:col-span-8 landscape:col-span-8">
          {openOrders.length > 0 && (
            <div className="space-y-1.5 max-h-[32vh] overflow-y-auto pr-0.5 animate-fade-in">
              {orderFulfillment.allocations.map((al, idx) => {
                const orderType = getOrderType(al.order);

                return (
                  <div
                    key={`${al.orderNum}-${al.itemNum}-${idx}`}
                    className={`rounded-2xl border p-3 transition-all shadow-xs ${al.isFullyAllocated
                      ? "border-brand-500/60 bg-brand-500/10"
                      : al.isPartiallyAllocated
                        ? "border-amber-500/60 bg-amber-500/10"
                        : "border-line bg-surface"
                      }`}
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      {/* Sol: kalan (sipariş birimi) daire rozeti — tamamlandıysa ✓ */}
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${al.isFullyAllocated
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
                          : al.isPartiallyAllocated
                            ? "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300"
                            : "bg-elevated text-subtle"
                          }`}
                      >
                        {al.isFullyAllocated ? (
                          <Check className="h-4 w-4" />
                        ) : (
                          <span className="font-mono text-sm font-black">{Math.round(al.remPurQty)}</span>
                        )}
                      </div>

                      {/* Orta: Belge No (kalın) + meta satırı (Kalem · Tarih · Çevrim) */}
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 text-sm font-bold text-fg">
                          <span className="text-[11px] font-extrabold text-subtle">{orderType}</span>
                          <span className="font-mono truncate">{al.orderNum}</span>
                        </p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[11px] text-subtle">
                          <span>Kalem: <strong className="font-black text-fg">{al.itemNum}</strong></span>
                          {al.purUnit !== al.stockUnit && (
                            <span>1 {al.purUnit} = {al.factor} {al.stockUnit}</span>
                          )}
                        </div>
                      </div>

                      {/* Sağ: stok birimi (büyük) / toplam, altında sipariş birimi (küçük) */}
                      <div className="flex shrink-0 flex-col items-end">
                        <div className="flex items-baseline gap-1 font-mono">
                          <span className="text-lg font-black text-fg">{al.fulfilledStockQty}</span>
                          <span className="text-sm text-subtle">/ {al.totalStockQty}</span>
                          <span className="text-xs font-bold text-subtle">{al.stockUnit}</span>
                        </div>
                        {al.purUnit !== al.stockUnit && (
                          <div className="mt-0.5 font-mono text-[11px] text-subtle">
                            {Math.round(al.fulfilledPurQty)}/{Math.round(al.totalPurQty)} {al.purUnit}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>





      <ToastView toast={toast} />
    </div>
  );
}
