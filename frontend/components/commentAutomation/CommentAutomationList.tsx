"use client"

import { useEffect, useState } from "react"
import { api } from "@/lib/api"
import CommentAutomationCard from "./CommentAutomationCard"
import CreateCommentAutomationModal from "./CreateCommentAutomationModal"

export default function CommentAutomationList(){

const [open,setOpen] = useState(false)
const [automations,setAutomations] = useState<any[]>([])
const [loading,setLoading] = useState(true)
const [error,setError] = useState("")

/* ---------------- FETCH ---------------- */

const fetchTriggers = async () => {

  try{

    setLoading(true)
    setError("")

    const res = await api.get("/comment-triggers")

    /* ✅ SAFE PARSING (future proof) */
    const data = Array.isArray(res.data)
      ? res.data
      : res.data?.triggers || []

    setAutomations(data)

  }catch(err: any){

    console.log("FETCH ERROR:", err?.response?.data || err.message)

    setError("Failed to load triggers")

  }finally{

    setLoading(false)

  }

}

/* ---------------- INIT ---------------- */

useEffect(()=>{
  fetchTriggers()
},[])

/* ---------------- DELETE ---------------- */

const handleDelete = async (id:string) => {

  try{

    await api.delete(`/comment-triggers/${id}`)

    setAutomations(prev => prev.filter(a => a.id !== id))

  }catch(err: any){

    console.log("DELETE ERROR:", err?.response?.data || err.message)

    alert("Delete failed")

  }

}

/* ---------------- UI ---------------- */

return(

<div className="space-y-5">

<div className="flex justify-between items-center">

<h2 className="text-base font-semibold text-gray-900">
Comment Triggers
</h2>

<button
onClick={()=>setOpen(true)}
className="bg-blue-600 text-white px-4 py-2 text-sm font-semibold rounded-lg hover:bg-blue-700 transition"
>
Create Trigger
</button>

</div>

{/* LOADING */}

{loading && (
  <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
    {Array.from({length:3}).map((_,i)=>(
      <div
        key={i}
        className="h-28 bg-white border border-gray-200 rounded-xl animate-pulse"
      />
    ))}
  </div>
)}

{/* ERROR */}

{error && (
  <p className="text-sm text-red-600 font-medium">{error}</p>
)}

{/* EMPTY */}

{!loading && automations.length === 0 && (
  <div className="text-sm text-gray-700 border border-dashed border-gray-300 rounded-xl p-6 text-center font-medium">
    No comment automations yet 🚀
  </div>
)}

{/* LIST */}

{!loading && automations.length > 0 && (

<div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">

{automations.map((a)=>(
  <CommentAutomationCard
    key={a.id}
    automation={a}
    onDelete={()=>handleDelete(a.id)}
    onRefresh={fetchTriggers} // 🔥 important for toggle refresh
  />
))}

</div>

)}

<CreateCommentAutomationModal
open={open}
onClose={()=>{
  setOpen(false)
  fetchTriggers() // 🔥 auto refresh after create
}}
/>

</div>

)

}