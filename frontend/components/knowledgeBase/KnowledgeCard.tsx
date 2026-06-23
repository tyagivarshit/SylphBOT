"use client"

import { parseKnowledge } from "./KnowledgeList"

type KnowledgeCardProps = {
  item: any
  onOpenPreview: (item: any) => void
  onEdit: (item: any) => void
}

export function formatLastUpdated(dateString: string) {
  if (!dateString) return "Today"
  const date = new Date(dateString)
  const now = new Date()
  
  // Strip hours/minutes to compare calendar dates
  const dDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const dNow = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  
  const diffTime = dNow.getTime() - dDate.getTime()
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24))
  
  if (diffDays === 0) {
    return "Today"
  }
  if (diffDays === 1) {
    return "Yesterday"
  }
  if (diffDays > 1 && diffDays < 7) {
    return `${diffDays} days ago`
  }
  if (diffDays >= 7 && diffDays < 14) {
    return "Last week"
  }
  if (diffDays >= 14 && diffDays < 30) {
    const weeks = Math.floor(diffDays / 7)
    return `${weeks} weeks ago`
  }
  if (diffDays >= 30 && diffDays < 60) {
    return "Last month"
  }
  if (diffDays >= 60) {
    const months = Math.floor(diffDays / 30)
    return `${months} months ago`
  }
  return "Last week"
}

export default function KnowledgeCard({ item, onOpenPreview, onEdit }: KnowledgeCardProps){
  const parsed = parseKnowledge(item)

  return (
    <div 
      onClick={() => onOpenPreview(item)}
      className="group relative flex flex-col justify-between bg-white border border-slate-200 hover:border-slate-300 rounded-xl p-5 min-h-[160px] transition-all cursor-pointer shadow-sm hover:shadow-md"
    >
      <div className="space-y-2">
        <h3 className="text-[15px] font-semibold tracking-tight text-slate-900 group-hover:text-slate-800 transition-colors line-clamp-1 leading-snug">
          {parsed.title}
        </h3>

        <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
          {parsed.purpose}
        </p>
      </div>

      <div className="mt-4 space-y-3">
        <div className="flex items-center justify-between text-[11px] text-slate-400">
          <span>Updated {formatLastUpdated(item.updatedAt)}</span>
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold leading-none ${
            parsed.status === "Ready" ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/10" :
            parsed.status === "Processing" ? "bg-amber-50 text-amber-700 ring-1 ring-amber-600/10 animate-pulse" :
            "bg-slate-55 text-slate-600 ring-1 ring-slate-600/10"
          }`}>
            <span className={`w-1 h-1 rounded-full ${
              parsed.status === "Ready" ? "bg-emerald-500" :
              parsed.status === "Processing" ? "bg-amber-500" :
              "bg-slate-400"
            }`} />
            {parsed.status}
          </span>
        </div>

        <div className="flex items-center gap-3 pt-3 border-t border-slate-100/60 text-xs font-semibold">
          <button 
            onClick={(e) => {
              e.stopPropagation()
              onOpenPreview(item)
            }}
            className="text-slate-900 hover:text-slate-650 transition-colors"
          >
            View
          </button>
          <button 
            onClick={(e) => {
              e.stopPropagation()
              onEdit(item)
            }}
            className="text-slate-400 hover:text-slate-900 transition-colors"
          >
            Edit
          </button>
        </div>
      </div>
    </div>
  )
}
