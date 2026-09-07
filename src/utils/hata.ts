// Merkezi hata yönetimi yardımcıları.
// - hataMetni: yakalanan HERHANGİ bir hatayı (WmsError, Error, string, bilinmeyen)
//   gösterilebilir tek bir metne çevirir. Böylece her sayfada response'un içine
//   girip mesaj aramak GEREKMEZ — API katmanı (doCall/serviceMessage) mesajı zaten
//   WmsError.message içine koyuyor.
// - hataGoster: mesajı global hata toast'ında gösterir (tek yerden yönetim).

import { useHataStore } from "../store/hataStore";

export function hataMetni(
  e: unknown,
  fallback = "Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin."
): string {
  if (e instanceof Error && e.message.trim()) return e.message.trim();
  if (typeof e === "string" && e.trim()) return e.trim();
  if (e && typeof e === "object" && "message" in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === "string" && m.trim()) return m.trim();
  }
  return fallback;
}

// Yakalanan hatayı tek satırda hem metne çevir hem global toast'ta göster.
// Kullanım:  try { ... } catch (e) { hataGosterVe(e); }
export function hataGosterVe(e: unknown, fallback?: string): string {
  const mesaj = hataMetni(e, fallback);
  useHataStore.getState().goster(mesaj);
  return mesaj;
}
