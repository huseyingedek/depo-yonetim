import { useState, useEffect } from "react";
import { Loader2, Barcode as BarcodeIcon, Plus, Check } from "lucide-react";
import { api } from "../api/client";
import { formatBarcodeUnitInfo } from "../pages/label-printing/ProductBarcodePage";

export interface MaterialUnitRow {
  code: string;        // birim kodu (AD, KO, PK, KG ...)
  label: string;       // "Koli (KO)" gibi
  factor: number;      // çevrim faktörü (PERUNIT) — 1 birim = kaç temel birim
  barcodes: string[];  // bu birime tanımlı mevcut barkodlar (olmayabilir)
}

/**
 * Malzemenin TÜM tanımlı birimlerini tek kartta gösterir. Hiçbir koşul/kısıt
 * yok: her tanımlı birim seçilebilir ve barkod oluşturulabilir. Barkodu
 * olmayan birim normaldir (uyarı değil). Yeniden kullanılabilir.
 */
export default function MaterialUnitsCard({
  material,
  selectedUnit,
  onSelectUnit,
  className = "",
}: {
  material: string;
  selectedUnit?: string;
  onSelectUnit?: (unit: string) => void;
  className?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<MaterialUnitRow[]>([]);
  const [hata, setHata] = useState<string | null>(null);

  useEffect(() => {
    const kod = (material || "").trim();
    if (!kod) {
      setRows([]);
      return;
    }
    let iptal = false;
    setLoading(true);
    setHata(null);

    api
      .getMaterialDetail(kod)
      .then((detay) => {
        if (iptal) return;
        const unitList = Array.isArray(detay.unitList) ? detay.unitList : [];
        const barcodeList = Array.isArray(detay.barcodeList) ? detay.barcodeList : [];

        const map = new Map<string, MaterialUnitRow>();
        const ekle = (rawCode: string, factor: number) => {
          const code = (formatBarcodeUnitInfo(rawCode).short || rawCode).trim().toUpperCase();
          if (!code) return;
          if (!map.has(code)) {
            map.set(code, {
              code,
              label: formatBarcodeUnitInfo(code).label,
              factor: factor > 0 ? factor : 0,
              barcodes: [],
            });
          } else if (factor > 0 && !map.get(code)!.factor) {
            map.get(code)!.factor = factor;
          }
        };

        // 1) Tanımlı birimler (TBLUNITLIST → QUNIT, PERUNIT/FCT)
        for (const u of unitList) {
          const code = String(u.QUNIT || u.UNIT || u.BUNIT || u.IUNIT || u.TUNIT || "").trim();
          const factor = Number(u.PERUNIT ?? u.FCT ?? u.VALUE ?? 0) || 0;
          if (code) ekle(code, factor);
        }

        // 2) Mevcut barkodları birimlerine dağıt (TBLBARCODELIST → BARCODE, BUNIT)
        for (const b of barcodeList) {
          const rawCode = String(b.BUNIT || b.UNIT || b.BARCODEUNIT || b.B_UNIT || b.QUNIT || b.SKUNIT || b.unit || "").trim();
          const bc = String(b.BARCODE || b.barcode || b.BARCODENUM || b.EAN || b.CODE || "").trim();
          if (!rawCode) continue;
          ekle(rawCode, 0);
          const code = (formatBarcodeUnitInfo(rawCode).short || rawCode).trim().toUpperCase();
          if (bc && map.has(code) && !map.get(code)!.barcodes.includes(bc)) {
            map.get(code)!.barcodes.push(bc);
          }
        }

        // Sıralama: barkodu olan birimler önce, sonra kod alfabetik (kozmetik).
        const list = Array.from(map.values()).sort((a, b) => {
          const ab = a.barcodes.length > 0, bb = b.barcodes.length > 0;
          if (ab !== bb) return ab ? -1 : 1;
          return a.code.localeCompare(b.code, "tr");
        });
        setRows(list);
      })
      .catch((e) => {
        if (!iptal) setHata(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!iptal) setLoading(false);
      });

    return () => {
      iptal = true;
    };
  }, [material]);

  return (
    <div className={`card p-3 sm:p-3.5 ${className}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-sm font-extrabold text-fg">
          <BarcodeIcon className="h-4 w-4 text-brand-600" />
          Birimler
        </span>
        {rows.length > 0 && (
          <span className="text-[11px] font-semibold text-subtle">{rows.length} birim</span>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-3 text-xs text-subtle">
          <Loader2 className="h-4 w-4 animate-spin" /> birimler alınıyor…
        </div>
      ) : hata ? (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{hata}</p>
      ) : rows.length === 0 ? (
        <p className="py-3 text-xs text-subtle">Bu malzemede tanımlı birim bulunamadı.</p>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {rows.map((r) => {
            const secili = selectedUnit != null && selectedUnit.toUpperCase() === r.code;
            const tiklanabilir = Boolean(onSelectUnit);
            return (
              <button
                key={r.code}
                type="button"
                disabled={!tiklanabilir}
                onClick={() => tiklanabilir && onSelectUnit?.(r.code)}
                title="Bu birim için barkod oluştur"
                className={`flex flex-col gap-1 rounded-xl border p-2.5 text-left transition ${
                  secili
                    ? "border-brand-400 bg-brand-50 ring-1 ring-brand-300"
                    : "border-line bg-surface hover:border-brand-300 hover:bg-elevated/40 active:scale-[0.99] cursor-pointer"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 min-w-0">
                    <span className="inline-flex items-center rounded-md bg-brand-600 px-1.5 py-0.5 text-[11px] font-black text-white">
                      {r.code}
                    </span>
                    <span className="truncate text-[11.5px] font-semibold text-fg">{r.label}</span>
                  </span>
                  {secili ? (
                    <Check className="h-4 w-4 shrink-0 text-brand-600" />
                  ) : (
                    <Plus className="h-4 w-4 shrink-0 text-subtle" />
                  )}
                </div>

                {r.barcodes.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {r.barcodes.map((bc) => (
                      <span key={bc} className="rounded bg-elevated px-1.5 py-0.5 font-mono text-[10.5px] font-semibold text-muted">
                        {bc}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-[10.5px] font-medium text-subtle">barkod yok — oluşturmak için seç</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
