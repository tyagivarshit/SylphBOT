"use client"

import KnowledgeList from "@/components/knowledgeBase/KnowledgeList"
import FeatureGate from "@/components/FeatureGate"

export default function KnowledgeBasePage(){

return(

<div className="min-w-0 space-y-5">

<div className="brand-info-strip rounded-[26px] p-4 sm:p-5">

<p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
Knowledge operations
</p>

<p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
Keep reusable business context, policies, and answers organized for your AI desk.
</p>

</div>

{/* 🔒 FULL LOCK */}

<section className="brand-section-shell min-w-0 overflow-hidden rounded-[30px] p-4 sm:p-5 lg:p-6">
  <FeatureGate feature="CUSTOM_FOLLOWUPS">
    <KnowledgeList/>
  </FeatureGate>
</section>

</div>

)

}
