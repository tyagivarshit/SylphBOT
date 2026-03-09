"use client"

import { useState } from "react"
import { createCheckout } from "@/lib/billing"

export default function BillingPage(){

const [loading,setLoading] = useState<string | null>(null)

const plans = [

{
id:"RESPONDER",
name:"Responder",
price:"₹999 / month",
features:[
"Reply to WhatsApp messages",
"Reply to Instagram DMs",
"Reply to Instagram comments",
"Basic automation"
],
popular:false
},

{
id:"LEADS",
name:"Leads",
price:"₹1999 / month",
features:[
"Everything in Responder",
"Lead capture system",
"Leads dashboard",
"Lead stage tracking",
"Conversation history"
],
popular:true
},

{
id:"AUTOMATION",
name:"Automation",
price:"₹3999 / month",
features:[
"Everything in Leads",
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

<div className="space-y-10 p-4 sm:p-6">

<h1 className="text-xl sm:text-2xl font-semibold text-gray-900">
Billing
</h1>


{/* PLANS */}

<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">

{plans.map((plan)=>{

return(

<div
key={plan.id}
className={`bg-white rounded-xl p-5 sm:p-6 flex flex-col justify-between relative transition hover:shadow-md

${plan.popular
? "border-2 border-blue-600 shadow-md"
: "border border-gray-200 shadow-sm"
}
`}
>

{plan.popular && (

<span className="absolute top-4 right-4 bg-blue-100 text-blue-700 text-xs font-semibold px-3 py-1 rounded-full">
POPULAR
</span>

)}

<div className="space-y-4">

<div>

<h2 className="text-base sm:text-lg font-semibold text-gray-900">
{plan.name}
</h2>

<p className="text-sm text-gray-500">
{plan.price}
</p>

</div>

<ul className="text-sm text-gray-600 space-y-2">

{plan.features.map((f,index)=>(
<li key={index}>✔ {f}</li>
))}

</ul>

</div>

<button
onClick={()=>handleUpgrade(plan.id)}
disabled={loading===plan.id}
className="mt-6 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 rounded-lg transition"
>

{loading===plan.id ? "Processing..." : "Choose Plan"}

</button>

</div>

)

})}

</div>

</div>

)
}