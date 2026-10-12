import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Check, Globe, Sun, Moon, Loader2, RotateCw, AlertTriangle } from "lucide-react";
import { useAppStore } from "../store/appStore";
import PageHeader from "../components/PageHeader";
import { api } from "../api/client";
import type { Settings } from "../types";
import type { Theme } from "../store/appStore";

export default function SettingsPage() {
  const { t } = useTranslation();
  const settings = useAppStore((s) => s.settings);
  const user = useAppStore((s) => s.user);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);

  const [form, setForm] = useState<Settings>(settings);
  // CANIAS'tan en son yüklenen değerler — "değişiklik var mı" bununla karşılaştırılır.
  const [orijinal, setOrijinal] = useState<Settings>(settings);
  // tamam: CANIAS'tan geldi · bos: CANIAS'ta kayıt yok · hata: servis çağrılamadı
  const [yukDurum, setYukDurum] = useState<"yukleniyor" | "tamam" | "bos" | "hata">("yukleniyor");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const lastFetchedUser = useRef<string | null>(null);

  // CANIAS'tan kullanıcının en güncel öndeğerlerini çek (sayfa açılışı + "CANIAS'tan yenile").
  // Bora (12.10): "bilgiler gidiyorsa kullanıcı manuel refreshleyip geri çağırabilsin".
  const yukle = async () => {
    const username = user?.username;
    if (!username) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await api.getUserDefault({ user: username });
      const guncel = { ...useAppStore.getState().settings, ...(res.defaults ?? {}) };
      setForm(guncel);
      setOrijinal(guncel);
      setSaved(false);
      if (res.defaults) {
        updateSettings(res.defaults);
        useAppStore.getState().setDefaultsHata(null);
        setYukDurum("tamam");
      } else {
        setYukDurum("bos");
      }
    } catch (err) {
      console.warn("CANIAS öndeğerleri çekilemedi:", err);
      setYukDurum("hata");
      setErrorMsg(err instanceof Error ? err.message : "CANIAS'tan ayarlar alınamadı");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const username = user?.username;
    if (!username || lastFetchedUser.current === username) return;
    lastFetchedUser.current = username;
    yukle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.username]);

  // Değişiklik var mı? (Bora: SaveUserDefault yalnızca ekranda değişiklik yapılınca çalışmalı)
  const ALANLAR: (keyof Settings)[] = [
    "company", "facility", "warehouseDelivery", "warehousePackaging", "warehouseReceiving",
    "warehouseQuality", "printerName", "language", "screenTimeout",
  ];
  const degisti = ALANLAR.some((k) => String(form[k] ?? "").trim() !== String(orijinal[k] ?? "").trim());
  // Ayarlar CANIAS'tan okunamadıysa kaydetme: boş form CANIAS'taki kaydı ezerdi.
  const kaydedilemez = yukDurum === "hata" || yukDurum === "yukleniyor" || loading;

  const set = (patch: Partial<Settings>) => {
    setForm((f) => ({ ...f, ...patch }));
    setSaved(false);
    setErrorMsg(null);
  };

  const save = async () => {
    if (!degisti || kaydedilemez) return;
    // Firma/Tesis boşken kaydetmek CANIAS kaydını bozar → engelle
    if (!form.company.trim() || !form.facility.trim()) {
      setErrorMsg("Firma ve Tesis boş bırakılamaz.");
      return;
    }
    setSaving(true);
    setErrorMsg(null);
    try {
      // 1. CANIAS MZYSaveUserDefault ile ERP'ye kaydet
      await api.saveUserDefault({
        company: form.company,
        plant: form.facility,
        user: user?.username,
        langu: form.language === "en" ? "E" : "T",
        receiptWh: form.warehouseReceiving,
        packWh: form.warehousePackaging,
        deliveryWh: form.warehouseDelivery,
        qltWh: form.warehouseQuality,
        printName: form.printerName,
        screenTimeout: form.screenTimeout,
      });

      // 2. Uygulama hafızasını güncelle (oturum boyunca geçerli)
      updateSettings(form);
      setOrijinal(form);
      useAppStore.getState().setDefaultsHata(null);
      setYukDurum("tamam");
      setSaved(true);
      setTimeout(() => setSaved(false), 2200);
    } catch (err) {
      console.error("Ayarlar CANIAS'a kaydedilemedi:", err);
      setErrorMsg(err instanceof Error ? err.message : "CANIAS servisine kaydedilemedi");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl p-6 lg:p-5">
      <PageHeader title={t("settings.title")} backTo="/home" />

      <section className="card p-6 pt-3.5 lg:p-4 lg:pt-3.5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-subtle">
            {t("settings.workContext")}
          </h2>
          <button
            type="button"
            onClick={yukle}
            disabled={loading || saving}
            title="Ayarları CANIAS'tan yeniden çek (kaydedilmemiş değişiklikler silinir)"
            className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1 text-xs font-semibold text-brand-600 transition hover:bg-elevated disabled:opacity-60 dark:text-brand-400"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />}
            {loading ? t("settings.loading") : "Yenile"}
          </button>
        </div>

        {yukDurum === "hata" && (
          <div className="mb-3 flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-600 dark:text-rose-400">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Ayarlar CANIAS'tan alınamadı; CANIAS'taki kayıt bozulmasın diye kaydetme kapalı. "Yenile" ile tekrar deneyin.</span>
          </div>
        )}
        {yukDurum === "bos" && (
          <div className="mb-3 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-700 dark:text-amber-400">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>CANIAS'ta bu kullanıcı için kayıtlı ayar yok. Alanları doldurup kaydedin.</span>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="field-label">{t("settings.company")}</label>
            <input value={form.company} onChange={(e) => set({ company: e.target.value })} className="field-input" />
          </div>
          <div>
            <label className="field-label">{t("settings.facility")}</label>
            <input value={form.facility} onChange={(e) => set({ facility: e.target.value })} className="field-input" />
          </div>
        </div>

        <div className="mt-3">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="field-label">{t("settings.warehouseDelivery")}</label>
              <input value={form.warehouseDelivery} onChange={(e) => set({ warehouseDelivery: e.target.value })} className="field-input" />
            </div>
            <div>
              <label className="field-label">{t("settings.warehousePackaging")}</label>
              <input value={form.warehousePackaging} onChange={(e) => set({ warehousePackaging: e.target.value })} className="field-input" />
            </div>
            <div>
              <label className="field-label">{t("settings.warehouseReceiving")}</label>
              <input value={form.warehouseReceiving} onChange={(e) => set({ warehouseReceiving: e.target.value })} className="field-input" />
            </div>
            <div>
              <label className="field-label">{t("settings.warehouseQuality")}</label>
              <input value={form.warehouseQuality ?? ""} onChange={(e) => set({ warehouseQuality: e.target.value })} className="field-input" />
            </div>
            <div>
              <label className="field-label">{t("settings.printerName")}</label>
              <input value={form.printerName ?? ""} onChange={(e) => set({ printerName: e.target.value })} className="field-input" />
            </div>
            <div>
              {/* SCREENTIMEOUT: başarı/özet ekranlarının kendiliğinden kapanma süresi (sn) */}
              <label className="field-label">{t("settings.screenTimeout")}</label>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                value={form.screenTimeout ?? ""}
                onChange={(e) => {
                  const n = Number.parseInt(e.target.value, 10);
                  set({ screenTimeout: Number.isFinite(n) && n > 0 ? n : undefined });
                }}
                placeholder="3"
                className="field-input"
              />
            </div>
          </div>
        </div>

        <div className="mt-1">
          <label className="field-label">{t("settings.language")}</label>
          <div className="grid max-w-sm grid-cols-2 gap-2 ">
            {(["tr", "en"] as const).map((lng) => (
              <button
                key={lng}
                onClick={() => set({ language: lng })}
                className={`flex h-12 items-center justify-center gap-2 rounded-2xl border text-sm font-semibold transition-all duration-200 ease-soft ${form.language === lng
                  ? "border-brand-500 bg-brand-500/10 text-brand-600 dark:text-brand-300"
                  : "border-line bg-surface text-muted hover:bg-elevated"
                  }`}
              >
                <Globe className="h-4 w-4" />
                {lng === "tr" ? "Türkçe" : "English"}
              </button>
            ))}
          </div>
        </div>

        {errorMsg && (
          <p className="mt-4 text-xs font-semibold text-rose-600 dark:text-rose-400">
            {errorMsg}
          </p>
        )}

        <button
          onClick={save}
          disabled={saving || !degisti || kaydedilemez}
          title={!degisti ? "Değişiklik yok" : kaydedilemez ? "Önce ayarları CANIAS'tan yükleyin" : undefined}
          className="btn-primary btn-lg mt-6 w-full sm:w-auto sm:px-10"
        >
          {saving ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" /> {t("settings.saving")}
            </>
          ) : saved ? (
            <>
              <Check className="h-5 w-5" /> {t("settings.saved")}
            </>
          ) : (
            t("settings.save")
          )}
        </button>
      </section>
      <section className="card mt-2 p-5 lg:p-5">
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-subtle">
          {t("settings.appearance")}
        </h2>
        <div className="grid max-w-sm grid-cols-2 gap-2">
          {([
            { key: "light" as Theme, icon: Sun, label: t("settings.themeLight") },
            { key: "dark" as Theme, icon: Moon, label: t("settings.themeDark") },
          ]).map(({ key, icon: Icon, label }) => (
            <button
              key={key}
              onClick={() => setTheme(key)}
              className={`flex h-12 items-center justify-center gap-2 rounded-2xl border text-sm font-semibold transition-all duration-200 ease-soft ${theme === key
                ? "border-brand-500 bg-brand-500/10 text-brand-600 dark:text-brand-300"
                : "border-line bg-surface text-muted hover:bg-elevated"
                }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
      </section>

      <p className="mt-6 text-center text-xs text-subtle">
        {t("app.company")} · {t("app.name")} — {t("settings.version")} 0.1.0
      </p>
    </div>
  );
}
