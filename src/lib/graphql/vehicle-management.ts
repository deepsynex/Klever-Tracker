/**
 * Vehicle Management (Masters) operations, typed by hand from the live schema (2026-10-28
 * changes included: vehicleTypeId, maintenanceTypeId/serviceTypeId, group in-charge,
 * vehicleConditionIn, VehicleDistanceLog). Field reference: "Docs from backend/Vehicle
 * Management Details.md". Switch to codegen once schema.graphql is shared (B2).
 *
 * The API has no list filters for these types, so lists are fetched in one page of
 * LIST_PAGE_SIZE rows and filtered on the client.
 */

export const LIST_PAGE_SIZE = 1000;

/** Polymorphic owner type for a vehicle's documents (insurance, Mulkiya, permits, ...). */
export const VEHICLE_DOCUMENTABLE_TYPE = "App\\Models\\Vehicle";

export type Paginated<T> = { data: T[]; paginatorInfo: { total: number } };

// ---------------------------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------------------------

export type LookupItem = { id: string; name: string; status: string };

export type Vehicle = {
  id: string;
  companyId: string;
  plateNo: string;
  vehicleName: string | null;
  vehicleTypeId: string;
  timezone: string | null;
  primaryDriverId: string | null;
  attendant1Id: string | null;
  attendant2Id: string | null;
  barcode: string | null;
  brand: string | null;
  model: string | null;
  colour: string | null;
  year: number | null;
  photoPath: string | null;
  comment: string | null;
  hasCanBus: boolean;
  installDate: string;
  paymentType: string;
  subscriptionExpiresAt: string | null;
  renewedAt: string | null;
  speedLimitKmh: number;
  idleLimitMinutes: number;
  odometerKm: number;
  lastServiceDate: string | null;
  lastOilChangeDate: string | null;
  lastTyreChangeDate: string | null;
  tyreIntervalKm: number | null;
  oilIntervalKm: number | null;
  serviceIntervalKm: number | null;
  machineServiceHours: number | null;
  trackingHoursFrom: string | null;
  trackingHoursTo: string | null;
  workingDays: string | null;
  purchaseDate: string | null;
  totalCost: number | null;
  downPayment: number | null;
  monthlyEmi: number | null;
  emiCount: number | null;
  emiDueDay: number | null;
  fuelType: string | null;
  fuelConsumptionRate: number | null;
  status: string;
};

export type Driver = {
  id: string;
  name: string;
  mobile: string;
  licenceNo: string | null;
  employeeId: string | null;
  status: string;
};

export type Device = { id: string; imei: string; model: string | null; vehicleId: string | null; status: string };
export type Sim = { id: string; simNumber: string | null; iccid: string; vehicleId: string | null };

export type VehicleDocument = {
  id: string;
  documentableType: string;
  documentableId: string;
  type: string;
  customLabel: string | null;
  documentNo: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
  filePath: string | null;
  reminderDaysBefore: number | null;
};

export type VehicleSensor = {
  id: string;
  vehicleId: string;
  sensorType: string;
  label: string | null;
  ioIndex: number | null;
  maxVoltage: number | null;
  lowLimit: number | null;
  highLimit: number | null;
  sortOrder: number;
};

export type VehicleFuelTank = {
  id: string;
  vehicleId: string;
  tankIndex: number;
  shape: string | null;
  volumeLitres: number | null;
  fuelCalibrationId: string | null;
  minimumRefillLitres: number | null;
};

export type VehicleAllocation = {
  id: string;
  vehicleId: string;
  driverId: string;
  project: string | null;
  allocatedAt: string;
  dueAt: string | null;
  vehicleConditionOut: string | null;
  startOdometerKm: number | null;
  returnedAt: string | null;
  returnOdometerKm: number | null;
  vehicleConditionIn: string | null;
  salikUsedAmount: number | null;
  trafficFinesAmount: number | null;
  damageChargeAmount: number | null;
  paymentMode: string | null;
  amount: number | null;
  status: string;
};

export type MaintenanceItem = {
  id: string;
  itemName: string;
  quantity: number;
  unitPrice: number | null;
  grossPrice: number | null;
};

export type MaintenanceRecord = {
  id: string;
  vehicleId: string;
  driverId: string | null;
  odometerKm: number | null;
  maintenanceTypeId: string | null;
  serviceTypeId: string | null;
  serviceDate: string | null;
  garageName: string | null;
  garageAddress: string | null;
  billNumber: string | null;
  extraWorkDone: string | null;
  discountAmount: number | null;
  discountPercent: number | null;
  subtotal: number | null;
  total: number | null;
  status: string;
  items: MaintenanceItem[];
};

