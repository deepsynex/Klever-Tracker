/**
 * Alert rules (API Doc §6.3): when an event type fires (overspeed, geofence enter…) for the
 * rule's vehicle, vehicle group or the whole company, notify its recipients in the app, by email
 * and/or by push. Recipients are users or plain email addresses; there is no update mutation for
 * a recipient, so changes are delete + create.
 *
 * CC: `isCc` on a recipient is a backend request (B10, see backend-requests/backend-changes.md).
 * The web asks the schema whether the field exists (RECIPIENT_FIELDS) and only then sends it.
 */

export type AlertRuleRecipient = {
  id: string;
  recipientType: "user" | "email" | string;
  userId: string | null;
  email: string | null;
  /** Present once the backend adds it (B10). */
  isCc?: boolean | null;
};

export type AlertRule = {
  id: string;
  companyId: string;
  eventTypeId: string;
  name: string;
  description: string | null;
  isActive: boolean;
  vehicleId: string | null;
  vehicleGroupId: string | null;
  notifyInApp: boolean;
  notifyPush: boolean;
  notifyEmail: boolean;
  emailSubject: string | null;
  emailMessage: string | null;
  minRepeatIntervalMinutes: number | null;
  recipients: AlertRuleRecipient[];
};

const RULE_FIELDS = `
  id
  companyId
  eventTypeId
  name
  description
  isActive
  vehicleId
  vehicleGroupId
  notifyInApp
  notifyPush
  notifyEmail
  emailSubject
  emailMessage
  minRepeatIntervalMinutes
`;

/** The rules, with or without the recipients' isCc (only ask for it once the schema has it). */
export function alertRulesQuery(withCc: boolean): string {
  return /* GraphQL */ `
    query AlertRules($first: Int!) {
      alertRules(first: $first) {
        data {
          ${RULE_FIELDS}
          recipients {
            id
            recipientType
            userId
            email
            ${withCc ? "isCc" : ""}
          }
        }
      }
      eventTypes(first: 100) {
        data {
          id
          name
          code
        }
      }
    }
  `;
}
export type AlertRulesResult = {
  alertRules: { data: AlertRule[] };
  eventTypes: { data: Array<{ id: string; name: string; code: string }> };
};

/** Which fields a recipient has: tells the web whether CC is available yet. */
export const RECIPIENT_FIELDS = /* GraphQL */ `
  query AlertRuleRecipientFields {
    __type(name: "AlertRuleRecipient") {
      fields {
        name
      }
    }
  }
`;
export type RecipientFieldsResult = { __type: { fields: Array<{ name: string }> } | null };

const RULE_ARGS = `
  $eventTypeId: ID!
  $name: String!
  $description: String
  $isActive: Boolean
  $vehicleId: ID
  $vehicleGroupId: ID
  $notifyInApp: Boolean
  $notifyPush: Boolean
  $notifyEmail: Boolean
  $emailSubject: String
  $emailMessage: String
  $minRepeatIntervalMinutes: Int
`;
const RULE_PASS = `
  eventTypeId: $eventTypeId
  name: $name
  description: $description
  isActive: $isActive
  vehicleId: $vehicleId
  vehicleGroupId: $vehicleGroupId
  notifyInApp: $notifyInApp
  notifyPush: $notifyPush
  notifyEmail: $notifyEmail
  emailSubject: $emailSubject
  emailMessage: $emailMessage
  minRepeatIntervalMinutes: $minRepeatIntervalMinutes
`;

export const CREATE_ALERT_RULE = /* GraphQL */ `
  mutation CreateAlertRule($companyId: ID!, ${RULE_ARGS}) {
    createAlertRule(companyId: $companyId, ${RULE_PASS}) {
      id
    }
  }
`;

export const UPDATE_ALERT_RULE = /* GraphQL */ `
  mutation UpdateAlertRule($id: ID!, ${RULE_ARGS}) {
    updateAlertRule(id: $id, ${RULE_PASS}) {
      id
    }
  }
`;

export const DELETE_ALERT_RULE = /* GraphQL */ `
  mutation DeleteAlertRule($id: ID!) {
    deleteAlertRule(id: $id) {
      id
    }
  }
`;

/** Adds a recipient; `withCc` sends isCc (only once the backend has it, B10). */
export function createRecipientMutation(withCc: boolean): string {
  return /* GraphQL */ `
    mutation CreateAlertRuleRecipient($alertRuleId: ID!, $recipientType: String!, $userId: ID, $email: String${withCc ? ", $isCc: Boolean" : ""}) {
      createAlertRuleRecipient(alertRuleId: $alertRuleId, recipientType: $recipientType, userId: $userId, email: $email${withCc ? ", isCc: $isCc" : ""}) {
        id
      }
    }
  `;
}

export const DELETE_ALERT_RULE_RECIPIENT = /* GraphQL */ `
  mutation DeleteAlertRuleRecipient($id: ID!) {
    deleteAlertRuleRecipient(id: $id) {
      id
    }
  }
`;

/** Users who can be picked as recipients (their email comes from their account). */
export const ALERT_USERS = /* GraphQL */ `
  query AlertRuleUsers($first: Int!) {
    users(first: $first) {
      data {
        id
        companyId
        name
        email
        status
      }
    }
  }
`;
export type AlertUsersResult = { users: { data: Array<{ id: string; companyId: string | null; name: string; email: string; status: string }> } };
