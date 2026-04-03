type Props = {
  label?: string
  used: number
  limit: number
  icon?: React.ReactNode
}

export default function UsageProgress({ label, used, limit, icon }: Props) {

  const percent = limit ? Math.min((used / limit) * 100, 100) : 0

  let color = "bg-blue-600"

  if (percent > 80) color = "bg-red-100"
  else if (percent > 60) color = "bg-yellow-100"

  return (

    <div className="bg-white/80 backdrop-blur-xl border border-blue-100 rounded-2xl p-5 sm:p-6 shadow-sm space-y-4">

      {/* Header */}

      <div className="flex items-center justify-between gap-3">

        <div className="flex items-center gap-2 min-w-0">

          {icon && (
            <div className="text-blue-600 shrink-0">
              {icon}
            </div>
          )}

          <p className="text-sm font-semibold text-gray-800 truncate">
            {label}
          </p>

        </div>

        <span className="text-xs text-gray-500 whitespace-nowrap">
          {used} / {limit}
        </span>

      </div>


      {/* Progress */}

      <div className="w-full bg-blue-50 rounded-full h-2 overflow-hidden">

        <div
          className={`h-2 rounded-full transition-all duration-500 ${
            percent > 80
              ? "bg-red-500"
              : percent > 60
              ? "bg-yellow-500"
              : "bg-gradient-to-r from-blue-600 to-cyan-500"
          }`}
          style={{ width: `${percent}%` }}
        />

      </div>


      {/* Footer */}

      <div className="flex items-center justify-between text-xs text-gray-500">

        <span>
          {Math.round(percent)}% used
        </span>

        {percent > 80 && (
          <span className="text-red-600 font-semibold">
            Limit almost reached
          </span>
        )}

      </div>

    </div>

  )

}