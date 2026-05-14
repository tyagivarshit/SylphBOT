"use client"

import { useEffect, useState } from "react"
import KnowledgeCard from "./KnowledgeCard"
import CreateKnowledgeModal from "./CreateKnowledgeModal"
import { api } from "@/lib/api"

type KnowledgeListProps = {
  clientId?: string
}

export default function KnowledgeList({ clientId = "" }: KnowledgeListProps){

  const [open,setOpen] = useState(false)
  const [selected,setSelected] = useState<any>(null)
  const [knowledge,setKnowledge] = useState<any[]>([])
  const [loading,setLoading] = useState(false)
  const [deletingId,setDeletingId] = useState<string | null>(null)

  /* ============================= */
  /* FETCH KNOWLEDGE */
  /* ============================= */

  const fetchKnowledge = async () => {

    try{
      setLoading(true)

      const res = await api.get("/api/knowledge", {
        params: clientId ? { clientId } : undefined
      })

      setKnowledge(res.data.knowledge || [])

    }catch(err){
      console.error("Fetch knowledge error:", err)
    }finally{
      setLoading(false)
    }

  }

  useEffect(()=>{
    fetchKnowledge()
  },[clientId])

  /* ============================= */
  /* DELETE KNOWLEDGE */
  /* ============================= */

  const handleDelete = async (id: string) => {

    try{

      setDeletingId(id)

      await api.delete(`/api/knowledge/${id}`, {
        params: clientId ? { clientId } : undefined
      })

      setKnowledge(prev => prev.filter(item => item.id !== id))

    }catch(err){
      console.error("Delete error:", err)
    }finally{
      setDeletingId(null)
    }

  }

  /* ============================= */
  /* EDIT HANDLER */
  /* ============================= */

  const handleEdit = (item: any) => {
    setSelected(item)
    setOpen(true)
  }

  /* ============================= */
  /* CLOSE MODAL */
  /* ============================= */

  const handleClose = () => {
    setOpen(false)
    setSelected(null)
    fetchKnowledge()
  }

  return(

    <div className="min-w-0 space-y-4 sm:space-y-5">

      <div className="flex flex-col gap-3 border-b border-slate-200/70 pb-4 sm:flex-row sm:items-center sm:justify-between">

        <h2 className="text-sm font-semibold text-gray-900">
          Knowledge Entries
        </h2>

        <button
          onClick={()=>{
            setSelected(null)
            setOpen(true)
          }}
          className="brand-button-primary w-full sm:w-auto"
        >
          Add Knowledge
        </button>

      </div>

      {/* ============================= */}
      {/* LOADING STATE */}
      {/* ============================= */}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({length:3}).map((_,i)=>(
            <div
              key={i}
              className="h-28 rounded-[24px] border border-slate-200 bg-white/80 animate-pulse"
            />
          ))}
        </div>
      ) : knowledge.length === 0 ? (
        <div className="brand-empty-state rounded-[24px] p-6 text-center sm:p-8">
          <p className="text-sm font-semibold text-gray-900">
            No knowledge added yet
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Start training your AI by adding knowledge
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">

          {knowledge.map((item)=>(

            <div key={item.id} className="relative min-w-0">

              <KnowledgeCard 
                item={item} 
                onDelete={handleDelete}
                onEdit={handleEdit}
              />

              {/* 🔥 DELETE LOADING OVERLAY */}
              {deletingId === item.id && (
                <div className="absolute inset-0 flex items-center justify-center rounded-[24px] bg-white/70 backdrop-blur-sm text-xs text-gray-600">
                  Deleting...
                </div>
              )}

            </div>

          ))}

        </div>
      )}

      <CreateKnowledgeModal
        open={open}
        onClose={handleClose}
        selected={selected}
        clientId={clientId}
      />

    </div>

  )

}
