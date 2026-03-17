"use client"

export default function PlanCard({plan,onClick,loading}:any){

return(

<div className="border rounded-xl p-5">

<h2 className="font-semibold">{plan.name}</h2>

<button
onClick={onClick}
className="mt-4 w-full bg-blue-600 text-white py-2 rounded"
>
{loading ? "Loading..." : "Select"}
</button>

</div>

)
}