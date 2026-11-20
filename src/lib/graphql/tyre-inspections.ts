/**
 * Tyre inspections (TYRE_MODULE_PLAN.md §6, Phase 3; API Doc §6.25), the company's condition
 * thresholds, the tyre removal history, and what the vehicle tyre report reads.
 *
 * An inspection is taken by position: most positions have a tyre size but no serial-numbered tyre,
 * so `tyreId` is optional (the backend fills it in when a tyre is fitted there).
 */

/** One position's reading in an inspection (the backend works out the conditions on save). */
export type TyreInspectionItemInput = {
  positionCode: string;
  tyreId: string | null;
  actualPressurePsi: number | null;
  recommendedPressurePsi: number | null;
  outerTreadMm: number | null;
  centerTreadMm: number | null;
  innerTreadMm: number | null;
  tyreCondition: string | null;
  photoPath: string | null;
  remarks: string | null;
  recommendationIds: string[];
};

/**
 * Saves the whole visit (header + every position) in one go. Refused with a readable message for a
 * time in the future, an odometer below the last reading, or an unknown, repeated or empty position.
 */
export const CREATE_TYRE_INSPECTION = /* GraphQL */ `
  mutation CreateTyreInspection($input: CreateTyreInspectionInput!) {
    createTyreInspection(input: $input) {
      id
    }
  }
`;

const ITEM_FIELDS = `id tyreId positionCode runningKm actualPressurePsi recommendedPressurePsi outerTreadMm centerTreadMm innerTreadMm
  treadCondition pressureCondition wearCondition tyreCondition photoPath remarks
  tyre { id serialNo }
  recommendations { id code title description }`;

/** Inspections (one vehicle's, or every one the user may see), newest first. */
export const TYRE_INSPECTIONS = /* GraphQL */ `
  query TyreInspections($vehicleId: ID, $first: Int!, $page: Int) {
    tyreInspections(vehicleId: $vehicleId, first: $first, page: $page) {
      data {
        id vehicleId inspectedAt odometerKm remarks createdAt
        vehicle { id plateNo customerId companyId }
        inspector { id name }
        items { ${ITEM_FIELDS} }
      }
    }
  }
`;
export type TyreInspectionItem = {
  id: string;
  tyreId: string | null;
  positionCode: string;
  /** Km the tyre had run at this inspection (worked out from the inspection's odometer), if known. */
  runningKm: number | null;
  actualPressurePsi: number | null;
  recommendedPressurePsi: number | null;
  outerTreadMm: number | null;
  centerTreadMm: number | null;
  innerTreadMm: number | null;
  treadCondition: string | null;
  pressureCondition: string | null;
  wearCondition: string | null;
  tyreCondition: string | null;
  photoPath: string | null;
  remarks: string | null;
  tyre: { id: string; serialNo: string } | null;
  recommendations: Array<{ id: string; code: string; title: string; description: string | null }>;
};
export type TyreInspection = {
  id: string;
  vehicleId: string;
  inspectedAt: string;
  odometerKm: number | null;
  remarks: string | null;
  createdAt: string;
  vehicle: { id: string; plateNo: string; customerId: string | null; companyId: string } | null;
  inspector: { id: string; name: string } | null;
  items: TyreInspectionItem[];
};
export type TyreInspectionsResult = { tyreInspections: { data: TyreInspection[] } };

/** Fitment history (T6): running km per tyre comes from these. */
export const TYRE_FITMENTS = /* GraphQL */ `
  query TyreFitments($vehicleId: ID, $tyreId: ID, $first: Int!) {
    tyreFitments(vehicleId: $vehicleId, tyreId: $tyreId, first: $first) {
      data {
        id
        tyreId
        vehicleId
        position
        fittedAt
        fittedOdometerKm
        removedAt
        removedOdometerKm
        removalReason
        note
      }
    }
  }
`;
export type TyreFitmentRow = {
  id: string;
  tyreId: string;
  vehicleId: string;
  position: string;
  fittedAt: string;
  fittedOdometerKm: number | null;
  removedAt: string | null;
  removedOdometerKm: number | null;
  removalReason: string | null;
  note: string | null;
};
export type TyreFitmentsResult = { tyreFitments: { data: TyreFitmentRow[] } };

/** The vehicle with everything an inspection and the report need: positions, their tyres and products. */
export const INSPECTION_VEHICLE = /* GraphQL */ `
  query InspectionVehicle($id: ID!) {
    vehicle(id: $id) {
      id
      plateNo
      vehicleName
      customerId
      odometerKm
      axleConfigurationId
      application
      dailyAvgRunningKm
      photoPath
      customer {
        id
        name
      }
      tyrePositions {
        code
        axleNo
        side
        placement
        isSpare
        sortOrder
        fitted
        tyreSizeId
        tyreSize {
          id
          name
        }
        tyreProductId
        purchasePrice
        tyreProduct {
          id
          displayName
          recommendedPressurePsi
          originalTreadDepthMm
          brand {
            name
          }
        }
        tyre {
          id
          serialNo
          status
          treadDepthMm
          purchasePrice
          product {
            id
            displayName
            recommendedPressurePsi
            originalTreadDepthMm
            brand {
              name
            }
          }
        }
        fitment {
          id
          fittedAt
          fittedOdometerKm
        }
      }
    }
  }
`;
export type TyreProductInfo = {
  id: string;
  displayName: string;
  recommendedPressurePsi: number | null;
  originalTreadDepthMm: number | null;
  brand: { name: string } | null;
};

