/**
 * Auth and Fleet operations exactly as documented in the Klever Tracker guide.
 *
 * These are typed by hand until the backend shares schema.graphql (api-alignment.md B2).
 * Then run `npm run codegen` and switch to the generated `graphql()` documents in src/gql.
 */

export const PING = /* GraphQL */ `
  query Ping {
    ping
  }
`;
export type PingResult = { ping: string };

export const LOGIN = /* GraphQL */ `
  mutation Login($email: String!, $password: String!) {
    login(email: $email, password: $password) {
      token
      user {
        id
        name
        email
      }
    }
  }
`;
export type LoginVariables = { email: string; password: string };
export type LoginResult = { login: { token: string; user: { id: string; name: string; email: string } } };

export const FORGOT_PASSWORD = /* GraphQL */ `
  mutation ForgotPassword($email: String!) {
    forgotPassword(email: $email)
  }
`;
export type ForgotPasswordResult = { forgotPassword: boolean };

export const RESET_PASSWORD = /* GraphQL */ `
  mutation ResetPassword($token: String!, $email: String!, $password: String!) {
    resetPassword(token: $token, email: $email, password: $password)
  }
`;
export type ResetPasswordVariables = { token: string; email: string; password: string };
export type ResetPasswordResult = { resetPassword: boolean };

/**
 * Vehicles query for tenant company
 */
export const GET_VEHICLES = /* GraphQL */ `
  query Vehicles($first: Int) {
    vehicles(first: $first) {
      data {
        id
        plateNo
        vehicleName
        vehicleType
        status
        odometerKm
      }
      paginatorInfo {
        total
      }
    }
  }
`;
export type VehicleItem = {
  id: string;
  plateNo: string;
  vehicleName?: string | null;
  vehicleType?: string | null;
  status?: string | null;
  odometerKm?: number | null;
};
export type VehiclesResult = {
  vehicles: {
    data: VehicleItem[];
    paginatorInfo?: { total: number };
  };
};

/**
 * Devices query for tenant company
 */
export const GET_DEVICES = /* GraphQL */ `
  query Devices($first: Int) {
    devices(first: $first) {
      data {
        id
        imei
        vehicleId
        status
      }
    }
  }
`;
export type DeviceItem = {
  id: string;
  imei: string;
  vehicleId?: string | null;
  status?: string | null;
};
export type DevicesResult = {
  devices: {
    data: DeviceItem[];
  };
};

/**
 * Routes query
 */
export const GET_ROUTES = /* GraphQL */ `
  query Routes {
    routes {
      data {
        id
        name
      }
    }
  }
`;
export type RouteItem = {
  id: string;
  name: string;
};
export type RoutesResult = {
  routes: {
    data: RouteItem[];
  };
};

/**
 * Route details with waypoints
 */
export const GET_ROUTE_DETAIL = /* GraphQL */ `
  query RouteDetail($id: ID!) {
    route(id: $id) {
      id
      name
      points {
        id
        sequence
        address
        locationLat
        locationLng
      }
    }
  }
`;
export type RoutePoint = {
  id: string;
  sequence: number;
  address?: string | null;
  locationLat?: number | null;
  locationLng?: number | null;
};
export type RouteDetailResult = {
  route: {
    id: string;
    name: string;
    points: RoutePoint[];
  } | null;
};

/**
 * Event types query
 */
export const GET_EVENT_TYPES = /* GraphQL */ `
  query EventTypes {
    eventTypes {
      data {
        id
        name
        code
      }
    }
  }
`;
export type EventTypeItem = {
  id: string;
  name: string;
  code: string;
};
export type EventTypesResult = {
  eventTypes: {
    data: EventTypeItem[];
  };
};

/**
 * Alert events query
 */
export const GET_ALERT_EVENTS = /* GraphQL */ `
  query AlertEvents {
    alertEvents {
      data {
        id
        eventTypeId
        vehicleId
        occurredAt
        acknowledgedAt
        resolvedAt
      }
    }
  }
`;
export type AlertEventItem = {
  id: string;
  eventTypeId: string;
  vehicleId: string;
  occurredAt: string;
  acknowledgedAt?: string | null;
  resolvedAt?: string | null;
};
export type AlertEventsResult = {
  alertEvents: {
    data: AlertEventItem[];
  };
};

/**
 * Position history query for vehicle or device
 */
export const GET_POSITION_HISTORY = /* GraphQL */ `
  query PositionHistory($vehicleId: ID, $deviceId: ID, $from: String, $to: String, $first: Int) {
    positionHistory(vehicleId: $vehicleId, deviceId: $deviceId, from: $from, to: $to, first: $first) {
      data {
        deviceId
        recordedAt
        locationLat
        locationLng
        speed
      }
      paginatorInfo {
        total
      }
    }
  }
`;
export type PositionHistoryPoint = {
  deviceId: string;
  recordedAt: string;
  locationLat: number | null;
  locationLng: number | null;
  speed: number | null;
};
export type PositionHistoryResult = {
  positionHistory: {
    data: PositionHistoryPoint[];
    paginatorInfo?: { total: number };
  };
};
