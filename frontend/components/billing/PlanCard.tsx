export default function PlanCard() {
  return (
    <div className="bg-white border rounded-xl p-6 space-y-4">

      <div className="flex items-center justify-between">

        <div>
          <h3 className="text-lg font-semibold">
            FREE TRIAL
          </h3>

          <p className="text-sm text-gray-500">
            ₹0 / month
          </p>
        </div>

        <span className="bg-green-100 text-green-600 text-xs px-3 py-1 rounded-full">
          ACTIVE
        </span>

      </div>

      <p className="text-sm text-gray-500">
        Trial ends in 7 days
      </p>

      <button className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm">
        Upgrade Plan
      </button>

    </div>
  )
}