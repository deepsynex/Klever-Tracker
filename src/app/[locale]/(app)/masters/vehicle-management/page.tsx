import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/masters/page-header";
import { ModuleCards } from "@/components/masters/vm-nav";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("masters.vm");
  return { title: t("title") };
}

/** Vehicle Management overview: one card per sub-module the user may view. */
export default function VehicleManagementPage() {
  const t = useTranslations("masters.vm");
  return (
    <div className="grid gap-4">
      <PageHeader title={t("title")} description={t("description")} />
      <ModuleCards which="vm" namespace="masters.vm" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" />
    </div>
  );
}
