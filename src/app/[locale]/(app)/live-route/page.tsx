import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Route } from "lucide-react";
import { TrackingScreen } from "@/components/tracking/tracking-screen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("tracking.liveRoute");
  return { title: t("title") };
}

export default function LiveRoutePage() {
  return <TrackingScreen translationKey="liveRoute" icon={Route} phase={3} />;
}
