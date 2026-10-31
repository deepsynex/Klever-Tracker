import { redirect } from "next/navigation";
import { locale } from "next/root-params";

export default async function TrackingLiveRedirect() {
  redirect(`/${await locale()}/live`);
}
