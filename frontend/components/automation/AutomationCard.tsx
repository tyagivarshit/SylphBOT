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
    onRefresh?.()   // 🔥 ADD
  }catch(e){
    console.error(e)
    alert("Delete failed")
  }

}

const isActive = automation.isActive

return(

<div className="border border-gray-200 rounded-2xl p-4 bg-white shadow-sm hover:shadow-lg hover:shadow-indigo-500/10 transition-all flex flex-col justify-between">

<div className="flex justify-between items-center gap-2">
<h3 className="text-sm font-semibold text-gray-900 truncate">
Keyword: {automation.keyword}
</h3>

<span className={`text-xs px-2 py-1 rounded-full font-medium ${
isActive
? "bg-green-100 text-green-700"
: "bg-gray-100 text-gray-600"
}`}>
{isActive ? "ACTIVE" : "PAUSED"}
</span>
</div>

<div className="mt-3 space-y-1">
<p className="text-xs text-gray-700">
Reply: <span className="text-gray-900 font-medium">
{automation.replyText}
</span>
</p>

{automation.dmText && (
<p className="text-xs text-gray-600">
DM: {automation.dmText}
</p>
)}

<p className="text-xs text-gray-400">
Post ID: {automation.reelId}
</p>

{automation.triggerCount !== undefined && (
<p className="text-xs text-gray-500">
Triggered: {automation.triggerCount}
</p>
)}
</div>

<div className="flex justify-between items-center mt-4">

<div className="flex gap-3">

<button className="text-xs font-medium text-indigo-600 hover:text-indigo-500 transition">
Edit
</button>

<button
onClick={handleDelete}
className="text-xs font-medium text-red-500 hover:text-red-600 transition"
>
Delete
</button>

</div>

<button
onClick={handleToggle}
disabled={loading}
className={`text-xs px-3 py-1 rounded-xl font-medium transition ${
isActive
? "bg-gray-100 text-gray-700 hover:bg-gray-200"
: "bg-indigo-600 text-white hover:bg-indigo-500 shadow-sm"
}`}
>
{loading ? "..." : isActive ? "Pause" : "Activate"}
</button>

</div>

</div>

)
}