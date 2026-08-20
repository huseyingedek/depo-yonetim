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
      <div className={`relative flex items-end justify-start shrink-0 select-none ${className}`}>
        <svg
          viewBox="0 0 185 138"
          className="w-[185px] h-[130px] block shrink-0"
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

          {/* 1. 3D Koli Çizimi (En Daha Uzun, Boy Daha Kısa) */}
          {/* Üst Yüzey */}
          <polygon
            points="64,20 96,36 42,62 10,46"
            fill="url(#boxTopGrad)"
            stroke="#10b981"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          {/* Sol Yüzey (EN - Daha Uzun) */}
          <polygon
            points="10,46 42,62 42,102 10,86"
            fill="url(#boxLeftGrad)"
            stroke="#10b981"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          {/* Sağ Yüzey (BOY - Daha Kısa) */}
          <polygon
            points="42,62 96,36 96,76 42,102"
            fill="url(#boxRightGrad)"
            stroke="#10b981"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />

          {/* Koli Bant Çizgisi */}
          <line
            x1="64"
            y1="20"
            x2="42"
            y2="62"
            stroke="#34d399"
            strokeWidth="1.4"
            strokeDasharray="3 2"
          />

          {/* Ölçü Kılavuz Çizgileri & Noktaları */}
          {/* En Çizgisi (Sol Alt Eğim - Kenara Tam Paralel) */}
          <line x1="8" y1="91" x2="38" y2="106" stroke="#059669" strokeWidth="1.3" strokeDasharray="2 1.5" />
          <circle cx="8" cy="91" r="2" fill="#059669" />
          <circle cx="38" cy="106" r="2" fill="#059669" />

          {/* Boy Çizgisi (Sağ Alt Eğim - Kenara Tam Paralel) */}
          <line x1="44" y1="107" x2="98" y2="81" stroke="#059669" strokeWidth="1.3" strokeDasharray="2 1.5" />
          <circle cx="44" cy="107" r="2" fill="#059669" />
          <circle cx="98" cy="81" r="2" fill="#059669" />

          {/* Yükseklik Çizgisi (Sağ Dikey - Kenara Tam Paralel) */}
          <line x1="108" y1="36" x2="108" y2="76" stroke="#059669" strokeWidth="1.3" strokeDasharray="2 1.5" />
          <circle cx="108" cy="36" r="2" fill="#059669" />
          <circle cx="108" cy="76" r="2" fill="#059669" />

          {/* 2. EN (Solda: Üstte En Yazısı, Altta Uzunluk) */}
          <text
            x="24"
            y="118"
            textAnchor="middle"
            className="font-sans text-[10.5px] font-black fill-black dark:fill-white uppercase tracking-wider"
          >
            En
          </text>
          <text
            x="24"
            y="132"
            textAnchor="middle"
            className="font-mono text-[12.5px] font-black fill-black dark:fill-white"
          >
            {wVal} {unit}
          </text>

          {/* 3. BOY (Sağ Altta: Yukarı Kaydırılmış Boy Yazısı ve Değeri) */}
          <text
            x="92"
            y="100"
            textAnchor="middle"
            className="font-sans text-[10.5px] font-black fill-black dark:fill-white uppercase tracking-wider"
          >
            Boy
          </text>
          <text
            x="92"
            y="114"
            textAnchor="middle"
            className="font-mono text-[12.5px] font-black fill-black dark:fill-white"
          >
            {lVal} {unit}
          </text>

          {/* 4. YÜKSEKLİK (Sağda: Üstte Yükseklik Metni, Altta Uzunluk) */}
          <text
            x="116"
            y="52"
            textAnchor="start"
            className="font-sans text-[10.5px] font-black fill-black dark:fill-white uppercase tracking-wider"
          >
            Yükseklik
          </text>
          <text
            x="116"
            y="66"
            textAnchor="start"
            className="font-mono text-[12.5px] font-black fill-black dark:fill-white"
          >
            {hVal} {unit}
          </text>
        </svg>
      </div>
    );
  }

  // Standart / Büyük Mod
  return (
    <div className={`relative w-full rounded-2xl border border-line bg-elevated/20 p-3 select-none ${className}`}>
      <svg
        viewBox="0 0 360 140"
        className="w-full h-auto max-h-[136px] mx-auto block"
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

        {/* 3D Isometric Küp Yüzeyleri */}
        <polygon
          points="180,20 220,42 180,64 140,42"
          fill="url(#boxTopGradLg)"
          stroke="#10b981"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <polygon
          points="140,42 180,64 180,102 140,80"
          fill="url(#boxLeftGradLg)"
          stroke="#10b981"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <polygon
          points="180,64 220,42 220,80 180,102"
          fill="url(#boxRightGradLg)"
          stroke="#10b981"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />

        {/* Koli Bant Çizgisi */}
        <line x1="180" y1="20" x2="180" y2="64" stroke="#34d399" strokeWidth="1.5" strokeDasharray="3 2" />

        {/* Ölçü Kılavuz Çizgileri */}
        <line x1="132" y1="42" x2="132" y2="80" stroke="#059669" strokeWidth="1.5" strokeDasharray="2 1.5" />
        <circle cx="132" cy="42" r="2.2" fill="#059669" />
        <circle cx="132" cy="80" r="2.2" fill="#059669" />

        <line x1="136" y1="84" x2="176" y2="105" stroke="#059669" strokeWidth="1.5" strokeDasharray="2 1.5" />
        <circle cx="136" cy="84" r="2.2" fill="#059669" />
        <circle cx="176" cy="105" r="2.2" fill="#059669" />

        <line x1="184" y1="105" x2="224" y2="84" stroke="#059669" strokeWidth="1.5" strokeDasharray="2 1.5" />
        <circle cx="184" cy="105" r="2.2" fill="#059669" />
        <circle cx="224" cy="84" r="2.2" fill="#059669" />

        {/* YÜKSEKLİK */}
        <text
          x="84"
          y="56"
          textAnchor="middle"
          className="font-mono text-[12.5px] font-black fill-black dark:fill-white"
        >
          {hVal} {unit}
        </text>
        <text
          x="84"
          y="70"
          textAnchor="middle"
          className="font-sans text-[10.5px] font-black fill-black dark:fill-white uppercase tracking-wider"
        >
          Yükseklik
        </text>

        {/* EN */}
        <text
          x="138"
          y="118"
          textAnchor="middle"
          className="font-sans text-[10.5px] font-black fill-black dark:fill-white uppercase tracking-wider"
        >
          En
        </text>
        <text
          x="138"
          y="132"
          textAnchor="middle"
          className="font-mono text-[12.5px] font-black fill-black dark:fill-white"
        >
          {wVal} {unit}
        </text>

        {/* BOY */}
        <text
          x="222"
          y="118"
          textAnchor="middle"
          className="font-sans text-[10.5px] font-black fill-black dark:fill-white uppercase tracking-wider"
        >
          Boy
        </text>
        <text
          x="222"
          y="132"
          textAnchor="middle"
          className="font-mono text-[12.5px] font-black fill-black dark:fill-white"
        >
          {lVal} {unit}
        </text>
      </svg>
    </div>
  );
};

export default Dimension3DBoxVisual;
