"use client"

import { useState, useEffect } from "react"
import { api } from "@/lib/api"
import { parseKnowledge, serializeKnowledgeTitle, getFallbackPurpose } from "./KnowledgeList"
import { X } from "lucide-react"

export default function CreateKnowledgeModal({ open, onClose, selected, clientId = "", onDelete }: any){

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

  const handleSubmit = async (overrideStatus?: string) => {
    if(!title.trim() || !content.trim()){
      setError("Title and content are required")
      return
    }

    try{
      setLoading(true)
      setError("")

      const finalStatus = overrideStatus || status || "Ready"
      const generatedPurpose = getFallbackPurpose(title, category)
      const serializedTitle = serializeKnowledgeTitle(title, category, source, finalStatus, generatedPurpose)

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

  const handleDeleteClick = async () => {
    if (!selected) return
    if (window.confirm("Are you sure you want to delete this knowledge entry?")) {
      try {
        setLoading(true)
        setError("")
        await onDelete(selected.id)
        onClose()
      } catch (err: any) {
        console.error("Error deleting knowledge:", err)
        setError(
          err?.response?.data?.message ||
          "Failed to delete knowledge"
        )
      } finally {
        setLoading(false)
      }
    }
  }

  return(
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-[4px] flex items-center justify-center z-50 px-4">
      <div className="w-full max-w-xl h-[90vh] max-h-[720px] flex flex-col bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden">
        {/* Fixed Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 shrink-0">
          <h2 className="text-base font-semibold text-slate-900">
            {selected ? "Edit Knowledge Entry" : "Add Knowledge Entry"}
          </h2>
          <button onClick={onClose} className="text-slate-450 hover:text-slate-650 transition-colors p-1 hover:bg-slate-50 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
          {error && (
            <p className="text-xs text-rose-650 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">
              {error}
            </p>
          )}

          <div className="space-y-6">
            {/* Category Select */}
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-450 block mb-1.5">
                Category
              </label>
              <select
                value={category}
                onChange={(e)=>setCategory(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 bg-slate-50/50 hover:bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 transition-all cursor-pointer"
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

            {/* Title (Notion Style) */}
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-450 block mb-1.5">
                Title
              </label>
              <input
                value={title}
                onChange={(e)=>setTitle(e.target.value)}
                placeholder="Untitled Entry"
                className="w-full text-lg font-bold text-slate-900 placeholder-slate-300 focus:outline-none py-1 border-b border-transparent focus:border-slate-100 transition-all"
              />
            </div>

            {/* Richer Editor for Knowledge Content */}
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-450 block mb-1.5">
                Knowledge Content
              </label>
              <textarea
                value={content}
                onChange={(e)=>setContent(e.target.value)}
                placeholder="Write specific facts, processes, scripts, or guidelines here..."
                className="w-full min-h-[300px] border border-slate-200/80 rounded-xl p-4 text-[14px] leading-relaxed text-slate-800 bg-slate-50/30 hover:bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/5 focus:border-slate-900 transition-all placeholder-slate-400 resize-y font-normal"
              />
            </div>
          </div>
        </div>

        {/* Fixed Footer Actions */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50/50 shrink-0">
          {selected && (
            <button
              type="button"
              onClick={handleDeleteClick}
              disabled={loading}
              className="mr-auto px-4 py-2 rounded-lg text-sm font-semibold text-rose-600 hover:bg-rose-50 transition-all text-center"
            >
              Delete
            </button>
          )}

          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-slate-50 text-slate-700 hover:bg-slate-100 transition-all"
          >
            Cancel
          </button>

          <button
            onClick={() => handleSubmit("Draft")}
            disabled={loading}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-all"
          >
            Save Draft
          </button>

          <button
            onClick={() => handleSubmit("Ready")}
            disabled={loading}
            className="px-5 py-2 rounded-lg text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-60 transition-all shadow-sm border border-slate-950"
          >
            {selected ? "Save Changes" : "Save Knowledge"}
          </button>
        </div>
      </div>
    </div>
  )
}
