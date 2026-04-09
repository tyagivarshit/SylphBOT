"use client"

import TrainingTabs from "@/components/aiTraining/TrainingTabs"
import FeatureGate from "@/components/FeatureGate"

export default function AITrainingPage(){

return(

<div className="space-y-5">

<div className="brand-info-strip rounded-[26px] p-4 sm:p-5">
<p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
Response tuning
</p>
<p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
Shape tone, FAQs, and sales instructions from one focused training workspace.
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