export type VehicleGroup = {
  id: string;
  parentId: string | null;
  name: string;
  inchargeName: string | null;
  inchargeEmail: string | null;
  members: Array<{ id: string; vehicleId: string }>;
};

export type Shift = {
  id: string;
  name: string;
  fromTime: string;
  toTime: string;
  workingDays: string | null;
  vehicleAssignments: Array<{ id: string; vehicleId: string }>;
};

export type VehicleDistanceLog = {
  id: string;
  vehicleId: string;
  logDate: string;
  startOdometerKm: number | null;
  stopOdometerKm: number | null;
  distanceKm: number | null;
};

export type SharedLiveLocation = {
  id: string;
  vehicleId: string;
  shareToken: string;
  startsAt: string | null;
  expiresAt: string;
  createdAt: string;
};

export type FuelCalibrationPoint = { id: string; voltage: number; litres: number };
export type FuelCalibration = {
  id: string;
  name: string;
  tankCapacityLitres: number | null;
  minVoltage: number | null;
  maxVoltage: number | null;
  points: FuelCalibrationPoint[];
};

// ---------------------------------------------------------------------------------------------
// Shared lookups: every screen needs vehicle plates, driver names and the company id
// ---------------------------------------------------------------------------------------------

export const VM_LOOKUPS = /* GraphQL */ `
  query VmLookups($first: Int!) {
    companies(first: 1) {
      data {
        id
        name
        timezone
      }
    }
    vehicles(first: $first) {
      data {
        id
        plateNo
        vehicleName
        vehicleTypeId
        primaryDriverId
        odometerKm
        status
      }
    }
    drivers(first: $first) {
      data {
        id
        name
        mobile
        licenceNo
        employeeId
        status
      }
    }
    vehicleTypes(first: $first) {
      data {
        id
        name
        status
      }
    }
  }
`;
export type VmLookupVehicle = Pick<
  Vehicle,
  "id" | "plateNo" | "vehicleName" | "vehicleTypeId" | "primaryDriverId" | "odometerKm" | "status"
>;
export type VmLookupsResult = {
  companies: { data: Array<{ id: string; name: string; timezone: string }> };
  vehicles: { data: VmLookupVehicle[] };
  drivers: { data: Driver[] };
  vehicleTypes: { data: LookupItem[] };
};

export const CREATE_DRIVER = /* GraphQL */ `
  mutation CreateDriver($companyId: ID!, $name: String!, $mobile: String!, $licenceNo: String, $employeeId: String) {
    createDriver(companyId: $companyId, name: $name, mobile: $mobile, licenceNo: $licenceNo, employeeId: $employeeId) {
      id
      name
    }
  }
`;

// ---------------------------------------------------------------------------------------------
// Dropdown masters: Vehicle Type, Maintenance Type, Service Type (same shape)
// ---------------------------------------------------------------------------------------------

export type LookupKind = "vehicleType" | "maintenanceType" | "serviceType";

const lookupOps = (kind: LookupKind) => {
  const Type = kind[0].toUpperCase() + kind.slice(1);
  return {
    list: /* GraphQL */ `
      query ${Type}s($first: Int!) {
        ${kind}s(first: $first) {
          data {
            id
            name
            status
          }
        }
      }
    `,
    listField: `${kind}s` as const,
    create: /* GraphQL */ `
      mutation Create${Type}($companyId: ID!, $name: String!, $status: String) {
        create${Type}(companyId: $companyId, name: $name, status: $status) {
          id
          name
          status
        }
      }
    `,
    update: /* GraphQL */ `
      mutation Update${Type}($id: ID!, $name: String, $status: String) {
        update${Type}(id: $id, name: $name, status: $status) {
          id
        }
      }
    `,
    remove: /* GraphQL */ `
      mutation Delete${Type}($id: ID!) {
        delete${Type}(id: $id) {
          id
        }
      }
    `,
    createField: `create${Type}`,
  };
};

export const LOOKUP_OPS = {
  vehicleType: lookupOps("vehicleType"),
  maintenanceType: lookupOps("maintenanceType"),
  serviceType: lookupOps("serviceType"),
};

// ---------------------------------------------------------------------------------------------
// 1. Vehicle Details
// ---------------------------------------------------------------------------------------------

const VEHICLE_FIELDS = /* GraphQL */ `
  id
  companyId
  plateNo
  vehicleName
  vehicleTypeId
  timezone
  primaryDriverId
  attendant1Id
  attendant2Id
  barcode
  brand
  model
  colour
  year
  photoPath
  comment
  hasCanBus
  installDate
  paymentType
  subscriptionExpiresAt
  renewedAt
  speedLimitKmh
  idleLimitMinutes
  odometerKm
  lastServiceDate
  lastOilChangeDate
  lastTyreChangeDate
  tyreIntervalKm
  oilIntervalKm
  serviceIntervalKm
  machineServiceHours
  trackingHoursFrom
  trackingHoursTo
  workingDays
  purchaseDate
  totalCost
  downPayment
  monthlyEmi
  emiCount
  emiDueDay
  fuelType
  fuelConsumptionRate
  status
`;

