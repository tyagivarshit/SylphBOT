"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type ReactNode, startTransition } from "react";
import {
  BellRing,
  ChevronRight,
  KeyRound,
  ScrollText,
  ShieldCheck,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import PageHeader from "@/components/brand/PageHeader";
import ApiKeysTab from "./ApiKeysTab";
import AuditLogsTab from "./AuditLogsTab";
import SecurityAlertsTab from "./SecurityAlertsTab";
import { formatRoleLabel, normalizeWorkspaceRole } from "./securityUtils";

type SecurityTabId = "api-keys" | "audit-logs" | "security-alerts";

const SECURITY_TABS: Array<{
  id: SecurityTabId;
  label: string;
  description: string;
}> = [
  {
    id: "api-keys",
    label: "API Keys",
    description: "Issue, rotate, and revoke workspace credentials.",
  },
  {
    id: "audit-logs",
    label: "Audit Logs",
    description: "Review operator actions and structured metadata.",
  },
  {
    id: "security-alerts",
    label: "Security Alerts",
    description: "Monitor high-signal security events in one feed.",
  },
];

const isSecurityTab = (value: string | null): value is SecurityTabId =>
  SECURITY_TABS.some((tab) => tab.id === value);

export default function SecurityCenter() {
  const { user } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const activeTab = isSecurityTab(searchParams.get("tab"))
    ? (searchParams.get("tab") as SecurityTabId)
    : "api-keys";

  const workspaceRole = normalizeWorkspaceRole(user?.role);

  const setActiveTab = (tab: SecurityTabId) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    const nextUrl = `${pathname}?${params.toString()}`;

    startTransition(() => {
      router.replace(nextUrl as Parameters<typeof router.replace>[0], {
        scroll: false,
      });
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Security Center"
        title="Enterprise security controls"
        description="Run API credential lifecycle, audit visibility, and live security monitoring from a dedicated workspace command surface."
        chip={
          <span className="brand-chip">
            <ShieldCheck size={14} />
            Current role: {formatRoleLabel(user?.role)}
          </span>
        }
        action={
          <Link href="/settings" className="brand-button-secondary">
            General settings
            <ChevronRight size={16} />
          </Link>
        }
      />

      <div className="grid gap-3 md:grid-cols-3">
        <OverviewCard
          label="Role-based access"
          value={workspaceRole === "admin" ? "Admin" : "Member"}
          description="Actions in this panel respect tenant-aware RBAC permissions."
          icon={<ShieldCheck size={17} />}
        />
        <OverviewCard
          label="Tenant boundary"
          value={user?.businessId ? "Workspace scoped" : "Awaiting tenant"}
          description="All security data is constrained to the active business context."
          icon={<KeyRound size={17} />}
        />
        <OverviewCard
          label="Security telemetry"
          value="Keys, logs, alerts"
          description="Credential lifecycle, audit records, and alerting share one review surface."
          icon={<BellRing size={17} />}
        />
      </div>

      <div className="brand-section-shell rounded-[30px] p-4 sm:p-5 lg:p-6">
        <div className="flex flex-col gap-4 border-b border-slate-200/80 pb-5">
          <div className="flex flex-wrap gap-2">
            {SECURITY_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center rounded-2xl border px-4 py-2.5 text-sm font-semibold transition ${
                  tab.id === activeTab
                    ? "border-blue-200 bg-blue-50 text-blue-700"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <p className="max-w-3xl text-sm leading-6 text-slate-500">
            {
              SECURITY_TABS.find((tab) => tab.id === activeTab)?.description
            }
          </p>
        </div>

        <div className="pt-5">
          {activeTab === "api-keys" ? <ApiKeysTab /> : null}
          {activeTab === "audit-logs" ? <AuditLogsTab /> : null}
          {activeTab === "security-alerts" ? <SecurityAlertsTab /> : null}
        </div>
      </div>

      <div className="brand-info-strip rounded-[26px] p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[18px] bg-blue-50 text-blue-700">
            <ScrollText size={18} />
          </div>

          <div>
            <p className="text-sm font-semibold text-slate-950">
              Permission-aware by design
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              This panel reflects the access granted to your current role. If a
              tab is unavailable, an administrator can adjust your workspace
              permissions without changing the underlying backend behavior.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function OverviewCard({
  label,
  value,
  description,
  icon,
}: {
  label: string;
  value: string;
  description: string;
  icon: ReactNode;
}) {
  return (
    <div className="brand-kpi-card rounded-[24px] p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            {label}
          </p>
          <p className="mt-3 text-xl font-semibold tracking-tight text-slate-950">
            {value}
          </p>
        </div>

        <div className="flex h-10 w-10 items-center justify-center rounded-[16px] bg-blue-50 text-blue-700">
          {icon}
        </div>
      </div>

      <p className="mt-3 text-sm leading-6 text-slate-500">{description}</p>
    </div>
  );
}
