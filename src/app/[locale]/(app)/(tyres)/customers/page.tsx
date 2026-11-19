import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CustomersScreen } from "@/components/tyres/customers-screen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("masters.tyres.customers");
  return { title: t("title") };
}

export default function Page() {
  return <CustomersScreen />;
}
