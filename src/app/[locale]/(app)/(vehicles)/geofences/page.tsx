import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { GeofencesScreen } from "@/components/masters/screens/geofences-screen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("masters.vm.geofences");
  return { title: t("title") };
}

export default function Page() {
  return <GeofencesScreen />;
}