const DOCUMENT_FIELDS = /* GraphQL */ `
  id
  documentableType
  documentableId
  type
  customLabel
  documentNo
  issuedAt
  expiresAt
  filePath
  reminderDaysBefore
`;

const SENSOR_FIELDS = /* GraphQL */ `
  id
  vehicleId
  sensorType
  label
  ioIndex
  maxVoltage
  lowLimit
  highLimit
  sortOrder
`;

const TANK_FIELDS = /* GraphQL */ `
  id
  vehicleId
  tankIndex
  shape
  volumeLitres
  fuelCalibrationId
  minimumRefillLitres
`;

/** The vehicles list with everything its columns need (device, SIM, document expiries). */
export const VEHICLES_PAGE = /* GraphQL */ `
  query VehiclesPage($first: Int!) {
    vehicles(first: $first) {
      data {
        ${VEHICLE_FIELDS}
      }
    }
    devices(first: $first) {
      data {
        id
        imei
        model
        vehicleId
        status
      }
    }
    sims(first: $first) {
      data {
        id
        simNumber
        iccid
        vehicleId
      }
    }
    documents(first: $first) {
      data {
        ${DOCUMENT_FIELDS}
      }
    }
  }
`;
export type VehiclesPageResult = {
  vehicles: { data: Vehicle[] };
  devices: { data: Device[] };
  sims: { data: Sim[] };
  documents: { data: VehicleDocument[] };
};

/** A vehicle's child records, for the edit panel. Filtered to the vehicle on the client. */
export const VEHICLE_CHILDREN = /* GraphQL */ `
  query VehicleChildren($first: Int!) {
    documents(first: $first) {
      data {
        ${DOCUMENT_FIELDS}
      }
    }
    vehicleSensors(first: $first) {
      data {
        ${SENSOR_FIELDS}
      }
    }
    vehicleFuelTanks(first: $first) {
      data {
        ${TANK_FIELDS}
      }
    }
    fuelCalibrations(first: $first) {
      data {
        id
        name
      }
    }
  }
`;
export type VehicleChildrenResult = {
  documents: { data: VehicleDocument[] };
  vehicleSensors: { data: VehicleSensor[] };
  vehicleFuelTanks: { data: VehicleFuelTank[] };
  fuelCalibrations: { data: Array<{ id: string; name: string }> };
};

const VEHICLE_ARGS_DECL = `
  $vehicleName: String, $vehicleTypeId: ID, $timezone: String, $primaryDriverId: ID,
  $barcode: String, $brand: String, $model: String, $colour: String, $year: Int, $photoPath: String,
  $comment: String, $hasCanBus: Boolean, $installDate: String, $paymentType: String,
  $subscriptionExpiresAt: String, $renewedAt: String, $speedLimitKmh: Int, $idleLimitMinutes: Int,
  $odometerKm: Float, $lastServiceDate: String, $lastOilChangeDate: String, $lastTyreChangeDate: String,
  $tyreIntervalKm: Int, $oilIntervalKm: Int, $serviceIntervalKm: Int, $machineServiceHours: Float,
  $trackingHoursFrom: String, $trackingHoursTo: String, $workingDays: String, $purchaseDate: String,
  $totalCost: Float, $downPayment: Float, $monthlyEmi: Float, $emiCount: Int, $emiDueDay: Int,
  $fuelType: String, $fuelConsumptionRate: Float, $status: String
`;
const VEHICLE_ARGS_PASS = `
  vehicleName: $vehicleName, timezone: $timezone, primaryDriverId: $primaryDriverId,
  barcode: $barcode, brand: $brand, model: $model, colour: $colour, year: $year, photoPath: $photoPath,
  comment: $comment, hasCanBus: $hasCanBus, subscriptionExpiresAt: $subscriptionExpiresAt,
  renewedAt: $renewedAt, odometerKm: $odometerKm, lastServiceDate: $lastServiceDate,
  lastOilChangeDate: $lastOilChangeDate, lastTyreChangeDate: $lastTyreChangeDate,
  tyreIntervalKm: $tyreIntervalKm, oilIntervalKm: $oilIntervalKm, serviceIntervalKm: $serviceIntervalKm,
  machineServiceHours: $machineServiceHours, trackingHoursFrom: $trackingHoursFrom,
  trackingHoursTo: $trackingHoursTo, workingDays: $workingDays, purchaseDate: $purchaseDate,
  totalCost: $totalCost, downPayment: $downPayment, monthlyEmi: $monthlyEmi, emiCount: $emiCount,
  emiDueDay: $emiDueDay, fuelType: $fuelType, fuelConsumptionRate: $fuelConsumptionRate, status: $status
`;

