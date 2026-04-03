"use client"

import { api } from "@/lib/api"
import { useState } from "react"

export default function CommentAutomationCard({ automation, onDelete, onRefresh }: any){

const [loading,setLoading] = useState(false)

/* ---------------- TOGGLE ---------------- */

const handleToggle = async () => {

  try{
    setLoading(true)
    await api.patch(`/api/comment-triggers/${automation.id}/toggle`)
    onRefresh?.()
  }catch(e){
    console.error(e)
    alert("Failed to update status")
  }finally{
    setLoading(false)
  }

}

/* ---------------- DELETE ---------------- */

const handleDelete = async () => {

  try{
    await api.delete(`/api/comment-triggers/${automation.id}`)
    onDelete?.(automation.id)
    onRefresh?.()
  }catch(e){
    console.error(e)
    alert("Delete failed")
  }

}

const isActive = automation.isActive

return(

<div className="bg-white/70 backdrop-blur-xl border border-blue-100 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">

{/* 🔥 HEADER */}
<div className="flex justify-between items-center gap-2">
<h3 className="text-sm font-semibold text-gray-900 truncate">
Keyword: {automation.keyword}
</h3>

<span className={`text-xs px-2 py-1 rounded-full font-semibold ${
isActive
? "bg-green-100 text-green-700"
: "bg-gray-100 text-gray-600"
}`}>
{isActive ? "ACTIVE" : "PAUSED"}
</span>
</div>

{/* 🔥 CONTENT */}
<div className="mt-3 space-y-2 text-xs">

<p className="text-gray-600">
Reply: <span className="text-gray-900 font-medium">
{automation.replyText}
</span>
</p>

{automation.dmText && (
<p className="text-gray-500">
DM: {automation.dmText}
</p>
)}

<p className="text-gray-400">
Post ID: {automation.reelId}
</p>

{automation.triggerCount !== undefined && (
<p className="text-gray-500">
Triggered: {automation.triggerCount}
</p>
)}

</div>

{/* 🔥 FOOTER */}
<div className="flex justify-between items-center mt-4">

<div className="flex gap-3">

<button className="text-xs font-semibold text-blue-600 hover:text-blue-500 transition">
Edit
</button>

<button
onClick={handleDelete}
className="text-xs font-semibold text-red-500 hover:text-red-600 transition"
>
Delete
</button>

</div>

<button
onClick={handleToggle}
disabled={loading}
className={`text-xs px-3 py-1.5 rounded-xl font-semibold transition-all ${
isActive
? "bg-blue-50 text-gray-700 hover:bg-blue-100"
: "bg-gradient-to-r from-blue-600 to-cyan-500 text-white hover:shadow-md"
}`}
>
{loading ? "..." : isActive ? "Pause" : "Activate"}
</button>

</div>

</div>

)
}