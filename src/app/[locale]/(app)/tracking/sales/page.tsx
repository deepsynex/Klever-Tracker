import { redirect } from "next/navigation";
import { locale } from "next/root-params";

export default async function TrackingSalesRedirect() {
  redirect(`/${await locale()}/sales`);
}
