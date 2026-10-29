"use client";

import { Plus, Save, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { dateInputValue, intOrNull, numberOrNull, textOrNull } from "@/lib/vehicle-management/helpers";
import { errorLabel, serverFieldErrors, useVmMutations } from "@/lib/vehicle-management/use-vm";
import type { UploadPurpose } from "@/lib/uploads";
import { ConfirmDelete } from "./confirm-delete";
import { FileUpload } from "./file-upload";
import { cn } from "@/lib/utils";

export type ChildField = {
  key: string;
  label: string;
  type: "text" | "number" | "int" | "date" | "select" | "file";
  /** For type "file": what the upload is for (decides allowed types and size). */
  purpose?: UploadPurpose;
  options?: Array<{ value: string; label: string }>;
  required?: boolean;
  /** NOT NULL column with a server default: leave it out (instead of sending null) when empty. */
  omitIfEmpty?: boolean;
  /** Can only be set when the row is created (the update mutation doesn't take it). */
  createOnly?: boolean;
  /** Show the input only when this returns true for the row being edited. */
  visible?: (draft: Record<string, string>) => boolean;
  placeholder?: string;
  className?: string;
};

type Row = { id: string } & Record<string, unknown>;

/** API value → input text; dates (possibly sent as timestamps) become "yyyy-MM-dd". */
function toText(field: ChildField, v: unknown): string {
  if (v === null || v === undefined) return "";
  return field.type === "date" ? dateInputValue(String(v)) : String(v);
}

function toVariable(field: ChildField, value: string) {
  if (field.type === "number") return numberOrNull(value);
  if (field.type === "int") return intOrNull(value);
  return textOrNull(value);
}

/**
 * Editable list of child records (a vehicle's documents, sensors, fuel tanks, ...). Each row
 * saves on its own: new rows call `create`, saved rows `update`, and Delete removes one.
 */
export function ChildRowsEditor({
  rows,
  fields,
  newRow,
  createVariables,
  ops,
  addLabel,
  emptyText,
  title,
  validate,
  readOnly = false,
}: {
  rows: Row[];
  fields: ChildField[];
  /** Default values for a newly added row. */
  newRow: Record<string, string>;
  /** Extra variables for create (e.g. the parent id). */
  createVariables: Record<string, unknown>;
  ops: { create: string; update: string; remove: string };
  addLabel: string;
  emptyText: ReactNode;
  title?: ReactNode;
  /**
   * Checks a row before it saves: field → translation key under `validation.*`. `rowId` is
   * the saved row's id (undefined for a new row), e.g. to skip itself in duplicate checks.
   */
  validate?: (values: Record<string, string>, rowId?: string) => Record<string, string>;
  /** Show the rows without add, save or delete (e.g. a platform account viewing all companies). */
  readOnly?: boolean;
}) {
  const [drafts, setDrafts] = useState<Array<{ key: number; values: Record<string, string> }>>([]);
  const [nextKey, setNextKey] = useState(1);

  return (
    <div className="grid gap-3">
      {title ? <h3 className="text-sm font-semibold">{title}</h3> : null}
      {rows.length === 0 && drafts.length === 0 ? <p className="text-[13px] text-muted-foreground">{emptyText}</p> : null}
      {rows.map((row) => (
        <ChildRow
          key={row.id}
          fields={fields}
          initial={Object.fromEntries(fields.map((f) => [f.key, toText(f, row[f.key])]))}
          rowId={row.id}
          ops={ops}
          createVariables={createVariables}
          validate={validate}
          readOnly={readOnly}
        />
      ))}
      {drafts.map((d) => (
        <ChildRow
          key={`new-${d.key}`}
          fields={fields}
          initial={d.values}
          ops={ops}
          createVariables={createVariables}
          validate={validate}
          onDone={() => setDrafts((all) => all.filter((x) => x.key !== d.key))}
        />
      ))}
      <div hidden={readOnly}>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setDrafts((all) => [...all, { key: nextKey, values: { ...newRow } }]);
            setNextKey((k) => k + 1);
          }}
        >
          <Plus />
          {addLabel}
        </Button>
      </div>
    </div>
  );
}

