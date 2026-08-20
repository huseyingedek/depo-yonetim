import { useState } from "react";
import { useNavigate, useParams, useSearchParams, useLocation } from "react-router-dom";
import { Trash2, ArrowLeft } from "lucide-react";
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
      const storageKey = `mzy_receiving_items_${vendorCode || id || "active"}_${waybillNo || "active"}`;
      const local = localStorage.getItem(storageKey);
      if (local) {
        const parsed = JSON.parse(local);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
      return [];
    } catch {
      return [];
    }
  });

  const handleDeleteItem = (itemId: string) => {
    const updated = items.filter((it) => it.id !== itemId);
    setItems(updated);
    try {
      const storageKey = `mzy_receiving_items_${vendorCode || id || "active"}_${waybillNo || "active"}`;
      localStorage.setItem(storageKey, JSON.stringify(updated));
    } catch {}
  };

  const backUrl = `/receiving/${encodeURIComponent(vendorCode || id || "")}?waybill=${encodeURIComponent(
    waybillNo
  )}&targetWH=${encodeURIComponent(targetWH)}&vendor=${encodeURIComponent(
    vendorCode
  )}&vendorName=${encodeURIComponent(vendorName)}`;

  const KOLONLAR = [
    ["MATERIAL", "Malzeme"],
    ["WAREHOUSE", "Depo"],
    ["STOCKPLACE", "Stok yeri"],
    ["SPECIALSTOCK", "Özel stok"],
    ["BATCHNUM", "Parti"],
    ["READQTY", "Miktar"],
    ["QUNIT", "Birim"],
    ["ORDERTYPE", "Belge tipi"],
    ["ORDERNUM", "Belge no"],
    ["ITEMNO", "Kalem no"],
  ] as const;

  return (
    <div className="mx-auto max-w-6xl p-4 lg:p-8 animate-fade-in">
      <PageHeader
        title="Kabul Edilenler"
        subtitle={`${vendorName || vendorCode || id} · ${items.length} satır`}
        right={
          <button
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
            className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-1.5 text-sm font-semibold text-muted transition hover:bg-elevated"
          >
            <ArrowLeft className="h-4 w-4" />
            Mal kabule dön
          </button>
        }
      />

      {!items.length ? (
        <div className="rounded-2xl border border-line bg-surface p-10 text-center text-sm text-subtle">
          Henüz kabul edilen malzeme yok.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface shadow-card">
          <table className="w-full text-left text-xs table-auto">
            <thead className="border-b border-line bg-elevated">
              <tr>
                {KOLONLAR.map(([k, ad]) => (
                  <th key={k} className="whitespace-nowrap px-1.5 py-2 font-semibold text-muted w-px">
                    {ad}
                  </th>
                ))}
                <th className="px-1 py-2 text-center w-7" />
                <th className="w-full" />
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => {
                const rowData: Record<string, string | number> = {
                  MATERIAL: item.material || "—",
                  WAREHOUSE: item.warehouse || targetWH || "—",
                  STOCKPLACE: item.stockPlace || "*",
                  SPECIALSTOCK: item.specialStock || (item.isSpecialLot ? "Takipli" : "Serbest"),
                  BATCHNUM: item.batchNum || "—",
                  READQTY: item.receivedQty || 0,
                  QUNIT: item.unit || "AD",
                  ORDERTYPE: item.orderType || "OP",
                  ORDERNUM: item.orderNum || waybillNo || "—",
                  ITEMNO: item.itemNum ?? 1,
                };

                return (
                  <tr key={item.id || i} className="border-b border-line last:border-0 hover:bg-elevated/20 transition-colors">
                    {KOLONLAR.map(([k]) => {
                      const deger = String(rowData[k] ?? "").trim();
                      if (k === "MATERIAL") {
                        const displayName = item.name
                          ? item.name.length > 31
                            ? `${item.name.slice(0, 31)}...`
                            : item.name
                          : "";
                        return (
                          <td key={k} className="px-1.5 py-1.5 font-mono text-fg font-black whitespace-nowrap w-px" title={item.name}>
                            <div>{deger || "—"}</div>
                            {displayName && (
                              <div className="font-sans text-[11px] font-normal text-subtle truncate">
                                {displayName}
                              </div>
                            )}
                          </td>
                        );
                      }
                      if (k === "READQTY") {
                        return (
                          <td key={k} className="whitespace-nowrap px-1.5 py-1.5 font-mono font-black text-fg w-px">
                            {deger}
                          </td>
                        );
                      }
                      if (k === "BATCHNUM" && item.batchNum) {
                        return (
                          <td key={k} className="whitespace-nowrap px-1.5 py-1.5 font-mono font-bold text-violet-600 dark:text-violet-400 w-px">
                            {deger}
                          </td>
                        );
                      }
                      return (
                        <td
                          key={k}
                          className="whitespace-nowrap px-1.5 py-1.5 font-mono text-muted w-px"
                        >
                          {deger || "—"}
                        </td>
                      );
                    })}
                    <td className="px-1 py-1.5 text-center w-7 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => handleDeleteItem(item.id)}
                        aria-label="Kaydı sil"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-subtle transition hover:bg-rose-100 hover:text-rose-600 dark:hover:bg-rose-950/50"
                        title="Kaydı Sil"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                    <td className="w-full" />
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
