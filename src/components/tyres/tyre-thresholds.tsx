"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { FormSection } from "@/components/masters/page-header";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { UPDATE_TYRE_SETTINGS } from "@/lib/graphql/tyre-inspections";
import { useTyreSettings } from "@/lib/tyres/use-tyre-api";
import { validateTyreSettings } from "@/lib/tyres/validation";
import { numberOrNull } from "@/lib/vehicle-management/helpers";
import { useErrorText, useVmLookups, useVmMutations, VM_KEY } from "@/lib/vehicle-management/use-vm";

type Form = { treadCriticalMm: string; treadReplaceMm: string; pressureTolerancePct: string };
const FIELDS = ["treadCriticalMm", "treadReplaceMm", "pressureTolerancePct"] as const;

/**
 * Tyre masters → Thresholds: the company's tread depths for "critical" and "needs replacement" and
 * the pressure tolerance. They set the conditions of new inspections (saved ones keep theirs).
 * Only company admins may change them; the API refuses anyone else.
 */
export function TyreThresholdsTab() {
  const lookups = useVmLookups();
  const settings = useTyreSettings();
  const errorText = useErrorText();

  if (lookups.isPlatform && !lookups.companyId) return <PickCompany />;
  if (settings.isPending) return <div className="h-48 animate-pulse rounded-2xl bg-surface-2" />;
  if (settings.error || !settings.data) {
    return <Alert tone="error">{settings.error ? errorText(settings.error) : null}</Alert>;
  }
  // Keyed by the loaded values, so the form starts again from them after a save or a company switch.
  const s = settings.data;
  return (
    <ThresholdsForm
      key={`${s.companyId}:${s.treadCriticalMm}:${s.treadReplaceMm}:${s.pressureTolerancePct}`}
      saved={{
        treadCriticalMm: String(s.treadCriticalMm),
        treadReplaceMm: String(s.treadReplaceMm),
        pressureTolerancePct: String(s.pressureTolerancePct),
      }}
      companyId={settings.companyId}
    />
  );
}

function PickCompany() {
  const t = useTranslations("masters.tyres.masters.thresholds");
  return <Alert tone="info">{t("pickCompany")}</Alert>;
}

function ThresholdsForm({ saved, companyId }: { saved: Form; companyId: string | null }) {
  const t = useTranslations("masters.tyres.masters.thresholds");
  const tc = useTranslations("masters.common");
  const lookups = useVmLookups();
  const qc = useQueryClient();
  const { run, failInto } = useVmMutations();
  const [form, setForm] = useState<Form>(saved);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const canEdit = lookups.allow("tyres", "edit");
  const dirty = FIELDS.some((k) => form[k] !== saved[k]);

  const save = async () => {
    const found = validateTyreSettings(form);
    setErrors(found);
    if (Object.keys(found).length) return;
    setPending(true);
    try {
      await run(UPDATE_TYRE_SETTINGS, {
        companyId,
        treadCriticalMm: numberOrNull(form.treadCriticalMm),
        treadReplaceMm: numberOrNull(form.treadReplaceMm),
        pressureTolerancePct: numberOrNull(form.pressureTolerancePct),
      });
      await qc.invalidateQueries({ queryKey: [VM_KEY, "tyreSettings"] });
      toast.success(tc("saved"));
    } catch (err) {
      failInto(err, setErrors);
    } finally {
      setPending(false);
    }
  };

  return (
    <form
      className="grid gap-5 rounded-2xl border border-border/70 bg-surface p-5"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <FormSection title={t("title")} description={t("description")}>
        {FIELDS.map((key) => (
          <Field key={key} id={`th-${key}`} label={`${t(`f.${key}`)} *`} hint={t(`hint.${key}`)} error={errors[key]}>
            <Input
              id={`th-${key}`}
              type="number"
              inputMode="decimal"
              step="any"
              min={0}
              value={form[key]}
              disabled={!canEdit}
              onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
              aria-invalid={errors[key] ? true : undefined}
            />
          </Field>
        ))}
      </FormSection>
      <p className="text-xs text-muted-foreground">{t("note")}</p>
      {canEdit ? (
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={!dirty || pending}
            onClick={() => {
              setForm(saved);
              setErrors({});
            }}
          >
            {tc("cancel")}
          </Button>
          <Button type="submit" disabled={!dirty || pending}>
            {pending ? tc("saving") : tc("save")}
          </Button>
        </div>
      ) : null}
    </form>
  );
}
