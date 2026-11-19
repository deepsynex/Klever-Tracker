"use client";

import { useQuery } from "@tanstack/react-query";
import { gqlRequest } from "@/lib/graphql/client";
import {
  INSPECTION_VEHICLE,
  TYRE_FITMENTS,
  TYRE_INSPECTIONS,
  TYRE_PLAN_REMOVALS,
  TYRE_SETTINGS,
  type InspectionVehicleResult,
  type TyreFitmentsResult,
  type TyreInspectionsResult,
  type TyrePlanRemovalsResult,
  type TyreSettingsResult,
} from "@/lib/graphql/tyre-inspections";
import { LIST_PAGE_SIZE } from "@/lib/graphql/vehicle-management";
import { useVmLookups, VM_KEY } from "@/lib/vehicle-management/use-vm";
import { DEFAULT_THRESHOLDS, type TyreThresholds } from "./metrics";

/** A vehicle with its positions, their tyres and products (for inspections and the report). */
export function useInspectionVehicle(vehicleId: string | null) {
  return useQuery({
    queryKey: [VM_KEY, "inspectionVehicle", vehicleId],
    queryFn: async () => (await gqlRequest<InspectionVehicleResult>(INSPECTION_VEHICLE, { id: vehicleId })).vehicle,
    enabled: Boolean(vehicleId),
  });
}

/** Every fitment (all vehicles): a tyre's running km adds up over all of its fitments. */
export function useTyreFitments(enabled = true) {
  return useQuery({
    queryKey: [VM_KEY, "tyreFitments"],
    queryFn: async () =>
      (await gqlRequest<TyreFitmentsResult>(TYRE_FITMENTS, { first: LIST_PAGE_SIZE })).tyreFitments.data,
    enabled,
  });
}

/** Inspections, newest first (one vehicle's, or all). */
export function useTyreInspections(vehicleId: string | null, enabled = true) {
  return useQuery({
    queryKey: [VM_KEY, "tyreInspections", vehicleId],
    queryFn: async () =>
      (await gqlRequest<TyreInspectionsResult>(TYRE_INSPECTIONS, { vehicleId, first: LIST_PAGE_SIZE })).tyreInspections
        .data,
    enabled,
  });
}

/** One vehicle's tyre removals (from the axle drawing), newest first. */
export function useTyreRemovals(vehicleId: string) {
  return useQuery({
    queryKey: [VM_KEY, "tyrePlanRemovals", vehicleId],
    queryFn: async () =>
      (await gqlRequest<TyrePlanRemovalsResult>(TYRE_PLAN_REMOVALS, { vehicleId, first: LIST_PAGE_SIZE }))
        .tyrePlanRemovals.data,
  });
}

/**
 * The company's tread and pressure thresholds, for the conditions shown while typing and in the
 * report. The Excel defaults stand in while they load (or if they can't be read).
 */
export function useTyreSettings() {
  const lookups = useVmLookups();
  const companyId = lookups.isPlatform ? lookups.companyId : null;
  const query = useQuery({
    queryKey: [VM_KEY, "tyreSettings", companyId],
    queryFn: async () => (await gqlRequest<TyreSettingsResult>(TYRE_SETTINGS, { companyId })).tyreSettings,
    // Platform staff must pick a company first.
    enabled: !lookups.isPlatform || Boolean(companyId),
  });
  const s = query.data;
  const thresholds: TyreThresholds = s
    ? {
        ...DEFAULT_THRESHOLDS,
        criticalMm: s.treadCriticalMm,
        replaceMm: s.treadReplaceMm,
        pressureTolerancePct: s.pressureTolerancePct,
      }
    : DEFAULT_THRESHOLDS;
  return { ...query, thresholds, companyId };
}