export const CREATE_VEHICLE = /* GraphQL */ `
  mutation CreateVehicle($companyId: ID!, $plateNo: String!, $vehicleTypeId: ID!, $installDate: String!,
    $paymentType: String!, $speedLimitKmh: Int!, $idleLimitMinutes: Int!, ${VEHICLE_ARGS_DECL
      .replace("$vehicleTypeId: ID,", "")
      .replace("$installDate: String,", "")
      .replace("$paymentType: String,", "")
      .replace("$speedLimitKmh: Int,", "")
      .replace("$idleLimitMinutes: Int,", "")}) {
    createVehicle(companyId: $companyId, plateNo: $plateNo, vehicleTypeId: $vehicleTypeId, installDate: $installDate,
      paymentType: $paymentType, speedLimitKmh: $speedLimitKmh, idleLimitMinutes: $idleLimitMinutes, ${VEHICLE_ARGS_PASS}) {
      id
    }
  }
`;

export const UPDATE_VEHICLE = /* GraphQL */ `
  mutation UpdateVehicle($id: ID!, $plateNo: String, ${VEHICLE_ARGS_DECL}) {
    updateVehicle(id: $id, plateNo: $plateNo, vehicleTypeId: $vehicleTypeId, installDate: $installDate,
      paymentType: $paymentType, speedLimitKmh: $speedLimitKmh, idleLimitMinutes: $idleLimitMinutes, ${VEHICLE_ARGS_PASS}) {
      id
    }
  }
`;

export const DELETE_VEHICLE = /* GraphQL */ `
  mutation DeleteVehicle($id: ID!) {
    deleteVehicle(id: $id) {
      id
    }
  }
`;

export const CREATE_DOCUMENT = /* GraphQL */ `
  mutation CreateDocument($companyId: ID!, $documentableType: String!, $documentableId: ID!, $type: String!,
    $customLabel: String, $documentNo: String, $issuedAt: String, $expiresAt: String, $filePath: String,
    $reminderDaysBefore: Int) {
    createDocument(companyId: $companyId, documentableType: $documentableType, documentableId: $documentableId,
      type: $type, customLabel: $customLabel, documentNo: $documentNo, issuedAt: $issuedAt, expiresAt: $expiresAt,
      filePath: $filePath, reminderDaysBefore: $reminderDaysBefore) {
      id
    }
  }
`;
export const UPDATE_DOCUMENT = /* GraphQL */ `
  mutation UpdateDocument($id: ID!, $customLabel: String, $documentNo: String, $issuedAt: String, $expiresAt: String,
    $filePath: String, $reminderDaysBefore: Int) {
    updateDocument(id: $id, customLabel: $customLabel, documentNo: $documentNo, issuedAt: $issuedAt,
      expiresAt: $expiresAt, filePath: $filePath, reminderDaysBefore: $reminderDaysBefore) {
      id
    }
  }
`;
export const DELETE_DOCUMENT = /* GraphQL */ `
  mutation DeleteDocument($id: ID!) {
    deleteDocument(id: $id) {
      id
    }
  }
`;

export const CREATE_SENSOR = /* GraphQL */ `
  mutation CreateVehicleSensor($vehicleId: ID!, $sensorType: String!, $label: String, $ioIndex: Int,
    $maxVoltage: Float, $lowLimit: Float, $highLimit: Float, $sortOrder: Int) {
    createVehicleSensor(vehicleId: $vehicleId, sensorType: $sensorType, label: $label, ioIndex: $ioIndex,
      maxVoltage: $maxVoltage, lowLimit: $lowLimit, highLimit: $highLimit, sortOrder: $sortOrder) {
      id
    }
  }
`;
export const UPDATE_SENSOR = /* GraphQL */ `
  mutation UpdateVehicleSensor($id: ID!, $label: String, $ioIndex: Int, $maxVoltage: Float, $lowLimit: Float,
    $highLimit: Float, $sortOrder: Int) {
    updateVehicleSensor(id: $id, label: $label, ioIndex: $ioIndex, maxVoltage: $maxVoltage, lowLimit: $lowLimit,
      highLimit: $highLimit, sortOrder: $sortOrder) {
      id
    }
  }
`;
export const DELETE_SENSOR = /* GraphQL */ `
  mutation DeleteVehicleSensor($id: ID!) {
    deleteVehicleSensor(id: $id) {
      id
    }
  }
`;

