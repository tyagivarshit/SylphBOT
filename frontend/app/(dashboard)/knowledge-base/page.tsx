"use client"

import KnowledgeList from "@/components/knowledgeBase/KnowledgeList"
import FeatureGate from "@/components/FeatureGate"

export default function KnowledgeBasePage(){

return(

<div className="space-y-6">

{/* PAGE HEADER */}

<div>

<h1 className="text-xl font-semibold text-gray-900">
Knowledge Base
</h1>

<p className="text-sm text-gray-500 mt-1">
Train your AI with business knowledge and documents
</p>

</div>

{/* 🔒 FULL LOCK */}

<div className="bg-white/80 backdrop-blur-xl border border-blue-100 rounded-2xl p-6 shadow-sm">
  <FeatureGate feature="CUSTOM_FOLLOWUPS">
    <KnowledgeList/>
  </FeatureGate>
</div>

</div>

)

}