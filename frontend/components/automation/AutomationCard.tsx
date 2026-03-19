"use client"

export default function AutomationCard({ automation, onDelete }: any){

return(

<div className="border border-gray-200 rounded-xl p-4 bg-white shadow-sm hover:shadow-md transition flex flex-col justify-between">

{/* HEADER */}

<div className="flex justify-between items-center">

<h3 className="text-sm font-semibold text-gray-900 truncate">
{automation.name}
</h3>

<span
className={`text-xs px-2 py-1 rounded-full ${
automation.status === "ACTIVE"
? "bg-green-100 text-green-700"
: "bg-yellow-100 text-yellow-700"
}`}
>
{automation.status}
</span>

</div>

{/* INFO */}

<p className="text-xs text-gray-500 mt-2">
Trigger: <span className="font-medium text-gray-700">
{automation.triggerValue || "—"}
</span>
</p>

<p className="text-xs text-gray-500 mt-1">
Created: {new Date(automation.createdAt).toLocaleDateString()}
</p>

{/* ACTIONS */}

<div className="flex justify-between items-center mt-4">

<button className="text-xs text-blue-600 hover:underline">
Edit
</button>

<button
onClick={()=>onDelete?.(automation.id)}
className="text-xs text-red-500 hover:text-red-700"
>
Delete
</button>

</div>

</div>

)

}