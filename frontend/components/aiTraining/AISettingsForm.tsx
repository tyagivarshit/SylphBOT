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

<div className="space-y-5 bg-white/70 backdrop-blur-xl border border-blue-100 rounded-2xl p-5 shadow-sm">

<label className="text-sm font-semibold text-gray-700">
AI Tone
</label>

<select
value={tone}
onChange={(e)=>setTone(e.target.value)}
className="w-full bg-white text-gray-900 border border-blue-100 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-400 outline-none transition"
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
className="w-full bg-white text-gray-900 border border-blue-100 rounded-xl px-4 py-2.5 text-sm placeholder-gray-400 focus:ring-2 focus:ring-blue-400 outline-none transition"
rows={4}
/>

<button
onClick={handleSave}
disabled={loading}
className="w-full bg-gradient-to-r from-blue-600 to-cyan-500 text-white text-sm font-semibold py-2.5 rounded-xl shadow-md hover:shadow-lg transition active:scale-[0.98] disabled:opacity-70"
>
{loading ? "Saving..." : "Save Settings"}
</button>

</div>

)

}