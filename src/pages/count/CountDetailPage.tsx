import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ChevronLeft,
  Warehouse,
  MapPin,
  Package,
  Loader2,
  Trash2,
  Plus,
  Minus,
  Info,
  CheckCheck,
} from "lucide-react";
import BarcodeScanner from "../../components/BarcodeScanner";
import ToastView, { useToast } from "../../components/Toast";
import { api } from "../../api/client";
import { sesBasarili, sesHata } from "../../sound";
import type { AdjustmentOrder, AdjustmentLine } from "../../types";

function isoDateToBatch(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((iso ?? "").trim());
  return m ? `${m[1]}${m[2]}${m[3]}` : "";
}

function validateBatch(batch: string): { valid: boolean; error?: string } {
  const clean = batch.trim();
  if (!clean) return { valid: false, error: "Parti bilgisi boş olamaz!" };

  // Tarih tabanlı parti kontrolü: YYYY-MM-DD, YYYYMMDD veya DD.MM.YYYY
  let year: number | null = null;
  let month: number | null = null;
  let day: number | null = null;

  const mIso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clean);
  const mNum = /^(\d{4})(\d{2})(\d{2})$/.exec(clean);
  const mDot = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(clean);

  if (mIso) {
    year = parseInt(mIso[1], 10);
    month = parseInt(mIso[2], 10);
    day = parseInt(mIso[3], 10);
  } else if (mNum) {
    year = parseInt(mNum[1], 10);
    month = parseInt(mNum[2], 10);
    day = parseInt(mNum[3], 10);
  } else if (mDot) {
    day = parseInt(mDot[1], 10);
    month = parseInt(mDot[2], 10);
    year = parseInt(mDot[3], 10);
  }

  if (year !== null && month !== null && day !== null) {
    // Yıl henüz 4 basamaklı tamamlanmadıysa (örn. kullanıcı yazarken 0002, 0020 vb.) uyarı verme
    if (year < 1000) {
      return { valid: true };
    }

    if (month < 1 || month > 12 || day < 1 || day > 31 || year > 2100) {
      return { valid: false, error: "Geçersiz tarih formatı!" };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const targetDate = new Date(year, month - 1, day);
    targetDate.setHours(0, 0, 0, 0);

    if (targetDate < today) {
      return { valid: false, error: "Geçmiş tarihli parti girilemez!" };
    }
  }

  return { valid: true };
}

type ActiveCountItem = {
  lineId: string;
  material: string;
  name: string;
  barcode: string;
  quantity: number; // Kullanıcının o an girdiği / değiştirdiği miktar
  targetQty: number; // Hedef / Sistem miktarı
  unit: string; // Okutulan birim (KO, PK, AD vb.)
  skunit: string; // Stok birimi (AD)
  multiplier: number; // Birim çarpanı (örn: 1 KO = 24 AD)
  batchNum?: string;
  specialStock?: string;
  isLotTracked?: boolean;
  warehouse?: string;
  stockPlace?: string;
};

type LotPendingItem = {
  material: string;
  name: string;
  barcode: string;
  unit: string;
  skunit?: string;
  multiplier?: number;
  specialStock?: string;
  warehouse?: string;
  stockPlace?: string;
  batches: { batchNum: string; availStock: number; unit?: string; lineId?: string }[];
};

type CountTab = "shelf" | "barcode" | "lot" | "qty";

