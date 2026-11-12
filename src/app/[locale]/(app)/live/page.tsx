import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LiveTrackingView } from "@/components/tracking/live-tracking-view";
import { CompanyScopeProvider } from "@/lib/vehicle-management/company-scope";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("tracking.live");
  return { title: t("title") };
}

export default function LiveTrackingPage() {
  return (
    <div className="-mx-4 -my-6 h-[calc(100dvh-4rem)] min-h-[560px] sm:-mx-6 overflow-hidden">
      {/* The company picked in Vehicle Management, so a platform account can draw geofences for it here. */}
      <CompanyScopeProvider>
        <LiveTrackingView />
      </CompanyScopeProvider>
    </div>
  );
}
