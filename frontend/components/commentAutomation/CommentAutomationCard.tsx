"use client"

import { api } from "@/lib/api"
import { useState } from "react"

export default function CommentAutomationCard({
  automation,
  onDelete,
  onRefresh,
  onEdit, // 🔥 NEW
}: any){

  const [loading,setLoading] = useState(false)

  /* ---------------- TOGGLE ---------------- */

  const handleToggle = async () => {
    try{
      setLoading(true)

      await api.patch(`/api/comment-triggers/${automation.id}/toggle`)

      onRefresh?.()

    }catch{
      alert("Failed to update status")
    }finally{
      setLoading(false)
    }
  }

  /* ---------------- DELETE ---------------- */

  const handleDelete = async () => {
    try{
      await api.delete(`/api/comment-triggers/${automation.id}`)

      onDelete?.(automation.id) // 🔥 only one place handle

    }catch{
      alert("Delete failed")
    }
  }

  /* ---------------- STATUS ---------------- */

  const isActive = automation.isActive

  return(

    <div className="flex h-full flex-col justify-between rounded-[24px] border border-slate-200/80 bg-white/84 p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">

      {/* HEADER */}

      <div className="flex justify-between items-start gap-3">

        <h3 className="text-sm sm:text-base font-semibold text-gray-900 break-words">
          Keyword: {automation.keyword}
        </h3>

        <span
          className={`text-xs px-2.5 py-1 rounded-full font-semibold whitespace-nowrap ${
            isActive
              ? "bg-emerald-50 text-emerald-700"
              : "bg-slate-100 text-slate-600"
          }`}
        >
          {isActive ? "ACTIVE" : "PAUSED"}
        </span>

      </div>

      {/* INFO */}

      <div className="mt-4 space-y-2 text-sm">

        <p className="text-gray-600 break-words">
          Reply: <span className="text-gray-900 font-medium">
            {automation.replyText}
          </span>
        </p>

        {automation.dmText && (
          <p className="text-gray-500 break-words">
            DM: {automation.dmText}
          </p>
        )}

        <p className="text-xs text-gray-400 break-all">
          Post ID: {automation.reelId}
        </p>

        {automation.triggerCount !== undefined && (
          <p className="text-xs text-gray-500">
            Triggered: {automation.triggerCount}
          </p>
        )}

      </div>

      {/* ACTIONS */}

      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mt-5">

        <div className="flex gap-4">

          <button
            onClick={() => onEdit?.(automation)} // 🔥 FIXED
            className="text-sm font-semibold text-blue-600 hover:text-blue-700 transition"
          >
            Edit
          </button>

          <button
            onClick={handleDelete}
            className="text-sm font-semibold text-red-600 hover:text-red-700 transition"
          >
            Delete
          </button>

        </div>

        {/* TOGGLE */}

        <button
          onClick={handleToggle}
          disabled={loading}
          className={`w-full sm:w-auto text-sm px-4 py-2 rounded-xl font-semibold transition ${
            isActive
              ? "bg-blue-50 text-slate-700 hover:bg-blue-100"
              : "bg-[linear-gradient(135deg,#081223_0%,#0b2a5b_55%,#1e5eff_100%)] text-white hover:shadow-md"
          }`}
        >
          {loading ? "..." : isActive ? "Pause" : "Activate"}
        </button>

      </div>

    </div>

  )
}
