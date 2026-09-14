import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { ArrowLeft, Trash2, Package } from "lucide-react";
import PageHeader from "../../components/PageHeader";
import { api } from "../../api/client";
import type { AdjustmentOrder, AdjustmentLine } from "../../types";

export default function CountRecordsPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const location = useLocation();

  const state = location.state as
    | {
        order?: AdjustmentOrder;
        lines?: AdjustmentLine[];
        warehouse?: string;
        orderType?: string;
        invDocNum?: string;
      }
    | undefined;

  const [order, setOrder] = useState<AdjustmentOrder | null>(state?.order ?? null);
  const [lines, setLines] = useState<AdjustmentLine[]>(state?.lines ?? []);
  const [, setLoading] = useState(false);

  const docNum = order?.invDocNum || order?.id || id || state?.invDocNum || "";
  const docType = order?.docType || state?.orderType || "";
  const warehouse =
    order?.warehouse ||
    state?.warehouse ||
    (lines.length > 0 && lines[0].warehouse ? lines[0].warehouse : "");

  // Sayfa doğrudan linkle / yenilemeyle açılmışsa ve lines state'te yoksa API'den çek
  useEffect(() => {
    if (lines.length > 0 || !id) return;
    setLoading(true);
    api
      .getAdjustmentOrder({
        orderNum: id,
        orderType: state?.orderType,
        invDocNum: state?.invDocNum || id,
        invDocType: state?.orderType,
        warehouse: state?.warehouse,
      })
      .then((res) => {
        if (res) {
          setOrder(res);
          if (res.lines && res.lines.length > 0) setLines(res.lines);
        }
      })
      .catch(() => {})
      .finally(() => {
        setLoading(false);
      });
  }, [id, lines.length, state]);

  // Satır kategori belirteci ve renkleri
  const getCategory = (line: AdjustmentLine) => {
    const { targetQty, countedQty } = line;

    // 1. MAVİ: Planda olmayan / beklenmeyen yeni kalemler
    if (targetQty <= 0 && countedQty > 0) {
      return {
        tier: 1,
        label: "Yeni / Planda Yok",
        badgeClass: "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border-blue-300",
        textClass: "text-blue-600 dark:text-blue-400",
      };
    }

    // 2. KIRMIZI: Fazla sayılan kalemler
    if (targetQty > 0 && countedQty > targetQty) {
      return {
        tier: 2,
        label: "Fazla Sayım",
        badgeClass: "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border-rose-300",
        textClass: "text-rose-600 dark:text-rose-400",
      };
    }

    // 3. SARI: Eksik sayılan kalemler
    if (targetQty > 0 && countedQty > 0 && countedQty < targetQty) {
      return {
        tier: 3,
        label: "Eksik Sayım",
        badgeClass: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-300",
        textClass: "text-amber-500 dark:text-amber-400",
      };
    }

    // 4. OKUTULMAYANLAR: Henüz hiç sayım yapılmamış olanlar
    if (countedQty === 0) {
      return {
        tier: 4,
        label: "Sayılmadı",
        badgeClass: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-300",
        textClass: "text-slate-500 dark:text-slate-400",
      };
    }

    // 5. YEŞİL: Tam eşleşen kalemler
    return {
      tier: 5,
      label: "Tam Eşleşti",
      badgeClass: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300",
      textClass: "text-emerald-600 dark:text-emerald-400",
    };
  };

  // KESİN SIRALAMA: 1. Maviler -> 2. Kırmızılar -> 3. Sarılar -> 4. Okutulmayanlar -> 5. Yeşiller
  const sortedLines = useMemo(() => {
    return [...lines].sort((a, b) => {
      const tierA = getCategory(a).tier;
      const tierB = getCategory(b).tier;
      if (tierA !== tierB) return tierA - tierB;
      return a.material.localeCompare(b.material);
    });
  }, [lines]);

  // Sayıma geri dönme (hiçbir veri silinmeden state taşınır)
  const handleBackToCount = () => {
    navigate(`/count/${id}`, {
      state: {
        order,
        lines,
        warehouse,
        orderType: docType,
        invDocNum: docNum,
      },
    });
  };

  // Çöp kovasına tıklandığında ilgili satırı sıfırlama / silme
  const handleDeleteLine = (lineId: string) => {
    setLines((prev) => {
      const target = prev.find((l) => l.id === lineId);
      if (!target) return prev;

      // Sonradan dinamik eklenmiş ve hedefi olmayan satırsa listeden tamamen çıkar
      if (lineId.startsWith("new-") && target.targetQty <= 0) {
        return prev.filter((l) => l.id !== lineId);
      }

      // Belgedeki orijinal satır ise sayılan miktarını 0 yap
      return prev.map((l) => (l.id === lineId ? { ...l, countedQty: 0 } : l));
    });
  };

  // Miktar metnini kurallara göre biçimlendirme
  const renderQuantityText = (line: AdjustmentLine) => {
    const mult = line.multiplier && line.multiplier > 0 ? line.multiplier : 1;
    const unit = (line.unit || "AD").toUpperCase();
    const skunit = (line.skunit || unit).toUpperCase();
    const counted = line.countedQty;

    const isDiffUnit = mult > 1 || unit !== skunit;
    if (isDiffUnit && counted > 0) {
      const countedInUnit = mult > 1 ? Math.round((counted / mult) * 100) / 100 : counted;
      return (
        <span>
          <strong className="font-bold">{counted} {skunit}</strong>{" "}
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            ({counted} {skunit} = {countedInUnit} {unit})
          </span>
        </span>
      );
    }

    return (
      <strong className="font-bold">
        {counted} {skunit}
      </strong>
    );
  };

  const totalCountedCount = lines.filter((l) => l.countedQty > 0).length;

  return (
    <div className="mx-auto max-w-6xl p-4 lg:p-8 animate-fade-in">
      {/* ÜST BAŞLIK: Sol üstte chevron YOK, Sağ üstte "Sayıma geri dön" butonu var */}
      <PageHeader
        title="Sayılanlar"
        subtitle={`${docNum || id} · ${totalCountedCount} / ${lines.length} Kalem Sayıldı`}
        right={
          <button
            type="button"
            onClick={handleBackToCount}
            className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface px-3.5 py-2 text-xs sm:text-sm font-bold text-fg transition hover:bg-elevated active:scale-95 shadow-xs"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Sayıma geri dön</span>
          </button>
        }
      />

      {!lines.length ? (
        <div className="rounded-2xl border border-line bg-surface p-10 text-center text-sm text-subtle">
          <Package className="mx-auto h-10 w-10 text-subtle opacity-40" />
          <p className="mt-2 font-bold">Sayım kalemi bulunamadı.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface shadow-card">
          <table className="w-full min-w-[950px] text-left text-xs">
            <thead className="border-b border-line bg-elevated">
              <tr>
                <th className="px-3 py-2.5 font-bold text-muted">Durum</th>
                <th className="px-3 py-2.5 font-bold text-muted">Malzeme / Ürün</th>
                <th className="whitespace-nowrap px-3 py-2.5 font-bold text-muted">Depo</th>
                <th className="whitespace-nowrap px-3 py-2.5 font-bold text-muted">Stok Yeri</th>
                <th className="whitespace-nowrap px-3 py-2.5 font-bold text-muted">Parti</th>
                <th className="whitespace-nowrap px-3 py-2.5 font-bold text-muted">Stok Birimi</th>
                <th className="whitespace-nowrap px-3 py-2.5 font-bold text-muted">Okutulan Birim</th>
                <th className="whitespace-nowrap px-3 py-2.5 font-bold text-muted">Sayım Miktarı</th>
                <th className="px-3 py-2.5 text-center font-bold text-muted">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {sortedLines.map((line) => {
                const cat = getCategory(line);
                const wh = (line.warehouse || warehouse || "").trim();
                let sp = (line.stockPlace || "").trim().replace(/\$/g, "");
                if (sp.includes("$")) {
                  sp = sp.split("$").slice(1).join("$").trim();
                }
                if (wh && sp.toUpperCase().startsWith(wh.toUpperCase()) && sp.length > wh.length) {
                  sp = sp.slice(wh.length).trim();
                }

                return (
                  <tr
                    key={line.id}
                    className="border-b border-line last:border-0 hover:bg-elevated/40 transition"
                  >
                    {/* Durum Rozeti (Mavi, Kırmızı, Sarı, Gri, Yeşil) */}
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-bold ${cat.badgeClass}`}>
                        {cat.label}
                      </span>
                    </td>

                    {/* Malzeme / Ürün */}
                    <td className="max-w-[240px] px-3 py-2.5">
                      <p className="truncate font-bold text-fg">{line.name}</p>
                      <p className="font-mono text-[11px] font-semibold text-slate-500">{line.material}</p>
                    </td>

                    {/* Depo */}
                    <td className="whitespace-nowrap px-3 py-2.5 font-mono font-semibold text-fg">
                      {wh || "—"}
                    </td>

                    {/* Stok Yeri */}
                    <td className="whitespace-nowrap px-3 py-2.5 font-mono font-semibold text-fg">
                      {sp || "—"}
                    </td>

                    {/* Parti */}
                    <td className="whitespace-nowrap px-3 py-2.5 font-mono text-fg">
                      {line.batchNum && line.batchNum !== "*" ? (
                        <span className="inline-flex rounded bg-violet-100 dark:bg-violet-950/60 px-1.5 py-0.5 text-[11px] font-bold text-violet-700 dark:text-violet-300">
                          {line.batchNum}
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>

                    {/* Stok Birimi */}
                    <td className="whitespace-nowrap px-3 py-2.5 font-mono font-bold text-fg uppercase">
                      {line.skunit || line.unit || "AD"}
                    </td>

                    {/* Okutulan Birim */}
                    <td className="whitespace-nowrap px-3 py-2.5 font-mono font-bold text-slate-600 dark:text-slate-300 uppercase">
                      {line.unit || line.skunit || "AD"}
                    </td>

                    {/* Sayım Miktarı */}
                    <td className={`whitespace-nowrap px-3 py-2.5 font-mono ${cat.textClass}`}>
                      {renderQuantityText(line)}
                    </td>

                    {/* En Sağ Kolon: Çöp Kovası */}
                    <td className="whitespace-nowrap px-3 py-2.5 text-center">
                      <button
                        type="button"
                        onClick={() => handleDeleteLine(line.id)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-transparent text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:border-rose-200 dark:hover:border-rose-800/50 transition active:scale-90"
                        title="Sayımı Sıfırla (0)"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
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
