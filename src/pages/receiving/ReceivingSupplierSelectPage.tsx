import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronRight,
  AlertCircle,
  Loader2,
  Search,
} from "lucide-react";
import PageHeader from "../../components/PageHeader";
import BarcodeScanner from "../../components/BarcodeScanner";
import Pagination, { usePagination } from "../../components/Pagination";
import { api } from "../../api/client";
import { hataMetni } from "../../utils/hata";

export interface SupplierOrder {
  id: string; // Tedarikçi Kodu (VENDOR)
  name: string; // Tedarikçi Adı (NAME1)
  poNumber: string; // Satın Alma Sipariş No (PURORDER)
  orderCount: number; // Açık Sipariş Kalem Sayısı
  barcode: string; // Malzeme Barkodu
  city?: string; // Şehir (CITY / IL / PROVINCE)
  location?: string; // Konum / Tesis (PLANT / DISTRICT / ADDRESS1 / COUNTRY)
  phone?: string; // Telefon (TELEPHONE1 / PHONE)
}


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
    const vendorCode = String(row.VENDOR || row.PSVENDOR || row.SUPPLIERID || row.CUSTOMER || `TED-${idx + 1}`).trim();
    const vendorName = String(row.NAME1 || row.SUPPLIERNAME || row.VENDORNAME || row.CUSNAME1 || "Tedarikçi").trim();
    const poNum = String(row.ORDERNUM || row.PURORDER || row.POORDER || row.PO_NUMBER || "").trim();

    // Şehir, İlçe, Adres ve Tesis alanları
    const city = String(row.CITY || row.CUSCITY || row.VENDORCITY || row.IL || row.PROVINCE || row.SEHIR || "").trim();
    const district = String(row.DISTRICT || row.ILCE || row.TOWN || row.COUNTY || "").trim();
    const address = String(row.ADDRESS1 || row.STREET || row.ADRES || "").trim();
    const country = String(row.COUNTRY || row.ULKE || "").trim();
    const plant = String(row.PLANT || row.FACILITY || row.TESIS || "").trim();
    const phone = String(row.TELEPHONE1 || row.PHONE || row.TEL || "").trim();

    // Akıllı konum metni oluşturma (yalnızca gerçek veri varsa)
    let formattedLocation = "";
    if (city && district) {
      formattedLocation = `${city} / ${district}`;
    } else if (city) {
      formattedLocation = country && country !== "TR" ? `${city} (${country})` : city;
    } else if (district) {
      formattedLocation = district;
    } else if (address) {
      formattedLocation = address;
    } else if (plant && plant !== "100") {
      formattedLocation = `Tesis ${plant}`;
    } else if (country && country !== "TR") {
      formattedLocation = country;
    }

    const groupKey = poNum ? `${vendorCode}_${poNum}` : vendorCode;
    if (!map.has(groupKey)) {
      map.set(groupKey, {
        id: vendorCode,
        name: vendorName,
        poNumber: poNum || "Açık Sipariş",
        orderCount: 1,
        barcode: barcodeFilter,
        city: city || undefined,
        location: formattedLocation || undefined,
        phone: phone || undefined,
      });
    } else {
      const existing = map.get(groupKey)!;
      existing.orderCount += 1;
      if ((!existing.poNumber || existing.poNumber === "Açık Sipariş") && poNum) {
        existing.poNumber = poNum;
      }
      if (!existing.city && city) existing.city = city;
      if (formattedLocation && !existing.location) {
        existing.location = formattedLocation;
      }
      if (!existing.phone && phone) existing.phone = phone;
    }
  });
  return Array.from(map.values());
};


