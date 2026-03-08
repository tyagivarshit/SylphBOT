export default function StageBadge({ stage }: { stage: string }) {

const colors: any = {
NEW: "bg-blue-50 text-blue-700 border-blue-200",
QUALIFIED: "bg-yellow-50 text-yellow-700 border-yellow-200",
WON: "bg-green-50 text-green-700 border-green-200",
LOST: "bg-red-50 text-red-700 border-red-200",
}

const style = colors[stage] || "bg-gray-50 text-gray-700 border-gray-200"

return (

<span
className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border ${style}`}
>

<span className="w-1.5 h-1.5 rounded-full bg-current opacity-70"></span>

{stage}

</span>

)

}