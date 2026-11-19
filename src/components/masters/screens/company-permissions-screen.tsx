"use client";

import { Blocks, Building2, ChevronRight, Disc3, Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { DataTable } from "@/components/masters/data-table";
import { isDirty, useDiscardGuard } from "@/components/masters/discard-guard";
import { KpiCards, PageHeader, StatusBadge } from "@/components/masters/page-header";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, Sheet } from "@/components/ui/sheet";
import { allModuleCodes, isAlwaysOn, toggleModule } from "@/lib/account-management/company-modules";
import { useCompanyModules } from "@/lib/account-management/use-company-modules";
import { SET_COMPANY_MODULES, type Module } from "@/lib/graphql/account-management";
import type { LookupCompany } from "@/lib/graphql/vehicle-management";
import { useErrorText, useVmLookups, useVmMutations } from "@/lib/vehicle-management/use-vm";

type CompanyRow = { id: string; name: string; codes: string[]; createdAt?: string | null; updatedAt?: string | null };

/**
 * Company permissions (platform admin only): which modules each company may use (T4). What's
 * switched off here is hidden from every user of the company, whatever their role, and the API
 * refuses it. Company admins then give their roles access within these, on User permissions.
 */
export function CompanyPermissionsScreen() {
  const t = useTranslations("masters.am.companyPermissions");
  const tr = useTranslations("masters.am.roles");
  const lookups = useVmLookups();
  const cm = useCompanyModules();
  const errorText = useErrorText();
  const [editing, setEditing] = useState<CompanyRow | null>(null);
  // The company whose active modules are listed (opened from its count).
  const [viewing, setViewing] = useState<CompanyRow | null>(null);

  const label = (m: Pick<Module, "code" | "name">) =>
    tr.has(`moduleNames.${m.code}`) ? tr(`moduleNames.${m.code}`) : m.name;
  const rows: CompanyRow[] = useMemo(
    () =>
      lookups.companies
        .filter((c) => lookups.inScope(c.id))
        .map((c) => ({ id: c.id, name: c.name, codes: cm.enabledFor(c.id) ?? allModuleCodes(cm.modules),
          // A company user's own company (from `me`) carries no timestamps.
          createdAt: (c as LookupCompany).createdAt ?? null,
          updatedAt: (c as LookupCompany).updatedAt ?? null,
        })),
    [lookups, cm],
  );
  const isOn = (row: CompanyRow, code: string) => isAlwaysOn(code) || row.codes.includes(code);
  const onCount = (row: CompanyRow) => cm.modules.filter((m) => isOn(row, m.code)).length;
  const loading = cm.isPending || !lookups.isSuccess;

  return (
    <div className="grid gap-6">
      <PageHeader title={t("title")} description={t("description")} />
      {!loading && !cm.available ? <Alert tone="info">{t("pending")}</Alert> : null}
      <KpiCards
        loading={loading}
        items={[
          { key: "companies", label: t("kpi.companies"), value: rows.length, icon: <Building2 />, tone: "primary" },
          {
            key: "tyres",
            label: t("kpi.tyres"),
            value: rows.filter((r) => isOn(r, "tyres")).length,
            icon: <Disc3 />,
            tone: "ok",
          },
          {
            key: "limited",
            label: t("kpi.limited"),
            value: rows.filter((r) => onCount(r) < cm.modules.length).length,
            icon: <Blocks />,
            tone: "muted",
          },
        ]}
      />
      <DataTable
        caption={t("title")}
        rows={rows}
        loading={loading}
        error={cm.error ? errorText(cm.error) : null}
        searchText={(r) => r.name}
        columns={[
          {
            key: "name",
            header: t("company"),
            sortValue: (r) => r.name,
            cell: (r) => <span className="font-medium">{r.name}</span>,
          },
          {
            key: "count",
            header: t("modules"),
            numeric: true,
            sortValue: onCount,
            // Just the count; clicking it lists the module names.
            cell: (r) => (
              <button
                type="button"
                onClick={() => setViewing(r)}
                title={t("showModules")}
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium text-primary hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-primary"
              >
                {t("count", { n: onCount(r), total: cm.modules.length })}
                <ChevronRight className="size-3.5 rtl:rotate-180" aria-hidden />
              </button>
            ),
          },
        ]}
        onEdit={cm.available ? setEditing : undefined}
      />

      <Dialog
        open={viewing !== null}
        onOpenChange={(open) => !open && setViewing(null)}
        title={t("activeTitle", { name: viewing?.name ?? "" })}
        description={viewing ? t("count", { n: onCount(viewing), total: cm.modules.length }) : undefined}
        footer={
          <>
            <Button variant="secondary" onClick={() => setViewing(null)}>
              {t("close")}
            </Button>
            {cm.available && viewing ? (
              <Button
                onClick={() => {
                  setEditing(viewing);
                  setViewing(null);
                }}
              >
                {t("edit")}
              </Button>
            ) : null}
          </>
        }
      >
        {viewing ? (
          <div className="grid gap-3">
            <ul className="flex flex-wrap gap-1.5">
              {cm.modules
                .filter((m) => isOn(viewing, m.code))
                .map((m) => (
                  <li key={m.id}>
                    <StatusBadge tone="ok">{label(m)}</StatusBadge>
                  </li>
                ))}
            </ul>
            {cm.modules.some((m) => !isOn(viewing, m.code)) ? (
              <div className="grid gap-1.5">
                <p className="text-xs font-medium text-muted-foreground">{t("switchedOff")}</p>
                <ul className="flex flex-wrap gap-1.5">
                  {cm.modules
                    .filter((m) => !isOn(viewing, m.code))
                    .map((m) => (
                      <li key={m.id}>
                        <StatusBadge tone="muted">{label(m)}</StatusBadge>
                      </li>
                    ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </Dialog>

      {editing ? (
        <ModulesSheet
          key={editing.id}
          company={editing}
          modules={cm.modules}
          label={label}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

function ModulesSheet({
  company,
  modules,
  label,
  onClose,
}: {
  company: CompanyRow;
  modules: Module[];
  label: (m: Module) => string;
  onClose: () => void;
}) {
  const t = useTranslations("masters.am.companyPermissions");
  const tc = useTranslations("masters.common");
  const { run, refresh, fail } = useVmMutations();
  const [codes, setCodes] = useState(() => [...company.codes].sort());
  const [pending, setPending] = useState(false);
  const guard = useDiscardGuard(isDirty(codes, [...company.codes].sort()), onClose);

  const save = async () => {
    setPending(true);
    try {
      await run(SET_COMPANY_MODULES, { companyId: company.id, moduleCodes: codes });
      await refresh();
      toast.success(t("saved"));
      onClose();
    } catch (err) {
      fail(err);
    } finally {
      setPending(false);
    }
  };

  return (
    <Sheet
      open
      onOpenChange={(open) => !open && guard.requestClose()}
      size="lg"
      title={t("editTitle", { name: company.name })}
      description={t("formDescription")}
      footer={
        <>
          <span className="me-auto text-xs text-muted-foreground">
            {t("count", {
              n: modules.filter((m) => isAlwaysOn(m.code) || codes.includes(m.code)).length,
              total: modules.length,
            })}
          </span>
          <Button variant="secondary" onClick={() => setCodes(allModuleCodes(modules))} disabled={pending}>
            {tc("selectAll")}
          </Button>
          <Button variant="secondary" onClick={guard.requestClose}>
            {tc("cancel")}
          </Button>
          <Button onClick={save} disabled={pending}>
            {pending ? tc("saving") : tc("save")}
          </Button>
        </>
      }
    >
      <ul className="grid gap-2 sm:grid-cols-2">
        {modules.map((m) => {
          const locked = isAlwaysOn(m.code);
          return (
            <li
              key={m.id}
              className="flex items-center justify-between gap-2 rounded-xl border border-border/70 px-3 py-2"
            >
              <Checkbox
                label={label(m)}
                checked={locked || codes.includes(m.code)}
                disabled={locked || pending}
                onChange={(e) => setCodes((c) => toggleModule(c, m.code, e.target.checked))}
              />
              {locked ? (
                <span className="flex items-center gap-1 text-[11px] text-subtle" title={t("alwaysOn")}>
                  <Lock className="size-3" aria-hidden />
                  {t("alwaysOn")}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
      {guard.dialog}
    </Sheet>
  );
}
