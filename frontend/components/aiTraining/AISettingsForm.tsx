"use client"

import { useEffect, useState } from "react"

export default function AISettingsForm(){

const [tone,setTone] = useState("Friendly")
const [instructions,setInstructions] = useState("")

const [loading,setLoading] = useState(false)
const [fetching,setFetching] = useState(true)

/* ================= LOAD SETTINGS ================= */

useEffect(() => {
  const loadSettings = async () => {
    try {
      const res = await fetch("/api/training/settings")
      const data = await res.json()

      if(res.ok && data){
        setTone(data.aiTone || "Friendly")
        setInstructions(data.salesInstructions || "")
      }

    } catch (err) {
      console.error("Load settings error:", err)
    } finally {
      setFetching(false)
    }
  }

  loadSettings()
}, [])

/* ================= SAVE ================= */

const handleSave = async () => {

  try{

    setLoading(true)

    const res = await fetch("/api/training/settings",{
      method:"POST",
      headers:{
        "Content-Type":"application/json"
      },
      body: JSON.stringify({
        aiTone: tone,
        salesInstructions: instructions
      })
    })

    const data = await res.json()

    if(!res.ok){
      throw new Error(data.message)
    }

    alert("✅ AI settings saved")

  }catch(err){
    console.error(err)
    alert("❌ Failed to save settings")
  }finally{
    setLoading(false)
  }

}

/* ================= UI ================= */

if(fetching){
  return <p className="text-sm text-gray-500">Loading settings...</p>
}

return(

<div className="space-y-5 rounded-[24px] border border-slate-200/80 bg-white/82 p-5 shadow-sm">

<label className="text-sm font-semibold text-slate-800">
AI Tone
</label>

<select
value={tone}
onChange={(e)=>setTone(e.target.value)}
className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900"
>
<option>Friendly</option>
<option>Professional</option>
<option>Sales</option>
<option>Luxury</option>
</select>

<textarea
value={instructions}
onChange={(e)=>setInstructions(e.target.value)}
placeholder="Custom sales instructions..."
className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400"
rows={4}
/>

<button
onClick={handleSave}
disabled={loading}
className="brand-button-primary w-full"
>
{loading ? "Saving..." : "Save Settings"}
</button>

</div>

)

}
