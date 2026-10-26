import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { TrackingHistoryView } from "@/components/history/tracking-history-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("history");
  return { title: t("title") };
}

export default function HistoryPage() {
  return (
    <div className="mx-auto max-w-7xl">
      <Suspense fallback={<HistoryLoadingSkeleton />}>
        <TrackingHistoryView />
      </Suspense>
    </div>
  );
}

function HistoryLoadingSkeleton() {
  return (
    <div className="grid gap-5 animate-pulse" aria-hidden>
      <div className="h-8 w-64 rounded bg-surface-3" />
      <div className="h-44 w-full rounded-lg bg-surface-2" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-20 rounded-lg bg-surface-2" />
        ))}
      </div>
      <div className="h-[500px] w-full rounded-lg bg-surface-2" />
    </div>
  );
}
