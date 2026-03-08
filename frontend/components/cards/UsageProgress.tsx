export default function UsageProgress({ label, used, limit, icon }: any) {

const percent = limit ? Math.min((used / limit) * 100, 100) : 0

let color = "bg-blue-600"

if(percent > 80) color = "bg-red-500"
else if(percent > 60) color = "bg-yellow-500"

return(

<div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-4">

{/* Header */}

<div className="flex items-center justify-between">

<div className="flex items-center gap-2">

{icon && (
<div className="text-blue-600">
{icon}
</div>
)}

<p className="text-sm font-medium text-gray-800">
{label}
</p>

</div>

<span className="text-xs text-gray-500">
{used} / {limit}
</span>

</div>


{/* Progress */}

<div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">

<div
className={`h-2 rounded-full transition-all ${color}`}
style={{ width: `${percent}%` }}
/>

</div>


{/* Footer */}

<div className="flex items-center justify-between text-xs text-gray-500">

<span>
{Math.round(percent)}% used
</span>

{percent > 80 && (
<span className="text-red-500 font-medium">
Limit almost reached
</span>
)}

</div>

</div>

)

}