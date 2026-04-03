type Stage = "NEW" | "QUALIFIED" | "WON" | "LOST" | string

export default function StageBadge({ stage }: { stage: Stage }) {

  const colors: Record<string,string> = {

    NEW: "bg-blue-50 text-blue-700 border-blue-100",
    QUALIFIED: "bg-yellow-100 text-yellow-700 border-yellow-200",
    WON: "bg-green-100 text-green-700 border-green-200",
    LOST: "bg-red-100 text-red-600 border-red-200",

  }

  const style = colors[stage] || "bg-gray-100 text-gray-600 border-gray-200"

  return (

    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border whitespace-nowrap ${style}`}
    >

      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70"/>

      {stage}

    </span>

  )

}