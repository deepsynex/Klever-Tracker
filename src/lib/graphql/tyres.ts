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
export type VehicleApplication = (typeof VEHICLE_APPLICATIONS)[number];

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
export type AxleConfiguration = { id: string; code: string; name: string; positions: AxlePosition[] };

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

const CUSTOMER_FIELDS = `id companyId name area emirate country email contactName contactPhone address status`;

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

const CUSTOMER_VEHICLE_FIELDS = `id companyId customerId plateNo vehicleName vehicleTypeId axleConfigurationId application
  dailyAvgRunningKm photoPath status`;

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
  $dailyAvgRunningKm: Float, $photoPath: String, $status: String`;
const CV_PASS = `vehicleName: $vehicleName, customerId: $customerId, axleConfigurationId: $axleConfigurationId,
  application: $application, dailyAvgRunningKm: $dailyAvgRunningKm, photoPath: $photoPath, status: $status`;

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

// ---------------------------------------------------------------------------------------------
// Tyre masters
// ---------------------------------------------------------------------------------------------

/** Sizes, brands, products and recommendations in one request: the masters screen's tabs and counts. */
export const TYRE_MASTERS = /* GraphQL */ `
  query TyreMasters($first: Int!) {
    tyreSizes(first: $first) {
      data {
        id
        companyId
        name
      }
    }
    tyreBrands(first: $first) {
      data {
        id
        companyId
        name
      }
    }
    tyreProducts(first: $first) {
      data {
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

/** Create / update / delete for the two name-only masters. */
export const TYRE_NAMED_OPS: Record<
  TyreNamedKind,
  { create: string; update: string; remove: string; createField: string }
> = {
  size: {
    create: `mutation CreateTyreSize($companyId: ID!, $name: String!) { createTyreSize(companyId: $companyId, name: $name) { id } }`,
    update: `mutation UpdateTyreSize($id: ID!, $name: String) { updateTyreSize(id: $id, name: $name) { id } }`,
    remove: `mutation DeleteTyreSize($id: ID!) { deleteTyreSize(id: $id) { id } }`,
    createField: "createTyreSize",
  },
  brand: {
    create: `mutation CreateTyreBrand($companyId: ID!, $name: String!) { createTyreBrand(companyId: $companyId, name: $name) { id } }`,
    update: `mutation UpdateTyreBrand($id: ID!, $name: String) { updateTyreBrand(id: $id, name: $name) { id } }`,
    remove: `mutation DeleteTyreBrand($id: ID!) { deleteTyreBrand(id: $id) { id } }`,
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
