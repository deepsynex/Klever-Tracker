import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { TypesScreen } from "@/components/masters/screens/types-screen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("masters.vm.types");
  return { title: t("title") };
}

export default function Page() {
  return <TypesScreen />;
}