export const CREATE_FUEL_TANK = /* GraphQL */ `
  mutation CreateVehicleFuelTank($vehicleId: ID!, $tankIndex: Int, $shape: String, $volumeLitres: Float,
    $fuelCalibrationId: ID, $minimumRefillLitres: Float) {
    createVehicleFuelTank(vehicleId: $vehicleId, tankIndex: $tankIndex, shape: $shape, volumeLitres: $volumeLitres,
      fuelCalibrationId: $fuelCalibrationId, minimumRefillLitres: $minimumRefillLitres) {
      id
    }
  }
`;
export const UPDATE_FUEL_TANK = /* GraphQL */ `
  mutation UpdateVehicleFuelTank($id: ID!, $tankIndex: Int, $shape: String, $volumeLitres: Float,
    $fuelCalibrationId: ID, $minimumRefillLitres: Float) {
    updateVehicleFuelTank(id: $id, tankIndex: $tankIndex, shape: $shape, volumeLitres: $volumeLitres,
      fuelCalibrationId: $fuelCalibrationId, minimumRefillLitres: $minimumRefillLitres) {
      id
    }
  }
`;
export const DELETE_FUEL_TANK = /* GraphQL */ `
  mutation DeleteVehicleFuelTank($id: ID!) {
    deleteVehicleFuelTank(id: $id) {
      id
    }
  }
`;

// ---------------------------------------------------------------------------------------------
// 2 & 3. Allocate / Return
// ---------------------------------------------------------------------------------------------

export const ALLOCATIONS = /* GraphQL */ `
  query VehicleAllocations($first: Int!) {
    vehicleAllocations(first: $first) {
      data {
        id
        vehicleId
        driverId
        project
        allocatedAt
        dueAt
        vehicleConditionOut
        startOdometerKm
        returnedAt
        returnOdometerKm
        vehicleConditionIn
        salikUsedAmount
        trafficFinesAmount
        damageChargeAmount
        paymentMode
        amount
        status
      }
    }
  }
`;
export type AllocationsResult = { vehicleAllocations: { data: VehicleAllocation[] } };

export const CREATE_ALLOCATION = /* GraphQL */ `
  mutation CreateVehicleAllocation($vehicleId: ID!, $driverId: ID!, $project: String, $allocatedAt: String!,
    $dueAt: String, $vehicleConditionOut: String, $startOdometerKm: Float, $status: String) {
    createVehicleAllocation(vehicleId: $vehicleId, driverId: $driverId, project: $project, allocatedAt: $allocatedAt,
      dueAt: $dueAt, vehicleConditionOut: $vehicleConditionOut, startOdometerKm: $startOdometerKm, status: $status) {
      id
    }
  }
`;
export const UPDATE_ALLOCATION = /* GraphQL */ `
  mutation UpdateVehicleAllocation($id: ID!, $dueAt: String, $returnedAt: String, $returnOdometerKm: Float,
    $vehicleConditionIn: String, $salikUsedAmount: Float, $trafficFinesAmount: Float, $damageChargeAmount: Float,
    $paymentMode: String, $amount: Float, $status: String) {
    updateVehicleAllocation(id: $id, dueAt: $dueAt, returnedAt: $returnedAt, returnOdometerKm: $returnOdometerKm,
      vehicleConditionIn: $vehicleConditionIn, salikUsedAmount: $salikUsedAmount,
      trafficFinesAmount: $trafficFinesAmount, damageChargeAmount: $damageChargeAmount, paymentMode: $paymentMode,
      amount: $amount, status: $status) {
      id
    }
  }
`;
export const DELETE_ALLOCATION = /* GraphQL */ `
  mutation DeleteVehicleAllocation($id: ID!) {
    deleteVehicleAllocation(id: $id) {
      id
    }
  }
`;

// ---------------------------------------------------------------------------------------------
// 4. Maintenance
// ---------------------------------------------------------------------------------------------

export const MAINTENANCE_PAGE = /* GraphQL */ `
  query MaintenancePage($first: Int!) {
    maintenanceRecords(first: $first) {
      data {
        id
        vehicleId
        driverId
        odometerKm
        maintenanceTypeId
        serviceTypeId
        serviceDate
        garageName
        garageAddress
        billNumber
        extraWorkDone
        discountAmount
        discountPercent
        subtotal
        total
        status
        items {
          id
          itemName
          quantity
          unitPrice
          grossPrice
        }
      }
    }
    maintenanceTypes(first: $first) {
      data {
        id
        name
        status
      }
    }
    serviceTypes(first: $first) {
      data {
        id
        name
        status
      }
    }
  }
`;
export type MaintenancePageResult = {
  maintenanceRecords: { data: MaintenanceRecord[] };
  maintenanceTypes: { data: LookupItem[] };
  serviceTypes: { data: LookupItem[] };
};

