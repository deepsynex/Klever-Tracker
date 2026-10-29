import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AllocationsScreen } from "@/components/masters/screens/allocations-screen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("masters.vm.allocations");
  return { title: t("title") };
}

export default function Page() {
  return <AllocationsScreen />;
}
