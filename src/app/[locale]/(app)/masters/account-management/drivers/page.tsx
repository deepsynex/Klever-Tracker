import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { DriversScreen } from "@/components/masters/screens/drivers-screen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("masters.am.drivers");
  return { title: t("title") };
}

export default function Page() {
  return <DriversScreen />;
}
