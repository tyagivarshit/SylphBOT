"use client"

import { useState } from "react"

export default function CreateAutomationModal({ open,onClose }: any){

const [name,setName] = useState("")
const [trigger,setTrigger] = useState("")
const [loading,setLoading] = useState(false)
const [error,setError] = useState("")

if(!open) return null

const handleCreate = async () => {

  if(!name || !trigger){
    setError("All fields are required")
    return
  }

  try{
    setLoading(true)
    setError("")

    const res = await fetch("/api/automation/flows",{
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ name, triggerValue: trigger })
    })

    if(!res.ok) throw new Error("Failed")

    setName("")
    setTrigger("")
    onClose()

  }catch{
    setError("Failed to create automation")
  }finally{
    setLoading(false)
  }
}

return(

<div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">

<div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl space-y-5 border border-gray-200">

<h2 className="text-lg font-semibold text-gray-900">
Create Automation 🚀
</h2>

{error && (
  <p className="text-sm text-red-500">{error}</p>
)}

<div>
<label className="text-sm font-medium text-gray-900">
Automation Name
</label>

<input
value={name}
onChange={(e)=>setName(e.target.value)}
placeholder="Enter automation name"
className="w-full bg-gray-50 border border-gray-300 rounded-xl px-3 py-2 mt-1 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
/>
</div>

<div>
<label className="text-sm font-medium text-gray-900">
Trigger Keyword
</label>

<input
value={trigger}
onChange={(e)=>setTrigger(e.target.value)}
placeholder="Example: hi / start"
className="w-full bg-gray-50 border border-gray-300 rounded-xl px-3 py-2 mt-1 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
/>
</div>

<div className="flex justify-end gap-3 pt-2">

<button
onClick={onClose}
className="text-sm text-gray-600 hover:text-gray-900 transition"
>
Cancel
</button>

<button
onClick={handleCreate}
disabled={loading}
className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2 rounded-xl text-sm font-medium shadow-md hover:shadow-indigo-500/30 transition disabled:opacity-50"
>
{loading ? "Creating..." : "Create Automation"}
</button>

</div>

</div>
</div>
)
}