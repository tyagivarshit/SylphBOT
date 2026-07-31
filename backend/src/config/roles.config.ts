export type AppRole = "OWNER" | "ADMIN" | "AGENT";

export type PermissionAction =
  | "billing:view"
  | "billing:manage"
  | "analytics:view"
  | "settings:view"
  | "settings:manage"
  | "security:manage"
  | "api_keys:manage"
  | "compliance:export"
  | "compliance:delete"
  | "messages:enqueue"
  | "executive:execute"
  | "policy:rollback";

export const ROLE_PERMISSIONS: Record<AppRole, PermissionAction[]> = {
  OWNER: [
    "billing:view",
    "billing:manage",
    "analytics:view",
    "settings:view",
    "settings:manage",
    "security:manage",
    "api_keys:manage",
    "compliance:export",
    "compliance:delete",
    "messages:enqueue",
    "policy:rollback",
    "executive:execute",
  ],
  ADMIN: [
    "billing:view",
    "billing:manage",
    "analytics:view",
    "settings:view",
    "settings:manage",
    "security:manage",
    "api_keys:manage",
    "compliance:export",
    "messages:enqueue",
    "executive:execute",
  ],
  AGENT: [
    "analytics:view",
    "settings:view",
    "messages:enqueue",
  ],
};

// Security Governance OS also uses a separate role called "SERVICE"
// which is a system-level role not exposed to standard AppRole normalizations.
export const DEFAULT_GOVERNANCE_ROLES: Array<{
  roleName: string;
  permissions: string[];
}> = [
  {
    roleName: "OWNER",
    permissions: [...ROLE_PERMISSIONS.OWNER],
  },
  {
    roleName: "ADMIN",
    permissions: [...ROLE_PERMISSIONS.ADMIN],
  },
  {
    roleName: "AGENT",
    permissions: [...ROLE_PERMISSIONS.AGENT],
  },
  {
    roleName: "SERVICE",
    permissions: [
      "messages:enqueue",
      "security:manage",
      "compliance:export",
      "billing:view",
      "analytics:view",
    ],
  },
];
