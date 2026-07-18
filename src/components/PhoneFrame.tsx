import { useEffect, useState, type ReactNode } from "react";

/**
 * Masaüstünde uygulamayı gerçek bir telefon çerçevesi içinde gösterir
 * (müşteri sunumu için). Gerçek mobil cihazda / WebView içinde çerçeve
 * kaybolur ve uygulama tüm ekranı kaplar (responsive).
 */
export default function PhoneFrame({ children }: { children: ReactNode }) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  if (isMobile) {
    return <div className="h-[100dvh] w-full overflow-hidden bg-ink-50">{children}</div>;
  }

  return (
    <div className="flex min-h-[100dvh] w-full items-center justify-center p-6">
      <div className="relative">
        {/* Cihaz gövdesi */}
        <div className="relative h-[812px] w-[390px] rounded-[3rem] border-[10px] border-ink-950 bg-ink-950 shadow-device">
          {/* Çentik */}
          <div className="absolute left-1/2 top-0 z-30 h-6 w-40 -translate-x-1/2 rounded-b-2xl bg-ink-950" />
          {/* Ekran */}
          <div className="relative h-full w-full overflow-hidden rounded-[2.3rem] bg-ink-50">
            {children}
          </div>
        </div>
        <p className="mt-4 text-center text-xs font-medium text-white/50">
          Aktüel Ofis · Depo Yönetim — önizleme (responsive · WebView uyumlu)
        </p>
      </div>
    </div>
  );
}
