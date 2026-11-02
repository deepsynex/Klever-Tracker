import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Footprints } from "lucide-react";
import { TrackingScreen } from "@/components/tracking/tracking-screen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("tracking.liveTraversed");
  return { title: t("title") };
}

export default function LiveTraversedPage() {
  return <TrackingScreen translationKey="liveTraversed" icon={Footprints} phase={3} />;
}
