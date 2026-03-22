"use client"

import { useEffect, useState } from "react"
import { createCheckout, upgradePlan } from "@/lib/billing"
import PaymentHistory from "@/components/billing/PaymentHistory"

const API = process.env.NEXT_PUBLIC_API_URL

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
fetch(`${API}/api/billing`,{
  credentials:"include"
})
])

/* GEO */
if(geoRes.status === "fulfilled"){
const geo = await geoRes.value.json()
setCurrency(geo?.country === "IN" ? "INR" : "USD")
}

/* BILLING */
if(billingRes.status === "fulfilled"){

const res = await billingRes.value.json()

if(!res?.success){
throw new Error(res?.message || "Billing failed")
}

if(res.subscription){
setSubscription(res.subscription)
}

if(res.subscription?.currency){
setLockedCurrency(res.subscription.currency)
setCurrency(res.subscription.currency)
}

if(res.invoices){
setInvoices(res.invoices)
}

}

/* EARLY FLAG */
setIsEarly(true)

}catch(err){
console.error(err)
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

}catch(err){
console.error(err)
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

<h1 className="text-2xl font-semibold">Billing</h1>

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

return(

<div key={plan.id} className="p-6 rounded-2xl border">

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

<button
onClick={()=>handleUpgrade(plan.id)}
disabled={loading===plan.id || isCurrent}
className="mt-6 w-full py-2 rounded-lg bg-black text-white"
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