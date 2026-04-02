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

    /* 🔥 INSTANT UI UPDATE */
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

  /* 🔥 REFRESH AFTER SAVE */
  fetchKnowledge()
}

return(

<div className="space-y-4">

<div className="flex justify-between items-center">

<h2 className="text-sm font-semibold text-gray-900">
Knowledge Entries
</h2>

<button
onClick={()=>{
  setSelected(null)
  setOpen(true)
}}
className="bg-blue-600 text-white px-4 py-2 text-sm rounded-lg hover:bg-blue-700"
>
Add Knowledge
</button>

</div>

{/* ============================= */
/* LOADING STATE */
/* ============================= */}

{loading ? (
  <p className="text-sm text-gray-500">Loading...</p>
) : knowledge.length === 0 ? (
  <p className="text-sm text-gray-500">No knowledge added yet</p>
) : (
  <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">

    {knowledge.map((item)=>(

      <div key={item.id} className="relative">

        <KnowledgeCard 
          item={item} 
          onDelete={handleDelete}
          onEdit={handleEdit}
        />

        {/* 🔥 DELETE LOADING OVERLAY */}
        {deletingId === item.id && (
          <div className="absolute inset-0 bg-white/60 flex items-center justify-center text-xs text-gray-600 rounded-xl">
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