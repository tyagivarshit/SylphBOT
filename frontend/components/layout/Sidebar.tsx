"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
LayoutDashboard,
Users,
MessageSquare,
Workflow,
Brain,
BookOpen,
Calendar,
BarChart3,
CreditCard,
Settings,
MessageCircle,
X
} from "lucide-react"
import { useEffect, useState } from "react"

/* FEATURE MAP */
const PLAN_FEATURES: any = {
  BASIC: [
    "INSTAGRAM_DM",
    "INSTAGRAM_COMMENT_AUTOMATION",
    "COMMENT_TO_DM",
    "REEL_AUTOMATION_CONTROL"
  ],
  PRO: [
    "INSTAGRAM_DM",
    "INSTAGRAM_COMMENT_AUTOMATION",
    "COMMENT_TO_DM",
    "REEL_AUTOMATION_CONTROL",
    "WHATSAPP_AUTOMATION",
    "CRM",
    "FOLLOWUPS",
    "CUSTOM_FOLLOWUPS"
  ],
  ELITE: [
    "INSTAGRAM_DM",
    "INSTAGRAM_COMMENT_AUTOMATION",
    "COMMENT_TO_DM",
    "REEL_AUTOMATION_CONTROL",
    "WHATSAPP_AUTOMATION",
    "CRM",
    "FOLLOWUPS",
    "CUSTOM_FOLLOWUPS",
    "AI_BOOKING_SCHEDULING"
  ]
}

const hasFeature = (plan: string, feature?: string) => {
  if(!feature) return true
  return PLAN_FEATURES[plan]?.includes(feature)
}

const menu = [
{
section: "Overview",
items: [
{ name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
]
},
{
section: "CRM",
items: [
{ name: "Leads", href: "/leads", icon: Users, feature: "CRM" },
{ name: "Conversations", href: "/conversations", icon: MessageCircle, feature: "CRM" },
]
},
{
section: "Automation",
items: [
{ name: "Automation", href: "/automation", icon: Workflow },
{ name: "Comment Automation", href: "/comment-automation", icon: MessageSquare },
]
},
{
section: "AI",
items: [
{ name: "AI Training", href: "/ai-training", icon: Brain },
{ name: "Knowledge Base", href: "/knowledge-base", icon: BookOpen },
]
},
{
section: "Business",
items: [
{ name: "Booking", href: "/booking", icon: Calendar, feature: "AI_BOOKING_SCHEDULING" },
{ name: "Analytics", href: "/analytics", icon: BarChart3 },
{ name: "Billing", href: "/billing", icon: CreditCard },
]
},
{
section: "System",
items: [
{ name: "Settings", href: "/settings", icon: Settings },
]
}
]

export default function Sidebar({ open, setOpen }: any){

const pathname = usePathname()

/* STATE */
const [plan,setPlan] = useState<string>("BASIC")

/* FETCH */
useEffect(()=>{

const fetchBilling = async () => {
  try{
    const res = await fetch("/api/billing", {
      credentials: "include"
    })

    const data = await res.json()

    if(data?.subscription?.plan?.type){
      setPlan(data.subscription.plan.type)
    }

  }catch(err){
    console.error("Sidebar fetch error:", err)
  }
}

fetchBilling()

},[])

return(

<>

{open && (
<div
onClick={()=>setOpen?.(false)}
className="fixed inset-0 bg-black/30 z-40 lg:hidden"
/>
)}

<aside
className={`fixed lg:static z-50 top-0 left-0 h-full w-64 bg-white border-r border-gray-200 flex flex-col transform transition-transform duration-300
${open ? "translate-x-0" : "-translate-x-full"}
lg:translate-x-0
`}
>

{/* 🔥 PREMIUM LOGO (IMAGE + TEXT) */}
<div className="px-6 py-6 border-b border-gray-100 flex items-center justify-between">

<div className="flex items-center gap-3">

{/* 🔥 YOUR LOGO IMAGE */}
<img
  src="/logo.png"   // ⚠️ put your image in public/logo.png
  alt="Sylph"
  className="w-10 h-10 object-contain drop-shadow-md"
/>

{/* 🔥 BRAND TEXT */}
<div>
  <h1 className="text-lg font-bold bg-gradient-to-r from-teal-400 to-gray-900 bg-clip-text text-transparent tracking-wide">
    Sylph
  </h1>
  <p className="text-[11px] text-gray-400 -mt-1">
    AI Automation
  </p>
</div>

</div>

<button onClick={()=>setOpen(false)} className="lg:hidden">
<X size={20}/>
</button>

</div>

{/* NAV */}
<nav className="flex-1 overflow-y-auto px-3 py-6 space-y-6">

{menu.map((group)=>(

<div key={group.section}>

<p className="px-3 mb-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
{group.section}
</p>

<div className="space-y-1">

{group.items.map((item)=>{

const Icon = item.icon
const active = pathname.startsWith(item.href)

const allowed = hasFeature(plan, item.feature)

return(

<Link
key={item.name}
href={allowed ? item.href : "#"}
className={`flex items-center justify-between gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition relative
${active
? "bg-blue-50 text-blue-600"
: "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
}
${!allowed && "opacity-40 cursor-not-allowed"}
`}
>

<div className="flex items-center gap-3">
<Icon size={18}/>
{item.name}
</div>

{!allowed && <span className="text-xs">🔒</span>}

</Link>

)

})}

</div>

</div>

))}

</nav>

{/* 🔥 CLEAN FOOTER */}
<div className="p-4 border-t border-gray-100">

<p className="text-sm text-gray-800 text-center font-medium">
Sylph v1.0
</p>

</div>

</aside>

</>

)

}