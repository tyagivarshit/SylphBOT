"use client"

import { ReactNode } from "react"
import { usePlan } from "@/hooks/usePlan"
import { hasFeature } from "@/lib/featureGuard"
import { useUpgrade } from "@/app/(dashboard)/layout"

/* ✅ UPDATED TYPE */
type Feature =
  | "INSTAGRAM_DM"
  | "COMMENT_TO_DM"
  | "CRM"
  | "WHATSAPP_AUTOMATION"
  | "AI_BOOKING_SCHEDULING"
  | "CUSTOM_FOLLOWUPS" // ✅ ADD
  | "FOLLOWUPS"        // 🔥 future ready
  | "REEL_AUTOMATION_CONTROL" // 🔥 future ready

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

  if(allowed) return <>{children}</>

  return (
    <div
      className="relative cursor-pointer group"
      onClick={openUpgrade}
    >

      {/* 🔥 BLUR */}
      <div className="opacity-40 pointer-events-none blur-[2px] group-hover:blur-[3px] transition">
        {children}
      </div>

      {/* 🔥 OVERLAY */}
      <div className="absolute inset-0 flex items-center justify-center">

        <div className="bg-white/90 backdrop-blur border shadow-xl px-5 py-3 rounded-xl text-sm text-center transition group-hover:scale-105">

          <p className="font-semibold text-gray-800">
            🔒 Premium Feature
          </p>

          <p className="text-xs text-gray-500 mt-1">
            Upgrade to unlock this feature
          </p>

          <button
            className="mt-2 text-xs bg-blue-600 text-white px-3 py-1 rounded-md hover:bg-blue-700 transition"
            onClick={(e)=>{
              e.stopPropagation()
              openUpgrade()
            }}
          >
            Upgrade
          </button>

        </div>

      </div>

    </div>
  )
}