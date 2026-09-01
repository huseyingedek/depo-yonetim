import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Search,
  ChevronRight,
  ClipboardList,
  Camera,
  Warehouse,
  Calendar,
  User,
  Package,
} from "lucide-react";
import PageHeader from "../../components/PageHeader";
import CameraScanOverlay from "../../components/CameraScanOverlay";
import Pagination, { usePagination } from "../../components/Pagination";
import { api } from "../../api/client";
import type { AdjustmentOrder } from "../../types";

export default function CountListPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [orders, setOrders] = useState<AdjustmentOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [kamera, setKamera] = useState(false);
  const [taramaHatasi, setTaramaHatasi] = useState<string | null>(null);

  const istendi = useRef(false);

  const fetchAdjustmentOrders = () => {
    setLoading(true);
    setError(null);
    api
      .getAdjustmentList()
      .then((data) => {
        setOrders(data);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    if (istendi.current) return;
    istendi.current = true;
    fetchAdjustmentOrders();
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return orders;
    return orders.filter(
      (o) =>
        o.id.toLowerCase().includes(s) ||
        (o.invDocNum && o.invDocNum.toLowerCase().includes(s)) ||
        (o.description && o.description.toLowerCase().includes(s)) ||
        (o.warehouse && o.warehouse.toLowerCase().includes(s)) ||
        (o.stockPlace && o.stockPlace.toLowerCase().includes(s)) ||
        (o.worker && o.worker.toLowerCase().includes(s))
    );
  }, [orders, q]);

  // 914x412 yatay ekranda 2 sütunlu düzende 6 kart ideal sayfa boyutudur
  const pg = usePagination(filtered, 6, "count", q);

  const emreGir = (o: AdjustmentOrder) => {
    const num = o.invDocNum || o.id;
    const docType = o.docType || "";
    const wh = o.warehouse || "";
    navigate(`/count/${encodeURIComponent(num)}?type=${encodeURIComponent(docType)}&invDocNum=${encodeURIComponent(o.invDocNum ?? num)}&docType=${encodeURIComponent(docType)}&warehouse=${encodeURIComponent(wh)}`);
  };

  const barkodOkundu = (code: string) => {
    const kod = code.trim().toLowerCase();
    if (!kod) return;
    const sadelestir = (s: string) => s.trim().toLowerCase().replace(/^0+/, "");
    const hedef = sadelestir(kod);

    const bulunan = orders.find(
      (o) =>
        sadelestir(o.id) === hedef ||
        (o.invDocNum && sadelestir(o.invDocNum) === hedef) ||
        (o.stockPlace && sadelestir(o.stockPlace) === hedef) ||
        (o.description && sadelestir(o.description).includes(hedef))
    );

    setKamera(false);
    if (bulunan) {
      setTaramaHatasi(null);
      emreGir(bulunan);
      return;
    }

    setTaramaHatasi(`${code} — bu barkodla eşleşen sayım belgesi bulunamadı`);
  };

  return (
    <div className="mx-auto max-w-6xl p-3 sm:p-5 lg:p-6">
      {/* Üst Başlık: "Sayımlar" */}
      <PageHeader
        title="Sayımlar"
        subtitle="Açık Sayım Belgeleri Listesi"
        backTo="/home"
        right={
          <div className="relative hidden sm:block">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-subtle" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("count.searchOrder")}
              className="field-input w-72 pl-11 pr-12 text-[15px]"
            />
            <button
              type="button"
              onClick={() => setKamera(true)}
              aria-label={t("count.scanOrder")}
              title={t("count.scanOrder")}
              className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-subtle transition hover:bg-elevated hover:text-fg"
            >
              <Camera className="h-5 w-5" />
            </button>
          </div>
        }
      />

      {/* Küçük / Dikey ekranlar için arama kutusu */}
      <div className="relative mb-3 sm:hidden">
        <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-subtle" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("count.searchOrder")}
          className="field-input pl-11 pr-12 text-[15px]"
        />
        <button
          type="button"
          onClick={() => setKamera(true)}
          aria-label={t("count.scanOrder")}
          className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-subtle transition hover:bg-elevated hover:text-fg"
        >
          <Camera className="h-5 w-5" />
        </button>
      </div>

      {/* Kamera Barkod Okuma */}
      {kamera && (
        <CameraScanOverlay
          onDetected={barkodOkundu}
          onClose={() => setKamera(false)}
          prompt={t("count.scanOrder")}
        />
      )}

      {/* Barkod Okuma Uyarısı */}
      {taramaHatasi && (
        <div className="mb-3 flex items-center justify-between gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-[15px] font-medium text-amber-700">
          <span>{taramaHatasi}</span>
          <button
            type="button"
            onClick={() => setTaramaHatasi(null)}
            className="shrink-0 font-semibold underline"
          >
            {t("common.close")}
          </button>
        </div>
      )}

      {/* Hata Bildirimi */}
      {error && (
        <div className="mb-3 flex items-center justify-between gap-3 whitespace-pre-line rounded-2xl border border-rose-500/30 bg-rose-500/10 p-3.5 text-[15px] font-medium text-rose-600">
          <span>{error}</span>
          <button
            type="button"
            onClick={fetchAdjustmentOrders}
            className="shrink-0 font-bold underline"
          >
            Tekrar Dene
          </button>
        </div>
      )}

      {/* Yükleniyor Durumu */}
      {loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-2xl bg-elevated" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        /* Boş Durum */
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-surface/50 py-12 text-center text-subtle">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
            <ClipboardList className="h-8 w-8" />
          </div>
          <p className="text-[17px] font-bold text-fg">
            {q ? "Arama kriterine uygun sayım belgesi bulunamadı" : "Açık Sayım Belgesi Yok"}
          </p>
          <p className="mt-1 text-[15px] text-muted">
            {q
              ? "Farklı bir belge numarası veya arama terimi deneyin."
              : "Sisteme kayıtlı açık sayım emri bulunmamaktadır."}
          </p>
          {q && (
            <button
              type="button"
              onClick={() => setQ("")}
              className="btn-secondary btn-sm mt-3 text-[15px]"
            >
              Aramayı Temizle
            </button>
          )}
        </div>
      ) : (
        /* Sayım Belgeleri Listesi (914x412 Yatay Optimize Grid - Çizgisiz Kartlar) */
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3">
            {pg.pageItems.map((o) => {
              const isClosed = o.status === "2" || o.status === "closed";
              const isPartial = o.status === "1" || o.status === "partial";

              const durumEtiket = isClosed
                ? "Tamamlandı"
                : isPartial
                ? "Devam Ediyor"
                : "Aktif Sayım";

              const durumStil = isClosed
                ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                : isPartial
                ? "bg-amber-100 text-amber-800 border-amber-300"
                : "bg-brand-100 text-brand-800 border-brand-300";

              // Depo ve Stok Yeri / Raf gösterimi: örn. "01 / A-01-02" veya "d1/q1"
              const depoRafMetni = [o.warehouse, o.stockPlace].filter(Boolean).join(" / ");

              return (
                <button
                  key={o.id}
                  onClick={() => emreGir(o)}
                  type="button"
                  className="group flex flex-col justify-between gap-1.5 rounded-2xl border border-line bg-surface p-3 text-left shadow-card transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-soft active:scale-[0.99]"
                >
                  {/* Üst Satır: Belge No / INVDOCNUM ve Durum Rozeti ("Aktif Sayım") */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {o.docType && (
                        <span className="rounded-lg bg-slate-100 px-2 py-0.5 font-mono text-[15px] font-bold text-slate-700">
                          {o.docType}
                        </span>
                      )}
                      <span className="font-mono text-[17px] font-extrabold text-fg tracking-tight">
                        {o.invDocNum || o.id}
                      </span>
                      {o.invDocNum && o.id && o.invDocNum !== o.id && (
                        <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[15px] font-bold text-slate-600">
                          {o.id}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className={`chip border px-2.5 py-0.5 text-[15px] font-bold ${durumStil}`}>
                        {durumEtiket}
                      </span>
                      <ChevronRight className="h-5 w-5 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-brand-600" />
                    </div>
                  </div>

                  {/* Açıklama / Başlık */}
                  {o.description && (
                    <p className="line-clamp-1 text-[15px] font-semibold text-slate-800">
                      {o.description}
                    </p>
                  )}

                  {/* Depo Bilgisi ve Tarih (AYNI HİZADA) */}
                  <div className="flex items-center justify-between gap-2 text-[15px]">
                    {depoRafMetni ? (
                      <div className="flex items-center gap-1.5 font-bold text-slate-800">
                        <Warehouse className="h-4.5 w-4.5 text-brand-600 shrink-0" />
                        <span>{depoRafMetni}</span>
                      </div>
                    ) : (
                      <div />
                    )}

                    {o.docDate && (
                      <span className="inline-flex items-center gap-1 font-mono text-[15px] text-slate-500">
                        <Calendar className="h-4 w-4 text-slate-400 shrink-0" />
                        <span>{o.docDate}</span>
                      </span>
                    )}
                  </div>

                  {/* Alt Satır: Kalem Sayısı / Personel */}
                  {(o.itemCount !== undefined || o.worker) && (
                    <div className="flex flex-wrap items-center gap-3 text-[15px] text-slate-600">
                      {o.itemCount !== undefined && (
                        <span className="inline-flex items-center gap-1 font-semibold text-brand-700">
                          <Package className="h-4 w-4 text-brand-600 shrink-0" />
                          <span>{o.itemCount} Kalem</span>
                        </span>
                      )}
                      {o.worker && (
                        <span className="inline-flex items-center gap-1 font-medium text-slate-700">
                          <User className="h-4 w-4 text-slate-400 shrink-0" />
                          <span>{o.worker}</span>
                        </span>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Sayfalama */}
          <Pagination
            page={pg.page}
            pageCount={pg.pageCount}
            onChange={pg.setPage}
            rangeStart={pg.rangeStart}
            rangeEnd={pg.rangeEnd}
            total={pg.total}
            label="belge"
          />
        </>
      )}
    </div>
  );
}
