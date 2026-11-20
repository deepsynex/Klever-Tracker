/**
 * Tyre module, Phase 1 masters (FRONTEND_TYRE_CHANGES.md, API Doc §6.20): customers, customer
 * vehicles, tyre sizes, brands, products and recommendations, and the axle layouts. Typed by hand
 * from the live schema (2026-11-18). Every list is company-scoped by the API; the screens fetch one
 * page of LIST_PAGE_SIZE rows and filter on the client, like the Vehicle Management screens.
 */

// ---------------------------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------------------------

export const CUSTOMER_STATUSES = ["active", "inactive"] as const;
/** How the vehicle is used: drives the tyre recommendations in later phases. */
export const VEHICLE_APPLICATIONS = ["city", "regional", "long_haul", "on_off", "off_road"] as const;

export type Customer = {
  id: string;
  companyId: string;
  name: string;
  area: string | null;
  emirate: string | null;
  country: string | null;
  email: string | null;
  contactName: string | null;
  contactPhone: string | null;
  address: string | null;
  status: string;
};

export type AxlePosition = {
  code: string;
  axleNo: number;
  side: "left" | "right";
  placement: "single" | "inner" | "outer";
  sortOrder: number;
};
export type AxleConfiguration = {
  id: string;
  code: string;
  name: string;
  positions: AxlePosition[];
  /** Null for the standard layouts every company shares; set on a company's own (once the backend has them). */
  companyId?: string | null;
  /** Spare tyres a vehicle with this layout starts with. */
  spareCount?: number;
  /** Vehicles using it: while any do, only the code, name and spares can change, and it can't be deleted. */
  vehicleCount?: number;
};

/** A customer's truck: a vehicle with a customer and no GPS device. */
export type CustomerVehicle = {
  id: string;
  companyId: string;
  customerId: string | null;
  plateNo: string;
  vehicleName: string | null;
  vehicleTypeId: string;
  axleConfigurationId: string | null;
  application: string | null;
  dailyAvgRunningKm: number | null;
  photoPath: string | null;
  status: string;
  /** Spares carried (0–4); positions SP1, SP2, … */
  spareTyreCount: number;
  /** Tyre size per axle (T5); axle 0 is the spare. */
  axleTyreSizes: Array<{ axleNo: number; tyreSizeId: string | null }>;
};

export type TyreNamed = { id: string; companyId: string; name: string };

export type TyreProduct = {
  id: string;
  companyId: string;
  tyreSizeId: string;
  tyreBrandId: string;
  /** Size + brand + pattern + ply rating, built by the API: show it as-is. */
  displayName: string;
  pattern: string | null;
  plyRating: number | null;
  loadSpeedIndex: string | null;
  recommendedPressurePsi: number | null;
  originalTreadDepthMm: number | null;
  status: string;
};

export type TyreRecommendation = {
  id: string;
  companyId: string;
  code: string;
  title: string;
  description: string | null;
};

// ---------------------------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------------------------

const CUSTOMER_FIELDS = `id companyId name area emirate country email contactName contactPhone address status createdAt updatedAt`;

export const CUSTOMERS = /* GraphQL */ `
  query Customers($first: Int!) {
    customers(first: $first) {
      data { ${CUSTOMER_FIELDS} }
    }
  }
`;
export type CustomersResult = { customers: { data: Customer[] } };

const CUSTOMER_ARGS = `$area: String, $emirate: String, $country: String, $email: String, $contactName: String,
  $contactPhone: String, $address: String, $status: String`;
const CUSTOMER_PASS = `area: $area, emirate: $emirate, country: $country, email: $email, contactName: $contactName,
  contactPhone: $contactPhone, address: $address, status: $status`;

