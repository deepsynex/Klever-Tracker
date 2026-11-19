import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CustomerVehiclesScreen } from "@/components/tyres/customer-vehicles-screen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("masters.tyres.customerVehicles");
  return { title: t("title") };
}

export default function Page() {
  return <CustomerVehiclesScreen />;
}
