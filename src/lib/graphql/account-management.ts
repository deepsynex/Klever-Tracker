/**
 * Account Management (Masters) operations, typed by hand from the live schema (2026-10-29:
 * Company account fields, Driver app login and permit fields, UserDriver grants, changePassword,
 * DriverBehaviourSetting flags). Field reference: "Docs from backend/API Doc.md" sections 3, 6.1,
 * 6.13–6.15 and 6.17. Lists are fetched in one page and filtered on the client, like Vehicle
 * Management (see vehicle-management.ts).
 */
import type { Paginated } from "./vehicle-management";

// ---------------------------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------------------------

export type Company = {
  id: string;
  accountType: string;
  name: string;
  address: string | null;
  city: string;
  state: string;
  country: string;
  timezone: string;
  website: string | null;
  industry: string | null;
  logoPath: string | null;
  status: string;
  isTrial: boolean;
  taxExpiresAt: string | null;
  maxUsers: number | null;
  maxStaff: number | null;
  maxDrivers: number | null;
  paymentMode: string | null;
  totalCharge: number | null;
  invoicePath: string | null;
  tripCloseOnBarcode: boolean;
  offlineAlertsEnabled: boolean;
  createdBy: string | null;
  locationLat: number | null;
  locationLng: number | null;
};

export type CompanyContact = {
  id: string;
  companyId: string;
  name: string;
  email: string;
  phone: string;
  isPrimary: boolean;
  sortOrder: number;
};

export type User = {
  id: string;
  companyId: string | null;
  roleId: string;
  departmentId: string | null;
  name: string;
  username: string;
  email: string;
  mobile: string | null;
  address: string | null;
  photoPath: string | null;
  status: string;
  isAdmin: boolean;
};

export type Role = { id: string; companyId: string | null; name: string; status: string };
export type Department = { id: string; companyId: string; name: string };
export type Module = { id: string; name: string; code: string };
export type RolePermission = {
  id: string;
  roleId: string;
  moduleId: string;
  canView: boolean;
  canAdd: boolean;
  canEdit: boolean;
  canDelete: boolean;
};

/** A user → vehicle / user → driver visibility grant. */
export type AccessGrant = { id: string; userId: string };

export type AmDriver = {
  id: string;
  companyId: string;
  username: string | null;
  name: string;
  mobile: string;
  address: string | null;
  photoPath: string | null;
  nationality: string | null;
  bloodGroup: string | null;
  emergencyContactName: string | null;
  emergencyContactNumber: string | null;
  notes: string | null;
  employeeId: string | null;
  employmentStatus: string;
  employmentType: string | null;
  workingHoursPerDay: number | null;
  overtimeRate: number | null;
  licenceNo: string | null;
  licenceExpiryDate: string | null;
  visaExpiryDate: string | null;
  otherPermitName: string | null;
  otherPermitNo: string | null;
  permitExpiresAt: string | null;
  permitPdfPath: string | null;
  rfidTagId: string | null;
  canDriveHeavy: boolean;
  canDriveLight: boolean;
  status: string;
  userAccess: AccessGrant[];
};

export type DriverBehaviourSetting = {
  id: string;
  companyId: string;
  minimumMileageKm: number | null;
  topScore: number;
  displayAbsoluteValue: boolean;
  userCustomizedScore: boolean;
  weightHarshAcceleration: number | null;
  weightHarshBraking: number | null;
  weightExcessiveIdling: number | null;
  weightSpeeding: number | null;
  weightSeatbelt: number | null;
};

// ---------------------------------------------------------------------------------------------
// 1. Account (Company) + contacts
// ---------------------------------------------------------------------------------------------

const COMPANY_FIELDS = `
  id accountType name address city state country timezone website industry logoPath status
  isTrial taxExpiresAt maxUsers maxStaff maxDrivers paymentMode totalCharge invoicePath
  tripCloseOnBarcode offlineAlertsEnabled createdBy locationLat locationLng
`;

