import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Barcode,
  Truck,
  ArrowRight,
  CheckCircle2,
  Building2,
  FileText,
  AlertCircle,
  X,
  CornerDownLeft,
} from "lucide-react";
import PageHeader from "../../components/PageHeader";
import BarcodeScanner from "../../components/BarcodeScanner";
import Pagination, { usePagination } from "../../components/Pagination";

export interface MockSupplierOrder {
  id: string; // Tedarikçi Kodu (Örn: TED-00102)
  name: string; // Tedarikçi Adı (Örn: Eczacıbaşı Tüketim Ürünleri A.Ş.)
  poNumber: string; // Satın Alma Sipariş No (Örn: PO-2026-0812)
  orderCount: number; // Açık Sipariş Kalem Sayısı
  barcode: string; // Örnek Malzeme Barkodu
  materialName: string; // Malzeme Adı
  deliveryDate: string; // Beklenen Teslim Tarihi
  warehouse: string; // Mal Kabul Deposu
}

const MOCK_SUPPLIERS: MockSupplierOrder[] = [
  {
    id: "TED-1001",
    name: "Eczacıbaşı Tüketim Ürünleri A.Ş.",
    poNumber: "PO-2026-0812",
    orderCount: 4,
    barcode: "8690723511208",
    materialName: "Selpak Tuvalet Kağıdı 32'li Ekstra Yumuşak",
    deliveryDate: "11.08.2026",
    warehouse: "10-Merkez Depo",
  },
  {
    id: "TED-1002",
    name: "Ülker Bisküvi Sanayi ve Ticaret A.Ş.",
    poNumber: "PO-2026-0815",
    orderCount: 12,
    barcode: "8690504011002",
    materialName: "Ülker Çikolatalı Gofret 36'lı Koli",
    deliveryDate: "11.08.2026",
    warehouse: "10-Merkez Depo",
  },
  {
    id: "TED-1003",
    name: "Hayat Kimya Sanayi A.Ş.",
    poNumber: "PO-2026-0819",
    orderCount: 8,
    barcode: "8690536021105",
    materialName: "Bingo Matik Deterjan 10kg Sık Yıkananlar",
    deliveryDate: "12.08.2026",
    warehouse: "20-Hızlı Tüketim Deposu",
  },
  {
    id: "TED-1004",
    name: "P&G Tüketim Maddeleri Sanayi A.Ş.",
    poNumber: "PO-2026-0824",
    orderCount: 6,
    barcode: "4015600812001",
    materialName: "Ariel Sıvı Deterjan 40 Yıkama Dağ Tazeliği",
    deliveryDate: "11.08.2026",
    warehouse: "10-Merkez Depo",
  },
  {
    id: "TED-1005",
    name: "Unilever Sanayi ve Ticaret Türk A.Ş.",
    poNumber: "PO-2026-0830",
    orderCount: 15,
    barcode: "8710447289100",
    materialName: "Dove Sıvı Sabun 500ml Nemlendirici Bakım",
    deliveryDate: "13.08.2026",
    warehouse: "10-Merkez Depo",
  },
  {
    id: "TED-1006",
    name: "Sütaş Süt Ürünleri A.Ş.",
    poNumber: "PO-2026-0835",
    orderCount: 9,
    barcode: "8690623010111",
    materialName: "Sütaş Tam Yağlı Süt 1L 12'li Koli",
    deliveryDate: "11.08.2026",
    warehouse: "30-Soğuk Hava Deposu",
  },
  {
    id: "TED-1007",
    name: "Eti Gıda Sanayi ve Ticaret A.Ş.",
    poNumber: "PO-2026-0840",
    orderCount: 11,
    barcode: "8690526010022",
    materialName: "Eti Burçak Bisküvi 18'li Paket",
    deliveryDate: "12.08.2026",
    warehouse: "10-Merkez Depo",
  },
  {
    id: "TED-1008",
    name: "Şölen Çikolata Gıda Sanayi A.Ş.",
    poNumber: "PO-2026-0845",
    orderCount: 7,
    barcode: "8690558001005",
    materialName: "Şölen Milango Çikolata Kutusu 250g",
    deliveryDate: "14.08.2026",
    warehouse: "10-Merkez Depo",
  },
  {
    id: "TED-1009",
    name: "Nestle Türkiye Gıda Sanayi A.Ş.",
    poNumber: "PO-2026-0850",
    orderCount: 14,
    barcode: "7613035123456",
    materialName: "Nescafe 3'ü 1 Arada Arada 56'lı Paket",
    deliveryDate: "11.08.2026",
    warehouse: "10-Merkez Depo",
  },
  {
    id: "TED-1010",
    name: "PepsiCo Yiyecek İçecek A.Ş.",
    poNumber: "PO-2026-0855",
    orderCount: 10,
    barcode: "8690637001234",
    materialName: "Lays Klasik Patates Cipsi Parti Boy",
    deliveryDate: "13.08.2026",
    warehouse: "20-Hızlı Tüketim Deposu",
  },
  {
    id: "TED-1011",
    name: "Coca-Cola İçecek A.Ş.",
    poNumber: "PO-2026-0860",
    orderCount: 18,
    barcode: "5449000000996",
    materialName: "Coca-Cola Orijinal Tat 1L 12'li Koli",
    deliveryDate: "11.08.2026",
    warehouse: "10-Merkez Depo",
  },
  {
    id: "TED-1012",
    name: "Mey İçki Sanayi ve Ticaret A.Ş.",
    poNumber: "PO-2026-0865",
    orderCount: 5,
    barcode: "8690123456789",
    materialName: "Meyve Suyu Çeşitleri 1L Koli",
    deliveryDate: "15.08.2026",
    warehouse: "10-Merkez Depo",
  },
];

