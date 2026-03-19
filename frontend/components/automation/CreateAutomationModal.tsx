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
      headers:{
        "Content-Type":"application/json"
      },
      body: JSON.stringify({
        name,
        triggerValue: trigger
      })
    })

    if(!res.ok){
      throw new Error("Failed")
    }

    /* RESET */

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

<div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">

<div className="bg-white rounded-xl w-full max-w-md p-6 shadow-lg space-y-4">

<h2 className="text-base font-semibold text-gray-900">
Create Automation
</h2>

{/* ERROR */}
{error && (
  <p className="text-xs text-red-500">{error}</p>
)}

{/* NAME */}

<div>

<label className="text-sm font-medium text-gray-800">
Automation Name
</label>

<input
value={name}
onChange={(e)=>setName(e.target.value)}
placeholder="Enter automation name"
className="w-full border border-gray-300 rounded-lg px-3 py-2 mt-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
/>

</div>

{/* TRIGGER */}

<div>

<label className="text-sm font-medium text-gray-800">
Trigger Keyword
</label>

<input
value={trigger}
onChange={(e)=>setTrigger(e.target.value)}
placeholder="Example: hi / start"
className="w-full border border-gray-300 rounded-lg px-3 py-2 mt-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
/>

</div>

{/* BUTTONS */}

<div className="flex justify-end gap-3 pt-2">

<button
onClick={onClose}
className="text-sm text-gray-700 hover:text-gray-900"
>
Cancel
</button>

<button
onClick={handleCreate}
disabled={loading}
className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition disabled:opacity-50"
>
{loading ? "Creating..." : "Create"}
</button>

</div>

</div>

</div>

)

}