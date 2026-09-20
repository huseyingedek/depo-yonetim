// -----------------------------------------------------------------------------
// AdimBar — 5 operasyon ekranının (Toplama, Mal Kabul, Yerleştirme, Transfer,
// Sayım) sol panelindeki adım sekmeleri için TEK ortak tasarım.
// Varsayılan: sabit yükseklik (h-9) + üst sınırlı eşit genişlik (max-w-[68px])
// ve ortalı → her sekme aynı boyutta. fill=true verilirse sekmeler satırı tam
// doldurur (ilk hali). Telefonda yatayda tam sığar; truncate + sabit 11px font.
//   • active  → mavi (brand)
//   • done    → yeşil ✓
//   • disabled→ soluk (tıklanamaz)
//   • onClick varsa sekme tıklanabilir olur.
// -----------------------------------------------------------------------------
export interface Adim {
  label: string;
  active?: boolean;
  done?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}

export default function AdimBar({
  adimlar,
  className = "",
  fill = false,
}: {
  adimlar: Adim[];
  className?: string;
  // fill=true → sekmeler satırı tamamen doldurur (ilk hali, tam genişlik).
  // fill=false → sabit boyutlu ve ortalı (varsayılan).
  fill?: boolean;
}) {
  return (
    <div className={`flex items-center justify-center gap-1.5 ${className}`}>
      {adimlar.map((a, i) => {
        const tiklanabilir = Boolean(a.onClick) && !a.disabled;
        return (
          <button
            key={i}
            type="button"
            onClick={a.onClick}
            disabled={a.disabled}
            className={`flex h-9 min-w-0 flex-1 ${fill ? "" : "max-w-[68px]"} items-center justify-center gap-1 truncate rounded-xl px-1.5 text-[11px] font-semibold transition ${
              a.active
                ? "bg-brand-600 text-white shadow-soft"
                : a.done
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
                  : a.disabled
                    ? "bg-elevated text-subtle/50"
                    : "bg-elevated text-subtle"
            } ${tiklanabilir ? "" : "cursor-default"}`}
          >
            <span className="shrink-0 font-mono">{a.done && !a.active ? "✓" : i + 1}</span>
            <span className="truncate">{a.label}</span>
          </button>
        );
      })}
    </div>
  );
}
