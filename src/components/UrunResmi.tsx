import { useEffect, useState } from "react";
import { ImageOff } from "lucide-react";

// Ürün görseli — aktuelofis sitesinden (malzeme kodu küçük harf + .webp), MaterialDetailCard ile aynı kaynak.
// Satır başına servis çağrısı yapmaz; görsel yoksa/yüklenemezse aynı boyutta "resim yok" kutusu gösterir
// (kartların hizası bozulmasın diye).
export function urunWebResmiUrl(kod?: string): string | undefined {
  const k = (kod || "").trim().toLowerCase();
  return k ? `https://www.aktuelofis.com.tr/image/data/urunler/${encodeURIComponent(k)}.webp` : undefined;
}

export default function UrunResmi({ kod, ad, className = "h-16 w-16" }: { kod?: string; ad?: string; className?: string }) {
  const [hata, setHata] = useState(false);
  useEffect(() => setHata(false), [kod]);
  const src = urunWebResmiUrl(kod);
  return (
    <div className={`flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line bg-white ${className}`} title={ad}>
      {src && !hata ? (
        <img src={src} alt={ad || kod || "Ürün"} loading="lazy" onError={() => setHata(true)} className="h-full w-full object-contain" />
      ) : (
        <ImageOff className="h-5 w-5 text-subtle/40" aria-label="Resim yok" />
      )}
    </div>
  );
}
