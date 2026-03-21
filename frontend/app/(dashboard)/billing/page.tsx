"use client"

import { useEffect, useState } from "react"
import { createCheckout, upgradePlan } from "@/lib/billing"
import PaymentHistory from "@/components/billing/PaymentHistory"

type Currency = "INR" | "USD"

export default function BillingPage(){

const [loading,setLoading] = useState<string | null>(null)
const [billing,setBilling] = useState<"monthly"|"yearly">("monthly")

const [currency,setCurrency] = useState<Currency>("INR")
const [lockedCurrency,setLockedCurrency] = useState<Currency | null>(null)

const [isEarly,setIsEarly] = useState(false)

const [subscription,setSubscription] = useState<any>(null)
const [invoices,setInvoices] = useState<any[]>([])

const [pageLoading,setPageLoading] = useState(true)
const [error,setError] = useState<string | null>(null)

/* ================= INIT ================= */

useEffect(()=>{

const init = async () => {

try{

const [geoRes,billingRes] = await Promise.allSettled([
fetch("https://ipapi.co/json/"),
fetch("/api/billing")
])

if(geoRes.status === "fulfilled"){
const geo = await geoRes.value.json()
setCurrency(geo?.country === "IN" ? "INR" : "USD")
}

if(billingRes.status === "fulfilled"){
const data = await billingRes.value.json()

if(data?.subscription){
  setSubscription(data.subscription)
}

if(data?.subscription?.currency){
  setLockedCurrency(data.subscription.currency)
  setCurrency(data.subscription.currency)
}

if(data?.invoices){
  setInvoices(data.invoices)
}
}

setIsEarly(true)

}catch(err){
setError("Failed to load billing")
}finally{
setPageLoading(false)
}

}

init()

},[])

/* ================= PLANS ================= */

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

if(loading) return

try{

setLoading(plan)

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

}catch{
alert("Something went wrong")
}finally{
setLoading(null)
}

}

/* ================= LOADING ================= */

if(pageLoading){
return (
<div className="p-6 space-y-4">
<div className="h-6 w-40 bg-gray-200 rounded animate-pulse"/>
<div className="grid grid-cols-3 gap-4">
{[1,2,3].map(i=>(
<div key={i} className="h-64 bg-gray-200 rounded-xl animate-pulse"/>
))}
</div>
</div>
)
}

if(error){
return <div className="p-6 text-red-500">{error}</div>
}

/* ================= UI ================= */

return(

<div className="space-y-10 p-6">

{/* HEADER */}

<div className="flex justify-between items-center">

<h1 className="text-2xl font-semibold">Billing</h1>

<div className="flex bg-gray-100 rounded-lg p-1 text-sm">

<button
onClick={()=>setBilling("monthly")}
className={`px-4 py-1 rounded-md ${
billing==="monthly" ? "bg-white shadow" : "text-gray-500"
}`}
>
Monthly
</button>

<button
onClick={()=>setBilling("yearly")}
className={`px-4 py-1 rounded-md ${
billing==="yearly" ? "bg-white shadow" : "text-gray-500"
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

const isCurrent = subscription?.plan?.name === plan.id
const isPopular = plan.id === "PRO"

return(

<div
key={plan.id}
className={`relative p-6 rounded-2xl border transition ${
isPopular
? "border-blue-600 shadow-2xl scale-[1.03]"
: "border-gray-300 hover:shadow-xl"
}`}
>

{isPopular && (
<div className="absolute -top-3 left-1/2 -translate-x-1/2">
<span className="bg-blue-600 text-white text-xs px-3 py-1 rounded-full">
🔥 Most Popular
</span>
</div>
)}

<h2 className="text-lg font-semibold">{plan.name}</h2>

{isCurrent && (
<span className="text-xs text-green-600">✔ Current</span>
)}

<div className="mt-3">

{isEarly && (
<p className="text-xs line-through text-gray-400">
{currency==="INR" ? "₹" : "$"}{original}
</p>
)}

<div className="flex items-end gap-1">
<span className="text-3xl font-bold">
{currency==="INR" ? "₹" : "$"}{price}
</span>
<span className="text-sm text-gray-500">/{billing}</span>
</div>

</div>

<ul className="mt-4 space-y-2 text-sm">

{plan.features.map((f,i)=>(
<li key={i} className="flex gap-2">
<span>✔</span>{f}
</li>
))}

</ul>

<button
onClick={()=>handleUpgrade(plan.id)}
disabled={loading===plan.id || isCurrent}
className={`mt-6 w-full py-2 rounded-lg text-sm font-semibold ${
isPopular
? "bg-blue-600 hover:bg-blue-700 text-white"
: "bg-black hover:bg-gray-900 text-white"
}`}
>

{isCurrent ? "Current Plan"
: loading===plan.id ? "Processing..."
: "Upgrade Now"}

</button>

</div>

)

})}

</div>

<PaymentHistory invoices={invoices} />

</div>

)
}