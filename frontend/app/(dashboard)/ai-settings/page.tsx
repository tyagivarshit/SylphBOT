"use client"

import { useEffect,useState } from "react"

import { getAISettings, updateAISettings } from "@/lib/ai"

import AIToneSelector from "@/components/ai/AiToneSelector"
import BusinessInfo from "@/components/ai/BusinessInfoForm"

export default function AISettingsPage(){

const [settings,setSettings] = useState<any>(null)
const [saving,setSaving] = useState(false)

const clientId = "default"

useEffect(()=>{

const loadSettings = async()=>{

const data = await getAISettings(clientId)

setSettings(data)

}

loadSettings()

},[])

const handleSave = async()=>{

try{

setSaving(true)

await updateAISettings(clientId,settings)

alert("Settings saved")

}finally{

setSaving(false)

}

}

if(!settings){

return(

<div className="p-6 text-sm text-gray-500">
Loading AI settings...
</div>

)

}

return(

<div className="max-w-3xl space-y-8">

{/* Header */}

<div>

<h1 className="text-2xl font-semibold text-gray-900">
AI Settings
</h1>

<p className="text-sm text-gray-500 mt-1">
Configure how AI responds to your leads and customers
</p>

</div>


{/* Settings */}

<div className="space-y-6">

<AIToneSelector
value={settings.aiTone}
onChange={(v:any)=>setSettings({...settings,aiTone:v})}
/>

<BusinessInfo
value={settings.businessInfo}
onChange={(v:any)=>setSettings({...settings,businessInfo:v})}
/>

</div>


{/* Save */}

<div className="flex justify-end">

<button
onClick={handleSave}
disabled={saving}
className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition"
>

{saving ? "Saving..." : "Save Settings"}

</button>

</div>

</div>

)

}