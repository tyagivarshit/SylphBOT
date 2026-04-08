import { Suspense } from "react";
import ChangePassword from "@/components/settings/ChangePassword";
import DeleteAccount from "@/components/settings/DeleteAccount";

import BusinessSettings from "@/components/settings/BusinessSettings";
import BillingSettings from "@/components/settings/BillingSettings";
import NotificationSettings from "@/components/settings/NotificationsSettings";
import IntegrationsSettings from "@/components/settings/IntegrationsSettings";

export default function SettingsPage() {
  return (
    <div className="space-y-10">

      {/* HEADER */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">
          Settings
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Manage your account, billing and integrations
        </p>
      </div>

      {/* INTEGRATIONS (TOP PRIORITY) */}
      <div className="space-y-4">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Integrations
        </h2>
        <div className="bg-white/80 backdrop-blur-xl border border-blue-100 rounded-2xl p-5 shadow-sm">
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
        <div className="bg-white/80 backdrop-blur-xl border border-blue-100 rounded-2xl p-5 shadow-sm">
          <BusinessSettings />
        </div>
      </div>

      {/* BILLING */}
      <div className="space-y-4">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Billing
        </h2>
        <div className="bg-white/80 backdrop-blur-xl border border-blue-100 rounded-2xl p-5 shadow-sm">
          <BillingSettings />
        </div>
      </div>

      {/* NOTIFICATIONS */}
      <div className="space-y-4">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Notifications
        </h2>
        <div className="bg-white/80 backdrop-blur-xl border border-blue-100 rounded-2xl p-5 shadow-sm">
          <NotificationSettings />
        </div>
      </div>

      {/* ACCOUNT ACTIONS */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
          Account Actions
        </h2>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white/80 backdrop-blur-xl border border-blue-100 rounded-2xl p-5 shadow-sm">
            <ChangePassword />
          </div>

          <div className="bg-white/80 backdrop-blur-xl border border-blue-100 rounded-2xl p-5 shadow-sm">
            <DeleteAccount />
          </div>
        </div>
      </div>

    </div>
  );
}
