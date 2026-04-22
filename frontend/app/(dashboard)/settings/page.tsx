import { type ReactNode, Suspense } from "react";
import Link from "next/link";
import { ArrowRight, BellRing, KeyRound, ShieldCheck, ScrollText } from "lucide-react";
import ChangePassword from "@/components/settings/ChangePassword";
import DeleteAccount from "@/components/settings/DeleteAccount";

import BusinessSettings from "@/components/settings/BusinessSettings";
import BillingSettings from "@/components/settings/BillingSettings";
import NotificationSettings from "@/components/settings/NotificationsSettings";
import IntegrationsSettings from "@/components/settings/IntegrationsSettings";

export default function SettingsPage() {
  return (
    <div className="space-y-8">
      <div className="brand-info-strip rounded-[26px] p-4 sm:p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
          Workspace controls
        </p>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
          Manage integrations, billing preferences, notifications, and account
          security from one organized command surface.
        </p>
      </div>

      <div className="space-y-4">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Integrations
        </h2>
        <div className="brand-section-shell rounded-[28px] p-5">
          <Suspense
            fallback={
              <div className="text-sm text-gray-500 animate-pulse">
                Loading integrations...
              </div>
            }
          >
            <IntegrationsSettings />
          </Suspense>
        </div>
      </div>

      {/* BUSINESS */}
      <div className="space-y-4">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Business
        </h2>
        <div className="brand-section-shell rounded-[28px] p-5">
          <BusinessSettings />
        </div>
      </div>

      {/* BILLING */}
      <div className="space-y-4">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Billing
        </h2>
        <div className="brand-section-shell rounded-[28px] p-5">
          <BillingSettings />
        </div>
      </div>

      {/* NOTIFICATIONS */}
      <div className="space-y-4">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Notifications
        </h2>
        <div className="brand-section-shell rounded-[28px] p-5">
          <NotificationSettings />
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Security
        </h2>
        <div className="brand-section-shell rounded-[28px] p-5">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-lg font-semibold text-slate-950">
                Enterprise security center
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Manage API credentials, inspect audit trails, and review live
                security alerts from one dedicated control surface.
              </p>
            </div>

            <Link href="/settings/security" className="brand-button-primary">
              Open security center
              <ArrowRight size={16} />
            </Link>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <SecurityFeatureCard
              icon={<KeyRound size={16} />}
              title="API key lifecycle"
              description="Create, rotate, revoke, and reveal secrets one time only."
            />
            <SecurityFeatureCard
              icon={<ScrollText size={16} />}
              title="Audit visibility"
              description="Review operator activity with timestamps and structured metadata."
            />
            <SecurityFeatureCard
              icon={<BellRing size={16} />}
              title="Security alerts"
              description="Track failed logins, invalid API usage, and suspicious events."
            />
          </div>

          <div className="mt-5 rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
            <div className="flex items-start gap-3">
              <ShieldCheck size={18} className="mt-0.5 shrink-0 text-blue-600" />
              <p className="leading-6">
                The new security surface is role-aware and tenant-scoped, so
                teams can review access without changing backend logic or
                existing billing and authentication behavior.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ACCOUNT ACTIONS */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
          Account Actions
        </h2>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="brand-section-shell rounded-[28px] p-5">
            <ChangePassword />
          </div>

          <div className="brand-section-shell rounded-[28px] p-5">
            <DeleteAccount />
          </div>
        </div>
      </div>

    </div>
  );
}

function SecurityFeatureCard({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-[22px] border border-slate-200 bg-white/80 p-4">
      <div className="flex h-10 w-10 items-center justify-center rounded-[16px] bg-blue-50 text-blue-700">
        {icon}
      </div>
      <p className="mt-4 text-sm font-semibold text-slate-950">{title}</p>
      <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
    </div>
  );
}
