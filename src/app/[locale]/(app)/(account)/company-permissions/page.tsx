import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CompanyPermissionsScreen } from "@/components/masters/screens/company-permissions-screen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("masters.am.companyPermissions");
  return { title: t("title") };
}

export default function Page() {
  return <CompanyPermissionsScreen />;
}
