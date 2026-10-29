import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { DistanceScreen } from "@/components/masters/screens/distance-screen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("masters.vm.distance");
  return { title: t("title") };
}

export default function Page() {
  return <DistanceScreen />;
}
