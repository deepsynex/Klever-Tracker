"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useActionState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Link } from "@/i18n/navigation";
import { resetPasswordAction, type FormState } from "@/lib/auth/actions";
import { resetPasswordSchema, type ResetPasswordInput } from "@/lib/auth/schemas";

const initialState: FormState = { status: "idle" };

export function ResetPasswordForm() {
  const t = useTranslations("auth.reset");
  const tl = useTranslations("auth.login");
  const te = useTranslations("errors");
  const locale = useLocale();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const email = searchParams.get("email") ?? "";
  const [state, formAction, pending] = useActionState(resetPasswordAction, initialState);
  const [, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { token, email, password: "", confirmPassword: "" },
  });

  if (!token || !email) {
    return (
      <div className="grid gap-4">
        <Alert tone="error">{t("invalidLink")}</Alert>
        <Button asChild variant="secondary">
          <Link href="/forgot-password">{t("requestNew")}</Link>
        </Button>
      </div>
    );
  }

  const onSubmit = handleSubmit((values) => {
    const data = new FormData();
    data.set("token", values.token);
    data.set("email", values.email);
    data.set("password", values.password);
    data.set("confirmPassword", values.confirmPassword);
    data.set("locale", locale);
    startTransition(() => formAction(data));
  });

  const fieldError = (name: keyof ResetPasswordInput) => errors[name]?.message ?? state.fields?.[name];
  const bannerError =
    state.status === "error" && state.error && state.error !== "invalid_input" && state.error !== "validation"
      ? state.error
      : null;

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      {bannerError ? (
        <Alert tone="error">
          {te(bannerError)}{" "}
          {bannerError === "reset_failed" ? (
            <Link href="/forgot-password" className="font-medium text-primary hover:underline">
              {t("requestNew")}
            </Link>
          ) : null}
        </Alert>
      ) : null}

      <Field id="email" label={tl("email")} error={fieldError("email")}>
        <Input id="email" type="email" dir="ltr" autoComplete="username" readOnly value={email} className="bg-surface-2" />
      </Field>

      <Field id="password" label={t("password")} error={fieldError("password")} hint={t("hint")}>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          aria-invalid={!!fieldError("password")}
          aria-describedby={fieldError("password") ? "password-error" : "password-hint"}
          {...register("password")}
        />
      </Field>

      <Field id="confirmPassword" label={t("confirm")} error={fieldError("confirmPassword")}>
        <Input
          id="confirmPassword"
          type="password"
          autoComplete="new-password"
          aria-invalid={!!fieldError("confirmPassword")}
          aria-describedby={fieldError("confirmPassword") ? "confirmPassword-error" : undefined}
          {...register("confirmPassword")}
        />
      </Field>

      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? t("submitting") : t("submit")}
      </Button>
    </form>
  );
}
