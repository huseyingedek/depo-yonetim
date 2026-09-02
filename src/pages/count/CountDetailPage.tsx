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
  const [, setFlashLineId] = useState<string | null>(null);
  const [tab, setTab] = useState<CountTab>("shelf");
  
  // Raf / Depo state (Format: 00$* veya 01$A-01-01)
  const [selectedShelf, setSelectedShelf] = useState<string | null>(null);
  const [selectedWarehouse, setSelectedWarehouse] = useState<string | null>(null);
  const [selectedStockPlace, setSelectedStockPlace] = useState<string | null>(null);

  const [activeItem, setActiveItem] = useState<ActiveCountItem | null>(null);
  const [lotPendingItem, setLotPendingItem] = useState<LotPendingItem | null>(null);

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

  // Raf okutma/girme (00$* veya 01$A-01-01 formatı)
  const handleSelectShelf = useCallback(
    (shelfInput: string) => {
      const clean = shelfInput.trim();
      if (!clean) return;

      let wh = order?.warehouse || "01";
      let sp = clean;
      let fullCode = clean;

      if (clean.includes("$")) {
        const parts = clean.split("$");
        wh = parts[0].trim() || wh;
        sp = parts.slice(1).join("$").trim() || "*";
        fullCode = `${wh}$${sp}`;
      } else {
        fullCode = `${wh}$${clean}`;
        sp = clean;
      }

      setSelectedWarehouse(wh);
      setSelectedStockPlace(sp);
      setSelectedShelf(fullCode);
      setActiveItem(null);
      setLotPendingItem(null);
      setTab("barcode");
      sesBasarili();
      show({
        kind: "ok",
        text: `Raf (${fullCode}) seçildi. Malzeme barkodunu okutun.`,
      });
    },
    [order, show]
  );

  const handleSelectBatch = useCallback(
    (batchVal: string, candidateLines?: AdjustmentLine[], pendingContext?: LotPendingItem | null) => {
      const rawBatch = batchVal.trim();
      if (!rawBatch) return;

      const currentPending = pendingContext !== undefined ? pendingContext : lotPendingItem;
      const searchLines = candidateLines || lines;

      const mat = currentPending ? currentPending.material : (activeItem ? activeItem.material : "");
      const matName = currentPending ? currentPending.name : (activeItem ? activeItem.name : mat);
      const barcode = currentPending ? currentPending.barcode : (activeItem ? activeItem.barcode : "");
      const baseUnit = currentPending ? currentPending.unit : (activeItem ? activeItem.unit : "AD");
      const baseSkunit = currentPending ? currentPending.skunit : (activeItem ? activeItem.skunit : baseUnit);
      const baseMult = currentPending ? currentPending.multiplier : (activeItem ? activeItem.multiplier : 1);

      const matchedLine = searchLines.find(
        (l) =>
          sadelestir(l.material) === sadelestir(mat) &&
          l.batchNum &&
          l.batchNum.trim().toUpperCase() === rawBatch.toUpperCase()
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
          stockPlace: selectedStockPlace || matchedLine.stockPlace || selectedShelf || order?.stockPlace,
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

      const shelfMatched = selectedStockPlace && selectedStockPlace !== "*"
        ? matches.filter((l) => l.stockPlace && l.stockPlace.trim().toUpperCase() === selectedStockPlace.toUpperCase())
        : matches;
      const effectiveMatches = shelfMatched.length > 0 ? shelfMatched : matches;

      if (effectiveMatches.length > 0) {
        const mat = effectiveMatches[0].material;
        const matName = barcodeName || effectiveMatches[0].name;
        const finalUnit = barcodeUnit || effectiveMatches[0].unit || "AD";
        const finalSkunit = barcodeSkunit || effectiveMatches[0].skunit || finalUnit;
        const finalMult = barcodeMult > 1 ? barcodeMult : (effectiveMatches[0].multiplier || 1);

        // Belgedeki tüm partili satırları bul
        const allMatLines = lines.filter((l) => sadelestir(l.material) === sadelestir(mat));
        const linesWithBatch = allMatLines.filter((l) => l.batchNum && l.batchNum !== "*");
        const isLotTracked =
          linesWithBatch.length > 0 ||
          allMatLines.some((l) => l.specialStock === "1") ||
          barcodeSpecialStock === "1";

        if (isLotTracked && !barcodeLot) {
          // CANIAS'tan depo genelindeki partileri sorgula (raf kısıtlaması olmadan)
          let caniasBatches: { batchNum: string; availStock: number; unit?: string }[] = [];
          try {
            const stockBatches = await api.getStock(
              mat,
              selectedWarehouse || order?.warehouse || effectiveMatches[0].warehouse || "01",
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

          if (allBatches.length === 1) {
            const pendingContext: LotPendingItem = {
              material: mat,
              name: matName,
              barcode: rawCode,
              unit: finalUnit,
              skunit: finalSkunit,
              multiplier: finalMult,
              specialStock: "1",
              warehouse: selectedWarehouse || effectiveMatches[0].warehouse || order?.warehouse,
              stockPlace: selectedStockPlace || effectiveMatches[0].stockPlace || selectedShelf || order?.stockPlace,
              batches: allBatches,
            };
            handleSelectBatch(allBatches[0].batchNum, effectiveMatches, pendingContext);
            return;
          }

          sesBasarili();
          setLotPendingItem({
            material: mat,
            name: matName,
            barcode: rawCode,
            unit: finalUnit,
            skunit: finalSkunit,
            multiplier: finalMult,
            specialStock: "1",
            warehouse: selectedWarehouse || effectiveMatches[0].warehouse || order?.warehouse,
            stockPlace: selectedStockPlace || effectiveMatches[0].stockPlace || selectedShelf || order?.stockPlace,
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
          (barcodeLot ? effectiveMatches.find((m) => m.batchNum && m.batchNum.toUpperCase() === barcodeLot!.toUpperCase()) : null) ||
          effectiveMatches.find((m) => activeItem && m.id === activeItem.lineId) ||
          effectiveMatches.find((m) => m.targetQty > 0 && m.countedQty < m.targetQty) ||
          effectiveMatches[0];

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
          warehouse: selectedWarehouse || matchedLine.warehouse || order?.warehouse,
          stockPlace: selectedStockPlace || matchedLine.stockPlace || selectedShelf || order?.stockPlace,
        });
        setTab("qty");

        show({
          kind: "ok",
          text: `${matchedLine.material}${matchedLine.stockPlace ? ` (${matchedLine.stockPlace})` : ""} seçildi. Miktar girip onaylayın.`,
        });
        return;
      }

      if (barcodeMat) {
        sesBasarili();
        const lotTracked = barcodeSpecialStock === "1" || (barcodeLot && barcodeLot !== "*");

        if (lotTracked && !barcodeLot) {
          let batches: { batchNum: string; availStock: number; unit?: string }[] = [];
          try {
            // Depo genelindeki partileri getir
            batches = await api.getStock(
              barcodeMat,
              selectedWarehouse || order?.warehouse || "01",
              ""
            );
          } catch {}

          const validBatches = batches.filter((b) => b.batchNum && b.batchNum !== "*");

          if (validBatches.length === 1) {
            const pendingContext: LotPendingItem = {
              material: barcodeMat,
              name: barcodeName,
              barcode: rawCode,
              unit: barcodeUnit,
              skunit: barcodeSkunit,
              multiplier: barcodeMult,
              specialStock: barcodeSpecialStock,
              warehouse: selectedWarehouse || order?.warehouse,
              stockPlace: selectedStockPlace || selectedShelf || order?.stockPlace,
              batches: validBatches,
            };
            handleSelectBatch(validBatches[0].batchNum, lines, pendingContext);
            return;
          }

          setLotPendingItem({
            material: barcodeMat,
            name: barcodeName,
            barcode: rawCode,
            unit: barcodeUnit,
            skunit: barcodeSkunit,
            multiplier: barcodeMult,
            specialStock: barcodeSpecialStock,
            warehouse: selectedWarehouse || order?.warehouse,
            stockPlace: selectedStockPlace || selectedShelf || order?.stockPlace,
            batches: validBatches,
          });
          setActiveItem(null);
          setTab("lot");
          show({
            kind: "ok",
            text: `${barcodeName} partili ürün. Lütfen parti seçin.`,
          });
          return;
        }

        const newLineId = `new-${Date.now()}`;
        setLotPendingItem(null);
        setActiveItem({
          lineId: newLineId,
          material: barcodeMat,
          name: barcodeName,
          barcode: rawCode,
          quantity: 1,
          targetQty: 0,
          unit: barcodeUnit,
          skunit: barcodeSkunit,
          multiplier: barcodeMult,
          batchNum: barcodeLot,
          specialStock: barcodeSpecialStock,
          isLotTracked: Boolean(lotTracked),
          warehouse: selectedWarehouse || order?.warehouse,
          stockPlace: selectedStockPlace || selectedShelf || order?.stockPlace,
        });
        setTab("qty");

        show({
          kind: "ok",
          text: `${barcodeMat} okundu. Miktar girip ekleyin.`,
        });
      } else {
        sesHata();
        show({
          kind: "error",
          text: `${rawCode} barkodu bulunamadı`,
        });
      }
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
          stockPlace: selectedStockPlace || activeItem.stockPlace || updated[idx].stockPlace || undefined,
          warehouse: selectedWarehouse || activeItem.warehouse || updated[idx].warehouse || undefined,
        };
        return updated;
      } else {
        const newLine: AdjustmentLine = {
          id: activeItem.lineId,
          material: activeItem.material,
          name: activeItem.name,
          barcode: activeItem.barcode,
          targetQty: activeItem.targetQty,
          countedQty: baseCountedQty,
          unit: activeItem.unit,
          skunit: activeItem.skunit,
          multiplier: mult,
          batchNum: activeItem.batchNum,
          specialStock: activeItem.specialStock,
          warehouse: selectedWarehouse || activeItem.warehouse || order?.warehouse,
          stockPlace: selectedStockPlace || activeItem.stockPlace || undefined,
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
    const isLot = Boolean(
      (line.batchNum && line.batchNum !== "*") ||
      line.specialStock === "1" ||
      lines.some((l) => sadelestir(l.material) === sadelestir(line.material) && l.batchNum && l.batchNum !== "*")
    );
    const existingCountedInUnit = line.countedQty > 0
      ? Math.round((line.countedQty / mult) * 100) / 100
      : 1;

    if (line.stockPlace) {
      const wh = line.warehouse || selectedWarehouse || order?.warehouse || "01";
      const sp = line.stockPlace.trim().toUpperCase();
      setSelectedWarehouse(wh);
      setSelectedStockPlace(sp);
      setSelectedShelf(`${wh}$${sp}`);
    }

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
      specialStock: line.specialStock || (isLot ? "1" : "0"),
      isLotTracked: isLot,
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
    const set = new Set<string>();
    if (order?.warehouse) set.add(order.warehouse.trim());
    for (const l of lines) {
      if (l.warehouse) set.add(l.warehouse.trim());
    }
    const arr = Array.from(set).filter(Boolean);
    if (arr.length > 0) {
      return arr.join(" / ");
    }
    return warehouseParam || order?.warehouse || "";
  }, [lines, order, warehouseParam]);

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
            {selectedShelf && (
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
                    onChange={(e) => {
                      const val = isoDateToBatch(e.target.value);
                      if (val) handleSelectBatch(val);
                    }}
                    className="h-7.5 flex-1 rounded-lg border border-line bg-surface px-2 font-mono text-xs text-fg outline-none focus:border-brand-500 cursor-pointer"
                  />
                </div>

                {/* Parti Barkodu Okutma / Elle Giriş */}
                <div className="pt-0.5">
                  <span className="mb-0.5 block text-[11.5px] font-bold text-subtle">
                    Veya parti barkodunu okutun / girin
                  </span>
                  <BarcodeScanner
                    onDetected={handleDetected}
                    placeholder="Parti barkodu veya parti no okutun"
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
                    <div className="flex flex-col items-end font-mono text-[11.5px] font-bold leading-tight shrink-0">
                      {(activeItem.multiplier > 1 || activeItem.unit !== activeItem.skunit) && (
                        <span className="text-slate-600 dark:text-slate-300">
                          1 {activeItem.unit} = {activeItem.multiplier} {activeItem.skunit}
                        </span>
                      )}
                      {activeItem.multiplier > 1 && activeItem.quantity > 0 && (
                        <span className="text-emerald-600 dark:text-emerald-400">
                          ({activeItem.quantity * activeItem.multiplier} {activeItem.skunit})
                        </span>
                      )}
                    </div>
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
                const equation = `1 ${unit} = ${mult} ${skunit}`;

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
                          {line.stockPlace && (
                            <span className="inline-flex items-center gap-0.5 font-semibold">
                              <MapPin className="h-3 w-3 shrink-0 text-slate-500" />
                              {line.stockPlace}
                            </span>
                          )}
                          {line.batchNum && <span className="font-semibold">Parti: {line.batchNum}</span>}
                        </div>
                      </div>
                      <div className="shrink-0 text-right font-mono flex flex-col items-end justify-center">
                        <div className={qtyColorClass}>
                          <span className="text-[16px] sm:text-[17px] font-black">
                            {target > 0 ? `${counted} / ${target}` : counted}
                          </span>
                          <span className="ml-1 text-[13px] font-black uppercase">{skunit}</span>
                        </div>
                        {isDiffUnit && (
                          <span className="text-[12px] font-semibold text-slate-500 mt-0.5">
                            {equation}
                          </span>
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
