import { Signal, Wifi, BatteryFull } from "lucide-react";

/** Telefon durum çubuğu (saat, sinyal, batarya) — sunum görünümü için. */
export default function StatusBar({ dark = false }: { dark?: boolean }) {
  const now = new Date();
  const time = now.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  const color = dark ? "text-white" : "text-ink-900";
  return (
    <div className={`flex h-9 items-center justify-between px-6 pt-1 text-[13px] font-semibold ${color}`}>
      <span>{time}</span>
      <div className="flex items-center gap-1.5">
        <Signal className="h-3.5 w-3.5" />
        <Wifi className="h-3.5 w-3.5" />
        <BatteryFull className="h-4 w-4" />
      </div>
    </div>
  );
}
