import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { HeatmapView } from "@/components/heatmap/heatmap-view";
import { companyDate } from "@/lib/history/selection";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("heatmap");
  return {
    title: t("title"),
    description: t("description"),
  };
}

export default function HeatmapPage() {
  return (
    <div className="-mx-4 -my-6 h-[calc(100dvh-4rem)] min-h-[560px] sm:-mx-6 overflow-hidden">
      <HeatmapView today={companyDate(0)} />
    </div>
  );
}
