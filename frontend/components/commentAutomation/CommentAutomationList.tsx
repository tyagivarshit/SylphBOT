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

const fetchTriggers = async () => {

  try{
    setLoading(true)
    setError("")

    const res = await api.get("/api/comment-triggers")

    const data = Array.isArray(res.data)
      ? res.data
      : res.data?.triggers || []

    setAutomations(data)

  }catch(err: any){
    setError("Failed to load triggers")
  }finally{
    setLoading(false)
  }

}

useEffect(()=>{
  fetchTriggers()
},[])

const handleDelete = async (id:string) => {

  try{
    // ✅ FIXED
    await api.delete(`/api/comment-triggers/${id}`)
    setAutomations(prev => prev.filter(a => a.id !== id))
  }catch{
    alert("Delete failed")
  }

}

return(

<div className="space-y-5">

{/* HEADER */}

<div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">

<h2 className="text-base sm:text-lg font-semibold text-gray-900">
Comment Automations
</h2>

<button
onClick={()=>setOpen(true)}
className="w-full sm:w-auto bg-indigo-600 text-white px-5 py-2 text-sm font-semibold rounded-xl hover:bg-indigo-500 shadow-md hover:shadow-indigo-500/30 transition"
>
Create Trigger 🚀
</button>

</div>

{/* LOADING */}

{loading && (
  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
    {Array.from({length:3}).map((_,i)=>(
      <div
        key={i}
        className="h-28 bg-white border border-gray-200 rounded-2xl animate-pulse shadow-sm"
      />
    ))}
  </div>
)}

{/* ERROR */}

{error && (
  <div className="text-sm text-red-500 bg-red-50 border border-red-200 rounded-xl p-3">
    {error}
  </div>
)}

{/* EMPTY STATE */}

{!loading && automations.length === 0 && (
  <div className="text-center border border-dashed border-gray-300 rounded-2xl p-6 sm:p-8 bg-white">
    
    <p className="text-sm sm:text-base font-medium text-gray-900">
      No comment automations yet 🚀
    </p>

    <p className="text-xs sm:text-sm text-gray-500 mt-1">
      Turn comments into leads automatically
    </p>

    <button
      onClick={()=>setOpen(true)}
      className="mt-4 bg-indigo-600 text-white px-4 py-2 text-sm rounded-xl hover:bg-indigo-500 shadow-md hover:shadow-indigo-500/30 transition w-full sm:w-auto"
    >
      Create your first automation
    </button>

  </div>
)}

{/* LIST */}

{!loading && automations.length > 0 && (

<div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">

{automations.map((a)=>(
  <CommentAutomationCard
    key={a.id}
    automation={a}
    onDelete={()=>handleDelete(a.id)}
    onRefresh={fetchTriggers}
  />
))}

</div>

)}

{/* MODAL */}

<CreateCommentAutomationModal
open={open}
onClose={()=>{
  setOpen(false)
  fetchTriggers()
}}
/>

</div>

)

}