"use client";

import { CircleCheck, CircleOff, Handshake, Plus, RotateCcw, Truck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { ConfirmDelete } from "@/components/masters/confirm-delete";
import { DataTable } from "@/components/masters/data-table";
import { isDirty, useDiscardGuard } from "@/components/masters/discard-guard";
import { FilterSelect, FormSection, KpiCards, PageHeader, StatusBadge } from "@/components/masters/page-header";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Sheet } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import {
  CREATE_CUSTOMER,
  CUSTOMER_STATUSES,
  DELETE_CUSTOMER,
  UPDATE_CUSTOMER,
  type Customer,
} from "@/lib/graphql/tyres";
import { useCustomers, useCustomerVehicles } from "@/lib/tyres/use-tyres";
import { validateCustomer } from "@/lib/tyres/validation";
import { textOrNull } from "@/lib/vehicle-management/helpers";
import { useErrorText, useVmLookups, useVmMutations } from "@/lib/vehicle-management/use-vm";

const EMIRATES = ["Abu Dhabi", "Dubai", "Sharjah", "Ajman", "Umm Al Quwain", "Ras Al Khaimah", "Fujairah"];

const FIELDS = [
  "name",
  "contactName",
  "contactPhone",
  "email",
  "area",
  "emirate",
  "country",
  "address",
  "status",
] as const;
type CustomerForm = Record<(typeof FIELDS)[number], string>;

const toForm = (c: Customer | null): CustomerForm =>
  Object.fromEntries(FIELDS.map((k) => [k, c ? String(c[k] ?? "") : k === "status" ? "active" : ""])) as CustomerForm;

/** Customers: the companies whose trucks get tyre service. Their vehicles are listed under Customer vehicles. */
export function CustomersScreen() {
  const t = useTranslations("masters.tyres.customers");
  const tc = useTranslations("masters.common");
  const lookups = useVmLookups();
  const list = useCustomers();
  const vehicles = useCustomerVehicles();
  const { run, refresh } = useVmMutations();
  const errorText = useErrorText();
  const [statusFilter, setStatusFilter] = useState("");
  const [editing, setEditing] = useState<Customer | "new" | null>(null);
  const [deleting, setDeleting] = useState<Customer | null>(null);

  const allRows = useMemo(
    () =>
      [...(list.data?.customers?.data ?? [])]
        .filter((c) => lookups.inScope(c.companyId))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [list.data, lookups],
  );
  const rows = allRows.filter((c) => !statusFilter || c.status === statusFilter);
  const vehicleCount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const v of vehicles.data?.vehicles?.data ?? [])
      if (v.customerId) counts.set(v.customerId, (counts.get(v.customerId) ?? 0) + 1);
    return counts;
  }, [vehicles.data]);
  const activeCount = allRows.filter((c) => c.status === "active").length;
  const totalVehicles = allRows.reduce((sum, c) => sum + (vehicleCount.get(c.id) ?? 0), 0);

  return (
    <div className="grid gap-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <Button onClick={() => setEditing("new")} disabled={!lookups.allow("tyres", "add")}>
            <Plus />
            {t("add")}
          </Button>
        }
      />
      <KpiCards
        loading={list.isPending}
        items={[
          { key: "total", label: t("kpi.total"), value: allRows.length, icon: <Handshake />, tone: "primary" },
          { key: "active", label: tc("statuses.active"), value: activeCount, icon: <CircleCheck />, tone: "ok" },
          {
            key: "inactive",
            label: tc("statuses.inactive"),
            value: allRows.length - activeCount,
            icon: <CircleOff />,
            tone: "muted",
          },
          { key: "vehicles", label: t("kpi.vehicles"), value: totalVehicles, icon: <Truck />, tone: "muted" },
        ]}
      />
      <DataTable
        caption={t("title")}
        rows={rows}
        loading={list.isPending}
        error={list.error ? errorText(list.error) : null}
        searchText={(c) =>
          [c.name, c.contactName, c.contactPhone, c.email, c.area, c.emirate, c.country].filter(Boolean).join(" ")
        }
        filters={
          <>
            <FilterSelect label={tc("status")} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">{tc("all")}</option>
              {CUSTOMER_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {tc(`statuses.${s}`)}
                </option>
              ))}
            </FilterSelect>
            <Button variant="secondary" disabled={!statusFilter} onClick={() => setStatusFilter("")}>
              <RotateCcw />
              {tc("reset")}
            </Button>
          </>
        }
        emptyText={allRows.length === 0 ? t("empty") : undefined}
        columns={[
          {
            key: "name",
            header: tc("name"),
            sortValue: (c) => c.name,
            cell: (c) => (
              <div className="grid">
                <span className="font-medium">{c.name}</span>
                {c.email ? (
                  <span className="text-xs text-muted-foreground" dir="ltr">
                    {c.email}
                  </span>
                ) : null}
              </div>
            ),
          },
          {
            key: "contact",
            header: t("f.contact"),
            sortValue: (c) => c.contactName ?? "",
            cell: (c) => (
              <div className="grid">
                <span>{c.contactName ?? "—"}</span>
                {c.contactPhone ? (
                  <span className="text-xs text-muted-foreground" dir="ltr">
                    {c.contactPhone}
                  </span>
                ) : null}
              </div>
            ),
          },
          {
            key: "location",
            header: t("f.location"),
            sortValue: (c) => [c.emirate, c.area].filter(Boolean).join(" "),
            cell: (c) => [c.area, c.emirate, c.country].filter(Boolean).join(", ") || "—",
          },
          {
            key: "vehicles",
            header: t("f.vehicles"),
            numeric: true,
            sortValue: (c) => vehicleCount.get(c.id) ?? 0,
            cell: (c) => vehicleCount.get(c.id) ?? 0,
          },
          {
            key: "status",
            header: tc("status"),
            sortValue: (c) => c.status,
            cell: (c) => (
              <StatusBadge tone={c.status === "active" ? "ok" : "muted"}>{tc(`statuses.${c.status}`)}</StatusBadge>
            ),
          },
        ]}
        onEdit={lookups.allow("tyres", "edit") ? setEditing : undefined}
        onDelete={lookups.allow("tyres", "delete") ? setDeleting : undefined}
      />

      {editing !== null ? (
        <CustomerSheet
          customer={editing === "new" ? null : editing}
          others={allRows}
          vehicles={(vehicles.data?.vehicles?.data ?? []).filter(
            (v) => editing !== "new" && v.customerId === editing.id,
          )}
          onClose={() => setEditing(null)}
        />
      ) : null}

      <ConfirmDelete
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        name={deleting?.name ?? ""}
        notice={
          deleting && (vehicleCount.get(deleting.id) ?? 0) > 0
            ? t("deleteNotice", { n: vehicleCount.get(deleting.id) ?? 0 })
            : undefined
        }
        onConfirm={async () => {
          if (!deleting) return;
          await run(DELETE_CUSTOMER, { id: deleting.id });
          await refresh();
          toast.success(tc("deleted"));
        }}
      />
    </div>
  );
}

