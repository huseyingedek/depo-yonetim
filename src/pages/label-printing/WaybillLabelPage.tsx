import { useState } from "react";
import { FileText, Search, Printer, RefreshCw, MapPin, Check, Loader2, Settings as SettingsIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api/client";
import { useAppStore } from "../../store/appStore";
import PageHeader from "../../components/PageHeader";
import Pagination, { usePagination } from "../../components/Pagination";

type ContainerRow = { company: string; plant: string; warehouse: string; stockPlace: string; name: string };

// İrsaliye Etiketi — Paketleme ekranının birebir aynısı; TEK farkı depo.
// Depo SABİT DEĞİL: kullanıcı ayarlarındaki "Sevkiyat Deposu" (warehouseDelivery) kullanılır.
// Bora: MZYGetContainer (PSCOMPANY, PSPLANT, PSWAREHOUSE) — company/plant ctx()'ten (ayarlar) gelir.
// Ekran açılır açılmaz servis çağrılmaz; kullanıcı "Listele"/Enter ile getirir.

export default function WaybillLabelPage() {
  const navigate = useNavigate();
  const warehouse = useAppStore((s) => s.settings.warehouseDelivery);

  const [rows, setRows] = useState<ContainerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [q, setQ] = useState("");

  const [selectedRows, setSelectedRows] = useState<ContainerRow[]>([]);
  const [repeatCount, setRepeatCount] = useState<number | string>(1);
  const [printing, setPrinting] = useState(false);

  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const fetchContainers = async () => {
    if (!warehouse) {
      setSearched(true);
      setRows([]);
      setErrorMsg("Ayarlarda Sevkiyat Deposu tanımlı değil. Lütfen Ayarlar ekranından seçin.");
      return;
    }
    setLoading(true);
    setSearched(true);
    setSelectedRows([]);
    setErrorMsg("");
    setSuccessMsg("");
    try {
      const list = await api.getContainer(warehouse);
      setRows(list || []);
    } catch (e) {
      setRows([]);
      setErrorMsg(e instanceof Error ? e.message : "Konteynerler getirilemedi.");
    } finally {
      setLoading(false);
    }
  };

  const filtered = rows.filter((r) => {
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return (r.stockPlace || "").toLowerCase().includes(s) || (r.name || "").toLowerCase().includes(s);
  });

  const pg = usePagination(filtered, 9);

  const rowKey = (r: ContainerRow) => `${r.warehouse}|${r.stockPlace}`;
  const isSelected = (r: ContainerRow) => selectedRows.some((p) => rowKey(p) === rowKey(r));
  const toggleSelect = (r: ContainerRow) => {
    setSelectedRows((prev) =>
      prev.some((p) => rowKey(p) === rowKey(r)) ? prev.filter((p) => rowKey(p) !== rowKey(r)) : [...prev, r]
    );
  };

  const handlePrintSelected = async () => {
    if (selectedRows.length === 0) return;
    setErrorMsg("");
    setSuccessMsg("");

    const count = Number(repeatCount);
    if (!Number.isInteger(count) || count < 1 || count > 99) {
      setErrorMsg("Kopya sayısı en az 1 olmalıdır (1-99 arası).");
      return;
    }

    setPrinting(true);
    let successCount = 0;
    let failedCount = 0;
    let lastError = "";

    for (const r of selectedRows) {
      try {
        const res = await api.printContainer({
          company: r.company,
          plant: r.plant,
          warehouse: r.warehouse || warehouse,
          container: r.stockPlace,
          repeat: count,
        });
        if (res.ok) successCount++;
        else {
          failedCount++;
          if (res.message) lastError = res.message;
        }
      } catch (err: unknown) {
        failedCount++;
        if (err instanceof Error) lastError = err.message;
      }
    }

    setPrinting(false);
    setRepeatCount(1);
    if (failedCount === 0) {
      setSuccessMsg(`Seçilen ${successCount} adet irsaliye etiketinden ${count}'er kopya yazdırıldı.`);
      setSelectedRows([]);
    } else {
      setErrorMsg(
        `${successCount} irsaliye etiketi yazdırıldı, ${failedCount} adet etikette hata oluştu.${
          lastError ? ` (Detay: ${lastError})` : ""
        }`
      );
    }
  };

  const kopyaInput = (widthCls: string) => (
    <input
      type="number"
      min={0}
      max={99}
      value={repeatCount}
      onChange={(e) => {
        const val = e.target.value;
        if (val === "") {
          setRepeatCount("");
          return;
        }
        const v = parseInt(val, 10);
        if (!isNaN(v)) setRepeatCount(Math.min(99, Math.max(0, v)));
      }}
      onBlur={() => {
        if (repeatCount === "") setRepeatCount(0);
      }}
      className={`field-input ${widthCls} py-1.5 px-2 text-center text-xs font-bold`}
    />
  );

  return (
    <div className="mx-auto max-w-6xl p-4 lg:p-8">
      <PageHeader
        title="İrsaliye Etiketi Yazdırma"
        subtitle={warehouse ? `Sevkiyat deposu (${warehouse}) konteynerleri — Listele, seç ve yazdır` : "Sevkiyat deposu ayarlardan alınır"}
        backTo="/label-printing"
        right={
          <div className="hidden sm:flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-fg whitespace-nowrap">Kopya:</span>
              {kopyaInput("w-16")}
            </div>
            <button
              type="button"
              onClick={handlePrintSelected}
              disabled={selectedRows.length === 0 || printing}
              className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
            >
              {printing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Yazdırılıyor...</span>
                </>
              ) : (
                <>
                  <Printer className="h-4 w-4" />
                  <span>Yazdır ({selectedRows.length})</span>
                </>
              )}
            </button>
          </div>
        }
      />

      {/* Depo ayarda tanımlı değilse uyarı + ayarlara git */}
      {!warehouse && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-700 dark:text-amber-400">
          <span>Sevkiyat Deposu ayarlarda tanımlı değil. Bu ekranın çalışması için önce depoyu seçin.</span>
          <button
            type="button"
            onClick={() => navigate("/settings")}
            className="flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 font-bold text-white hover:bg-amber-700"
          >
            <SettingsIcon className="h-3.5 w-3.5" /> Ayarlar
          </button>
        </div>
      )}

      {/* Arama/Listele — açılışta servis çağrılmaz; Enter ya da Listele ile getirilir.
          Liste geldikten sonra kutu, stok yeri / açıklamaya göre yerelde süzer. */}
      <div className="mb-4 flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                fetchContainers();
              }
            }}
            placeholder="Listele'ye basın; sonra stok yeri / açıklamaya göre süzebilirsiniz…"
            className="field-input w-full pl-10 text-sm"
          />
        </div>
        <button
          type="button"
          onClick={fetchContainers}
          disabled={loading}
          className="btn-primary flex items-center justify-center gap-2 px-6 shadow-sm shrink-0 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          <span>Listele</span>
        </button>
      </div>

      {/* Mobil: Kopya + Yazdır */}
      <div className="mb-5 flex items-center justify-between gap-3 sm:hidden">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-fg">Kopya:</span>
          {kopyaInput("w-20")}
        </div>
        <button
          type="button"
          onClick={handlePrintSelected}
          disabled={selectedRows.length === 0 || printing}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
        >
          {printing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
          <span>Yazdır ({selectedRows.length})</span>
        </button>
      </div>

      {/* Uyarılar */}
      {errorMsg && (
        <div className="mb-4 flex items-center gap-2.5 rounded-xl border border-red-500/20 bg-red-500/10 p-3.5 text-xs text-red-600 dark:text-red-400">
          <span>{errorMsg}</span>
        </div>
      )}
      {successMsg && (
        <div className="mb-4 flex items-center gap-2.5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3.5 text-xs text-emerald-600 dark:text-emerald-400">
          <span>{successMsg}</span>
        </div>
      )}

      {/* Liste başlığı */}
      {searched && (
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-bold text-fg">
            İrsaliye Konteynerleri ({rows.length})
            {selectedRows.length > 0 && (
              <span className="ml-2 text-xs font-semibold text-brand">({selectedRows.length} Seçili)</span>
            )}
          </h2>
          <button
            type="button"
            onClick={fetchContainers}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs font-semibold text-brand hover:underline"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Yenile
          </button>
        </div>
      )}

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-2xl bg-elevated" />
          ))}
        </div>
      ) : !searched ? (
        <div className="flex flex-col items-center justify-center py-16 rounded-2xl border border-dashed border-line bg-surface text-subtle text-center px-6">
          <FileText className="mb-2 h-10 w-10 opacity-50" />
          <p className="text-sm">Konteynerleri getirmek için "Listele"ye (veya Enter) basın.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 rounded-2xl border border-line bg-surface text-subtle">
          <FileText className="mb-2 h-10 w-10" />
          <p className="text-sm">Sevkiyat deposu ({warehouse || "—"}) için konteyner bulunamadı.</p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {pg.pageItems.map((r, idx) => {
              const selected = isSelected(r);
              return (
                <div
                  key={`${rowKey(r)}|${idx}`}
                  onClick={() => toggleSelect(r)}
                  className={`relative flex cursor-pointer flex-col justify-between rounded-2xl border p-5 text-left shadow-card transition-all hover:shadow-soft ${
                    selected
                      ? "border-emerald-500 bg-emerald-500/10 ring-2 ring-emerald-500/30"
                      : "border-line bg-surface hover:border-emerald-300"
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between">
                      <span className="font-mono text-base font-extrabold text-fg">{r.stockPlace || "—"}</span>
                      {r.warehouse && (
                        <span className="inline-flex items-center gap-1 font-mono text-xs font-semibold text-cyan-600 dark:text-cyan-400">
                          <MapPin className="h-3.5 w-3.5" /> Depo {r.warehouse}
                        </span>
                      )}
                    </div>
                    <p className="mt-2 line-clamp-2 text-xs text-subtle">{r.name || "—"}</p>
                  </div>

                  <div className="mt-4 flex items-center justify-end border-t border-line/60 pt-3">
                    <span
                      className={`chip text-[11px] ${
                        selected ? "bg-emerald-600 text-white" : "bg-elevated text-subtle"
                      }`}
                    >
                      {selected ? <Check className="h-3.5 w-3.5 inline mr-1" /> : null}
                      {selected ? "Seçildi" : "Seç"}
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
    </div>
  );
}
