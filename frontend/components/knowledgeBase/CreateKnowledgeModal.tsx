"use client"

import { useState } from "react"
import { api } from "@/lib/api"

export default function CreateKnowledgeModal({ open,onClose }: any){

const [title,setTitle] = useState("")
const [content,setContent] = useState("")
const [loading,setLoading] = useState(false)
const [error,setError] = useState("")

if(!open) return null

/* ============================= */
/* CREATE KNOWLEDGE */
/* ============================= */

const handleCreate = async () => {

  if(!title || !content){
    setError("Title and content are required")
    return
  }

  try{

    setLoading(true)
    setError("")

    await api.post("/knowledge",{
      title,
      content
    })

    /* RESET */
    setTitle("")
    setContent("")

    onClose()

  }catch(err:any){
    console.error("Create error:", err)
    setError(err?.response?.data?.message || "Something went wrong")
  }finally{
    setLoading(false)
  }

}

return(

<div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">

<div className="bg-white rounded-xl w-full max-w-md p-6 shadow-lg space-y-4">

<h2 className="text-base font-semibold text-gray-900">
Add Knowledge
</h2>

{/* ERROR */}

{error && (
  <p className="text-sm text-red-500">{error}</p>
)}

<div>

<label className="text-sm font-medium text-gray-800">
Title
</label>

<input
value={title}
onChange={(e)=>setTitle(e.target.value)}
placeholder="Example: Pricing"
className="w-full border border-gray-300 rounded-lg px-3 py-2 mt-1 text-sm text-gray-900"
/>

</div>

<div>

<label className="text-sm font-medium text-gray-800">
Content
</label>

<textarea
value={content}
onChange={(e)=>setContent(e.target.value)}
placeholder="Enter knowledge content..."
className="w-full border border-gray-300 rounded-lg px-3 py-2 mt-1 text-sm text-gray-900"
rows={4}
/>

</div>

<div className="flex justify-end gap-3">

<button
onClick={onClose}
disabled={loading}
className="text-sm text-gray-700"
>
Cancel
</button>

<button
onClick={handleCreate}
disabled={loading}
className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
>
{loading ? "Saving..." : "Save"}
</button>

</div>

</div>

</div>

)

}