/** The product and price of the tyre on a position: set for the position, else the registered tyre's own. */
export const positionProduct = (
  p: Pick<InspectionPosition, "tyreProduct" | "purchasePrice" | "tyre">,
): { product: TyreProductInfo | null; price: number | null } => ({
  product: p.tyreProduct ?? (p.tyre?.product ? { ...p.tyre.product } : null),
  price: p.purchasePrice ?? p.tyre?.purchasePrice ?? null,
});

export type InspectionPosition = {
  code: string;
  axleNo: number;
  side: "left" | "right" | null;
  placement: "single" | "inner" | "outer" | null;
  isSpare: boolean;
  sortOrder: number;
  /** Whether the position has a tyre (a serial-numbered one, or just the axle's size). */
  fitted: boolean;
  tyreSizeId: string | null;
  tyreSize: { id: string; name: string } | null;
  /**
   * The product and purchase price of the tyre on the position (set per tyre; for a registered tyre
   * with nothing set, the API gives that tyre's own). Use `positionProduct()` to read them.
   */
  tyreProductId: string | null;
  purchasePrice: number | null;
  tyreProduct: TyreProductInfo | null;
  tyre: {
    id: string;
    serialNo: string;
    status: string;
    treadDepthMm: number | null;
    purchasePrice: number | null;
    product: {
      id: string;
      displayName: string;
      recommendedPressurePsi: number | null;
      originalTreadDepthMm: number | null;
      brand: { name: string } | null;
    } | null;
  } | null;
  fitment: { id: string; fittedAt: string; fittedOdometerKm: number | null } | null;
};
export type InspectionVehicle = {
  id: string;
  plateNo: string;
  vehicleName: string | null;
  customerId: string | null;
  odometerKm: number | null;
  axleConfigurationId: string | null;
  application: string | null;
  dailyAvgRunningKm: number | null;
  photoPath: string | null;
  customer: { id: string; name: string } | null;
  tyrePositions: InspectionPosition[];
};
export type InspectionVehicleResult = { vehicle: InspectionVehicle | null };

/** A company's tread and pressure thresholds (defaults 6 mm, 3 mm, ±10 %). Platform staff pass the company. */
export const TYRE_SETTINGS = /* GraphQL */ `
  query TyreSettings($companyId: ID) {
    tyreSettings(companyId: $companyId) {
      companyId
      treadCriticalMm
      treadReplaceMm
      pressureTolerancePct
    }
  }
`;
export type TyreSettingsRow = {
  companyId: string;
  treadCriticalMm: number;
  treadReplaceMm: number;
  pressureTolerancePct: number;
};
export type TyreSettingsResult = { tyreSettings: TyreSettingsRow };

/** Company admins only. Inspections already saved keep the conditions they were saved with. */
export const UPDATE_TYRE_SETTINGS = /* GraphQL */ `
  mutation UpdateTyreSettings(
    $companyId: ID
    $treadCriticalMm: Float
    $treadReplaceMm: Float
    $pressureTolerancePct: Float
  ) {
    updateTyreSettings(
      companyId: $companyId
      treadCriticalMm: $treadCriticalMm
      treadReplaceMm: $treadReplaceMm
      pressureTolerancePct: $pressureTolerancePct
    ) {
      companyId
    }
  }
`;

/** Tyres taken off a vehicle (saved with the axle drawing's plan), newest first. */
export const TYRE_PLAN_REMOVALS = /* GraphQL */ `
  query TyrePlanRemovals($vehicleId: ID, $first: Int!, $page: Int) {
    tyrePlanRemovals(vehicleId: $vehicleId, first: $first, page: $page) {
      data {
        id
        position
        disposition
        note
        odometerKm
        removedAt
        tyre {
          serialNo
        }
        user {
          name
        }
      }
    }
  }
`;
export type TyrePlanRemoval = {
  id: string;
  position: string;
  disposition: string;
  note: string | null;
  odometerKm: number | null;
  removedAt: string;
  tyre: { serialNo: string } | null;
  user: { name: string } | null;
};
export type TyrePlanRemovalsResult = { tyrePlanRemovals: { data: TyrePlanRemoval[] } };

/**
 * Tyres moved or swapped on a vehicle with the axle drawing's plan (`movedFrom`), newest first; a
 * swap logs two moves. Requested from the backend, not live yet: the report asks for it only once the
 * schema has it (useAxleApi().planMoves).
 */
export const TYRE_PLAN_MOVES = /* GraphQL */ `
  query TyrePlanMoves($vehicleId: ID, $first: Int!, $page: Int) {
    tyrePlanMoves(vehicleId: $vehicleId, first: $first, page: $page) {
      data {
        id
        fromPosition
        toPosition
        movedAt
        user {
          name
        }
      }
    }
  }
`;
export type TyrePlanMove = {
  id: string;
  fromPosition: string;
  toPosition: string;
  movedAt: string;
  user: { name: string } | null;
};
export type TyrePlanMovesResult = { tyrePlanMoves: { data: TyrePlanMove[] } };