export const CREATE_CUSTOMER = /* GraphQL */ `
  mutation CreateCustomer($companyId: ID!, $name: String!, ${CUSTOMER_ARGS}) {
    createCustomer(companyId: $companyId, name: $name, ${CUSTOMER_PASS}) { id }
  }
`;
export const UPDATE_CUSTOMER = /* GraphQL */ `
  mutation UpdateCustomer($id: ID!, $name: String, ${CUSTOMER_ARGS}) {
    updateCustomer(id: $id, name: $name, ${CUSTOMER_PASS}) { id }
  }
`;
/** The customer's vehicles are kept (their customerId becomes null). */
export const DELETE_CUSTOMER = /* GraphQL */ `
  mutation DeleteCustomer($id: ID!) {
    deleteCustomer(id: $id) {
      id
    }
  }
`;

// ---------------------------------------------------------------------------------------------
// Customer vehicles
// ---------------------------------------------------------------------------------------------

const CUSTOMER_VEHICLE_FIELDS = `id companyId customerId plateNo vehicleName vehicleTypeId axleConfigurationId application createdAt updatedAt
  dailyAvgRunningKm photoPath status spareTyreCount axleTyreSizes { axleNo tyreSizeId }`;

/** Customer trucks only (`ownFleet: false`), tracker or not. The GPS screens ask for `hasDevice: true`. */
export const CUSTOMER_VEHICLES = /* GraphQL */ `
  query CustomerVehicles($first: Int!) {
    vehicles(first: $first, ownFleet: false) {
      data { ${CUSTOMER_VEHICLE_FIELDS} }
    }
  }
`;
export type CustomerVehiclesResult = { vehicles: { data: CustomerVehicle[] } };

const CV_ARGS = `$vehicleName: String, $customerId: ID, $axleConfigurationId: ID, $application: String,
  $dailyAvgRunningKm: Float, $photoPath: String, $status: String, $spareTyreCount: Int`;
const CV_PASS = `vehicleName: $vehicleName, customerId: $customerId, axleConfigurationId: $axleConfigurationId,
  application: $application, dailyAvgRunningKm: $dailyAvgRunningKm, photoPath: $photoPath, status: $status,
  spareTyreCount: $spareTyreCount`;

/** A customer vehicle: no GPS fields (install date, payment type, limits are optional now). */
export const CREATE_CUSTOMER_VEHICLE = /* GraphQL */ `
  mutation CreateCustomerVehicle($companyId: ID!, $plateNo: String!, $vehicleTypeId: ID!, ${CV_ARGS}) {
    createVehicle(companyId: $companyId, plateNo: $plateNo, vehicleTypeId: $vehicleTypeId, ${CV_PASS}) { id }
  }
`;
export const UPDATE_CUSTOMER_VEHICLE = /* GraphQL */ `
  mutation UpdateCustomerVehicle($id: ID!, $plateNo: String, $vehicleTypeId: ID, ${CV_ARGS}) {
    updateVehicle(id: $id, plateNo: $plateNo, vehicleTypeId: $vehicleTypeId, ${CV_PASS}) { id }
  }
`;

// ---------------------------------------------------------------------------------------------
// Axle configurations (read-only reference data, the same for everyone)
// ---------------------------------------------------------------------------------------------

export const AXLE_CONFIGURATIONS = /* GraphQL */ `
  query AxleConfigurations {
    axleConfigurations {
      id
      code
      name
      positions {
        code
        axleNo
        side
        placement
        sortOrder
      }
    }
  }
`;
export type AxleConfigurationsResult = { axleConfigurations: AxleConfiguration[] };

/*
 * Each company's own axle layouts (requested from the backend, not live yet): the list then also
 * says whose each layout is and how many vehicles use it, and the company can add, edit and delete
 * its own. The web switches these on from the schema (useAxleApi), so nothing calls a missing field.
 */
