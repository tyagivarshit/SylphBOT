type Stage = "NEW" | "QUALIFIED" | "WON" | "LOST" | string

export default function StageBadge({ stage }: { stage: Stage }) {

const colors: Record<string,string> = {

NEW: "bg-blue-50 text-blue-700 border-blue-200",
QUALIFIED: "bg-yellow-50 text-yellow-700 border-yellow-200",
WON: "bg-green-50 text-green-700 border-green-200",
LOST: "bg-red-50 text-red-700 border-red-200",

}

const style = colors[stage] || "bg-gray-50 text-gray-700 border-gray-200"

return (

<span
className={`inline-flex items-center gap-1.5 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-md text-[11px] sm:text-xs font-medium border whitespace-nowrap ${style}`}
>

<span className="w-1.5 h-1.5 rounded-full bg-current opacity-70"/>

{stage}

</span>

)

}