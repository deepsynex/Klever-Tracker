import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { RolesScreen } from "@/components/masters/screens/roles-screen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("masters.am.roles");
  return { title: t("title") };
}

export default function Page() {
  return <RolesScreen />;
}
