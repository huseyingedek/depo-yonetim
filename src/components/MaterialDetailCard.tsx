/**
IMPORT:
 * import MaterialDetailCard from "../../components/MaterialDetailCard";

 * // Standart Kullanım (Sadece malzeme kodu veya barkod vermeniz yeterlidir):
 * <MaterialDetailCard materialCode={urunKoduVeyaBarkod} />

 * // Şartlı Kullanım (Sadece ürün kodu seçiliyse çıksın, boşken hiç görünmesin):
 * {urunKodu && (
 *   <MaterialDetailCard materialCode={urunKodu} />
 * )}
 
 * // Opsiyonel Parametrelerle Kullanım:
 * <MaterialDetailCard 
 *   materialCode={urunKodu} 
 *   showEditButton={false}  // "Ölçüm Değiştir" butonunu gizlemek için
 *   compact={true}          // Kompakt 3D kutu görünümü
 *   className="w-full"      // Özel CSS sınıfları
 */

import React, { useState, useEffect, useMemo } from "react";
import {
  Package,
  ImageIcon,
  Pencil,
  Ruler,
  ChevronDown,
  Loader2,
  Clock,
  Flame,
  Droplets,
  Skull,
  Layers,
  GlassWater,
} from "lucide-react";
import Dimension3DBoxVisual from "./Dimension3DBoxVisual";
import { api } from "../api/client";

export interface MaterialDimensions {
  width: number;
  length: number;
  height: number;
  volume: number;
  netWeight: number;
  netWeightUnit?: string;
  brutWeight: number;
  brutWeightUnit?: string;
}

export interface MaterialSpecialAttributes {
  isexplos?: boolean;
  isspoil?: boolean;
  aklisbreakable?: boolean;
  aklisliquid?: boolean;
  aklistoxic?: boolean;
  isheavy?: boolean;
  aklpalpos?: number;
}

export interface MaterialBarcodeItem {
  barcode: string;
  unit: string;
}

export interface MaterialDetailData {
  material: string;
  name: string;
  image?: string;
  unit: string;
  isSpecialLot?: boolean;
  barcodes?: MaterialBarcodeItem[];
  selectedBarcode?: string;
  packageMultiplier?: number;
  unitMultipliers?: Record<string, number>;
  specialAttributes?: MaterialSpecialAttributes;
  dimensions?: MaterialDimensions;
}

export interface MaterialDetailCardProps {
  /**
   * Malzeme kodu veya barkod.
   * Verilirse kart CANIAS api.getMaterialDetail servisi üzerinden veriyi otomatik çeker.
   */
  materialCode?: string;

  /**
   * Seçili veya gösterilmesi istenen spesifik barkod (isteğe bağlı).
   */
  barcode?: string;

  /**
   * Önceden hazırlanmış veya üst bileşenden gelen malzeme verisi.
   * Verilirse doğrudan bu veri kullanılır (tekrar servis isteği atılmaz).
   */
  data?: MaterialDetailData | null;

  /**
   * Ölçü düzenleme/ekleme butonuna basıldığında tetiklenecek fonksiyon.
   */
  onEditDimensions?: (material: MaterialDetailData) => void;

  /**
   * Kullanıcı barkod açılır kutusundan başka bir barkod seçtiğinde tetiklenir.
   */
  onBarcodeSelect?: (barcode: string) => void;

  /**
   * Kartın dış kapsayıcı CSS sınıfları (isteğe bağlı).
   */
  className?: string;

  /**
   * Kompakt mod (daha küçük alanlar için).
   */
  compact?: boolean;

  /**
   * Ölçü Değiştir / Ekle butonunu göster/gizle.
   */
  showEditButton?: boolean;
}

// Helper: Güvenli sayı çevirici
function parseNum(val: unknown): number {
  if (val === undefined || val === null || val === "") return 0;
  const s = String(val).replace(/\s/g, "").replace(",", ".");
  const n = Number(s);
  return isNaN(n) ? 0 : n;
}

// Helper: Resim URL / base64 biçimlendirici
function formatImageSrc(img: unknown): string | undefined {
  if (!img) return undefined;
  const s = String(img).trim();
  if (!s || s === "null" || s === "undefined") return undefined;
  if (s.startsWith("data:") || s.startsWith("http://") || s.startsWith("https://") || s.startsWith("/")) {
    return s;
  }
  return `data:image/jpeg;base64,${s}`;
}

