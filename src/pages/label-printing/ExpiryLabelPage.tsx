import { useState } from "react";
import { CalendarDays, Search, Plus, Loader2, CheckCircle2 } from "lucide-react";
import { api } from "../../api/client";
import LabelOrderQueueHeader, { type QueuedLabelOrder } from "./components/LabelOrderQueueHeader";

export default function ExpiryLabelPage() {
  const [searchBarcode, setSearchBarcode] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [repeatCount, setRepeatCount] = useState<number>(1);
  const [batchNum, setBatchNum] = useState("");

  const [searching, setSearching] = useState(false);
  const [searchSuccess, setSearchSuccess] = useState(false);

  // Queue state local to this page
  const [queuedOrders, setQueuedOrders] = useState<QueuedLabelOrder[]>([]);
  const [printing, setPrinting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const handleSearchMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");
    setSearchSuccess(false);

    const term = searchBarcode.trim();
    if (!term && !expiryDate) {
      setErrorMsg("Lütfen malzeme barkodu veya SKT tarihi girin.");
      return;
    }

    setSearching(true);
    try {
      // Query CANIAS for material batch/stock info
      const results = await api.queryStock({ barcode: term });
      if (results && results.length > 0) {
        const found = results[0];
        setBatchNum(found.batchNum || term);
        setSearchSuccess(true);
        setSuccessMsg(`CANIAS stok verisi bulundu: ${found.material} - Parti/Batch: ${found.batchNum || "-"}`);
      } else {
        setBatchNum(term);
        setSearchSuccess(true);
        setSuccessMsg(`Girilen barkod (${term}) için etiket bilgileri hazırlandı.`);
      }
    } catch {
      setBatchNum(term);
      setSearchSuccess(true);
    } finally {
      setSearching(false);
    }
  };

  const handleAddOrder = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    const code = searchBarcode.trim();
    if (!code && !batchNum) {
      setErrorMsg("Lütfen malzeme barkodu veya SKT tarihi girerek aratın.");
      return;
    }

    const count = Number(repeatCount);
    if (!Number.isInteger(count) || count < 1 || count > 99) {
      setErrorMsg("Kopya sayısı 1 ile 99 arasında olmalıdır.");
      return;
    }

    const targetBatch = batchNum || code;

    const newOrder: QueuedLabelOrder = {
      id: "exp-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6),
      title: `SKT Etiketi: ${code || targetBatch}`,
      subtitle: expiryDate ? `SKT Tarihi: ${expiryDate}` : `Batch: ${targetBatch}`,
      copies: count,
      payload: {
        container: targetBatch,
        repeat: count,
        expiryDate,
      },
    };

    setQueuedOrders((prev) => [...prev, newOrder]);
    setSearchBarcode("");
    setExpiryDate("");
    setBatchNum("");
    setRepeatCount(1);
    setSearchSuccess(false);
    setSuccessMsg(`SKT etiket siparişi eklendi (${targetBatch} - ${count} kopya).`);
  };

  const handleRemoveOrder = (id: string) => {
    setQueuedOrders((prev) => prev.filter((o) => o.id !== id));
  };

  const handlePrintAll = async () => {
    if (queuedOrders.length === 0) return;
    setPrinting(true);
    setErrorMsg("");
    setSuccessMsg("");

    let successCount = 0;
    let failedCount = 0;

    for (const ord of queuedOrders) {
      try {
        const payload = ord.payload as { container: string; repeat: number };
        const res = await api.printWHSP({
          company: "01",
          plant: "100",
          container: payload.container,
          repeat: payload.repeat,
        });
        if (res.ok) successCount++;
        else failedCount++;
      } catch {
        failedCount++;
      }
    }

    setPrinting(false);
    if (failedCount === 0) {
      setSuccessMsg(`Toplam ${successCount} adet SKT etiket siparişi başarıyla CANIAS'a iletildi.`);
      setQueuedOrders([]);
    } else {
      setErrorMsg(`${successCount} etiket yazdırıldı, ${failedCount} adet siparişte hata oluştu.`);
    }
  };

  return (
    <div className="mx-auto max-w-6xl p-4 lg:p-8">
      <LabelOrderQueueHeader
        title="SKT (Son Kullanma Tarihi) Etiketi Yazdırma"
        subtitle="Malzeme barkodu veya SKT tarihi ile aratıp etiket siparişlerini ekleyin"
        icon={CalendarDays}
        iconBg="bg-amber-100 dark:bg-amber-900/30"
        iconFg="text-amber-600 dark:text-amber-400"
        queuedOrders={queuedOrders}
        onRemoveOrder={handleRemoveOrder}
        onPrintAll={handlePrintAll}
        printing={printing}
        errorMsg={errorMsg}
        successMsg={successMsg}
      />

      {/* Form Area */}
      <div className="rounded-2xl border border-line bg-surface p-6 shadow-card space-y-6">
        <h3 className="text-sm font-bold text-fg">SKT Etiketi Arama ve Hazırlama</h3>

        {/* Search Bar */}
        <form onSubmit={handleSearchMaterial} className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-subtle" />
            <input
              type="text"
              value={searchBarcode}
              onChange={(e) => setSearchBarcode(e.target.value)}
              placeholder="Malzeme Barkodu veya Ürün Kodu Girin..."
              className="field-input pl-11"
            />
          </div>

          <div className="w-full sm:w-56">
            <input
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
              className="field-input w-full text-xs"
            />
          </div>

          <button
            type="submit"
            disabled={searching || (!searchBarcode.trim() && !expiryDate)}
            className="btn-primary flex items-center justify-center gap-2 py-2.5 px-5 shadow-sm shrink-0"
          >
            {searching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            <span>CANIAS'ta Ara</span>
          </button>
        </form>

        {searchSuccess && (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>Etiket parametreleri hazırlandı. Aşağıdan kopya sayısını belirleyip siparişe ekleyebilirsiniz.</span>
          </div>
        )}

        {/* Order Add Form */}
        <form onSubmit={handleAddOrder} className="border-t border-line pt-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-fg">
                Son Kullanma Tarihi (SKT)
              </label>
              <input
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                className="field-input w-full"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-fg">
                Kopya Sayısı <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min={1}
                max={99}
                required
                value={repeatCount}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  setRepeatCount(isNaN(v) ? 1 : Math.min(99, Math.max(1, v)));
                }}
                className="field-input w-full"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={!searchBarcode.trim() && !expiryDate && !batchNum}
              className="btn-primary w-full sm:w-auto flex items-center justify-center gap-2 py-2.5 px-6 shadow-sm"
            >
              <Plus className="h-4 w-4" />
              <span>Etiket Siparişi Ekle</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
