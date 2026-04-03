"use client"

import { useEffect, useState } from "react"
import { api } from "@/lib/api"
import CommentAutomationCard from "./CommentAutomationCard"
import CreateCommentAutomationModal from "./CreateCommentAutomationModal"

export default function CommentAutomationList(){

  const [open,setOpen] = useState(false)
  const [automations,setAutomations] = useState<any[]>([])
  const [loading,setLoading] = useState(true)
  const [error,setError] = useState("")

  /* 🔥 NEW */
  const [editData,setEditData] = useState<any>(null)

  /* ---------------- FETCH ---------------- */

  const fetchTriggers = async () => {
    try{
      setLoading(true)
      setError("")

      const res = await api.get("/api/comment-triggers")

      const data = Array.isArray(res.data)
        ? res.data
        : res.data?.triggers || []

      setAutomations(data)

    }catch{
      setError("Failed to load triggers")
    }finally{
      setLoading(false)
    }
  }

  useEffect(()=>{
    fetchTriggers()
  },[])

  /* ---------------- DELETE ---------------- */

  const handleDelete = async (id:string) => {
    try{
      await api.delete(`/api/comment-triggers/${id}`)
      setAutomations(prev => prev.filter(a => a.id !== id))
    }catch{
      alert("Delete failed")
    }
  }

  /* ---------------- EDIT ---------------- */

  const handleEdit = (automation:any) => {
    setEditData(automation)
    setOpen(true)
  }

  /* ---------------- CLOSE MODAL ---------------- */

  const handleClose = () => {
    setOpen(false)
    setEditData(null)
    fetchTriggers()
  }

  return(

    <div className="space-y-6">

      {/* HEADER */}

      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">

        <h2 className="text-lg font-semibold text-gray-900">
          Comment Automations
        </h2>

        <button
          onClick={()=>{
            setEditData(null) // 🔥 create mode
            setOpen(true)
          }}
          className="w-full sm:w-auto px-5 py-2 text-sm font-semibold rounded-xl text-white bg-gradient-to-r from-blue-600 to-cyan-500 shadow-sm hover:shadow-md transition"
        >
          Create Trigger
        </button>

      </div>

      {/* LOADING */}

      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({length:3}).map((_,i)=>(
            <div
              key={i}
              className="h-28 bg-white/80 backdrop-blur-xl border border-blue-100 rounded-2xl animate-pulse shadow-sm"
            />
          ))}
        </div>
      )}

      {/* ERROR */}

      {error && (
        <div className="text-sm text-red-600 bg-red-100 border border-red-200 rounded-xl p-3">
          {error}
        </div>
      )}

      {/* EMPTY */}

      {!loading && automations.length === 0 && (
        <div className="text-center border border-dashed border-blue-200 rounded-2xl p-8 bg-white/70 backdrop-blur-xl">
          
          <p className="text-base font-semibold text-gray-900">
            No comment automations yet
          </p>

          <p className="text-sm text-gray-500 mt-1">
            Turn comments into leads automatically
          </p>

          <button
            onClick={()=>{
              setEditData(null)
              setOpen(true)
            }}
            className="mt-4 px-5 py-2 text-sm rounded-xl font-semibold text-white bg-gradient-to-r from-blue-600 to-cyan-500 shadow-sm hover:shadow-md transition w-full sm:w-auto"
          >
            Create your first automation
          </button>

        </div>
      )}

      {/* LIST */}

      {!loading && automations.length > 0 && (

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">

          {automations.map((a)=>(
            <CommentAutomationCard
              key={a.id}
              automation={a}
              onDelete={()=>handleDelete(a.id)}
              onEdit={()=>handleEdit(a)} // 🔥 NEW
              onRefresh={fetchTriggers}
            />
          ))}

        </div>

      )}

      {/* MODAL */}

      <CreateCommentAutomationModal
        open={open}
        editData={editData} // 🔥 NEW
        onClose={handleClose}
      />

    </div>

  )
}