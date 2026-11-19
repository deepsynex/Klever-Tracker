import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { TyreInspectionsScreen } from "@/components/tyres/inspections-screen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("masters.tyres.inspections");
  return { title: t("title") };
}

export default function Page() {
  return <TyreInspectionsScreen />;
}
