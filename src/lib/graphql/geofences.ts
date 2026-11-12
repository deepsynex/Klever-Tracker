/**
 * Geofences (API Doc §6.2): named areas that fire `geofence_enter` / `geofence_exit` alerts for
 * the vehicles and vehicle groups assigned to them. Circle = centre + radiusM; polygon = area
 * (3+ points, the API closes the ring). deleteGeofence is a hard delete and also removes the
 * assignments. Route geofences need a path the API doesn't take yet (backend G6).
 */

export type GeofenceType = "circle" | "polygon" | "route";

export type Geofence = {
  id: string;
  companyId: string;
  name: string;
  address: string;
  type: GeofenceType | string;
  radiusM: number | null;
  isActive: boolean;
  centreLat: number | null;
  centreLng: number | null;
  /** GeoJSON Polygon string for polygon geofences. */
  areaGeoJson: string | null;
  createdAt: string;
  vehicleMemberships: Array<{ id: string; vehicleId: string }>;
  vehicleGroupMemberships: Array<{ id: string; vehicleGroupId: string }>;
};

export const GEOFENCES = /* GraphQL */ `
  query Geofences($first: Int!) {
    geofences(first: $first) {
      data {
        id
        companyId
        name
        address
        type
        radiusM
        isActive
        centreLat
        centreLng
        areaGeoJson
        createdAt
        vehicleMemberships {
          id
          vehicleId
        }
        vehicleGroupMemberships {
          id
          vehicleGroupId
        }
      }
    }
  }
`;
export type GeofencesResult = { geofences: { data: Geofence[] } };

export const CREATE_GEOFENCE = /* GraphQL */ `
  mutation CreateGeofence(
    $companyId: ID!
    $name: String!
    $address: String!
    $type: String!
    $radiusM: Float
    $isActive: Boolean
    $centre: GeoPointInput
    $area: [GeoPointInput!]
  ) {
    createGeofence(
      companyId: $companyId
      name: $name
      address: $address
      type: $type
      radiusM: $radiusM
      isActive: $isActive
      centre: $centre
      area: $area
    ) {
      id
    }
  }
`;

export const UPDATE_GEOFENCE = /* GraphQL */ `
  mutation UpdateGeofence(
    $id: ID!
    $name: String
    $address: String
    $type: String
    $radiusM: Float
    $isActive: Boolean
    $centre: GeoPointInput
    $area: [GeoPointInput!]
  ) {
    updateGeofence(id: $id, name: $name, address: $address, type: $type, radiusM: $radiusM, isActive: $isActive, centre: $centre, area: $area) {
      id
    }
  }
`;

export const DELETE_GEOFENCE = /* GraphQL */ `
  mutation DeleteGeofence($id: ID!) {
    deleteGeofence(id: $id) {
      id
    }
  }
`;

export const CREATE_GEOFENCE_VEHICLE = /* GraphQL */ `
  mutation CreateGeofenceVehicle($geofenceId: ID!, $vehicleId: ID!) {
    createGeofenceVehicle(geofenceId: $geofenceId, vehicleId: $vehicleId) {
      id
    }
  }
`;

export const DELETE_GEOFENCE_VEHICLE = /* GraphQL */ `
  mutation DeleteGeofenceVehicle($id: ID!) {
    deleteGeofenceVehicle(id: $id) {
      id
    }
  }
`;

export const CREATE_GEOFENCE_VEHICLE_GROUP = /* GraphQL */ `
  mutation CreateGeofenceVehicleGroup($geofenceId: ID!, $vehicleGroupId: ID!) {
    createGeofenceVehicleGroup(geofenceId: $geofenceId, vehicleGroupId: $vehicleGroupId) {
      id
    }
  }
`;

export const DELETE_GEOFENCE_VEHICLE_GROUP = /* GraphQL */ `
  mutation DeleteGeofenceVehicleGroup($id: ID!) {
    deleteGeofenceVehicleGroup(id: $id) {
      id
    }
  }
`;
