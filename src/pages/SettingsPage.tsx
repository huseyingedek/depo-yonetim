import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Globe, Sun, Moon } from "lucide-react";
import { useAppStore } from "../store/appStore";
import PageHeader from "../components/PageHeader";
import type { Settings } from "../types";
import type { Theme } from "../store/appStore";

export default function SettingsPage() {
  const { t } = useTranslation();
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);

  const [form, setForm] = useState<Settings>(settings);
  const [saved, setSaved] = useState(false);

  const set = (patch: Partial<Settings>) => {
    setForm((f) => ({ ...f, ...patch }));
    setSaved(false);
  };

  const save = () => {
    updateSettings(form);
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  return (
    <div className="mx-auto max-w-3xl p-4 lg:p-8">
      <PageHeader title={t("settings.title")} backTo="/home" />

      <section className="card p-5 lg:p-6">
        <h2 className="mb-5 text-sm font-semibold uppercase tracking-wide text-subtle">
          {t("settings.workContext")}
        </h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="field-label">{t("settings.company")}</label>
            <input value={form.company} onChange={(e) => set({ company: e.target.value })} className="field-input" />
          </div>
          <div>
            <label className="field-label">{t("settings.facility")}</label>
            <input value={form.facility} onChange={(e) => set({ facility: e.target.value })} className="field-input" />
          </div>
          <div className="sm:col-span-2">
            <label className="field-label">{t("settings.warehouse")}</label>
            <input value={form.warehouse} onChange={(e) => set({ warehouse: e.target.value })} className="field-input" />
          </div>
        </div>

        <div className="mt-4">
          <label className="field-label">{t("settings.language")}</label>
          <div className="grid max-w-sm grid-cols-2 gap-2">
            {(["tr", "en"] as const).map((lng) => (
              <button
                key={lng}
                onClick={() => set({ language: lng })}
                className={`flex h-12 items-center justify-center gap-2 rounded-2xl border text-sm font-semibold transition-all duration-200 ease-soft ${
                  form.language === lng
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

        <button onClick={save} className="btn-primary btn-lg mt-6 w-full sm:w-auto sm:px-10">
          {saved ? (
            <>
              <Check className="h-5 w-5" /> {t("settings.saved")}
            </>
          ) : (
            t("settings.save")
          )}
        </button>
      </section>

      {/* Görünüm (tema) — anında uygulanır */}
      <section className="card mt-5 p-5 lg:p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-subtle">
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
              className={`flex h-12 items-center justify-center gap-2 rounded-2xl border text-sm font-semibold transition-all duration-200 ease-soft ${
                theme === key
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
