import { redirect } from "next/navigation";
import { locale } from "next/root-params";

export default async function TrackingLiveRouteRedirect() {
  redirect(`/${await locale()}/live-route`);
}
