"use client"

import { useEffect, useState } from "react"
import { createCheckout, upgradePlan } from "@/lib/billing"

type Currency = "INR" | "USD"

export default function BillingPage(){

const [loading,setLoading] = useState<string | null>(null)
const [billing,setBilling] = useState<"monthly"|"yearly">("monthly")
const [currency,setCurrency] = useState<Currency>("INR")
const [lockedCurrency,setLockedCurrency] = useState<Currency | null>(null) // 🔥 NEW
const [isEarly,setIsEarly] = useState(false)

/* ================= GEO DETECTION ================= */

useEffect(()=>{

fetch("https://ipapi.co/json/")
  .then(res=>res.json())
  .then(data=>{
    if(data.country === "IN"){
      setCurrency("INR")
    }else{
      setCurrency("USD")
    }
  })
  .catch(()=>setCurrency("INR"))

/* MOCK early user */
setIsEarly(true)

/* 🔥 FETCH CURRENT SUB (currency lock) */

fetch("/api/billing")
  .then(res=>res.json())
  .then(data=>{
    if(data?.subscription?.currency){
      setLockedCurrency(data.subscription.currency)
      setCurrency(data.subscription.currency) // 🔥 override geo
    }
  })
  .catch(()=>{})

},[])

/* ================= PRICING ================= */

const plans = [
{
id:"BASIC",
name:"Basic",
INR:{monthly:999,yearly:9990,early:799},
USD:{monthly:19,yearly:190,early:15},
features:[
"Instagram DM automation",
"Instagram comment automation",
"Comment → DM automation",
"Basic AI responses"
]
},
{
id:"PRO",
name:"Pro",
INR:{monthly:1999,yearly:19990,early:1599},
USD:{monthly:49,yearly:490,early:39},
features:[
"Everything in Basic",
"WhatsApp automation",
"Lead CRM",
"Follow-up automation"
]
},
{
id:"ELITE",
name:"Elite",
INR:{monthly:3999,yearly:39990,early:2999},
USD:{monthly:99,yearly:990,early:79},
features:[
"Everything in Pro",
"AI booking system",
"Calendar scheduling",
"Advanced workflows"
]
}
]

/* ================= HANDLER ================= */

const handleUpgrade = async(plan:string)=>{

try{

setLoading(plan)

/* 🔥 BLOCK UI IF CURRENCY LOCKED */

if(lockedCurrency && lockedCurrency !== currency){
  alert("Currency cannot be changed once subscribed")
  return
}

const upgrade = await upgradePlan(plan,billing)

if(upgrade?.url){
window.location.href = upgrade.url
return
}

const checkout = await createCheckout(plan,billing)

if(checkout?.url){
window.location.href = checkout.url
}

}catch(err:any){

console.error(err)

/* 🔥 HANDLE BACKEND ERROR */

if(err?.response?.data?.message){
  alert(err.response.data.message)
}else{
  alert("Something went wrong")
}

}finally{
setLoading(null)
}

}

/* ================= RENDER ================= */

return(

<div className="space-y-10 p-6">

{/* HEADER */}

<div className="flex justify-between items-center">

<div>
<h1 className="text-2xl font-semibold text-gray-950">
Billing
</h1>

<p className="text-sm text-gray-700 mt-1">
Flexible pricing for your business
</p>

{/* 🔥 SHOW LOCK MESSAGE */}

{lockedCurrency && (
<p className="text-xs text-orange-600 mt-1">
Currency locked to {lockedCurrency}
</p>
)}

</div>

{/* TOGGLE */}

<div className="flex bg-gray-100 rounded-lg p-1 text-sm">

<button
onClick={()=>setBilling("monthly")}
className={`px-4 py-1 rounded-md ${
billing==="monthly" ? "bg-white shadow text-black" : "text-gray-600"
}`}
>
Monthly
</button>

<button
onClick={()=>setBilling("yearly")}
className={`px-4 py-1 rounded-md ${
billing==="yearly" ? "bg-white shadow text-black" : "text-gray-600"
}`}
>
Yearly (Save 20%)
</button>

</div>

</div>

{/* PLANS */}

<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">

{plans.map((plan)=>{

const data = plan[currency]

const price = isEarly
? data.early
: billing==="monthly"
? data.monthly
: data.yearly

const original = billing==="monthly"
? data.monthly
: data.yearly

return(

<div
key={plan.id}
className="bg-white rounded-xl p-6 flex flex-col justify-between border border-gray-300 shadow-sm hover:shadow-2xl transition"
>

<div className="space-y-5">

<div>

<h2 className="text-lg font-semibold text-gray-950">
{plan.name}
</h2>

<div className="mt-2">

{isEarly && (
<p className="text-xs text-gray-500 line-through">
{currency==="INR" ? "₹" : "$"}{original}
</p>
)}

<div className="flex items-end gap-1">

<span className="text-3xl font-bold text-black">
{currency==="INR" ? "₹" : "$"}{price}
</span>

<span className="text-sm text-gray-700">
/{billing}
</span>

</div>

{isEarly && (
<span className="text-xs text-green-600 font-semibold">
🔥 Early Access Offer
</span>
)}

</div>

</div>

<ul className="text-sm text-gray-800 space-y-2">

{plan.features.map((f,index)=>(

<li key={index} className="flex gap-2">
<span className="text-green-700">✔</span>
{f}
</li>

))}

</ul>

</div>

<button
onClick={()=>handleUpgrade(plan.id)}
disabled={loading===plan.id}
className="mt-6 w-full text-sm font-medium py-2 rounded-lg transition bg-blue-600 hover:bg-blue-700 text-white"
>

{loading===plan.id ? "Processing..." : "Get Started"}

</button>

</div>

)

})}

</div>

</div>

)
}