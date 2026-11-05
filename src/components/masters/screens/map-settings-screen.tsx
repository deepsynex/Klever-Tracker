"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, Globe2, Map as MapIcon, Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { PageHeader, StatusBadge } from "@/components/masters/page-header";
import { SuperAdminOnly } from "@/components/masters/vm-nav";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { gqlRequest } from "@/lib/graphql/client";
import {
  envMapSettings,
  isMissingFromApi,
  PLATFORM_SETTINGS_KEY,
  UPDATE_PLATFORM_SETTINGS,
  usePlatformSettingsQuery,
  type MapProvider,
  type StoredMapSettings,
} from "@/lib/map-settings";
import { useErrorText } from "@/lib/vehicle-management/use-vm";
import { cn } from "@/lib/utils";

const CARD = "rounded-2xl border border-border/70 bg-surface p-6 shadow-sm";

/** Google's key and Map ID come from the deployment's env, so only these two are edited here. */
type Form = { mapProvider: MapProvider; maptilerApiKey: string };

/** Map settings (super admins): which base map the whole platform uses, and its keys. */
export function MapSettingsScreen() {
  return (
    <SuperAdminOnly>
      <MapSettingsContent />
    </SuperAdminOnly>
  );
}

function MapSettingsContent() {
  const t = useTranslations("masters.am.mapSettings");
  const settings = usePlatformSettingsQuery();
  const errorText = useErrorText();
  const apiMissing = settings.isError && isMissingFromApi(settings.error);

  return (
    <div className="grid gap-6">
      <PageHeader title={t("title")} description={t("description")} />
      {apiMissing ? (
        <Alert tone="warning">{t("backendMissing")}</Alert>
      ) : settings.isError ? (
        <Alert tone="error">{errorText(settings.error)}</Alert>
      ) : null}
      {settings.isPending ? (
        <div className="h-72 animate-pulse rounded-2xl bg-surface-2" aria-busy="true" />
      ) : (
        <MapSettingsForm
          // A fresh form once the stored values arrive (or the fallback when the API lacks them).
          key={settings.dataUpdatedAt}
          stored={settings.data ?? null}
          readOnly={settings.isError}
        />
      )}
    </div>
  );
}

function MapSettingsForm({ stored, readOnly }: { stored: StoredMapSettings | null; readOnly: boolean }) {
  const t = useTranslations("masters.am.mapSettings");
  const tc = useTranslations("masters.common");
  const queryClient = useQueryClient();
  const errorText = useErrorText();
  const env = envMapSettings();
  const initial: Form = {
    mapProvider: stored?.mapProvider === "osm" ? "osm" : "google",
    maptilerApiKey: stored?.maptilerApiKey ?? "",
  };
  const [form, setForm] = useState<Form>(initial);
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const dirty = (Object.keys(initial) as Array<keyof Form>).some((k) => form[k] !== initial[k]);
  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const found: Partial<Record<keyof Form, string>> = {};
    // OpenStreetMap needs a MapTiler key; Google uses the deployment's key.
    if (form.mapProvider === "osm" && !form.maptilerApiKey.trim()) found.maptilerApiKey = "required";
    setErrors(found);
    setFailure(null);
    if (Object.keys(found).length) return;
    setPending(true);
    try {
      await gqlRequest(UPDATE_PLATFORM_SETTINGS, {
        mapProvider: form.mapProvider,
        // An emptied key is cleared with null.
        maptilerApiKey: form.maptilerApiKey.trim() || null,
      });
      await queryClient.invalidateQueries({ queryKey: PLATFORM_SETTINGS_KEY });
      toast.success(t("saved"));
    } catch (err) {
      setFailure(errorText(err));
    } finally {
      setPending(false);
    }
  };

  const osm = form.mapProvider === "osm";

  return (
    <form onSubmit={submit} className="grid gap-6" noValidate>
      <fieldset disabled={readOnly || pending} className="grid gap-6">
        <section className={CARD}>
          <h2 className="text-base font-semibold">{t("providerTitle")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("providerHint")}</p>

          {/* The toggle: Google Maps ⇄ OpenStreetMap. */}
          <div className="mt-5 flex flex-wrap items-center gap-4">
            <span className={cn("flex items-center gap-2 text-sm font-semibold", !osm ? "text-foreground" : "text-muted-foreground")}>
              <MapIcon className="size-4" aria-hidden />
              {t("google")}
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={osm}
              aria-label={t("switchLabel")}
              onClick={() => set("mapProvider", osm ? "google" : "osm")}
              className={cn(
                "relative h-7 w-13 shrink-0 rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50",
                osm ? "bg-primary" : "bg-border-strong",
              )}
            >
              <span
                className={cn(
                  "absolute top-1 size-5 rounded-full bg-white shadow transition-all",
                  osm ? "start-7" : "start-1",
                )}
                aria-hidden
              />
            </button>
            <span className={cn("flex items-center gap-2 text-sm font-semibold", osm ? "text-foreground" : "text-muted-foreground")}>
              <Globe2 className="size-4" aria-hidden />
              {t("osm")}
            </span>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">{osm ? t("osmActive") : t("googleActive")}</p>
        </section>

        <section className={cn(CARD, !osm && "ring-2 ring-primary/30")}>
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <MapIcon className="size-4 text-primary" aria-hidden />
            {t("google")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("googleEnvHint")}</p>
          <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            <div className="flex items-center gap-2">
              <dt className="text-muted-foreground">{t("googleKey")}:</dt>
              <dd>
                {env.googleMapsApiKey ? (
                  <StatusBadge tone="ok">{t("configured")}</StatusBadge>
                ) : (
                  <StatusBadge tone="bad">{t("notConfigured")}</StatusBadge>
                )}
              </dd>
            </div>
            <div className="flex items-center gap-2">
              <dt className="text-muted-foreground">{t("googleMapId")}:</dt>
              <dd>
                {env.googleMapsMapId ? (
                  <StatusBadge tone="ok">{t("configured")}</StatusBadge>
                ) : (
                  <StatusBadge tone="muted">{t("demoMapId")}</StatusBadge>
                )}
              </dd>
            </div>
          </dl>
        </section>

        <section className={cn(CARD, osm && "ring-2 ring-primary/30")}>
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Globe2 className="size-4 text-primary" aria-hidden />
            {t("osm")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("osmHint")}</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field id="ms-maptiler-key" label={t("maptilerKey")} error={errors.maptilerApiKey} hint={t("keyHint")}>
              <SecretInput id="ms-maptiler-key" value={form.maptilerApiKey} onChange={(v) => set("maptilerApiKey", v)} />
            </Field>
          </div>
        </section>
      </fieldset>

      {failure ? <Alert tone="error">{failure}</Alert> : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={readOnly || pending || !dirty} className="h-10 rounded-xl px-4 font-semibold shadow-sm">
          <Save />
          {pending ? tc("saving") : tc("save")}
        </Button>
      </div>
    </form>
  );
}

/** A key field: hidden like a password until "Show" is pressed. */
function SecretInput({ id, value, onChange }: { id: string; value: string; onChange: (value: string) => void }): ReactNode {
  const t = useTranslations("masters.am.mapSettings");
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={shown ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
        spellCheck={false}
        className="pe-10 font-mono"
        dir="ltr"
      />
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        aria-label={shown ? t("hideKey") : t("showKey")}
        title={shown ? t("hideKey") : t("showKey")}
        className="absolute end-1 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-surface-2 hover:text-foreground"
      >
        {shown ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}