// Helper: CANIAS boolean / sayısal nitelik ayıklayıcı
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

// Helper: Boyut değerlerini alternatif anahtarlarla çıkarma
function extractDimensionValue(
  sources: (Record<string, unknown> | undefined)[],
  candidates: string[],
  regexPattern?: RegExp
): number {
  for (const src of sources) {
    if (!src || typeof src !== "object") continue;
    for (const key of candidates) {
      if (src[key] !== undefined && src[key] !== null && src[key] !== "") {
        const val = parseNum(src[key]);
        if (val > 0) return val;
      }
    }
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

// Helper: Birim değerlerini ayıklama
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
  }
  return defaultUnit;
}

export const MaterialDetailCard: React.FC<MaterialDetailCardProps> = ({
  materialCode,
  barcode,
  data,
  onEditDimensions,
  onBarcodeSelect,
  className = "",
  compact = true,
  showEditButton = true,
}) => {
  const [internalData, setInternalData] = useState<MaterialDetailData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [selectedBarcodeState, setSelectedBarcodeState] = useState<string>("");

  // Üst bileşenden barcode prop'u değişirse seçili barkodu senkronize et
  useEffect(() => {
    if (barcode) {
      setSelectedBarcodeState(barcode);
    }
  }, [barcode]);

  // materialCode veya barcode değiştiğinde CANIAS servisinden verileri otomatik çek
  useEffect(() => {
    if (data) {
      setInternalData(data);
      setSelectedBarcodeState(data.selectedBarcode || data.barcodes?.[0]?.barcode || "");
      return;
    }

    const activeBc = (selectedBarcodeState || barcode || "").trim();
    const queryTarget = activeBc || (materialCode || "").trim();

    if (!queryTarget) {
      setInternalData(null);
      setSelectedBarcodeState("");
      return;
    }

    let isSubscribed = true;
    setLoading(true);

    api
      .getMaterialDetail(queryTarget)
      .then((matRes) => {
        if (!isSubscribed) return;

        const matListRows = Array.isArray(matRes.matList) ? matRes.matList : [];
        const matListRow = (matListRows[0] as Record<string, unknown>) || {};

        const rawSize =
          matRes.matSize ||
          (matRes as unknown as Record<string, unknown>).TBLMATSIZ ||
          (matRes as unknown as Record<string, unknown>).TBLMATSIZE ||
          ((matRes as unknown as Record<string, unknown>).raw as Record<string, unknown> | undefined)?.TBLMATSIZ ||
          ((matRes as unknown as Record<string, unknown>).raw as Record<string, unknown> | undefined)?.TBLMATSIZE;

        const matSizeRow: Record<string, unknown> = Array.isArray(rawSize)
          ? (rawSize[0] as Record<string, unknown>) || {}
          : rawSize && typeof rawSize === "object" && "ROW" in rawSize
            ? ((Array.isArray(rawSize.ROW) ? rawSize.ROW[0] : rawSize.ROW) as Record<string, unknown>) || {}
            : (rawSize as Record<string, unknown>) || {};

        const matCode = String(matListRow.MATERIAL || matListRow.STOKKODU || (materialCode || "").trim() || queryTarget);
        const matName = String(
          matListRow.NAME1 || matListRow.STEXT || matListRow.AÇIKLAMA || matListRow.MTEXT || "Malzeme"
        );
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

        const nestedSize =
          (matListRow.TBLMATSIZ as Record<string, unknown>)?.ROW ||
          matListRow.TBLMATSIZ ||
          (matListRow.TBLMATSIZE as Record<string, unknown>)?.ROW ||
          matListRow.TBLMATSIZE ||
          (matListRow.MATSIZE as Record<string, unknown>)?.ROW ||
          matListRow.MATSIZE;
        const nestedSizeRow: Record<string, unknown> =
          nestedSize && typeof nestedSize === "object" ? (nestedSize as Record<string, unknown>) : {};

        const dimSources = [
          nestedSizeRow,
          matSizeRow,
          matListRow,
          ...(matListRows as Record<string, unknown>[]),
          ...(Array.isArray(rawSize) ? (rawSize as Record<string, unknown>[]) : []),
        ];

        const plength = extractDimensionValue(
          dimSources,
          [
            "PLENGTH", "LENGTH", "UZUNLUK", "BOY", "DERINLIK", "DEPTH", "PDEPTH", "LENGHT", "PLENGHT",
            "PBOY", "PUZUNLUK", "MLENGTH", "ILENGTH", "SIZEL", "DIML", "P_LENGTH", "P_BOY", "P_UZUNLUK",
            "BOYU", "UZUNLUGU", "LONGITUDE", "LONG"
          ],
          /^(p_?)?(length|lenght|boy|uzunluk|depth|derinlik)/i
        );

        const pwidth = extractDimensionValue(
          dimSources,
          [
            "PWIDTH", "WIDTH", "EN", "GENISLIK", "PGENISLIK", "PEN", "MWIDTH", "IWIDTH", "WIDHT", "PWIDHT",
            "SIZEW", "DIMW", "P_WIDTH", "P_EN", "P_GENISLIK", "ENI", "GENISLIGI"
          ],
          /^(p_?)?(width|widht|en|genislik)/i
        );

        const pheight = extractDimensionValue(
          dimSources,
          [
            "PHEIGHT", "HEIGHT", "YUKSEKLIK", "PYUKSEKLIK", "MHEIGHT", "IHEIGHT", "HEIGTH", "PHEIGTH",
            "SIZEH", "DIMH", "P_HEIGHT", "P_YUKSEKLIK", "YUKSEKLIGI"
          ],
          /^(p_?)?(height|heigth|yukseklik)/i
        );

        const netweight = extractDimensionValue(
          dimSources,
          [
            "NETWEIGHT", "NETAGIRLIK", "NET_WEIGHT", "NET_AGIRLIK", "NWEIGHT", "NETW", "NETAGIRLIGI", "NET"
          ],
          /^net(weight|agirlik|w)?$/i
        );

        const brutweight = extractDimensionValue(
          dimSources,
          [
            "BRUTWEIGHT", "GROSSWEIGHT", "BRUTAGIRLIK", "BRUT_WEIGHT", "BRUT_AGIRLIK", "BWEIGHT", "GWEIGHT",
            "BRUTW", "GROSSW", "BRUTAGIRLIGI", "GROSSAGIRLIK", "BRUT", "GROSS"
          ],
          /^(brut|gross)(weight|agirlik|w)?$/i
        );

        const volume =
          extractDimensionValue(
            dimSources,
            ["VOLUME", "HACIM", "PVOLUME", "VOL", "HACMI", "DS", "DESI"],
            /^(p_?)?(volume|hacim|vol|desi)$/i
          ) ||
          (pwidth > 0 && plength > 0 && pheight > 0 ? Number(((pwidth * plength * pheight) / 3000).toFixed(2)) : 0);

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

        // Barkodlar
        const rawBarcodeList = Array.isArray(matRes.barcodeList) ? matRes.barcodeList : [];
        const rawUnitList = Array.isArray(matRes.unitList) ? matRes.unitList : [];
        const seenBarcodes = new Set<string>();
        const barcodes: Array<MaterialBarcodeItem> = [];
        const unitMultipliers: Record<string, number> = { AD: 1 };

        for (const u of rawUnitList) {
          const uCode = String(u.QUNIT || u.UNIT || "").trim().toUpperCase();
          const uFct = parseNum(u.PERUNIT ?? u.FCT ?? u.VALUE);
          if (uCode && uFct > 0) unitMultipliers[uCode] = uFct;
        }

        for (const b of rawBarcodeList) {
          const bCode = String(b.BARCODE || b.barcode || "").trim();
          const bUnit = String(b.BUNIT || b.UNIT || b.BARCODEUNIT || b.unit || matUnit || "AD").trim().toUpperCase();
          if (bCode && !seenBarcodes.has(bCode)) {
            seenBarcodes.add(bCode);
            barcodes.push({ barcode: bCode, unit: bUnit });
          }
        }

        // Aktif seçilen barkodu ve birimini belirle
        const currentActiveBarcode = (activeBc || queryTarget || barcodes[0]?.barcode || "").trim();
        const matchedBcRow = rawBarcodeList.find(
          (b) => String(b.BARCODE || b.barcode || "").trim().toLowerCase() === currentActiveBarcode.toLowerCase()
        );
        const currentUnit = String(
          matchedBcRow?.BUNIT || matchedBcRow?.UNIT || matListRow.BUNIT || matListRow.UNIT || matUnit || "AD"
        ).trim().toUpperCase();

        // Birim çarpanı
        const unitRow = rawUnitList.find(
          (u) => String(u.QUNIT || u.UNIT || "").trim().toUpperCase() === currentUnit
        );
        const multiplier = parseNum(unitRow?.PERUNIT ?? unitRow?.FCT ?? matListRow.QUANTITY) || 1;
        if (currentUnit && multiplier > 0 && !unitMultipliers[currentUnit]) {
          unitMultipliers[currentUnit] = multiplier;
        }

        if (currentActiveBarcode && !seenBarcodes.has(currentActiveBarcode)) {
          seenBarcodes.add(currentActiveBarcode);
          barcodes.push({ barcode: currentActiveBarcode, unit: currentUnit });
        }

        // Birime özel boyut / ağırlık değerlerini kontrol et
        const uW = parseNum(unitRow?.AKLPWIDTH);
        const uL = parseNum(unitRow?.AKLPLENGTH);
        const uH = parseNum(unitRow?.AKLPHEIGHT);
        const uVol = parseNum(unitRow?.AKLPVOLUME);
        const uNW = parseNum(unitRow?.AKLPNETWEIGHT);

        let finalWidth = pwidth;
        let finalLength = plength;
        let finalHeight = pheight;
        let finalVolume = volume;
        let finalNetWeight = netweight;
        let finalBrutWeight = brutweight;

        // 1. Boyutlar (Genişlik, Uzunluk, Yükseklik)
        if (uW > 0 && uL > 0 && uH > 0) {
          finalWidth = uW;
          finalLength = uL;
          finalHeight = uH;
        } else if (multiplier > 1 && pwidth > 0 && plength > 0 && pheight > 0) {
          const scale = Math.cbrt(multiplier);
          finalWidth = Number((pwidth * scale).toFixed(1));
          finalLength = Number((plength * scale).toFixed(1));
          finalHeight = Number((pheight * scale).toFixed(1));
        }

        // 2. Hacim / Desi
        if (uVol > 0) {
          finalVolume = uVol;
        } else if (multiplier > 1 && volume > 0) {
          finalVolume = Number((volume * multiplier).toFixed(2));
        } else if (finalWidth > 0 && finalLength > 0 && finalHeight > 0) {
          finalVolume = Number(((finalWidth * finalLength * finalHeight) / 3000).toFixed(2));
        }

        // 3. Ağırlıklar
        if (uNW > 0) {
          finalNetWeight = uNW;
        } else if (multiplier > 1 && netweight > 0) {
          finalNetWeight = Number((netweight * multiplier).toFixed(2));
        }

        if (multiplier > 1 && brutweight > 0) {
          finalBrutWeight = Number((brutweight * multiplier).toFixed(2));
        }

        const specialAttributes = {
          isexplos: checkAttr(dimSources, ["ISEXPLOS", "EXPLOSIVE", "YANICI", "PARLAYICI", "IS_EXPLOS"]),
          isspoil: checkAttr(dimSources, ["ISSPOIL", "SPOIL", "BOZULABILIR", "BOZULUR", "IS_SPOIL"]),
          aklisbreakable: checkAttr(dimSources, ["AKLISBREAKABLE", "ISBREAKABLE", "BREAKABLE", "KIRILABILIR"]),
          aklisliquid: checkAttr(dimSources, ["AKLISLIQUID", "ISLIQUID", "LIQUID", "SIVI", "AKL_ISLIQUID"]),
          aklistoxic: checkAttr(dimSources, ["AKLISTOXIC", "ISTOXIC", "TOXIC", "TOKSIK", "ZEHIRLI"]),
          isheavy: checkAttr(dimSources, ["AKLISHEAVY", "ISHEAVY", "HEAVY", "AGIR", "AGIRYUK"]),
          aklpalpos: Number(matSizeRow.AKLPALPOS ?? nestedSizeRow.AKLPALPOS) || 1,
        };

        const parsed: MaterialDetailData = {
          material: matCode,
          name: matName,
          image: matImage,
          unit: currentUnit || matUnit || "AD",
          isSpecialLot,
          barcodes,
          selectedBarcode: currentActiveBarcode || barcodes[0]?.barcode || "",
          packageMultiplier: multiplier,
          unitMultipliers,
          specialAttributes,
          dimensions: {
            width: finalWidth,
            length: finalLength,
            height: finalHeight,
            volume: finalVolume,
            netWeight: finalNetWeight,
            netWeightUnit: nwunit,
            brutWeight: finalBrutWeight,
            brutWeightUnit: bwunit,
          },
        };

        setInternalData(parsed);
        setSelectedBarcodeState(parsed.selectedBarcode || "");
      })
      .catch((err) => {
        console.warn("MaterialDetailCard getMaterialDetail hatası:", err);
      })
      .finally(() => {
        if (isSubscribed) setLoading(false);
      });

    return () => {
      isSubscribed = false;
    };
  }, [materialCode, barcode, selectedBarcodeState, data]);

  const activeMaterial = data || internalData;

  // Aktif Güvenlik / Öz Nitelik Rozetleri
  const activeSpecialAttrs = useMemo(() => {
    if (!activeMaterial) return [];
    const attrs: Array<{ id: string; label: string; icon: React.ElementType; colorClass: string }> = [];
    const sp = activeMaterial.specialAttributes;

    if (activeMaterial.isSpecialLot) {
      attrs.push({
        id: "special_lot",
        label: "Parti takipli",
        icon: Clock,
        colorClass:
          "rounded-full border border-amber-300 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-500/30 text-amber-700 dark:text-amber-300 font-bold text-[9.5px] sm:text-[10px]",
      });
    }

    if (sp?.isspoil) {
      attrs.push({
        id: "spoil",
        label: "Bozulur",
        icon: Clock,
        colorClass:
          "rounded border border-green-500/40 bg-green-500/15 text-green-800 dark:text-green-300 font-black text-[9px] sm:text-[9.5px]",
      });
    }

    if (sp?.isexplos) {
      attrs.push({
        id: "explos",
        label: "Yanıcı",
        icon: Flame,
        colorClass:
          "rounded border border-rose-500/40 bg-rose-500/15 text-rose-800 dark:text-rose-300 font-black text-[9px] sm:text-[9.5px]",
      });
    }

    if (sp?.aklisliquid) {
      attrs.push({
        id: "liquid",
        label: "Sıvı",
        icon: Droplets,
        colorClass:
          "rounded border border-blue-500/40 bg-blue-500/15 text-blue-800 dark:text-blue-300 font-black text-[9px] sm:text-[9.5px]",
      });
    }

    if (sp?.aklistoxic) {
      attrs.push({
        id: "toxic",
        label: "Toksik",
        icon: Skull,
        colorClass:
          "rounded border border-purple-500/40 bg-purple-500/15 text-purple-800 dark:text-purple-300 font-black text-[9px] sm:text-[9.5px]",
      });
    }

    if (sp?.isheavy) {
      attrs.push({
        id: "heavy",
        label: "Ağır Yük",
        icon: Layers,
        colorClass:
          "rounded border border-indigo-500/40 bg-indigo-500/15 text-indigo-800 dark:text-indigo-300 font-black text-[9px] sm:text-[9.5px]",
      });
    }

    if (sp?.aklisbreakable) {
      attrs.push({
        id: "breakable",
        label: "Kırılabilir",
        icon: GlassWater,
        colorClass:
          "rounded border border-yellow-300/80 bg-yellow-50 text-yellow-900 dark:bg-yellow-950/40 dark:border-yellow-500/30 dark:text-yellow-300 font-black text-[9px] sm:text-[9.5px]",
      });
    }

    return attrs;
  }, [activeMaterial]);

  // Barkod değişimi
  const handleBarcodeChange = (newBc: string) => {
    setSelectedBarcodeState(newBc);
    if (onBarcodeSelect) {
      onBarcodeSelect(newBc);
    }
  };

  const handleEditClick = () => {
    if (onEditDimensions && activeMaterial) {
      onEditDimensions(activeMaterial);
    }
  };

  if (loading && !activeMaterial) {
    return (
      <div
        className={`rounded-3xl border border-line bg-surface p-4 shadow-card flex flex-col items-center justify-center min-h-[205px] ${className}`}
      >
        <Loader2 className="h-6 w-6 animate-spin text-brand-600 mb-2" />
        <span className="text-xs font-semibold text-subtle">Malzeme bilgileri yükleniyor…</span>
      </div>
    );
  }

  if (!activeMaterial) {
    return (
      <div
        className={`rounded-3xl border border-line bg-surface p-4 shadow-card flex flex-col items-center justify-center min-h-[140px] text-center text-subtle text-xs gap-2 ${className}`}
      >
        <Package className="h-7 w-7 text-subtle/40" />
        <span className="font-medium">Malzeme seçildiğinde detaylar burada görüntülenecektir.</span>
      </div>
    );
  }

  const dims = activeMaterial.dimensions;
  const hasDimensions = Boolean(dims && dims.width > 0 && dims.length > 0 && dims.height > 0);
  const desiCalculated =
    dims?.volume && dims.volume > 0
      ? dims.volume
      : dims?.width && dims.length && dims.height
        ? Number(((dims.width * dims.length * dims.height) / 3000).toFixed(2))
        : 0;

  return (
    <div
      className={`rounded-3xl border border-line bg-surface pt-1 pb-1 px-2.5 sm:pt-1 sm:pb-1 sm:px-2.5 shadow-card flex flex-col justify-start min-w-0 ${className}`}
    >
      <div className="w-full flex flex-col justify-start gap-1">
        {/* 1. Satır: En Üstte Malzeme İsmi */}
        <div className="flex items-center justify-between gap-2 border-b border-line/40 pt-0 pb-1 min-w-0">
          <h4
            className="font-black text-fg text-[15px] sm:text-base leading-snug truncate flex-1 min-w-0 tracking-tight flex items-center gap-1.5"
            title={activeMaterial.name}
          >
            <span className="truncate">{activeMaterial.name}</span>
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-600 shrink-0" />}
          </h4>
        </div>

        {/* 2. Satır: Fotoğraf + 3D Şema + Sağ Bilgi & Barkod Paneli */}
        <div className="flex items-stretch gap-0 w-full min-w-0 pt-0.5 pb-0 min-h-0">
          {/* 1. Bölüm: Solda Ürün Görseli ve Altında Ürün Kodu */}
          <div className="flex flex-col items-center shrink-0 mr-1.5 self-start w-24 sm:w-26 min-w-0">
            <div className="h-24 w-24 sm:h-26 sm:w-26 rounded-2xl overflow-hidden shrink-0 border border-line bg-elevated/40 flex items-center justify-center shadow-xs">
              {activeMaterial.image ? (
                <img
                  src={activeMaterial.image}
                  alt={activeMaterial.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex flex-col items-center justify-center text-subtle/70 gap-1 p-1 text-center">
                  <ImageIcon className="h-5 w-5 text-subtle/50" />
                  <span className="text-[8px] font-bold">Fotoğraf Yok</span>
                </div>
              )}
            </div>

            <span
              className="mt-1 w-full text-center font-mono font-bold text-[11px] sm:text-xs text-fg truncate select-all"
              title={activeMaterial.material}
            >
              {activeMaterial.material}
            </span>
          </div>

          {/* Çizgi 1: Resim ile 3D Model Arasındaki Ayırıcı Çizgi */}
          <div className="w-px bg-line shrink-0 self-stretch mr-1" />

          {/* 2. Bölüm: 3D Şema */}
          <div className="shrink-0 flex items-start justify-start overflow-visible self-start">
            {hasDimensions ? (
              <div className="relative flex flex-col items-center">
                <Dimension3DBoxVisual
                  width={dims!.width}
                  length={dims!.length}
                  height={dims!.height}
                  unit="CM"
                  compact={compact}
                />
                {showEditButton && onEditDimensions && (
                  <button
                    type="button"
                    onClick={handleEditClick}
                    className="absolute left-[88px] bottom-[3px] inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-brand-500/15 hover:bg-brand-500/25 text-brand-700 dark:text-brand-300 border border-brand-500/30 transition cursor-pointer font-sans text-[9px] font-black shadow-2xs active:scale-95 group leading-none z-10 whitespace-nowrap"
                    title="Ölçü ve Boyutları Değiştir"
                  >
                    <span>Ölçüm Değiştir</span>
                    <Pencil className="h-2 w-2 text-brand-600 dark:text-brand-400 group-hover:rotate-12 transition-transform shrink-0" />
                  </button>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center text-center p-1.5 gap-1 text-subtle/70 my-auto ml-2">
                <Ruler className="h-4 w-4 text-amber-500/60" />
                <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                  Ölçü tanımlanmamış
                </span>
                {showEditButton && onEditDimensions && (
                  <button
                    type="button"
                    onClick={handleEditClick}
                    className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-brand-500/15 hover:bg-brand-500/25 text-brand-700 dark:text-brand-300 border border-brand-500/30 transition cursor-pointer font-sans text-[9.5px] font-black shadow-2xs active:scale-95 group leading-none"
                    title="Ölçü Ekle"
                  >
                    <span>Ölçüm Ekle</span>
                    <Pencil className="h-2.5 w-2.5 text-brand-600 dark:text-brand-400 shrink-0" />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Çizgi 2: Boy Yazısının Sağındaki Ayırıcı Çizgi */}
          <div className="w-px bg-line shrink-0 self-stretch ml-1.5 mr-2" />

          {/* 3. Bölüm: Sağ Bilgi & Barkod Paneli */}
          <div className="flex-1 min-w-0 flex flex-col justify-between min-h-0">
            {/* Üst Kısım: 2x2 Simetrik Grid (Stok Birimi, Net, Desi, Brüt) */}
            <div className="grid grid-cols-2 gap-x-2.5 gap-y-1 text-xs sm:text-[12px] leading-tight">
              <div className="flex items-center gap-1 min-w-0">
                <span className="text-subtle font-bold text-[11px] sm:text-[11.5px] shrink-0">Stok Birimi:</span>
                <span className="font-mono font-black text-fg text-xs sm:text-[12.5px] truncate">
                  {activeMaterial.unit || "AD"}
                </span>
              </div>

              <div className="flex items-center gap-1 min-w-0">
                <span className="text-subtle font-bold text-[11px] sm:text-[11.5px] shrink-0">Net:</span>
                <span className="font-mono font-black text-fg text-xs sm:text-[12.5px] truncate">
                  {dims?.netWeight ?? 0} {dims?.netWeightUnit || "KG"}
                </span>
              </div>

              <div className="flex items-center gap-1 min-w-0">
                <span className="text-subtle font-bold text-[11.5px] sm:text-[11.5px] shrink-0">Desi:</span>
                <span className="font-mono font-black text-fg text-xs sm:text-[12.5px] truncate">
                  {desiCalculated} DS
                </span>
              </div>

              <div className="flex items-center gap-1 min-w-0">
                <span className="text-subtle font-bold text-[11px] sm:text-[11.5px] shrink-0">Brüt:</span>
                <span className="font-mono font-black text-fg text-xs sm:text-[12.5px] truncate">
                  {dims?.brutWeight ?? 0} {dims?.brutWeightUnit || "KG"}
                </span>
              </div>
            </div>

            {/* Orta Kısım: Güvenlik / Nitelik Rozetleri */}
            {activeSpecialAttrs.length > 0 && (
              <div className="flex flex-wrap items-center gap-1 my-1 pt-1 border-t border-line/40">
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

            {/* Alt Kısım: Barkod Listesi / Combobox */}
            {activeMaterial.barcodes && activeMaterial.barcodes.length > 0 && (
              <div className="w-full mt-1 pt-1 pb-0.5 border-t border-line/40 flex items-center justify-start">
                <div className="relative inline-flex items-center w-auto max-w-full">
                  <select
                    value={selectedBarcodeState || activeMaterial.selectedBarcode}
                    onChange={(e) => handleBarcodeChange(e.target.value)}
                    className="text-[10px] sm:text-[10.5px] font-mono font-black py-0 pl-1.5 pr-5 h-5.5 sm:h-6 rounded-md border border-line bg-surface text-fg shadow-2xs cursor-pointer focus:outline-none focus:border-brand-500 appearance-none w-auto tracking-wide shrink-0 leading-none"
                    title="Barkod Seçimi"
                  >
                    {activeMaterial.barcodes.map((b) => {
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
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MaterialDetailCard;
