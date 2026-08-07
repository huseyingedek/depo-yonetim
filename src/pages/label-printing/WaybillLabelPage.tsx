import { useEffect, useMemo, useState } from "react";
import { FileText, Search, Plus } from "lucide-react";
import { api } from "../../api/client";
import type { PickOrder } from "../../types";
import Pagination, { usePagination } from "../../components/Pagination";
import LabelOrderQueueHeader, { type QueuedLabelOrder } from "./components/LabelOrderQueueHeader";

export default function WaybillLabelPage() {
  const [pickOrders, setPickOrders] = useState<PickOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  const [selectedWaybill, setSelectedWaybill] = useState<PickOrder | null>(null);
  const [customDocNum, setCustomDocNum] = useState("");
  const [repeatCount, setRepeatCount] = useState<number>(1);

  // Queue state local to this page
  const [queuedOrders, setQueuedOrders] = useState<QueuedLabelOrder[]>([]);
  const [printing, setPrinting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  useEffect(() => {
    api
      .getPickOrders()
      .then(setPickOrders)
      .catch(() => setPickOrders([]))
      .finally(() => setLoading(false));
  }, []);

  const filteredWaybills = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return pickOrders;
    return pickOrders.filter(
      (o) =>
        o.id.toLowerCase().includes(s) ||
        (o.customer && o.customer.toLowerCase().includes(s)) ||
        (o.orderType && o.orderType.toLowerCase().includes(s))
    );
  }, [pickOrders, q]);

  const pg = usePagination(filteredWaybills, 9);
  useEffect(() => pg.reset(), [q]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAddOrder = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    const docNum = (selectedWaybill ? selectedWaybill.id : customDocNum.trim()).toUpperCase();
    if (!docNum) {
      setErrorMsg("Lütfen ızgaradan bir irsaliye seçin veya belge numarası girin.");
      return;
    }

    const count = Number(repeatCount);
    if (!Number.isInteger(count) || count < 1 || count > 99) {
      setErrorMsg("Kopya sayısı 1 ile 99 arasında olmalıdır.");
      return;
    }

    const newOrder: QueuedLabelOrder = {
      id: "way-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6),
      title: `İrsaliye: ${docNum}`,
      subtitle: selectedWaybill?.customer ? `Müşteri: ${selectedWaybill.customer}` : "İrsaliye Belge Etiketi",
      copies: count,
      payload: {
        docNum,
        repeat: count,
      },
    };

    setQueuedOrders((prev) => [...prev, newOrder]);
    setSelectedWaybill(null);
    setCustomDocNum("");
    setRepeatCount(1);
    setSuccessMsg(`İrsaliye etiket siparişi eklendi (${docNum} - ${count} kopya).`);
  };

  const handleRemoveOrder = (id: string) => {
    setQueuedOrders((prev) => prev.filter((o) => o.id !== id));
  };

  const handlePrintAll = async () => {
    if (queuedOrders.length === 0) return;
    setPrinting(true);
    setErrorMsg("");
    setSuccessMsg("");

    // Simulate batch print for waybills
    await new Promise((res) => setTimeout(res, 800));

    setPrinting(false);
    setSuccessMsg(`Toplam ${queuedOrders.length} adet irsaliye etiket siparişi başarıyla CANIAS'a iletildi.`);
    setQueuedOrders([]);
  };

  return (
    <div className="mx-auto max-w-6xl p-4 lg:p-8">
      <LabelOrderQueueHeader
        title="İrsaliye Etiketi Yazdırma"
        subtitle="Sevkiyat evrakları ve irsaliye etiketlerini siparişe ekleyip yazdırın"
        icon={FileText}
        iconBg="bg-emerald-100 dark:bg-emerald-900/30"
        iconFg="text-emerald-600 dark:text-emerald-400"
        queuedOrders={queuedOrders}
        onRemoveOrder={handleRemoveOrder}
        onPrintAll={handlePrintAll}
        printing={printing}
        errorMsg={errorMsg}
        successMsg={successMsg}
      />

      {/* Search Bar */}
      <div className="relative mb-5">
        <Search className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-subtle" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="İrsaliye / Belge No veya Müşteri Ara..."
          className="field-input pl-11"
        />
      </div>

      {/* 3x3 Grid Layout */}
      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-2xl bg-elevated" />
          ))}
        </div>
      ) : filteredWaybills.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 rounded-2xl border border-line bg-surface text-subtle">
          <FileText className="mb-2 h-10 w-10" />
          <p className="text-sm">Aranan kriterde irsaliye kaydı bulunamadı.</p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {pg.pageItems.map((o) => {
              const isSelected = selectedWaybill?.id === o.id;
              return (
                <div
                  key={o.id}
                  onClick={() => {
                    setSelectedWaybill(o);
                    setCustomDocNum("");
                  }}
                  className={`relative flex cursor-pointer flex-col justify-between rounded-2xl border p-5 text-left shadow-card transition-all hover:shadow-soft ${
                    isSelected
                      ? "border-emerald-500 bg-emerald-500/10 ring-2 ring-emerald-500/30"
                      : "border-line bg-surface hover:border-emerald-300"
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between">
                      <span className="font-mono text-base font-extrabold text-fg">{o.id}</span>
                      {o.orderType && (
                        <span className="chip bg-violet-100 font-mono text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">
                          {o.orderType}
                        </span>
                      )}
                    </div>
                    {o.customer && <p className="mt-2 truncate text-xs font-medium text-subtle">{o.customer}</p>}
                    {o.reference && <p className="mt-1 line-clamp-1 text-[11px] text-muted">{o.reference}</p>}
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t border-line/60 pt-3 text-xs">
                    <span className="text-subtle font-mono">{o.createdAt || "CANIAS"}</span>
                    <span
                      className={`chip text-[11px] ${
                        isSelected ? "bg-emerald-600 text-white" : "bg-elevated text-subtle"
                      }`}
                    >
                      {isSelected ? "Seçildi" : "Seç"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4">
            <Pagination
              page={pg.page}
              pageCount={pg.pageCount}
              onChange={pg.setPage}
              rangeStart={pg.rangeStart}
              rangeEnd={pg.rangeEnd}
              total={pg.total}
              label="İrsaliye"
            />
          </div>
        </>
      )}

      {/* Selected Item & Order Add Form */}
      <form onSubmit={handleAddOrder} className="mt-6 rounded-2xl border border-line bg-surface p-5 shadow-card space-y-4">
        <h3 className="text-sm font-bold text-fg">Siparişe Eklenecek İrsaliye Etiketi Detayı</h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-fg">
              İrsaliye / Belge No (DOCNUM)
            </label>
            <input
              type="text"
              value={selectedWaybill ? selectedWaybill.id : customDocNum}
              onChange={(e) => {
                setSelectedWaybill(null);
                setCustomDocNum(e.target.value);
              }}
              placeholder="Örn: IRS2026000123"
              className="field-input w-full uppercase"
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
            disabled={!selectedWaybill && !customDocNum.trim()}
            className="btn-primary w-full sm:w-auto flex items-center justify-center gap-2 py-2.5 px-6 shadow-sm"
          >
            <Plus className="h-4 w-4" />
            <span>Etiket Siparişi Ekle</span>
          </button>
        </div>
      </form>
    </div>
  );
}
