import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AccountsScreen } from "@/components/masters/screens/accounts-screen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("masters.am.accounts");
  return { title: t("title") };
}

export default function Page() {
  return <AccountsScreen />;
}
