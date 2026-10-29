"use client";

import { useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useCallback, useMemo } from "react";
import { toast } from "sonner";
import { ApiRequestError, gqlRequest, gqlRequestPartial } from "@/lib/graphql/client";
import { LIST_PAGE_SIZE, VM_LOOKUPS, type VmLookupsResult } from "@/lib/graphql/vehicle-management";
import { can, useMe, type PermissionAction, type PermissionModule } from "@/lib/permissions";
import { ALL_COMPANIES, useCompanyScope } from "./company-scope";
import { dropUnneededNulls } from "./helpers";

/** Query keys share this prefix so a save can refresh every Vehicle Management list at once. */
export const VM_KEY = "vm";

/**
 * Companies, vehicles, drivers and vehicle types: the id → name lookups every screen needs, scoped
 * to the company being worked in.
 *
 * A company user sees only their own company. A platform account (no company of its own) sees
 * every company: it picks one with the company picker, or views "all companies" read-only.
 * Which one the user is comes from `me.companyId` (null = platform account).
 *
 * Lists the role may not read come back empty (see gqlRequestPartial). `can` / `allow` say what
 * the role may do, from `me.permissions`; screens use them to hide tabs and buttons.
 */
export function useVmLookups() {
  const scope = useCompanyScope();
  const meQuery = useMe();
  const me = meQuery.data;
  const query = useQuery({
    queryKey: [VM_KEY, "lookups"],
    queryFn: () => gqlRequestPartial<VmLookupsResult>(VM_LOOKUPS, { first: LIST_PAGE_SIZE }),
  });
  const ready = query.isSuccess && meQuery.isSuccess;

  const helpers = useMemo(() => {
    const data = query.data;
    // A company user may not be allowed to list companies; their own comes with `me`.
    const listed = data?.companies.data ?? [];
    const own = me?.company && !listed.some((c) => c.id === me.company!.id) ? [me.company] : [];
    const companies = [...listed, ...own].sort((a, b) => a.name.localeCompare(b.name));
    const companyById = new Map(companies.map((c) => [c.id, c]));
    const isPlatform = me ? me.companyId === null : false;
    // The company records are created in: a company user's own one, or the platform account's pick.
    const selectedCompanyId = isPlatform
      ? scope.selected !== ALL_COMPANIES && companyById.has(scope.selected)
        ? scope.selected
        : null
      : (me?.companyId ?? null);
    /** Whether a row of this company is shown: everything in "all companies", else the chosen one. */
    const inScope = (companyId: string | null | undefined) => selectedCompanyId === null || companyId === selectedCompanyId;

    const allVehicles = [...(data?.vehicles.data ?? [])].sort((a, b) => a.plateNo.localeCompare(b.plateNo));
    const allDrivers = [...(data?.drivers.data ?? [])].sort((a, b) => a.name.localeCompare(b.name));
    const allTypes = [...(data?.vehicleTypes.data ?? [])].sort((a, b) => a.name.localeCompare(b.name));
    // Labels resolve across every company; lists and dropdowns only offer the chosen one's.
    const vehicleById = new Map(allVehicles.map((v) => [v.id, v]));
    const driverById = new Map(allDrivers.map((d) => [d.id, d]));
    const typeById = new Map(allTypes.map((t) => [t.id, t]));
    const company = selectedCompanyId ? (companyById.get(selectedCompanyId) ?? null) : null;

    return {
      companies,
      isPlatform,
      /** The signed-in user's id. */
      meId: me?.id ?? null,
      /** The company being worked in (null for a platform account viewing all companies). */
      company,
      /** companyId for create mutations; null in "all companies" mode, where nothing can be created. */
      companyId: selectedCompanyId,
      /** False while a platform account views all companies: pick a company to add or change records. */
      canEdit: ready && selectedCompanyId !== null,
      /** Whether the role may do `action` in `module` (platform staff may do everything). */
      can: (module: PermissionModule, action: PermissionAction = "view") => can(me, module, action),
      /** `can`, and a company is chosen to do it in: what Add / Edit / Delete buttons check. */
      allow: (module: PermissionModule, action: PermissionAction) => ready && selectedCompanyId !== null && can(me, module, action),
      inScope,
      companyName: (id: string | null | undefined) => (id ? (companyById.get(id)?.name ?? `#${id}`) : "—"),
      vehicleCompanyId: (vehicleId: string | null | undefined) => (vehicleId ? (vehicleById.get(vehicleId)?.companyId ?? null) : null),
      vehicles: allVehicles.filter((v) => inScope(v.companyId)),
      drivers: allDrivers.filter((d) => inScope(d.companyId)),
      vehicleTypes: allTypes.filter((t) => inScope(t.companyId)),
      vehicleById,
      driverById,
      /** "DXB-A-12345 (Truck 1)", or the id when the vehicle isn't visible to this user. */
      vehicleLabel: (id: string | null | undefined) => {
        if (!id) return "—";
        const v = vehicleById.get(id);
        return v ? (v.vehicleName ? `${v.plateNo} (${v.vehicleName})` : v.plateNo) : `#${id}`;
      },
      driverName: (id: string | null | undefined) => (id ? (driverById.get(id)?.name ?? `#${id}`) : "—"),
      typeName: (id: string | null | undefined) => (id ? (typeById.get(id)?.name ?? `#${id}`) : "—"),
    };
  }, [query.data, me, ready, scope.selected]);

  return { ...query, isSuccess: ready, ...helpers };
}

