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
import { loginAction, type FormState } from "@/lib/auth/actions";
import { loginSchema, type LoginInput } from "@/lib/auth/schemas";

const initialState: FormState = { status: "idle" };

export function LoginForm({ mockHint }: { mockHint?: { email: string; password: string } }) {
  const t = useTranslations("auth.login");
  const te = useTranslations("errors");
  const locale = useLocale();
  const searchParams = useSearchParams();
  const [state, formAction, pending] = useActionState(loginAction, initialState);
  const [, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema), defaultValues: { email: "", password: "" } });

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

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      {searchParams.get("reset") === "1" && !bannerError ? <Alert tone="success">{t("resetDone")}</Alert> : null}
      {mockHint && !bannerError ? (
        <Alert tone="warning">{t("mockHint", { email: mockHint.email, password: mockHint.password })}</Alert>
      ) : null}
      {bannerError ? <Alert tone="error">{te(bannerError)}</Alert> : null}

      <Field id="email" label={t("email")} error={fieldError("email")}>
        <Input
          id="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          dir="ltr"
          aria-invalid={!!fieldError("email")}
          aria-describedby={fieldError("email") ? "email-error" : undefined}
          {...register("email")}
        />
      </Field>

      <Field id="password" label={t("password")} error={fieldError("password")}>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          aria-invalid={!!fieldError("password")}
          aria-describedby={fieldError("password") ? "password-error" : undefined}
          {...register("password")}
        />
      </Field>

      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? t("submitting") : t("submit")}
      </Button>

      <Link href="/forgot-password" className="justify-self-center text-[13px] text-primary hover:underline">
        {t("forgot")}
      </Link>
    </form>
  );
}