const MAINTENANCE_ARGS_DECL = `$driverId: ID, $odometerKm: Float, $maintenanceTypeId: ID, $serviceTypeId: ID,
  $serviceDate: String, $garageName: String, $garageAddress: String, $billNumber: String, $extraWorkDone: String,
  $discountAmount: Float, $discountPercent: Float, $subtotal: Float, $total: Float, $status: String`;
const MAINTENANCE_ARGS_PASS = `driverId: $driverId, odometerKm: $odometerKm, maintenanceTypeId: $maintenanceTypeId,
  serviceTypeId: $serviceTypeId, serviceDate: $serviceDate, garageName: $garageName, garageAddress: $garageAddress,
  billNumber: $billNumber, extraWorkDone: $extraWorkDone, discountAmount: $discountAmount,
  discountPercent: $discountPercent, subtotal: $subtotal, total: $total, status: $status`;

export const CREATE_MAINTENANCE = /* GraphQL */ `
  mutation CreateMaintenanceRecord($companyId: ID!, $vehicleId: ID!, ${MAINTENANCE_ARGS_DECL}) {
    createMaintenanceRecord(companyId: $companyId, vehicleId: $vehicleId, ${MAINTENANCE_ARGS_PASS}) {
      id
    }
  }
`;
export const UPDATE_MAINTENANCE = /* GraphQL */ `
  mutation UpdateMaintenanceRecord($id: ID!, ${MAINTENANCE_ARGS_DECL}) {
    updateMaintenanceRecord(id: $id, ${MAINTENANCE_ARGS_PASS}) {
      id
    }
  }
`;
export const DELETE_MAINTENANCE = /* GraphQL */ `
  mutation DeleteMaintenanceRecord($id: ID!) {
    deleteMaintenanceRecord(id: $id) {
      id
    }
  }
`;
export const CREATE_MAINTENANCE_ITEM = /* GraphQL */ `
  mutation CreateMaintenanceItem($maintenanceRecordId: ID!, $itemName: String!, $quantity: Float, $unitPrice: Float,
    $grossPrice: Float) {
    createMaintenanceItem(maintenanceRecordId: $maintenanceRecordId, itemName: $itemName, quantity: $quantity,
      unitPrice: $unitPrice, grossPrice: $grossPrice) {
      id
    }
  }
`;
export const UPDATE_MAINTENANCE_ITEM = /* GraphQL */ `
  mutation UpdateMaintenanceItem($id: ID!, $itemName: String, $quantity: Float, $unitPrice: Float, $grossPrice: Float) {
    updateMaintenanceItem(id: $id, itemName: $itemName, quantity: $quantity, unitPrice: $unitPrice,
      grossPrice: $grossPrice) {
      id
    }
  }
`;
export const DELETE_MAINTENANCE_ITEM = /* GraphQL */ `
  mutation DeleteMaintenanceItem($id: ID!) {
    deleteMaintenanceItem(id: $id) {
      id
    }
  }
`;

// ---------------------------------------------------------------------------------------------
// 5. Temp sensors (same VehicleSensor API, temperature only)
// ---------------------------------------------------------------------------------------------

export const SENSORS = /* GraphQL */ `
  query VehicleSensors($first: Int!) {
    vehicleSensors(first: $first) {
      data {
        ${SENSOR_FIELDS}
      }
    }
  }
`;
export type SensorsResult = { vehicleSensors: { data: VehicleSensor[] } };

// ---------------------------------------------------------------------------------------------
// 6 & 7. Groups / Sub groups
// ---------------------------------------------------------------------------------------------

export const GROUPS = /* GraphQL */ `
  query VehicleGroups($first: Int!) {
    vehicleGroups(first: $first) {
      data {
        id
        parentId
        name
        inchargeName
        inchargeEmail
        members {
          id
          vehicleId
        }
      }
    }
  }
`;
export type GroupsResult = { vehicleGroups: { data: VehicleGroup[] } };

export const CREATE_GROUP = /* GraphQL */ `
  mutation CreateVehicleGroup($companyId: ID!, $parentId: ID, $name: String!, $inchargeName: String,
    $inchargeEmail: String) {
    createVehicleGroup(companyId: $companyId, parentId: $parentId, name: $name, inchargeName: $inchargeName,
      inchargeEmail: $inchargeEmail) {
      id
    }
  }
`;
export const UPDATE_GROUP = /* GraphQL */ `
  mutation UpdateVehicleGroup($id: ID!, $parentId: ID, $name: String, $inchargeName: String, $inchargeEmail: String) {
    updateVehicleGroup(id: $id, parentId: $parentId, name: $name, inchargeName: $inchargeName,
      inchargeEmail: $inchargeEmail) {
      id
    }
  }
`;
export const DELETE_GROUP = /* GraphQL */ `
  mutation DeleteVehicleGroup($id: ID!) {
    deleteVehicleGroup(id: $id) {
      id
    }
  }
`;
export const CREATE_GROUP_MEMBER = /* GraphQL */ `
  mutation CreateVehicleGroupMember($vehicleGroupId: ID!, $vehicleId: ID!) {
    createVehicleGroupMember(vehicleGroupId: $vehicleGroupId, vehicleId: $vehicleId) {
      id
    }
  }
`;
export const DELETE_GROUP_MEMBER = /* GraphQL */ `
  mutation DeleteVehicleGroupMember($id: ID!) {
    deleteVehicleGroupMember(id: $id) {
      id
    }
  }
`;

