"use client";

import { useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useCallback, useMemo } from "react";
import { toast } from "sonner";
import { ApiRequestError, gqlRequest } from "@/lib/graphql/client";
import { LIST_PAGE_SIZE, VM_LOOKUPS, type VmLookupsResult } from "@/lib/graphql/vehicle-management";
import { dropUnneededNulls } from "./helpers";

/** Query keys share this prefix so a save can refresh every Vehicle Management list at once. */
export const VM_KEY = "vm";

/** Company, vehicles, drivers and vehicle types: the id → name lookups every screen needs. */
export function useVmLookups() {
  const query = useQuery({
    queryKey: [VM_KEY, "lookups"],
    queryFn: () => gqlRequest<VmLookupsResult>(VM_LOOKUPS, { first: LIST_PAGE_SIZE }),
  });

  const helpers = useMemo(() => {
    const data = query.data;
    const vehicles = [...(data?.vehicles.data ?? [])].sort((a, b) => a.plateNo.localeCompare(b.plateNo));
    const drivers = [...(data?.drivers.data ?? [])].sort((a, b) => a.name.localeCompare(b.name));
    const vehicleTypes = [...(data?.vehicleTypes.data ?? [])].sort((a, b) => a.name.localeCompare(b.name));
    const vehicleById = new Map(vehicles.map((v) => [v.id, v]));
    const driverById = new Map(drivers.map((d) => [d.id, d]));
    const typeById = new Map(vehicleTypes.map((t) => [t.id, t]));
    const company = data?.companies.data[0] ?? null;
    return {
      company,
      /** Server-side the API forces this to the caller's own company anyway. */
      companyId: company?.id ?? null,
      vehicles,
      drivers,
      vehicleTypes,
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
  }, [query.data]);

  return { ...query, ...helpers };
}

/** A Vehicle Management list query (one big page; the API has no server-side filters). */
export function useVmQuery<T>(name: string, document: string) {
  return useQuery({
    queryKey: [VM_KEY, name],
    queryFn: () => gqlRequest<T>(document, { first: LIST_PAGE_SIZE }),
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
