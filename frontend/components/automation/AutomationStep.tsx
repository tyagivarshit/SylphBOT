"use client"

export default function AutomationStep({
  step,
  onDelete,
  onMoveUp,
  onMoveDown
}: any){

return(

<div className="border border-gray-200 rounded-lg p-3 bg-white flex items-center justify-between hover:shadow-sm transition">

<div>

<p className="text-xs text-gray-500">
{step.type}
</p>

<p className="text-sm font-medium text-gray-900">
{step.label}
</p>

</div>

<div className="flex items-center gap-2">

<button
onClick={onMoveUp}
className="text-xs text-gray-500 hover:text-gray-800"
>
↑
</button>

<button
onClick={onMoveDown}
className="text-xs text-gray-500 hover:text-gray-800"
>
↓
</button>

<button
onClick={onDelete}
className="text-xs text-red-500 hover:text-red-700"
>
Delete
</button>

</div>

</div>

)

}