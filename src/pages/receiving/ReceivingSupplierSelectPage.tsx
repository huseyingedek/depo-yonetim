import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Barcode,
  Truck,
  ArrowRight,
  CheckCircle2,
  Building2,
  AlertCircle,
  X,
  CornerDownLeft,
  Loader2,
  Search,
  FileText,
  Warehouse,
} from "lucide-react";
import PageHeader from "../../components/PageHeader";
import BarcodeScanner from "../../components/BarcodeScanner";
import Pagination, { usePagination } from "../../components/Pagination";
import { api } from "../../api/client";

export interface SupplierOrder {
  id: string; // Tedarikçi Kodu (VENDOR)
  name: string; // Tedarikçi Adı (NAME1)
  poNumber: string; // Satın Alma Sipariş No (PURORDER)
  orderCount: number; // Açık Sipariş Kalem Sayısı
  barcode: string; // Malzeme Barkodu
}

type SearchTab = "barcode" | "supplierName";

// Türkçe karakter duyarsız arama normalizasyonu (İ/i, I/ı, Ş/ş, vb. uyumlu)
function trNormalize(str: string): string {
  return (str || '')
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .trim();
}

// Siparişleri Tedarikçiye göre gruplama yardımcısı
const groupOrdersToSuppliers = (orders: Record<string, unknown>[], barcodeFilter = ""): SupplierOrder[] => {
  const map = new Map<string, SupplierOrder>();
  orders.forEach((row, idx) => {
    const vendorCode = String(row.VENDOR || row.PSVENDOR || row.SUPPLIERID || `TED-${idx + 1}`).trim();
    const vendorName = String(row.NAME1 || row.SUPPLIERNAME || row.VENDORNAME || "Tedarikçi").trim();
    const poNum = String(row.ORDERNUM || row.PURORDER || row.POORDER || row.PO_NUMBER || "").trim();

    if (!map.has(vendorCode)) {
      map.set(vendorCode, {
        id: vendorCode,
        name: vendorName,
        poNumber: poNum || "Açık Sipariş",
        orderCount: 1,
        barcode: barcodeFilter,
      });
    } else {
      const existing = map.get(vendorCode)!;
      existing.orderCount += 1;
      if ((!existing.poNumber || existing.poNumber === "Açık Sipariş") && poNum) {
        existing.poNumber = poNum;
      }
    }
  });
  return Array.from(map.values());
};

export default function ReceivingSupplierSelectPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<SearchTab>("barcode");

  // Search & Selection State
  const [barcodeSearch, setBarcodeSearch] = useState("");
  const [nameSearch, setNameSearch] = useState("");
  const [scannedBarcode, setScannedBarcode] = useState("");
  const [selectedSupplier, setSelectedSupplier] = useState<SupplierOrder | null>(null);

  // Real CANIAS API Search State
  const [suppliers, setSuppliers] = useState<SupplierOrder[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  // Status/Step Feedback State
  const [stepNotice, setStepNotice] = useState<{ open: boolean; message: string }>({
    open: false,
    message: "",
  });

  // Waybill & Warehouse Popup Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [waybillNo, setWaybillNo] = useState("");
  const [targetWarehouse, setTargetWarehouse] = useState("00&*");
  const [waybillError, setWaybillError] = useState("");
  const [targetError, setTargetError] = useState("");
  const [isValidatingWarehouse, setIsValidatingWarehouse] = useState(false);

  // CANIAS Live Warehouses State
  const [caniasWarehouses, setCaniasWarehouses] = useState<{ code: string; name: string }[]>([]);

  useEffect(() => {
    // Mal kabul seçim sayfasına gelindiğinde eski yarım kalmış oturum kalıntılarını temizle
    try {
      Object.keys(localStorage).forEach((k) => {
        if (k.startsWith("mzy_receiving_items_")) {
          localStorage.removeItem(k);
        }
      });
    } catch {}

    api
      .getWarehouses()
      .then((list) => {
        if (list && list.length > 0) {
          setCaniasWarehouses(list);
        }
      })
      .catch(() => {});
  }, []);

  const handleTabChange = (tab: SearchTab) => {
    setActiveTab(tab);
    setBarcodeSearch("");
    setNameSearch("");
    setScannedBarcode("");
    setSelectedSupplier(null);
    setSuppliers([]);
    setApiError(null);
    setHasSearched(false);
  };

  // Fetch Open Orders Live from CANIAS (MZYGetOpenOrder)
  const fetchCaniasOpenOrders = async (params: { barcode?: string; vendorName?: string }) => {
    setIsLoading(true);
    setApiError(null);
    setHasSearched(true);
    setSelectedSupplier(null);

    try {
      const res = await api.getOpenOrders({ barcode: params.barcode });
      let matchedOrders = res.orders || [];

      // If specific barcode returned 0 rows directly, check against all open orders
      if (matchedOrders.length === 0 && params.barcode) {
        const allRes = await api.getOpenOrders();
        const bCode = trNormalize(params.barcode);
        matchedOrders = (allRes.orders || []).filter((r) => {
          const ordNum = trNormalize(String(r.ORDERNUM || r.PURORDER || ""));
          const vCode = trNormalize(String(r.VENDOR || ""));
          const mat = trNormalize(String(r.MATERIAL || ""));
          const ean = trNormalize(String(r.BARCODE || r.EAN || ""));
          return ordNum === bCode || vCode === bCode || mat === bCode || ean === bCode;
        });
      }

      const supplierList = groupOrdersToSuppliers(matchedOrders, params.barcode || "");
      setSuppliers(supplierList);
    } catch (err: any) {
      console.error("CANIAS MZYGetOpenOrder error:", err);
      setApiError(
        err?.message || "CANIAS sunucusuna bağlanılamadı. Lütfen ağ bağlantınızı ve sunucu adresini kontrol edin."
      );
      setSuppliers([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleBarcodeScan = (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) return;
    setBarcodeSearch(trimmed);
    setScannedBarcode(trimmed);
    fetchCaniasOpenOrders({ barcode: trimmed });
  };

  // Fetch Suppliers / Open Orders by Name from CANIAS
  const fetchCaniasSuppliersByName = async (nameQuery: string) => {
    const query = nameQuery.trim();
    if (!query) {
      setSuppliers([]);
      setHasSearched(false);
      return;
    }

    setIsLoading(true);
    setApiError(null);
    setHasSearched(true);
    setSelectedSupplier(null);

    try {
      const res = await api.getOpenOrders();
      const allOrders = res.orders || [];
      const normQ = trNormalize(query);

      const matchedOrders = allOrders.filter((r) => {
        const name = trNormalize(String(r.NAME1 || r.SUPPLIERNAME || r.VENDORNAME || ""));
        const code = trNormalize(String(r.VENDOR || ""));
        const po = trNormalize(String(r.ORDERNUM || r.PURORDER || ""));
        return name.includes(normQ) || code.includes(normQ) || po.includes(normQ);
      });

      const supplierList = groupOrdersToSuppliers(matchedOrders);
      setSuppliers(supplierList);
    } catch (err: any) {
      console.error("CANIAS OpenOrders supplier search error:", err);
      setApiError(
        err?.message || "CANIAS sunucusuna bağlanılamadı. Lütfen ağ bağlantınızı ve sunucu adresini kontrol edin."
      );
      setSuppliers([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleNameSearchSubmit = () => {
    const query = nameSearch.trim();
    if (!query) return;
    fetchCaniasSuppliersByName(query);
  };

  // 3x3 Pagination (9 items per page)
  const pg = usePagination(suppliers, 9);
  useEffect(() => {
    pg.reset();
  }, [suppliers]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelectSupplier = (supplier: SupplierOrder) => {
    if (selectedSupplier?.id === supplier.id) {
      setSelectedSupplier(null);
    } else {
      setSelectedSupplier(supplier);
    }
  };

  // Proceed Handler: Opens İrsaliye & Depo Popup Modal
  const handleProceedNextStep = async () => {
    if (!selectedSupplier) return;
    let targetPo = selectedSupplier.poNumber;
    if (!targetPo || targetPo === "Aktif Tedarikçi" || targetPo === "Açık Sipariş") {
      setIsLoading(true);
      try {
        const res = await api.getOpenOrders({ vendor: selectedSupplier.id });
        if (res.ok && res.orders && res.orders.length > 0) {
          const firstOrder = res.orders[0];
          const foundPo = String(firstOrder.PURORDER || firstOrder.POORDER || firstOrder.PO_NUMBER || "").trim();
          if (foundPo) {
            targetPo = foundPo;
          }
        }
      } catch (err) {
        console.error("Açık sipariş kontrolü hatası:", err);
      } finally {
        setIsLoading(false);
      }
    }
    if (targetPo && targetPo !== "Aktif Tedarikçi" && targetPo !== "Açık Sipariş") {
      setSelectedSupplier((prev) => (prev ? { ...prev, poNumber: targetPo } : prev));
    }
    setWaybillNo("");
    setTargetWarehouse("00&*");
    setWaybillError("");
    setTargetError("");
    setIsModalOpen(true);
  };

  const handleConfirmModal = async () => {
    const trimmedWaybill = waybillNo.trim();
    const trimmedTarget = targetWarehouse.trim();

    let hasErr = false;
    if (!trimmedWaybill) {
      setWaybillError("Lütfen İrsaliye Numarasını giriniz.");
      hasErr = true;
    }
    if (!trimmedTarget) {
      setTargetError("Lütfen Mal Kabul Deposunu giriniz.");
      hasErr = true;
    }

    if (hasErr) return;

    setIsValidatingWarehouse(true);
    setTargetError("");

    try {
      let confirmedWh = trimmedTarget;
      const isPatternOrWildcard =
        trimmedTarget.includes("*") ||
        trimmedTarget.includes("&") ||
        trimmedTarget.toUpperCase().startsWith("00");

      if (!isPatternOrWildcard) {
        // CANIAS MZYReadBarcodeSP ile depoyu doğrula
        const shelfRes = await api.readShelfBarcode(trimmedTarget);
        const isKnownWh = caniasWarehouses.some(
          (w) => w.code.toUpperCase() === trimmedTarget.toUpperCase()
        );

        const isValid =
          (shelfRes.ok && (shelfRes.warehouse || shelfRes.stockPlace)) ||
          isKnownWh ||
          (shelfRes.warehouse && !shelfRes.message);

        if (!isValid && !shelfRes.ok && !isKnownWh) {
          setTargetError(
            shelfRes.message ||
              "Girilen mal kabul deposu CANIAS sisteminde bulunamadı. Lütfen geçerli bir depo giriniz."
          );
          return;
        }

        confirmedWh = shelfRes.warehouse || trimmedTarget;
      }

      setIsModalOpen(false);
      setStepNotice({
        open: true,
        message: `${selectedSupplier?.name} (${selectedSupplier?.poNumber}) — İrsaliye No: ${trimmedWaybill} [Depo: ${confirmedWh}] doğrulandı. Detay ekranına yönlendiriliyor...`,
      });

      setTimeout(() => {
        if (selectedSupplier) {
          navigate(
            `/receiving/${encodeURIComponent(selectedSupplier.poNumber)}?waybill=${encodeURIComponent(trimmedWaybill)}&targetWH=${encodeURIComponent(confirmedWh)}&vendor=${encodeURIComponent(selectedSupplier.id)}&vendorName=${encodeURIComponent(selectedSupplier.name)}`,
            {
              state: {
                waybillNo: trimmedWaybill,
                targetWarehouse: confirmedWh,
                supplier: selectedSupplier,
              },
            }
          );
        }
      }, 1000);
    } catch (err: any) {
      setTargetError(
        err?.message || "Depo doğrulanırken hata oluştu. Lütfen bağlantınızı kontrol ediniz."
      );
    } finally {
      setIsValidatingWarehouse(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl p-4 lg:p-6">
      {/* Main Page Header (Tightly Spaced) */}
      <PageHeader
        title="Mal Kabul — Tedarikçi Seçimi"
        backTo="/home"
        right={
          <div className="hidden sm:flex items-center gap-3">
            <button
              type="button"
              onClick={handleProceedNextStep}
              disabled={!selectedSupplier}
              className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-md transition hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            >
              <span>Devam Et</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        }
      />

      {/* Mobile Action Bar */}
      <div className="flex items-center justify-between gap-3 sm:hidden mb-2">
        <button
          type="button"
          onClick={handleProceedNextStep}
          disabled={!selectedSupplier}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2.5 text-xs font-bold text-white shadow-md transition hover:bg-emerald-700 disabled:opacity-40"
        >
          <span>Devam Et {selectedSupplier ? `(${selectedSupplier.id})` : ""}</span>
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>

      {/* Step Transition Notice Modal / Alert */}
      {stepNotice.open && (
        <div className="mb-3 flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs font-bold text-emerald-600 dark:text-emerald-300 animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{stepNotice.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setStepNotice({ open: false, message: "" })}
            className="rounded-lg p-1 hover:bg-emerald-500/20"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Compact Unified Search Card (Tightly aligned to Header) */}
      <div className="rounded-2xl border border-line bg-surface p-3.5 shadow-card mb-2.5">
        {/* 2 Segmented Option Tabs */}
        <div className="flex flex-col sm:flex-row rounded-xl bg-elevated p-1 gap-1 mb-2.5 border border-line/60">
          <button
            type="button"
            onClick={() => handleTabChange("barcode")}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-1.5 px-3 text-xs font-bold transition-all ${
              activeTab === "barcode"
                ? "bg-emerald-600 text-white shadow-sm"
                : "text-subtle hover:text-fg hover:bg-surface"
            }`}
          >
            <Barcode className="h-4 w-4" />
            <span>1. Seçenek: Barkod ile Bul</span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange("supplierName")}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-1.5 px-3 text-xs font-bold transition-all ${
              activeTab === "supplierName"
                ? "bg-emerald-600 text-white shadow-sm"
                : "text-subtle hover:text-fg hover:bg-surface"
            }`}
          >
            <Building2 className="h-4 w-4" />
            <span>2. Seçenek: Tedarikçi İsmi ile Bul</span>
          </button>
        </div>

        {/* Tab 1 Content: Barkod ile Arama */}
        {activeTab === "barcode" && (
          <div>
            <BarcodeScanner
              prompt=""
              placeholder="Barkodu okutun veya yazın"
              prefill={barcodeSearch}
              onDetected={handleBarcodeScan}
              hideCardWrapper
            />

            {scannedBarcode && (
              <div className="mt-2 flex items-center gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-2 text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>
                  Sorgulanan Barkod: <strong>{scannedBarcode}</strong>
                </span>
              </div>
            )}
          </div>
        )}

        {/* Tab 2 Content: Tedarikçi İsmi ile Arama */}
        {activeTab === "supplierName" && (
          <div>
            <div className="relative min-w-0 flex-1">
              <input
                type="text"
                value={nameSearch}
                onChange={(e) => setNameSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleNameSearchSubmit()}
                placeholder="Tedarikçi adı veya kodu yazın"
                className="field-input w-full pr-11"
                autoFocus
              />
              <button
                type="button"
                onClick={handleNameSearchSubmit}
                disabled={!nameSearch.trim() || isLoading}
                className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-subtle transition hover:bg-elevated hover:text-fg disabled:opacity-30"
              >
                <CornerDownLeft className="h-5 w-5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* API Notice / Error Banner */}
      {apiError && (
        <div className="mb-3 flex items-center justify-between rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs font-medium text-red-700 dark:text-red-300">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
            <span>{apiError}</span>
          </div>
        </div>
      )}

      {/* Supplier Results Grid Header (Tightly aligned to Search Card) */}
      <div className="mt-3 mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Truck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          <h2 className="text-xs sm:text-sm font-extrabold text-fg">
            {activeTab === "barcode" ? "Barkodla Eşleşen Tedarikçiler" : "Aktif Tedarikçi Listesi"}
          </h2>
          {isLoading ? (
            <span className="chip bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" /> CANIAS Sorgulanıyor...
            </span>
          ) : (
            <span className="chip bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
              {suppliers.length} Sonuç
            </span>
          )}
        </div>
        {selectedSupplier && (
          <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5" /> 1 Seçildi
          </span>
        )}
      </div>

      {/* Grid States */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-16 rounded-2xl border border-line bg-surface p-6 text-center text-subtle shadow-sm">
          <Loader2 className="mb-3 h-8 w-8 animate-spin text-emerald-600 dark:text-emerald-400" />
          <p className="text-xs font-bold text-fg">CANIAS Veritabanından Sorgulanıyor...</p>
        </div>
      ) : !hasSearched ? (
        <div className="flex flex-col items-center justify-center py-12 rounded-2xl border border-dashed border-line bg-surface p-5 text-center text-subtle">
          <Search className="mb-2 h-8 w-8 text-muted" />
          <p className="text-xs font-bold text-fg">CANIAS Üzerinden Sorgulama Yapın</p>
          <p className="mt-1 text-[11px] text-subtle max-w-sm">
            {activeTab === "barcode"
              ? "Ürün barkodunu kamerayla okutarak veya yazarak canlı CANIAS veritabanından tedarikçi sorgulayınız."
              : "Tedarikçi unvanı veya firma kodu girerek CANIAS veritabanından açık sipariş sorgulayınız."}
          </p>
        </div>
      ) : suppliers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 rounded-2xl border border-dashed border-line bg-surface p-5 text-center text-subtle">
          <AlertCircle className="mb-2 h-8 w-8 text-muted" />
          <p className="text-xs font-bold text-fg">Açık Sipariş Bulunamadı</p>
          <p className="mt-1 text-[11px] text-subtle max-w-sm">
            CANIAS veritabanında aradığınız kriterlere uygun aktif satın alma siparişi bulunamadı.
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {pg.pageItems.map((supplier) => {
              const isSelected = selectedSupplier?.id === supplier.id;
              return (
                <div
                  key={supplier.id}
                  onClick={() => handleSelectSupplier(supplier)}
                  className={`relative flex items-center justify-between rounded-xl border p-3 cursor-pointer transition-all duration-200 ${
                    isSelected
                      ? "border-2 border-emerald-500 bg-emerald-500/10 dark:bg-emerald-950/20 shadow-sm ring-1 ring-emerald-500/30"
                      : "border-line bg-surface hover:border-emerald-300 dark:hover:border-emerald-700 hover:shadow-soft"
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0 pr-2">
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
                        isSelected
                          ? "bg-emerald-600 text-white"
                          : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                      }`}
                    >
                      <Building2 className="h-4 w-4" />
                    </div>
                    <h4 className="text-xs font-bold text-fg leading-tight truncate">
                      {supplier.name}
                    </h4>
                  </div>

                  {/* Checkbox / Radio Circle */}
                  <div
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-all ${
                      isSelected
                        ? "border-emerald-600 bg-emerald-600 text-white"
                        : "border-line bg-bg text-transparent"
                    }`}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  </div>
                </div>
              );
            })}
          </div>

          {/* 3x3 Pagination Controls */}
          <Pagination
            page={pg.page}
            pageCount={pg.pageCount}
            onChange={pg.setPage}
            rangeStart={pg.rangeStart}
            rangeEnd={pg.rangeEnd}
            total={pg.total}
            label="Tedarikçi"
          />
        </>
      )}

      {/* İrsaliye No ve Depo Seçimi Popup Modal */}
      {isModalOpen && selectedSupplier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-5 sm:p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-line pb-3">
              <div>
                <h3 className="text-sm sm:text-base font-extrabold text-fg flex items-center gap-2">
                  <FileText className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  Mal Kabul & İrsaliye Bilgileri
                </h3>
                <p className="mt-1 text-xs text-subtle font-medium truncate max-w-[280px]">
                  {selectedSupplier.name} <span className="font-bold text-fg">({selectedSupplier.poNumber})</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="rounded-lg p-1 text-subtle hover:bg-elevated hover:text-fg transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Form Inputs */}
            <div className="space-y-3.5 text-xs">
              {/* Field 1: İrsaliye Numarası */}
              <div>
                <label className="mb-1 block font-bold text-fg">
                  İrsaliye Numarası <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={waybillNo}
                    onChange={(e) => {
                      setWaybillNo(e.target.value);
                      if (waybillError) setWaybillError("");
                    }}
                    onKeyDown={(e) => e.key === "Enter" && handleConfirmModal()}
                    placeholder="İrsaliye numarasını giriniz"
                    className={`field-input w-full pl-9 ${
                      waybillError ? "border-red-500 focus:ring-red-500" : ""
                    }`}
                    autoFocus
                  />
                  <FileText className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
                </div>
                {waybillError && (
                  <p className="mt-1 text-[11px] font-semibold text-red-500 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" /> {waybillError}
                  </p>
                )}
              </div>

              {/* Field 2: Mal Kabul Deposu */}
              <div>
                <label className="mb-1 block font-bold text-fg">
                  Mal Kabul Deposu <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={targetWarehouse}
                    onChange={(e) => {
                      setTargetWarehouse(e.target.value);
                      if (targetError) setTargetError("");
                    }}
                    onKeyDown={(e) => e.key === "Enter" && handleConfirmModal()}
                    disabled={isValidatingWarehouse}
                    list="canias-warehouse-options"
                    placeholder="00&*"
                    className={`field-input w-full pl-9 font-semibold ${
                      targetError ? "border-red-500 focus:ring-red-500" : ""
                    }`}
                  />
                  {caniasWarehouses.length > 0 && (
                    <datalist id="canias-warehouse-options">
                      <option value="00&*" label="Standart Depo Kodu" />
                      {caniasWarehouses.map((w) => (
                        <option key={`tgt-${w.code}`} value={w.code}>
                          {w.code} {w.name ? `— ${w.name}` : ""}
                        </option>
                      ))}
                    </datalist>
                  )}
                  <Warehouse className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
                </div>
                {targetError && (
                  <p className="mt-1 text-[11px] font-semibold text-red-500 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" /> {targetError}
                  </p>
                )}
              </div>
            </div>

            {/* Modal Footer Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-line">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                disabled={isValidatingWarehouse}
                className="rounded-xl border border-line px-4 py-2 text-xs font-semibold text-subtle hover:bg-elevated transition disabled:opacity-50"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={handleConfirmModal}
                disabled={isValidatingWarehouse}
                className="flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white shadow-md transition hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50"
              >
                {isValidatingWarehouse ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Depo Doğrulanıyor...</span>
                  </>
                ) : (
                  <>
                    <span>Mal Kabule Başla</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
