import { LogOut } from "lucide-react";
import { locale as rootLocale } from "next/root-params";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { logoutAction } from "@/lib/auth/actions";
import { getSessionUser } from "@/lib/session";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

/** Reads the session cookie, so it must render inside <Suspense>. */
export async function UserMenu() {
  const [user, locale, t] = await Promise.all([getSessionUser(), rootLocale(), getTranslations("shell")]);

  return (
    <div className="flex items-center gap-2">
      {user ? (
        <span className="flex items-center gap-2" title={t("signedInAs", { email: user.email })}>
          <span className="grid size-8 place-items-center rounded-full bg-primary-soft text-xs font-semibold text-primary">
            {initials(user.name) || "?"}
          </span>
          <span className="hidden max-w-[16ch] truncate text-sm font-medium sm:inline">{user.name}</span>
        </span>
      ) : null}
      <form action={logoutAction}>
        <input type="hidden" name="locale" value={locale} />
        <Button type="submit" variant="ghost" size="sm" aria-label={t("signOut")}>
          <LogOut className="rtl:rotate-180" />
          <span className="hidden md:inline">{t("signOut")}</span>
        </Button>
      </form>
    </div>
  );
}

export function UserMenuSkeleton() {
  return (
    <div className="flex items-center gap-2" aria-hidden>
      <span className="size-8 rounded-full bg-surface-3" />
      <span className="hidden h-3 w-24 rounded bg-surface-3 sm:block" />
    </div>
  );
}
