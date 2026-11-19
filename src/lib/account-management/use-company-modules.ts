"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { ApiRequestError, gqlRequest } from "@/lib/graphql/client";
import { COMPANY_ENABLED_MODULES, MODULES_LIST, type Module } from "@/lib/graphql/account-management";
import { LIST_PAGE_SIZE } from "@/lib/graphql/vehicle-management";
import { useMe } from "@/lib/permissions";
import { VM_KEY } from "@/lib/vehicle-management/use-vm";

type EnabledResult = { available: boolean; byCompany: Record<string, string[] | null> };

/**
 * The module catalogue and each company's enabled modules, for platform staff (who choose them).
 * `available` is false until the API has `Company.enabledModules` (backend request T4); until then
 * every company has every module, as today.
 */
export function useCompanyModules() {
  const { data: me } = useMe();
  const isPlatform = me ? me.companyId === null : false;

  const catalogue = useQuery({
    queryKey: [VM_KEY, "modulesList"],
    queryFn: async () =>
      (await gqlRequest<{ modules: { data: Module[] } }>(MODULES_LIST, { first: LIST_PAGE_SIZE })).modules.data,
    enabled: isPlatform,
  });

  const enabled = useQuery({
    queryKey: [VM_KEY, "companyModules"],
    enabled: isPlatform,
    retry: false,
    queryFn: async (): Promise<EnabledResult> => {
      try {
        const res = await gqlRequest<{ companies: { data: Array<{ id: string; enabledModules: string[] | null }> } }>(
          COMPANY_ENABLED_MODULES,
          { first: LIST_PAGE_SIZE },
        );
        return {
          available: true,
          byCompany: Object.fromEntries(res.companies.data.map((c) => [c.id, c.enabledModules])),
        };
      } catch (err) {
        // The field isn't on the API yet: behave as today (every module for every company).
        if (err instanceof ApiRequestError && /Cannot query field/i.test(err.error.message ?? "")) {
          return { available: false, byCompany: {} };
        }
        throw err;
      }
    },
  });

  return useMemo(() => {
    const modules = [...(catalogue.data ?? [])].sort((a, b) => Number(a.id) - Number(b.id));
    const available = enabled.data?.available ?? false;
    return {
      isPlatform,
      modules,
      available,
      isPending: catalogue.isPending || enabled.isPending,
      error: catalogue.error ?? enabled.error,
      /** The company's enabled module codes, or null when unknown (every module then applies). */
      enabledFor: (companyId: string | null | undefined): string[] | null =>
        available && companyId ? (enabled.data?.byCompany[companyId] ?? null) : null,
    };
  }, [
    catalogue.data,
    catalogue.isPending,
    catalogue.error,
    enabled.data,
    enabled.isPending,
    enabled.error,
    isPlatform,
  ]);
}
