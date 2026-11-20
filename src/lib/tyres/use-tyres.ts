"use client";

import { useQuery } from "@tanstack/react-query";
import { gqlRequest } from "@/lib/graphql/client";
import {
  AXLE_API_PROBE,
  AXLE_CONFIGURATIONS,
  AXLE_CONFIGURATIONS_OWN,
  type AxleApiProbeResult,
  CUSTOMER_VEHICLES,
  CUSTOMERS,
  TYRE_MASTERS,
  type AxleConfigurationsResult,
  type CustomersResult,
  type CustomerVehiclesResult,
  type TyreMastersResult,
} from "@/lib/graphql/tyres";
import { useVmLookups, useVmQuery } from "@/lib/vehicle-management/use-vm";

/** Tyres lists share the Vehicle Management query prefix, so any save refreshes them all (customer vehicles are vehicles). */
export const useCustomers = () => useVmQuery<CustomersResult>("customers", CUSTOMERS);
export const useCustomerVehicles = () => useVmQuery<CustomerVehiclesResult>("customerVehicles", CUSTOMER_VEHICLES);
export const useTyreMasters = () => useVmQuery<TyreMastersResult>("tyreMasters", TYRE_MASTERS);

export const AXLE_KEY = "axleConfigurations";

/** What the backend supports for axles: a company's own layouts, and a tyre size per tyre (not only per axle). */
export function useAxleApi() {
  const probe = useQuery({
    queryKey: [AXLE_KEY, "probe"],
    queryFn: () => gqlRequest<AxleApiProbeResult>(AXLE_API_PROBE),
    staleTime: Infinity,
    retry: false,
  });
  const mutations = new Set((probe.data?.m?.fields ?? []).map((f) => f.name));
  const fields = new Set((probe.data?.a?.fields ?? []).map((f) => f.name));
  return {
    isPending: probe.isPending,
    own:
      mutations.has("createAxleConfiguration") &&
      mutations.has("updateAxleConfiguration") &&
      mutations.has("deleteAxleConfiguration") &&
      fields.has("companyId") &&
      fields.has("vehicleCount"),
    perTyreSizes: mutations.has("setVehicleTyrePositionSizes"),
  };
}

/**
 * The axle layouts the user may pick: the standard ones every company shares, plus the company's
 * own once the backend has them (platform staff see the chosen company's). Kept for the visit;
 * a save refreshes it.
 */
export function useAxleConfigurations() {
  const api = useAxleApi();
  const lookups = useVmLookups();
  const query = useQuery({
    queryKey: [AXLE_KEY, api.own],
    queryFn: async () =>
      (await gqlRequest<AxleConfigurationsResult>(api.own ? AXLE_CONFIGURATIONS_OWN : AXLE_CONFIGURATIONS))
        .axleConfigurations,
    enabled: !api.isPending,
    staleTime: Infinity,
    gcTime: Infinity,
  });
  const data = query.data?.filter((a) => !a.companyId || lookups.inScope(a.companyId));
  return { ...query, data };
}
