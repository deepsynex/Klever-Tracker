import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { connection } from "next/server";
import { Suspense } from "react";
import { HeatmapView } from "@/components/heatmap/heatmap-view";
import { companyDate } from "@/lib/history/selection";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("heatmap");
  return { title: t("title") };
}

export default function HeatmapPage() {
  return (
    <div className="mx-auto max-w-7xl">
      <Suspense fallback={<HeatmapSkeleton />}>
        <HeatmapWithToday />
      </Suspense>
    </div>
  );
}

/** The default date range is "today", so render at request time rather than in the prerender. */
async function HeatmapWithToday() {
  await connection();
  return <HeatmapView today={companyDate(0)} />;
}

function HeatmapSkeleton() {
  return (
    <div className="grid animate-pulse gap-4 lg:grid-cols-[300px_minmax(0,1fr)]" aria-hidden>
      <div className="h-[520px] rounded-card bg-surface-2" />
      <div className="h-[520px] rounded-card bg-surface-2" />
    </div>
  );
}
