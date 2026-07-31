import {
  type AppRole,
  type PermissionAction,
  ROLE_PERMISSIONS,
} from "../config/roles.config";

export { type AppRole, type PermissionAction };

type Principal = {
  role?: string | null;
  permissions?: string[] | null;
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
