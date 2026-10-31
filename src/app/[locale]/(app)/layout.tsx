import { useTranslations } from "next-intl";
import { Suspense } from "react";
import { Brand } from "@/components/brand";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { TopNav } from "@/components/shell/top-nav";
import { UserMenu, UserMenuSkeleton } from "@/components/shell/user-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { Link } from "@/i18n/navigation";

export default function AppLayout({ children }: LayoutProps<"/[locale]">) {
  const t = useTranslations("shell");

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:start-3 focus:top-3 focus:z-50 focus:rounded-ctl focus:bg-surface focus:px-3 focus:py-2 focus:shadow-panel"
      >
        {t("skipToContent")}
      </a>
      <header className="sticky top-0 z-20 border-b border-border/70 bg-surface/80 backdrop-blur-xl">
        <div className="flex h-16 items-center gap-3 px-4 sm:px-6 xl:gap-6">
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
            <Suspense fallback={<UserMenuSkeleton />}>
              <UserMenu />
            </Suspense>
          </div>
        </div>
      </header>
      <main id="main" className="flex-1 px-4 py-6 sm:px-6">
        {children}
      </main>
    </div>
  );
}
