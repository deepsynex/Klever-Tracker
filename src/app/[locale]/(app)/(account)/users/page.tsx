import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { UsersScreen } from "@/components/masters/screens/users-screen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("masters.am.users");
  return { title: t("title") };
}

export default function Page() {
  return <UsersScreen />;
}
