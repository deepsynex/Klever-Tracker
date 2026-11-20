"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ConfirmDelete } from "@/components/masters/confirm-delete";
import { isDirty, useDiscardGuard } from "@/components/masters/discard-guard";
import { FormSection, StatusBadge } from "@/components/masters/page-header";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Sheet } from "@/components/ui/sheet";
import {
  CREATE_AXLE_CONFIGURATION,
  DELETE_AXLE_CONFIGURATION,
  UPDATE_AXLE_CONFIGURATION,
  type AxleConfiguration,
} from "@/lib/graphql/tyres";
import {
  AXLE_KINDS,
  axlesFromPositions,
  buildPositions,
  MAX_AXLES,
  MAX_CONFIG_SPARES,
  suggestCode,
  validateAxleConfiguration,
  type AxleSpec,
} from "@/lib/tyres/axle-builder";
import { spareCodes } from "@/lib/tyres/axle-layout";
import { AXLE_KEY, useAxleApi, useAxleConfigurations } from "@/lib/tyres/use-tyres";
import { useVmLookups, useVmMutations } from "@/lib/vehicle-management/use-vm";
import { AxleDiagram } from "./axle-diagram";
import { useTyreLabels } from "./tyre-labels";

/** Whether the user may add / edit / delete the company's own axle layouts right now. */
function useAxleRights() {
  const api = useAxleApi();
  const lookups = useVmLookups();
  return {
    api,
    add: api.own && lookups.allow("tyres", "add"),
    edit: api.own && lookups.allow("tyres", "edit"),
    remove: api.own && lookups.allow("tyres", "delete"),
  };
}

/**
 * Customer vehicles → Axle configurations: the standard layouts (read-only) and the company's own,
 * which it can add, edit and delete. A layout a vehicle uses keeps its axles and can't be deleted.
 */
