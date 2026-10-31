import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ShoppingCart } from "lucide-react";
import { TrackingScreen } from "@/components/tracking/tracking-screen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("tracking.sales");
  return { title: t("title") };
}

export default function SalesTrackingPage() {
  return <TrackingScreen translationKey="sales" icon={ShoppingCart} phase={3} />;
}
