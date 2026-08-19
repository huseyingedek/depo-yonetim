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
  List,
  ExternalLink,
  ImageIcon,
  GlassWater,
  Droplets,
  Flame,
  Clock,
  Skull,
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
    barcodes: Array<{ barcode: string; unit: string }>;
    selectedBarcode: string;
    specialAttributes?: {
      isexplos: boolean;
      isspoil: boolean;
      aklisbreakable: boolean;
      aklisliquid: boolean;
      aklistoxic: boolean;
    };
    dimensions?: {
      width: number;
      length: number;
      height: number;
      volume: number;
      netWeight: number;
      brutWeight: number;
    };
  } | null>(null);

  // Ölçü Formu State'leri (Sayfalar arası aktarım için)
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

  // 3. Adım: Adet, Parti & SKT State'leri
  const [receiptQty, setReceiptQty] = useState<number>(0);
  const [lotNumber, setLotNumber] = useState<string>("");
  const [expiryDate, setExpiryDate] = useState<string>("");
  const [lotError, setLotError] = useState<string>("");

  // Açık Siparişler (FIFO Sıralı)
  const [openOrders, setOpenOrders] = useState<Record<string, unknown>[]>([]);

  // Okutulanlar Listesi (Sadece aktif oturum veya kayitlar/ölçü sayfasından dönüşte aktarılır)
  const [receivedItems, setReceivedItems] = useState<ReceivedItem[]>(() => {
    try {
      const stateItems = location.state?.items as ReceivedItem[] | undefined;
      if (Array.isArray(stateItems) && stateItems.length > 0) return stateItems;
      return [];
    } catch {
      return [];
    }
  });

  // Sayfadan tamamen çıkıldığında localStorage kalıntılarını temizle
  useEffect(() => {
    return () => {
      try {
        localStorage.removeItem(storageKey);
      } catch {}
    };
  }, [storageKey]);

  // Ölçü Sayfasına Yönlendirme
  const handleOpenDimensionsPage = useCallback(() => {
    if (!currentMaterial) {
      show({ kind: "err", text: "Lütfen önce bir ürün barkodu okutunuz." });
      return;
    }
    navigate(
      `/receiving/${encodeURIComponent(vendorCode)}/olculer?waybill=${encodeURIComponent(
        waybillNo
      )}&targetWH=${encodeURIComponent(targetWH)}&vendor=${encodeURIComponent(
        vendorCode
      )}&vendorName=${encodeURIComponent(vendorName)}`,
      {
        state: {
          material: currentMaterial.material,
          name: currentMaterial.name,
          image: currentMaterial.image,
          unit: currentMaterial.unit,
          isSpecialLot: currentMaterial.isSpecialLot,
          barcodes: currentMaterial.barcodes,
          selectedBarcode: currentMaterial.selectedBarcode,
          currentMaterial,
          matSizeForm,
          items: receivedItems,
          waybillNo,
          targetWarehouse: targetWH,
          vendor: vendorCode,
          vendorName,
          openOrders,
        },
      }
    );
  }, [
    currentMaterial,
    matSizeForm,
    receivedItems,
    waybillNo,
    targetWH,
    vendorCode,
    vendorName,
    openOrders,
    navigate,
    show,
  ]);

  // Adım ve malzeme geri yükleme (Ölçü veya Kayıtlar sayfasından dönüşte)
  useEffect(() => {
    if (location.state?.matSizeSaved) {
      if (location.state.currentMaterial) {
        setCurrentMaterial(location.state.currentMaterial);
        setIsProductScanned(true);
      }
      if (location.state.matSizeForm) {
        setMatSizeForm(location.state.matSizeForm);
      }
      if (location.state.openOrders) {
        setOpenOrders(location.state.openOrders);
      }
      setAreDimensionsDone(true);
      setActiveStep("quantity");
    } else if (location.state?.currentMaterial) {
      setCurrentMaterial(location.state.currentMaterial);
      setIsProductScanned(true);
      if (location.state.matSizeForm) setMatSizeForm(location.state.matSizeForm);
      if (location.state.openOrders) setOpenOrders(location.state.openOrders);
      if (location.state.areDimensionsDone !== undefined) {
        setAreDimensionsDone(Boolean(location.state.areDimensionsDone));
      }
      if (location.state.activeStep) {
        setActiveStep(location.state.activeStep);
      }
    }
  }, [location.state]);

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

        // 2. Barcode Listesini Topla ve Eşle
        const rawBarcodeList = Array.isArray(matRes.barcodeList) ? matRes.barcodeList : [];
        const seenBarcodes = new Set<string>();
        const barcodes: Array<{ barcode: string; unit: string }> = [];

        if (targetBarcode) {
          seenBarcodes.add(targetBarcode);
          barcodes.push({ barcode: targetBarcode, unit: matUnit || "AD" });
        }

        for (const b of rawBarcodeList) {
          const bCode = String(b.BARCODE || "").trim();
          const bUnit = String(b.BUNIT || b.UNIT || matUnit || "AD").trim();
          if (bCode && !seenBarcodes.has(bCode)) {
            seenBarcodes.add(bCode);
            barcodes.push({ barcode: bCode, unit: bUnit });
          }
        }

        // 3. MZYGetOpenOrder ile açık siparişleri getir ve YENİDEN ESKİYE sırala (Newest first)
        const orderRes = await api.getOpenOrders({
          barcode: targetBarcode,
          vendor: vendorCode,
        });
        const rawOrders = (orderRes.orders || []) as Record<string, unknown>[];

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
        };

        const matObj = {
          material: matCode,
          name: matName,
          image: matImage,
          unit: matUnit,
          isSpecialLot,
          barcodes,
          selectedBarcode: targetBarcode || barcodes[0]?.barcode || "",
          specialAttributes,
          dimensions: {
            width: pwidth,
            length: plength,
            height: pheight,
            volume,
            netWeight: netweight,
            brutWeight: brutweight,
          },
        };

        setCurrentMaterial(matObj);
        setIsProductScanned(true);

        if (!hasAllDimensions) {
          // Ölçüler eksik -> 2. Adım Ölçü Sayfasına Yönlendir
          setAreDimensionsDone(false);
          setActiveStep("dimensions");
          sesBasarili();
          show({
            kind: "ok",
            text: `${matName} okundu. Ölçü bilgilerini girmek için ölçü sayfasına yönlendiriliyor...`,
          });
          setTimeout(() => {
            navigate(
              `/receiving/${encodeURIComponent(vendorCode)}/olculer?waybill=${encodeURIComponent(
                waybillNo
              )}&targetWH=${encodeURIComponent(targetWH)}&vendor=${encodeURIComponent(
                vendorCode
              )}&vendorName=${encodeURIComponent(vendorName)}`,
              {
                state: {
                  material: matCode,
                  name: matName,
                  image: matImage,
                  unit: matUnit,
                  isSpecialLot,
                  barcodes,
                  selectedBarcode: targetBarcode || barcodes[0]?.barcode || "",
                  currentMaterial: matObj,
                  matSizeForm: parsedMatSize,
                  items: receivedItems,
                  waybillNo,
                  targetWarehouse: targetWH,
                  vendor: vendorCode,
                  vendorName,
                  openOrders: sortedOrders,
                },
              }
            );
          }, 500);
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

  // Açık Siparişlerdeki Toplam Bakiye (Kabul Edilebilecek Maksimum Adet)
  const totalAvailableQty = useMemo(() => {
    if (!openOrders || openOrders.length === 0) return 0;
    return openOrders.reduce((sum, ord) => {
      const q = getOrderRemainingQty(ord);
      return sum + (q > 0 ? q : 1);
    }, 0);
  }, [openOrders]);

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

    if (totalAvailableQty > 0 && receiptQty > totalAvailableQty) {
      sesHata();
      show({
        kind: "error",
        text: `Kabul adedi (${receiptQty}), açık siparişlerin toplam bakiyesini (${totalAvailableQty} ${currentMaterial.unit || "AD"}) aşamaz!`,
      });
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
    <div className="mx-auto max-w-7xl p-2 sm:p-4 lg:p-6 animate-fade-in space-y-3 sm:space-y-4">
      {/* Üst Başlık ve Aksiyonlar (Mobil Yatay Uyumlu Kompakt) */}
      <PageHeader
        title={`Mal Kabul: ${vendorName}`}
        subtitle={`İrsaliye: ${waybillNo || "—"} · Depo: ${targetWH || "—"}`}
        backTo="/receiving"
        right={
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="chip bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 font-mono text-xs sm:text-sm px-2.5 sm:px-3 py-1 font-extrabold border border-emerald-500/20 shadow-xs">
              {receivedItems.length} Kalem Okutuldu
            </span>

            {/* Mal Kabulü Bitir Butonu */}
            <button
              type="button"
              onClick={() => setIsConfirmModalOpen(true)}
              disabled={receivedItems.length === 0 || isSavingReceipt}
              className="flex items-center gap-1.5 sm:gap-2 rounded-xl bg-emerald-600 px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-extrabold text-white shadow-md hover:bg-emerald-700 active:scale-95 transition disabled:opacity-40 disabled:cursor-not-allowed"
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
        <div className="flex items-center gap-2.5 rounded-2xl border border-emerald-500 bg-emerald-500/20 p-3 text-xs font-bold text-emerald-800 dark:text-emerald-200 animate-slide-up">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>{saveSuccessMessage} Yönlendiriliyor...</span>
        </div>
      )}

      {/* ANA İKİ SÜTUNLU YAPI - MOBİL YATAY (LANDSCAPE) VE MASAÜSTÜNDE ASLA ÜST ÜSTE BİNMEZ */}
      <div className="grid grid-cols-1 sm:grid-cols-12 md:grid-cols-12 landscape:grid-cols-12 gap-3 sm:gap-4 items-start">
        {/* ========================================================================= */}
        {/* SOL SÜTUN: 3 AŞAMALI KART (1 ÜRÜN · 2 ÖLÇÜ · 3 ADET) + OKUTULANLAR KARTI */}
        {/* ========================================================================= */}
        <div className="sm:col-span-5 md:col-span-5 lg:col-span-5 landscape:col-span-5 space-y-3 sm:space-y-4 min-w-0">
          <div className="rounded-3xl border border-line bg-surface p-3.5 sm:p-4.5 shadow-card space-y-3 sm:space-y-3.5">
            {/* 3 Aşamalı Adım Hapları (1 Ürün · 2 Ölçü · 3 Adet) - Kompakt & Küçük Tuşlar */}
            <div className="flex items-center gap-1 bg-elevated/40 p-1 rounded-xl border border-line/60">
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
                    onClick={() => {
                      if (stepKey === "dimensions") {
                        handleOpenDimensionsPage();
                      } else if (isClickable) {
                        setActiveStep(stepKey);
                      }
                    }}
                    disabled={!isClickable}
                    className={`flex min-w-0 flex-1 items-center justify-center gap-1 truncate rounded-lg py-1.5 px-1.5 text-[11px] font-bold transition-all duration-200 ${isActive
                        ? "bg-emerald-600 text-white shadow-sm"
                        : isDone
                          ? "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30"
                          : isClickable
                            ? "bg-surface hover:bg-elevated text-fg border border-line/50"
                            : "bg-transparent text-subtle/50 cursor-not-allowed"
                      }`}
                  >
                    <span className="shrink-0 font-mono text-[10px]">{isDone ? "✓" : ""}</span>
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
            {/* ADIM 2 GÖRÜNÜMÜ: ÖLÇÜ SAYFASINA YÖNLENDİRME KARTI                   */}
            {/* ------------------------------------------------------------------- */}
            {activeStep === "dimensions" && currentMaterial && (
              <div className="space-y-3 p-4 text-center rounded-2xl bg-elevated/40 border border-line animate-fade-in">
                <div className="flex h-12 w-12 mx-auto items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 border border-amber-500/20">
                  <Ruler className="h-6 w-6" />
                </div>
                <div>
                  <h4 className="text-xs font-extrabold text-fg">Ölçü ve Boyut Tanımlama</h4>
                  <p className="text-[11px] text-subtle mt-0.5">
                    Ölçü, ağırlık ve özel nitelikleri yatay giriş sayfasında düzenleyebilirsiniz.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleOpenDimensionsPage}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 active:scale-95 transition"
                >
                  <ExternalLink className="h-4 w-4" /> Ölçü Sayfasına Git
                </button>
              </div>
            )}

            {/* ------------------------------------------------------------------- */}
            {/* ADIM 3 GÖRÜNÜMÜ: ADET, PARTİ GİRİŞİ VE SAĞ ALTTA TAMAMLA TUŞU */}
            {/* ------------------------------------------------------------------- */}
            {activeStep === "quantity" && currentMaterial && (
              <div className="space-y-2.5 animate-fade-in">
                {/* Miktar Stepper Girişi */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-fg">
                      Kabul Edilecek Miktar ({currentMaterial.unit || "AD"}) <span className="text-red-500">*</span>
                    </label>
                    <span className="text-[11px] font-semibold text-subtle">
                      Adet: <strong className="text-emerald-600 dark:text-emerald-400 font-mono">{receiptQty}</strong>
                    </span>
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
                      max={totalAvailableQty > 0 ? totalAvailableQty : undefined}
                      step={1}
                      value={receiptQty === 0 ? "" : receiptQty}
                      placeholder="0"
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        if (isNaN(val)) {
                          setReceiptQty(0);
                          return;
                        }
                        if (totalAvailableQty > 0 && val > totalAvailableQty) {
                          setReceiptQty(totalAvailableQty);
                          sesHata();
                          show({
                            kind: "err",
                            text: `Açık siparişlerin toplam bakiyesi (${totalAvailableQty} ${currentMaterial.unit || "AD"}) aşılamaz.`,
                          });
                        } else {
                          setReceiptQty(Math.max(0, val));
                        }
                      }}
                      className="field-input flex-1 text-center font-mono text-lg font-extrabold text-emerald-600 dark:text-emerald-400 h-10 py-1"
                      autoFocus
                    />
                    <button
                      type="button"
                      disabled={totalAvailableQty > 0 && receiptQty >= totalAvailableQty}
                      onClick={() => {
                        if (totalAvailableQty > 0 && receiptQty >= totalAvailableQty) {
                          sesHata();
                          show({
                            kind: "err",
                            text: `Maksimum sipariş bakiyesine (${totalAvailableQty}) ulaşıldı.`,
                          });
                          return;
                        }
                        setReceiptQty((prev) => (totalAvailableQty > 0 ? Math.min(totalAvailableQty, prev + 1) : prev + 1));
                      }}
                      className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition active:scale-95 shadow-md shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Hızlı Artırma ve Sıfırlama Butonları (+5, +10, +50, Sıfırla) */}
                  <div className="grid grid-cols-4 gap-1.5 pt-1.5">
                    {[5, 10, 50].map((inc) => (
                      <button
                        key={inc}
                        type="button"
                        onClick={() => {
                          setReceiptQty((prev) => {
                            const target = prev + inc;
                            if (totalAvailableQty > 0 && target > totalAvailableQty) {
                              show({
                                kind: "info",
                                text: `Miktar toplam bakiye olan ${totalAvailableQty} ${currentMaterial.unit || "AD"} ile sınırlandırıldı.`,
                              });
                              return totalAvailableQty;
                            }
                            return target;
                          });
                        }}
                        disabled={totalAvailableQty > 0 && receiptQty >= totalAvailableQty}
                        className="rounded-lg border border-line bg-elevated/70 py-1.5 text-xs font-extrabold text-fg hover:bg-emerald-600 hover:text-white transition active:scale-95 shadow-xs disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        +{inc}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setReceiptQty(0)}
                      className="rounded-lg border border-line bg-elevated/40 py-1.5 text-xs font-bold text-subtle hover:bg-red-500/20 hover:text-red-500 hover:border-red-500/30 transition active:scale-95 shadow-xs"
                    >
                      Sıfırla
                    </button>
                  </div>
                </div>

                {/* Partili Malzeme ise Parti No ve SKT Alanları */}
                {currentMaterial.isSpecialLot && (
                  <div className="space-y-2 rounded-2xl border border-violet-500/30 bg-violet-500/10 p-2.5 text-xs animate-fade-in">
                    <div className="flex items-center gap-1.5 font-bold text-violet-800 dark:text-violet-200">
                      <Tag className="h-3.5 w-3.5" />
                      <span>Parti & SKT Girişi (Zorunlu)</span>
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
                        placeholder="Parti numarasını giriniz"
                        className={`field-input w-full font-mono text-xs font-bold h-8 py-1 ${lotError ? "border-red-500" : ""
                          }`}
                      />
                      {lotError && <p className="text-[10px] text-red-500 mt-0.5 font-semibold">{lotError}</p>}
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-subtle block mb-0.5">Son Kullanma Tarihi (SKT)</label>
                      <input
                        type="date"
                        value={expiryDate}
                        onChange={(e) => setExpiryDate(e.target.value)}
                        className="field-input w-full font-mono text-xs h-8 py-1"
                      />
                    </div>
                  </div>
                )}

                {/* ADET KARTININ SAĞ ALTINDA: TAMAMLA TUŞU (SIFIRLAYA YAKIN & ÇİZGİSİZ) */}
                <div className="flex items-center justify-between pt-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setIsProductScanned(false);
                      setActiveStep("product");
                      setBarcodeInput("");
                    }}
                    className="text-[11px] font-semibold text-subtle hover:text-fg transition"
                  >
                    Vazgeç / Yeni Barkod
                  </button>

                  <button
                    type="button"
                    onClick={handleCompleteItemReceipt}
                    className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-extrabold text-white shadow-md hover:bg-emerald-700 active:scale-95 transition"
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
        {/* SAĞ SÜTUN: SAĞ ÜSTTE ÜRÜN BİLGİ KARTI + SAĞ ALTTA AÇIK SİPARİŞLER         */}
        {/* ========================================================================= */}
        <div className="sm:col-span-7 md:col-span-7 lg:col-span-7 landscape:col-span-7 space-y-3 sm:space-y-4 min-w-0">
          {/* SAĞ ÜST KART: ÜRÜNÜN BİLGİ KARTI (İSİM EN ÜSTTE, RESİM İSMİN ALTINDA) */}
          <div className="rounded-3xl border border-line bg-surface p-3 sm:p-3.5 shadow-card min-h-[140px] flex flex-col justify-start space-y-2">
            {currentMaterial ? (
              <div className="space-y-2 w-full">
                {/* 1. Satır: En Üstte Tam Genişlikte Ürün İsmi ve Sağda Birim */}
                <div className="flex items-start justify-between gap-2 border-b border-line/60 pb-1.5">
                  <h4 className="font-extrabold text-fg text-xs sm:text-sm leading-snug text-left truncate" title={currentMaterial.name}>
                    {currentMaterial.name}
                  </h4>
                  <span className="text-subtle text-[11px] font-mono font-medium shrink-0">
                    Birim: <strong className="text-fg">{currentMaterial.unit}</strong>
                  </span>
                </div>

                {/* 2. Satır: İsmin Altında Solda Resim, Sağında Kod + Ölçü/Ağırlık/Hacim ve Nitelikler ve Barkod */}
                <div className="flex items-start gap-3 w-full">
                  {/* Solda Ürün Görseli veya Fotoğraf Yok İmgesi */}
                  {currentMaterial.image ? (
                    <img
                      src={currentMaterial.image}
                      alt={currentMaterial.name}
                      className="h-20 w-20 sm:h-22 sm:w-22 rounded-2xl object-cover border border-line shrink-0 shadow-sm"
                    />
                  ) : (
                    <div className="flex flex-col h-20 w-20 sm:h-22 sm:w-22 shrink-0 items-center justify-center rounded-2xl bg-elevated/80 border border-line/80 text-subtle/80 gap-1 p-1 text-center shadow-inner">
                      <ImageIcon className="h-5 w-5 text-subtle/50" />
                      <span className="text-[9px] font-bold text-subtle leading-tight">Fotoğraf Yok</span>
                    </div>
                  )}

                  {/* Sağda: Kod + Ölçü/Ağırlık/Hacim + Özel Nitelikler ve Altta Barkod Combobox */}
                  <div className="flex-1 space-y-1.5 min-w-0">
                    {/* Ürün Kodu, Ölçü/Ağırlık/Hacim ve Özel Nitelikler Tek Birleşik Kutuda */}
                    {currentMaterial.dimensions && currentMaterial.dimensions.width > 0 ? (
                      <div className="flex items-center gap-1.5 text-xs font-mono text-fg/90 bg-elevated/50 py-1 px-2 rounded-xl border border-line/60 flex-wrap">
                        <span className="font-extrabold text-fg bg-surface px-1.5 py-0.5 rounded-md border border-line text-[11px] shadow-2xs shrink-0">
                          {currentMaterial.material}
                        </span>
                        <Ruler className="h-3 w-3 text-subtle shrink-0" />
                        <span className="font-medium text-subtle text-xs flex items-center gap-1 flex-wrap">
                          <span className="text-fg font-semibold">
                            ({currentMaterial.dimensions.width})x({currentMaterial.dimensions.length})x({currentMaterial.dimensions.height})
                          </span>
                          <strong className="text-xs font-bold text-fg">CM</strong>
                          <span className="text-subtle/50">·</span>
                          <span className="text-[11px] font-medium text-subtle">Net:</span>
                          <span className="text-fg font-semibold">({currentMaterial.dimensions.netWeight})</span>
                          <strong className="text-xs font-bold text-fg">KG</strong>
                          <span className="text-subtle/50">·</span>
                          <span className="text-[11px] font-medium text-subtle">Brüt:</span>
                          <span className="text-fg font-semibold">({currentMaterial.dimensions.brutWeight})</span>
                          <strong className="text-xs font-bold text-fg">KG</strong>
                          {((currentMaterial.dimensions.volume && currentMaterial.dimensions.volume > 0) ||
                            (currentMaterial.dimensions.width * currentMaterial.dimensions.length * currentMaterial.dimensions.height > 0)) && (
                            <>
                              <span className="text-subtle/50">·</span>
                              <span className="text-fg font-semibold">
                                (
                                {currentMaterial.dimensions.volume && currentMaterial.dimensions.volume > 0
                                  ? currentMaterial.dimensions.volume
                                  : Number(
                                      (
                                        (currentMaterial.dimensions.width *
                                          currentMaterial.dimensions.length *
                                          currentMaterial.dimensions.height) /
                                        1000000
                                      ).toFixed(3)
                                    )}
                                )
                              </span>
                              <strong className="text-xs font-bold text-fg">M³</strong>
                            </>
                          )}
                        </span>

                        {/* Özel Nitelikler (Sıvı, Yanıcı, Kırılabilir, Bozulabilir, Toksik, Parti) */}
                        {(currentMaterial.isSpecialLot ||
                          currentMaterial.specialAttributes?.aklisliquid ||
                          currentMaterial.specialAttributes?.isexplos ||
                          currentMaterial.specialAttributes?.aklisbreakable ||
                          currentMaterial.specialAttributes?.isspoil ||
                          currentMaterial.specialAttributes?.aklistoxic) && (
                          <div className="flex items-center gap-1 pl-1 border-l border-line/60 flex-wrap">
                            {currentMaterial.specialAttributes?.aklisliquid && (
                              <span className="chip bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-500/30 text-[10px] font-bold py-0.5 px-1.5 flex items-center gap-1">
                                <Droplets className="h-2.5 w-2.5" /> Sıvı
                              </span>
                            )}
                            {currentMaterial.specialAttributes?.isexplos && (
                              <span className="chip bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30 text-[10px] font-bold py-0.5 px-1.5 flex items-center gap-1">
                                <Flame className="h-2.5 w-2.5" /> Yanıcı
                              </span>
                            )}
                            {currentMaterial.specialAttributes?.aklisbreakable && (
                              <span className="chip bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 text-[10px] font-bold py-0.5 px-1.5 flex items-center gap-1">
                                <GlassWater className="h-2.5 w-2.5" /> Kırılabilir
                              </span>
                            )}
                            {currentMaterial.specialAttributes?.isspoil && (
                              <span className="chip bg-orange-500/15 text-orange-700 dark:text-orange-300 border border-orange-500/30 text-[10px] font-bold py-0.5 px-1.5 flex items-center gap-1">
                                <Clock className="h-2.5 w-2.5" /> Bozulabilir
                              </span>
                            )}
                            {currentMaterial.specialAttributes?.aklistoxic && (
                              <span className="chip bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30 text-[10px] font-bold py-0.5 px-1.5 flex items-center gap-1">
                                <Skull className="h-2.5 w-2.5" /> Toksik
                              </span>
                            )}
                            {currentMaterial.isSpecialLot && (
                              <span className="chip bg-violet-500/15 text-violet-700 dark:text-violet-300 border border-violet-500/30 text-[10px] font-bold py-0.5 px-1.5 flex items-center gap-1">
                                <Tag className="h-2.5 w-2.5" /> Parti
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-xs font-mono text-subtle bg-elevated/50 py-1 px-2 rounded-xl border border-line/60 flex-wrap">
                        <span className="font-extrabold text-fg bg-surface px-1.5 py-0.5 rounded-md border border-line text-[11px] shadow-2xs shrink-0">
                          {currentMaterial.material}
                        </span>
                        <span className="text-[10px] text-amber-600 font-medium py-0.5">
                          Ölçü bilgisi henüz girilmedi
                        </span>
                        {(currentMaterial.isSpecialLot ||
                          currentMaterial.specialAttributes?.aklisliquid ||
                          currentMaterial.specialAttributes?.isexplos ||
                          currentMaterial.specialAttributes?.aklisbreakable ||
                          currentMaterial.specialAttributes?.isspoil ||
                          currentMaterial.specialAttributes?.aklistoxic) && (
                          <div className="flex items-center gap-1 pl-1 border-l border-line/60 flex-wrap">
                            {currentMaterial.specialAttributes?.aklisliquid && (
                              <span className="chip bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-500/30 text-[10px] font-bold py-0.5 px-1.5 flex items-center gap-1">
                                <Droplets className="h-2.5 w-2.5" /> Sıvı
                              </span>
                            )}
                            {currentMaterial.specialAttributes?.isexplos && (
                              <span className="chip bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30 text-[10px] font-bold py-0.5 px-1.5 flex items-center gap-1">
                                <Flame className="h-2.5 w-2.5" /> Yanıcı
                              </span>
                            )}
                            {currentMaterial.specialAttributes?.aklisbreakable && (
                              <span className="chip bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 text-[10px] font-bold py-0.5 px-1.5 flex items-center gap-1">
                                <GlassWater className="h-2.5 w-2.5" /> Kırılabilir
                              </span>
                            )}
                            {currentMaterial.specialAttributes?.isspoil && (
                              <span className="chip bg-orange-500/15 text-orange-700 dark:text-orange-300 border border-orange-500/30 text-[10px] font-bold py-0.5 px-1.5 flex items-center gap-1">
                                <Clock className="h-2.5 w-2.5" /> Bozulabilir
                              </span>
                            )}
                            {currentMaterial.specialAttributes?.aklistoxic && (
                              <span className="chip bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30 text-[10px] font-bold py-0.5 px-1.5 flex items-center gap-1">
                                <Skull className="h-2.5 w-2.5" /> Toksik
                              </span>
                            )}
                            {currentMaterial.isSpecialLot && (
                              <span className="chip bg-violet-500/15 text-violet-700 dark:text-violet-300 border border-violet-500/30 text-[10px] font-bold py-0.5 px-1.5 flex items-center gap-1">
                                <Tag className="h-2.5 w-2.5" /> Parti
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Kompakt Barkod Combobox */}
                    <div className="flex items-center gap-1.5 pt-0.5">
                      <label className="text-[10px] font-bold text-subtle shrink-0">Barkod:</label>
                      <select
                        value={currentMaterial.selectedBarcode}
                        onChange={(e) =>
                          setCurrentMaterial((prev) =>
                            prev ? { ...prev, selectedBarcode: e.target.value } : prev
                          )
                        }
                        className="field-input text-[11px] font-mono font-bold py-0.5 px-2 h-7 rounded-lg border border-line bg-surface text-fg flex-1 shadow-xs cursor-pointer focus:border-emerald-500 truncate max-w-[280px] sm:max-w-none"
                      >
                        {currentMaterial.barcodes.map((b) => (
                          <option key={b.barcode} value={b.barcode}>
                            {b.barcode} ({b.unit})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-6 text-center text-subtle text-xs flex flex-col items-center justify-center gap-2">
                <Package className="h-7 w-7 text-subtle/40" />
                <span className="font-medium">Barkod okutulduğunda ürün detayları burada görüntülenecektir.</span>
              </div>
            )}
          </div>

          {/* SAĞ ALT KART: YENİDEN ESKİYE SIRALANMIŞ AÇIK SİPARİŞLER */}
          <div className="rounded-3xl border border-line bg-surface p-3.5 sm:p-4.5 shadow-card space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-line">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <h3 className="text-xs font-extrabold text-fg uppercase tracking-wider">
                  Açık Siparişler (yeniden eskiye)
                </h3>
              </div>
            </div>

            {openOrders.length === 0 ? (
              <div className="py-6 text-center text-subtle text-xs">
                <Layers className="mx-auto h-7 w-7 text-subtle/40 mb-1.5" />
                <p>Bu ürüne ait açık sipariş bulunamadı veya henüz barkod okutulmadı.</p>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[42vh] sm:max-h-[50vh] overflow-y-auto pr-1">
                {fifoAllocation.allocations.map((al, idx) => (
                  <div
                    key={`${al.orderNum}-${al.itemNum}-${idx}`}
                    className={`rounded-2xl border p-3.5 sm:p-4 transition-all duration-200 ${al.isFullyAllocated
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
                            1. Öncelik (En Yeni)
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