export const AXLE_CONFIGURATIONS_OWN = /* GraphQL */ `
  query AxleConfigurationsOwn {
    axleConfigurations {
      id
      code
      name
      companyId
      spareCount
      vehicleCount
      positions {
        code
        axleNo
        side
        placement
        sortOrder
      }
    }
  }
`;
const AXLE_ARGS = `$code: String!, $name: String!, $spareCount: Int!, $positions: [AxlePositionInput!]!`;
const AXLE_PASS = `code: $code, name: $name, spareCount: $spareCount, positions: $positions`;
export const CREATE_AXLE_CONFIGURATION = /* GraphQL */ `
  mutation CreateAxleConfiguration($companyId: ID, ${AXLE_ARGS}) {
    createAxleConfiguration(companyId: $companyId, ${AXLE_PASS}) { id }
  }
`;
/** The positions can only change while no vehicle uses the layout (the API refuses it otherwise). */
export const UPDATE_AXLE_CONFIGURATION = /* GraphQL */ `
  mutation UpdateAxleConfiguration($id: ID!, ${AXLE_ARGS}) {
    updateAxleConfiguration(id: $id, ${AXLE_PASS}) { id }
  }
`;
/** Refused while any vehicle uses the layout. */
export const DELETE_AXLE_CONFIGURATION = /* GraphQL */ `
  mutation DeleteAxleConfiguration($id: ID!) {
    deleteAxleConfiguration(id: $id) {
      id
    }
  }
`;
/** Whether the backend has a company's own axle layouts yet (checked once per visit). */
export const AXLE_API_PROBE = /* GraphQL */ `
  query AxleApiProbe {
    m: __type(name: "Mutation") {
      fields {
        name
      }
    }
    a: __type(name: "AxleConfiguration") {
      fields {
        name
      }
    }
    p: __type(name: "VehicleTyrePosition") {
      fields {
        name
      }
    }
    q: __type(name: "Query") {
      fields {
        name
      }
    }
  }
`;
export type AxleApiProbeResult = {
  m: { fields: Array<{ name: string }> } | null;
  a: { fields: Array<{ name: string }> } | null;
  p: { fields: Array<{ name: string }> } | null;
  q: { fields: Array<{ name: string }> } | null;
};

// ---------------------------------------------------------------------------------------------
// Tyre masters
// ---------------------------------------------------------------------------------------------

/** Sizes, brands, products and recommendations in one request: the masters screen's tabs and counts. */
export const TYRE_MASTERS = /* GraphQL */ `
  query TyreMasters($first: Int!) {
    tyreSizes(first: $first) {
      data {
        createdAt
        updatedAt
        id
        companyId
        name
      }
    }
    tyreBrands(first: $first) {
      data {
        createdAt
        updatedAt
        id
        companyId
        name
      }
    }
    tyreProducts(first: $first) {
      data {
        createdAt
        updatedAt
        id
        companyId
        tyreSizeId
        tyreBrandId
        displayName
        pattern
        plyRating
        loadSpeedIndex
        recommendedPressurePsi
        originalTreadDepthMm
        status
      }
    }
    tyreRecommendations(first: $first) {
      data {
        createdAt
        updatedAt
        id
        companyId
        code
        title
        description
      }
    }
  }
`;
export type TyreMastersResult = {
  tyreSizes: { data: TyreNamed[] };
  tyreBrands: { data: TyreNamed[] };
  tyreProducts: { data: TyreProduct[] };
  tyreRecommendations: { data: TyreRecommendation[] };
};

export type TyreNamedKind = "size" | "brand";

/** Create for the two name-only masters (added from the product form and the axle tyre sizes). */
export const TYRE_NAMED_OPS: Record<TyreNamedKind, { create: string; createField: string }> = {
  size: {
    create: `mutation CreateTyreSize($companyId: ID!, $name: String!) { createTyreSize(companyId: $companyId, name: $name) { id } }`,
    createField: "createTyreSize",
  },
  brand: {
    create: `mutation CreateTyreBrand($companyId: ID!, $name: String!) { createTyreBrand(companyId: $companyId, name: $name) { id } }`,
    createField: "createTyreBrand",
  },
};

