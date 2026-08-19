import React from "react";

interface Dimension3DBoxVisualProps {
  width?: number | string;
  length?: number | string;
  height?: number | string;
  unit?: string;
  compact?: boolean;
  className?: string;
}

export const Dimension3DBoxVisual: React.FC<Dimension3DBoxVisualProps> = ({
  width = 0,
  length = 0,
  height = 0,
  unit = "CM",
  compact = true,
  className = "",
}) => {
  const wVal = Number(width) || 0;
  const lVal = Number(length) || 0;
  const hVal = Number(height) || 0;

  if (compact) {
    return (
      <div className={`relative w-full h-full flex items-end justify-center select-none ${className}`}>
        <svg
          viewBox="0 0 356 132"
          className="w-full h-full max-h-[128px] mx-auto block"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="boxTopGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.32" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.14" />
            </linearGradient>
            <linearGradient id="boxLeftGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#059669" stopOpacity="0.42" />
              <stop offset="100%" stopColor="#059669" stopOpacity="0.22" />
            </linearGradient>
            <linearGradient id="boxRightGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#047857" stopOpacity="0.52" />
              <stop offset="100%" stopColor="#047857" stopOpacity="0.32" />
            </linearGradient>
          </defs>

          {/* 1. YÜKSEKLİK ETİKETİ (1 Punto Büyütülmüş: 16px) */}
          <g transform="translate(2, 0)">
            <rect
              x="0"
              y="0"
              width="132"
              height="26"
              rx="6"
              className="fill-surface stroke-line shadow-xs"
              strokeWidth="1.1"
            />
            <text
              x="66"
              y="18.5"
              textAnchor="middle"
              className="font-mono text-[16px] font-black fill-fg"
            >
              Yük: {hVal} {unit}
            </text>
          </g>

          {/* 2. 3D Isometric Koli Çizimi */}
          {/* Üst Yüzey */}
          <polygon
            points="202,18 258,34 184,56 128,38"
            fill="url(#boxTopGrad)"
            stroke="#10b981"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          {/* Sol Yüzey (Boy/Derinlik Yüzü) */}
          <polygon
            points="128,38 184,56 184,94 128,76"
            fill="url(#boxLeftGrad)"
            stroke="#10b981"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          {/* Sağ Yüzey (En/Genişlik Yüzü) */}
          <polygon
            points="184,56 258,34 258,72 184,94"
            fill="url(#boxRightGrad)"
            stroke="#10b981"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />

          {/* Koli Bant Çizgisi */}
          <line
            x1="202"
            y1="18"
            x2="184"
            y2="56"
            stroke="#34d399"
            strokeWidth="1.4"
            strokeDasharray="3 2"
          />

          {/* 3. Ölçü Çizgileri & Bağlantı Noktaları */}
          {/* Yükseklik Çizgisi (Sol Dikey) */}
          <line x1="120" y1="38" x2="120" y2="76" stroke="#059669" strokeWidth="1.3" strokeDasharray="2 1.5" />
          <circle cx="120" cy="38" r="2.2" fill="#059669" />
          <circle cx="120" cy="76" r="2.2" fill="#059669" />

          {/* En Çizgisi (Sol Alt Eğim) */}
          <line x1="124" y1="80" x2="180" y2="97" stroke="#059669" strokeWidth="1.3" strokeDasharray="2 1.5" />
          <circle cx="124" cy="80" r="2.2" fill="#059669" />
          <circle cx="180" cy="97" r="2.2" fill="#059669" />

          {/* Boy Çizgisi (Sağ Alt Eğim) */}
          <line x1="188" y1="97" x2="262" y2="75" stroke="#059669" strokeWidth="1.3" strokeDasharray="2 1.5" />
          <circle cx="188" cy="97" r="2.2" fill="#059669" />
          <circle cx="262" cy="75" r="2.2" fill="#059669" />

          {/* 4. EN & BOY ETİKETLERİ (1 Punto Büyütülmüş: 16px) */}
          {/* EN (Sol Alt) */}
          <g transform="translate(2, 104)">
            <rect
              x="0"
              y="0"
              width="132"
              height="26"
              rx="6"
              className="fill-surface stroke-line shadow-xs"
              strokeWidth="1.1"
            />
            <text
              x="66"
              y="18.5"
              textAnchor="middle"
              className="font-mono text-[16px] font-black fill-fg"
            >
              En: {wVal} {unit}
            </text>
          </g>

          {/* BOY (Sağ Alt) */}
          <g transform="translate(222, 104)">
            <rect
              x="0"
              y="0"
              width="132"
              height="26"
              rx="6"
              className="fill-surface stroke-line shadow-xs"
              strokeWidth="1.1"
            />
            <text
              x="66"
              y="18.5"
              textAnchor="middle"
              className="font-mono text-[16px] font-black fill-fg"
            >
              Boy: {lVal} {unit}
            </text>
          </g>
        </svg>
      </div>
    );
  }

  // Standart / Büyük Mod (Modallar ve Formlar için)
  return (
    <div className={`relative w-full rounded-2xl border border-line bg-elevated/20 p-3 select-none ${className}`}>
      <svg
        viewBox="0 0 360 136"
        className="w-full h-auto max-h-[126px] mx-auto block"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="boxTopGradLg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.30" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0.12" />
          </linearGradient>
          <linearGradient id="boxLeftGradLg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#059669" stopOpacity="0.40" />
            <stop offset="100%" stopColor="#059669" stopOpacity="0.22" />
          </linearGradient>
          <linearGradient id="boxRightGradLg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#047857" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#047857" stopOpacity="0.32" />
          </linearGradient>
        </defs>

        {/* YÜKSEKLİK (Sol Üstte) */}
        <g transform="translate(6, 2)">
          <rect x="0" y="0" width="136" height="29" rx="6" className="fill-surface stroke-line shadow-xs" strokeWidth="1" />
          <text x="68" y="20" textAnchor="middle" className="font-mono text-[16px] font-black fill-fg">
            Yük: {hVal} {unit}
          </text>
        </g>

        {/* 3D Koli Yüzeyleri */}
        <polygon
          points="188,24 234,36 168,52 122,40"
          fill="url(#boxTopGradLg)"
          stroke="#10b981"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <polygon
          points="122,40 168,52 168,86 122,74"
          fill="url(#boxLeftGradLg)"
          stroke="#10b981"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <polygon
          points="168,52 234,36 234,70 168,86"
          fill="url(#boxRightGradLg)"
          stroke="#10b981"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />

        {/* Koli Bant Çizgisi */}
        <line x1="188" y1="24" x2="168" y2="52" stroke="#34d399" strokeWidth="1.5" strokeDasharray="3 2" />

        {/* Ölçü Çizgileri */}
        {/* Yükseklik Çizgisi (Sol Dikey) */}
        <line x1="112" y1="40" x2="112" y2="74" stroke="#059669" strokeWidth="1.5" strokeDasharray="2 1.5" />
        <circle cx="112" cy="40" r="2.5" fill="#059669" />
        <circle cx="112" cy="74" r="2.5" fill="#059669" />

        {/* En Çizgisi (Sol Alt) */}
        <line x1="116" y1="77" x2="162" y2="89" stroke="#059669" strokeWidth="1.5" strokeDasharray="2 1.5" />
        <circle cx="116" cy="77" r="2.5" fill="#059669" />
        <circle cx="162" cy="89" r="2.5" fill="#059669" />

        {/* Boy Çizgisi (Sağ Alt) */}
        <line x1="168" y1="89" x2="234" y2="73" stroke="#059669" strokeWidth="1.5" strokeDasharray="2 1.5" />
        <circle cx="168" cy="89" r="2.5" fill="#059669" />
        <circle cx="234" cy="73" r="2.5" fill="#059669" />

        {/* EN (Kutunun Altında) */}
        <g transform="translate(6, 106)">
          <rect x="0" y="0" width="136" height="29" rx="6" className="fill-surface stroke-line shadow-xs" strokeWidth="1" />
          <text x="68" y="20" textAnchor="middle" className="font-mono text-[16px] font-black fill-fg">
            En: {wVal} {unit}
          </text>
        </g>

        {/* BOY (Kutunun Altında) */}
        <g transform="translate(220, 106)">
          <rect x="0" y="0" width="136" height="29" rx="6" className="fill-surface stroke-line shadow-xs" strokeWidth="1" />
          <text x="68" y="20" textAnchor="middle" className="font-mono text-[16px] font-black fill-fg">
            Boy: {lVal} {unit}
          </text>
        </g>
      </svg>
    </div>
  );
};

export default Dimension3DBoxVisual;
