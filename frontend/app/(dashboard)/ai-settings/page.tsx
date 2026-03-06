"use client"

import { useEffect,useState } from "react"

import { getAISettings, updateAISettings } from "@/lib/ai"

import AIToneSelector from "@/components/ai/AiToneSelector"
import BusinessInfo from "@/components/ai/BusinessInfoForm"

export default function AISettingsPage(){

  const [settings,setSettings] = useState<any>(null)

  const clientId = "default"

  useEffect(()=>{

    const loadSettings = async()=>{

      const data = await getAISettings(clientId)

      setSettings(data)

    }

    loadSettings()

  },[])

  const handleSave = async()=>{

    await updateAISettings(clientId,settings)

    alert("Settings saved")

  }

  if(!settings){
    return <p>Loading settings...</p>
  }

  return(

    <div className="space-y-6">

      <h1 className="text-xl font-semibold">
        AI Settings
      </h1>

      <AIToneSelector
        value={settings.aiTone}
        onChange={(v:any)=>setSettings({...settings,aiTone:v})}
      />

      <BusinessInfo
        value={settings.businessInfo}
        onChange={(v:any)=>setSettings({...settings,businessInfo:v})}
      />

      <button
        onClick={handleSave}
        className="px-5 py-2 bg-blue-600 text-white rounded-lg"
      >
        Save Settings
      </button>

    </div>

  )

}