// ---------------------------------------------------------------------------------------------
// 8. Working hours (shifts)
// ---------------------------------------------------------------------------------------------

export const SHIFTS = /* GraphQL */ `
  query Shifts($first: Int!) {
    shifts(first: $first) {
      data {
        id
        name
        fromTime
        toTime
        workingDays
        vehicleAssignments {
          id
          vehicleId
        }
      }
    }
  }
`;
export type ShiftsResult = { shifts: { data: Shift[] } };

export const CREATE_SHIFT = /* GraphQL */ `
  mutation CreateShift($companyId: ID!, $name: String!, $fromTime: String!, $toTime: String!, $workingDays: String) {
    createShift(companyId: $companyId, name: $name, fromTime: $fromTime, toTime: $toTime, workingDays: $workingDays) {
      id
    }
  }
`;
export const UPDATE_SHIFT = /* GraphQL */ `
  mutation UpdateShift($id: ID!, $name: String, $fromTime: String, $toTime: String, $workingDays: String) {
    updateShift(id: $id, name: $name, fromTime: $fromTime, toTime: $toTime, workingDays: $workingDays) {
      id
    }
  }
`;
export const DELETE_SHIFT = /* GraphQL */ `
  mutation DeleteShift($id: ID!) {
    deleteShift(id: $id) {
      id
    }
  }
`;
export const CREATE_SHIFT_VEHICLE = /* GraphQL */ `
  mutation CreateShiftVehicle($shiftId: ID!, $vehicleId: ID!) {
    createShiftVehicle(shiftId: $shiftId, vehicleId: $vehicleId) {
      id
    }
  }
`;
export const DELETE_SHIFT_VEHICLE = /* GraphQL */ `
  mutation DeleteShiftVehicle($id: ID!) {
    deleteShiftVehicle(id: $id) {
      id
    }
  }
`;

// ---------------------------------------------------------------------------------------------
// 9. Vehicle distance
// ---------------------------------------------------------------------------------------------

export const DISTANCE_LOGS = /* GraphQL */ `
  query VehicleDistanceLogs($first: Int!) {
    vehicleDistanceLogs(first: $first) {
      data {
        id
        vehicleId
        logDate
        startOdometerKm
        stopOdometerKm
        distanceKm
      }
    }
  }
`;
export type DistanceLogsResult = { vehicleDistanceLogs: { data: VehicleDistanceLog[] } };

export const CREATE_DISTANCE_LOG = /* GraphQL */ `
  mutation CreateVehicleDistanceLog($vehicleId: ID!, $logDate: String!, $startOdometerKm: Float,
    $stopOdometerKm: Float, $distanceKm: Float) {
    createVehicleDistanceLog(vehicleId: $vehicleId, logDate: $logDate, startOdometerKm: $startOdometerKm,
      stopOdometerKm: $stopOdometerKm, distanceKm: $distanceKm) {
      id
    }
  }
`;
export const UPDATE_DISTANCE_LOG = /* GraphQL */ `
  mutation UpdateVehicleDistanceLog($id: ID!, $startOdometerKm: Float, $stopOdometerKm: Float, $distanceKm: Float) {
    updateVehicleDistanceLog(id: $id, startOdometerKm: $startOdometerKm, stopOdometerKm: $stopOdometerKm,
      distanceKm: $distanceKm) {
      id
    }
  }
`;
export const DELETE_DISTANCE_LOG = /* GraphQL */ `
  mutation DeleteVehicleDistanceLog($id: ID!) {
    deleteVehicleDistanceLog(id: $id) {
      id
    }
  }
`;

// ---------------------------------------------------------------------------------------------
// 10. Live location share links
// ---------------------------------------------------------------------------------------------

export const SHARED_LOCATIONS = /* GraphQL */ `
  query SharedLiveLocations($first: Int!) {
    sharedLiveLocations(first: $first) {
      data {
        id
        vehicleId
        shareToken
        startsAt
        expiresAt
        createdAt
      }
    }
  }
`;
export type SharedLocationsResult = { sharedLiveLocations: { data: SharedLiveLocation[] } };