const PRODUCT_ARGS = `$pattern: String, $plyRating: Int, $loadSpeedIndex: String, $recommendedPressurePsi: Float,
  $originalTreadDepthMm: Float, $status: String`;
const PRODUCT_PASS = `pattern: $pattern, plyRating: $plyRating, loadSpeedIndex: $loadSpeedIndex,
  recommendedPressurePsi: $recommendedPressurePsi, originalTreadDepthMm: $originalTreadDepthMm, status: $status`;

export const CREATE_TYRE_PRODUCT = /* GraphQL */ `
  mutation CreateTyreProduct($companyId: ID!, $tyreSizeId: ID!, $tyreBrandId: ID!, ${PRODUCT_ARGS}) {
    createTyreProduct(companyId: $companyId, tyreSizeId: $tyreSizeId, tyreBrandId: $tyreBrandId, ${PRODUCT_PASS}) { id }
  }
`;
export const UPDATE_TYRE_PRODUCT = /* GraphQL */ `
  mutation UpdateTyreProduct($id: ID!, $tyreSizeId: ID, $tyreBrandId: ID, ${PRODUCT_ARGS}) {
    updateTyreProduct(id: $id, tyreSizeId: $tyreSizeId, tyreBrandId: $tyreBrandId, ${PRODUCT_PASS}) { id }
  }
`;
export const DELETE_TYRE_PRODUCT = /* GraphQL */ `
  mutation DeleteTyreProduct($id: ID!) {
    deleteTyreProduct(id: $id) {
      id
    }
  }
`;

export const CREATE_TYRE_RECOMMENDATION = /* GraphQL */ `
  mutation CreateTyreRecommendation($companyId: ID!, $code: String!, $title: String!, $description: String) {
    createTyreRecommendation(companyId: $companyId, code: $code, title: $title, description: $description) {
      id
    }
  }
`;
/** The code is fixed once created: only the title and description change. */
export const UPDATE_TYRE_RECOMMENDATION = /* GraphQL */ `
  mutation UpdateTyreRecommendation($id: ID!, $title: String, $description: String) {
    updateTyreRecommendation(id: $id, title: $title, description: $description) {
      id
    }
  }
`;
export const DELETE_TYRE_RECOMMENDATION = /* GraphQL */ `
  mutation DeleteTyreRecommendation($id: ID!) {
    deleteTyreRecommendation(id: $id) {
      id
    }
  }
`;

// ---------------------------------------------------------------------------------------------
// Tyre size per axle (T5), tyres and fitments (T6)
// ---------------------------------------------------------------------------------------------

/**
 * Sets the tyre size of every position on each listed axle (axle 0 = spare; null clears one). Once
 * tyres can have their own sizes, only the listed axles change.
 */
/**
 * Each tyre's own size (requested from the backend, not live yet): sets only the listed positions
 * (null clears one). The axle drawing switches it on from the schema (useAxleApi().perTyreSizes).
 */
export const SET_VEHICLE_TYRE_POSITION_SIZES = /* GraphQL */ `
  mutation SetVehicleTyrePositionSizes($vehicleId: ID!, $sizes: [TyrePositionSizeInput!]!) {
    setVehicleTyrePositionSizes(vehicleId: $vehicleId, sizes: $sizes) {
      id
    }
  }
`;

/**
 * Km each tyre had already run, entered with the vehicle (requested from the backend, not live yet):
 * sets only the listed positions, as of the vehicle's current odometer (null clears one). Switched
 * on from the schema (useAxleApi().runningKm).
 */
export const SET_VEHICLE_TYRE_RUNNING_KM = /* GraphQL */ `
  mutation SetVehicleTyreRunningKm($vehicleId: ID!, $tyres: [TyreRunningKmInput!]!) {
    setVehicleTyreRunningKm(vehicleId: $vehicleId, tyres: $tyres) {
      id
    }
  }
`;
/** Each position's running km now: what was entered, plus the km driven since. */
export const VEHICLE_TYRE_RUNNING_KM = /* GraphQL */ `
  query VehicleTyreRunningKm($id: ID!) {
    vehicle(id: $id) {
      id
      tyrePositions {
        code
        runningKm
      }
    }
  }
`;
export type VehicleTyreRunningKmResult = {
  vehicle: { id: string; tyrePositions: Array<{ code: string; runningKm: number | null }> } | null;
};

