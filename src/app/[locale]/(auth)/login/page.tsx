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
  const mockHint = env.mock ? { email: MOCK_USER.email, password: MOCK_PASSWORD } : undefined;

  return (
    <Suspense fallback={<FormSkeleton />}>
      <LoginForm mockHint={mockHint} />
    </Suspense>
  );
}