export const ACCOUNTS = /* GraphQL */ `
  query Accounts($first: Int!) {
    companies(first: $first) {
      data { ${COMPANY_FIELDS} }
    }
    companyContacts(first: $first) {
      data { id companyId name email phone isPrimary sortOrder }
    }
    users(first: $first) {
      data { id name isAdmin }
    }
  }
`;
export type AccountsResult = {
  companies: Paginated<Company>;
  companyContacts: Paginated<CompanyContact>;
  users: Paginated<Pick<User, "id" | "name" | "isAdmin">>;
};

const COMPANY_ARGS = `
  $accountType: String, $address: String, $timezone: String, $website: String, $industry: String,
  $logoPath: String, $status: String, $isTrial: Boolean, $taxExpiresAt: String, $maxUsers: Int,
  $maxStaff: Int, $maxDrivers: Int, $paymentMode: String, $totalCharge: Float, $invoicePath: String,
  $tripCloseOnBarcode: Boolean, $offlineAlertsEnabled: Boolean, $location: GeoPointInput
`;
const COMPANY_PASS = `
  accountType: $accountType, address: $address, timezone: $timezone, website: $website, industry: $industry,
  logoPath: $logoPath, status: $status, isTrial: $isTrial, taxExpiresAt: $taxExpiresAt, maxUsers: $maxUsers,
  maxStaff: $maxStaff, maxDrivers: $maxDrivers, paymentMode: $paymentMode, totalCharge: $totalCharge,
  invoicePath: $invoicePath, tripCloseOnBarcode: $tripCloseOnBarcode, offlineAlertsEnabled: $offlineAlertsEnabled,
  location: $location
`;

export const CREATE_COMPANY = /* GraphQL */ `
  mutation CreateCompany($name: String!, $city: String!, $state: String!, $country: String!, $createdBy: ID, ${COMPANY_ARGS}) {
    createCompany(name: $name, city: $city, state: $state, country: $country, createdBy: $createdBy, ${COMPANY_PASS}) {
      id
    }
  }
`;
export const UPDATE_COMPANY = /* GraphQL */ `
  mutation UpdateCompany($id: ID!, $name: String, $city: String, $state: String, $country: String, ${COMPANY_ARGS}) {
    updateCompany(id: $id, name: $name, city: $city, state: $state, country: $country, ${COMPANY_PASS}) {
      id
    }
  }
`;
export const DELETE_COMPANY = /* GraphQL */ `
  mutation DeleteCompany($id: ID!) {
    deleteCompany(id: $id) {
      id
    }
  }
`;

export const CREATE_COMPANY_CONTACT = /* GraphQL */ `
  mutation CreateCompanyContact($companyId: ID!, $name: String!, $email: String!, $phone: String!, $isPrimary: Boolean, $sortOrder: Int) {
    createCompanyContact(companyId: $companyId, name: $name, email: $email, phone: $phone, isPrimary: $isPrimary, sortOrder: $sortOrder) {
      id
    }
  }
`;
export const UPDATE_COMPANY_CONTACT = /* GraphQL */ `
  mutation UpdateCompanyContact($id: ID!, $name: String, $email: String, $phone: String, $isPrimary: Boolean, $sortOrder: Int) {
    updateCompanyContact(id: $id, name: $name, email: $email, phone: $phone, isPrimary: $isPrimary, sortOrder: $sortOrder) {
      id
    }
  }
`;
export const DELETE_COMPANY_CONTACT = /* GraphQL */ `
  mutation DeleteCompanyContact($id: ID!) {
    deleteCompanyContact(id: $id) {
      id
    }
  }
`;

// ---------------------------------------------------------------------------------------------
// 2. Users, roles, departments, vehicle / driver grants
// ---------------------------------------------------------------------------------------------