/**
 * The product and purchase price of the tyre on each listed position (null clears one). The product
 * must be the position's size, and the position must have a tyre. Moves carry them with the tyre.
 */
export const SET_VEHICLE_TYRE_POSITION_PRODUCTS = /* GraphQL */ `
  mutation SetVehicleTyrePositionProducts($vehicleId: ID!, $tyres: [TyrePositionProductInput!]!) {
    setVehicleTyrePositionProducts(vehicleId: $vehicleId, tyres: $tyres) {
      id
    }
  }
`;

export const SET_VEHICLE_AXLE_TYRE_SIZES = /* GraphQL */ `
  mutation SetVehicleAxleTyreSizes($vehicleId: ID!, $sizes: [AxleTyreSizeInput!]!) {
    setVehicleAxleTyreSizes(vehicleId: $vehicleId, sizes: $sizes) {
      id
    }
  }
`;

/** What happened to a tyre taken off the vehicle. */
export const TYRE_DISPOSITIONS = ["retreaded", "repaired", "scrapped", "store", "sold", "other"] as const;
export type TyreDisposition = (typeof TYRE_DISPOSITIONS)[number];

/** Every tyre position of a vehicle (spares included) with its size, product, price and the tyre on it now. */
export const VEHICLE_TYRE_POSITIONS = /* GraphQL */ `
  query VehicleTyrePositions($id: ID!) {
    vehicle(id: $id) {
      id
      spareTyreCount
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
        tyreProduct {
          id
          displayName
        }
        purchasePrice
        tyre {
          id
          serialNo
          status
          treadDepthMm
          product {
            displayName
          }
        }
        fitment {
          id
          fittedAt
        }
      }
    }
  }
`;
export type VehicleTyrePosition = {
  code: string;
  axleNo: number;
  side: "left" | "right" | null;
  placement: "single" | "inner" | "outer" | null;
  isSpare: boolean;
  sortOrder: number;
  /** Whether the position has a tyre (saved with saveVehicleTyrePlan; true by default where the axle has a size). */
  fitted: boolean;
  tyreSizeId: string | null;
  tyreSize: { id: string; name: string } | null;
  /** The product of the tyre on the position (it moves with the tyre; a new tyre has none), and its price. */
  tyreProductId: string | null;
  tyreProduct: { id: string; displayName: string } | null;
  purchasePrice: number | null;
  tyre: {
    id: string;
    serialNo: string;
    status: string;
    treadDepthMm: number | null;
    product: { displayName: string } | null;
  } | null;
  fitment: { id: string; fittedAt: string } | null;
};
export type VehicleTyrePositionsResult = {
  vehicle: { id: string; spareTyreCount: number; tyrePositions: VehicleTyrePosition[] } | null;
};

/**
 * Saves the tyre plan from the axle drawing in one go (API Doc §6.23): every position (spares included),
 * whether it has a tyre and, for a tyre moved or swapped there, `movedFrom` (it keeps its running km),
 * plus what happened to each tyre taken off. A position left empty by a move needs no removal. A new
 * tyre (no `movedFrom`) starts from 0 km; a removal on a position that stays fitted is a replacement.
 */
export const SAVE_VEHICLE_TYRE_PLAN = /* GraphQL */ `
  mutation SaveVehicleTyrePlan(
    $vehicleId: ID!
    $positions: [TyrePlanPositionInput!]!
    $removals: [TyrePlanRemovalInput!]
  ) {
    saveVehicleTyrePlan(vehicleId: $vehicleId, positions: $positions, removals: $removals) {
      id
    }
  }
`;
