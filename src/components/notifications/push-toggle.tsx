"use client";

import { BellOff, BellRing, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { currentPushState, disablePush, enablePush, type PushState } from "@/lib/notifications/push";
import { cn } from "@/lib/utils";

/**
 * On/off switch for browser push on this device. Reads the state on mount without prompting;
 * the permission prompt appears only when the user turns it on.
 */
export function PushToggle() {
  const t = useTranslations("notifications.push");
  const [state, setState] = useState<PushState | "loading">("loading");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    currentPushState()
      .then((s) => !cancelled && setState(s))
      .catch(() => !cancelled && setState("off"));
    return () => {
      cancelled = true;
    };
  }, []);

  const on = state === "on";
  const disabled = busy || state === "loading" || state === "unsupported" || state === "denied" || state === "backend";

  const toggle = async () => {
    setBusy(true);
    setFailed(false);
    try {
      setState(on ? await disablePush() : await enablePush());
    } catch (err) {
      console.warn("[push] toggle failed", err);
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const note =
    state === "unsupported"
      ? t("unsupported")
      : state === "denied"
        ? t("denied")
        : state === "backend"
          ? t("backend")
          : on
            ? t("onHint")
            : t("offHint");

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={cn(
              "grid size-10 shrink-0 place-items-center rounded-xl [&_svg]:size-5",
              on ? "bg-primary-soft text-primary" : "bg-surface-2 text-muted-foreground",
            )}
          >
            {on ? <BellRing aria-hidden /> : <BellOff aria-hidden />}
          </span>
          <div className="grid min-w-0 gap-0.5">
            <span className="text-sm font-semibold">{t("label")}</span>
            <span className="text-xs text-muted-foreground">
              {busy || state === "loading" ? t("working") : on ? t("stateOn") : t("stateOff")}
            </span>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={t("label")}
          disabled={disabled}
          onClick={() => void toggle()}
          className={cn(
            "relative h-7 w-13 shrink-0 rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50",
            on ? "bg-primary" : "bg-border-strong",
          )}
        >
          <span
            className={cn(
              "absolute top-1 grid size-5 place-items-center rounded-full bg-white shadow transition-all",
              on ? "start-7" : "start-1",
            )}
            aria-hidden
          >
            {busy ? <Loader2 className="size-3 animate-spin text-muted-foreground" /> : null}
          </span>
        </button>
      </div>
      <p className="text-sm text-muted-foreground">{note}</p>
      {failed ? <Alert tone="error">{t("failed")}</Alert> : null}
    </div>
  );
}
