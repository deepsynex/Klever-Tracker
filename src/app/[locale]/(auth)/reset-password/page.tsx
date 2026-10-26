import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { FormSkeleton } from "../form-skeleton";
import { ResetPasswordForm } from "./reset-password-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.reset");
  return { title: t("title") };
}

export default async function ResetPasswordPage() {
  const t = await getTranslations("auth.reset");
  return (
    <div className="grid gap-6">
      <div className="grid gap-1.5">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>
      <Suspense fallback={<FormSkeleton fields={3} />}>
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}
