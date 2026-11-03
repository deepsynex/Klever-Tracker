"use server";

import { redirect } from "next/navigation";
import { isAppLocale, routing, type AppLocale } from "@/i18n/routing";
import { safeNextPath } from "@/lib/bff";
import type { ApiErrorKind } from "@/lib/graphql/errors";
import { kleverRequest } from "@/lib/graphql/klever";
import {
  FORGOT_PASSWORD,
  LOGIN,
  LOGOUT,
  RESET_PASSWORD,
  type ForgotPasswordResult,
  type LoginResult,
  type LogoutResult,
  type ResetPasswordResult,
} from "@/lib/graphql/operations";
import { clearSession, getOwnSessionToken, setSession } from "@/lib/session";
import { fieldErrors, forgotPasswordSchema, loginSchema, resetPasswordSchema } from "./schemas";

export type FormState = {
  status: "idle" | "error" | "success";
  /** Translation key under `errors.*` */
  error?: ApiErrorKind | "invalid_input" | "reset_failed";
  /** Field → translation key under `validation.*`, or a server message prefixed with "server:" */
  fields?: Record<string, string>;
};

function localeFrom(formData: FormData): AppLocale {
  const value = formData.get("locale");
  return isAppLocale(value) ? value : routing.defaultLocale;
}

function serverFieldErrors(fields?: Record<string, string[]>): Record<string, string> | undefined {
  if (!fields) return undefined;
  return Object.fromEntries(Object.entries(fields).map(([k, msgs]) => [k, `server:${msgs[0] ?? ""}`]));
}

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const locale = localeFrom(formData);
  const parsed = loginSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { status: "error", error: "invalid_input", fields: fieldErrors(parsed.error) };

  const result = await kleverRequest<LoginResult>(LOGIN, parsed.data);
  if (!result.ok) {
    return { status: "error", error: result.error.kind, fields: serverFieldErrors(result.error.fields) };
  }

  const { token, user } = result.data.login;
  await setSession(token, { id: String(user.id), name: user.name, email: user.email });
  redirect(safeNextPath(formData.get("next"), locale));
}

export async function forgotPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = forgotPasswordSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { status: "error", error: "invalid_input", fields: fieldErrors(parsed.error) };

  // The reset email and its link follow the language the user is viewing the app in.
  const result = await kleverRequest<ForgotPasswordResult>(FORGOT_PASSWORD, { ...parsed.data, locale: localeFrom(formData) });
  // The API returns true whether or not the email exists, so only transport failures are errors.
  if (!result.ok && result.error.kind !== "validation") return { status: "error", error: result.error.kind };
  return { status: "success" };
}

export async function resetPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const locale = localeFrom(formData);
  const parsed = resetPasswordSchema.safeParse({
    token: formData.get("token"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return { status: "error", error: "invalid_input", fields: fieldErrors(parsed.error) };

  const { token, email, password } = parsed.data;
  const result = await kleverRequest<ResetPasswordResult>(RESET_PASSWORD, { token, email, password });
  if (!result.ok) {
    if (result.error.kind === "validation") {
      return { status: "error", error: "validation", fields: serverFieldErrors(result.error.fields) };
    }
    const transport = ["network", "gateway", "api_locked"].includes(result.error.kind);
    return { status: "error", error: transport ? result.error.kind : "reset_failed" };
  }
  if (!result.data.resetPassword) return { status: "error", error: "reset_failed" };

  redirect(`/${locale}/login?reset=1`);
}

export async function logoutAction(formData: FormData): Promise<void> {
  const locale = localeFrom(formData);
  // Revoke the token on the backend (B4), so a copied token stops working too. Only this browser's
  // own token: never the shared DEV_AUTH_TOKEN fallback. Sign-out still completes if the call fails
  // (network, already-expired token): the cookie is cleared either way, and the failure is logged.
  const token = await getOwnSessionToken();
  if (token) {
    const result = await kleverRequest<LogoutResult>(LOGOUT, {}, { token }).catch((err: unknown) => ({
      ok: false as const,
      error: { kind: "network", message: err instanceof Error ? err.message : String(err) },
    }));
    // An expired or already-revoked token can't be revoked again; anything else may leave it valid.
    if (!result.ok && result.error.kind !== "unauthenticated") {
      console.warn(`[logout] token revocation failed (${result.error.kind}): ${result.error.message}`);
    }
  }
  await clearSession();
  redirect(`/${locale}/login`);
}
