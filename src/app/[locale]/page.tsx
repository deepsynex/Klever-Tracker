import { redirect } from "next/navigation";
import { locale } from "next/root-params";

export default async function LocaleIndex() {
  redirect(`/${await locale()}/dashboard`);
}
