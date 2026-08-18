import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useParams, useSearchParams, useLocation } from "react-router-dom";
import {
  Barcode,
  Package,
  Plus,
  Minus,
  CheckCircle2,
  Loader2,
  Tag,
  Ruler,
  Save,
  Camera,
  CornerDownLeft,
  X,
  AlertCircle,
  Check,
  Calendar,
  Layers,
  ArrowRight,
  List,
  ExternalLink,
} from "lucide-react";
import PageHeader from "../../components/PageHeader";
import ToastView, { useToast } from "../../components/Toast";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { api } from "../../api/client";
import { sesBasarili, sesHata } from "../../sound";

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
  dimensions?: {
    width: number;
    length: number;
    height: number;
    volume: number;
    netWeight: number;
    brutWeight: number;
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
  const targetWH = searchParams.get("targetWH") || location.state?.targetWarehouse || "";

  const storageKey = `mzy_receiving_items_${vendorCode || id}_${waybillNo || "active"}`;

  // Toast bildirimleri
  const { toast, show } = useToast();

  // ---------------------------------------------------------------------------
  // 3 AŞAMALI (1 ÜRÜN · 2 ÖLÇÜ · 3 ADET) ADIM VE DURUM YÖNETİMİ
  // ---------------------------------------------------------------------------
  const [activeStep, setActiveStep] = useState<"product" | "dimensions" | "quantity">("product");
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
    dimensions?: {
      width: number;
      length: number;
      height: number;
      volume: number;
      netWeight: number;
      brutWeight: number;
    };
  } | null>(null);

  // 2. Adım: Ölçü Formu State'leri
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

  // 3. Adım: Adet, Parti & SKT State'leri
  const [receiptQty, setReceiptQty] = useState<number>(0);
  const [lotNumber, setLotNumber] = useState<string>("");
  const [expiryDate, setExpiryDate] = useState<string>("");
  const [lotError, setLotError] = useState<string>("");

  // Açık Siparişler (FIFO Sıralı)
  const [openOrders, setOpenOrders] = useState<Record<string, unknown>[]>([]);

  // Okutulanlar Listesi
  const [receivedItems, setReceivedItems] = useState<ReceivedItem[]>(() => {
    try {
      const stateItems = location.state?.items as ReceivedItem[] | undefined;
      if (stateItems && stateItems.length > 0) return stateItems;
      const raw = localStorage.getItem(storageKey);
      return raw ? JSON.parse(raw) : [];
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

  // Mal Kabulü Kaydetme ve Onay Modal State'leri
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [isSavingReceipt, setIsSavingReceipt] = useState(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);

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
            ["VOLUME", "HACIM", "PVOLUME", "VOL", "HACMI", "M3"],
            /^(p_?)?(volume|hacim|vol)$/i
          ) || (pwidth > 0 && plength > 0 && pheight > 0 ? Number(((pwidth * plength * pheight) / 1000000).toFixed(4)) : 0);

        const parsedMatSize = {
          pwidth,
          plength,
          pheight,
          lunit: String(matSizeRow.LUNIT || matSizeRow.PUNIT || nestedSizeRow.LUNIT || nestedSizeRow.PUNIT || "CM"),
          volume,
          vunit: String(matSizeRow.VUNIT || nestedSizeRow.VUNIT || "M3"),
          netweight,
          nwunit: String(matSizeRow.NWUNIT || nestedSizeRow.NWUNIT || "KG"),
          brutweight,
          bwunit: String(matSizeRow.BWUNIT || nestedSizeRow.BWUNIT || "KG"),
          isexplos: Number(matSizeRow.ISEXPLOS ?? nestedSizeRow.ISEXPLOS) === 1,
          isspoil: Number(matSizeRow.ISSPOIL ?? nestedSizeRow.ISSPOIL) === 1,
          aklisbreakable: Number(matSizeRow.AKLISBREAKABLE ?? nestedSizeRow.AKLISBREAKABLE) === 1,
          aklisliquid: Number(matSizeRow.AKLISLIQUID ?? nestedSizeRow.AKLISLIQUID) === 1,
          aklistoxic: Number(matSizeRow.AKLISTOXIC ?? nestedSizeRow.AKLISTOXIC) === 1,
          aklpalpos: Number(matSizeRow.AKLPALPOS ?? nestedSizeRow.AKLPALPOS) || 1,
        };

        setMatSizeForm(parsedMatSize);

        // 2. MZYGetOpenOrder ile açık siparişleri getir ve FIFO sırala (Eskiden Yeniye)
        const orderRes = await api.getOpenOrders({
          barcode: targetBarcode,
          vendor: vendorCode,
        });
        const rawOrders = (orderRes.orders || []) as Record<string, unknown>[];

        const sortedOrders = [...rawOrders].sort((a, b) => {
          const dateA = getOrderDate(a) || getOrderNum(a, 0);
          const dateB = getOrderDate(b) || getOrderNum(b, 0);
          return dateA.localeCompare(dateB);
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

        setCurrentMaterial({
          material: matCode,
          name: matName,
          image: matImage,
          unit: matUnit,
          isSpecialLot,
          dimensions: {
            width: pwidth,
            length: plength,
            height: pheight,
            volume,
            netWeight: netweight,
            brutWeight: brutweight,
          },
        });

        setIsProductScanned(true);

        if (!hasAllDimensions) {
          // Ölçüler eksik -> 2. yere atar (2 Ölçü)
          setAreDimensionsDone(false);
          setActiveStep("dimensions");
          sesBasarili();
          show({
            kind: "ok",
            text: `${matName} okundu. Lütfen eksik ölçü bilgilerini giriniz.`,
          });
        } else {
          // Bütün ölçü değerleri var -> 2. yer de 1. yer gibi yeşil olur ve 3. Adet kısmına atar!
          setAreDimensionsDone(true);
          setActiveStep("quantity");
          sesBasarili();
          show({
            kind: "ok",
            text: `${matName} okundu. Ölçü bilgileri tam. Lütfen kabul adedini giriniz.`,
          });
        }
      } catch (err: unknown) {
        sesHata();
        show({
          kind: "error",
          text: err instanceof Error ? err.message : "Ürün bilgileri CANIAS üzerinden alınamadı.",
        });
      } finally {
        setIsQueryingBarcode(false);
      }
    },
    [barcodeInput, vendorCode, show]
  );

  // ---------------------------------------------------------------------------
  // 2. ADIM: ÖLÇÜ BİLGİLERİNİ KAYDETME VE SAĞDAKİ KARTA YANSITMA
  // ---------------------------------------------------------------------------
  const handleSaveDimensions = async () => {
    if (!currentMaterial) return;

    if (
      matSizeForm.pwidth <= 0 ||
      matSizeForm.plength <= 0 ||
      matSizeForm.pheight <= 0 ||
      matSizeForm.netweight <= 0 ||
      matSizeForm.brutweight <= 0
    ) {
      sesHata();
      show({
        kind: "error",
        text: "Lütfen En, Boy, Yükseklik, Net Ağırlık ve Brüt Ağırlık alanlarını 0'dan büyük giriniz.",
      });
      return;
    }

    setIsSavingMatSize(true);
    try {
      const autoVol =
        matSizeForm.volume > 0
          ? matSizeForm.volume
          : Number(((matSizeForm.pwidth * matSizeForm.plength * matSizeForm.pheight) / 1000000).toFixed(4));

      await api.setMatSize({
        material: currentMaterial.material,
        pwidth: matSizeForm.pwidth,
        plength: matSizeForm.plength,
        pheight: matSizeForm.pheight,
        volume: autoVol,
        vunit: matSizeForm.vunit || "M3",
        netweight: matSizeForm.netweight,
        nwunit: matSizeForm.nwunit || "KG",
        brutweight: matSizeForm.brutweight,
        bwunit: matSizeForm.bwunit || "KG",
        isexplos: matSizeForm.isexplos ? 1 : 0,
        isspoil: matSizeForm.isspoil ? 1 : 0,
        aklisbreakable: matSizeForm.aklisbreakable ? 1 : 0,
        aklisliquid: matSizeForm.aklisliquid ? 1 : 0,
        aklistoxic: matSizeForm.aklistoxic ? 1 : 0,
        aklpalpos: matSizeForm.aklpalpos || 1,
      });

      // Sağdaki Ürün Bilgi Kartına anında kaydet/yansıt
      setCurrentMaterial((prev) =>
        prev
          ? {
            ...prev,
            dimensions: {
              width: matSizeForm.pwidth,
              length: matSizeForm.plength,
              height: matSizeForm.pheight,
              volume: autoVol,
              netWeight: matSizeForm.netweight,
              brutWeight: matSizeForm.brutweight,
            },
          }
          : prev
      );

      setAreDimensionsDone(true);
      setActiveStep("quantity");
      sesBasarili();
      show({
        kind: "ok",
        text: "Ölçü bilgileri başarıyla kaydedildi. Kabul adedini giriniz.",
      });
    } catch (err: unknown) {
      sesHata();
      show({
        kind: "error",
        text: err instanceof Error ? err.message : "Ölçü bilgileri kaydedilemedi.",
      });
    } finally {
      setIsSavingMatSize(false);
    }
  };

  // ---------------------------------------------------------------------------
  // FIFO OTOMATİK MİKTAR DAĞITIMI VE SİPARİŞ KARŞILAMA HESAPLAYICISI
  // ---------------------------------------------------------------------------
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
        isFullyAllocated: alloc >= remainingQty,
        isPartiallyAllocated: alloc > 0 && alloc < remainingQty,
      });
    });

    return {
      allocations: allocatedOrders,
      excessQuantity: remainingToDistribute, // Açık siparişleri aşan serbest miktar
    };
  }, [openOrders, receiptQty]);

  // ---------------------------------------------------------------------------
  // 3. ADIM: ADET GİRİŞİ TAMAMLAMA VE OKUTULANLARA KAYDETME
  // ---------------------------------------------------------------------------
  const handleCompleteItemReceipt = () => {
    if (!currentMaterial) return;

    if (receiptQty <= 0) {
      sesHata();
      show({ kind: "error", text: "Lütfen 0'dan büyük bir kabul adedi giriniz." });
      return;
    }

    if (currentMaterial.isSpecialLot && !lotNumber.trim()) {
      sesHata();
      setLotError("Bu malzeme partili olduğu için Parti No girilmesi zorunludur.");
      show({ kind: "error", text: "Lütfen Parti Numarasını giriniz." });
      return;
    }

    const newItems: ReceivedItem[] = [];
    const { allocations, excessQuantity } = fifoAllocation;

    if (allocations.length > 0) {
      allocations.forEach((al) => {
        if (al.allocatedQty > 0) {
          newItems.push({
            id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            material: currentMaterial.material,
            name: currentMaterial.name,
            image: currentMaterial.image,
            orderNum: al.orderNum,
            itemNum: al.itemNum,
            expectedQty: al.remainingQty,
            receivedQty: al.allocatedQty,
            unit: currentMaterial.unit,
            isSpecialLot: currentMaterial.isSpecialLot,
            batchNum: lotNumber.trim() || undefined,
            expiryDate: expiryDate.trim() || undefined,
            dimensions: currentMaterial.dimensions,
          });
        }
      });

      // Eğer siparişleri aşan fazla miktar varsa onu da ekle
      if (excessQuantity > 0) {
        newItems.push({
          id: `item-excess-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          material: currentMaterial.material,
          name: currentMaterial.name,
          image: currentMaterial.image,
          orderNum: allocations[0]?.orderNum || "SERBEST",
          itemNum: allocations[0]?.itemNum || 1,
          expectedQty: excessQuantity,
          receivedQty: excessQuantity,
          unit: currentMaterial.unit,
          isSpecialLot: currentMaterial.isSpecialLot,
          batchNum: lotNumber.trim() || undefined,
          expiryDate: expiryDate.trim() || undefined,
          dimensions: currentMaterial.dimensions,
        });
      }
    } else {
      // Açık sipariş yoksa doğrudan serbest kabul olarak ekle
      newItems.push({
        id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        material: currentMaterial.material,
        name: currentMaterial.name,
        image: currentMaterial.image,
        orderNum: "SERBEST",
        itemNum: 1,
        expectedQty: receiptQty,
        receivedQty: receiptQty,
        unit: currentMaterial.unit,
        isSpecialLot: currentMaterial.isSpecialLot,
        batchNum: lotNumber.trim() || undefined,
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
      text: `${currentMaterial.name} (${receiptQty} ${currentMaterial.unit}) mal kabul listesine eklendi.`,
    });

    // 1. Aşamaya sıfırla (Yeni barkoda hazır ol)
    setBarcodeInput("");
    setIsProductScanned(false);
    setAreDimensionsDone(false);
    setActiveStep("product");
    setReceiptQty(1);
    setLotNumber("");
    setExpiryDate("");
    setLotError("");
  };

  // ---------------------------------------------------------------------------
  // MAL KABULÜ BİTİR (MZYSAVEINVPURORDER)
  // ---------------------------------------------------------------------------
  const handleSaveReceipt = async () => {
    if (receivedItems.length === 0) {
      sesHata();
      show({ kind: "error", text: "Lütfen en az bir ürün okutarak kabul ediniz." });
      return;
    }

    setIsSavingReceipt(true);
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
        targetWarehouse: targetWH,
        items: itemsPayload,
      });

      if (!res.ok) {
        sesHata();
        show({ kind: "error", text: res.message || "Mal kabul kaydedilemedi." });
        return;
      }

      sesBasarili();
      setSaveSuccessMessage(
        res.message || `${receivedItems.length} kalem ürünün mal kabulü başarıyla tamamlandı.`
      );

      // LocalStorage temizle
      localStorage.removeItem(storageKey);

      setTimeout(() => {
        navigate("/receiving");
      }, 2000);
    } catch (err: unknown) {
      sesHata();
      show({
        kind: "error",
        text: err instanceof Error ? err.message : "Kayıt sırasında hata oluştu.",
      });
    } finally {
      setIsSavingReceipt(false);
    }
  };

  const totalReceivedQty = receivedItems.reduce((sum, it) => sum + it.receivedQty, 0);

  return (
    <div className="mx-auto max-w-7xl p-3.5 sm:p-6 lg:p-8 animate-fade-in space-y-6">
      {/* Üst Başlık ve Aksiyonlar */}
      <PageHeader
        title={`Mal Kabul: ${vendorName}`}
        subtitle={`İrsaliye: ${waybillNo || "—"} · Depo: ${targetWH || "—"}`}
        backTo="/receiving"
        right={
          <div className="flex items-center gap-3">
            <span className="chip bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 font-mono text-xs sm:text-sm px-3.5 py-1.5 font-extrabold border border-emerald-500/20 shadow-sm">
              {receivedItems.length} Kalem Okutuldu
            </span>

            {/* Mal Kabulü Bitir Butonu */}
            <button
              type="button"
              onClick={() => setIsConfirmModalOpen(true)}
              disabled={receivedItems.length === 0 || isSavingReceipt}
              className="flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2 text-xs sm:text-sm font-extrabold text-white shadow-md hover:bg-emerald-700 active:scale-95 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isSavingReceipt ? (
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

      {/* Başarı Bildirimi */}
      {saveSuccessMessage && (
        <div className="flex items-center gap-2.5 rounded-2xl border border-emerald-500 bg-emerald-500/20 p-4 text-xs font-bold text-emerald-800 dark:text-emerald-200 animate-slide-up">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
          <span>{saveSuccessMessage} Yönlendiriliyor...</span>
        </div>
      )}

      {/* ANA İKİ SÜTUNLU YAPI */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* ========================================================================= */}
        {/* SOL SÜTUN: 3 AŞAMALI KART (1 ÜRÜN · 2 ÖLÇÜ · 3 ADET) + OKUTULANLAR KARTI */}
        {/* ========================================================================= */}
        <div className="lg:col-span-5 xl:col-span-5 space-y-4">
          <div className="rounded-3xl border border-line bg-surface p-5 shadow-card space-y-4">
            {/* 3 Aşamalı Adım Hapları (1 Ürün · 2 Ölçü · 3 Adet) */}
            <div className="flex items-center gap-1.5">
              {(
                [
                  ["product", "1 Ürün"],
                  ["dimensions", "2 Ölçü"],
                  ["quantity", "3 Adet"],
                ] as const
              ).map(([stepKey, label]) => {
                const isActive = activeStep === stepKey;
                const isDone =
                  (stepKey === "product" && isProductScanned) ||
                  (stepKey === "dimensions" && areDimensionsDone);

                const isClickable =
                  (stepKey === "product") ||
                  (stepKey === "dimensions" && isProductScanned) ||
                  (stepKey === "quantity" && isProductScanned && areDimensionsDone);

                return (
                  <button
                    key={stepKey}
                    type="button"
                    onClick={() => isClickable && setActiveStep(stepKey)}
                    disabled={!isClickable}
                    className={`flex min-w-0 flex-1 items-center justify-center gap-1.5 truncate rounded-xl px-2 py-2 text-xs font-bold transition-all duration-200 ${isActive
                        ? "bg-emerald-600 text-white shadow-soft"
                        : isDone
                          ? "bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300"
                          : isClickable
                            ? "bg-elevated hover:bg-line text-fg"
                            : "bg-elevated/40 text-subtle/60 cursor-not-allowed"
                      }`}
                  >
                    <span className="shrink-0 font-mono">{isDone ? "✓" : ""}</span>
                    <span className="truncate">{label}</span>
                  </button>
                );
              })}
            </div>

            {/* ------------------------------------------------------------------- */}
            {/* ADIM 1 GÖRÜNÜMÜ: ÜRÜN BARKODU OKUTMA */}
            {/* ------------------------------------------------------------------- */}
            {activeStep === "product" && (
              <div className="space-y-3.5 animate-fade-in">
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
                      onKeyDown={(e) => e.key === "Enter" && handleScanBarcode()}
                      placeholder="Barkod okutun veya yazın..."
                      disabled={isQueryingBarcode}
                      className="field-input w-full pr-10 font-mono text-xs font-bold tracking-wider"
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
                        <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
                      ) : (
                        <CornerDownLeft className="h-4 w-4" />
                      )}
                    </button>
                  </div>

                  {/* Kamera Aç/Kapat Butonu */}
                  <button
                    type="button"
                    onClick={() => (cameraOpen ? stopCamera() : startCamera())}
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border transition ${cameraOpen
                        ? "border-emerald-600 bg-emerald-600 text-white shadow-md"
                        : "border-line bg-elevated/60 text-subtle hover:bg-elevated hover:text-fg"
                      }`}
                    title="Kamera ile Barkod Tara"
                  >
                    {cameraOpen ? <X className="h-5 w-5" /> : <Camera className="h-5 w-5" />}
                  </button>
                </div>

                {/* Inline Kamera Ekranı */}
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
            )}

            {/* ------------------------------------------------------------------- */}
            {/* ADIM 2 GÖRÜNÜMÜ: ÖLÇÜ GİRİŞİ FORMU */}
            {/* ------------------------------------------------------------------- */}
            {activeStep === "dimensions" && currentMaterial && (
              <div className="space-y-3.5 animate-fade-in">
                <div className="flex items-center justify-between pb-2 border-b border-line">
                  <span className="text-xs font-bold text-fg flex items-center gap-1.5">
                    <Ruler className="h-4 w-4 text-amber-500" /> Ölçü ve Ağırlık Girişi
                  </span>
                  <span className="chip bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 text-[10px] font-bold">
                    Zorunlu Alanlar
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2.5 text-xs">
                  <div>
                    <label className="text-[11px] font-bold text-subtle block mb-1">En (cm) *</label>
                    <input
                      type="number"
                      step="any"
                      min={0}
                      value={matSizeForm.pwidth || ""}
                      onChange={(e) => setMatSizeForm({ ...matSizeForm, pwidth: parseNum(e.target.value) })}
                      placeholder="0"
                      className="field-input w-full font-mono text-center text-xs font-bold"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-subtle block mb-1">Boy (cm) *</label>
                    <input
                      type="number"
                      step="any"
                      min={0}
                      value={matSizeForm.plength || ""}
                      onChange={(e) => setMatSizeForm({ ...matSizeForm, plength: parseNum(e.target.value) })}
                      placeholder="0"
                      className="field-input w-full font-mono text-center text-xs font-bold"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-subtle block mb-1">Yükseklik (cm) *</label>
                    <input
                      type="number"
                      step="any"
                      min={0}
                      value={matSizeForm.pheight || ""}
                      onChange={(e) => setMatSizeForm({ ...matSizeForm, pheight: parseNum(e.target.value) })}
                      placeholder="0"
                      className="field-input w-full font-mono text-center text-xs font-bold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5 text-xs">
                  <div>
                    <label className="text-[11px] font-bold text-subtle block mb-1">Net Ağırlık (kg) *</label>
                    <input
                      type="number"
                      step="any"
                      min={0}
                      value={matSizeForm.netweight || ""}
                      onChange={(e) => setMatSizeForm({ ...matSizeForm, netweight: parseNum(e.target.value) })}
                      placeholder="0"
                      className="field-input w-full font-mono text-center text-xs font-bold"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-subtle block mb-1">Brüt Ağırlık (kg) *</label>
                    <input
                      type="number"
                      step="any"
                      min={0}
                      value={matSizeForm.brutweight || ""}
                      onChange={(e) => setMatSizeForm({ ...matSizeForm, brutweight: parseNum(e.target.value) })}
                      placeholder="0"
                      className="field-input w-full font-mono text-center text-xs font-bold"
                    />
                  </div>
                </div>

                {/* Güvenlik & Taşıma Nitelikleri */}
                <div className="pt-2 border-t border-line space-y-1.5">
                  <span className="text-[11px] font-bold text-subtle block">Özel Nitelikler:</span>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <label className="flex items-center gap-2 p-1.5 rounded-lg border border-line hover:bg-elevated cursor-pointer">
                      <input
                        type="checkbox"
                        checked={matSizeForm.aklisbreakable}
                        onChange={(e) => setMatSizeForm({ ...matSizeForm, aklisbreakable: e.target.checked })}
                        className="rounded text-emerald-600"
                      />
                      <span>Kırılabilir</span>
                    </label>
                    <label className="flex items-center gap-2 p-1.5 rounded-lg border border-line hover:bg-elevated cursor-pointer">
                      <input
                        type="checkbox"
                        checked={matSizeForm.aklisliquid}
                        onChange={(e) => setMatSizeForm({ ...matSizeForm, aklisliquid: e.target.checked })}
                        className="rounded text-emerald-600"
                      />
                      <span>Sıvı</span>
                    </label>
                    <label className="flex items-center gap-2 p-1.5 rounded-lg border border-line hover:bg-elevated cursor-pointer">
                      <input
                        type="checkbox"
                        checked={matSizeForm.isexplos}
                        onChange={(e) => setMatSizeForm({ ...matSizeForm, isexplos: e.target.checked })}
                        className="rounded text-emerald-600"
                      />
                      <span>Yanıcı</span>
                    </label>
                    <label className="flex items-center gap-2 p-1.5 rounded-lg border border-line hover:bg-elevated cursor-pointer">
                      <input
                        type="checkbox"
                        checked={matSizeForm.isspoil}
                        onChange={(e) => setMatSizeForm({ ...matSizeForm, isspoil: e.target.checked })}
                        className="rounded text-emerald-600"
                      />
                      <span>Çabuk Bozulan</span>
                    </label>
                  </div>
                </div>

                {/* Ölçüleri Kaydet & İlerle Butonu */}
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleSaveDimensions}
                    disabled={isSavingMatSize}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2.5 text-xs font-bold text-white shadow-md hover:bg-emerald-700 active:scale-95 transition disabled:opacity-50"
                  >
                    {isSavingMatSize ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> Kaydediliyor...
                      </>
                    ) : (
                      <>
                        <span>Ölçüleri Kaydet & İlerle</span>
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* ------------------------------------------------------------------- */}
            {/* ADIM 3 GÖRÜNÜMÜ: ADET, PARTİ GİRİŞİ VE SAĞ ALTTA TAMAMLA TUŞU */}
            {/* ------------------------------------------------------------------- */}
            {activeStep === "quantity" && currentMaterial && (
              <div className="space-y-4 animate-fade-in">
                {/* Miktar Stepper Girişi */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-fg">
                      Kabul Edilecek Miktar ({currentMaterial.unit || "AD"}) <span className="text-red-500">*</span>
                    </label>
                    <span className="text-[11px] font-semibold text-subtle">
                      Adet: <strong className="text-emerald-600 dark:text-emerald-400 font-mono">{receiptQty}</strong>
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setReceiptQty((prev) => Math.max(0, prev - 1))}
                      className="flex h-11 w-11 items-center justify-center rounded-2xl bg-elevated text-subtle hover:bg-line transition active:scale-95 shrink-0"
                    >
                      <Minus className="h-5 w-5" />
                    </button>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={receiptQty === 0 ? "" : receiptQty}
                      placeholder="0"
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        setReceiptQty(isNaN(val) ? 0 : Math.max(0, val));
                      }}
                      className="field-input flex-1 text-center font-mono text-xl font-extrabold text-emerald-600 dark:text-emerald-400"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => setReceiptQty((prev) => prev + 1)}
                      className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-600 text-white hover:bg-emerald-700 transition active:scale-95 shadow-md shrink-0"
                    >
                      <Plus className="h-5 w-5" />
                    </button>
                  </div>

                  {/* Hızlı Artırma ve Sıfırlama Butonları (+5, +10, +50, Sıfırla) */}
                  <div className="grid grid-cols-4 gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setReceiptQty((prev) => prev + 5)}
                      className="rounded-xl border border-line bg-elevated/70 py-2 text-xs font-extrabold text-fg hover:bg-emerald-600 hover:text-white transition active:scale-95 shadow-xs"
                    >
                      +5
                    </button>
                    <button
                      type="button"
                      onClick={() => setReceiptQty((prev) => prev + 10)}
                      className="rounded-xl border border-line bg-elevated/70 py-2 text-xs font-extrabold text-fg hover:bg-emerald-600 hover:text-white transition active:scale-95 shadow-xs"
                    >
                      +10
                    </button>
                    <button
                      type="button"
                      onClick={() => setReceiptQty((prev) => prev + 50)}
                      className="rounded-xl border border-line bg-elevated/70 py-2 text-xs font-extrabold text-fg hover:bg-emerald-600 hover:text-white transition active:scale-95 shadow-xs"
                    >
                      +50
                    </button>
                    <button
                      type="button"
                      onClick={() => setReceiptQty(0)}
                      className="rounded-xl border border-line bg-elevated/40 py-2 text-xs font-bold text-subtle hover:bg-red-500/20 hover:text-red-500 hover:border-red-500/30 transition active:scale-95 shadow-xs"
                    >
                      Sıfırla
                    </button>
                  </div>
                </div>

                {/* Partili Malzeme ise Parti No ve SKT Alanları */}
                {currentMaterial.isSpecialLot && (
                  <div className="space-y-2.5 rounded-2xl border border-violet-500/30 bg-violet-500/10 p-3.5 text-xs animate-fade-in">
                    <div className="flex items-center gap-1.5 font-bold text-violet-800 dark:text-violet-200">
                      <Tag className="h-4 w-4" />
                      <span>Parti & SKT Girişi (Zorunlu)</span>
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-subtle block mb-1">Parti No (Lot) *</label>
                      <input
                        type="text"
                        value={lotNumber}
                        onChange={(e) => {
                          setLotNumber(e.target.value.toUpperCase());
                          if (lotError) setLotError("");
                        }}
                        placeholder="Parti numarasını giriniz"
                        className={`field-input w-full font-mono text-xs font-bold ${lotError ? "border-red-500" : ""
                          }`}
                      />
                      {lotError && <p className="text-[10px] text-red-500 mt-1 font-semibold">{lotError}</p>}
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-subtle block mb-1">Son Kullanma Tarihi (SKT)</label>
                      <input
                        type="date"
                        value={expiryDate}
                        onChange={(e) => setExpiryDate(e.target.value)}
                        className="field-input w-full font-mono text-xs"
                      />
                    </div>
                  </div>
                )}

                {/* ADET KARTININ SAĞ ALTINDA: TAMAMLA TUŞU */}
                <div className="flex items-center justify-between pt-3 border-t border-line">
                  <button
                    type="button"
                    onClick={() => {
                      setIsProductScanned(false);
                      setActiveStep("product");
                      setBarcodeInput("");
                    }}
                    className="text-xs font-semibold text-subtle hover:text-fg transition"
                  >
                    Vazgeç / Yeni Barkod
                  </button>

                  <button
                    type="button"
                    onClick={handleCompleteItemReceipt}
                    className="flex items-center gap-2 rounded-2xl bg-emerald-600 px-5 py-2.5 text-xs font-extrabold text-white shadow-lg hover:bg-emerald-700 active:scale-95 transition"
                  >
                    <Check className="h-4 w-4" />
                    <span>Tamamla</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ======================================================================= */}
          {/* SOL ÜSTTEKİ 3 SEÇENEKLİ KARTIN ALTINDA: OKUTULANLAR KÜÇÜK BASİT KARTI */}
          {/* ======================================================================= */}
          <div className="rounded-3xl border border-line bg-surface p-4 shadow-card hover:border-emerald-500/40 transition">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-600/10 text-emerald-600 dark:text-emerald-400">
                  <List className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-xs font-extrabold text-fg">Okutulanlar</h4>
                  <p className="text-[11px] text-subtle font-mono mt-0.5">
                    {receivedItems.length} Kalem
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() =>
                  navigate(
                    `/receiving/${encodeURIComponent(vendorCode)}/kayitlar?waybill=${encodeURIComponent(
                      waybillNo
                    )}&targetWH=${encodeURIComponent(targetWH)}&vendor=${encodeURIComponent(
                      vendorCode
                    )}&vendorName=${encodeURIComponent(vendorName)}`,
                    {
                      state: {
                        items: receivedItems,
                        waybillNo,
                        targetWarehouse: targetWH,
                        vendor: vendorCode,
                        vendorName,
                      },
                    }
                  )
                }
                className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-elevated/60 px-3 py-1.5 text-xs font-bold text-subtle hover:bg-emerald-600 hover:text-white transition shadow-sm"
              >
                <span>Tümünü Gör</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* SAĞ SÜTUN: SAĞ ÜSTTE ÜRÜN BİLGİ KARTI + SAĞ ALTTA FIFO AÇIK SİPARİŞLER    */}
        {/* ========================================================================= */}
        <div className="lg:col-span-7 xl:col-span-7 space-y-4">
          {/* SAĞ ÜST KART: ÜRÜNÜN BİLGİ KARTI (İSİM, RESİM, ÖLÇÜ VB.) - İNCELTİLMİŞ TASARIM */}
          <div className="rounded-2xl border border-line bg-surface p-3.5 shadow-sm">
            {currentMaterial ? (
              <div className="flex items-center gap-3">
                {currentMaterial.image ? (
                  <img
                    src={currentMaterial.image}
                    alt={currentMaterial.name}
                    className="h-12 w-12 rounded-xl object-cover border border-line shrink-0 shadow-xs"
                  />
                ) : (
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-600/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    <Package className="h-6 w-6" />
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="chip bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 font-mono text-[11px] font-extrabold py-0.5 px-2">
                      {currentMaterial.material}
                    </span>
                    {currentMaterial.isSpecialLot && (
                      <span className="chip bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300 text-[10px] font-bold py-0.5 px-1.5 flex items-center gap-1">
                        <Tag className="h-2.5 w-2.5" /> Parti
                      </span>
                    )}
                    <span className="text-subtle text-[11px] font-mono font-medium ml-auto">
                      Birim: <strong className="text-fg">{currentMaterial.unit}</strong>
                    </span>
                  </div>

                  <h4 className="font-bold text-fg text-xs truncate mt-0.5" title={currentMaterial.name}>
                    {currentMaterial.name}
                  </h4>

                  {/* Ölçü & Ağırlık Bilgileri */}
                  {currentMaterial.dimensions && currentMaterial.dimensions.width > 0 ? (
                    <div className="flex items-center gap-1.5 text-[11px] font-mono text-subtle mt-0.5 truncate">
                      <Ruler className="h-3 w-3 text-emerald-600 shrink-0" />
                      <span>
                        {currentMaterial.dimensions.width}x{currentMaterial.dimensions.length}x
                        {currentMaterial.dimensions.height} cm · {currentMaterial.dimensions.brutWeight} kg
                        {currentMaterial.dimensions.volume > 0 && ` (${currentMaterial.dimensions.volume} m³)`}
                      </span>
                    </div>
                  ) : (
                    <div className="text-[10px] text-amber-600 font-medium mt-0.5">
                      Ölçü bilgisi henüz girilmedi
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="py-2 text-center text-subtle text-xs flex items-center justify-center gap-2">
                <Package className="h-4 w-4 text-subtle/50" />
                <span>Barkod okutulduğunda ürün detayları burada görüntülenecektir.</span>
              </div>
            )}
          </div>

          {/* SAĞ ALT KART: FIFO'YA GÖRE SIRALANMIŞ AÇIK SİPARİŞLER */}
          <div className="rounded-3xl border border-line bg-surface p-5 shadow-card space-y-3.5">
            <div className="flex items-center justify-between pb-2 border-b border-line">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <h3 className="text-xs font-extrabold text-fg uppercase tracking-wider">
                  Açık Siparişler (eskiden yeniye sıralı)
                </h3>
              </div>
              <span className="chip bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 font-mono text-[11px] font-bold">
                {openOrders.length} Sipariş Bulundu
              </span>
            </div>

            {openOrders.length === 0 ? (
              <div className="py-6 text-center text-subtle text-xs">
                <Layers className="mx-auto h-8 w-8 text-subtle/40 mb-2" />
                <p>Bu ürüne ait açık sipariş bulunamadı veya henüz barkod okutulmadı.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {fifoAllocation.allocations.map((al, idx) => (
                  <div
                    key={`${al.orderNum}-${al.itemNum}-${idx}`}
                    className={`rounded-2xl border p-4 transition-all duration-200 ${al.isFullyAllocated
                        ? "border-emerald-500/60 bg-emerald-500/10 shadow-sm"
                        : al.isPartiallyAllocated
                          ? "border-amber-500/60 bg-amber-500/10 shadow-sm"
                          : "border-line bg-elevated/30"
                      }`}
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-extrabold text-fg truncate max-w-[240px]" title={currentMaterial?.name || "Malzeme"}>
                          {currentMaterial?.name || "Malzeme"}
                        </span>
                        {idx === 0 && (
                          <span className="chip bg-emerald-600 text-white font-bold text-[10px] px-2 py-0.5 shadow-sm">
                            1. Öncelik (En Eski)
                          </span>
                        )}
                        {idx > 0 && (
                          <span className="chip bg-slate-200 dark:bg-slate-800 text-subtle font-mono text-[10px]">
                            {idx + 1}. Öncelik
                          </span>
                        )}
                      </div>

                      {al.orderDate && (
                        <span className="text-[11px] text-subtle font-mono flex items-center gap-1">
                          <Calendar className="h-3 w-3" /> {al.orderDate}
                        </span>
                      )}
                    </div>

                    <div className="mt-2.5 flex items-center justify-between text-xs font-mono">
                      <span className="text-subtle">
                        Kalan Sipariş Miktarı: <strong className="text-fg">{al.remainingQty} {currentMaterial?.unit || "AD"}</strong>
                      </span>

                      {/* Tahsis Durumu */}
                      {al.isFullyAllocated ? (
                        <span className="chip bg-emerald-600 text-white font-bold text-[11px] flex items-center gap-1">
                          <Check className="h-3 w-3" /> Tamamı Karşılanıyor ({al.allocatedQty} AD)
                        </span>
                      ) : al.isPartiallyAllocated ? (
                        <span className="chip bg-amber-500 text-white font-bold text-[11px]">
                          Kısmi: {al.allocatedQty} / {al.remainingQty} AD
                        </span>
                      ) : (
                        <span className="chip bg-slate-200 dark:bg-slate-800 text-subtle font-bold text-[11px]">
                          Bekliyor ({al.remainingQty} AD)
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mal Kabulü Bitir Onay Modalı */}
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
                <strong className="text-emerald-600 dark:text-emerald-400 font-mono font-bold">
                  {totalReceivedQty} {receivedItems[0]?.unit || "AD"}
                </strong>
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
                disabled={isSavingReceipt}
                className="flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-extrabold text-white shadow-lg hover:bg-emerald-700 active:scale-95 transition"
              >
                {isSavingReceipt ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Evet, Tamamla
              </button>
            </div>
          </div>
        </div>
      )}

      <ToastView toast={toast} />
    </div>
  );
}
