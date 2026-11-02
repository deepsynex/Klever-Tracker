import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Video } from "lucide-react";
import { TrackingScreen } from "@/components/tracking/tracking-screen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("tracking.videoMonitoring");
  return { title: t("title") };
}

export default function VideoMonitoringPage() {
  return <TrackingScreen translationKey="videoMonitoring" icon={Video} phase={3} />;
}