export const CREATE_SHARED_LOCATION = /* GraphQL */ `
  mutation CreateSharedLiveLocation($vehicleId: ID!, $shareToken: String!, $startsAt: String, $expiresAt: String!) {
    createSharedLiveLocation(vehicleId: $vehicleId, shareToken: $shareToken, startsAt: $startsAt,
      expiresAt: $expiresAt) {
      id
    }
  }
`;
export const UPDATE_SHARED_LOCATION = /* GraphQL */ `
  mutation UpdateSharedLiveLocation($id: ID!, $expiresAt: String) {
    updateSharedLiveLocation(id: $id, expiresAt: $expiresAt) {
      id
    }
  }
`;
export const DELETE_SHARED_LOCATION = /* GraphQL */ `
  mutation DeleteSharedLiveLocation($id: ID!) {
    deleteSharedLiveLocation(id: $id) {
      id
    }
  }
`;

// ---------------------------------------------------------------------------------------------
// 11. Fuel calibration
// ---------------------------------------------------------------------------------------------

export const FUEL_CALIBRATIONS = /* GraphQL */ `
  query FuelCalibrations($first: Int!) {
    fuelCalibrations(first: $first) {
      data {
        id
        name
        tankCapacityLitres
        minVoltage
        maxVoltage
        points {
          id
          voltage
          litres
        }
      }
    }
  }
`;
export type FuelCalibrationsResult = { fuelCalibrations: { data: FuelCalibration[] } };

export const CREATE_FUEL_CALIBRATION = /* GraphQL */ `
  mutation CreateFuelCalibration($companyId: ID!, $name: String!, $tankCapacityLitres: Float, $minVoltage: Float,
    $maxVoltage: Float) {
    createFuelCalibration(companyId: $companyId, name: $name, tankCapacityLitres: $tankCapacityLitres,
      minVoltage: $minVoltage, maxVoltage: $maxVoltage) {
      id
    }
  }
`;
export const UPDATE_FUEL_CALIBRATION = /* GraphQL */ `
  mutation UpdateFuelCalibration($id: ID!, $name: String, $tankCapacityLitres: Float, $minVoltage: Float,
    $maxVoltage: Float) {
    updateFuelCalibration(id: $id, name: $name, tankCapacityLitres: $tankCapacityLitres, minVoltage: $minVoltage,
      maxVoltage: $maxVoltage) {
      id
    }
  }
`;
export const DELETE_FUEL_CALIBRATION = /* GraphQL */ `
  mutation DeleteFuelCalibration($id: ID!) {
    deleteFuelCalibration(id: $id) {
      id
    }
  }
`;
export const CREATE_FUEL_POINT = /* GraphQL */ `
  mutation CreateFuelCalibrationPoint($fuelCalibrationId: ID!, $voltage: Float!, $litres: Float!) {
    createFuelCalibrationPoint(fuelCalibrationId: $fuelCalibrationId, voltage: $voltage, litres: $litres) {
      id
    }
  }
`;
export const UPDATE_FUEL_POINT = /* GraphQL */ `
  mutation UpdateFuelCalibrationPoint($id: ID!, $voltage: Float, $litres: Float) {
    updateFuelCalibrationPoint(id: $id, voltage: $voltage, litres: $litres) {
      id
    }
  }
`;
export const DELETE_FUEL_POINT = /* GraphQL */ `
  mutation DeleteFuelCalibrationPoint($id: ID!) {
    deleteFuelCalibrationPoint(id: $id) {
      id
    }
  }
`;

// ---------------------------------------------------------------------------------------------
// Public tracking page (no sign-in): looks a share link up by its token
// ---------------------------------------------------------------------------------------------

/**
 * Public: needs no bearer token. Returns null for an unknown token, or outside the link's
 * startsAt–expiresAt window (checked by the server). The five position fields are null when the
 * vehicle has no device yet or its device hasn't sent a fix.
 */
export const SHARED_LOCATION_BY_TOKEN = /* GraphQL */ `
  query SharedLiveLocationByToken($shareToken: String!) {
    sharedLiveLocationByToken(shareToken: $shareToken) {
      vehicleId
      startsAt
      expiresAt
      plateNo
      latitude
      longitude
      speed
      heading
      positionRecordedAt
    }
  }
`;
export type SharedLocationPublic = {
  vehicleId: string;
  startsAt: string | null;
  expiresAt: string;
  plateNo: string | null;
  latitude: number | null;
  longitude: number | null;
  speed: number | null;
  heading: number | null;
  positionRecordedAt: string | null;
};
export type SharedLocationByTokenResult = { sharedLiveLocationByToken: SharedLocationPublic | null };
