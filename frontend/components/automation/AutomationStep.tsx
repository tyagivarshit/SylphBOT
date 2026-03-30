"use client"

export default function AutomationStep({
  step,
  onDelete,
  onMoveUp,
  onMoveDown
}: any){

return(

<div className="border border-gray-200 rounded-xl p-3 bg-white flex items-center justify-between hover:shadow-md hover:shadow-indigo-500/10 transition-all">

<div>
<p className="text-xs text-gray-500">
{step.type}
</p>

<p className="text-sm font-semibold text-gray-900">
{step.label}
</p>
</div>

<div className="flex items-center gap-2">

<button
onClick={onMoveUp}
className="text-xs text-gray-500 hover:text-gray-900 transition"
>
↑
</button>

<button
onClick={onMoveDown}
className="text-xs text-gray-500 hover:text-gray-900 transition"
>
↓
</button>

<button
onClick={onDelete}
className="text-xs text-red-500 hover:text-red-600 transition"
>
Delete
</button>

</div>

</div>

)
}