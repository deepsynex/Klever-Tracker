"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { ChildRowsEditor } from "@/components/masters/child-rows";
import { ConfirmDelete } from "@/components/masters/confirm-delete";
import { DataTable } from "@/components/masters/data-table";
import { FileUpload } from "@/components/masters/file-upload";
import { LocationPicker } from "@/components/masters/location-picker";
import { FormSection, PageHeader, StatusBadge } from "@/components/masters/page-header";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Sheet } from "@/components/ui/sheet";
import {
  accountFormToVariables,
  ACCOUNT_TYPES,
  COMPANY_STATUSES,
  companyToForm,
  emptyAccountForm,
  PAYMENT_MODES,
  type AccountForm,
} from "@/lib/account-management/forms";
import { validateAccount, validateContact } from "@/lib/account-management/validation";
import {
  ACCOUNTS,
  CREATE_COMPANY,
  CREATE_COMPANY_CONTACT,
  DELETE_COMPANY,
  DELETE_COMPANY_CONTACT,
  UPDATE_COMPANY,
  UPDATE_COMPANY_CONTACT,
  type AccountsResult,
  type Company,
  type CompanyContact,
} from "@/lib/graphql/account-management";
import { useErrorText, useVmLookups, useVmMutations, useVmQuery } from "@/lib/vehicle-management/use-vm";

/** The contact shown in the list: the primary one, else the first. */
function mainContact(contacts: CompanyContact[]): CompanyContact | undefined {
  return [...contacts].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.sortOrder - b.sortOrder)[0];
}

const STATUS_TONES: Record<string, "ok" | "warn" | "bad" | "muted" | "info"> = {
  active: "ok",
  trial: "info",
  suspended: "bad",
};

let timeZones: string[] | null = null;
function allTimeZones(): string[] {
  timeZones ??= typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : ["Asia/Dubai", "UTC"];
  return timeZones;
}

/**
 * 1. Account (Company). Platform staff see every company and can add or delete them; a company
 * admin edits their own company; other company users see it read-only (the API enforces the same).
 */
