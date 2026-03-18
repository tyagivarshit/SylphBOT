"use client"

import TrainingTabs from "@/components/aiTraining/TrainingTabs"
import FeatureGate from "@/components/FeatureGate" // ✅ ADD

export default function AITrainingPage(){

return(

<div className="space-y-6">

<h1 className="text-lg font-semibold text-gray-900">
AI Training
</h1>

{/* 🔒 FULL PAGE LOCK */}
<FeatureGate feature="CUSTOM_FOLLOWUPS">
  <TrainingTabs/>
</FeatureGate>

</div>

)

}