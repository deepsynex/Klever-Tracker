"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useLocale, useTranslations } from "next-intl";
import { useActionState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Link } from "@/i18n/navigation";
import { forgotPasswordAction, type FormState } from "@/lib/auth/actions";
import { forgotPasswordSchema, type ForgotPasswordInput } from "@/lib/auth/schemas";

const initialState: FormState = { status: "idle" };

export function ForgotPasswordForm() {
  const t = useTranslations("auth.forgot");
  const tl = useTranslations("auth.login");
  const te = useTranslations("errors");
  const locale = useLocale();
  const [state, formAction, pending] = useActionState(forgotPasswordAction, initialState);
  const [, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordInput>({ resolver: zodResolver(forgotPasswordSchema), defaultValues: { email: "" } });

  if (state.status === "success") {
    return (
      <div className="grid gap-4">
        <Alert tone="success">{t("sent")}</Alert>
        <Link href="/login" className="text-[13px] text-primary hover:underline">
          {t("back")}
        </Link>
      </div>
    );
  }

  const onSubmit = handleSubmit((values) => {
    const data = new FormData();
    data.set("email", values.email);
    data.set("locale", locale);
    startTransition(() => formAction(data));
  });

  const emailError = errors.email?.message ?? state.fields?.email;
  const bannerError = state.status === "error" && state.error && state.error !== "invalid_input" ? state.error : null;

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      {bannerError ? <Alert tone="error">{te(bannerError)}</Alert> : null}
      <Field id="email" label={tl("email")} error={emailError}>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          dir="ltr"
          aria-invalid={!!emailError}
          aria-describedby={emailError ? "email-error" : undefined}
          {...register("email")}
        />
      </Field>
      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? t("submitting") : t("submit")}
      </Button>
      <Link href="/login" className="justify-self-center text-[13px] text-primary hover:underline">
        {t("back")}
      </Link>
    </form>
  );
}
