"use client";

import { ChevronDown, KeyRound, LogOut } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";
import { CHANGE_PASSWORD_HREF } from "@/components/masters/am-modules";
import { Link } from "@/i18n/navigation";
import { logoutAction } from "@/lib/auth/actions";

type Props = { name: string; email: string; initials: string; locale: string };

/** Avatar button with a small menu: change password and sign out. Esc or an outside click closes it. */
export function UserDropdown({ name, email, initials, locale }: Props) {
  const t = useTranslations("shell");
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const item =
    "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-start text-[13px] font-medium text-muted-foreground hover:bg-surface-2 hover:text-foreground [&_svg]:size-4";

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={menuId}
        title={t("signedInAs", { email })}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full py-1 ps-1 pe-2 hover:bg-surface-2"
      >
        <span className="grid size-9 place-items-center rounded-full bg-primary-soft text-xs font-semibold text-primary">
          {initials || "?"}
        </span>
        <span className="hidden max-w-[16ch] truncate text-sm font-semibold sm:inline">{name}</span>
        <ChevronDown className="size-4 text-muted-foreground" aria-hidden />
      </button>
      {open ? (
        <div id={menuId} className="glass-panel absolute end-0 top-full z-30 mt-2 grid w-56 gap-0.5 rounded-xl p-1.5">
          <p className="truncate px-2.5 pb-1.5 pt-1 text-xs text-subtle">{email}</p>
          <Link href={CHANGE_PASSWORD_HREF} className={item} onClick={() => setOpen(false)}>
            <KeyRound aria-hidden />
            {t("changePassword")}
          </Link>
          <form action={logoutAction}>
            <input type="hidden" name="locale" value={locale} />
            <button type="submit" className={item}>
              <LogOut className="rtl:rotate-180" aria-hidden />
              {t("signOut")}
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
