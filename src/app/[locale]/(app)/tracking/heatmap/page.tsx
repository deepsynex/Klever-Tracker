import { redirect } from "next/navigation";
import { locale } from "next/root-params";

export default async function TrackingHeatmapRedirect() {
  redirect(`/${await locale()}/heatmap`);
}
