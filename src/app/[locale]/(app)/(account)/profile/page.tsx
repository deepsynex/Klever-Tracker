import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ProfileScreen } from "@/components/masters/screens/profile-screen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("masters.am.profile");
  return { title: t("title") };
}

export default function Page() {
  return <ProfileScreen />;
}
