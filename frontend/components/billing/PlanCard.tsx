"use client"

type Plan = {
id: string
name: string
price: string
features: string[]
isCurrent?: boolean
}

export default function PlanCard({
plan,
onClick,
loading
}:{
plan: Plan
onClick: ()=>void
loading: boolean
}){

return(

<div className="bg-white border border-gray-200 rounded-xl p-6 flex flex-col justify-between shadow-sm hover:shadow-xl transition">

<div className="space-y-4">

{/* HEADER */}

<div>
<h2 className="text-lg font-semibold text-gray-900">
{plan.name}
</h2>

{plan.isCurrent && (
<span className="text-xs text-green-600 font-semibold">
Current Plan
</span>
)}
</div>

{/* PRICE */}

<p className="text-2xl font-bold text-black">
{plan.price}
</p>

{/* FEATURES */}

<ul className="text-sm text-gray-700 space-y-2">

{plan.features.map((f,index)=>(
<li key={index} className="flex gap-2">
<span className="text-green-600">✔</span>
{f}
</li>
))}

</ul>

</div>

{/* CTA */}

<button
onClick={onClick}
disabled={loading || plan.isCurrent}
className="mt-6 w-full py-2 rounded-lg text-sm font-medium transition bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
>

{plan.isCurrent
? "Current Plan"
: loading
? "Processing..."
: "Get Started"}

</button>

</div>

)
}