type SearchTab = "barcode" | "supplierName";

export default function ReceivingSupplierSelectPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<SearchTab>("barcode");

  // Search & Selection State
  const [barcodeSearch, setBarcodeSearch] = useState("");
  const [nameSearch, setNameSearch] = useState("");
  const [scannedBarcode, setScannedBarcode] = useState("");
  const [selectedSupplier, setSelectedSupplier] = useState<MockSupplierOrder | null>(null);

  // Status/Step Feedback State
  const [stepNotice, setStepNotice] = useState<{ open: boolean; message: string }>({
    open: false,
    message: "",
  });

  const handleTabChange = (tab: SearchTab) => {
    setActiveTab(tab);
    setBarcodeSearch("");
    setNameSearch("");
    setScannedBarcode("");
    setSelectedSupplier(null);
  };

  const handleBarcodeScan = (code: string) => {
    const trimmed = code.trim();
    setBarcodeSearch(trimmed);
    setScannedBarcode(trimmed);
    setSelectedSupplier(null);
  };

  // Filter logic for Barcode Tab
  const barcodeResults = useMemo(() => {
    const query = barcodeSearch.trim().toLowerCase();
    if (!query) return MOCK_SUPPLIERS;
    return MOCK_SUPPLIERS.filter(
      (s) =>
        s.barcode.toLowerCase().includes(query) ||
        s.materialName.toLowerCase().includes(query) ||
        s.poNumber.toLowerCase().includes(query)
    );
  }, [barcodeSearch]);

  // Filter logic for Supplier Name Tab
  const nameResults = useMemo(() => {
    const query = nameSearch.trim().toLowerCase();
    if (!query) return MOCK_SUPPLIERS;
    return MOCK_SUPPLIERS.filter(
      (s) =>
        s.name.toLowerCase().includes(query) ||
        s.id.toLowerCase().includes(query) ||
        s.poNumber.toLowerCase().includes(query)
    );
  }, [nameSearch]);

  const activeResults = activeTab === "barcode" ? barcodeResults : nameResults;

  // 3x3 Pagination (9 items per page)
  const pg = usePagination(activeResults, 9);
  useEffect(() => {
    pg.reset();
  }, [activeTab, barcodeSearch, nameSearch]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelectSupplier = (supplier: MockSupplierOrder) => {
    if (selectedSupplier?.id === supplier.id) {
      setSelectedSupplier(null);
    } else {
      setSelectedSupplier(supplier);
    }
  };

  // Proceed Handler (Header top-right button)
  const handleProceedNextStep = () => {
    if (!selectedSupplier) return;
    setStepNotice({
      open: true,
      message: `${selectedSupplier.name} (${selectedSupplier.poNumber}) seçildi. Adım 2: İrsaliye No Girişi ekranına geçiliyor...`,
    });
    setTimeout(() => {
      navigate(`/receiving/${selectedSupplier.poNumber}`);
    }, 1800);
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
                  Okutulan Barkod: <strong>{scannedBarcode}</strong>
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
                placeholder="Tedarikçi adı veya kodu yazın"
                className="field-input w-full pr-11"
                autoFocus
              />
              <button
                type="button"
                onClick={() => {}}
                disabled={!nameSearch.trim()}
                className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-subtle transition hover:bg-elevated hover:text-fg disabled:opacity-30"
              >
                <CornerDownLeft className="h-5 w-5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Supplier Results Grid Header (Tightly aligned to Search Card) */}
      <div className="mt-3 mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Truck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          <h2 className="text-xs sm:text-sm font-extrabold text-fg">
            {activeTab === "barcode" ? "Barkodla Eşleşen Tedarikçiler" : "Aktif Tedarikçi Listesi"}
          </h2>
          <span className="chip bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
            {activeResults.length} Sonuç
          </span>
        </div>
        {selectedSupplier && (
          <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5" /> 1 Seçildi
          </span>
        )}
      </div>

      {/* Supplier Cards 3x3 Grid */}
      {activeResults.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 rounded-2xl border border-dashed border-line bg-surface p-5 text-center text-subtle">
          <AlertCircle className="mb-2 h-8 w-8 text-muted" />
          <p className="text-xs font-bold text-fg">Eşleşen Tedarikçi Bulunamadı</p>
          <p className="mt-1 text-[11px] text-subtle max-w-sm">
            Aradığınız kriterlere uygun aktif satın alma siparişi bulunamadı. Lütfen barkodu veya tedarikçi adını kontrol edin.
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
                  className={`relative flex flex-col justify-between rounded-xl border p-3.5 cursor-pointer transition-all duration-200 ${
                    isSelected
                      ? "border-2 border-emerald-500 bg-emerald-500/10 dark:bg-emerald-950/20 shadow-sm ring-1 ring-emerald-500/30"
                      : "border-line bg-surface hover:border-emerald-300 dark:hover:border-emerald-700 hover:shadow-soft"
                  }`}
                >
                  {/* Upper Selection Row */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
                          isSelected
                            ? "bg-emerald-600 text-white"
                            : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                        }`}
                      >
                        <Building2 className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-[11px] font-bold text-subtle">{supplier.id}</span>
                          <span className="chip text-[10px] py-0 px-1.5 bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                            {supplier.poNumber}
                          </span>
                        </div>
                        <h4 className="mt-0.5 text-xs font-bold text-fg leading-tight truncate">
                          {supplier.name}
                        </h4>
                      </div>
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

                  {/* Compact Details Container: Sadece Kalem Bilgisi */}
                  <div className="mt-2 pt-1.5 border-t border-line text-[11px]">
                    <div className="flex items-center justify-between text-subtle">
                      <span className="flex items-center gap-1.5 font-medium">
                        <FileText className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" /> Sipariş Kalemi:
                      </span>
                      <span className="font-bold text-fg">{supplier.orderCount} Kalem</span>
                    </div>
                  </div>

                  {/* Selected Badge */}
                  {isSelected && (
                    <div className="mt-2 flex items-center justify-between rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white shadow-xs">
                      <span className="flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Seçildi
                      </span>
                      <span className="underline text-[10px]">Devam Et &rarr;</span>
                    </div>
                  )}
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
    </div>
  );
}
