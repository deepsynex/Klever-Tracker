import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { DriverBehaviourScreen } from "@/components/masters/screens/driver-behaviour-screen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("masters.am.driverBehaviour");
  return { title: t("title") };
}

export default function Page() {
  return <DriverBehaviourScreen />;
}
