import { redirect } from "next/navigation";
import { locale } from "next/root-params";

export default async function TrackingVideoMonitoringRedirect() {
  redirect(`/${await locale()}/video-monitoring`);
}
