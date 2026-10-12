// -----------------------------------------------------------------------------
// Kullanıcı öndeğerlerini (MZYGetUserDefault) yükle — giriş, sayfa yenileme ve
// "Yeniden dene" aynı yolu kullanır. Başarısızsa sessiz kalmaz: store'a hata
// yazar, AppShell üstte uyarı + "Yeniden dene" gösterir (Bora, 12.10: "bilgiler
// gidiyorsa geri çağıracağı bir yol olsun").
// -----------------------------------------------------------------------------
import { api } from "../api/client";
import { useAppStore } from "../store/appStore";

export type AyarYukSonuc = "tamam" | "bos" | "hata";

export async function kullaniciAyarlariniYukle(username: string): Promise<AyarYukSonuc> {
  const st = useAppStore.getState();
  try {
    const res = await api.getUserDefault({ user: username });
    if (res.defaults) {
      useAppStore.getState().updateSettings(res.defaults);
      useAppStore.getState().setDefaultsHata(null);
      return "tamam";
    }
    st.setDefaultsHata("CANIAS'ta bu kullanıcı için kayıtlı ayar bulunamadı. Ayarlar ekranından girip kaydedin.");
    return "bos";
  } catch (e) {
    const m = e instanceof Error && e.message ? `: ${e.message}` : ".";
    st.setDefaultsHata(`Kullanıcı ayarları CANIAS'tan alınamadı${m}`);
    return "hata";
  }
}
