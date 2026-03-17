"use client"

import { ReactNode } from "react"
import { usePlan } from "@/hooks/usePlan"
import { hasFeature } from "@/lib/featureGuard"

/* ✅ SAME TYPE DEFINE KAR */
type Feature =
  | "INSTAGRAM_DM"
  | "COMMENT_TO_DM"
  | "CRM"
  | "WHATSAPP_AUTOMATION"
  | "AI_BOOKING_SCHEDULING"

export default function FeatureGate({
  feature,
  children
}:{
  feature: Feature   // ✅ FIX
  children: ReactNode
}){

  const { plan } = usePlan()

  const allowed = hasFeature(plan, feature)

  if(allowed) return <>{children}</>

  return (
    <div className="relative">

      <div className="opacity-40 pointer-events-none">
        {children}
      </div>

      <div className="absolute inset-0 flex items-center justify-center">
        <div className="bg-white border shadow-lg px-4 py-2 rounded-lg text-sm">
          🔒 Upgrade to unlock this feature
        </div>
      </div>

    </div>
  )
}