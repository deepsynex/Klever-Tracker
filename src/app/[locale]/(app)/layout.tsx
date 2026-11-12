import { useTranslations } from "next-intl";
import { Suspense } from "react";
import { Brand } from "@/components/brand";
import { RouteGuard } from "@/components/shell/route-guard";
import { TimeZoneSync } from "@/components/shell/time-zone-sync";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { NotificationsRealtime } from "@/components/notifications/notifications-realtime";
import { PushHeal } from "@/components/notifications/push-heal";
import { TopNav } from "@/components/shell/top-nav";
import { UserMenu, UserMenuSkeleton } from "@/components/shell/user-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { Link } from "@/i18n/navigation";

export default function AppLayout({ children }: LayoutProps<"/[locale]">) {
  const t = useTranslations("shell");

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Exactly 4rem tall including the border: the full-screen map pages size themselves as 100dvh - 4rem. */}
      <header className="sticky top-0 z-20 h-16 border-b border-border/70 bg-surface/80 backdrop-blur-xl">
        <div className="flex h-full items-center gap-3 px-4 sm:px-6 xl:gap-6">
          <Link href="/dashboard" className="shrink-0 rounded-lg">
            <Brand subtitle={t("tagline")} />
          </Link>
          <div className="flex min-w-0 flex-1 items-center xl:justify-center">
            <TopNav />
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <span className="hidden sm:block">
              <LocaleSwitcher />
            </span>
            <ThemeToggle />
            <NotificationBell />
            <Suspense fallback={<UserMenuSkeleton />}>
              <UserMenu />
            </Suspense>
          </div>
        </div>
      </header>
      {/* Live notification socket and toasts, once for the whole signed-in app. */}
      <NotificationsRealtime />
      <PushHeal />
      <main id="main" className="flex-1 px-4 py-6 sm:px-6">
        <TimeZoneSync>
          <RouteGuard>{children}</RouteGuard>
        </TimeZoneSync>
      </main>
    </div>
  );
}
