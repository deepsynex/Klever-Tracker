"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState, useActionState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { Alert } from "@/components/ui/alert";
import { Link } from "@/i18n/navigation";
import { loginAction, type FormState } from "@/lib/auth/actions";
import { loginSchema, type LoginInput } from "@/lib/auth/schemas";

const initialState: FormState = { status: "idle" };

export function LoginForm({ mockHint }: { mockHint?: { email: string; password: string } }) {
  const t = useTranslations("auth.login");
  const te = useTranslations("errors");
  const locale = useLocale();
  const searchParams = useSearchParams();
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [ssoMessage, setSsoMessage] = useState<string | null>(null);

  const [state, formAction, pending] = useActionState(loginAction, initialState);
  const [, startTransition] = useTransition();

  const defaultEmail = mockHint?.email || "verify@klever-tracker.test";
  const defaultPassword = mockHint?.password || "";

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: defaultEmail, password: defaultPassword },
  });

  const onSubmit = handleSubmit((values) => {
    const data = new FormData();
    data.set("email", values.email);
    data.set("password", values.password);
    data.set("locale", locale);
    data.set("next", searchParams.get("next") ?? "");
    startTransition(() => formAction(data));
  });

  const fieldError = (name: keyof LoginInput) => errors[name]?.message ?? state.fields?.[name];
  const bannerError = state.status === "error" && state.error && state.error !== "invalid_input" ? state.error : null;

  const oauthError = searchParams.get("error");
  let oauthErrorMessage: string | null = null;
  if (oauthError === "google_cancelled") {
    oauthErrorMessage = "Google sign-in was cancelled.";
  } else if (oauthError === "invalid_state") {
    oauthErrorMessage = "Authentication session expired or invalid state. Please try again.";
  } else if (oauthError === "missing_code") {
    oauthErrorMessage = "Google authorization code missing. Please try again.";
  } else if (oauthError === "oauth_failed") {
    oauthErrorMessage = "Google authentication failed. Please try again or sign in with your email.";
  } else if (oauthError) {
    oauthErrorMessage = "An authentication error occurred. Please try again.";
  }

  return (
    <div className="w-full rounded-[24px] border border-slate-100 bg-white p-7 sm:p-9 shadow-[0_12px_40px_-10px_rgba(0,0,0,0.06),0_1px_3px_rgba(0,0,0,0.04)]">
      {/* Brand Header */}
      <div className="flex items-center justify-center gap-3.5 mb-6">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-[14px] bg-gradient-to-br from-[#059669] to-[#0d9488] shadow-[0_4px_10px_rgba(5,150,105,0.25)]">
          {/* Klever Navigation Flight Arrow Logo */}
          <svg viewBox="0 0 24 24" className="size-6 text-white fill-white" strokeWidth="1" stroke="currentColor">
            <path d="M 6,12 L 19,6 L 12,19 L 10.5,13.5 Z" />
          </svg>
        </div>
        <div className="flex flex-col">
          <div className="text-2xl font-extrabold tracking-tight leading-none">
            <span className="text-[#111827]">Klever </span>
            <span className="text-[#0d9488]">Tracker</span>
          </div>
          <span className="text-[9px] font-bold tracking-[2.2px] text-slate-400 mt-1 uppercase">
            VEHICLE TRACKING SYSTEM
          </span>
        </div>
      </div>

      {/* Welcome Heading */}
      <div className="text-center mb-6">
        <h2 className="text-2xl font-extrabold text-[#111827] tracking-tight">
          Welcome Back
        </h2>
        <p className="mt-1 text-[13.5px] text-slate-500">
          Sign in to access your fleet tracking dashboard
        </p>
      </div>

      {/* Feedback Banners */}
      {searchParams.get("reset") === "1" && !bannerError ? (
        <div className="mb-4">
          <Alert tone="success">{t("resetDone")}</Alert>
        </div>
      ) : null}

      {mockHint && !bannerError ? (
        <div className="mb-4">
          <Alert tone="warning">
            {t("mockHint", { email: mockHint.email, password: mockHint.password })}
          </Alert>
        </div>
      ) : null}

      {oauthErrorMessage ? (
        <div className="mb-4">
          <Alert tone="error">{oauthErrorMessage}</Alert>
        </div>
      ) : null}

      {bannerError ? (
        <div className="mb-4">
          <Alert tone="error">{te(bannerError)}</Alert>
        </div>
      ) : null}

      {ssoMessage ? (
        <div className="mb-4 rounded-lg bg-emerald-50 border border-emerald-200 p-2.5 text-xs font-medium text-emerald-800">
          {ssoMessage}
        </div>
      ) : null}

      {/* Login Form */}
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {/* Email Field */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-[13px] font-semibold text-slate-700">
            {t("email")}
          </label>
          <div className="relative flex items-center">
            <span className="pointer-events-none absolute left-3.5 text-slate-400" aria-hidden>
              {/* Mail Icon */}
              <svg viewBox="0 0 24 24" className="size-4.5 stroke-current fill-none" strokeWidth="2">
                <rect x="2" y="4" width="20" height="16" rx="3" />
                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
              </svg>
            </span>
            <input
              id="email"
              type="email"
              autoComplete="username"
              inputMode="email"
              dir="ltr"
              placeholder="verify@klever-tracker.test"
              className="h-11 w-full rounded-[10px] border border-[#d8e2ec] bg-[#eef3f8] pl-10 pr-4 text-sm font-medium text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-[#0d9488] focus:bg-white focus:ring-2 focus:ring-[#0d9488]/15"
              aria-invalid={!!fieldError("email")}
              aria-describedby={fieldError("email") ? "email-error" : undefined}
              {...register("email")}
            />
          </div>
          {fieldError("email") ? (
            <p id="email-error" className="text-xs text-red-500 font-medium">
              {fieldError("email")}
            </p>
          ) : null}
        </div>

        {/* Password Field */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className="text-[13px] font-semibold text-slate-700">
            {t("password")}
          </label>
          <div className="relative flex items-center">
            <span className="pointer-events-none absolute left-3.5 text-slate-400" aria-hidden>
              {/* Lock Icon */}
              <svg viewBox="0 0 24 24" className="size-4.5 stroke-current fill-none" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </span>
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="••••••••••••"
              className="h-11 w-full rounded-[10px] border border-[#d8e2ec] bg-[#eef3f8] pl-10 pr-11 text-sm font-medium text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-[#0d9488] focus:bg-white focus:ring-2 focus:ring-[#0d9488]/15"
              aria-invalid={!!fieldError("password")}
              aria-describedby={fieldError("password") ? "password-error" : undefined}
              {...register("password")}
            />
            {/* Show / Hide Toggle Button */}
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 p-1 text-slate-400 hover:text-slate-700 transition-colors"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? (
                /* Eye Open */
                <svg viewBox="0 0 24 24" className="size-4.5 stroke-current fill-none" strokeWidth="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              ) : (
                /* Eye Off */
                <svg viewBox="0 0 24 24" className="size-4.5 stroke-current fill-none" strokeWidth="2">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              )}
            </button>
          </div>
          {fieldError("password") ? (
            <p id="password-error" className="text-xs text-red-500 font-medium">
              {fieldError("password")}
            </p>
          ) : null}
        </div>

        {/* Options Row: Remember Me & Forgot Password */}
        <div className="flex items-center justify-between mt-1">
          <label className="inline-flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="sr-only"
            />
            <span
              className={`flex size-4.5 items-center justify-center rounded-[5px] border transition-all ${
                rememberMe
                  ? "border-[#059669] bg-[#059669] text-white"
                  : "border-slate-300 bg-white"
              }`}
            >
              {rememberMe ? (
                <svg viewBox="0 0 12 10" className="size-3 stroke-current fill-none" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="1.5 5 4.5 8 10.5 1.5" />
                </svg>
              ) : null}
            </span>
            <span className="text-[13px] font-medium text-slate-700">Remember me</span>
          </label>

          <Link
            href="/forgot-password"
            className="text-[13px] font-semibold text-[#0d9488] hover:text-[#059669] transition-colors"
          >
            {t("forgot")}
          </Link>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={pending}
          className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-[10px] bg-gradient-to-r from-[#059669] to-[#0d9488] font-bold text-white text-[14.5px] shadow-[0_4px_14px_rgba(5,150,105,0.25)] hover:shadow-[0_8px_20px_rgba(5,150,105,0.35)] hover:brightness-105 active:scale-[0.99] disabled:opacity-50 transition-all cursor-pointer"
        >
          {pending ? (
            <div className="size-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <>
              <span>{t("submit")}</span>
              <svg viewBox="0 0 24 24" className="size-4.5 stroke-current fill-none transition-transform group-hover:translate-x-1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </>
          )}
        </button>
      </form>

      {/* Divider */}
      <div className="flex items-center gap-3 my-5">
        <span className="h-px flex-1 bg-slate-200" />
        <span className="text-xs font-medium text-slate-400">or continue with</span>
        <span className="h-px flex-1 bg-slate-200" />
      </div>

      {/* SSO Buttons */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        {/* Google SSO */}
        <a
          href={`/api/auth/google?locale=${locale}&next=${encodeURIComponent(searchParams.get("next") || "/dashboard")}`}
          className="flex h-10.5 items-center justify-center gap-2.5 rounded-[9px] border border-slate-200 bg-white font-semibold text-slate-800 text-[13px] hover:bg-slate-50 hover:border-slate-300 hover:shadow-sm transition-all cursor-pointer"
        >
          <svg className="size-4.5 shrink-0" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335" />
          </svg>
          <span>Google</span>
        </a>

        {/* Microsoft SSO */}
        <button
          type="button"
          onClick={() => setSsoMessage("Connecting to Microsoft Azure AD...")}
          className="flex h-10.5 items-center justify-center gap-2.5 rounded-[9px] border border-slate-200 bg-white font-semibold text-slate-800 text-[13px] hover:bg-slate-50 hover:border-slate-300 hover:shadow-sm transition-all cursor-pointer"
        >
          <svg className="size-4 shrink-0" viewBox="0 0 21 21">
            <rect x="1" y="1" width="9" height="9" fill="#F25022" />
            <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
            <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
            <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
          </svg>
          <span>Microsoft</span>
        </button>
      </div>

      {/* Security Callout Banner */}
      <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[#059669]">
          <svg viewBox="0 0 24 24" className="size-4 fill-none stroke-current" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <polyline points="9 12 11 14 15 10" />
          </svg>
        </div>
        <div className="flex flex-col">
          <span className="text-[12.5px] font-bold text-emerald-900 leading-tight">
            Secure &amp; Reliable
          </span>
          <span className="text-[11.5px] text-emerald-700 leading-tight mt-0.5">
            Your data is encrypted and always protected
          </span>
        </div>
      </div>
    </div>
  );
}
