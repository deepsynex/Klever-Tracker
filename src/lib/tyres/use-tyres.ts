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
  VEHICLE_TYRE_RUNNING_KM,
  type AxleConfigurationsResult,
  type CustomersResult,
  type CustomerVehiclesResult,
  type TyreMastersResult,
  type VehicleTyreRunningKmResult,
} from "@/lib/graphql/tyres";
import { useVmLookups, useVmQuery, VM_KEY } from "@/lib/vehicle-management/use-vm";

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
  const positionFields = new Set((probe.data?.p?.fields ?? []).map((f) => f.name));
  return {
    isPending: probe.isPending,
    own:
      mutations.has("createAxleConfiguration") &&
      mutations.has("updateAxleConfiguration") &&
      mutations.has("deleteAxleConfiguration") &&
      fields.has("companyId") &&
      fields.has("vehicleCount"),
    perTyreSizes: mutations.has("setVehicleTyrePositionSizes"),
    /** The km each tyre had already run can be entered with the vehicle, and is kept counting. */
    runningKm: mutations.has("setVehicleTyreRunningKm") && positionFields.has("runningKm"),
    /** Each tyre's product and purchase price (for expected life, worn % and cost per km). */
    positionProducts: mutations.has("setVehicleTyrePositionProducts") && positionFields.has("tyreProductId"),
    /** The log of tyres moved or swapped with the plan (the report follows each reading to its tyre). */
    planMoves: (probe.data?.q?.fields ?? []).some((f) => f.name === "tyrePlanMoves"),
  };
}

/** Each position's running km now, by position code (only asked for once the backend has it). */
export function useTyreRunningKm(vehicleId: string | null | undefined, enabled: boolean) {
  const query = useQuery({
    queryKey: [VM_KEY, "tyreRunningKm", vehicleId],
    queryFn: () => gqlRequest<VehicleTyreRunningKmResult>(VEHICLE_TYRE_RUNNING_KM, { id: vehicleId }),
    enabled: Boolean(vehicleId) && enabled,
  });
  const byCode: Record<string, number | null> = Object.fromEntries(
    (query.data?.vehicle?.tyrePositions ?? []).map((p) => [p.code, p.runningKm]),
  );
  return { ...query, byCode };
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
