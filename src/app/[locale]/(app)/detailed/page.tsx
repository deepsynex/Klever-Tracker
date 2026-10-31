import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { DetailedTrackingView } from "@/components/tracking/detailed-tracking-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("tracking.detailed");
  return { title: t("title") };
}

export default function DetailedTrackingPage() {
  return <DetailedTrackingView />;
}
