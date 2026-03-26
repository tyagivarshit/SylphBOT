"use client";

type Plan = {
  id: string;
  name: string;
  price: string;
  features: string[];
  isCurrent?: boolean;
  popular?: boolean;
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
  return (
    <div
      className={`relative bg-white border rounded-2xl p-6 flex flex-col justify-between transition-all duration-300 
      ${
        plan.isCurrent
          ? "border-black shadow-lg scale-[1.02]"
          : "border-gray-300 hover:shadow-2xl hover:-translate-y-1"
      }`}
    >
      {/* 🔥 POPULAR TAG */}
      {plan.popular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="text-xs bg-black text-white px-3 py-1 rounded-full shadow">
            Most Popular
          </span>
        </div>
      )}

      <div className="space-y-5">
        {/* HEADER */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            {plan.name}
          </h2>

          {plan.isCurrent && (
            <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-md font-medium">
              Active
            </span>
          )}
        </div>

        {/* PRICE */}
        <div>
          <p className="text-3xl font-bold text-gray-900">
            {plan.price}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            per month
          </p>
        </div>

        {/* DIVIDER */}
        <div className="h-px bg-gray-200" />

        {/* FEATURES */}
        <ul className="space-y-3">
          {plan.features.map((f, index) => (
            <li
              key={index}
              className="flex items-start gap-3 text-sm text-gray-700"
            >
              <span className="text-green-600 mt-[2px]">✔</span>
              <span>{f}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* CTA */}
      <button
        onClick={onClick}
        disabled={loading || plan.isCurrent}
        className={`mt-6 w-full py-2.5 rounded-lg text-sm font-semibold transition 
        ${
          plan.isCurrent
            ? "bg-gray-200 text-gray-600 cursor-not-allowed"
            : "bg-black text-white hover:bg-gray-800"
        }`}
      >
        {plan.isCurrent
          ? "Current Plan"
          : loading
          ? "Processing..."
          : "Upgrade Plan"}
      </button>
    </div>
  );
}