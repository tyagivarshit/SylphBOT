"use client"

import TrainingTabs from "@/components/aiTraining/TrainingTabs"
import FeatureGate from "@/components/FeatureGate"

export default function AITrainingPage(){

return(

<div className="space-y-5">

<div className="brand-info-strip rounded-[26px] p-4 sm:p-5">
<h1 className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
AI WORKFORCE OVERVIEW
</h1>
<p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
Your AI workforce is ready. Each department operates independently and continuously improves using your company knowledge.
</p>
</div>

{/* 🔒 FULL PAGE LOCK */}
<section className="brand-section-shell rounded-[30px] p-4 sm:p-5 lg:p-6">
  <FeatureGate feature="CUSTOM_FOLLOWUPS">
    <TrainingTabs/>
  </FeatureGate>
</section>

</div>

)

}
