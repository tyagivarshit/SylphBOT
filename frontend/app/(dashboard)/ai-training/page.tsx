"use client"

import TrainingTabs from "@/components/aiTraining/TrainingTabs"
import FeatureGate from "@/components/FeatureGate"

export default function AITrainingPage(){

return(

<div className="space-y-6">

<h1 className="text-xl font-semibold text-gray-900">
AI Training
</h1>

{/* 🔒 FULL PAGE LOCK */}
<div className="bg-white/80 backdrop-blur-xl border border-blue-100 rounded-2xl p-6 shadow-sm">
  <FeatureGate feature="CUSTOM_FOLLOWUPS">
    <TrainingTabs/>
  </FeatureGate>
</div>

</div>

)

}