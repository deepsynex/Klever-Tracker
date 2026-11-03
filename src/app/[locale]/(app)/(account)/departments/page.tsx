import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { DepartmentsScreen } from "@/components/masters/screens/departments-screen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("masters.am.departments");
  return { title: t("title") };
}

export default function Page() {
  return <DepartmentsScreen />;
}
