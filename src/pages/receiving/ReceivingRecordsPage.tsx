import { useState } from "react";
import { useNavigate, useParams, useSearchParams, useLocation } from "react-router-dom";
import { ArrowLeft, Trash2, Package, Ruler } from "lucide-react";
import PageHeader from "../../components/PageHeader";
import type { ReceivedItem } from "./MaterialReceiptModal";

export default function ReceivingRecordsPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const location = useLocation();

  const waybillNo = searchParams.get("waybill") || location.state?.waybillNo || "";
  const targetWH = searchParams.get("targetWH") || location.state?.targetWarehouse || "";
  const vendorCode = searchParams.get("vendor") || location.state?.vendor || "";
  const vendorName = searchParams.get("vendorName") || location.state?.vendorName || "Tedarikçi";

  const [items, setItems] = useState<ReceivedItem[]>(() => {
    try {
      const stateItems = location.state?.items as ReceivedItem[] | undefined;
      if (Array.isArray(stateItems) && stateItems.length > 0) return stateItems;
      return [];
    } catch {
      return [];
    }
  });

  const handleDeleteItem = (itemId: string) => {
    const updated = items.filter((it) => it.id !== itemId);
    setItems(updated);
  };

  const totalQuantity = items.reduce((sum, it) => sum + it.receivedQty, 0);

  const backUrl = `/receiving/${encodeURIComponent(id || "")}?waybill=${encodeURIComponent(
    waybillNo
  )}&targetWH=${encodeURIComponent(targetWH)}&vendor=${encodeURIComponent(
    vendorCode
  )}&vendorName=${encodeURIComponent(vendorName)}`;

  return (
    <div className="mx-auto max-w-6xl p-3.5 sm:p-6 lg:p-8 animate-fade-in">
      <PageHeader
        title="Okutulan Ürünler"
        subtitle={`${vendorName} · İrsaliye: ${waybillNo || "—"} · Depo: ${targetWH || "—"}`}
        right={
          <div className="flex items-center gap-3">
            <span className="chip bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 font-mono font-bold text-xs sm:text-sm px-3 py-1.5 border border-emerald-500/20 shadow-sm">
              Toplam: {totalQuantity} Adet · {items.length} Kalem
            </span>
            <button
              type="button"
              onClick={() =>
                navigate(backUrl, {
                  state: {
                    ...location.state,
                    items,
                    waybillNo,
                    targetWarehouse: targetWH,
                    vendor: vendorCode,
                    vendorName,
                  },
                })
              }
              className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface px-3.5 py-1.5 text-xs sm:text-sm font-bold text-subtle transition hover:bg-elevated hover:text-fg shadow-sm active:scale-95"
            >
              <ArrowLeft className="h-4 w-4" />
              Mal Kabule Dön
            </button>
          </div>
        }
      />

      {items.length === 0 ? (
        <div className="rounded-3xl border border-line bg-surface p-12 text-center text-subtle shadow-card">
          <Package className="mx-auto h-12 w-12 text-subtle/50 mb-3" />
          <p className="text-sm font-semibold text-fg">Henüz okutulan ürün bulunmuyor.</p>
          <p className="text-xs text-subtle mt-1">Mal kabul ekranından barkod okutarak ürün ekleyebilirsiniz.</p>
          <button
            type="button"
            onClick={() => navigate(backUrl)}
            className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 transition active:scale-95 shadow-md"
          >
            <ArrowLeft className="h-4 w-4" />
            Ürün Okutmaya Başla
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface shadow-card">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead className="border-b border-line bg-elevated/60 text-muted">
              <tr>
                <th className="px-4 py-3 font-bold text-fg">Sıra</th>
                <th className="px-4 py-3 font-bold text-fg">Malzeme Kodu & Adı</th>
                <th className="px-4 py-3 font-bold text-fg text-center">Okutulan Adet</th>
                <th className="px-4 py-3 font-bold text-fg">Sipariş No</th>
                <th className="px-4 py-3 font-bold text-fg">Ölçü Bilgileri</th>
                <th className="px-4 py-3 font-bold text-fg text-right">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {items.map((item, idx) => (
                <tr key={item.id || idx} className="hover:bg-elevated/40 transition">
                  <td className="px-4 py-3.5 font-mono font-bold text-subtle">{idx + 1}</td>
                  <td className="px-4 py-3.5 max-w-[280px]">
                    <div className="flex items-center gap-2">
                      <span className="chip bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 font-mono font-bold text-[11px]">
                        {item.material}
                      </span>
                    </div>
                    <p className="mt-1 font-semibold text-fg text-xs truncate leading-snug" title={item.name}>
                      {item.name}
                    </p>
                  </td>
                  <td className="px-4 py-3.5 text-center">
                    <span className="font-mono text-sm font-extrabold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 px-2.5 py-1 rounded-lg border border-emerald-500/20">
                      {item.receivedQty} {item.unit || "AD"}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 font-mono text-fg">
                    <span className="font-bold">{item.orderNum || "—"}</span>
                  </td>
                  <td className="px-4 py-3.5 font-mono text-subtle text-[11px]">
                    {item.dimensions && item.dimensions.width > 0 ? (
                      <div className="flex items-center gap-1 text-fg">
                        <Ruler className="h-3 w-3 text-muted shrink-0" />
                        <span>
                          {item.dimensions.width}x{item.dimensions.length}x{item.dimensions.height} cm · {item.dimensions.brutWeight} kg
                        </span>
                      </div>
                    ) : (
                      <span className="text-subtle">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <button
                      type="button"
                      onClick={() => handleDeleteItem(item.id)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-subtle hover:bg-rose-500/10 hover:text-rose-600 transition"
                      title="Sil"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
