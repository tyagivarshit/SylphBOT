"use client"

import { useEffect, useState } from "react"
import KnowledgeCard from "./KnowledgeCard"
import CreateKnowledgeModal from "./CreateKnowledgeModal"
import { api } from "@/lib/api"

export default function KnowledgeList(){

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

      const res = await api.get("/api/knowledge")

      setKnowledge(res.data.knowledge || [])

    }catch(err){
      console.error("Fetch knowledge error:", err)
    }finally{
      setLoading(false)
    }

  }

  useEffect(()=>{
    fetchKnowledge()
  },[])

  /* ============================= */
  /* DELETE KNOWLEDGE */
  /* ============================= */

  const handleDelete = async (id: string) => {

    try{

      setDeletingId(id)

      await api.delete(`/api/knowledge/${id}`)

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

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">

        <h2 className="text-sm font-semibold text-gray-900">
          Knowledge Entries
        </h2>

        <button
          onClick={()=>{
            setSelected(null)
            setOpen(true)
          }}
          className="w-full sm:w-auto px-5 py-2.5 text-sm font-semibold rounded-xl text-white bg-gradient-to-r from-blue-600 to-cyan-500 shadow-sm hover:shadow-md transition"
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
              className="h-28 bg-white/80 backdrop-blur-xl border border-blue-100 rounded-2xl animate-pulse"
            />
          ))}
        </div>
      ) : knowledge.length === 0 ? (
        <div className="text-center border border-dashed border-blue-200 rounded-2xl p-6 sm:p-8 bg-white/70 backdrop-blur-xl">
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
                <div className="absolute inset-0 bg-white/60 backdrop-blur-sm flex items-center justify-center text-xs text-gray-600 rounded-2xl">
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
      />

    </div>

  )

}
