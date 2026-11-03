import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { MaintenanceScreen } from "@/components/masters/screens/maintenance-screen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("masters.vm.maintenance");
  return { title: t("title") };
}

export default function Page() {
  return <MaintenanceScreen />;
}
