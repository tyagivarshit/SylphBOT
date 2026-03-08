"use client"

import { useState } from "react"
import { createCheckout } from "@/lib/billing"

export default function BillingPage(){

const [loading,setLoading] = useState(false)

const handleUpgrade = async(plan:string)=>{

try{

setLoading(true)

const res = await createCheckout(plan)

if(res?.url){
window.location.href = res.url
}

}catch(err){

console.error("Checkout error",err)

}finally{

setLoading(false)

}

}

return(

<div className="space-y-10">

<h1 className="text-2xl font-semibold text-gray-900">
Billing
</h1>


{/* PLANS */}

<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">


{/* RESPONDER PLAN */}

<div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm flex flex-col justify-between">

<div className="space-y-4">

<div>

<h2 className="text-lg font-semibold text-gray-900">
Responder
</h2>

<p className="text-sm text-gray-500">
₹999 / month
</p>

</div>

<ul className="text-sm text-gray-600 space-y-2">

<li>✔ Reply to WhatsApp messages</li>
<li>✔ Reply to Instagram DMs</li>
<li>✔ Reply to Instagram comments</li>
<li>✔ Basic automation</li>

</ul>

</div>

<button
onClick={()=>handleUpgrade("RESPONDER")}
disabled={loading}
className="mt-6 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 rounded-lg transition"
>

{loading ? "Processing..." : "Choose Plan"}

</button>

</div>



{/* LEADS PLAN */}

<div className="bg-white border-2 border-blue-600 rounded-xl p-6 shadow-md flex flex-col justify-between relative">

<span className="absolute top-4 right-4 bg-blue-100 text-blue-700 text-xs font-semibold px-3 py-1 rounded-full">
POPULAR
</span>

<div className="space-y-4">

<div>

<h2 className="text-lg font-semibold text-gray-900">
Leads
</h2>

<p className="text-sm text-gray-500">
₹1999 / month
</p>

</div>

<ul className="text-sm text-gray-600 space-y-2">

<li>✔ Everything in Responder</li>
<li>✔ Lead capture system</li>
<li>✔ Leads dashboard</li>
<li>✔ Lead stage tracking</li>
<li>✔ Conversation history</li>

</ul>

</div>

<button
onClick={()=>handleUpgrade("LEADS")}
disabled={loading}
className="mt-6 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 rounded-lg transition"
>

{loading ? "Processing..." : "Choose Plan"}

</button>

</div>



{/* AUTOMATION PLAN */}

<div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm flex flex-col justify-between">

<div className="space-y-4">

<div>

<h2 className="text-lg font-semibold text-gray-900">
Automation
</h2>

<p className="text-sm text-gray-500">
₹3999 / month
</p>

</div>

<ul className="text-sm text-gray-600 space-y-2">

<li>✔ Everything in Leads</li>
<li>✔ Meeting booking automation</li>
<li>✔ Calendar scheduling</li>
<li>✔ Follow-up automation</li>
<li>✔ Advanced AI workflows</li>

</ul>

</div>

<button
onClick={()=>handleUpgrade("AUTOMATION")}
disabled={loading}
className="mt-6 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 rounded-lg transition"
>

{loading ? "Processing..." : "Choose Plan"}

</button>

</div>


</div>

</div>

)

}