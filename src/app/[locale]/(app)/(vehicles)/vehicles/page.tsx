import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { VehiclesScreen } from "@/components/masters/screens/vehicles-screen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("masters.vm.vehicles");
  return { title: t("title") };
}

export default function Page() {
  return <VehiclesScreen />;
}
