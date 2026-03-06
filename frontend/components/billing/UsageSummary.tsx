export default function UsageSummary() {
  return (
    <div className="bg-white border rounded-xl p-6 space-y-4">

      <h3 className="font-semibold">
        Usage Summary
      </h3>

      <div className="space-y-3">

        <div>
          <p className="text-sm text-gray-500">
            AI Calls
          </p>

          <div className="w-full bg-gray-200 rounded h-2 mt-1">
            <div className="bg-blue-600 h-2 rounded w-1/3"></div>
          </div>

          <p className="text-xs text-gray-500 mt-1">
            340 / 1000
          </p>
        </div>

        <div>
          <p className="text-sm text-gray-500">
            Messages Sent
          </p>

          <div className="w-full bg-gray-200 rounded h-2 mt-1">
            <div className="bg-blue-600 h-2 rounded w-1/4"></div>
          </div>

          <p className="text-xs text-gray-500 mt-1">
            120 / 500
          </p>
        </div>

      </div>

    </div>
  )
}