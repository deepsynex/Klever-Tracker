import { locale as rootLocale } from "next/root-params";
import { getSessionUser } from "@/lib/session";
import { UserDropdown } from "./user-dropdown";

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
  const [user, locale] = await Promise.all([getSessionUser(), rootLocale()]);
  if (!user) return null;
  return <UserDropdown name={user.name} email={user.email} initials={initials(user.name)} locale={locale} />;
}

export function UserMenuSkeleton() {
  return (
    <div className="flex items-center gap-2" aria-hidden>
      <span className="size-9 rounded-full bg-surface-3" />
      <span className="hidden h-3 w-24 rounded bg-surface-3 sm:block" />
    </div>
  );
}
