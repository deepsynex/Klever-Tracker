import { redirect } from "next/navigation";
import { locale } from "next/root-params";

export default async function TrackingLiveTraversedRedirect() {
  redirect(`/${await locale()}/live-traversed`);
}
