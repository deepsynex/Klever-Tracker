"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ConfirmDelete } from "@/components/masters/confirm-delete";
import { DataTable } from "@/components/masters/data-table";
import { isDirty, useDiscardGuard } from "@/components/masters/discard-guard";
import { FormSection, PageHeader, StatusBadge } from "@/components/masters/page-header";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import { BEHAVIOUR_WEIGHTS, behaviourFormToVariables, behaviourToForm, type BehaviourForm } from "@/lib/account-management/forms";
import { validateBehaviour } from "@/lib/account-management/validation";
import {
  BEHAVIOUR_SETTINGS,
  CREATE_BEHAVIOUR_SETTING,
  DELETE_BEHAVIOUR_SETTING,
  UPDATE_BEHAVIOUR_SETTING,
  type BehaviourSettingsResult,
  type DriverBehaviourSetting,
} from "@/lib/graphql/account-management";
import { numberOrNull, numText } from "@/lib/vehicle-management/helpers";
import { useErrorText, useVmLookups, useVmMutations, useVmQuery } from "@/lib/vehicle-management/use-vm";

/** 6. Driver Behaviour Settings: one scoring setup per company. */
export function DriverBehaviourScreen() {
  const t = useTranslations("masters.am.driverBehaviour");
  const tc = useTranslations("masters.common");
  const lookups = useVmLookups();
  const list = useVmQuery<BehaviourSettingsResult>("am-behaviour", BEHAVIOUR_SETTINGS);
  const { run, refresh } = useVmMutations();
  const errorText = useErrorText();
  const [editing, setEditing] = useState<DriverBehaviourSetting | "new" | null>(null);
  const [deleting, setDeleting] = useState<DriverBehaviourSetting | null>(null);
  const all = list.data?.driverBehaviourSettings.data;
  const rows = useMemo(() => (all ?? []).filter((s) => lookups.inScope(s.companyId)), [all, lookups]);
  const hasOwn = (all ?? []).some((s) => s.companyId === lookups.companyId);

  const onOff = (on: boolean) => <StatusBadge tone={on ? "ok" : "muted"}>{on ? t("on") : t("off")}</StatusBadge>;
  const weight = (s: DriverBehaviourSetting, w: (typeof BEHAVIOUR_WEIGHTS)[number]) =>
    s.userCustomizedScore ? `${numText(s[w]) || "0"}%` : <span className="text-subtle">{t("default")}</span>;

  return (
    <div className="grid gap-4">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <Button onClick={() => setEditing("new")} disabled={!lookups.allow("other", "add") || !list.isSuccess || hasOwn} title={hasOwn ? t("oneOnly") : undefined}>
            <Plus />
            {t("add")}
          </Button>
        }
      />
      <DataTable
        caption={t("title")}
        rows={rows}
        loading={list.isPending}
        error={list.error ? errorText(list.error) : null}
        emptyText={lookups.allow("other", "add") ? t("emptyAdd") : t("empty")}
        onEdit={lookups.allow("other", "edit") ? setEditing : undefined}
        onDelete={lookups.allow("other", "delete") ? setDeleting : undefined}
        columns={[
          { key: "account", header: t("account"), cell: (s) => <span className="font-medium">{lookups.companyName(s.companyId)}</span> },
          { key: "minMileage", header: t("f.minimumMileageKm"), numeric: true, cell: (s) => numText(s.minimumMileageKm) || "—" },
          { key: "topScore", header: t("f.topScore"), numeric: true, cell: (s) => s.topScore },
          { key: "absolute", header: t("f.displayAbsoluteValue"), cell: (s) => onOff(s.displayAbsoluteValue) },
          { key: "custom", header: t("f.userCustomizedScore"), cell: (s) => onOff(s.userCustomizedScore) },
          ...BEHAVIOUR_WEIGHTS.map((w) => ({ key: w, header: t(`weights.${w}`), numeric: true, cell: (s: DriverBehaviourSetting) => weight(s, w) })),
        ]}
      />

      {editing !== null ? <BehaviourSheet setting={editing === "new" ? null : editing} onClose={() => setEditing(null)} /> : null}

      <ConfirmDelete
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        name={deleting ? lookups.companyName(deleting.companyId) : ""}
        onConfirm={async () => {
          if (!deleting) return;
          await run(DELETE_BEHAVIOUR_SETTING, { id: deleting.id });
          await refresh();
          toast.success(tc("deleted"));
        }}
      />
    </div>
  );
}

