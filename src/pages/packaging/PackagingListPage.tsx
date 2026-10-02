import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Search, RefreshCw, MapPin, Package, ChevronRight, User } from "lucide-react";
import { api as wmsApi } from "../../api/client";
import { useAppStore } from "../../store/appStore";
import PageHeader from "../../components/PageHeader";
import Pagination, { usePagination } from "../../components/Pagination";
import type { PackOrder } from "./PackagingPage";

// Paketleme Ara Liste Ekranı — "Paketlenmeyi Bekleyenler".
// Bora: Toplama emri listesi gibi bir ara ekran; MZYListingPack (depo = Paketleme Deposu).
// Kart seçilince iç ekran (/packaging/pack) açılır; orada MZYEnterPack çağrılır.
export default function PackagingListPage() {
  const navigate = useNavigate();
  const packWh = useAppStore((s) => s.settings.warehousePackaging);
  const compCode = useAppStore((s) => s.settings.company);
  const plantCode = useAppStore((s) => s.settings.facility);

  const [orders, setOrders] = useState<PackOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const fetchList = useCallback(async () => {
    if (!packWh) {
      setLoaded(true);
      setOrders([]);
      setError("Ayarlarda Paketleme Deposu tanımlı değil. Lütfen Ayarlar ekranından seçin.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const rows = await wmsApi.getPackagingList({ warehouse: packWh });
      const list: PackOrder[] = (rows || []).map((r) => ({
        company: String(r.COMPANY || compCode),
        plant: String(r.PLANT || plantCode),
        warehouse: String(r.WAREHOUSE || packWh),
        stockPlace: String(r.STOCKPLACE || ""),
        worker: String(r.WORKER || ""),
        orderType: String(r.ORDERTYPE || "SO"),
        orderNum: String(r.ORDERNUM || ""),
        whsText: String(r.WHSTEXT || ""),
        itemCount: Number(r.ITEMCOUNT) || 0,
        customer: String(r.CUSNAME1 || "Müşteri"),
        delNum: String(r.DELNUM || ""),
        tblItem: r.TBLITEM,
      }));
      setOrders(list);
    } catch (e) {
      setOrders([]);
      setError(e instanceof Error ? e.message : "Paketlenecekler getirilemedi.");
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, [packWh, compCode, plantCode]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  // Sipariş kalemlerinden (tblItem) aranabilir metin — malzeme kodu/adı/barkodu burada geçer.
  const itemText = (o: PackOrder): string => {
    try { return o.tblItem ? JSON.stringify(o.tblItem).toLowerCase() : ""; } catch { return ""; }
  };

  const filtered = orders.filter((o) => {
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return (
      o.orderNum.toLowerCase().includes(s) ||
      o.customer.toLowerCase().includes(s) ||
      o.stockPlace.toLowerCase().includes(s) ||
      o.delNum.toLowerCase().includes(s) ||
      itemText(o).includes(s)
    );
  });

  const pg = usePagination(filtered, 9, "packaging", q);

  const kartSec = (o: PackOrder) => {
    // Seçilen emri iç ekrana taşı; MZYEnterPack orada çağrılır.
    navigate("/packaging/pack", { state: { order: o } });
  };

  return (
    <div className="mx-auto max-w-6xl p-4 lg:p-8">
      <PageHeader
        title="Paketleme"
        subtitle="Paketlenmeyi bekleyen sevkiyatlar"
        backTo="/home"
        right={
          <button
            type="button"
            onClick={fetchList}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-xl border border-line bg-surface px-3.5 py-2 text-xs font-bold text-fg transition hover:bg-elevated active:scale-95 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            <span>Yenile</span>
          </button>
        }
      />

      {/* Depo uyarısı */}
      {!packWh && (
        <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-700 dark:text-amber-400">
          Paketleme Deposu ayarlarda tanımlı değil. Ayarlar ekranından seçin.
        </div>
      )}

      {/* Arama */}
      <div className="mb-4 relative">
        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Sipariş no, müşteri, teslimat kodu veya malzeme (kod/ad/barkod) ile ara…"
          className="field-input w-full pl-10 text-sm"
        />
      </div>

      {error && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-red-500/20 bg-red-500/10 p-3.5 text-xs text-red-600 dark:text-red-400">
          <span>{error}</span>
          <button type="button" onClick={fetchList} className="font-bold underline shrink-0">Tekrar dene</button>
        </div>
      )}

      {loaded && !error && (
        <div className="mb-3 text-xs text-subtle">
          Paketlenecek <span className="font-bold text-fg">{orders.length}</span> sevkiyat
        </div>
      )}

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-36 animate-pulse rounded-2xl bg-elevated" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 rounded-2xl border border-dashed border-line bg-surface text-subtle text-center px-6">
          <Package className="mb-2 h-10 w-10 opacity-50" />
          <p className="text-sm">{loaded ? "Paketlenmeyi bekleyen sevkiyat yok." : "Yükleniyor…"}</p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {pg.pageItems.map((o) => (
              <button
                key={`${o.orderType}-${o.orderNum}-${o.stockPlace}`}
                type="button"
                onClick={() => kartSec(o)}
                className="group flex flex-col justify-between rounded-2xl border border-line bg-surface p-5 text-left shadow-card transition-all hover:border-brand-300 hover:shadow-soft active:scale-[0.99]"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <span className="rounded-md bg-brand-100 px-2 py-0.5 font-mono text-sm font-black text-brand-700 dark:bg-brand-500/20 dark:text-brand-300">
                      {o.orderType}-{o.orderNum}
                    </span>
                    <ChevronRight className="h-5 w-5 text-subtle transition group-hover:translate-x-0.5 group-hover:text-brand" />
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm font-bold text-fg">{o.customer}</p>

                  <div className="mt-3 space-y-1.5 text-xs text-subtle">
                    {o.stockPlace && (
                      <div className="flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 shrink-0 text-cyan-500" />
                        <span className="font-mono font-semibold text-fg">{o.stockPlace}</span>
                        <span className="text-subtle">· Depo {o.warehouse}</span>
                      </div>
                    )}
                    {o.worker && (
                      <div className="flex items-center gap-1.5">
                        <User className="h-3.5 w-3.5 shrink-0" />
                        <span>{o.worker}</span>
                      </div>
                    )}
                    {o.delNum && (
                      <div className="flex items-center gap-1.5">
                        <Box className="h-3.5 w-3.5 shrink-0" />
                        <span className="font-mono">{o.delNum}</span>
                      </div>
                    )}
                  </div>
                </div>

                {o.itemCount > 0 && (
                  <div className="mt-4 flex items-center justify-end border-t border-line/60 pt-3">
                    <span className="chip bg-elevated text-[11px] text-subtle">{o.itemCount} kalem</span>
                  </div>
                )}
              </button>
            ))}
          </div>

          <div className="mt-4">
            <Pagination
              page={pg.page}
              pageCount={pg.pageCount}
              onChange={pg.setPage}
              rangeStart={pg.rangeStart}
              rangeEnd={pg.rangeEnd}
              total={pg.total}
              label="Sevkiyat"
            />
          </div>
        </>
      )}
    </div>
  );
}