function CustomerSheet({
  customer,
  others,
  vehicles,
  onClose,
}: {
  customer: Customer | null;
  others: Customer[];
  vehicles: Array<{ id: string; plateNo: string; vehicleName: string | null }>;
  onClose: () => void;
}) {
  const t = useTranslations("masters.tyres.customers");
  const tc = useTranslations("masters.common");
  const lookups = useVmLookups();
  const { run, refresh, failInto } = useVmMutations();
  const [saved, setSaved] = useState(() => toForm(customer));
  const [form, setForm] = useState(saved);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const guard = useDiscardGuard(isDirty(form, saved), onClose);

  const set = (key: keyof CustomerForm, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const save = async () => {
    const found = validateCustomer(form, others, customer?.id);
    setErrors(found);
    if (Object.keys(found).length) {
      toast.error(tc("fixErrors"));
      return;
    }
    if (!lookups.companyId) return;
    setPending(true);
    try {
      const vars = Object.fromEntries(FIELDS.map((k) => [k, textOrNull(form[k])]));
      if (customer)
        await run(
          UPDATE_CUSTOMER,
          { id: customer.id, ...vars },
          { previous: Object.fromEntries(FIELDS.map((k) => [k, textOrNull(saved[k])])) },
        );
      else await run(CREATE_CUSTOMER, { companyId: lookups.companyId, ...vars });
      setSaved(form);
      await refresh();
      toast.success(tc("saved"));
      onClose();
    } catch (err) {
      failInto(err, setErrors);
    } finally {
      setPending(false);
    }
  };

  const text = (
    key: keyof CustomerForm,
    label: string,
    opts: { required?: boolean; type?: string; dir?: "ltr"; list?: string; hint?: ReactNode } = {},
  ) => (
    <Field id={`c-${key}`} label={opts.required ? `${label} *` : label} error={errors[key]} hint={opts.hint}>
      <Input
        id={`c-${key}`}
        type={opts.type ?? "text"}
        dir={opts.dir}
        list={opts.list}
        value={form[key]}
        onChange={(e) => set(key, e.target.value)}
        aria-invalid={errors[key] ? true : undefined}
      />
    </Field>
  );

  return (
    <Sheet
      open
      onOpenChange={(open) => !open && guard.requestClose()}
      size="lg"
      title={customer ? t("editTitle", { name: customer.name }) : t("add")}
      description={t("formDescription")}
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
        <FormSection title={t("sections.details")}>
          <div className="sm:col-span-2">{text("name", tc("name"), { required: true })}</div>
          {text("contactName", t("f.contactName"))}
          {text("contactPhone", t("f.contactPhone"), { type: "tel", dir: "ltr" })}
          <div className="sm:col-span-2">{text("email", t("f.email"), { type: "email", dir: "ltr" })}</div>
          <Field id="c-status" label={tc("status")} hint={t("inactiveHint")}>
            <Select id="c-status" value={form.status} onChange={(e) => set("status", e.target.value)}>
              {CUSTOMER_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {tc(`statuses.${s}`)}
                </option>
              ))}
            </Select>
          </Field>
        </FormSection>
        <FormSection title={t("sections.location")}>
          {text("area", t("f.area"))}
          {text("emirate", t("f.emirate"), { list: "c-emirates" })}
          <datalist id="c-emirates">
            {EMIRATES.map((e) => (
              <option key={e} value={e} />
            ))}
          </datalist>
          {text("country", t("f.country"))}
          <div className="sm:col-span-2">
            <Field id="c-address" label={t("f.address")}>
              <Textarea id="c-address" rows={2} value={form.address} onChange={(e) => set("address", e.target.value)} />
            </Field>
          </div>
        </FormSection>
        {customer ? (
          <FormSection title={t("sections.vehicles", { n: vehicles.length })} columns={1}>
            {vehicles.length ? (
              <ul className="flex flex-wrap gap-1.5">
                {vehicles.map((v) => (
                  <li
                    key={v.id}
                    className="rounded-lg border border-border bg-surface-2 px-2 py-1 text-xs font-medium"
                    dir="ltr"
                  >
                    {v.vehicleName ? `${v.plateNo} (${v.vehicleName})` : v.plateNo}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{t("noVehicles")}</p>
            )}
          </FormSection>
        ) : null}
        <button type="submit" hidden />
      </form>
      {guard.dialog}
    </Sheet>
  );
}
