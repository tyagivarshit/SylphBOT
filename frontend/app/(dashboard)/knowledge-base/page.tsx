"use client"

import KnowledgeList from "@/components/knowledgeBase/KnowledgeList"
import FeatureGate from "@/components/FeatureGate" // ✅ ADD

export default function KnowledgeBasePage(){

return(

<div className="space-y-6">

{/* PAGE HEADER */}

<div>

<h1 className="text-lg font-semibold text-gray-900">
Knowledge Base
</h1>

<p className="text-sm text-gray-500 mt-1">
Train your AI with business knowledge and documents
</p>

</div>

{/* 🔒 FULL LOCK */}

<FeatureGate feature="CUSTOM_FOLLOWUPS">
  <KnowledgeList/>
</FeatureGate>

</div>

)

}