import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { NotificationsScreen } from "@/components/notifications/notifications-screen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("notifications");
  return { title: t("title") };
}

export default function Page() {
  return <NotificationsScreen />;
}