export const USERS = /* GraphQL */ `
  query Users($first: Int!) {
    users(first: $first) {
      data { id companyId roleId departmentId name username email mobile address photoPath status isAdmin }
    }
    roles(first: $first) {
      data { id companyId name status }
    }
    departments(first: $first) {
      data { id companyId name }
    }
    vehicles(first: $first) {
      data { id userAccess { id userId } }
    }
    drivers(first: $first) {
      data { id userAccess { id userId } }
    }
  }
`;
export type UsersResult = {
  users: Paginated<User>;
  roles: Paginated<Role>;
  departments: Paginated<Department>;
  vehicles: Paginated<{ id: string; userAccess: AccessGrant[] }>;
  drivers: Paginated<{ id: string; userAccess: AccessGrant[] }>;
};

const USER_ARGS = `
  $departmentId: ID, $mobile: String, $address: String, $photoPath: String, $status: String, $isAdmin: Boolean
`;
const USER_PASS = `
  departmentId: $departmentId, mobile: $mobile, address: $address, photoPath: $photoPath, status: $status, isAdmin: $isAdmin
`;
export const CREATE_USER = /* GraphQL */ `
  mutation CreateUser($companyId: ID, $roleId: ID!, $name: String!, $username: String!, $email: String!, $password: String!, ${USER_ARGS}) {
    createUser(companyId: $companyId, roleId: $roleId, name: $name, username: $username, email: $email, password: $password, ${USER_PASS}) {
      id
    }
  }
`;
export const UPDATE_USER = /* GraphQL */ `
  mutation UpdateUser($id: ID!, $roleId: ID, $name: String, $username: String, $email: String, $password: String, ${USER_ARGS}) {
    updateUser(id: $id, roleId: $roleId, name: $name, username: $username, email: $email, password: $password, ${USER_PASS}) {
      id
    }
  }
`;
export const DELETE_USER = /* GraphQL */ `
  mutation DeleteUser($id: ID!) {
    deleteUser(id: $id) {
      id
    }
  }
`;

export const CREATE_DEPARTMENT = /* GraphQL */ `
  mutation CreateDepartment($companyId: ID!, $name: String!) {
    createDepartment(companyId: $companyId, name: $name) {
      id
    }
  }
`;

export const GRANT_USER_VEHICLE = /* GraphQL */ `
  mutation GrantUserVehicleAccess($userId: ID!, $vehicleId: ID!) {
    grantUserVehicleAccess(userId: $userId, vehicleId: $vehicleId) {
      id
    }
  }
`;
export const REVOKE_USER_VEHICLE = /* GraphQL */ `
  mutation RevokeUserVehicleAccess($id: ID!) {
    revokeUserVehicleAccess(id: $id) {
      id
    }
  }
`;
export const GRANT_USER_DRIVER = /* GraphQL */ `
  mutation GrantUserDriverAccess($userId: ID!, $driverId: ID!) {
    grantUserDriverAccess(userId: $userId, driverId: $driverId) {
      id
    }
  }
`;
export const REVOKE_USER_DRIVER = /* GraphQL */ `
  mutation RevokeUserDriverAccess($id: ID!) {
    revokeUserDriverAccess(id: $id) {
      id
    }
  }
`;

// ---------------------------------------------------------------------------------------------
// 3. Drivers
// ---------------------------------------------------------------------------------------------

const DRIVER_FIELDS = `
  id companyId username name mobile address photoPath nationality bloodGroup emergencyContactName
  emergencyContactNumber notes employeeId employmentStatus employmentType workingHoursPerDay overtimeRate
  licenceNo licenceExpiryDate visaExpiryDate otherPermitName otherPermitNo permitExpiresAt permitPdfPath
  rfidTagId canDriveHeavy canDriveLight status userAccess { id userId }
`;