export default function CountDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const orderType = searchParams.get("type") || searchParams.get("docType") || "";
  const invDocNum = searchParams.get("invDocNum") || id || "";
  const warehouseParam = searchParams.get("warehouse") || searchParams.get("wh") || "";

  const [order, setOrder] = useState<AdjustmentOrder | null>(null);
  const [lines, setLines] = useState<AdjustmentLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shelfBusy, setShelfBusy] = useState(false);
  const [, setFlashLineId] = useState<string | null>(null);
  const [tab, setTab] = useState<CountTab>("shelf");
  
  // Raf / Depo state (Format: 00$* veya 01$A-01-01)
  const [selectedShelf, setSelectedShelf] = useState<string | null>(null);
  const [selectedWarehouse, setSelectedWarehouse] = useState<string | null>(null);
  const [selectedStockPlace, setSelectedStockPlace] = useState<string | null>(null);

  const [activeItem, setActiveItem] = useState<ActiveCountItem | null>(null);
  const [lotPendingItem, setLotPendingItem] = useState<LotPendingItem | null>(null);
  const prefetchedBatchesRef = useRef<Map<string, { batchNum: string; availStock: number; unit?: string }[]>>(new Map());

  const { toast, show } = useToast();
  const istendi = useRef(false);

  const loadAdjustmentDetail = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.getAdjustmentOrder({
        orderNum: invDocNum,
        orderType,
        invDocNum,
        invDocType: orderType,
        warehouse: warehouseParam,
      });

      if (data) {
        setOrder(data);
        if (data.lines && data.lines.length > 0) {
          setLines(data.lines);
          // Belgedeki partili malzemeleri arka planda önceden sorgula (prefetch getStock)
          const uniqueMats = Array.from(new Set(data.lines.map((l) => l.material.trim()))).filter(Boolean);
          for (const mat of uniqueMats) {
            const matLines = data.lines.filter((l) => sadelestir(l.material) === sadelestir(mat));
            const isLot = matLines.some((l) => l.specialStock === "1" || (l.batchNum && l.batchNum !== "*"));
            if (isLot) {
              const wh = matLines[0].warehouse || data.warehouse || warehouseParam || "01";
              api.getStock(mat, wh, "").then((stockBatches) => {
                if (stockBatches && stockBatches.length > 0) {
                  prefetchedBatchesRef.current.set(
                    mat.toUpperCase(),
                    stockBatches.filter((b) => b.batchNum && b.batchNum !== "*")
                  );
                }
              }).catch(() => {});
            }
          }
        } else {
          setLines([
            {
              id: "1",
              material: "MLZ001",
              name: "A4 Fotokopi Kağıdı 80gr 500lü",
              barcode: "869001001",
              targetQty: 10,
              countedQty: 0,
              unit: "KO",
              skunit: "PK",
              multiplier: 5,
              stockPlace: data.stockPlace || "A-01-01",
              warehouse: data.warehouse || "01",
            },
            {
              id: "2",
              material: "MLZ002",
              name: "Tükenmez Kalem Mavi 50li Kutu",
              barcode: "869001002",
              targetQty: 50,
              countedQty: 0,
              unit: "AD",
              skunit: "AD",
              multiplier: 1,
              stockPlace: data.stockPlace || "A-01-02",
              warehouse: data.warehouse || "01",
            },
            {
              id: "3",
              material: "MLZ003",
              name: "Zımba Teli No:10 Paket",
              barcode: "869001003",
              targetQty: 24,
              countedQty: 24,
              unit: "PK",
              skunit: "AD",
              multiplier: 10,
              stockPlace: data.stockPlace || "A-01-03",
              warehouse: data.warehouse || "01",
            },
          ]);
        }
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [id, orderType, invDocNum, warehouseParam]);

  useEffect(() => {
    if (istendi.current) return;
    istendi.current = true;
    loadAdjustmentDetail();
  }, [loadAdjustmentDetail]);

  const flash = (lineId: string) => {
    setFlashLineId(lineId);
    setTimeout(() => setFlashLineId(null), 600);
  };

  const sadelestir = (s: string) => s.trim().toLowerCase().replace(/^0+/, "");

  // Raf okutma/girme (CANIAS MZYReadBarcodeSP ve GetStockPlace ile doğrulama)
  const handleSelectShelf = useCallback(
    async (shelfInput: string) => {
      const clean = shelfInput.trim();
      if (!clean || shelfBusy) return;

      setShelfBusy(true);
      const defaultWh = order?.warehouse || warehouseParam || "01";
      let inputWh = defaultWh;
      let inputSp = clean;

      if (clean.includes("$")) {
        const parts = clean.split("$");
        inputWh = parts[0].trim() || defaultWh;
        inputSp = parts.slice(1).join("$").trim() || "*";
      }

      try {
        let isValid = false;
        let confirmedWh = inputWh;
        let confirmedSp = inputSp;

        // 1. CANIAS MZYReadBarcodeSP ile sorgula
        try {
          const shelfRes = await api.readShelfBarcode(clean);
          if (shelfRes.ok && (shelfRes.warehouse || shelfRes.stockPlace)) {
            confirmedWh = shelfRes.warehouse || inputWh;
            confirmedSp = shelfRes.stockPlace || inputSp;
            isValid = true;
          }
        } catch {
          // Fallback to stock places list
        }

        // 2. MZYReadBarcodeSP ile bulunamadıysa GetStockPlace ile depodaki rafları sorgula
        if (!isValid) {
          try {
            const knownPlaces = await api.getStockPlaces(inputWh);
            if (inputSp === "*" && (inputWh === "00" || knownPlaces.length > 0)) {
              isValid = true;
              confirmedWh = inputWh;
              confirmedSp = "*";
            } else if (knownPlaces && knownPlaces.length > 0) {
              const found = knownPlaces.find(
                (p) =>
                  p.code.toUpperCase() === inputSp.toUpperCase() ||
                  p.name.toUpperCase() === inputSp.toUpperCase() ||
                  sadelestir(p.code) === sadelestir(inputSp) ||
                  p.code.toUpperCase() === clean.toUpperCase()
              );
              if (found) {
                confirmedWh = inputWh;
                confirmedSp = found.code;
                isValid = true;
              }
            }
          } catch {
            // Error handling
          }
        }

        // 3. Geçerlilik Kontrolü
        if (!isValid) {
          sesHata();
          show({
            kind: "error",
            text: `"${clean}" — Bu raf CANIAS sisteminde bulunamadı! Lütfen geçerli bir raf okutun.`,
          });
          return;
        }

        // Başarılı: Rafı seç ve Barkod okutma tabına geç
        const fullCode = `${confirmedWh}$${confirmedSp}`;
        setSelectedWarehouse(confirmedWh);
        setSelectedStockPlace(confirmedSp);
        setSelectedShelf(fullCode);
        setActiveItem(null);
        setLotPendingItem(null);
        setTab("barcode");
        sesBasarili();
        show({
          kind: "ok",
          text: `Raf (${fullCode}) doğrulandı. Malzeme barkodunu okutun.`,
        });
      } catch (err: unknown) {
        sesHata();
        show({
          kind: "error",
          text: err instanceof Error ? err.message : "Raf sorgulanırken bir hata oluştu.",
        });
      } finally {
        setShelfBusy(false);
      }
    },
    [order, warehouseParam, shelfBusy, show]
  );

  const handleSelectBatch = useCallback(
    (batchVal: string, candidateLines?: AdjustmentLine[], pendingContext?: LotPendingItem | null) => {
      const rawBatch = batchVal.trim();
      if (!rawBatch) return;

      // Geçmiş tarih ve yıl > 2100 doğrulaması
      const validation = validateBatch(rawBatch);
      if (!validation.valid) {
        sesHata();
        show({
          kind: "error",
          text: validation.error || "Geçersiz parti bilgisi!",
        });
        return;
      }

      const currentPending = pendingContext !== undefined ? pendingContext : lotPendingItem;
      const searchLines = candidateLines || lines;

      const mat = currentPending ? currentPending.material : (activeItem ? activeItem.material : "");
      const matName = currentPending ? currentPending.name : (activeItem ? activeItem.name : mat);
      const barcode = currentPending ? currentPending.barcode : (activeItem ? activeItem.barcode : "");
      const baseUnit = currentPending ? currentPending.unit : (activeItem ? activeItem.unit : "AD");
      const baseSkunit = currentPending ? currentPending.skunit : (activeItem ? activeItem.skunit : baseUnit);
      const baseMult = currentPending ? currentPending.multiplier : (activeItem ? activeItem.multiplier : 1);

      const currentShelfUpper = selectedStockPlace && selectedStockPlace !== "*" ? selectedStockPlace.trim().toUpperCase() : null;
      const matchedLine = searchLines.find(
        (l) =>
          sadelestir(l.material) === sadelestir(mat) &&
          l.batchNum &&
          l.batchNum.trim().toUpperCase() === rawBatch.toUpperCase() &&
          (!currentShelfUpper || (l.stockPlace && l.stockPlace.trim().toUpperCase() === currentShelfUpper))
      );

      sesBasarili();
      const mult = baseMult && baseMult > 0 ? baseMult : (matchedLine?.multiplier || 1);
      const unit = (baseUnit || matchedLine?.unit || "AD").toUpperCase();
      const skunit = (baseSkunit || matchedLine?.skunit || unit).toUpperCase();

      if (matchedLine) {
        flash(matchedLine.id);
        const existingCountedInUnit = matchedLine.countedQty > 0
          ? Math.round((matchedLine.countedQty / mult) * 100) / 100
          : 1;

        setActiveItem({
          lineId: matchedLine.id,
          material: matchedLine.material,
          name: matchedLine.name,
          barcode: matchedLine.barcode || barcode,
          quantity: existingCountedInUnit,
          targetQty: matchedLine.targetQty,
          unit,
          skunit,
          multiplier: mult,
          batchNum: matchedLine.batchNum,
          specialStock: matchedLine.specialStock || "1",
          isLotTracked: true,
          warehouse: matchedLine.warehouse || selectedWarehouse || order?.warehouse,
          stockPlace: matchedLine.stockPlace || selectedStockPlace || selectedShelf || order?.stockPlace,
        });
      } else {
        const newLineId = `new-lot-${Date.now()}`;
        setActiveItem({
          lineId: newLineId,
          material: mat,
          name: matName,
          barcode,
          quantity: 1,
          targetQty: 0,
          unit,
          skunit,
          multiplier: mult,
          batchNum: rawBatch,
          specialStock: "1",
          isLotTracked: true,
          warehouse: selectedWarehouse || order?.warehouse,
          stockPlace: selectedStockPlace || selectedShelf || order?.stockPlace,
        });
      }

      setLotPendingItem(null);
      setTab("qty");
      show({
        kind: "ok",
        text: `Parti (${rawBatch}) seçildi. Miktar girip onaylayın.`,
      });
    },
    [lines, order, show, activeItem, lotPendingItem, selectedShelf, selectedWarehouse, selectedStockPlace]
  );

  const handleBackToLot = useCallback(
    (item: ActiveCountItem) => {
      // Belgedeki tüm partileri tara
      const matLines = lines.filter((l) => sadelestir(l.material) === sadelestir(item.material));
      const batchMap = new Map<string, { batchNum: string; availStock: number; unit?: string }>();
      for (const l of matLines) {
        if (l.batchNum && l.batchNum !== "*") {
          const key = l.batchNum.toUpperCase();
          if (!batchMap.has(key)) {
            batchMap.set(key, { batchNum: l.batchNum, availStock: l.targetQty, unit: l.unit });
          }
        }
      }

      setLotPendingItem({
        material: item.material,
        name: item.name,
        barcode: item.barcode,
        unit: item.unit,
        skunit: item.skunit,
        multiplier: item.multiplier,
        specialStock: item.specialStock || "1",
        warehouse: item.warehouse || selectedWarehouse || order?.warehouse,
        stockPlace: item.stockPlace || selectedStockPlace || selectedShelf || order?.stockPlace,
        batches: Array.from(batchMap.values()),
      });
      setActiveItem(null);
      setTab("lot");

      // Depo genelindeki tüm partileri CANIAS'tan sorgula (stockPlace filtresi göndermeden)
      api.getStock(
        item.material,
        item.warehouse || selectedWarehouse || order?.warehouse || "01",
        "" // Depo genelindeki tüm partileri getir
      ).then((stockBatches) => {
        if (stockBatches && stockBatches.length > 0) {
          for (const cb of stockBatches) {
            if (cb.batchNum && cb.batchNum !== "*") {
              const key = cb.batchNum.toUpperCase();
              if (!batchMap.has(key)) {
                batchMap.set(key, { ...cb });
              }
            }
          }
          setLotPendingItem((prev) => {
            if (!prev || sadelestir(prev.material) !== sadelestir(item.material)) return prev;
            return {
              ...prev,
              batches: Array.from(batchMap.values()),
            };
          });
        }
      }).catch(() => {});
    },
    [lines, order, selectedShelf, selectedWarehouse, selectedStockPlace]
  );

  const handleDetected = useCallback(
    async (code: string) => {
      const rawCode = code.trim();
      if (!rawCode) return;
      const hedef = sadelestir(rawCode);

      // 1. Raf Tabındayken okutma yapıldıysa doğrudan raf olarak kaydet
      if (tab === "shelf") {
        handleSelectShelf(rawCode);
        return;
      }

      // 2. Parti Tabındayken okutma yapıldıysa doğrudan parti olarak kaydet
      if (lotPendingItem || tab === "lot") {
        handleSelectBatch(rawCode, lines, lotPendingItem);
        return;
      }

      // 3. Barkod tabındayken kullanıcı doğrudan depo$raf barkodu okuttuysa rafa geçir
      if (rawCode.includes("$")) {
        handleSelectShelf(rawCode);
        return;
      }

      setBusy(true);
      let barcodeMat = "";
      let barcodeName = "";
      let barcodeUnit = "AD";
      let barcodeSkunit = "AD";
      let barcodeMult = 1;
      let barcodeLot: string | undefined;
      let barcodeSpecialStock = "0";

      try {
        const res = await api.readBarcode(
          rawCode,
          selectedWarehouse || order?.warehouse || "01",
          selectedStockPlace || order?.stockPlace || ""
        );

        if (res.ok && res.material) {
          barcodeMat = res.material;
          barcodeName = res.name || res.material;
          barcodeUnit = (res.unit || "AD").toUpperCase();
          barcodeSkunit = (res.skunit || barcodeUnit).toUpperCase();
          barcodeMult = res.multiplier && res.multiplier > 0 ? res.multiplier : 1;
          barcodeLot = res.lot && res.lot !== "*" ? res.lot : undefined;
          barcodeSpecialStock = res.specialStock || "0";
        }
      } catch {} finally {
        setBusy(false);
      }

      // Belgedeki eşleşen kalemleri bul
      const matches = lines.filter(
        (l) =>
          (l.barcode && sadelestir(l.barcode) === hedef) ||
          sadelestir(l.material) === hedef ||
          (barcodeMat && sadelestir(l.material) === sadelestir(barcodeMat))
      );

      const hasSpecificShelf = Boolean(selectedStockPlace && selectedStockPlace !== "*");
      const currentShelfUpper = hasSpecificShelf ? selectedStockPlace!.trim().toUpperCase() : null;

      // 1. Seçili raf ile birebir eşleşen kalemler
      const shelfMatched = currentShelfUpper
        ? matches.filter((l) => l.stockPlace && l.stockPlace.trim().toUpperCase() === currentShelfUpper)
        : matches;

      // 1a. Seçili rafta ürün kalemi bulunduysa o satırı seç
      if (shelfMatched.length > 0) {
        const mat = shelfMatched[0].material;
        const matName = barcodeName || shelfMatched[0].name;
        const finalUnit = barcodeUnit || shelfMatched[0].unit || "AD";
        const finalSkunit = barcodeSkunit || shelfMatched[0].skunit || finalUnit;
        const finalMult = barcodeMult > 1 ? barcodeMult : (shelfMatched[0].multiplier || 1);

        // Belgedeki tüm partili satırları bul
        const allMatLines = lines.filter((l) => sadelestir(l.material) === sadelestir(mat));
        const linesWithBatch = allMatLines.filter((l) => l.batchNum && l.batchNum !== "*");
        const isLotTracked =
          barcodeSpecialStock === "1" ||
          allMatLines.some((l) => l.specialStock === "1") ||
          shelfMatched.some((l) => l.specialStock === "1") ||
          linesWithBatch.length > 0;

        if (isLotTracked && !barcodeLot) {
          // CANIAS'tan depo genelindeki partileri sorgula
          let caniasBatches: { batchNum: string; availStock: number; unit?: string }[] = [];
          try {
            const stockBatches = await api.getStock(
              mat,
              selectedWarehouse || order?.warehouse || shelfMatched[0].warehouse || "01",
              "" // Depo genelindeki partileri getir
            );
            caniasBatches = stockBatches.filter((b) => b.batchNum && b.batchNum !== "*");
          } catch {}

          const batchMap = new Map<string, { batchNum: string; availStock: number; unit?: string; lineId?: string }>();
          for (const cb of caniasBatches) {
            batchMap.set(cb.batchNum.toUpperCase(), { ...cb });
          }
          for (const l of linesWithBatch) {
            if (l.batchNum) {
              const key = l.batchNum.toUpperCase();
              if (batchMap.has(key)) {
                batchMap.get(key)!.lineId = l.id;
              } else {
                batchMap.set(key, {
                  batchNum: l.batchNum,
                  availStock: l.targetQty,
                  unit: l.unit,
                  lineId: l.id,
                });
              }
            }
          }

          const allBatches = Array.from(batchMap.values());

          sesBasarili();
          setLotPendingItem({
            material: mat,
            name: matName,
            barcode: rawCode,
            unit: finalUnit,
            skunit: finalSkunit,
            multiplier: finalMult,
            specialStock: "1",
            warehouse: selectedWarehouse || shelfMatched[0].warehouse || order?.warehouse,
            stockPlace: selectedStockPlace || shelfMatched[0].stockPlace || selectedShelf || order?.stockPlace,
            batches: allBatches,
          });
          setActiveItem(null);
          setTab("lot");
          show({
            kind: "ok",
            text: `${matName} partili ürün. Lütfen parti seçin.`,
          });
          return;
        }

        const matchedLine =
          (barcodeLot ? shelfMatched.find((m) => m.batchNum && m.batchNum.toUpperCase() === barcodeLot!.toUpperCase()) : null) ||
          shelfMatched.find((m) => activeItem && m.id === activeItem.lineId) ||
          shelfMatched.find((m) => m.targetQty > 0 && m.countedQty < m.targetQty) ||
          shelfMatched[0];

        sesBasarili();
        flash(matchedLine.id);
        const existingCountedInUnit = matchedLine.countedQty > 0
          ? Math.round((matchedLine.countedQty / finalMult) * 100) / 100
          : 1;

        setLotPendingItem(null);
        setActiveItem({
          lineId: matchedLine.id,
          material: matchedLine.material,
          name: matchedLine.name,
          barcode: matchedLine.barcode || rawCode,
          quantity: existingCountedInUnit,
          targetQty: matchedLine.targetQty,
          unit: finalUnit,
          skunit: finalSkunit,
          multiplier: finalMult,
          batchNum: barcodeLot || matchedLine.batchNum,
          specialStock: matchedLine.specialStock,
          isLotTracked: Boolean(isLotTracked),
          warehouse: matchedLine.warehouse || selectedWarehouse || order?.warehouse,
          stockPlace: matchedLine.stockPlace || selectedStockPlace || selectedShelf || order?.stockPlace,
        });
        setTab("qty");

        show({
          kind: "ok",
          text: `${matchedLine.material}${matchedLine.stockPlace ? ` (${matchedLine.stockPlace})` : ""} seçildi. Miktar girip onaylayın.`,
        });
        return;
      }

      // 1b. Ürün belgede başka bir rafta var VEYA barkod sorgusundan bulundu (ancak seçili rafta henüz satırı yok)
      if (matches.length > 0 || barcodeMat) {
        const refLine = matches[0];
        const mat = refLine ? refLine.material : barcodeMat;
        const matName = barcodeName || refLine?.name || mat;
        const finalUnit = barcodeUnit || refLine?.unit || "AD";
        const finalSkunit = barcodeSkunit || refLine?.skunit || finalUnit;
        const finalMult = barcodeMult > 1 ? barcodeMult : (refLine?.multiplier || 1);
        const specialStock = barcodeSpecialStock === "1" || refLine?.specialStock === "1" ? "1" : "0";

        // Partili mi kontrol et
        const allMatLines = lines.filter((l) => sadelestir(l.material) === sadelestir(mat));
        const linesWithBatch = allMatLines.filter((l) => l.batchNum && l.batchNum !== "*");
        const isLotTracked = specialStock === "1" || (barcodeLot && barcodeLot !== "*") || linesWithBatch.length > 0;

        if (isLotTracked && !barcodeLot) {
          let batches: { batchNum: string; availStock: number; unit?: string }[] = [];
          try {
            batches = await api.getStock(
              mat,
              selectedWarehouse || order?.warehouse || "01",
              ""
            );
          } catch {}

          const validBatches = batches.filter((b) => b.batchNum && b.batchNum !== "*");

          sesBasarili();
          setLotPendingItem({
            material: mat,
            name: matName,
            barcode: rawCode,
            unit: finalUnit,
            skunit: finalSkunit,
            multiplier: finalMult,
            specialStock: "1",
            warehouse: selectedWarehouse || order?.warehouse,
            stockPlace: selectedStockPlace || selectedShelf || order?.stockPlace,
            batches: validBatches,
          });
          setActiveItem(null);
          setTab("lot");
          show({
            kind: "ok",
            text: `${matName} partili ürün. Lütfen parti seçin.`,
          });
          return;
        }

        sesBasarili();
        const newLineId = `new-${Date.now()}`;
        setLotPendingItem(null);
        setActiveItem({
          lineId: newLineId,
          material: mat,
          name: matName,
          barcode: refLine?.barcode || rawCode,
          quantity: 1,
          targetQty: 0,
          unit: finalUnit,
          skunit: finalSkunit,
          multiplier: finalMult,
          batchNum: barcodeLot,
          specialStock,
          isLotTracked: Boolean(isLotTracked),
          warehouse: selectedWarehouse || order?.warehouse,
          stockPlace: selectedStockPlace || selectedShelf || order?.stockPlace,
        });
        setTab("qty");

        show({
          kind: "ok",
          text: `${mat}${selectedStockPlace ? ` (${selectedStockPlace})` : ""} yeni raf kalemi olarak açıldı. Miktar girip ekleyin.`,
        });
        return;
      }

      sesHata();
      show({
        kind: "error",
        text: `${rawCode} barkodu bulunamadı`,
      });
    },
    [lines, order, show, activeItem, lotPendingItem, tab, selectedShelf, selectedWarehouse, selectedStockPlace, handleSelectBatch, handleSelectShelf]
  );

  const handleCommitActiveItem = () => {
    if (!activeItem) return;
    const mult = activeItem.multiplier && activeItem.multiplier > 0 ? activeItem.multiplier : 1;
    const baseCountedQty = Math.max(0, activeItem.quantity) * mult;

    setLines((prev) => {
      const idx = prev.findIndex((l) => l.id === activeItem.lineId);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = {
          ...updated[idx],
          countedQty: baseCountedQty,
          unit: activeItem.unit,
          skunit: activeItem.skunit,
          multiplier: mult,
          batchNum: activeItem.batchNum || updated[idx].batchNum,
          stockPlace: activeItem.stockPlace || updated[idx].stockPlace || selectedStockPlace || undefined,
          warehouse: activeItem.warehouse || updated[idx].warehouse || selectedWarehouse || undefined,
        };
        return updated;
      } else {
        const newLine: AdjustmentLine = {
          id: activeItem.lineId,
          material: activeItem.material,
          name: activeItem.name,
          barcode: activeItem.barcode,
          targetQty: activeItem.targetQty || 0,
          countedQty: baseCountedQty,
          unit: activeItem.unit,
          skunit: activeItem.skunit,
          multiplier: mult,
          batchNum: activeItem.batchNum,
          specialStock: activeItem.specialStock,
          stockPlace: activeItem.stockPlace || selectedStockPlace || undefined,
          warehouse: activeItem.warehouse || selectedWarehouse || order?.warehouse || undefined,
        };
        return [newLine, ...prev];
      }
    });

    sesBasarili();
    flash(activeItem.lineId);
    show({
      kind: "ok",
      text: `${activeItem.material} için ${activeItem.quantity} ${activeItem.unit} (${baseCountedQty} ${activeItem.skunit}) kaydedildi.`,
    });
    setActiveItem(null);
    setLotPendingItem(null);
    setTab("barcode");
  };

  const selectLineForCounting = (line: AdjustmentLine) => {
    const unit = (line.unit || "AD").toUpperCase();
    const skunit = (line.skunit || unit).toUpperCase();
    const mult = line.multiplier && line.multiplier > 0 ? line.multiplier : 1;
    const allMatLines = lines.filter((l) => sadelestir(l.material) === sadelestir(line.material));
    const linesWithBatch = allMatLines.filter((l) => l.batchNum && l.batchNum !== "*");
    const isLot = Boolean(
      line.specialStock === "1" ||
      allMatLines.some((l) => l.specialStock === "1") ||
      linesWithBatch.length > 0
    );

    if (line.stockPlace) {
      const wh = line.warehouse || selectedWarehouse || order?.warehouse || "01";
      const sp = line.stockPlace.trim().toUpperCase();
      setSelectedWarehouse(wh);
      setSelectedStockPlace(sp);
      setSelectedShelf(`${wh}$${sp}`);
    }

    if (isLot) {
      const batchMap = new Map<string, { batchNum: string; availStock: number; unit?: string }>();
      for (const l of allMatLines) {
        if (l.batchNum && l.batchNum !== "*") {
          const key = l.batchNum.toUpperCase();
          if (!batchMap.has(key)) {
            batchMap.set(key, { batchNum: l.batchNum, availStock: l.targetQty, unit: l.unit });
          }
        }
      }

      setLotPendingItem({
        material: line.material,
        name: line.name,
        barcode: line.barcode || "",
        unit,
        skunit,
        multiplier: mult,
        specialStock: line.specialStock || "1",
        warehouse: line.warehouse || selectedWarehouse || order?.warehouse,
        stockPlace: line.stockPlace || selectedStockPlace || selectedShelf || order?.stockPlace,
        batches: Array.from(batchMap.values()),
      });
      setActiveItem(null);
      setTab("lot");

      // CANIAS'tan depo genelindeki partileri sorgula ve listeyi zenginleştir
      api.getStock(
        line.material,
        line.warehouse || selectedWarehouse || order?.warehouse || "01",
        ""
      ).then((stockBatches) => {
        if (stockBatches && stockBatches.length > 0) {
          for (const cb of stockBatches) {
            if (cb.batchNum && cb.batchNum !== "*") {
              const key = cb.batchNum.toUpperCase();
              if (!batchMap.has(key)) {
                batchMap.set(key, { ...cb });
              }
            }
          }
          setLotPendingItem((prev) => {
            if (!prev || sadelestir(prev.material) !== sadelestir(line.material)) return prev;
            return {
              ...prev,
              batches: Array.from(batchMap.values()),
            };
          });
        }
      }).catch(() => {});
      return;
    }

    const existingCountedInUnit = line.countedQty > 0
      ? Math.round((line.countedQty / mult) * 100) / 100
      : 1;

    setLotPendingItem(null);
    setActiveItem({
      lineId: line.id,
      material: line.material,
      name: line.name,
      barcode: line.barcode || "",
      quantity: existingCountedInUnit,
      targetQty: line.targetQty,
      unit,
      skunit,
      multiplier: mult,
      batchNum: line.batchNum,
      specialStock: line.specialStock || "0",
      isLotTracked: false,
      warehouse: line.warehouse || selectedWarehouse || order?.warehouse,
      stockPlace: line.stockPlace || selectedStockPlace || order?.stockPlace,
    });
    setTab("qty");
  };

  const displayedLines = useMemo(() => {
    if (tab === "shelf" || !selectedShelf) {
      return lines;
    }
    
    // 00$* seçildiyse ve depo tanımlıysa depoya göre filtrele
    if (selectedStockPlace === "*") {
      if (!selectedWarehouse) return lines;
      return lines.filter((l) => {
        if (!l.warehouse || l.warehouse.trim().toUpperCase() === selectedWarehouse.trim().toUpperCase()) return true;
        if (activeItem && l.id === activeItem.lineId) return true;
        if (lotPendingItem && sadelestir(l.material) === sadelestir(lotPendingItem.material)) return true;
        return false;
      });
    }

    const cleanShelf = (selectedStockPlace || selectedShelf).trim().toUpperCase();
    return lines.filter((l) => {
      if (l.stockPlace && l.stockPlace.trim().toUpperCase() === cleanShelf) return true;
      if (l.stockPlace && `${l.warehouse || ""}$${l.stockPlace}`.toUpperCase() === selectedShelf.toUpperCase()) return true;
      if (activeItem && l.id === activeItem.lineId) return true;
      if (lotPendingItem && sadelestir(l.material) === sadelestir(lotPendingItem.material)) return true;
      return false;
    });
  }, [lines, tab, selectedShelf, selectedWarehouse, selectedStockPlace, activeItem, lotPendingItem]);

  const sortedLines = useMemo(() => {
    return [...displayedLines].sort((a, b) => {
      const aIsActive =
        (activeItem && a.id === activeItem.lineId) ||
        (lotPendingItem && sadelestir(a.material) === sadelestir(lotPendingItem.material));
      const bIsActive =
        (activeItem && b.id === activeItem.lineId) ||
        (lotPendingItem && sadelestir(b.material) === sadelestir(lotPendingItem.material));

      if (aIsActive && !bIsActive) return -1;
      if (!aIsActive && bIsActive) return 1;

      const getTier = (l: AdjustmentLine) => {
        const counted = l.countedQty;
        const target = l.targetQty;
        if (target <= 0 && counted > 0) return 1;
        if (target > 0 && counted > target) return 2;
        if (target > 0 && counted > 0 && counted < target) return 3;
        if (counted === 0) return 4;
        return 5;
      };

      const aTier = getTier(a);
      const bTier = getTier(b);
      if (aTier !== bTier) return aTier - bTier;

      return a.id.localeCompare(b.id, undefined, { numeric: true });
    });
  }, [displayedLines, activeItem, lotPendingItem]);

  const totalCountedLines = lines.filter((l) => l.countedQty > 0).length;
  const isAllComplete = lines.length > 0 && totalCountedLines === lines.length;

  const documentWarehouseDisplay = useMemo(() => {
    return order?.warehouse?.trim() || warehouseParam?.trim() || (lines.length > 0 && lines[0].warehouse ? lines[0].warehouse.trim() : "");
  }, [order?.warehouse, warehouseParam, lines]);

  const handleGoToSummary = () => {
    navigate(`/count/${id}/summary`, {
      state: {
        order,
        lines,
        warehouse: documentWarehouseDisplay,
        orderType,
        invDocNum,
      },
    });
  };

  return (
    <div className="mx-auto max-w-6xl p-3 md:p-4 lg:p-8 short:h-[100dvh] short:max-w-none short:flex short:flex-col short:overflow-hidden short:p-2">
      {/* ÜST BAŞLIK */}
      <div className="mb-2 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => navigate("/count")}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-surface text-fg shadow-card transition hover:bg-elevated active:scale-95"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[17px] font-black tracking-tight text-fg">
                {order?.invDocNum || order?.id || id}
              </span>
              {order?.docType && (
                <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[14px] font-bold text-slate-700">
                  {order.docType}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {documentWarehouseDisplay && (
            <div className="hidden sm:flex items-center gap-1.5 rounded-xl border border-line bg-surface px-2.5 py-1 text-[14px] font-bold text-slate-800 shadow-card">
              <Warehouse className="h-4 w-4 text-brand-600 shrink-0" />
              <span>{documentWarehouseDisplay}</span>
            </div>
          )}
          <button
            type="button"
            onClick={handleGoToSummary}
            className="flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1 text-xs sm:text-sm font-bold shadow-sm transition active:scale-95 shrink-0"
            title="Sayımı İncele ve Bitir"
          >
            <CheckCheck className="h-4 w-4" />
            <span>Bitir</span>
          </button>
          <span
            className={`chip border px-2.5 py-1 text-[14px] font-bold ${
              isAllComplete
                ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                : "bg-brand-100 text-brand-800 border-brand-300"
            }`}
          >
            {totalCountedLines} / {lines.length} Tamamlandı
          </span>
        </div>
      </div>

      {error && (
        <div className="mb-2.5 flex items-center justify-between gap-3 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-2.5 text-[15px] font-medium text-rose-600 shrink-0">
          <span>{error}</span>
          <button type="button" onClick={loadAdjustmentDetail} className="shrink-0 font-bold underline">Tekrar Dene</button>
        </div>
      )}

      {/* ANA İÇERİK: SOL PANEL & SAĞ LİSTE */}
      <div className="grid min-w-0 gap-2.5 md:gap-3.5 md:grid-cols-[330px_minmax(0,1fr)] lg:grid-cols-[350px_minmax(0,1fr)] xl:grid-cols-[370px_minmax(0,1fr)] short:!flex short:min-h-0 short:flex-1 short:overflow-hidden short:gap-2.5">
        {/* =================================================================== */}
        {/* SOL KOLON: Sayım İşlem Kartı                                        */}
        {/* =================================================================== */}
        <div className="min-w-0 md:sticky md:top-2 md:self-start lg:sticky lg:top-2 xl:sticky xl:top-2 short:!static short:w-[330px] short:shrink-0 short:self-stretch short:overflow-y-auto">
          <div className="card p-2 sm:p-2.5 space-y-1.5">
            {/* 4 TAB BAŞLIĞI: [Raf, Barkod, Parti, Miktar] */}
            <div className="grid grid-cols-4 gap-1 w-full">
              {(
                [
                  ["shelf", "Raf"],
                  ["barcode", "Barkod"],
                  ["lot", "Parti"],
                  ["qty", "Miktar"],
                ] as const
              ).map(([s, label]) => {
                const active = tab === s;
                const isClickable =
                  s === "shelf" ||
                  (s === "barcode" && (Boolean(selectedShelf) || Boolean(activeItem) || Boolean(lotPendingItem))) ||
                  (s === "lot" && (Boolean(activeItem) || Boolean(lotPendingItem))) ||
                  (s === "qty" && Boolean(activeItem));

                const handleClick = () => {
                  if (s === "shelf") {
                    setTab("shelf");
                    setSelectedShelf(null);
                    setSelectedWarehouse(null);
                    setSelectedStockPlace(null);
                    setActiveItem(null);
                    setLotPendingItem(null);
                  } else if (s === "barcode") {
                    setTab("barcode");
                    setActiveItem(null);
                    setLotPendingItem(null);
                  } else if (s === "lot") {
                    if (activeItem) {
                      handleBackToLot(activeItem);
                    } else if (lotPendingItem) {
                      setTab("lot");
                    }
                  } else if (s === "qty" && activeItem) {
                    setTab("qty");
                  }
                };

                return (
                  <button
                    key={s}
                    type="button"
                    onClick={handleClick}
                    disabled={!isClickable}
                    className={`flex h-8.5 w-full items-center justify-center rounded-xl px-0.5 text-xs font-bold tracking-tight transition-all duration-200 ease-soft ${
                      active
                        ? "bg-brand-600 text-white shadow-soft font-extrabold cursor-default"
                        : isClickable
                        ? "bg-elevated text-subtle hover:text-fg hover:bg-line cursor-pointer"
                        : "bg-elevated/60 text-subtle/60 cursor-default opacity-80"
                    }`}
                  >
                    <span className="truncate">{label}</span>
                  </button>
                );
              })}
            </div>

            {/* SEÇİLİ RAF BİLGİSİ */}
            {selectedShelf && tab !== "shelf" && (
              <div className="flex items-center justify-between gap-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 px-2 py-1 text-[13px]">
                <span className="inline-flex min-w-0 items-center gap-1 font-bold text-emerald-800 dark:text-emerald-200">
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                  <span className="truncate">
                    Raf: <span className="font-mono">{selectedShelf}</span>
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setTab("shelf");
                    setSelectedShelf(null);
                    setSelectedWarehouse(null);
                    setSelectedStockPlace(null);
                    setActiveItem(null);
                    setLotPendingItem(null);
                  }}
                  className="text-[11.5px] font-bold text-emerald-700 dark:text-emerald-300 underline hover:text-emerald-900 shrink-0"
                >
                  Değiştir
                </button>
              </div>
            )}

            {/* ADIM 1: RAF OKUTMA */}
            {tab === "shelf" && (
              <div className="space-y-2 animate-fade-in">
                <div className="space-y-1">
                  <span className="block text-[13px] font-bold text-fg">Raf Barkodu Okut</span>
                  <BarcodeScanner
                    onDetected={handleSelectShelf}
                    placeholder="Raf barkodunu girin"
                    hideCardWrapper
                    compact
                  />
                  {shelfBusy && (
                    <p className="mt-1 flex items-center gap-1.5 text-[12.5px] font-semibold text-brand-600 animate-pulse">
                      <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                      <span>Raf CANIAS'ta sorgulanıyor...</span>
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* ADIM 2: BARKOD OKUTMA */}
            {tab === "barcode" && !lotPendingItem && !activeItem && (
              <div className="space-y-1 animate-fade-in">
                <span className="block text-[13px] font-bold text-fg">
                  Malzeme Barkodu Okut
                </span>
                <BarcodeScanner
                  onDetected={handleDetected}
                  placeholder="Malzeme barkodu okutun"
                  hideCardWrapper
                  compact
                />
                {busy && (
                  <p className="mt-1 flex items-center gap-1.5 text-[12.5px] font-semibold text-brand-600">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> CANIAS sorgulanıyor…
                  </p>
                )}
              </div>
            )}

            {/* ADIM 3: PARTİ SEÇİMİ */}
            {tab === "lot" && lotPendingItem && (
              <div className="space-y-2 pt-0.5 animate-fade-in">
                {/* Stokta kayıtlı partiler varsa liste */}
                {lotPendingItem.batches && lotPendingItem.batches.length > 0 ? (
                  <div className="rounded-xl bg-elevated px-2.5 py-1.5 border border-line/60">
                    <span className="mb-1 block text-[11.5px] font-bold text-subtle">
                      Parti seç (stoktakiler)
                    </span>
                    <select
                      defaultValue=""
                      onChange={(e) => handleSelectBatch(e.target.value)}
                      className="h-8 w-full rounded-lg border border-line bg-surface px-2 font-mono text-xs text-fg outline-none focus:border-brand-500 cursor-pointer"
                    >
                      <option value="" disabled>
                        Parti seçin…
                      </option>
                      {lotPendingItem.batches.map((b) => (
                        <option key={b.batchNum} value={b.batchNum}>
                          {b.batchNum} {b.availStock > 0 ? `— ${b.availStock} ${b.unit || lotPendingItem.unit}` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="flex items-start gap-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 p-2 text-[11.5px] font-medium text-amber-800 dark:text-amber-200">
                    <Info className="h-4 w-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                    <span>Bu ürün için stokta kayıtlı parti bulunamadı. Lütfen tarih seçin veya parti barkodu okutun / girin.</span>
                  </div>
                )}

                {/* Tarih Seçimi */}
                <div className="flex items-center gap-2 rounded-xl bg-elevated px-2.5 py-1.5 border border-line/60">
                  <span className="shrink-0 text-[11.5px] font-bold text-subtle">Tarih seç</span>
                  <input
                    type="date"
                    min={new Date().toISOString().slice(0, 10)}
                    max="2100-12-31"
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (!raw) return;
                      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
                      if (!m) return;
                      const y = parseInt(m[1], 10);
                      // Yıl henüz 4 basamaklı tamamlanmadıysa (örn. 0002, 0020, 0202) tetikleme
                      if (y < 1000) return;
                      const val = isoDateToBatch(raw);
                      if (val) handleSelectBatch(val);
                    }}
                    className="h-7.5 flex-1 rounded-lg border border-line bg-surface px-2 font-mono text-xs text-fg outline-none focus:border-brand-500 cursor-pointer"
                  />
                </div>

                {/* Parti Barkodu Okutma / Elle Giriş */}
                <div className="pt-0.5">
                  <BarcodeScanner
                    onDetected={handleDetected}
                    placeholder="Parti barkodu girin"
                    hideCardWrapper
                    compact
                  />
                </div>
              </div>
            )}

            {/* ADIM 4: MİKTAR GİRİŞİ */}
            {tab === "qty" && activeItem && (
              <div className="space-y-2 animate-fade-in flex-1 flex flex-col justify-between">
                <div>
                  <div className="mb-1.5 flex items-center justify-between gap-1">
                    <label className="text-xs font-bold text-fg block shrink-0">
                      Sayılacak Miktar ({activeItem.unit}) <span className="text-red-500">*</span>
                    </label>
                    {(activeItem.multiplier > 1 || activeItem.unit !== activeItem.skunit) && (
                      <span className="font-mono text-[11.5px] font-bold text-slate-600 dark:text-slate-300 shrink-0">
                        1 {activeItem.unit} = {activeItem.multiplier} {activeItem.skunit}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setActiveItem((p) =>
                          p ? { ...p, quantity: Math.max(0, p.quantity - 1) } : null
                        )
                      }
                      className="flex h-10 w-10 items-center justify-center rounded-xl bg-elevated text-subtle hover:bg-line transition active:scale-95 shrink-0"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={activeItem.quantity}
                      placeholder="0"
                      onChange={(e) => {
                        const raw = e.target.value;
                        if (raw === "") {
                          setActiveItem((p) => (p ? { ...p, quantity: 0 } : null));
                          return;
                        }
                        const val = parseInt(raw, 10);
                        setActiveItem((p) =>
                          p ? { ...p, quantity: isNaN(val) ? 0 : Math.max(0, val) } : null
                        );
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleCommitActiveItem();
                        }
                      }}
                      className="field-input flex-1 text-center font-mono text-base font-extrabold text-emerald-600 h-10"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setActiveItem((p) =>
                          p ? { ...p, quantity: p.quantity + 1 } : null
                        )
                      }
                      className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition active:scale-95 shadow-md shrink-0"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5 pt-1.5">
                    <button
                      type="button"
                      onClick={() => setActiveItem((p) => (p ? { ...p, quantity: 0 } : null))}
                      className="flex items-center justify-center rounded-xl border border-line bg-elevated/50 py-2 text-subtle hover:text-red-500 shadow-xs"
                      title="Miktarı Sıfırla (0)"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                    {[5, 10].map((inc) => (
                      <button
                        key={inc}
                        type="button"
                        onClick={() =>
                          setActiveItem((p) =>
                            p ? { ...p, quantity: p.quantity + inc } : null
                          )
                        }
                        className="rounded-xl border border-line bg-elevated/80 py-2 text-xs font-black text-fg hover:bg-emerald-600 hover:text-white transition shadow-xs"
                      >
                        +{inc}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={handleCommitActiveItem}
                      disabled={!activeItem || activeItem.quantity < 0}
                      className="flex flex-col items-center justify-center rounded-xl bg-emerald-600 py-1 text-[10.5px] sm:text-[11.5px] font-black leading-tight text-white shadow-md hover:bg-emerald-700 active:scale-95 transition disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <span>Miktarı</span>
                      <span>Kaydet</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* =================================================================== */}
        {/* SAĞ KOLON: Okutulacak Mallar (Aşağı doğru biriken kartlar)         */}
        {/* =================================================================== */}
        <div className="min-w-0 short:flex-1 short:overflow-y-auto short:pr-1 space-y-2">
          {/* Yükleniyor Durumu */}
          {loading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-20 animate-pulse rounded-2xl bg-elevated" />
              ))}
            </div>
          ) : sortedLines.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-surface/50 py-8 text-center text-subtle">
              <Package className="mb-2 h-7 w-7 text-slate-400" />
              <p className="text-[15px] font-bold text-fg">
                {selectedShelf ? `${selectedShelf} rafında sayılacak malzeme bulunamadı` : "Sayılacak malzeme bulunamadı"}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {sortedLines.map((line) => {
                const counted = line.countedQty;
                const target = line.targetQty;
                const isUnexpected = target <= 0 && counted > 0;
                const isExcess = target > 0 && counted > target;
                const isMatched = target > 0 && counted === target;
                const isPartial = target > 0 && counted > 0 && counted < target;
                const qtyColorClass = isUnexpected
                  ? "text-blue-600 dark:text-blue-400"
                  : isExcess
                  ? "text-rose-600 dark:text-rose-400"
                  : isMatched
                  ? "text-emerald-600 dark:text-emerald-400"
                  : isPartial
                  ? "text-amber-500 dark:text-amber-400"
                  : "text-fg";
                const mult = line.multiplier && line.multiplier > 0 ? line.multiplier : 1;
                const unit = (line.unit || "AD").toUpperCase();
                const skunit = (line.skunit || unit).toUpperCase();
                const isDiffUnit = mult > 1 || unit !== skunit;
                const countedInUnit = mult > 1 ? Math.round((counted / mult) * 100) / 100 : counted;
                const targetInUnit = mult > 1 ? Math.round((target / mult) * 100) / 100 : target;
                const wh = line.warehouse || order?.warehouse || "";
                const sp = line.stockPlace || "";
                let locationStr = "";
                if (wh && sp) {
                  locationStr = sp.toUpperCase().startsWith(wh.toUpperCase()) ? sp : `${wh}${sp}`;
                } else {
                  locationStr = sp || wh;
                }
                locationStr = locationStr.replace(/\$/g, "");

                return (
                  <button
                    key={line.id}
                    type="button"
                    onClick={() => selectLineForCounting(line)}
                    className="w-full text-left rounded-2xl border border-line bg-surface p-2.5 sm:p-3 transition-all shadow-xs hover:border-slate-400/60 active:scale-[0.99]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px] font-bold text-fg">{line.name}</p>
                        <div className="mt-0.5 flex items-center gap-2.5 font-mono text-[13px] flex-wrap text-slate-600 dark:text-slate-300">
                          <span className="font-bold text-slate-700 dark:text-slate-200">{line.material}</span>
                          {locationStr && (
                            <span className="inline-flex items-center gap-0.5 font-semibold text-slate-600 dark:text-slate-400">
                              <Warehouse className="h-3 w-3 shrink-0 text-slate-500" />
                              {locationStr}
                            </span>
                          )}
                          {line.batchNum && (
                            <span className="inline-flex shrink-0 items-center rounded bg-violet-100 dark:bg-violet-950/60 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-violet-700 dark:text-violet-300">
                              Parti: {line.batchNum}
                            </span>
                          )}
                          {isDiffUnit && (
                            <span className="font-semibold text-slate-500 dark:text-slate-400">
                              1 {unit} = {mult} {skunit}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="shrink-0 text-right font-mono flex flex-col items-end justify-center pr-[17px] leading-tight">
                        {/* Üst satır: Stok birimi cinsinden çevrilmiş miktar (örn: 24 / 24 KT) */}
                        <div className={`${qtyColorClass} leading-tight`}>
                          <span className="text-[15px] sm:text-[16px] font-black">
                            {target > 0 ? `${counted} / ${target}` : counted}
                          </span>
                          <span className="ml-1 text-[14px] font-black uppercase">{skunit}</span>
                        </div>
                        {/* Alt satır: Okutulan barkod birimi cinsinden miktar (örn: 1 / 1 KO) */}
                        {isDiffUnit && (
                          <div className="text-fg leading-tight -mt-0.5">
                            <span className="text-[15px] sm:text-[16px] font-black">
                              {target > 0 ? `${countedInUnit} / ${targetInUnit}` : countedInUnit}
                            </span>
                            <span className="ml-1 text-[14px] font-black uppercase">{unit}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
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
