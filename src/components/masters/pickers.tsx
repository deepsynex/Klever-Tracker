"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState, type ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Dialog } from "@/components/ui/sheet";
import { WEEK_DAYS, type WeekDay } from "@/lib/vehicle-management/helpers";
import { serverFieldErrors, useErrorText } from "@/lib/vehicle-management/use-vm";

/** Sun–Sat checkboxes. */
export function DayCheckboxes({ value, onChange }: { value: WeekDay[]; onChange: (days: WeekDay[]) => void }) {
  const t = useTranslations("masters.common.days");
  const set = new Set(value);
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2" role="group" aria-label={t("label")}>
      {WEEK_DAYS.map((d) => (
        <Checkbox
          key={d}
          label={t(d)}
          checked={set.has(d)}
          onChange={(e) => onChange(WEEK_DAYS.filter((x) => (x === d ? e.target.checked : set.has(x))))}
        />
      ))}
    </div>
  );
}

/** Vehicle checklist with search and "Select all", for groups and shifts. */
export function VehicleChecklist({
  vehicles,
  value,
  onChange,
}: {
  vehicles: Array<{ id: string; plateNo: string; vehicleName: string | null }>;
  value: Set<string>;
  onChange: (ids: Set<string>) => void;
}) {
  const t = useTranslations("masters.common");
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? vehicles.filter((v) => `${v.plateNo} ${v.vehicleName ?? ""}`.toLowerCase().includes(q)) : vehicles;
  }, [vehicles, query]);
  const allShownChecked = shown.length > 0 && shown.every((v) => value.has(v.id));

  if (vehicles.length === 0) return <p className="text-[13px] text-muted-foreground">{t("noVehicles")}</p>;

  return (
    <div className="grid gap-2 rounded-ctl border border-border p-2">
      <div className="flex flex-wrap items-center gap-3">
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("searchVehicles")} className="h-8 max-w-56" />
        <Checkbox
          label={t("selectAll")}
          checked={allShownChecked}
          onChange={(e) => {
            const next = new Set(value);
            shown.forEach((v) => (e.target.checked ? next.add(v.id) : next.delete(v.id)));
            onChange(next);
          }}
        />
        <span className="ms-auto text-xs text-subtle">{t("selectedCount", { count: value.size })}</span>
      </div>
      <div className="grid max-h-60 gap-1.5 overflow-y-auto sm:grid-cols-2">
        {shown.map((v) => (
          <Checkbox
            key={v.id}
            label={
              <span>
                <span className="font-medium" dir="ltr">
                  {v.plateNo}
                </span>
                {v.vehicleName ? <span className="text-subtle"> · {v.vehicleName}</span> : null}
              </span>
            }
            checked={value.has(v.id)}
            onChange={(e) => {
              const next = new Set(value);
              if (e.target.checked) next.add(v.id);
              else next.delete(v.id);
              onChange(next);
            }}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Dropdown with a "+" button that opens a small form to add a new option (vehicle type, driver,
 * maintenance type, ...). `onCreate` saves it and returns the new id, which is then selected.
 */
export function SelectWithAdd({
  id,
  value,
  onChange,
  options,
  placeholder,
  addLabel,
  addFields,
  onCreate,
  invalid,
  validate,
  canAdd = true,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ id: string; label: string; disabled?: boolean }>;
  placeholder: string;
  addLabel: string;
  /** Extra inputs for the add form; the first field ("name") is always shown. */
  addFields?: Array<{ key: string; label: string; required?: boolean; type?: string }>;
  onCreate: (values: Record<string, string>) => Promise<string>;
  invalid?: boolean;
  /** Checks the add form before saving: field → translation key under `validation.*`. */
  validate?: (values: Record<string, string>) => Record<string, string>;
  /** False hides the "+" (the role may not add this kind of item). */
  canAdd?: boolean;
}) {
  const t = useTranslations("masters.common");
  const errorText = useErrorText();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ReactNode>(null);
  const fields = addFields ?? [{ key: "name", label: t("name"), required: true }];
  const ready = fields.every((f) => !f.required || (values[f.key] ?? "").trim() !== "");

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const save = async () => {
    const trimmed = Object.fromEntries(fields.map((f) => [f.key, (values[f.key] ?? "").trim()]));
    const found = validate?.(trimmed) ?? {};
    setFieldErrors(found);
    if (Object.keys(found).length) return;
    setPending(true);
    setError(null);
    try {
      const newId = await onCreate(trimmed);
      onChange(newId);
      setOpen(false);
      setValues({});
    } catch (err) {
      const serverFields = serverFieldErrors(err);
      const known = serverFields ? Object.fromEntries(Object.entries(serverFields).filter(([k]) => fields.some((f) => f.key === k))) : {};
      setFieldErrors(known);
      setError(Object.keys(known).length ? null : errorText(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex gap-1.5">
      <Select id={id} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={invalid || undefined}>
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </Select>
      {canAdd ? (
        <Button variant="secondary" size="icon" className="shrink-0" onClick={() => setOpen(true)} aria-label={addLabel} title={addLabel}>
          <Plus />
        </Button>
      ) : null}
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setError(null);
            setFieldErrors({});
          }
        }}
        title={addLabel}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
              {t("cancel")}
            </Button>
            <Button onClick={save} disabled={pending || !ready}>
              {pending ? t("saving") : t("add")}
            </Button>
          </>
        }
      >
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            // React events bubble through the portal: don't also submit the form around this picker.
            e.stopPropagation();
            if (ready && !pending) void save();
          }}
        >
          {error ? <Alert tone="error">{error}</Alert> : null}
          {fields.map((f, i) => (
            <Field key={f.key} id={`${id}-add-${f.key}`} label={f.required ? `${f.label} *` : f.label} error={fieldErrors[f.key]}>
              <Input
                id={`${id}-add-${f.key}`}
                type={f.type ?? "text"}
                autoFocus={i === 0}
                value={values[f.key] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              />
            </Field>
          ))}
          <button type="submit" hidden />
        </form>
      </Dialog>
    </div>
  );
}
