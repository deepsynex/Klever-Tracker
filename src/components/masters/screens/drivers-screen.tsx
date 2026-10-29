"use client";

import { Download, FileSpreadsheet, Plus, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { ConfirmDelete } from "@/components/masters/confirm-delete";
import { DataTable } from "@/components/masters/data-table";
import { downloadSheet, readSheetFile } from "@/components/masters/excel";
import { FileUpload } from "@/components/masters/file-upload";
import { FormSection, PageHeader, StatusBadge } from "@/components/masters/page-header";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Dialog, Sheet } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { driverExportSheet, driverSampleSheet, driverSheetHeader, parseDriverSheet } from "@/lib/account-management/driver-sheet";
import { BLOOD_GROUPS, driverFormToVariables, driverToForm, EMPLOYMENT_TYPES, type DriverForm } from "@/lib/account-management/forms";
import { validateDriver } from "@/lib/account-management/validation";
import { ApiRequestError } from "@/lib/graphql/client";
import {
  AM_DRIVERS,
  CREATE_AM_DRIVER,
  DELETE_AM_DRIVER,
  UPDATE_AM_DRIVER,
  type AmDriver,
  type AmDriversResult,
} from "@/lib/graphql/account-management";
import { expiryState, formatDate } from "@/lib/vehicle-management/helpers";
import { errorLabel, useErrorText, useVmLookups, useVmMutations, useVmQuery } from "@/lib/vehicle-management/use-vm";
import { cn } from "@/lib/utils";

/** 3. Driver: the full driver record, its driver-app login, and Excel import/export. */
export function DriversScreen() {
  const t = useTranslations("masters.am.drivers");
  const tc = useTranslations("masters.common");
  const lookups = useVmLookups();
  const list = useVmQuery<AmDriversResult>("am-drivers", AM_DRIVERS);
  const { run, refresh, fail } = useVmMutations();
  const errorText = useErrorText();
  const [editing, setEditing] = useState<AmDriver | "new" | null>(null);
  const [deleting, setDeleting] = useState<AmDriver | null>(null);
  const [importing, setImporting] = useState(false);
  const rows = useMemo(
    () => [...(list.data?.drivers.data ?? [])].filter((d) => lookups.inScope(d.companyId)).sort((a, b) => a.name.localeCompare(b.name)),
    [list.data, lookups],
  );

  const expiryCell = (value: string | null) => {
    const state = expiryState(value);
    if (state === "none") return <span className="text-subtle">—</span>;
    return (
      <span
        className={cn("whitespace-nowrap", state === "expired" && "font-semibold text-destructive", state === "soon" && "font-semibold text-sand")}
        title={state === "ok" ? undefined : tc(`expiry.${state}`)}
      >
        {formatDate(value)}
      </span>
    );
  };

  const download = async (sheet: Array<Array<string | number>>, name: string) => {
    try {
      await downloadSheet(sheet, name);
    } catch (err) {
      fail(err);
    }
  };

  return (
    <div className="grid gap-4">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <Button onClick={() => setEditing("new")} disabled={!lookups.allow("drivers", "add") || !list.isSuccess}>
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
        emptyText={t("empty")}
        searchText={(d) => `${d.name} ${d.employeeId ?? ""} ${d.mobile} ${d.licenceNo ?? ""} ${d.rfidTagId ?? ""}`}
        toolbar={
          <>
            <Button variant="secondary" size="sm" onClick={() => download(driverExportSheet(rows), "drivers.xlsx")} disabled={rows.length === 0}>
              <Download />
              {tc("exportExcel")}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => download(driverSampleSheet(), "drivers-sample.xlsx")}>
              <FileSpreadsheet />
              {t("sample")}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setImporting(true)} disabled={!lookups.allow("drivers", "add")}>
              <Upload />
              {t("upload")}
            </Button>
          </>
        }
        onEdit={lookups.allow("drivers", "edit") ? setEditing : undefined}
        onDelete={lookups.allow("drivers", "delete") ? setDeleting : undefined}
        columns={[
          { key: "employeeId", header: t("f.employeeId"), cell: (d) => <span dir="ltr">{d.employeeId ?? "—"}</span> },
          {
            key: "name",
            header: t("f.name"),
            cell: (d) => (
              <span className="inline-flex items-center gap-1.5 font-medium">
                {d.name}
                {d.status !== "active" ? <StatusBadge tone="muted">{tc("statuses.inactive")}</StatusBadge> : null}
              </span>
            ),
          },
          { key: "licenceNo", header: t("f.licenceNo"), cell: (d) => <span dir="ltr">{d.licenceNo ?? "—"}</span> },
          { key: "mobile", header: t("f.mobile"), cell: (d) => <span dir="ltr">{d.mobile}</span> },
          { key: "tag", header: t("f.rfidTagId"), cell: (d) => <span dir="ltr">{d.rfidTagId ?? "—"}</span> },
          { key: "licenceExpiry", header: t("f.licenceExpiryDate"), cell: (d) => expiryCell(d.licenceExpiryDate) },
        ]}
      />

      {editing !== null ? <DriverSheet driver={editing === "new" ? null : editing} all={list.data?.drivers.data ?? []} onClose={() => setEditing(null)} /> : null}
      {importing ? <ImportDialog onClose={() => setImporting(false)} /> : null}

      <ConfirmDelete
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        name={deleting?.name ?? ""}
        permanent={false}
        onConfirm={async () => {
          if (!deleting) return;
          await run(DELETE_AM_DRIVER, { id: deleting.id });
          await refresh();
          toast.success(tc("deleted"));
        }}
      />
    </div>
  );
}