export default function ReceivingSupplierSelectPage() {
  const navigate = useNavigate();
  // Tek arama kutusu — barkod + tedarikçi adı/kodu birleşik
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSupplier, setSelectedSupplier] = useState<SupplierOrder | null>(null);

  // Real CANIAS API Search State
  const [suppliers, setSuppliers] = useState<SupplierOrder[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => {
    // Mal kabul seçim sayfasına gelindiğinde eski yarım kalmış oturum kalıntılarını temizle
    try {
      Object.keys(localStorage).forEach((k) => {
        if (k.startsWith("mzy_receiving_items_")) {
          localStorage.removeItem(k);
        }
      });
    } catch { }
  }, []);

  // TEK arama: önce barkod ile dener; bulamazsa tüm açık siparişleri çekip
  // tedarikçi adı / kodu / sipariş no / malzeme / barkod ile filtreler.
  const handleSearch = async (raw: string) => {
    const query = raw.trim();
    if (!query) return;
    setSearchQuery(query);
    setIsLoading(true);
    setApiError(null);
    setHasSearched(true);
    setSelectedSupplier(null);
    try {
      // TEK istek: tüm açık siparişleri çek, istemci tarafında süz (ad/kod/PO/malzeme/barkod).
      // (MZYGetOpenOrder'ın PSBARCODE sunucu filtresi güvenilmez — boş dönüp gereksiz 2. isteğe yol açıyordu.)
      const allRes = await api.getOpenOrders();
      const q = trNormalize(query);
      const orders = (allRes.orders || []).filter((r) => {
        const name = trNormalize(String(r.NAME1 || r.SUPPLIERNAME || r.VENDORNAME || ""));
        const code = trNormalize(String(r.VENDOR || ""));
        const po = trNormalize(String(r.ORDERNUM || r.PURORDER || ""));
        const mat = trNormalize(String(r.MATERIAL || ""));
        const ean = trNormalize(String(r.BARCODE || r.EAN || ""));
        return name.includes(q) || code.includes(q) || po.includes(q) || mat.includes(q) || ean.includes(q);
      });
      setSuppliers(groupOrdersToSuppliers(orders, query));
    } catch (err) {
      setApiError(hataMetni(err, "CANIAS sunucusuna bağlanılamadı. Lütfen ağ bağlantınızı ve sunucu adresini kontrol edin."));
      setSuppliers([]);
    } finally {
      setIsLoading(false);
    }
  };

  // 3x3 Pagination (9 items per page)
  const pg = usePagination(suppliers, 9);
  useEffect(() => {
    pg.reset();
  }, [suppliers]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tedarikçiye tıklayınca doğrudan İrsaliye sayfasına geç (Devam Et butonu yok).
  const handleSelectSupplier = (supplier: SupplierOrder) => {
    handleProceedNextStep(supplier);
  };

  const handleProceedNextStep = async (sup: SupplierOrder) => {
    let targetPo = sup.poNumber;
    if (!targetPo || targetPo === "Aktif Tedarikçi" || targetPo === "Açık Sipariş") {
      setIsLoading(true);
      try {
        const res = await api.getOpenOrders({ vendor: sup.id });
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
    const finalPo =
      targetPo && targetPo !== "Aktif Tedarikçi" && targetPo !== "Açık Sipariş"
        ? targetPo
        : sup.poNumber;
    navigate("/receiving/irsaliye", {
      state: { supplier: { ...sup, poNumber: finalPo } },
    });
  };

  return (
    <div className="mx-auto max-w-6xl p-4 lg:p-6">
      {/* Main Page Header — tedarikçiye tıklayınca direkt geçilir, Devam Et butonu yok */}
      <PageHeader title="Mal Kabul — Tedarikçi Seçimi" backTo="/home" />

      {/* Tek arama kutusu — sonuç DÖNÜNCE gizlenir; sonuç yoksa mesajla birlikte kalır */}
      {suppliers.length === 0 && (
        <div className="rounded-2xl border border-line bg-surface p-2.5 shadow-card mb-2.5">
          <BarcodeScanner
            prompt=""
            placeholder="Barkod okutun ya da tedarikçi adı/kodu yazın"
            prefill={searchQuery}
            onDetected={handleSearch}
            hideCardWrapper
          />
        </div>
      )}

      {/* Sonuç varken: kompakt arama özeti + Yeni arama (input gizli) */}
      {suppliers.length > 0 && (
        <div className="mb-2.5 flex items-center justify-between gap-2 rounded-2xl border border-line bg-surface px-3.5 py-2 shadow-card">
          <span className="inline-flex min-w-0 items-center gap-2 text-xs text-subtle">
            <Search className="h-4 w-4 shrink-0" />
            <span className="truncate">
              Arama: <span className="font-mono font-semibold text-fg">{searchQuery}</span>
            </span>
          </span>
          <button
            type="button"
            onClick={() => {
              setSuppliers([]);
              setHasSearched(false);
              setSearchQuery("");
            }}
            className="shrink-0 text-xs font-semibold text-brand-600 hover:underline"
          >
            Yeni arama
          </button>
        </div>
      )}

      {/* API Notice / Error Banner */}
      {apiError && (
        <div className="mb-3 flex items-center justify-between rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs font-medium text-red-700 dark:text-red-300">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
            <span>{apiError}</span>
          </div>
        </div>
      )}



      {/* Grid States */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-16 rounded-2xl border border-line bg-surface p-6 text-center text-subtle shadow-sm">
          <Loader2 className="mb-3 h-8 w-8 animate-spin text-brand-600 dark:text-brand-400" />
          <p className="text-xs font-bold text-fg">CANIAS Veritabanından Sorgulanıyor...</p>
        </div>
      ) : !hasSearched ? (
        <div className="flex flex-col items-center justify-center py-12 rounded-2xl border border-dashed border-line bg-surface p-5 text-center text-subtle">
          <Search className="mb-2 h-8 w-8 text-muted" />
          <p className="text-xs font-bold text-fg">CANIAS Üzerinden Sorgulama Yapın</p>
          <p className="mt-1 text-[11px] text-subtle max-w-sm">
            Ürün barkodunu okutarak ya da tedarikçi unvanı/kodu yazarak canlı CANIAS veritabanından açık sipariş sorgulayınız.
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
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {pg.pageItems.map((supplier) => {
              const isSelected =
                selectedSupplier?.id === supplier.id &&
                selectedSupplier?.poNumber === supplier.poNumber;

              return (
                <button
                  key={`${supplier.id}_${supplier.poNumber}`}
                  type="button"
                  onClick={() => handleSelectSupplier(supplier)}
                  className={`w-full rounded-2xl border p-5 text-left shadow-card transition hover:-translate-y-0.5 hover:shadow-soft ${isSelected
                      ? "border-2 border-brand-500 bg-brand-500/10 dark:bg-brand-950/20 shadow-soft ring-1 ring-brand-500/30"
                      : "border-line bg-surface hover:border-brand-300 dark:hover:border-brand-700"
                    }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-base font-bold text-fg">
                          {supplier.poNumber || "Açık Sipariş"}
                        </span>
                        <span className="chip bg-brand-100 text-brand-700 dark:bg-brand-950/50 dark:text-brand-300 font-medium">
                          {supplier.orderCount > 1 ? `${supplier.orderCount} Kalem Açık` : "Açık Sipariş"}
                        </span>
                      </div>
                      {supplier.name && (
                        <p className="mt-0.5 text-sm text-muted truncate" title={supplier.name}>
                          {supplier.name}
                        </p>
                      )}
                    </div>
                    <ChevronRight className="mt-1 h-5 w-5 text-subtle shrink-0" />
                  </div>

                  {(supplier.location || supplier.phone) && (
                    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-subtle">
                      {supplier.location && <span>{supplier.location}</span>}
                      {supplier.phone && <span className="font-mono">{supplier.phone}</span>}
                    </div>
                  )}
                </button>
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
