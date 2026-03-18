"use client"

import ConversationsLayout from "@/components/conversations/ConversationsLayout"
import FeatureGate from "@/components/FeatureGate" // ✅ ADD

export default function ConversationsPage(){

return(

<div className="h-[calc(100vh-120px)]">

  {/* 🔒 FULL LOCK (CRM FEATURE) */}
  <FeatureGate feature="CRM">
    <ConversationsLayout/>
  </FeatureGate>

</div>

)

}