export const AM_DRIVERS = /* GraphQL */ `
  query AmDrivers($first: Int!) {
    drivers(first: $first) {
      data { ${DRIVER_FIELDS} }
    }
  }
`;
export type AmDriversResult = { drivers: Paginated<AmDriver> };

const DRIVER_ARGS = `
  $username: String, $password: String, $address: String, $photoPath: String, $nationality: String,
  $bloodGroup: String, $emergencyContactName: String, $emergencyContactNumber: String, $notes: String,
  $employeeId: String, $employmentStatus: String, $employmentType: String, $workingHoursPerDay: Float,
  $overtimeRate: Float, $licenceNo: String, $licenceExpiryDate: String, $visaExpiryDate: String,
  $otherPermitName: String, $otherPermitNo: String, $permitExpiresAt: String, $permitPdfPath: String,
  $rfidTagId: String, $canDriveHeavy: Boolean, $canDriveLight: Boolean, $status: String
`;
const DRIVER_PASS = `
  username: $username, password: $password, address: $address, photoPath: $photoPath, nationality: $nationality,
  bloodGroup: $bloodGroup, emergencyContactName: $emergencyContactName, emergencyContactNumber: $emergencyContactNumber,
  notes: $notes, employeeId: $employeeId, employmentStatus: $employmentStatus, employmentType: $employmentType,
  workingHoursPerDay: $workingHoursPerDay, overtimeRate: $overtimeRate, licenceNo: $licenceNo,
  licenceExpiryDate: $licenceExpiryDate, visaExpiryDate: $visaExpiryDate, otherPermitName: $otherPermitName,
  otherPermitNo: $otherPermitNo, permitExpiresAt: $permitExpiresAt, permitPdfPath: $permitPdfPath,
  rfidTagId: $rfidTagId, canDriveHeavy: $canDriveHeavy, canDriveLight: $canDriveLight, status: $status
`;
export const CREATE_AM_DRIVER = /* GraphQL */ `
  mutation CreateDriver($companyId: ID!, $name: String!, $mobile: String!, ${DRIVER_ARGS}) {
    createDriver(companyId: $companyId, name: $name, mobile: $mobile, ${DRIVER_PASS}) {
      id
    }
  }
`;
export const UPDATE_AM_DRIVER = /* GraphQL */ `
  mutation UpdateDriver($id: ID!, $name: String, $mobile: String, ${DRIVER_ARGS}) {
    updateDriver(id: $id, name: $name, mobile: $mobile, ${DRIVER_PASS}) {
      id
    }
  }
`;
export const DELETE_AM_DRIVER = /* GraphQL */ `
  mutation DeleteDriver($id: ID!) {
    deleteDriver(id: $id) {
      id
    }
  }
`;

// ---------------------------------------------------------------------------------------------
// 4. Menu Setting: roles and their module permissions
// ---------------------------------------------------------------------------------------------

export const ROLES = /* GraphQL */ `
  query Roles($first: Int!) {
    roles(first: $first) {
      data { id companyId name status }
    }
    modules(first: $first) {
      data { id name code }
    }
    rolePermissions(first: $first) {
      data { id roleId moduleId canView canAdd canEdit canDelete }
    }
  }
`;
export type RolesResult = {
  roles: Paginated<Role>;
  modules: Paginated<Module>;
  rolePermissions: Paginated<RolePermission>;
};