function DriverSheet({ driver, all, onClose }: { driver: AmDriver | null; all: AmDriver[]; onClose: () => void }) {
  const t = useTranslations("masters.am.drivers");
  const tc = useTranslations("masters.common");
  const lookups = useVmLookups();
  const { run, refresh, failInto } = useVmMutations();
  const savedRef = useRef<Record<string, unknown> | null>(driver ? driverFormToVariables(driverToForm(driver)) : null);
  const [form, setForm] = useState<DriverForm>(() => driverToForm(driver));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const set = <K extends keyof DriverForm>(key: K, value: DriverForm[K]) => setForm((f) => ({ ...f, [key]: value }));

  const save = async () => {
    // Usernames are unique across every company; the other checks are within this company.
    const others = all
      .filter((d) => d.id !== driver?.id)
      .map((d) => (d.companyId === lookups.companyId ? d : { ...d, employeeId: null, rfidTagId: null }));
    const found = validateDriver(form, { savedUsername: driver?.username ?? "", others });
    setErrors(found);
    if (Object.keys(found).length) {
      toast.error(tc("fixErrors"));
      return;
    }
    setPending(true);
    try {
      const vars = driverFormToVariables(form);
      if (driver) await run(UPDATE_AM_DRIVER, { id: driver.id, ...vars }, { previous: savedRef.current });
      else await run(CREATE_AM_DRIVER, { companyId: lookups.companyId, ...vars });
      await refresh();
      toast.success(tc("saved"));
      onClose();
    } catch (err) {
      failInto(err, setErrors);
    } finally {
      setPending(false);
    }
  };

  const text = (key: keyof DriverForm, label: string, opts: { required?: boolean; type?: string; dir?: "ltr"; span?: boolean; hint?: ReactNode; autoComplete?: string } = {}) => (
    <div className={opts.span ? "sm:col-span-2 lg:col-span-3" : undefined}>
      <Field id={`d-${key}`} label={opts.required ? `${label} *` : label} error={errors[key]} hint={opts.hint}>
        <Input
          id={`d-${key}`}
          type={opts.type ?? "text"}
          step={opts.type === "number" ? "any" : undefined}
          inputMode={opts.type === "number" ? "decimal" : undefined}
          dir={opts.dir}
          autoComplete={opts.autoComplete}
          value={form[key] as string}
          onChange={(e) => set(key, e.target.value as never)}
          aria-invalid={errors[key] ? true : undefined}
        />
      </Field>
    </div>
  );

  return (
    <Sheet
      open
      onOpenChange={(open) => !open && onClose()}
      size="xl"
      title={driver ? t("editTitle", { name: driver.name }) : t("add")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
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
        autoComplete="off"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <FormSection title={t("sections.basic")} columns={3}>
          <div className="grid gap-1.5 sm:col-span-2 lg:col-span-3">
            <span className="text-[13px] font-medium">{t("f.vehicleType")}</span>
            <div className="flex flex-wrap gap-4">
              <Checkbox label={t("f.heavy")} checked={form.canDriveHeavy} onChange={(e) => set("canDriveHeavy", e.target.checked)} />
              <Checkbox label={t("f.light")} checked={form.canDriveLight} onChange={(e) => set("canDriveLight", e.target.checked)} />
            </div>
          </div>
          {text("name", t("f.name"), { required: true })}
          {text("employeeId", t("f.employeeId"), { dir: "ltr" })}
          {text("mobile", t("f.mobile"), { required: true, type: "tel", dir: "ltr" })}
          {text("nationality", t("f.nationality"))}
          <Field id="d-status" label={`${tc("status")} *`}>
            <Select id="d-status" value={form.status} onChange={(e) => set("status", e.target.value)}>
              <option value="active">{tc("statuses.active")}</option>
              <option value="inactive">{tc("statuses.inactive")}</option>
            </Select>
          </Field>
          {text("address", t("f.address"), { span: true })}
          <div className="sm:col-span-2 lg:col-span-3">
            <Field id="d-photo" label={t("f.photo")} error={errors.photoPath}>
              <FileUpload id="d-photo" purpose="driver_photo" value={form.photoPath} onChange={(url) => set("photoPath", url)} />
            </Field>
          </div>
        </FormSection>

        <FormSection title={t("sections.login")} description={driver?.username ? t("passwordKeepHint") : t("loginHint")} columns={3}>
          {text("username", t("f.username"), { dir: "ltr", autoComplete: "off" })}
          {text("password", driver?.username ? t("f.newPassword") : t("f.password"), { type: "password", dir: "ltr", autoComplete: "new-password" })}
          {text("confirmPassword", t("f.confirmPassword"), { type: "password", dir: "ltr", autoComplete: "new-password" })}
        </FormSection>

        <FormSection title={t("sections.employment")} columns={3}>
          <Field id="d-employmentType" label={t("f.employmentType")}>
            <Select id="d-employmentType" value={form.employmentType} onChange={(e) => set("employmentType", e.target.value)}>
              <option value="">{tc("none")}</option>
              {EMPLOYMENT_TYPES.map((x) => (
                <option key={x} value={x}>
                  {t(`employmentTypes.${x}`)}
                </option>
              ))}
            </Select>
          </Field>
          {text("visaExpiryDate", t("f.visaExpiryDate"), { type: "date" })}
          {text("workingHoursPerDay", t("f.workingHours"), { type: "number", hint: t("workingHoursHint") })}
          {text("overtimeRate", t("f.overtimeRate"), { type: "number" })}
        </FormSection>

        <FormSection title={t("sections.licence")} columns={3}>
          {text("licenceNo", t("f.licenceNo"), { dir: "ltr" })}
          {text("licenceExpiryDate", t("f.licenceExpiryDate"), { type: "date" })}
          <div className="hidden lg:block" />
          {text("otherPermitName", t("f.otherPermitName"))}
          {text("otherPermitNo", t("f.otherPermitNo"), { dir: "ltr" })}
          {text("permitExpiresAt", t("f.permitExpiresAt"), { type: "date" })}
          <div className="sm:col-span-2 lg:col-span-3">
            <Field id="d-permitPdf" label={t("f.permitPdf")} error={errors.permitPdfPath}>
              <FileUpload id="d-permitPdf" purpose="document" value={form.permitPdfPath} onChange={(url) => set("permitPdfPath", url)} />
            </Field>
          </div>
        </FormSection>

        <FormSection title={t("sections.tag")} columns={3}>
          <div className="flex items-end pb-2">
            <Checkbox label={t("f.hasTag")} checked={form.hasTag} onChange={(e) => set("hasTag", e.target.checked)} />
          </div>
          {form.hasTag ? text("rfidTagId", t("f.rfidTagId"), { required: true, dir: "ltr" }) : null}
        </FormSection>

        <FormSection title={t("sections.emergency")} columns={3}>
          {text("emergencyContactName", t("f.emergencyContactName"))}
          {text("emergencyContactNumber", t("f.emergencyContactNumber"), { type: "tel", dir: "ltr" })}
          <Field id="d-bloodGroup" label={t("f.bloodGroup")}>
            <Select id="d-bloodGroup" value={form.bloodGroup} onChange={(e) => set("bloodGroup", e.target.value)} dir="ltr">
              <option value="">{tc("none")}</option>
              {[...BLOOD_GROUPS, ...(form.bloodGroup && !(BLOOD_GROUPS as readonly string[]).includes(form.bloodGroup) ? [form.bloodGroup] : [])].map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </Select>
          </Field>
          <div className="sm:col-span-2 lg:col-span-3">
            <Field id="d-notes" label={t("f.notes")}>
              <Textarea id="d-notes" rows={3} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
            </Field>
          </div>
        </FormSection>
        <button type="submit" hidden />
      </form>
    </Sheet>
  );
}

type ImportResult = { created: number; failures: Array<{ rowNumber: number; name: string; messages: string[] }> };

/** Upload an .xlsx in the sample's layout: each row is created as a driver, with a report at the end. */
function ImportDialog({ onClose }: { onClose: () => void }) {
  const t = useTranslations("masters.am.drivers");
  const tc = useTranslations("masters.common");
  const tv = useTranslations("validation");
  const lookups = useVmLookups();
  const { run, refresh } = useVmMutations();
  const errorText = useErrorText();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const start = async (file: File | undefined) => {
    if (!file) return;
    setProblem(null);
    setResult(null);
    setPending(true);
    try {
      let sheet;
      try {
        sheet = await readSheetFile(file);
      } catch {
        setProblem(t("import.unreadable"));
        return;
      }
      const parsed = parseDriverSheet(sheet);
      if (!parsed) {
        setProblem(t("import.missingColumns"));
        return;
      }
      if (parsed.length === 0) {
        setProblem(t("import.noRows"));
        return;
      }
      const out: ImportResult = { created: 0, failures: [] };
      setProgress({ done: 0, total: parsed.length });
      // One at a time, so the report keeps the sheet's order and the API isn't flooded.
      for (const [i, row] of parsed.entries()) {
        const local = Object.entries(row.errors).map(([key, code]) => `${driverSheetHeader(key)}: ${errorLabel(tv, code)}`);
        if (local.length) out.failures.push({ rowNumber: row.rowNumber, name: row.name, messages: local });
        else {
          try {
            await run(CREATE_AM_DRIVER, { companyId: lookups.companyId, ...row.variables });
            out.created++;
          } catch (err) {
            const fields = err instanceof ApiRequestError && err.error.kind === "validation" ? err.error.fields : null;
            const messages = fields
              ? Object.entries(fields).map(([key, msgs]) => `${driverSheetHeader(key)}: ${msgs[0] ?? ""}`)
              : [errorText(err)];
            out.failures.push({ rowNumber: row.rowNumber, name: row.name, messages });
          }
        }
        setProgress({ done: i + 1, total: parsed.length });
      }
      setResult(out);
      if (out.created) await refresh();
    } finally {
      setPending(false);
      setProgress(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && !pending && onClose()}
      title={t("import.title")}
      description={t("import.description")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            {tc("close")}
          </Button>
          <Button onClick={() => inputRef.current?.click()} disabled={pending}>
            <Upload />
            {pending ? t("import.importing") : result ? t("import.another") : t("import.choose")}
          </Button>
        </>
      }
    >
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="sr-only"
        aria-label={t("import.choose")}
        onChange={(e) => void start(e.target.files?.[0])}
      />
      <div className="grid gap-3" aria-live="polite">
        {progress ? <p className="text-[13px] text-muted-foreground">{t("import.progress", progress)}</p> : null}
        {problem ? <Alert tone="error">{problem}</Alert> : null}
        {result ? (
          <>
            <Alert tone={result.failures.length ? "warning" : "success"}>
              {t("import.summary", { created: result.created, failed: result.failures.length })}
            </Alert>
            {result.failures.length ? (
              <ul className="grid max-h-64 gap-2 overflow-y-auto text-[13px]">
                {result.failures.map((f) => (
                  <li key={f.rowNumber} className="rounded-ctl border border-border p-2">
                    <span className="font-semibold">{t("import.row", { row: f.rowNumber })}</span>
                    {f.name ? <span className="text-muted-foreground"> · {f.name}</span> : null}
                    <ul className="mt-1 list-disc ps-5 text-destructive">
                      {f.messages.map((m) => (
                        <li key={m}>{m}</li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        ) : null}
      </div>
    </Dialog>
  );
}
