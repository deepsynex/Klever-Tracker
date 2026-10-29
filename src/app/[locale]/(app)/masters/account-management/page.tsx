import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/masters/page-header";
import { ModuleCards } from "@/components/masters/vm-nav";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("masters.am");
  return { title: t("title") };
}

/** Account Management overview: one card per sub-module the user may view. */
export default function AccountManagementPage() {
  const t = useTranslations("masters.am");
  return (
    <div className="grid gap-4">
      <PageHeader title={t("title")} description={t("description")} />
      <ModuleCards which="am" namespace="masters.am" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" />
    </div>
  );
}
