"use client"

export default function KnowledgeCard({ item }: any){

return(

<div className="border border-gray-200 rounded-xl p-4 bg-white shadow-sm hover:shadow-md transition">

<div className="flex justify-between items-center">

<h3 className="text-sm font-semibold text-gray-900">
{item.title}
</h3>

<span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-700">
{item.type}
</span>

</div>

<div className="flex gap-3 mt-4">

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
