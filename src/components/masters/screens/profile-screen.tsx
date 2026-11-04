"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Globe, KeyRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState, useSyncExternalStore, type FormEvent } from "react";
import { toast } from "sonner";
import { CHANGE_PASSWORD_HREF } from "@/components/masters/am-modules";
import { FormSection, PageHeader } from "@/components/masters/page-header";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Link } from "@/i18n/navigation";
import { formatInCompanyTz, useCompanyTimeZone } from "@/lib/company-time";
import { gqlRequest } from "@/lib/graphql/client";
import { MY_PROFILE, UPDATE_MY_PROFILE, type MyProfile } from "@/lib/graphql/account-management";
import { useMe } from "@/lib/permissions";
import { serverFieldErrors, useErrorText } from "@/lib/vehicle-management/use-vm";
import { isValidPhone } from "@/lib/vehicle-management/validation";
import {
  allTimeZones,
  COMMON_TIME_ZONES,
  effectiveTimeZone,
  modernTimeZone,
  readTimeZonePreference,
  subscribeTimeZone,
  timeZoneLabel,
  writeTimeZonePreference,
} from "@/lib/time-zone";

type Form = { name: string; mobile: string; address: string };

/** Checks My profile's editable fields; values are message keys (validation.*). */
export function validateProfile(form: Form): Partial<Record<keyof Form, string>> {
  const errors: Partial<Record<keyof Form, string>> = {};
  if (!form.name.trim()) errors.name = "required";
  else if (form.name.trim().length > 255) errors.name = "tooLong";
  if (form.mobile.trim() && !isValidPhone(form.mobile)) errors.mobile = "phone";
  if (form.address.trim().length > 255) errors.address = "tooLong";
  return errors;
}

/** My profile: the signed-in user's own name, mobile and address; email, role and company are read-only. */
export function ProfileScreen() {
  const t = useTranslations("masters.am.profile");
  const tc = useTranslations("masters.common");
  const { data: me } = useMe();
  const profile = useQuery({
    queryKey: ["vm", "am-profile", me?.id],
    queryFn: async () => (await gqlRequest<{ me: MyProfile }>(MY_PROFILE)).me,
    enabled: Boolean(me?.id),
  });
  const errorText = useErrorText();

  return (
    <div className="grid gap-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <Button asChild variant="secondary">
            <Link href={CHANGE_PASSWORD_HREF}>
              <KeyRound />
              {t("changePassword")}
            </Link>
          </Button>
        }
      />
      {profile.error ? (
        <Alert tone="error">{errorText(profile.error)}</Alert>
      ) : !profile.data ? (
        <div className="h-64 animate-pulse rounded-2xl bg-surface-2" aria-busy="true" aria-label={tc("saving")} />
      ) : (
        <>
          <ProfileForm key={profile.data.id} profile={profile.data} />
          <TimeZoneSetting />
        </>
      )}
    </div>
  );
}

function ProfileForm({ profile }: { profile: MyProfile }) {
  const t = useTranslations("masters.am.profile");
  const tc = useTranslations("masters.common");
  const { data: me } = useMe();
  const zone = useCompanyTimeZone();
  const queryClient = useQueryClient();
  const errorText = useErrorText();
  const initial: Form = { name: profile.name, mobile: profile.mobile ?? "", address: profile.address ?? "" };
  const [form, setForm] = useState<Form>(initial);
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const dirty = form.name !== initial.name || form.mobile !== initial.mobile || form.address !== initial.address;

  const set = (key: keyof Form, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const found = validateProfile(form);
    setErrors(found);
    setFailure(null);
    if (Object.keys(found).length) return;
    setPending(true);
    try {
      await gqlRequest(UPDATE_MY_PROFILE, {
        name: form.name.trim(),
        // An emptied optional field is cleared with an explicit null (API Doc §6 conventions).
        mobile: form.mobile.trim() || null,
        address: form.address.trim() || null,
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["vm", "am-profile"] }),
        queryClient.invalidateQueries({ queryKey: ["me"] }),
      ]);
      toast.success(tc("saved"));
    } catch (err) {
      setErrors(serverFieldErrors(err) ?? {});
      setFailure(errorText(err));
    } finally {
      setPending(false);
    }
  };

  const readOnly: Array<[string, string]> = [
    [t("email"), profile.email],
    [t("username"), profile.username],
    [t("role"), me?.roles?.join(", ") || "—"],
    [t("company"), me?.company?.name ?? t("platform")],
    [t("timeZone"), timeZoneLabel(zone)],
    [t("lastLogin"), formatInCompanyTz(profile.lastLoginAt, zone)],
  ];

  return (
    <form onSubmit={submit} className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" noValidate>
      <div className="rounded-2xl border border-border/70 bg-surface shadow-sm p-6">
        <FormSection title={t("editable")} columns={1}>
          <div className="grid gap-4">
            <Field id="p-name" label={`${t("name")} *`} error={errors.name}>
              <Input
                id="p-name"
                value={form.name}
                maxLength={255}
                onChange={(e) => set("name", e.target.value)}
                autoComplete="name"
              />
            </Field>
            <Field id="p-mobile" label={t("mobile")} error={errors.mobile}>
              <Input
                id="p-mobile"
                value={form.mobile}
                onChange={(e) => set("mobile", e.target.value)}
                dir="ltr"
                inputMode="tel"
                autoComplete="tel"
              />
            </Field>
            <Field id="p-address" label={t("address")} error={errors.address}>
              <Input
                id="p-address"
                value={form.address}
                maxLength={255}
                onChange={(e) => set("address", e.target.value)}
                autoComplete="street-address"
              />
            </Field>
            {failure ? <Alert tone="error">{failure}</Alert> : null}
            <div className="flex gap-2">
              <Button type="submit" disabled={pending || !dirty}>
                {pending ? tc("saving") : tc("save")}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={pending || !dirty}
                onClick={() => (setForm(initial), setErrors({}), setFailure(null))}
              >
                {tc("cancel")}
              </Button>
            </div>
          </div>
        </FormSection>
      </div>
      <div className="rounded-2xl border border-border/70 bg-surface shadow-sm p-6">
        <FormSection title={t("account")} columns={1}>
          <dl className="grid gap-3 text-[13px] sm:grid-cols-[minmax(120px,auto)_1fr]">
            {readOnly.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="font-medium break-words" dir="auto">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-muted-foreground">{t("readOnlyHint")}</p>
        </FormSection>
      </div>
    </form>
  );
}

