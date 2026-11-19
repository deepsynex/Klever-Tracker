import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { TyreReportScreen } from "@/components/tyres/tyre-report-screen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("masters.tyres.report");
  return { title: t("title") };
}

export default function Page() {
  return <TyreReportScreen />;
}