/** A Vehicle Management list query (one big page; the API has no server-side filters). */
export function useVmQuery<T>(name: string, document: string) {
  return useQuery({
    queryKey: [VM_KEY, name],
    queryFn: () => gqlRequestPartial<T>(document, { first: LIST_PAGE_SIZE }),
  });
}

/** Translated message for a failed request. */
export function useErrorText() {
  const te = useTranslations("errors");
  return useCallback(
    (err: unknown) => {
      if (err instanceof ApiRequestError) {
        const { kind, fields, message } = err.error;
        if (kind === "validation" && fields) {
          return Object.values(fields)
            .flat()
            .filter(Boolean)
            .join(" ");
        }
        return kind === "unknown" && message ? `${te("unknown")} (${message})` : te(kind);
      }
      return te("unknown");
    },
    [te],
  );
}

/**
 * The API's field errors (`extensions.validation`, keyed by mutation argument name) as form
 * errors: field → "server:<message>", which Field and the row editors show as-is under the input.
 * `aliases` maps argument names to form field names where they differ (e.g. logDate → date).
 * Null when the error isn't a validation error.
 */
export function serverFieldErrors(err: unknown, aliases: Record<string, string> = {}): Record<string, string> | null {
  if (!(err instanceof ApiRequestError) || err.error.kind !== "validation" || !err.error.fields) return null;
  return Object.fromEntries(
    Object.entries(err.error.fields).map(([arg, messages]) => [aliases[arg] ?? arg, `server:${messages[0] ?? ""}`]),
  );
}

/** Text for a form error: our translation key under `validation.*`, or an API message ("server:…") as-is. */
export function errorLabel(tv: (key: string) => string, code: string): string {
  return code.startsWith("server:") ? code.slice(7) : tv(code);
}

/**
 * Runs mutations for a save: `run` sends one, `refresh` reloads every Vehicle Management list
 * (lists are small and cross-linked, so refreshing all of them keeps every screen consistent).
 */
export function useVmMutations() {
  const queryClient = useQueryClient();
  const errorText = useErrorText();

  /**
   * Sends one mutation. Creates never send null; pass `previous` (the saved values) on updates so
   * null is only sent to clear a value that was set (see dropUnneededNulls).
   */
  const run = useCallback(
    <T = unknown>(document: string, variables: Record<string, unknown>, options: { previous?: Record<string, unknown> | null } = {}) =>
      gqlRequest<T>(document, dropUnneededNulls(document, variables, options.previous)),
    [],
  );

  const refresh = useCallback(
    (key: QueryKey = [VM_KEY]) => queryClient.invalidateQueries({ queryKey: key }),
    [queryClient],
  );

  const fail = useCallback((err: unknown) => toast.error(errorText(err)), [errorText]);

  /**
   * A failed save: the API's field errors go under their inputs (via `setErrors`, with argument
   * names renamed by `aliases`), and the message is also shown as a toast, so an error for a
   * field that isn't on the form is never lost.
   */
  const failInto = useCallback(
    (err: unknown, setErrors: (update: (prev: Record<string, string>) => Record<string, string>) => void, aliases?: Record<string, string>) => {
      const fields = serverFieldErrors(err, aliases);
      if (fields) setErrors((prev) => ({ ...prev, ...fields }));
      fail(err);
    },
    [fail],
  );

  return { run, refresh, fail, failInto, errorText };
}
