import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Check, Globe, Sun, Moon, Loader2 } from "lucide-react";
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
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchedRef = useRef(false);

  // Sayfa açıldığında CANIAS'tan en güncel öndeğerleri çek
  useEffect(() => {
    if (fetchedRef.current) return;
    const username = user?.username;
    if (username) {
      fetchedRef.current = true;
      setLoading(true);
      api
        .getUserDefault({ user: username })
        .then((res) => {
          if (res.defaults) {
            setForm((prev) => ({ ...prev, ...res.defaults }));
            updateSettings(res.defaults);
          }
        })
        .catch((err) => {
          console.warn("CANIAS öndeğerleri çekilemedi, yerel ayarlar geçerli:", err);
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [user?.username, updateSettings]);

  const set = (patch: Partial<Settings>) => {
    setForm((f) => ({ ...f, ...patch }));
    setSaved(false);
    setErrorMsg(null);
  };

  const save = async () => {
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
      });

      // 2. Uygulama hafızasını güncelle
      updateSettings(form);
      setSaved(true);
      setTimeout(() => setSaved(false), 2200);
    } catch (err) {
      console.error("Ayarlar CANIAS'a kaydedilemedi:", err);
      // Yerel olarak yine de güncelle
      updateSettings(form);
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
          {loading && (
            <span className="flex items-center gap-1.5 text-xs text-brand-600 dark:text-brand-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t("settings.loading")}
            </span>
          )}
        </div>

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
          <p className="mt-4 text-xs font-semibold text-danger-500">
            {errorMsg}
          </p>
        )}

        <button
          onClick={save}
          disabled={saving}
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

      { }
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
