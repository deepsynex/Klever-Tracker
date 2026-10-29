import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkingHoursScreen } from "@/components/masters/screens/working-hours-screen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("masters.vm.workingHours");
  return { title: t("title") };
}

export default function Page() {
  return <WorkingHoursScreen />;
}
