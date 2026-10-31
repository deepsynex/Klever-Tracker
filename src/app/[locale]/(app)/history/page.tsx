import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { TrackingHistoryView } from "@/components/history/tracking-history-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("history");
  return { title: t("title") };
}

/** Full-screen map: cancels the shell's padding and fills the viewport below the 4rem header. */
export default function HistoryPage() {
  return (
    <div className="-mx-4 -my-6 h-[calc(100dvh-4rem)] min-h-[560px] sm:-mx-6">
      <Suspense fallback={<HistoryLoadingSkeleton />}>
        <TrackingHistoryView />
      </Suspense>
    </div>
  );
}

function HistoryLoadingSkeleton() {
  return (
    <div className="relative h-full animate-pulse bg-surface-2" aria-hidden>
      <div className="glass-panel absolute start-4 top-4 h-[420px] w-[min(380px,calc(100%-2rem))] rounded-2xl" />
      <div className="glass-panel absolute inset-x-4 bottom-4 h-24 rounded-2xl lg:start-[calc(380px+2rem)]" />
    </div>
  );
}
