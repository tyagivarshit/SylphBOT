"use client"

import { useState, useEffect } from "react"
import { api } from "@/lib/api"

export default function CreateKnowledgeModal({ open, onClose, selected }: any){

  const [title,setTitle] = useState("")
  const [content,setContent] = useState("")
  const [loading,setLoading] = useState(false)
  const [error,setError] = useState("")

  /* ============================= */
  /* PREFILL (EDIT MODE) */
  /* ============================= */

  useEffect(()=>{
    if(selected){
      setTitle(selected.title || "")
      setContent(selected.content || "")
    }else{
      setTitle("")
      setContent("")
    }
  },[selected, open])

  if(!open) return null

  /* ============================= */
  /* CREATE / UPDATE */
  /* ============================= */

  const handleSubmit = async () => {

    if(!title.trim() || !content.trim()){
      setError("Title and content are required")
      return
    }

    try{

      setLoading(true)
      setError("")

      if(selected){
        await api.put(`/api/knowledge/${selected.id}`,{
          title,
          content
        })
      }else{
        await api.post("/api/knowledge",{
          title,
          content
        })
      }

      setTitle("")
      setContent("")

      onClose()

    }catch(err:any){

      console.error("Error:", err)

      setError(
        err?.response?.data?.message ||
        "Something went wrong"
      )

    }finally{
      setLoading(false)
    }

  }

  return(

    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 px-4">

      <div className="bg-white/80 backdrop-blur-xl border border-blue-100 rounded-2xl w-full max-w-md p-6 shadow-xl space-y-5">

        <h2 className="text-base font-semibold text-gray-900">
          {selected ? "Edit Knowledge" : "Add Knowledge"}
        </h2>

        {error && (
          <p className="text-sm text-red-600 bg-red-100 border border-red-200 rounded-xl px-3 py-2">
            {error}
          </p>
        )}

        <div>

          <label className="text-xs font-medium text-gray-500">
            Title
          </label>

          <input
            value={title}
            onChange={(e)=>setTitle(e.target.value)}
            placeholder="Example: Pricing"
            className="w-full mt-1 border border-blue-100 rounded-xl px-4 py-2.5 text-sm text-gray-900 bg-white/70 focus:outline-none focus:ring-2 focus:ring-blue-400"
          />

        </div>

        <div>

          <label className="text-xs font-medium text-gray-500">
            Content
          </label>

          <textarea
            value={content}
            onChange={(e)=>setContent(e.target.value)}
            placeholder="Enter knowledge content..."
            className="w-full mt-1 border border-blue-100 rounded-xl px-4 py-2.5 text-sm text-gray-900 bg-white/70 focus:outline-none focus:ring-2 focus:ring-blue-400"
            rows={4}
          />

        </div>

        <div className="flex justify-end gap-3 pt-2">

          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 rounded-xl text-sm font-semibold bg-blue-50 text-gray-700 hover:bg-blue-100 transition"
          >
            Cancel
          </button>

          <button
            onClick={handleSubmit}
            disabled={loading}
            className="px-5 py-2 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-cyan-500 shadow-sm hover:shadow-md disabled:opacity-60 transition"
          >
            {loading ? "Saving..." : selected ? "Update" : "Save"}
          </button>

        </div>

      </div>

    </div>

  )

}