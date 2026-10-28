import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LiveLocationScreen } from "@/components/masters/screens/live-location-screen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("masters.vm.liveLocation");
  return { title: t("title") };
}

export default function Page() {
  return <LiveLocationScreen />;
}
