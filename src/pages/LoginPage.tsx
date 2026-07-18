import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Boxes, Eye, EyeOff, Loader2 } from "lucide-react";
import { useAppStore } from "../store/appStore";

export default function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const login = useAppStore((s) => s.login);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(false);
    if (!username.trim() || !password.trim()) {
      setError(true);
      return;
    }
    setLoading(true);
    // Mock auth — gerçek serviste POST /auth/login
    setTimeout(() => {
      login(username.trim());
      navigate("/home", { replace: true });
    }, 700);
  };

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-gradient-to-br from-ink-900 via-brand-900 to-brand-950 p-4">
      <div className="w-full max-w-sm">
        {/* Marka */}
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20 backdrop-blur">
            <Boxes className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-white">{t("app.company")}</h1>
          <p className="text-sm font-medium text-brand-200">{t("app.name")}</p>
        </div>

        {/* Form kartı */}
        <form onSubmit={submit} className="rounded-3xl bg-white p-6 shadow-soft">
          <h2 className="text-lg font-bold text-ink-900">{t("login.welcome")}</h2>
          <p className="mb-5 text-sm text-ink-400">{t("login.subtitle")}</p>

          <label className="field-label">{t("login.username")}</label>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder={t("login.usernamePlaceholder")}
            autoCapitalize="none"
            className="field-input mb-4"
          />

          <label className="field-label">{t("login.password")}</label>
          <div className="relative mb-2">
            <input
              type={showPw ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("login.passwordPlaceholder")}
              className="field-input pr-12"
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400"
            >
              {showPw ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </div>

          {error && <p className="mb-2 text-sm font-medium text-rose-500">{t("login.error")}</p>}

          <button type="submit" disabled={loading} className="btn-primary btn-lg btn-block mt-3">
            {loading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                {t("login.signingIn")}
              </>
            ) : (
              t("login.signIn")
            )}
          </button>

          <p className="mt-4 text-center text-xs text-ink-300">{t("login.demoHint")}</p>
        </form>
      </div>
    </div>
  );
}
