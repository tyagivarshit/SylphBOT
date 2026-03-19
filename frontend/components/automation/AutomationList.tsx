"use client"

import { useEffect, useState } from "react"
import AutomationCard from "./AutomationCard"
import CreateAutomationModal from "./CreateAutomationModal"

export default function AutomationList(){

const [open,setOpen] = useState(false)
const [automations,setAutomations] = useState<any[]>([])
const [loading,setLoading] = useState(true)
const [error,setError] = useState("")

/* ---------------- FETCH AUTOMATIONS ---------------- */

const fetchAutomations = async () => {

  try{

    setLoading(true)
    setError("")

    const res = await fetch("/api/automation/flows")

    if(!res.ok) throw new Error("Failed to fetch")

    const data = await res.json()

    setAutomations(data || [])

  }catch(err:any){

    setError("Failed to load automations")

  }finally{

    setLoading(false)

  }

}

/* ---------------- INIT ---------------- */

useEffect(()=>{
  fetchAutomations()
},[])

/* ---------------- UI ---------------- */

return(

<div className="space-y-4">

{/* HEADER */}

<div className="flex justify-between items-center">

<h2 className="text-sm font-semibold text-gray-900">
Your Automations
</h2>

<button
onClick={()=>setOpen(true)}
className="bg-blue-600 text-white px-4 py-2 text-sm rounded-lg hover:bg-blue-700 transition"

>
Create Automation
</button>

</div>

{/* LOADING */}

{loading && (
  <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
    {Array.from({length:3}).map((_,i)=>(
      <div
        key={i}
        className="h-24 bg-white border border-gray-200 rounded-xl animate-pulse"
      />
    ))}
  </div>
)}

{/* ERROR */}

{error && (
  <div className="text-sm text-red-500">
    {error}
  </div>
)}

{/* EMPTY */}

{!loading && automations.length === 0 && (
  <div className="text-sm text-gray-500 border border-dashed border-gray-300 rounded-lg p-6 text-center">
    No automations yet. Create your first one 🚀
  </div>
)}

{/* LIST */}

{!loading && automations.length > 0 && (

<div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">

{automations.map((a)=>(
  <AutomationCard
    key={a.id}
    automation={a}
  />
))}

</div>

)}

{/* MODAL */}

<CreateAutomationModal
open={open}
onClose={()=>{
  setOpen(false)
  fetchAutomations() // 🔥 auto refresh after create
}}
/>

</div>

)

}