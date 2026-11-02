import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AuditLogScreen } from "@/components/masters/screens/audit-log-screen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("masters.am.audit");
  return { title: t("title") };
}

export default function Page() {
  return <AuditLogScreen />;
}
