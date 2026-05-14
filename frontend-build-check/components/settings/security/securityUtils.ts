import toast from "react-hot-toast";
import type {
  ApiKeyScope,
  AuditLogEntry,
  SecurityAlertRecord,
} from "@/lib/security";

export const API_KEY_SCOPE_OPTIONS: Array<{
  value: ApiKeyScope;
  label: string;
  description: string;
}> = [
  {
    value: "READ_ONLY",
    label: "Read only",
    description: "Safe for reporting, analytics, and read access.",
  },
  {
    value: "WRITE",
    label: "Write",
    description: "Allows create and update operations for managed workflows.",
  },
  {
    value: "ADMIN",
    label: "Admin",
    description: "Full workspace API access. Use only for trusted systems.",
  },
];

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const shortDateFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});

export const formatDateTime = (value?: string | null) => {
  if (!value) {
    return "Not available";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "Invalid date";
  }

  return dateTimeFormatter.format(parsed);
};

export const formatShortDate = (value?: string | null) => {
  if (!value) {
    return "Not available";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "Invalid date";
  }

  return shortDateFormatter.format(parsed);
};

export const normalizeWorkspaceRole = (role?: string | null) => {
  const normalized = String(role || "").trim().toLowerCase();

  if (!normalized) {
    return "member";
  }

  if (normalized === "owner" || normalized === "admin") {
    return "admin";
  }

  return "member";
};

export const formatRoleLabel = (role?: string | null) => {
  const normalized = normalizeWorkspaceRole(role);
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
};

export const formatKeyName = (name?: string | null) =>
  name?.trim() || "Untitled key";

export const formatActionLabel = (action: string) =>
  action
    .split(/[._]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

export const formatUserLabel = (log: AuditLogEntry) => {
  if (log.user?.name?.trim()) {
    return log.user.name.trim();
  }

  if (log.user?.email?.trim()) {
    return log.user.email.trim();
  }

  if (log.userId?.trim()) {
    return log.userId.trim();
  }

  return "System";
};

export const formatUserSecondary = (log: AuditLogEntry) => {
  if (log.user?.email?.trim() && log.user?.name?.trim()) {
    return log.user.email.trim();
  }

  if (log.userId?.trim() && log.userId !== log.user?.email) {
    return `ID: ${log.userId}`;
  }

  return log.user?.role ? `Role: ${log.user.role}` : "Automated event";
};

export const formatStructuredData = (value: unknown) => {
  if (value == null) {
    return "No metadata";
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

export const matchesAuditSearch = (
  log: AuditLogEntry,
  searchTerm: string,
  actionTerm: string
) => {
  const normalizedUser = searchTerm.trim().toLowerCase();
  const normalizedAction = actionTerm.trim().toLowerCase();

  const userHaystack = [
    log.user?.name,
    log.user?.email,
    log.user?.role,
    log.userId,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const actionHaystack = [log.action, formatActionLabel(log.action)]
    .join(" ")
    .toLowerCase();

  const matchesUser =
    !normalizedUser || userHaystack.includes(normalizedUser);
  const matchesAction =
    !normalizedAction || actionHaystack.includes(normalizedAction);

  return matchesUser && matchesAction;
};

export const getAlertMeta = (type: string) => {
  switch (type) {
    case "MULTIPLE_FAILED_LOGIN_ATTEMPTS":
      return {
        label: "Failed login attempts",
        severity: "Medium",
        severityClass:
          "border-amber-200 bg-amber-50 text-amber-700",
      };
    case "INVALID_API_KEY_USAGE":
      return {
        label: "Invalid API usage",
        severity: "High",
        severityClass:
          "border-rose-200 bg-rose-50 text-rose-700",
      };
    case "SUSPICIOUS_ACTIVITY":
      return {
        label: "Suspicious activity",
        severity: "Critical",
        severityClass:
          "border-red-200 bg-red-50 text-red-700",
      };
    default:
      return {
        label: type
          .toLowerCase()
          .replace(/_/g, " ")
          .replace(/\b\w/g, (character) => character.toUpperCase()),
        severity: "Review",
        severityClass:
          "border-slate-200 bg-slate-100 text-slate-700",
      };
  }
};

const readMetadataRecord = (
  value: unknown
): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
};

export const describeAlert = (alert: SecurityAlertRecord) => {
  const metadata = readMetadataRecord(alert.metadata);

  if (alert.type === "MULTIPLE_FAILED_LOGIN_ATTEMPTS") {
    const attempts = metadata?.attempts;
    const ip = metadata?.ip;

    return `${attempts ?? "Several"} failed sign-in attempts detected${ip ? ` from ${ip}` : ""}.`;
  }

  if (alert.type === "INVALID_API_KEY_USAGE") {
    const method = metadata?.method;
    const path = metadata?.path;
    const ip = metadata?.ip;

    return `Invalid API key requests${method || path ? ` on ${[method, path].filter(Boolean).join(" ")}` : ""}${ip ? ` from ${ip}` : ""}.`;
  }

  if (alert.type === "SUSPICIOUS_ACTIVITY") {
    if (typeof metadata?.reason === "string" && metadata.reason.trim()) {
      return metadata.reason;
    }

    return "Activity pattern flagged for review by the security pipeline.";
  }

  return "Security event captured for operator review.";
};

export const copyText = async (
  value: string,
  successMessage = "Copied to clipboard"
) => {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(successMessage);
  } catch {
    toast.error("Copy failed");
  }
};
