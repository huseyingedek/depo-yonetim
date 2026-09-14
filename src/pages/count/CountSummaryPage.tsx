import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { ArrowLeft, Loader2, Package } from "lucide-react";
import PageHeader from "../../components/PageHeader";
import ToastView, { useToast } from "../../components/Toast";
import { api } from "../../api/client";
import { sesBasarili, sesHata } from "../../sound";
import type { AdjustmentOrder, AdjustmentLine } from "../../types";

export default function CountSummaryPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams<{ id: string }>();
  const { toast, show } = useToast();

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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    setError(null);
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
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        setLoading(false);
      });
  }, [id, lines.length, state?.invDocNum, state?.orderType, state?.warehouse]);

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
  const handleBack = () => {
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

  // Sağ üstteki "Bitir" butonuna basılınca çalışacak handler (MZYSaveAdjustment servisi çağrılır)
  const handleFinish = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await api.saveAdjustment({
        company: order?.company,
        plant: order?.plant,
        warehouse: warehouse || order?.warehouse,
        invDocType: docType || order?.docType,
        invDocNum: docNum,
        lines,
      });

      if (!res.ok) {
        sesHata();
        show({
          kind: "error",
          text: res.message || "Sayım kaydedilemedi.",
        });
        setError(res.message);
        return;
      }

      sesBasarili();
      show({
        kind: "ok",
        text: res.message || "Sayım başarıyla CANIAS sistemine kaydedildi.",
      });

      if (id) {
        try {
          sessionStorage.removeItem(`count_session_${id}`);
        } catch {}
      }

      // Sayım başarıyla tamamlandıktan sonra sayım listesine yönlendir
      setTimeout(() => {
        navigate("/count");
      }, 1200);
    } catch (e) {
      sesHata();
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      show({
        kind: "error",
        text: msg,
      });
    } finally {
      setSaving(false);
    }
  };

  // Miktar metnini kurallara göre biçimlendirme
  const renderQuantityText = (line: AdjustmentLine) => {
    const docMult = line.multiplier && line.multiplier > 0 ? line.multiplier : 1;
    const docUnit = (line.docUnit || line.unit || "AD").toUpperCase();
    const skunit = (line.skunit || docUnit).toUpperCase();
    const bunit = (line.bunit || docUnit).toUpperCase();
    const bmult = line.bunitMultiplier && line.bunitMultiplier > 0 ? line.bunitMultiplier : 1;
    const counted = line.countedQty;

    // Eğer okutulan barkod birimi (bunit) stok biriminden farklıysa: 10 AD (10 AD = 2 PK)
    if (line.bunit && bunit !== skunit && counted > 0) {
      const bunitQty = counted / bmult;
      return (
        <span>
          <strong className="font-bold">{counted} {skunit}</strong>{" "}
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            ({counted} {skunit} = {bunitQty} {bunit})
          </span>
        </span>
      );
    }

    const isDiffUnit = docMult > 1 || docUnit !== skunit;
    if (isDiffUnit && counted > 0) {
      const countedInDocUnit = docMult > 1 ? counted / docMult : counted;
      return (
        <span>
          <strong className="font-bold">{counted} {skunit}</strong>{" "}
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            ({counted} {skunit} = {countedInDocUnit} {docUnit})
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
      {/* ÜST BAŞLIK: Sol üstte chevron YOK, Sağ üstte "Sayıma geri dön" ve sağında "Bitir" butonu var */}
      <PageHeader
        title="Sayım Özeti"
        subtitle={`${docNum || id} · ${totalCountedCount} / ${lines.length} Kalem Sayıldı`}
        right={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleBack}
              className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface px-3.5 py-2 text-xs sm:text-sm font-bold text-fg transition hover:bg-elevated active:scale-95 shadow-xs"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Sayıma geri dön</span>
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={handleFinish}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-4 py-2 text-xs sm:text-sm font-bold shadow-sm transition active:scale-95 shrink-0"
              title="Sayımı Kaydet ve Bitir"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              <span>{saving ? "Kaydediliyor..." : "Bitir"}</span>
            </button>
          </div>
        }
      />

      {/* Hata Mesajı Varsa */}
      {error && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm font-medium text-rose-600">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="font-bold underline shrink-0"
          >
            Yenile
          </button>
        </div>
      )}

      {!lines.length ? (
        <div className="rounded-2xl border border-line bg-surface p-10 text-center text-sm text-subtle">
          <Package className="mx-auto h-10 w-10 text-subtle opacity-40" />
          <p className="mt-2 font-bold">Sayım kalemi bulunamadı.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface shadow-card">
          <table className="w-full min-w-[850px] text-left text-xs">
            <thead className="border-b border-line bg-elevated">
              <tr>
                <th className="px-3 py-2.5 font-bold text-muted">Malzeme / Ürün</th>
                <th className="whitespace-nowrap px-3 py-2.5 font-bold text-muted">Depo</th>
                <th className="whitespace-nowrap px-3 py-2.5 font-bold text-muted">Stok Yeri</th>
                <th className="whitespace-nowrap px-3 py-2.5 font-bold text-muted">Parti</th>
                <th className="whitespace-nowrap px-3 py-2.5 font-bold text-muted">Stok Birimi</th>
                <th className="whitespace-nowrap px-3 py-2.5 font-bold text-muted">Okutulan Birim</th>
                <th className="whitespace-nowrap px-3 py-2.5 font-bold text-muted">Sayım Miktarı</th>
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
                      {line.countedQty > 0 ? (
                        line.bunit || line.unit || line.skunit || "AD"
                      ) : (
                        <span className="text-muted">-</span>
                      )}
                    </td>

                    {/* Sayım Miktarı */}
                    <td className={`whitespace-nowrap px-3 py-2.5 font-mono ${cat.textClass}`}>
                      {renderQuantityText(line)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ToastView toast={toast} />
    </div>
  );
}
