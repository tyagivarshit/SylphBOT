"use client"

import { useEffect, useState } from "react"
import KnowledgeCard from "./KnowledgeCard"
import CreateKnowledgeModal from "./CreateKnowledgeModal"
import { api } from "@/lib/api"

export default function KnowledgeList(){

const [open,setOpen] = useState(false)
const [knowledge,setKnowledge] = useState<any[]>([])
const [loading,setLoading] = useState(false)

/* ============================= */
/* FETCH KNOWLEDGE */
/* ============================= */

const fetchKnowledge = async () => {

  try{

    setLoading(true)

    const res = await api.get("/knowledge")

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

    await api.delete(`/knowledge/${id}`)

    /* OPTIMISTIC UPDATE */
    setKnowledge(prev => prev.filter(item => item.id !== id))

  }catch(err){
    console.error("Delete error:", err)
  }

}

return(

<div className="space-y-4">

<div className="flex justify-between items-center">

<h2 className="text-sm font-semibold text-gray-900">
Knowledge Entries
</h2>

<button
onClick={()=>setOpen(true)}
className="bg-blue-600 text-white px-4 py-2 text-sm rounded-lg hover:bg-blue-700"
>
Add Knowledge
</button>

</div>

{/* LOADING */}

{loading ? (
  <p className="text-sm text-gray-500">Loading...</p>
) : knowledge.length === 0 ? (
  <p className="text-sm text-gray-500">No knowledge added yet</p>
) : (
  <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">

    {knowledge.map((item)=>(
      <KnowledgeCard 
        key={item.id} 
        item={item} 
        onDelete={handleDelete}
      />
    ))}

  </div>
)}

<CreateKnowledgeModal
open={open}
onClose={()=>{
  setOpen(false)
  fetchKnowledge() // 🔥 auto refresh after create
}}
/>

</div>

)

}