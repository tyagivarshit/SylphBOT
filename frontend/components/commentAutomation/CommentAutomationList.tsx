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

      <div className="flex flex-col gap-3 border-b border-slate-200/70 pb-4 sm:flex-row sm:items-center sm:justify-between">

        <h2 className="text-lg font-semibold text-gray-900">
          Active triggers
        </h2>

        <button
          onClick={()=>{
            setEditData(null) // 🔥 create mode
            setOpen(true)
          }}
          className="brand-button-primary w-full sm:w-auto"
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
              className="h-28 rounded-[24px] border border-slate-200 bg-white/80 animate-pulse shadow-sm"
            />
          ))}
        </div>
      )}

      {/* ERROR */}

      {error && (
        <div className="rounded-[22px] border border-red-200 bg-red-50 p-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* EMPTY */}

      {!loading && automations.length === 0 && (
        <div className="brand-empty-state rounded-[24px] p-8 text-center">
          
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
            className="brand-button-primary mt-4 w-full sm:w-auto"
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
