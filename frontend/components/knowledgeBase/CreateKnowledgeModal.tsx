"use client"

import { useState, useEffect } from "react"
import { api } from "@/lib/api"
import { parseKnowledge, serializeKnowledgeTitle } from "./KnowledgeList"
import { X } from "lucide-react"

export default function CreateKnowledgeModal({ open, onClose, selected, clientId = "" }: any){

  const [title,setTitle] = useState("")
  const [content,setContent] = useState("")
  const [category, setCategory] = useState("Company")
  const [source, setSource] = useState("Manual")
  const [status, setStatus] = useState("Ready")
  const [loading,setLoading] = useState(false)
  const [error,setError] = useState("")

  /* ============================= */
  /* PREFILL (EDIT MODE) */
  /* ============================= */

  useEffect(()=>{
    if(selected){
      const parsed = parseKnowledge(selected)
      setTitle(parsed.title || "")
      setCategory(parsed.category || "Company")
      setSource(parsed.source || "Manual")
      setStatus(parsed.status || "Ready")
      setContent(selected.content || "")
    }else{
      setTitle("")
      setCategory("Company")
      setSource("Manual")
      setStatus("Ready")
      setContent("")
    }
    setError("")
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

      const serializedTitle = serializeKnowledgeTitle(title, category, source, status)

      if(selected){
        await api.put(`/api/knowledge/${selected.id}`,{
          title: serializedTitle,
          content,
          clientId: clientId || undefined
        })
      }else{
        await api.post("/api/knowledge",{
          title: serializedTitle,
          content,
          clientId: clientId || undefined
        })
      }

      setTitle("")
      setContent("")
      onClose()

    }catch(err:any){

      console.error("Error saving knowledge:", err)

      setError(
        err?.response?.data?.message ||
        "Something went wrong"
      )

    }finally{
      setLoading(false)
    }

  }

  return(

    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-[4px] flex items-center justify-center z-50 px-4">

      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-white border border-slate-200 rounded-2xl p-6 shadow-2xl space-y-6">

        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h2 className="text-base font-semibold text-slate-900">
            {selected ? "Edit Knowledge Entry" : "Add Knowledge Entry"}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <p className="text-xs text-rose-650 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">
            {error}
          </p>
        )}

        {/* Form Grid */}
        <div className="space-y-4">
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Title
            </label>
            <input
              value={title}
              onChange={(e)=>setTitle(e.target.value)}
              placeholder="e.g. Company Mission Statement"
              className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 bg-slate-50/50 hover:bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 transition-all"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Category
              </label>
              <select
                value={category}
                onChange={(e)=>setCategory(e.target.value)}
                className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 bg-slate-50/50 hover:bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 transition-all"
              >
                <option value="Company">Company</option>
                <option value="Products">Products</option>
                <option value="Sales">Sales</option>
                <option value="Support">Support</option>
                <option value="Marketing">Marketing</option>
                <option value="Operations">Operations</option>
                <option value="Legal">Legal</option>
                <option value="Resources">Resources</option>
                <option value="Custom">Custom</option>
              </select>
            </div>

            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Source Type
              </label>
              <select
                value={source}
                onChange={(e)=>setSource(e.target.value)}
                className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 bg-slate-50/50 hover:bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 transition-all"
              >
                <option value="Manual">Manual</option>
                <option value="Document">Document</option>
                <option value="Website">Website</option>
              </select>
            </div>

            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Status
              </label>
              <select
                value={status}
                onChange={(e)=>setStatus(e.target.value)}
                className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 bg-slate-50/50 hover:bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 transition-all"
              >
                <option value="Ready">Ready</option>
                <option value="Processing">Processing</option>
                <option value="Failed">Failed</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Knowledge Content
            </label>
            <textarea
              value={content}
              onChange={(e)=>setContent(e.target.value)}
              placeholder="Enter specific facts, responses, context, or documents for your AI..."
              className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 bg-slate-50/50 hover:bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 transition-all"
              rows={6}
            />
          </div>
        </div>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end border-t border-slate-100 pt-4">

          <button
            onClick={onClose}
            disabled={loading}
            className="w-full sm:w-auto px-4 py-2 rounded-lg text-sm font-semibold bg-slate-50 text-slate-700 hover:bg-slate-100 transition-all"
          >
            Cancel
          </button>

          <button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full sm:w-auto px-5 py-2 rounded-lg text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-60 transition-all shadow-sm"
          >
            {loading ? "Saving..." : selected ? "Update" : "Save"}
          </button>

        </div>

      </div>

    </div>

  )

}
