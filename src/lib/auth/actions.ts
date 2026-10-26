"use server";

import { redirect } from "next/navigation";
import { isAppLocale, routing, type AppLocale } from "@/i18n/routing";
import { safeNextPath } from "@/lib/bff";
import type { ApiErrorKind } from "@/lib/graphql/errors";
import { kleverRequest } from "@/lib/graphql/klever";
import {
  FORGOT_PASSWORD,
  LOGIN,
  RESET_PASSWORD,
  type ForgotPasswordResult,
  type LoginResult,
  type ResetPasswordResult,
} from "@/lib/graphql/operations";
import { clearSession, setSession } from "@/lib/session";
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

  const result = await kleverRequest<ForgotPasswordResult>(FORGOT_PASSWORD, parsed.data);
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
  // TODO(B4): call the backend `logout` mutation here once it exists, so the token is revoked.
  await clearSession();
  redirect(`/${locale}/login`);
}
