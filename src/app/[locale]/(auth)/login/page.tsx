import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { env } from "@/lib/env";
import { MOCK_PASSWORD, MOCK_USER } from "@/lib/graphql/mock";
import { FormSkeleton } from "../form-skeleton";
import { LoginForm } from "./login-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.login");
  return { title: t("title") };
}

export default async function LoginPage() {
  const t = await getTranslations("auth.login");
  const mockHint = env.mock ? { email: MOCK_USER.email, password: MOCK_PASSWORD } : undefined;

  return (
    <div className="grid gap-6">
      <div className="grid gap-1.5">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>
      <Suspense fallback={<FormSkeleton />}>
        <LoginForm mockHint={mockHint} />
      </Suspense>
    </div>
  );
}
