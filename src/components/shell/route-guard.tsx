"use client";

import { ShieldOff } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Link, usePathname } from "@/i18n/navigation";
import { can, useMe } from "@/lib/permissions";
import { requiredModule } from "./route-permissions";

/**
 * Shows a "no permission" state instead of the screen when the signed-in role can't view it
 * (e.g. a typed-in or bookmarked URL). The API refuses the data anyway; this keeps the screen
 * from failing in confusing ways. While `me` loads, the screen renders as usual.
 */
export function RouteGuard({ children }: { children: ReactNode }) {
  const t = useTranslations("shell.forbidden");
  const pathname = usePathname();
  const { data: me, isSuccess } = useMe();
  const needed = requiredModule(pathname);

  if (needed && isSuccess && !can(me, needed)) {
    return (
      <div className="mx-auto grid max-w-md justify-items-center gap-3 py-16 text-center" role="alert">
        <span className="grid size-14 place-items-center rounded-2xl bg-idle/15 text-idle">
          <ShieldOff className="size-7" aria-hidden />
        </span>
        <h1 className="text-lg font-bold">{t("title")}</h1>
        <p className="text-[13px] text-muted-foreground">{t("body")}</p>
        <Link href="/dashboard" className="text-[13px] font-semibold text-primary hover:underline">
          {t("back")}
        </Link>
      </div>
    );
  }
  return children;
}
