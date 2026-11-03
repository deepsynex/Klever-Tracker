import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { TempSensorsScreen } from "@/components/masters/screens/temp-sensors-screen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("masters.vm.tempSensors");
  return { title: t("title") };
}

export default function Page() {
  return <TempSensorsScreen />;
}
