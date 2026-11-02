import type { Metadata } from "next";
import { connection } from "next/server";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { HeatmapView } from "@/components/heatmap/heatmap-view";
import { companyDate } from "@/lib/history/selection";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("heatmap");
  return {
    title: t("title"),
    description: t("subtitle"),
  };
}

/** "Today" must be read at request time, not frozen into the prerendered shell. */
async function HeatmapWithToday() {
  await connection();
  return <HeatmapView today={companyDate(0)} />;
}

export default function HeatmapPage() {
  return (
    <div className="-mx-4 -my-6 h-[calc(100dvh-4rem)] min-h-[560px] sm:-mx-6 overflow-hidden">
      <Suspense fallback={<div className="size-full animate-pulse bg-surface-2" />}>
        <HeatmapWithToday />
      </Suspense>
    </div>
  );
}