export const CREATE_ROLE = /* GraphQL */ `
  mutation CreateRole($companyId: ID, $name: String!, $status: String) {
    createRole(companyId: $companyId, name: $name, status: $status) {
      id
    }
  }
`;
export const UPDATE_ROLE = /* GraphQL */ `
  mutation UpdateRole($id: ID!, $name: String, $status: String) {
    updateRole(id: $id, name: $name, status: $status) {
      id
    }
  }
`;
export const DELETE_ROLE = /* GraphQL */ `
  mutation DeleteRole($id: ID!) {
    deleteRole(id: $id) {
      id
    }
  }
`;
export const CREATE_ROLE_PERMISSION = /* GraphQL */ `
  mutation CreateRolePermission($roleId: ID!, $moduleId: ID!, $canView: Boolean, $canAdd: Boolean, $canEdit: Boolean, $canDelete: Boolean) {
    createRolePermission(roleId: $roleId, moduleId: $moduleId, canView: $canView, canAdd: $canAdd, canEdit: $canEdit, canDelete: $canDelete) {
      id
    }
  }
`;
export const UPDATE_ROLE_PERMISSION = /* GraphQL */ `
  mutation UpdateRolePermission($id: ID!, $canView: Boolean, $canAdd: Boolean, $canEdit: Boolean, $canDelete: Boolean) {
    updateRolePermission(id: $id, canView: $canView, canAdd: $canAdd, canEdit: $canEdit, canDelete: $canDelete) {
      id
    }
  }
`;
export const DELETE_ROLE_PERMISSION = /* GraphQL */ `
  mutation DeleteRolePermission($id: ID!) {
    deleteRolePermission(id: $id) {
      id
    }
  }
`;

// ---------------------------------------------------------------------------------------------
// 5. Change password
// ---------------------------------------------------------------------------------------------

export const CHANGE_PASSWORD = /* GraphQL */ `
  mutation ChangePassword($oldPassword: String!, $newPassword: String!) {
    changePassword(oldPassword: $oldPassword, newPassword: $newPassword)
  }
`;

// ---------------------------------------------------------------------------------------------
// 6. Driver behaviour settings (one row per company)
// ---------------------------------------------------------------------------------------------

export const BEHAVIOUR_SETTINGS = /* GraphQL */ `
  query DriverBehaviourSettings($first: Int!) {
    driverBehaviourSettings(first: $first) {
      data {
        id companyId minimumMileageKm topScore displayAbsoluteValue userCustomizedScore
        weightHarshAcceleration weightHarshBraking weightExcessiveIdling weightSpeeding weightSeatbelt
      }
    }
  }
`;
export type BehaviourSettingsResult = { driverBehaviourSettings: Paginated<DriverBehaviourSetting> };

const BEHAVIOUR_ARGS = `
  $minimumMileageKm: Float, $topScore: Int, $displayAbsoluteValue: Boolean, $userCustomizedScore: Boolean,
  $weightHarshAcceleration: Float, $weightHarshBraking: Float, $weightExcessiveIdling: Float,
  $weightSpeeding: Float, $weightSeatbelt: Float
`;
const BEHAVIOUR_PASS = `
  minimumMileageKm: $minimumMileageKm, topScore: $topScore, displayAbsoluteValue: $displayAbsoluteValue,
  userCustomizedScore: $userCustomizedScore, weightHarshAcceleration: $weightHarshAcceleration,
  weightHarshBraking: $weightHarshBraking, weightExcessiveIdling: $weightExcessiveIdling,
  weightSpeeding: $weightSpeeding, weightSeatbelt: $weightSeatbelt
`;
export const CREATE_BEHAVIOUR_SETTING = /* GraphQL */ `
  mutation CreateDriverBehaviourSetting($companyId: ID!, ${BEHAVIOUR_ARGS}) {
    createDriverBehaviourSetting(companyId: $companyId, ${BEHAVIOUR_PASS}) {
      id
    }
  }
`;
export const UPDATE_BEHAVIOUR_SETTING = /* GraphQL */ `
  mutation UpdateDriverBehaviourSetting($id: ID!, ${BEHAVIOUR_ARGS}) {
    updateDriverBehaviourSetting(id: $id, ${BEHAVIOUR_PASS}) {
      id
    }
  }
`;
export const DELETE_BEHAVIOUR_SETTING = /* GraphQL */ `
  mutation DeleteDriverBehaviourSetting($id: ID!) {
    deleteDriverBehaviourSetting(id: $id) {
      id
    }
  }
`;
