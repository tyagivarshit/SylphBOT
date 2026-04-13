"use client"

import { ReactNode } from "react"
import { usePlan } from "@/hooks/usePlan"
import { hasFeature, getNextPlan, PLAN_LABELS } from "@/lib/featureGuard"
import { useUpgrade } from "@/app/(dashboard)/layout"

/* ✅ UPDATED TYPE */
type Feature =
| "INSTAGRAM_DM"
| "COMMENT_TO_DM"
| "CRM"
| "WHATSAPP_AUTOMATION"
| "AI_BOOKING_SCHEDULING"
| "CUSTOM_FOLLOWUPS"
| "FOLLOWUPS"
| "REEL_AUTOMATION_CONTROL"

export default function FeatureGate({
feature,
children
}:{
feature: Feature
children: ReactNode
}){

const { plan } = usePlan()
const { openUpgrade } = useUpgrade()

const allowed = hasFeature(plan, feature)

/* =========================
✅ ALLOWED
========================= */
if(allowed) return <>{children}</>

const nextPlan = getNextPlan(plan)

/* =========================
🚫 HIGHER PLAN → HIDE
========================= */
if (!nextPlan) {
return null
}

/* =========================
🔥 NEXT PLAN → SMART DISABLED UI
========================= */
return ( <div
   className="relative group cursor-pointer"
   onClick={openUpgrade}
 >

  {/* 🔥 UPGRADE BADGE */}
  <div className="absolute -top-2 -right-2 z-10 text-[10px] px-2 py-1 rounded-full bg-gradient-to-r from-[#14E1C1] to-blue-500 text-white shadow">
    Upgrade to {PLAN_LABELS[nextPlan]}
  </div>

  {/* 🔥 DISABLED CONTENT */}
  <div className="opacity-50 pointer-events-none blur-[1px] group-hover:blur-[2px] transition">
    {children}
  </div>

</div>

)
}
