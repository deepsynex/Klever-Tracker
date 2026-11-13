import "server-only";
import { kleverFetch } from "@/lib/graphql/klever";
import type { MutationAuditEntry } from "./mutation-audit";

/**
 * Saves audit entries for a change made through the app (see mutation-audit.ts). Runs after the
 * response has been sent (next/server `after`), so it never slows the page down; a failure is
 * logged, never shown. Who did it comes from `me` (the token's own user). The company is the
 * record's, else the user's, else the company picked in the app (platform staff).
 */

const ME = /* GraphQL */ `
  query AuditMe {
    me {
      id
      companyId
    }
  }
`;

const CREATE_AUDIT_LOG = /* GraphQL */ `
  mutation CreateAuditLog($userId: ID, $companyId: ID, $action: String!, $auditableType: String, $auditableId: ID, $newValues: String, $ipAddress: String) {
    createAuditLog(userId: $userId, companyId: $companyId, action: $action, auditableType: $auditableType, auditableId: $auditableId, newValues: $newValues, ipAddress: $ipAddress) {
      id
    }
  }
`;

export async function writeAuditEntries(token: string, entries: MutationAuditEntry[], pickedCompanyId: string | null, ipAddress: string | null): Promise<void> {
  try {
    const meRes = await kleverFetch(JSON.stringify({ query: ME }), token);
    const me = (JSON.parse(meRes.text) as { data?: { me?: { id: string; companyId: string | null } } }).data?.me;
    for (const e of entries) {
      const res = await kleverFetch(
        JSON.stringify({
          query: CREATE_AUDIT_LOG,
          variables: {
            userId: me?.id ?? null,
            companyId: e.companyId ?? me?.companyId ?? pickedCompanyId,
            action: e.action,
            auditableType: e.auditableType,
            auditableId: e.auditableId,
            newValues: e.newValues,
            ipAddress,
          },
        }),
        token,
      );
      if (res.status !== 200 || res.text.includes('"errors"')) console.warn(`Audit entry "${e.action}" not saved: HTTP ${res.status} ${res.text.slice(0, 200)}`);
    }
  } catch (err) {
    console.warn("Audit entries not saved:", err);
  }
}