export function AccountsScreen() {
  const t = useTranslations("masters.am.accounts");
  const tc = useTranslations("masters.common");
  const lookups = useVmLookups();
  const list = useVmQuery<AccountsResult>("am-accounts", ACCOUNTS);
  const { run, refresh } = useVmMutations();
  const errorText = useErrorText();
  const [editing, setEditing] = useState<Company | "new" | null>(null);
  const [deleting, setDeleting] = useState<Company | null>(null);

  const users = useMemo(() => new Map((list.data?.users.data ?? []).map((u) => [u.id, u])), [list.data]);
  const contactsByCompany = useMemo(() => {
    const map = new Map<string, CompanyContact[]>();
    for (const c of list.data?.companyContacts.data ?? []) map.set(c.companyId, [...(map.get(c.companyId) ?? []), c]);
    return map;
  }, [list.data]);
  const rows = useMemo(
    () => [...(list.data?.companies.data ?? [])].filter((c) => lookups.inScope(c.id)).sort((a, b) => a.name.localeCompare(b.name)),
    [list.data, lookups],
  );
  // Company users need isAdmin to change their own company; platform staff can change any.
  const canEditAccounts = lookups.can("core", "edit") && (lookups.isPlatform || Boolean(lookups.meId && users.get(lookups.meId)?.isAdmin));
  const statusLabel = (s: string) => (t.has(`statuses.${s}`) ? t(`statuses.${s}`) : s);

  return (
    <div className="grid gap-4">
      <PageHeader
        title={t("title")}
        description={lookups.isPlatform ? t("description") : canEditAccounts ? t("descriptionCompany") : t("descriptionReadOnly")}
        actions={
          lookups.isPlatform && lookups.can("core", "add") ? (
            <Button onClick={() => setEditing("new")} disabled={!lookups.isSuccess}>
              <Plus />
              {t("add")}
            </Button>
          ) : null
        }
      />
      <DataTable
        caption={t("title")}
        rows={rows}
        loading={list.isPending}
        error={list.error ? errorText(list.error) : null}
        emptyText={t("empty")}
        searchText={(c) => {
          const contact = mainContact(contactsByCompany.get(c.id) ?? []);
          return `${c.name} ${c.city} ${contact?.name ?? ""} ${contact?.email ?? ""} ${contact?.phone ?? ""}`;
        }}
        onEdit={canEditAccounts && list.isSuccess ? setEditing : undefined}
        onDelete={lookups.isPlatform && lookups.can("core", "delete") ? setDeleting : undefined}
        columns={[
          { key: "name", header: t("f.name"), cell: (c) => <span className="font-medium">{c.name}</span> },
          { key: "contactName", header: t("contactName"), cell: (c) => mainContact(contactsByCompany.get(c.id) ?? [])?.name ?? "—" },
          {
            key: "contactPhone",
            header: t("contactPhone"),
            cell: (c) => <span dir="ltr">{mainContact(contactsByCompany.get(c.id) ?? [])?.phone ?? "—"}</span>,
          },
          { key: "contactEmail", header: t("contactEmail"), cell: (c) => mainContact(contactsByCompany.get(c.id) ?? [])?.email ?? "—" },
          { key: "city", header: t("f.city"), cell: (c) => c.city },
          { key: "createdBy", header: t("createdBy"), cell: (c) => (c.createdBy ? (users.get(c.createdBy)?.name ?? `#${c.createdBy}`) : "—") },
          { key: "type", header: t("f.accountType"), cell: (c) => t(`accountTypes.${c.accountType === "distributor" ? "distributor" : "customer"}`) },
          {
            key: "status",
            header: tc("status"),
            cell: (c) => (
              <span className="inline-flex flex-wrap gap-1">
                <StatusBadge tone={STATUS_TONES[c.status] ?? "muted"}>{statusLabel(c.status)}</StatusBadge>
                {c.isTrial && c.status !== "trial" ? <StatusBadge tone="warn">{t("trial")}</StatusBadge> : null}
              </span>
            ),
          },
        ]}
      />

      {editing !== null ? (
        <AccountSheet
          company={editing === "new" ? null : editing}
          contacts={editing === "new" ? [] : (contactsByCompany.get(editing.id) ?? [])}
          contactsByCompany={contactsByCompany}
          others={(list.data?.companies.data ?? []).filter((c) => editing === "new" || c.id !== editing.id)}
          onClose={() => setEditing(null)}
        />
      ) : null}

      <ConfirmDelete
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        name={deleting?.name ?? ""}
        permanent={false}
        onConfirm={async () => {
          if (!deleting) return;
          await run(DELETE_COMPANY, { id: deleting.id });
          await refresh();
          toast.success(tc("deleted"));
        }}
      />
    </div>
  );
}

