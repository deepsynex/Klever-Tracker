import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { MultiTrackingView } from "@/components/multi-tracking/multi-tracking-view";
import { getSessionUser } from "@/lib/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("multiTracking");
  return { title: t("title"), description: t("subtitle") };
}

/** The saved selection is per user, so the view needs the signed-in user's id (cookie: request time). */
async function MultiTrackingForUser() {
  const user = await getSessionUser();
  return <MultiTrackingView userKey={user?.id ?? "anonymous"} />;
}

export default function MultiTrackingPage() {
  return (
    <div className="-mx-4 -my-6 px-4 py-4 sm:-mx-6 sm:px-6 lg:h-[calc(100dvh-4rem)] lg:min-h-[600px] lg:overflow-hidden">
      <Suspense fallback={<div className="h-[calc(100dvh-6rem)] animate-pulse rounded-2xl bg-surface-2" />}>
        <MultiTrackingForUser />
      </Suspense>
    </div>
  );
}
