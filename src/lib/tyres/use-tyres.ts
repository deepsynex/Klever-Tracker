"use client";

import { useQuery } from "@tanstack/react-query";
import { gqlRequest } from "@/lib/graphql/client";
import {
  AXLE_CONFIGURATIONS,
  CUSTOMER_VEHICLES,
  CUSTOMERS,
  TYRE_MASTERS,
  type AxleConfigurationsResult,
  type CustomersResult,
  type CustomerVehiclesResult,
  type TyreMastersResult,
} from "@/lib/graphql/tyres";
import { useVmQuery } from "@/lib/vehicle-management/use-vm";

/** Tyres lists share the Vehicle Management query prefix, so any save refreshes them all (customer vehicles are vehicles). */
export const useCustomers = () => useVmQuery<CustomersResult>("customers", CUSTOMERS);
export const useCustomerVehicles = () => useVmQuery<CustomerVehiclesResult>("customerVehicles", CUSTOMER_VEHICLES);
export const useTyreMasters = () => useVmQuery<TyreMastersResult>("tyreMasters", TYRE_MASTERS);

/** The six axle layouts: the same for every user and never change, so fetched once per visit. */
export function useAxleConfigurations() {
  return useQuery({
    queryKey: ["axleConfigurations"],
    queryFn: async () => (await gqlRequest<AxleConfigurationsResult>(AXLE_CONFIGURATIONS)).axleConfigurations,
    staleTime: Infinity,
    gcTime: Infinity,
  });
}