function BehaviourSheet({ setting, onClose }: { setting: DriverBehaviourSetting | null; onClose: () => void }) {
  const t = useTranslations("masters.am.driverBehaviour");
  const tc = useTranslations("masters.common");
  const lookups = useVmLookups();
  const { run, refresh, failInto } = useVmMutations();
  const savedRef = useRef<Record<string, unknown> | null>(setting ? behaviourFormToVariables(behaviourToForm(setting)) : null);
  const [form, setForm] = useState<BehaviourForm>(() => behaviourToForm(setting));
  const [initial] = useState(form);
  const guard = useDiscardGuard(isDirty(form, initial), onClose);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const set = <K extends keyof BehaviourForm>(key: K, value: BehaviourForm[K]) => setForm((f) => ({ ...f, [key]: value }));
  const total = BEHAVIOUR_WEIGHTS.reduce((sum, w) => sum + (numberOrNull(form[w]) ?? 0), 0);

  const save = async () => {
    const found = validateBehaviour(form);
    setErrors(found);
    if (Object.keys(found).length) return;
    setPending(true);
    try {
      const vars = behaviourFormToVariables(form);
      if (setting) await run(UPDATE_BEHAVIOUR_SETTING, { id: setting.id, ...vars }, { previous: savedRef.current });
      else await run(CREATE_BEHAVIOUR_SETTING, { companyId: lookups.companyId, ...vars });
      await refresh();
      toast.success(tc("saved"));
      onClose();
    } catch (err) {
      failInto(err, setErrors);
    } finally {
      setPending(false);
    }
  };

  return (
    <Sheet
      open
      onOpenChange={(open) => !open && guard.requestClose()}
      size="lg"
      title={setting ? t("editTitle", { name: lookups.companyName(setting.companyId) }) : t("add")}
      footer={
        <>
          <Button variant="secondary" onClick={guard.requestClose}>
            {tc("cancel")}
          </Button>
          <Button onClick={save} disabled={pending}>
            {pending ? tc("saving") : tc("save")}
          </Button>
        </>
      }
    >
      <form
        className="grid gap-5"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <FormSection title={t("sections.scoring")}>
          <Field id="b-min" label={t("f.minimumMileageKm")} error={errors.minimumMileageKm} hint={t("minMileageHint")}>
            <Input id="b-min" type="number" step="any" inputMode="decimal" value={form.minimumMileageKm} onChange={(e) => set("minimumMileageKm", e.target.value)} />
          </Field>
          <Field id="b-top" label={`${t("f.topScore")} *`} error={errors.topScore} hint={t("topScoreHint")}>
            <Input id="b-top" type="number" step={1} inputMode="numeric" value={form.topScore} onChange={(e) => set("topScore", e.target.value)} />
          </Field>
          <Checkbox label={t("f.displayAbsoluteValue")} checked={form.displayAbsoluteValue} onChange={(e) => set("displayAbsoluteValue", e.target.checked)} />
          <Checkbox label={t("f.userCustomizedScore")} checked={form.userCustomizedScore} onChange={(e) => set("userCustomizedScore", e.target.checked)} />
        </FormSection>

        {form.userCustomizedScore ? (
          <FormSection title={t("sections.weights")} description={t("weightsHint", { total: Math.round(total * 100) / 100 })} columns={1}>
            {BEHAVIOUR_WEIGHTS.map((w) => (
              <Field key={w} id={`b-${w}`} label={t(`weights.${w}`)} error={errors[w]}>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={numberOrNull(form[w]) ?? 0}
                    onChange={(e) => set(w, e.target.value)}
                    className="min-w-0 flex-1 accent-primary"
                    aria-label={t(`weights.${w}`)}
                  />
                  <div className="flex w-24 items-center gap-1">
                    <Input id={`b-${w}`} type="number" min={0} max={100} step="any" inputMode="decimal" value={form[w]} onChange={(e) => set(w, e.target.value)} className="h-8" />
                    <span className="text-xs text-subtle">%</span>
                  </div>
                </div>
              </Field>
            ))}
            {errors.weightsTotal ? (
              <p className="text-xs text-destructive" role="alert">
                {t("weightsTotalError", { total: Math.round(total * 100) / 100 })}
              </p>
            ) : null}
          </FormSection>
        ) : (
          <p className="text-[13px] text-muted-foreground">{t("defaultsHint")}</p>
        )}
        <button type="submit" hidden />
      </form>
      {guard.dialog}
    </Sheet>
  );
}
