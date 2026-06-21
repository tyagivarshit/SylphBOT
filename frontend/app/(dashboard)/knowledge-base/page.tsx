"use client"

import KnowledgeList from "@/components/knowledgeBase/KnowledgeList"
import FeatureGate from "@/components/FeatureGate"

export default function KnowledgeBasePage(){
  return(
    <div className="min-w-0">
      <FeatureGate feature="CUSTOM_FOLLOWUPS">
        <KnowledgeList/>
      </FeatureGate>
    </div>
  )
}
