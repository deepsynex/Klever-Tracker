import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { TyreMastersScreen } from "@/components/tyres/tyre-masters-screen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("masters.tyres.masters");
  return { title: t("title") };
}

export default function Page() {
  return <TyreMastersScreen />;
}
