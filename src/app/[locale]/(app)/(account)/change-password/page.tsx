import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ChangePasswordScreen } from "@/components/masters/screens/change-password-screen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("masters.am.changePassword");
  return { title: t("title") };
}

export default function Page() {
  return <ChangePasswordScreen />;
}
