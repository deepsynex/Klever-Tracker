import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { MapSettingsScreen } from "@/components/masters/screens/map-settings-screen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("masters.am.mapSettings");
  return { title: t("title") };
}

export default function Page() {
  return <MapSettingsScreen />;
}
