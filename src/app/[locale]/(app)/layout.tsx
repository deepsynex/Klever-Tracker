import { useTranslations } from "next-intl";
import { Suspense } from "react";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { Sidebar } from "@/components/shell/sidebar";
import { UserMenu, UserMenuSkeleton } from "@/components/shell/user-menu";
import { ThemeToggle } from "@/components/theme-toggle";

export default function AppLayout({ children }: LayoutProps<"/[locale]">) {
  const t = useTranslations("shell");

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[232px_minmax(0,1fr)]">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:start-3 focus:top-3 focus:z-50 focus:rounded-ctl focus:bg-surface focus:px-3 focus:py-2 focus:shadow-panel"
      >
        {t("skipToContent")}
      </a>
      <Sidebar />
      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-10 flex items-center justify-end gap-1 border-b border-border bg-background/90 px-4 py-2.5 backdrop-blur sm:px-6">
          <LocaleSwitcher />
          <ThemeToggle />
          <span className="mx-1 h-6 w-px bg-border" aria-hidden />
          <Suspense fallback={<UserMenuSkeleton />}>
            <UserMenu />
          </Suspense>
        </header>
        <main id="main" className="flex-1 px-4 py-6 sm:px-6">
          {children}
        </main>
      </div>
    </div>
  );
}
