type Props = {
  title: string
  value: number | string
  icon?: React.ReactNode
  trend?: string
}

export default function StatCard({ title, value, icon, trend }: Props) {

  const isNegative = trend?.startsWith("-")

  return(

    <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-6 shadow-sm hover:shadow-md transition flex items-center justify-between">

      <div className="min-w-0">

        <p className="text-sm text-gray-500 truncate">
          {title}
        </p>

        {/* ✅ FIX: safe fallback */}
        <h2 className="text-xl sm:text-2xl font-semibold text-gray-900 mt-1">
          {value ?? 0}
        </h2>

        {/* ✅ FIX: trim + better check */}
        {trend?.trim() && (
          <p className={`text-xs mt-1 ${isNegative ? "text-red-600" : "text-green-600"}`}>
            {trend}
          </p>
        )}

      </div>

      {icon && (

        <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">
          {icon}
        </div>

      )}

    </div>

  )

}