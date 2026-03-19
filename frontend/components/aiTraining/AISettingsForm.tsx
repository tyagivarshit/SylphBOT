"use client"

import { useState } from "react"

export default function AISettingsForm(){

const [tone,setTone] = useState("Friendly")
const [instructions,setInstructions] = useState("")
const [loading,setLoading] = useState(false)

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
    alert("❌ Failed to save settings")
  }finally{
    setLoading(false)
  }

}

return(

<div className="space-y-4">

<label className="text-sm font-medium text-gray-800">
AI Tone
</label>

<select
value={tone}
onChange={(e)=>setTone(e.target.value)}
className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
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
className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
rows={4}
/>

<button
onClick={handleSave}
disabled={loading}
className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm disabled:opacity-50"
>
{loading ? "Saving..." : "Save Settings"}
</button>

</div>

)

}