import { Suspense } from "react";
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
