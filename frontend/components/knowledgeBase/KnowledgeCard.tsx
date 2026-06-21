"use client"

import { parseKnowledge } from "./KnowledgeList"
import { ArrowRight } from "lucide-react"

type KnowledgeCardProps = {
  item: any
  onOpenPreview: (item: any) => void
}

function formatLastUpdated(dateString: string) {
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
  if (diffDays <= 7) {
    return `${diffDays} days ago`
  }
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

export default function KnowledgeCard({ item, onOpenPreview }: KnowledgeCardProps){
  const parsed = parseKnowledge(item)

  return (
    <div 
      onClick={() => onOpenPreview(item)}
      className="group relative flex flex-col justify-between bg-white border border-slate-200/80 hover:border-slate-350 hover:shadow-[0_4px_16px_rgba(15,23,42,0.04)] rounded-xl p-5 h-[170px] transition-all cursor-pointer"
    >
      <div>
        <h3 className="text-[15px] font-semibold tracking-tight text-slate-900 group-hover:text-slate-700 transition-colors line-clamp-2 leading-snug">
          {parsed.title}
        </h3>

        <div className="mt-4 space-y-2 text-xs text-slate-500">
          <div className="flex items-center justify-between">
            <span>Category</span>
            <span className="font-medium text-slate-700">{parsed.category}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Updated</span>
            <span className="font-medium text-slate-700">{formatLastUpdated(item.updatedAt)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Status</span>
            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold leading-none ${
              parsed.status === "Ready" ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/10" :
              parsed.status === "Processing" ? "bg-amber-50 text-amber-700 ring-1 ring-amber-600/10 animate-pulse" :
              "bg-rose-50 text-rose-700 ring-1 ring-rose-600/10"
            }`}>
              <span className={`w-1 h-1 rounded-full ${
                parsed.status === "Ready" ? "bg-emerald-500" :
                parsed.status === "Processing" ? "bg-amber-500 animate-ping" :
                "bg-rose-500"
              }`} />
              {parsed.status}
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-slate-100 mt-2">
        <span className="text-xs font-semibold text-slate-900 group-hover:text-slate-600 transition-colors inline-flex items-center gap-0.5">
          Open
          <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
        </span>
      </div>
    </div>
  )
}
