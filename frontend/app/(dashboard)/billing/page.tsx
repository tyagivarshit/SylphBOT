"use client"

import { useState } from "react"
import { createCheckout } from "@/lib/billing"

export default function BillingPage(){

const [loading,setLoading] = useState<string | null>(null)

const plans = [

{
id:"BASIC",
name:"Basic",
price:"₹999",
period:"/month",
features:[
"AI replies to WhatsApp messages",
"AI replies to Instagram DMs",
"AI replies to Instagram comments",
"Basic automation"
],
popular:false
},

{
id:"PRO",
name:"Pro",
price:"₹1999",
period:"/month",
features:[
"Everything in Basic",
"Lead capture system",
"Leads dashboard",
"Lead stage tracking",
"Conversation history"
],
popular:true
},

{
id:"ELITE",
name:"Elite",
price:"₹3999",
period:"/month",
features:[
"Everything in Pro",
"Meeting booking automation",
"Calendar scheduling",
"Follow-up automation",
"Advanced AI workflows"
],
popular:false
}

]

const handleUpgrade = async(plan:string)=>{

try{

setLoading(plan)

const res = await createCheckout(plan)

if(res?.url){
window.location.href = res.url
}

}catch(err){

console.error("Checkout error",err)

}finally{

setLoading(null)

}

}

return(

<div className="space-y-10 p-6">

{/* HEADER */}

<div>

<h1 className="text-2xl font-semibold text-gray-900">
Billing
</h1>

<p className="text-sm text-gray-500 mt-1">
Choose the plan that fits your business
</p>

</div>

{/* PLANS */}

<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">

{plans.map((plan)=>{

return(

<div
key={plan.id}
className={`relative bg-white rounded-xl p-6 flex flex-col justify-between transition hover:shadow-xl

${plan.popular
? "border-2 border-blue-600 scale-[1.02]"
: "border border-gray-200"
}
`}

>

{plan.popular && (

<span className="absolute -top-3 left-6 bg-blue-600 text-white text-xs font-semibold px-3 py-1 rounded-full">
BEST VALUE
</span>

)}

<div className="space-y-5">

<div>

<h2 className="text-lg font-semibold text-gray-900">
{plan.name}
</h2>

<div className="flex items-end gap-1 mt-1">

<span className="text-3xl font-bold text-gray-900">
{plan.price}
</span>

<span className="text-sm text-gray-500">
{plan.period}
</span>

</div>

</div>

<ul className="text-sm text-gray-600 space-y-2">

{plan.features.map((f,index)=>(

<li key={index} className="flex gap-2">
<span className="text-green-600">✔</span>
{f}
</li>

))}

</ul>

</div>

<button
onClick={()=>handleUpgrade(plan.id)}
disabled={loading===plan.id}
className={`mt-6 w-full text-sm font-medium py-2 rounded-lg transition

${plan.popular
? "bg-blue-600 hover:bg-blue-700 text-white"
: "bg-gray-100 hover:bg-gray-200 text-gray-900"
}
`}

>

{loading===plan.id ? "Processing..." : `Choose ${plan.name}`}

</button>

</div>

)

})}

</div>

</div>

)

}
