import { Suspense } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import ChangePassword from "@/components/settings/ChangePassword";
import DeleteAccount from "@/components/settings/DeleteAccount";

import BusinessSettings from "@/components/settings/BusinessSettings";
import BillingSettings from "@/components/settings/BillingSettings";
import NotificationSettings from "@/components/settings/NotificationsSettings";
import IntegrationsSettings from "@/components/settings/IntegrationsSettings";

export default function SettingsPage() {
  return (
    <div className="space-y-8">
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
          <div className="flex justify-end">
            <Link href="/settings/security" className="brand-button-primary">
              Open security center
              <ArrowRight size={16} />
            </Link>
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