export function AxleConfigurationsSheet({ onClose }: { onClose: () => void }) {
  const t = useTranslations("masters.tyres.axleConfigs");
  const labels = useTyreLabels();
  const axles = useAxleConfigurations();
  const rights = useAxleRights();
  const { run } = useVmMutations();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<AxleConfiguration | "new" | null>(null);
  const [deleting, setDeleting] = useState<AxleConfiguration | null>(null);
  const rows = [...(axles.data ?? [])].sort(
    (a, b) => Number(Boolean(a.companyId)) - Number(Boolean(b.companyId)) || a.code.localeCompare(b.code),
  );

  return (
    <Sheet
      open
      onOpenChange={(open) => !open && onClose()}
      size="lg"
      title={t("title")}
      description={t("description")}
      footer={
        <Button onClick={() => setEditing("new")} disabled={!rights.add}>
          <Plus />
          {t("add")}
        </Button>
      }
    >
      <div className="grid gap-4">
        {!rights.api.isPending && !rights.api.own ? <Alert tone="info">{t("notYet")}</Alert> : null}
        <div className="overflow-x-auto rounded-xl border border-border/70">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-start font-semibold">{t("cols.name")}</th>
                <th className="px-3 py-2 text-start font-semibold">{t("cols.code")}</th>
                <th className="px-3 py-2 text-end font-semibold">{t("cols.axles")}</th>
                <th className="px-3 py-2 text-end font-semibold">{t("cols.tyres")}</th>
                <th className="px-3 py-2 text-start font-semibold">{t("cols.owner")}</th>
                <th className="px-3 py-2 text-end font-semibold">{t("cols.vehicles")}</th>
                <th className="px-3 py-2" aria-label={t("cols.actions")} />
              </tr>
            </thead>
            <tbody>
              {axles.isPending ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6">
                    <div className="h-6 animate-pulse rounded bg-surface-2" />
                  </td>
                </tr>
              ) : (
                rows.map((a) => {
                  const own = Boolean(a.companyId);
                  const inUse = (a.vehicleCount ?? 0) > 0;
                  return (
                    <tr key={a.id} className="border-t border-border/50">
                      <td className="px-3 py-2 font-medium">{labels.axle(a)}</td>
                      <td className="px-3 py-2 font-mono text-xs" dir="ltr">
                        {a.code}
                      </td>
                      <td className="px-3 py-2 text-end">{new Set(a.positions.map((p) => p.axleNo)).size}</td>
                      <td className="px-3 py-2 text-end">
                        {a.spareCount
                          ? t("tyresWithSpares", { n: a.positions.length, spares: a.spareCount })
                          : a.positions.length}
                      </td>
                      <td className="px-3 py-2">
                        <StatusBadge tone={own ? "ok" : "muted"}>{own ? t("own") : t("standard")}</StatusBadge>
                      </td>
                      <td className="px-3 py-2 text-end">{a.vehicleCount ?? "—"}</td>
                      <td className="px-3 py-2">
                        {own ? (
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label={t("edit", { name: a.name })}
                              disabled={!rights.edit}
                              onClick={() => setEditing(a)}
                            >
                              <Pencil />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label={t("delete", { name: a.name })}
                              title={inUse ? t("inUseDelete") : undefined}
                              disabled={!rights.remove || inUse}
                              onClick={() => setDeleting(a)}
                            >
                              <Trash2 />
                            </Button>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editing !== null ? (
        <AxleConfigurationForm config={editing === "new" ? null : editing} onClose={() => setEditing(null)} />
      ) : null}
      <ConfirmDelete
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        name={deleting ? labels.axle(deleting) : ""}
        permanent
        failHint={t("inUseDelete")}
        onConfirm={async () => {
          if (!deleting) return;
          await run(DELETE_AXLE_CONFIGURATION, { id: deleting.id });
          await qc.invalidateQueries({ queryKey: [AXLE_KEY] });
          toast.success(t("deleted"));
        }}
      />
    </Sheet>
  );
}

/** The "+" next to the vehicle form's axle dropdown: add a layout and pick it. Hidden until the backend has it. */
export function AddAxleConfigurationButton({ onAdded }: { onAdded: (id: string) => void }) {
  const t = useTranslations("masters.tyres.axleConfigs");
  const rights = useAxleRights();
  const [open, setOpen] = useState(false);
  if (!rights.add) return null;
  return (
    <>
      <Button
        type="button"
        variant="secondary"
        className="size-10 shrink-0 p-0"
        aria-label={t("add")}
        title={t("add")}
        onClick={() => setOpen(true)}
      >
        <Plus />
      </Button>
      {open ? (
        <AxleConfigurationForm
          config={null}
          onClose={() => setOpen(false)}
          onSaved={(id) => {
            onAdded(id);
            setOpen(false);
          }}
        />
      ) : null}
    </>
  );
}

type FormValues = { code: string; name: string; spareCount: string };

/** Add or edit one of the company's layouts: its axles (with a live drawing), code, name and spares. */
function AxleConfigurationForm({
  config,
  onClose,
  onSaved,
}: {
  config: AxleConfiguration | null;
  onClose: () => void;
  onSaved?: (id: string) => void;
}) {
  const t = useTranslations("masters.tyres.axleConfigs");
  const tc = useTranslations("masters.common");
  const lookups = useVmLookups();
  const all = useAxleConfigurations();
  const qc = useQueryClient();
  const { run, failInto } = useVmMutations();
  const [savedValues] = useState<FormValues>(() => ({
    code: config?.code ?? "",
    name: config?.name ?? "",
    spareCount: String(config?.spareCount ?? 1),
  }));
  const [values, setValues] = useState(savedValues);
  const [savedAxles] = useState<AxleSpec[]>(() =>
    config
      ? axlesFromPositions(config.positions)
      : [
          { kind: "steer", dual: false },
          { kind: "drive", dual: true },
        ],
  );
  const [axles, setAxles] = useState(savedAxles);
  // The code follows the axles ("6x4") until it's typed by hand.
  const [codeTouched, setCodeTouched] = useState(Boolean(config));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const locked = (config?.vehicleCount ?? 0) > 0;
  const code = codeTouched ? values.code : suggestCode(axles);
  const current = { ...values, code };
  const guard = useDiscardGuard(
    isDirty(current, savedValues) || JSON.stringify(axles) !== JSON.stringify(savedAxles),
    onClose,
  );
  const positions = useMemo(() => buildPositions(axles), [axles]);
  const spares = Number(values.spareCount) || 0;

  const setAxle = (i: number, patch: Partial<AxleSpec>) =>
    setAxles((list) => list.map((a, j) => (j === i ? { ...a, ...patch } : a)));

  const save = async () => {
    const found = validateAxleConfiguration(current, axles, all.data ?? [], config?.id);
    setErrors(found);
    if (Object.keys(found).length) return;
    setPending(true);
    try {
      const vars = { code: code.trim().toLowerCase(), name: values.name.trim(), spareCount: spares, positions };
      const res = config
        ? await run<{ updateAxleConfiguration: { id: string } }>(UPDATE_AXLE_CONFIGURATION, { id: config.id, ...vars })
        : await run<{ createAxleConfiguration: { id: string } }>(CREATE_AXLE_CONFIGURATION, {
            companyId: lookups.companyId,
            ...vars,
          });
      await qc.invalidateQueries({ queryKey: [AXLE_KEY] });
      toast.success(tc("saved"));
      const id = "updateAxleConfiguration" in res ? res.updateAxleConfiguration.id : res.createAxleConfiguration.id;
      if (onSaved) onSaved(id);
      else onClose();
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
      size="xl"
      title={config ? t("editTitle", { name: config.name }) : t("addTitle")}
      description={t("formDescription")}
      footer={
        <>
          <Button variant="secondary" onClick={guard.requestClose}>
            {tc("cancel")}
          </Button>
          <Button onClick={() => void save()} disabled={pending}>
            {pending ? tc("saving") : tc("save")}
          </Button>
        </>
      }
    >
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="grid gap-5">
          <FormSection title={t("sections.layout")} columns={1}>
            {locked ? <Alert tone="info">{t("locked", { n: config?.vehicleCount ?? 0 })}</Alert> : null}
            <Field id="ac-axles" label={t("f.axles")} error={errors.axles}>
              <ol className="grid gap-2" id="ac-axles">
                {axles.map((a, i) => (
                  <li
                    key={i}
                    className="grid grid-cols-[3.5rem_minmax(0,1fr)_minmax(0,1.3fr)_auto] items-center gap-2 rounded-xl border border-border/70 p-2"
                  >
                    <span className="text-xs font-semibold text-muted-foreground">{t("axleN", { n: i + 1 })}</span>
                    <Select
                      aria-label={t("f.kind", { n: i + 1 })}

                      value={a.kind}
                      disabled={locked}
                      onChange={(e) => setAxle(i, { kind: e.target.value as AxleSpec["kind"] })}
                    >
                      {AXLE_KINDS.map((k) => (
                        <option key={k} value={k}>
                          {t(`kinds.${k}`)}
                        </option>
                      ))}
                    </Select>
                    <Select
                      aria-label={t("f.tyres", { n: i + 1 })}

                      value={a.dual ? "2" : "1"}
                      disabled={locked}
                      onChange={(e) => setAxle(i, { dual: e.target.value === "2" })}
                    >
                      <option value="1">{t("single")}</option>
                      <option value="2">{t("dual")}</option>
                    </Select>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"

                      aria-label={t("removeAxle", { n: i + 1 })}
                      disabled={locked || axles.length <= 1}
                      onClick={() => setAxles((list) => list.filter((_, j) => j !== i))}
                    >
                      <Trash2 />
                    </Button>
                  </li>
                ))}
              </ol>
            </Field>
            <div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={locked || axles.length >= MAX_AXLES}
                onClick={() =>
                  setAxles((list) => [
                    ...list,
                    { kind: list.length && list.every((x) => x.kind === "trailer") ? "trailer" : "drive", dual: true },
                  ])
                }
              >
                <Plus />
                {t("addAxle")}
              </Button>
            </div>
          </FormSection>
          <FormSection title={t("sections.details")}>
            <Field id="ac-name" label={`${t("f.name")} *`} error={errors.name} hint={t("f.nameHint")}>
              <Input
                id="ac-name"
                value={values.name}
                onChange={(e) => {
                  setValues((v) => ({ ...v, name: e.target.value }));
                  setErrors((all) => Object.fromEntries(Object.entries(all).filter(([k]) => k !== "name")));
                }}
                aria-invalid={errors.name ? true : undefined}
              />
            </Field>
            <Field id="ac-code" label={`${t("f.code")} *`} error={errors.code} hint={t("f.codeHint")}>
              <Input
                id="ac-code"
                dir="ltr"
                value={code}
                onChange={(e) => {
                  setCodeTouched(true);
                  setValues((v) => ({ ...v, code: e.target.value }));
                  setErrors((all) => Object.fromEntries(Object.entries(all).filter(([k]) => k !== "code")));
                }}
                aria-invalid={errors.code ? true : undefined}
              />
            </Field>
            <Field id="ac-spares" label={t("f.spares")} error={errors.spareCount}>
              <Select
                id="ac-spares"
                value={values.spareCount}
                onChange={(e) => setValues((v) => ({ ...v, spareCount: e.target.value }))}
              >
                {Array.from({ length: MAX_CONFIG_SPARES + 1 }, (_, n) => (
                  <option key={n} value={String(n)}>
                    {n}
                  </option>
                ))}
              </Select>
            </Field>
          </FormSection>
        </div>
        <div className="rounded-2xl border border-border/70 bg-[radial-gradient(circle_at_50%_30%,var(--color-surface)_0%,var(--color-surface-2)_100%)] p-4 lg:sticky lg:top-0">
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            {t("preview", { n: positions.length, spares })}
          </p>
          <AxleDiagram config={{ id: "preview", code, name: values.name, positions }} spares={spareCodes(spares)} />
        </div>
      </div>
      {guard.dialog}
    </Sheet>
  );
}
