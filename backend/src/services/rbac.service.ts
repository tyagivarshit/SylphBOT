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
  | "messages:enqueue";

type Principal = {
  role?: string | null;
  permissions?: string[] | null;
};

const ROLE_PERMISSIONS: Record<AppRole, PermissionAction[]> = {
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
  ],
  AGENT: [
    "analytics:view",
    "settings:view",
    "messages:enqueue",
  ],
};

export const normalizeRole = (role: string | null | undefined): AppRole => {
  const normalized = String(role || "AGENT").trim().toUpperCase();

  if (normalized === "OWNER" || normalized === "ADMIN" || normalized === "AGENT") {
    return normalized;
  }

  return "AGENT";
};

export const getRolePermissions = (role: string | null | undefined) =>
  ROLE_PERMISSIONS[normalizeRole(role)];

export const hasPermission = (
  principal: Principal,
  action: PermissionAction
) => {
  const explicitPermissions = Array.isArray(principal.permissions)
    ? principal.permissions.filter(Boolean)
    : [];

  if (
    explicitPermissions.includes("*") ||
    explicitPermissions.includes(action)
  ) {
    return true;
  }

  return getRolePermissions(principal.role).includes(action);
};
