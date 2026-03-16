"use client"

export default function TrainingCard({ item }: any){

return(

<div className="border border-gray-200 rounded-xl p-4 bg-white shadow-sm">

<h3 className="text-sm font-semibold text-gray-900">
{item.title}
</h3>

<div className="flex gap-3 mt-3">

<button className="text-xs text-blue-600 hover:underline">
Edit
</button>

<button className="text-xs text-red-500 hover:underline">
Delete
</button>

</div>

</div>

)

}
