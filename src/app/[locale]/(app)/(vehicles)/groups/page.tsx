import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { GroupsScreen } from "@/components/masters/screens/groups-screen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("masters.vm.groups");
  return { title: t("title") };
}

export default function Page() {
  return <GroupsScreen />;
}
