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

    <div className="border border-blue-100 rounded-2xl p-5 bg-white/80 backdrop-blur-xl shadow-sm hover:shadow-lg transition flex flex-col justify-between h-full">

      {/* HEADER */}

      <div className="flex justify-between items-start gap-3">

        <h3 className="text-sm sm:text-base font-semibold text-gray-900 break-words">
          Keyword: {automation.keyword}
        </h3>

        <span
          className={`text-xs px-2.5 py-1 rounded-full font-semibold whitespace-nowrap ${
            isActive
              ? "bg-green-100 text-green-700"
              : "bg-yellow-100 text-yellow-700"
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
              ? "bg-blue-50 text-gray-700 hover:bg-blue-100"
              : "bg-gradient-to-r from-blue-600 to-cyan-500 text-white hover:shadow-md"
          }`}
        >
          {loading ? "..." : isActive ? "Pause" : "Activate"}
        </button>

      </div>

    </div>

  )
}