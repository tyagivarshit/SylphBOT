export default function SupportPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">
          Help and Support
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Reach our team for billing, onboarding, or integration help.
        </p>
      </div>

      <div className="bg-white/80 backdrop-blur-xl border border-blue-100 rounded-2xl p-6 shadow-sm space-y-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900">
            Priority Support
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Response within one business day for workspace issues.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <a
            href="mailto:support@automexiaai.in"
            className="rounded-2xl border border-blue-100 bg-white/70 px-4 py-4 text-sm font-medium text-gray-900 transition hover:shadow-md"
          >
            support@automexiaai.in
          </a>

          <a
            href="/settings"
            className="rounded-2xl border border-blue-100 bg-white/70 px-4 py-4 text-sm font-medium text-gray-900 transition hover:shadow-md"
          >
            Open Settings
          </a>
        </div>
      </div>
    </div>
  );
}
