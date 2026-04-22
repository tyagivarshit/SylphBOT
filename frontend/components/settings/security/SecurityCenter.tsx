"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { startTransition } from "react";
import { ChevronRight, ShieldCheck } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import ApiKeysTab from "./ApiKeysTab";
import AuditLogsTab from "./AuditLogsTab";
import SecurityAlertsTab from "./SecurityAlertsTab";
import { formatRoleLabel } from "./securityUtils";

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
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <span className="brand-chip">
          <ShieldCheck size={14} />
          Current role: {formatRoleLabel(user?.role)}
        </span>
        <Link href="/settings" className="brand-button-secondary">
          General settings
          <ChevronRight size={16} />
        </Link>
      </div>

      <div className="brand-section-shell rounded-[30px] p-4 sm:p-5 lg:p-6">
        <div className="flex flex-wrap gap-2 border-b border-slate-200/80 pb-5">
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

        <div className="pt-5">
          {activeTab === "api-keys" ? <ApiKeysTab /> : null}
          {activeTab === "audit-logs" ? <AuditLogsTab /> : null}
          {activeTab === "security-alerts" ? <SecurityAlertsTab /> : null}
        </div>
      </div>
    </div>
  );
}