function AccountSheet({
  company,
  contacts,
  contactsByCompany,
  others,
  onClose,
}: {
  company: Company | null;
  contacts: CompanyContact[];
  contactsByCompany: Map<string, CompanyContact[]>;
  others: Company[];
  onClose: () => void;
}) {
  const t = useTranslations("masters.am.accounts");
  const tc = useTranslations("masters.common");
  const lookups = useVmLookups();
  const { run, refresh, failInto } = useVmMutations();
  const isPlatform = lookups.isPlatform;
  // After the first save of a new account, the panel stays open on it so contacts can be added.
  const [companyId, setCompanyId] = useState<string | null>(company?.id ?? null);
  const savedRef = useRef<Record<string, unknown> | null>(company ? accountFormToVariables(companyToForm(company), { isPlatform }) : null);
  const [form, setForm] = useState<AccountForm>(() => (company ? companyToForm(company) : emptyAccountForm()));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const set = <K extends keyof AccountForm>(key: K, value: AccountForm[K]) => setForm((f) => ({ ...f, [key]: value }));
  const savedContacts = companyId && !company ? (contactsByCompany.get(companyId) ?? []) : contacts;

  const save = async () => {
    const found = validateAccount(form, { otherNames: others.map((c) => c.name) });
    setErrors(found);
    if (Object.keys(found).length) {
      toast.error(tc("fixErrors"));
      return;
    }
    setPending(true);
    try {
      const vars = accountFormToVariables(form, { isPlatform });
      if (companyId) {
        await run(UPDATE_COMPANY, { id: companyId, ...vars }, { previous: savedRef.current });
        toast.success(tc("saved"));
      } else {
        const res = await run<{ createCompany: { id: string } }>(CREATE_COMPANY, { ...vars, createdBy: lookups.meId });
        setCompanyId(res.createCompany.id);
        toast.success(t("createdNext"));
      }
      savedRef.current = vars;
      await refresh();
    } catch (err) {
      failInto(err, setErrors, { location: "locationLat" });
    } finally {
      setPending(false);
    }
  };

  const text = (key: keyof AccountForm, label: string, opts: { required?: boolean; type?: string; dir?: "ltr"; span?: boolean } = {}) => (
    <div className={opts.span ? "sm:col-span-2" : undefined}>
      <Field id={`a-${key}`} label={opts.required ? `${label} *` : label} error={errors[key]}>
        <Input
          id={`a-${key}`}
          type={opts.type ?? "text"}
          step={opts.type === "number" ? "any" : undefined}
          inputMode={opts.type === "number" ? "decimal" : undefined}
          dir={opts.dir}
          value={form[key] as string}
          onChange={(e) => set(key, e.target.value as never)}
          aria-invalid={errors[key] ? true : undefined}
        />
      </Field>
    </div>
  );
  const select = (key: keyof AccountForm, label: string, options: Array<{ value: string; label: ReactNode }>, required = true) => (
    <Field id={`a-${key}`} label={required ? `${label} *` : label} error={errors[key]}>
      <Select id={`a-${key}`} value={form[key] as string} onChange={(e) => set(key, e.target.value as never)}>
        {!required ? <option value="">{tc("none")}</option> : null}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    </Field>
  );

  const zones = allTimeZones().includes(form.timezone) || !form.timezone ? allTimeZones() : [form.timezone, ...allTimeZones()];

  return (
    <Sheet
      open
      onOpenChange={(open) => !open && onClose()}
      size="xl"
      title={companyId ? t("editTitle", { name: form.name || "…" }) : t("add")}
      description={t("formDescription")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {companyId ? tc("close") : tc("cancel")}
          </Button>
          <Button onClick={save} disabled={pending}>
            {pending ? tc("saving") : tc("save")}
          </Button>
        </>
      }
    >
      <div className="grid gap-5">
        <form
          className="grid gap-5"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <FormSection title={t("sections.company")} columns={3}>
            {text("name", t("f.name"), { required: true })}
            {text("industry", t("f.industry"))}
            {text("website", t("f.website"), { dir: "ltr" })}
            {text("address", t("f.address"), { span: true })}
            {text("city", t("f.city"), { required: true })}
            {text("state", t("f.state"), { required: true })}
            {text("country", t("f.country"), { required: true })}
            {select(
              "timezone",
              t("f.timezone"),
              zones.map((z) => ({ value: z, label: z })),
            )}
            {isPlatform ? (
              select(
                "status",
                tc("status"),
                [...COMPANY_STATUSES, ...((COMPANY_STATUSES as readonly string[]).includes(form.status) ? [] : [form.status])].map((s) => ({
                  value: s,
                  label: t.has(`statuses.${s}`) ? t(`statuses.${s}`) : s,
                })),
              )
            ) : (
              <Field id="a-status" label={tc("status")}>
                <Input id="a-status" value={t.has(`statuses.${form.status}`) ? t(`statuses.${form.status}`) : form.status} disabled />
              </Field>
            )}
            <div className="sm:col-span-2 lg:col-span-3">
              <Field id="a-logo" label={t("f.logo")} error={errors.logoPath}>
                <FileUpload id="a-logo" purpose="company_logo" value={form.logoPath} onChange={(url) => set("logoPath", url)} />
              </Field>
            </div>
          </FormSection>

          <FormSection title={t("sections.location")} description={t("locationHint")} columns={1}>
            <LocationPicker
              lat={form.locationLat}
              lng={form.locationLng}
              errors={{ lat: errors.locationLat, lng: errors.locationLng }}
              onChange={(lat, lng) => setForm((f) => ({ ...f, locationLat: lat, locationLng: lng }))}
            />
          </FormSection>

          <FormSection title={t("sections.billing")} columns={3}>
            {select(
              "paymentMode",
              t("f.paymentMode"),
              PAYMENT_MODES.map((m) => ({ value: m, label: t(`paymentModes.${m}`) })),
              false,
            )}
            {text("totalCharge", t("f.totalCharge"), { type: "number" })}
            {text("taxExpiresAt", t("f.taxExpiresAt"), { type: "date" })}
            <div className="sm:col-span-2 lg:col-span-3">
              <Field id="a-invoice" label={t("f.invoice")} error={errors.invoicePath}>
                <FileUpload id="a-invoice" purpose="document" value={form.invoicePath} onChange={(url) => set("invoicePath", url)} />
              </Field>
            </div>
          </FormSection>

          <FormSection title={t("sections.settings")} columns={2}>
            <Checkbox label={t("f.tripCloseOnBarcode")} checked={form.tripCloseOnBarcode} onChange={(e) => set("tripCloseOnBarcode", e.target.checked)} />
            <Checkbox label={t("f.offlineAlertsEnabled")} checked={form.offlineAlertsEnabled} onChange={(e) => set("offlineAlertsEnabled", e.target.checked)} />
          </FormSection>

          {isPlatform ? (
            <FormSection title={t("sections.platform")} description={t("platformHint")} columns={3}>
              {select(
                "accountType",
                t("f.accountType"),
                ACCOUNT_TYPES.map((x) => ({ value: x, label: t(`accountTypes.${x}`) })),
              )}
              <div className="flex items-end pb-2 sm:col-span-2">
                <Checkbox label={t("f.isTrial")} checked={form.isTrial} onChange={(e) => set("isTrial", e.target.checked)} />
              </div>
              {text("maxUsers", t("f.maxUsers"), { type: "number" })}
              {text("maxStaff", t("f.maxStaff"), { type: "number" })}
              {text("maxDrivers", t("f.maxDrivers"), { type: "number" })}
            </FormSection>
          ) : null}
          <button type="submit" hidden />
        </form>

        <FormSection title={t("sections.contacts")} columns={1}>
          {companyId ? (
            <ChildRowsEditor
              rows={savedContacts}
              fields={[
                { key: "name", label: t("contact.name"), type: "text", required: true },
                { key: "email", label: t("contact.email"), type: "text", required: true },
                { key: "phone", label: t("contact.phone"), type: "text", required: true },
              ]}
              newRow={{ name: "", email: "", phone: "" }}
              createVariables={{ companyId, sortOrder: savedContacts.length + 1, isPrimary: savedContacts.length === 0 }}
              ops={{ create: CREATE_COMPANY_CONTACT, update: UPDATE_COMPANY_CONTACT, remove: DELETE_COMPANY_CONTACT }}
              addLabel={t("contact.add")}
              emptyText={t("contact.empty")}
              validate={validateContact}
            />
          ) : (
            <p className="text-[13px] text-muted-foreground">{t("contact.saveFirst")}</p>
          )}
        </FormSection>
      </div>
    </Sheet>
  );
}
