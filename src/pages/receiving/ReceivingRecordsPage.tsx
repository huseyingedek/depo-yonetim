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
    ["READPURQTY", "Sip. Mik."],
    ["PURUNIT", "Sip. Birim"],
    ["READQTY", "Stok Mik."],
    ["QUNIT", "Stok Birim"],
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
                  <th key={k} className="whitespace-nowrap px-2 py-2 font-bold text-subtle text-xs w-px">
                    {ad}
                  </th>
                ))}
                <th className="px-1 py-2 text-center w-7" />
                <th className="w-full" />
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => {
                const rawWh = String(item.warehouse || targetWH || "00").trim();
                const wh = rawWh.includes("$") ? rawWh.split("$")[0].trim() : rawWh;
                const sp = item.stockPlace && item.stockPlace !== "*"
                  ? String(item.stockPlace).trim()
                  : (rawWh.includes("$") ? rawWh.split("$")[1].trim() : "*");

                const isPartili = Boolean(item.isSpecialLot) || item.specialStock === "1" || /takipli|partili/i.test(String(item.specialStock || ""));
                const specialStockVal = item.specialStock && item.specialStock !== "Takipli" && item.specialStock !== "Serbest"
                  ? item.specialStock
                  : (isPartili ? "1" : "*");
                const batchNumVal = isPartili && item.batchNum && item.batchNum !== "—" && item.batchNum !== "*"
                  ? item.batchNum
                  : "*";

                const rowData: Record<string, string | number> = {
                  MATERIAL: item.material || "—",
                  WAREHOUSE: wh || "00",
                  STOCKPLACE: sp || "*",
                  SPECIALSTOCK: specialStockVal,
                  BATCHNUM: batchNumVal,
                  READPURQTY: item.purQty !== undefined ? item.purQty : (item.receivedQty || 0),
                  PURUNIT: item.purUnit || item.unit || "AD",
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
                          <td key={k} className="px-2 py-2 font-mono text-xs font-semibold text-fg whitespace-nowrap w-px" title={item.name}>
                            <div>{deger || "—"}</div>
                            {displayName && (
                              <div className="font-sans text-[11px] font-normal text-subtle truncate">
                                {displayName}
                              </div>
                            )}
                          </td>
                        );
                      }
                      return (
                        <td
                          key={k}
                          className="whitespace-nowrap px-2 py-2 font-mono text-xs font-semibold text-fg w-px"
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