/**
 * Personal display time zone: every time in the app (tracking, history, logs) is shown in it.
 * Saved per user in this browser (the API has no per-user time zone yet); "company" follows the
 * company's zone, which an administrator sets under Accounts.
 */
function TimeZoneSetting() {
  const t = useTranslations("masters.am.profile");
  const { data: me } = useMe();
  const userId = me?.id ?? "";
  const pref = useSyncExternalStore(
    subscribeTimeZone,
    () => (userId ? readTimeZonePreference(userId) : "company"),
    () => "company",
  );
  const companyZone = me?.company?.timezone ?? null;
  const active = effectiveTimeZone(pref, companyZone);
  const zones = useMemo(() => allTimeZones(), []);
  const isCompanyAdmin = Boolean(me?.companyId) && Boolean(me?.permissions.includes("core.edit"));

  const change = (value: string) => {
    if (!userId) return;
    writeTimeZonePreference(userId, value);
    toast.success(t("timeZoneSaved", { zone: effectiveTimeZone(value, companyZone) }));
  };

  return (
    <section className="rounded-2xl border border-border/70 bg-surface shadow-sm p-6" aria-labelledby="tz-title">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="grid content-start gap-1.5">
          <h2 id="tz-title" className="flex items-center gap-2 text-sm font-semibold">
            <Globe className="size-4 text-primary" aria-hidden />
            {t("timeZoneTitle")}
          </h2>
          <p className="text-[13px] text-muted-foreground">{t("timeZoneHint")}</p>
          <p className="text-[13px]">
            {t("timeZoneNow")}{" "}
            <span className="font-semibold" dir="ltr">
              {timeZoneLabel(active)}
            </span>
          </p>
        </div>
        <div className="grid content-start gap-3">
          <Field id="p-timezone" label={t("timeZone")}>
            <Select
              id="p-timezone"
              value={pref === "company" ? pref : modernTimeZone(pref)}
              onChange={(e) => change(e.target.value)}
              disabled={!userId}
            >
              <option value="company">
                {companyZone ? t("timeZoneCompany", { zone: timeZoneLabel(companyZone) }) : t("timeZoneDefault")}
              </option>
              <optgroup label={t("timeZoneCommon")}>
                {COMMON_TIME_ZONES.filter((z) => zones.includes(z)).map((z) => (
                  <option key={`c-${z}`} value={z}>
                    {timeZoneLabel(z)}
                  </option>
                ))}
              </optgroup>
              <optgroup label={t("timeZoneAll")}>
                {zones.map((z) => (
                  <option key={z} value={z}>
                    {timeZoneLabel(z)}
                  </option>
                ))}
              </optgroup>
            </Select>
          </Field>
          <p className="text-xs text-muted-foreground">
            {t("timeZoneBrowser")}
            {isCompanyAdmin ? (
              <>
                {" "}
                <Link href="/accounts" className="font-semibold text-primary hover:underline">
                  {t("timeZoneCompanyLink")}
                </Link>
              </>
            ) : null}
          </p>
        </div>
      </div>
    </section>
  );
}
