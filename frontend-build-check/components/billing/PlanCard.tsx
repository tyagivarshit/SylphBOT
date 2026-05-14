"use client";

type Plan = {
  id: string;
  name: string;
  price: string;
  isCurrent?: boolean;
  popular?: boolean;
};

const FEATURE_MAP: Record<string, string[]> = {
  BASIC: [
    "Instagram DM automation",
    "Comment auto-replies",
    "Comment → DM lead capture",
    "Up to 5 automation workflows",
    "Basic AI response system",
  ],

  PRO: [
    "Instagram DM & comment automation",
    "WhatsApp automation (full funnel)",
    "Built-in CRM (lead tracking)",
    "Automated follow-ups",
    "Custom follow-up sequences",
    "Unlimited automation workflows",
    "Priority support",
  ],

  ELITE: [
    "All automation channels (Instagram + WhatsApp)",
    "AI booking & scheduling system",
    "Auto meeting scheduling via chat",
    "Advanced workflow automation",
    "Unlimited usage (no limits)",
    "Dedicated priority support",
  ],
};

export default function PlanCard({
  plan,
  onClick,
  loading,
}: {
  plan: Plan;
  onClick: () => void;
  loading: boolean;
}) {
  const features = FEATURE_MAP[plan.id] || [];

  return (
    <div
      className={`relative rounded-2xl p-[1px] transition-all duration-300
      ${
        plan.popular
          ? "bg-gradient-to-r from-blue-600 via-cyan-500 to-blue-500"
          : "bg-blue-100"
      }`}
    >
      <div
        className={`bg-white/80 backdrop-blur-xl rounded-2xl p-6 h-full flex flex-col justify-between transition-all
        ${
          plan.isCurrent
            ? "shadow-xl scale-[1.02]"
            : "hover:shadow-2xl hover:-translate-y-1"
        }`}
      >

        {/* 🔥 POPULAR */}
        {plan.popular && (
          <div className="absolute -top-3 left-1/2 -translate-x-1/2">
            <span className="text-xs bg-gradient-to-r from-blue-600 to-cyan-500 text-white px-3 py-1 rounded-full shadow-md">
              Most Popular
            </span>
          </div>
        )}

        <div className="space-y-5">

          {/* 🔥 HEADER */}
          <div className="flex items-center justify-between">
            <h2 className="text-lg md:text-xl font-semibold text-gray-900">
              {plan.name}
            </h2>

            {plan.isCurrent && (
              <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-md font-medium">
                Active
              </span>
            )}
          </div>

          {/* 🔥 PRICE */}
          <div>
            <p className="text-3xl md:text-4xl font-bold text-gray-900 tracking-tight">
              {plan.price}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              per month
            </p>
          </div>

          {/* 🔥 DIVIDER */}
          <div className="h-px bg-blue-100" />

          {/* 🔥 FEATURES */}
          <ul className="space-y-3">
            {features.map((f, index) => (
              <li
                key={index}
                className="flex items-start gap-3 text-sm text-gray-700"
              >
                <span className="text-blue-600 mt-[2px]">✔</span>
                <span>{f}</span>
              </li>
            ))}
          </ul>

        </div>

        {/* 🔥 CTA */}
        <button
          onClick={onClick}
          disabled={loading || plan.isCurrent}
          className={`mt-6 w-full py-2.5 rounded-xl text-sm font-semibold transition-all
          ${
            plan.isCurrent
              ? "bg-gray-200 text-gray-600 cursor-not-allowed"
              : "bg-gradient-to-r from-blue-600 to-cyan-500 text-white hover:shadow-lg shadow-md active:scale-[0.98]"
          }`}
        >
          {plan.isCurrent
            ? "Current Plan"
            : loading
            ? "Processing..."
            : "Start Free Trial"}
        </button>

      </div>
    </div>
  );
}