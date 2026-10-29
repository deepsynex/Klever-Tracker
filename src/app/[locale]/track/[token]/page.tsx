import { LinkIcon, MapPinOff } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense, type ReactNode } from "react";
import { Brand } from "@/components/brand";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { PublicTrackView } from "@/components/track/public-track-view";
import { kleverRequest } from "@/lib/graphql/klever";
import { SHARED_LOCATION_BY_TOKEN, type SharedLocationByTokenResult } from "@/lib/graphql/vehicle-management";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("track");
  // A share link is private to whoever received it: keep it out of search engines.
  return { title: t("title"), robots: { index: false, follow: false } };
}

/** Public live-location page opened from a share link. No sign-in; the token is the only key. */
export default function TrackPage({ params }: PageProps<"/[locale]/track/[token]">) {
  return (
    <div className="flex min-h-dvh flex-col px-4 py-5 sm:px-8">
      <header className="flex items-center justify-between gap-3">
        <Brand />
        <span className="flex items-center gap-1">
          {/* Reads the URL, which on this dynamic route must render inside Suspense (Cache Components). */}
          <Suspense fallback={<span className="h-8 w-16" aria-hidden />}>
            <LocaleSwitcher />
          </Suspense>
          <ThemeToggle />
        </span>
      </header>
      <main className="grid flex-1 place-items-center py-10">
        <div className="flex w-full max-w-5xl justify-center">
          <Suspense fallback={<div className="h-40 animate-pulse rounded-card bg-surface-2" aria-hidden />}>
            <TrackContent params={params} />
          </Suspense>
        </div>
      </main>
    </div>
  );
}

async function TrackContent({ params }: { params: Promise<{ token: string }> }) {
  const [{ token }, t] = await Promise.all([params, getTranslations("track")]);
  const result = await kleverRequest<SharedLocationByTokenResult>(SHARED_LOCATION_BY_TOKEN, { shareToken: token });
  const link = result.ok ? result.data.sharedLiveLocationByToken : null;

  if (!result.ok) {
    return (
      <Panel icon={<MapPinOff className="size-6" />} title={t("unavailableTitle")}>
        {t("unavailable")}
      </Panel>
    );
  }
  if (!link) {
    return (
      <Panel icon={<LinkIcon className="size-6" />} title={t("invalidTitle")}>
        {t("invalid")}
      </Panel>
    );
  }
  return (
    <>
      <h1 className="sr-only">{t("title")}</h1>
      <PublicTrackView token={token} initial={link} />
    </>
  );
}

function Panel({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="grid w-full max-w-md gap-3 rounded-card border border-border bg-surface p-6 text-center">
      <span className="mx-auto grid size-12 place-items-center rounded-full bg-primary-soft text-primary">{icon}</span>
      <h1 className="text-lg font-semibold">{title}</h1>
      <div className="grid gap-3 text-sm text-muted-foreground">{children}</div>
    </section>
  );
}