function ChildRow({
  fields,
  initial,
  rowId,
  ops,
  createVariables,
  validate,
  readOnly = false,
  onDone,
}: {
  fields: ChildField[];
  initial: Record<string, string>;
  rowId?: string;
  ops: { create: string; update: string; remove: string };
  createVariables: Record<string, unknown>;
  validate?: (values: Record<string, string>, rowId?: string) => Record<string, string>;
  readOnly?: boolean;
  /** New rows: called after they are saved or discarded. */
  onDone?: () => void;
}) {
  const t = useTranslations("masters.common");
  const tv = useTranslations("validation");
  const { run, refresh, fail } = useVmMutations();
  const [values, setValues] = useState(initial);
  const [pending, setPending] = useState(false);
  const baseId = useId();
  const isNew = !rowId;
  const dirty = isNew || fields.some((f) => (values[f.key] ?? "") !== (initial[f.key] ?? ""));
  const missing = fields.some((f) => f.required && (!f.visible || f.visible(values)) && !(values[f.key] ?? "").trim());

  const [errors, setErrors] = useState<Record<string, string>>({});

  const save = async () => {
    const found = validate?.(values, rowId) ?? {};
    setErrors(found);
    if (Object.keys(found).length) return;
    setPending(true);
    try {
      const vars = Object.fromEntries(
        fields
          .filter((f) => isNew || !f.createOnly)
          .map((f) => [f.key, f.visible && !f.visible(values) ? null : toVariable(f, values[f.key] ?? "")] as const)
          .filter(([key, value]) => value !== null || !fields.find((f) => f.key === key)?.omitIfEmpty),
      );
      if (isNew) await run(ops.create, { ...createVariables, ...vars });
      else {
        const previous = Object.fromEntries(fields.map((f) => [f.key, toVariable(f, initial[f.key] ?? "")]));
        await run(ops.update, { id: rowId, ...vars }, { previous });
      }
      await refresh();
      toast.success(t("saved"));
      onDone?.();
    } catch (err) {
      setErrors(serverFieldErrors(err) ?? {});
      fail(err);
    } finally {
      setPending(false);
    }
  };

  const [confirming, setConfirming] = useState(false);
  // The dialog names the row by its first filled-in text field (e.g. a contact's name).
  const rowName = fields.find((f) => f.type === "text" && (initial[f.key] ?? "").trim())?.key;

  const remove = () => (isNew ? onDone?.() : setConfirming(true));

  return (
    <div className={cn("grid gap-2 rounded-ctl border p-3", isNew ? "border-primary/40 bg-primary-soft/30" : "border-border")}>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {fields
          .filter((f) => !f.visible || f.visible(values))
          .map((f) => {
            const id = `${baseId}-${f.key}`;
            const disabled = readOnly || pending || (!isNew && f.createOnly);
            return (
              <div key={f.key} className={cn("grid min-w-0 gap-1", f.className)}>
                <Label htmlFor={id}>{f.required ? `${f.label} *` : f.label}</Label>
                {f.type === "file" && f.purpose ? (
                  <FileUpload id={id} purpose={f.purpose} value={values[f.key] ?? ""} disabled={disabled} onChange={(url) => setValues((v) => ({ ...v, [f.key]: url }))} />
                ) : f.type === "select" ? (
                  <Select id={id} value={values[f.key] ?? ""} disabled={disabled} aria-invalid={errors[f.key] ? true : undefined} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}>
                    {!f.required ? <option value="">{t("none")}</option> : null}
                    {f.options?.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Input
                    id={id}
                    type={f.type === "date" ? "date" : f.type === "text" ? "text" : "number"}
                    step={f.type === "int" ? 1 : "any"}
                    inputMode={f.type === "number" || f.type === "int" ? "decimal" : undefined}
                    value={values[f.key] ?? ""}
                    placeholder={f.placeholder}
                    disabled={disabled}
                    aria-invalid={errors[f.key] ? true : undefined}
                    aria-describedby={errors[f.key] ? `${id}-error` : undefined}
                    onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  />
                )}
                {errors[f.key] ? (
                  <p id={`${id}-error`} className="text-xs text-destructive">
                    {errorLabel(tv, errors[f.key])}
                  </p>
                ) : null}
              </div>
            );
          })}
      </div>
      <div className="flex justify-end gap-1.5" hidden={readOnly}>
        <Button variant="ghost" size="sm" onClick={remove} disabled={pending} className="hover:text-destructive">
          <Trash2 />
          {isNew ? t("discard") : t("delete")}
        </Button>
        <Button size="sm" onClick={save} disabled={pending || !dirty || missing}>
          <Save />
          {pending ? t("saving") : t("save")}
        </Button>
      </div>
      <ConfirmDelete
        open={confirming}
        onOpenChange={setConfirming}
        name={rowName ? initial[rowName] : t("thisRow")}
        onConfirm={async () => {
          await run(ops.remove, { id: rowId });
          await refresh();
          toast.success(t("deleted"));
        }}
      />
    </div>
  );
}
