"use client"

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import KnowledgeCard from "./KnowledgeCard"
import CreateKnowledgeModal from "./CreateKnowledgeModal"
import ImportKnowledgeModal from "./ImportKnowledgeModal"
import { api } from "@/lib/api"
import { 
  Search, 
  Plus, 
  Folder, 
  X, 
  ArrowRight, 
  FileText, 
  Globe, 
  BookOpen, 
  SlidersHorizontal,
  ChevronDown
} from "lucide-react"

/* =====================================================
METADATA SERIALIZATION & PARSING HELPERS
===================================================== */
interface KnowledgeMetadata {
  title: string
  category: string
  source: string
  status: string
}

export function parseKnowledge(item: any): KnowledgeMetadata {
  if (!item) {
    return {
      title: "",
      category: "Business Information",
      source: "Manual",
      status: "Ready",
    }
  }

  const rawTitle = item.title || ""
  if (rawTitle.startsWith("__KB__")) {
    const parts = rawTitle.split("__KB__")
    if (parts.length >= 3) {
      const metaStr = parts[1]
      const actualTitle = parts.slice(2).join("__KB__")
      
      const meta: Record<string, string> = {}
      metaStr.split("|").forEach((pair: string) => {
        const [k, v] = pair.split(":")
        if (k && v) {
          meta[k] = v
        }
      })
      
      return {
        category: meta.category || "Business Information",
        source: meta.source || "Manual",
        status: meta.status || "Ready",
        title: actualTitle || "Untitled Entry",
      }
    }
  }

  // Fallback parsing for legacy titles
  let category = "Business Information"
  const lowerTitle = rawTitle.toLowerCase()
  if (lowerTitle.includes("pricing") || lowerTitle.includes("plan") || lowerTitle.includes("cost")) {
    category = "Pricing"
  } else if (lowerTitle.includes("faq") || lowerTitle.includes("question") || lowerTitle.includes("q&a")) {
    category = "FAQs"
  } else if (lowerTitle.includes("policy") || lowerTitle.includes("term") || lowerTitle.includes("legal")) {
    category = "Policies"
  } else if (lowerTitle.includes("script") || lowerTitle.includes("sales")) {
    category = "Scripts"
  } else if (lowerTitle.includes("product") || lowerTitle.includes("service")) {
    category = "Products & Services"
  }

  return {
    title: rawTitle,
    category,
    source: "Manual",
    status: "Ready",
  }
}

export function serializeKnowledgeTitle(title: string, category: string, source: string, status: string): string {
  return `__KB__category:${category}|source:${source}|status:${status}__KB__${title}`
}

/* =====================================================
CATEGORIES LIST FOR LEFT SIDEBAR
===================================================== */
const CATEGORIES = [
  "All Knowledge",
  "Business Information",
  "Products & Services",
  "Pricing",
  "FAQs",
  "Policies",
  "Scripts",
  "Documents",
  "Website Knowledge",
  "Custom Knowledge"
]

type KnowledgeListProps = {
  clientId?: string
}

export default function KnowledgeList({ clientId = "" }: KnowledgeListProps){
  const pathname = usePathname()
  const isKnowledgeBasePage = pathname === "/knowledge-base" || pathname?.startsWith("/knowledge-base/")

  const [open,setOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [selected,setSelected] = useState<any>(null)
  const [selectedPreview, setSelectedPreview] = useState<any>(null)
  const [knowledge,setKnowledge] = useState<any[]>([])
  const [loading,setLoading] = useState(false)
  const [deletingId,setDeletingId] = useState<string | null>(null)

  // Filters & State
  const [selectedCategory, setSelectedCategory] = useState("All Knowledge")
  const [searchQuery, setSearchQuery] = useState("")
  const [sourceFilter, setSourceFilter] = useState("All")
  const [statusFilter, setStatusFilter] = useState("All")
  const [sortBy, setSortBy] = useState("Recently Updated")

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

  const handleEdit = (item: any) => {
    setSelected(item)
    setOpen(true)
  }

  const handleClose = () => {
    setOpen(false)
    setSelected(null)
    fetchKnowledge()
  }

  const handleImportClose = () => {
    setImportOpen(false)
    fetchKnowledge()
  }

  /* ============================= */
  /* FILTER & SORT LOGIC */
  /* ============================= */
  const filteredKnowledge = knowledge.filter((item) => {
    const meta = parseKnowledge(item)

    // 1. Category Search
    if (selectedCategory !== "All Knowledge") {
      if (meta.category !== selectedCategory) return false
    }

    // 2. Global Text Search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      const titleMatch = meta.title.toLowerCase().includes(query)
      const contentMatch = (item.content || "").toLowerCase().includes(query)
      if (!titleMatch && !contentMatch) return false
    }

    // 3. Source Filter
    if (sourceFilter !== "All") {
      if (meta.source.toLowerCase() !== sourceFilter.toLowerCase()) return false
    }

    // 4. Status Filter
    if (statusFilter !== "All") {
      if (meta.status.toLowerCase() !== statusFilter.toLowerCase()) return false
    }

    return true
  })

  const sortedKnowledge = [...filteredKnowledge].sort((a, b) => {
    const metaA = parseKnowledge(a)
    const metaB = parseKnowledge(b)

    if (sortBy === "Alphabetical") {
      return metaA.title.localeCompare(metaB.title)
    } else {
      // Recently Updated
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    }
  })

  // Loading Placeholder
  if (loading) {
    return (
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({length:3}).map((_,i)=>(
          <div
            key={i}
            className="h-44 rounded-xl border border-slate-200/80 bg-white/50 animate-pulse"
          />
        ))}
      </div>
    )
  }

  /* =====================================================
  EMBEDDED VIEW (FOR WORKFORCE/AI TRAINING MODALS)
  ===================================================== */
  if (!isKnowledgeBasePage) {
    return (
      <div className="min-w-0 space-y-4">
        {/* Simple Header Actions for embedded widget */}
        <div className="flex items-center justify-between border-b border-slate-200/60 pb-3">
          <h3 className="text-xs font-bold text-slate-800 uppercase tracking-widest">
            Company Knowledge
          </h3>
          <button
            onClick={() => {
              setSelected(null)
              setOpen(true)
            }}
            className="inline-flex items-center justify-center px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-all"
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            Add Entry
          </button>
        </div>

        {/* Global Search and Filter */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search knowledge..."
              className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-xs bg-slate-50/50 hover:bg-slate-50 focus:bg-white focus:outline-none"
            />
          </div>
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="border border-slate-200 rounded-lg text-xs px-3 py-2 bg-slate-50/50 focus:outline-none text-slate-700"
          >
            <option value="All">All Sources</option>
            <option value="Manual">Manual</option>
            <option value="Document">Document</option>
            <option value="Website">Website</option>
          </select>
        </div>

        {knowledge.length === 0 ? (
          <div className="text-center p-8 bg-slate-50/50 border border-dashed border-slate-200 rounded-xl">
            <p className="text-xs text-slate-500 font-medium">No knowledge entries configured yet</p>
          </div>
        ) : filteredKnowledge.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-xs text-slate-400">No matching entries found</p>
          </div>
        ) : (
          <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
            {sortedKnowledge.map((item) => (
              <KnowledgeCard
                key={item.id}
                item={item}
                onOpenPreview={setSelectedPreview}
              />
            ))}
          </div>
        )}

        <CreateKnowledgeModal
          open={open}
          onClose={handleClose}
          selected={selected}
          clientId={clientId}
        />

        <ImportKnowledgeModal
          open={importOpen}
          onClose={handleImportClose}
          onImportSuccess={fetchKnowledge}
          clientId={clientId}
        />

        {/* Sliding Panel Details */}
        {renderPreviewDrawer()}
      </div>
    )
  }

  /* =====================================================
  REDESIGNED WORKSPACE FULL VIEW
  ===================================================== */
  return (
    <div className="min-w-0 space-y-6">
      {/* 🚀 PAGE HEADER */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200/60 pb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Knowledge Base</h1>
          <p className="text-sm text-slate-500 mt-1">
            Teach your AI everything it needs to know about your business.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setImportOpen(true)}
            className="inline-flex items-center justify-center px-4 py-2 text-sm font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 rounded-lg transition-all shadow-sm"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Import
          </button>
          <button
            onClick={() => {
              setSelected(null)
              setOpen(true)
            }}
            className="inline-flex items-center justify-center px-4 py-2 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-all shadow-sm"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Add Knowledge
          </button>
        </div>
      </div>

      {/* 🚀 SPLIT PANELS WORKSPACE */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 items-start">
        
        {/* Left Side: Navigation Sidebar */}
        <div className="lg:col-span-1 space-y-1 bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm">
          <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-3 mb-2">
            Categories
          </div>
          <div className="space-y-0.5">
            {CATEGORIES.map((category) => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`w-full text-left px-3 py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-between ${
                  selectedCategory === category
                    ? "bg-slate-900 text-white shadow-sm"
                    : "text-slate-650 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <span>{category}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Right Side: Main Work Area */}
        <div className="lg:col-span-3 space-y-5">
          {/* Global Search Input */}
          <div className="relative w-full">
            <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search knowledge..."
              className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm bg-white hover:border-slate-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/5 focus:border-slate-900 transition-all shadow-sm"
            />
          </div>

          {/* Filters Control Row */}
          <div className="flex flex-wrap items-center gap-4 bg-white border border-slate-200/80 rounded-xl p-3.5 shadow-sm text-xs">
            {/* Source */}
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-slate-400">Source</span>
              <select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
                className="bg-slate-50 border border-slate-200 hover:bg-slate-100 hover:border-slate-300 rounded-lg px-2.5 py-1 text-slate-700 font-medium focus:outline-none transition-all cursor-pointer"
              >
                <option value="All">All</option>
                <option value="Manual">Manual</option>
                <option value="Document">Document</option>
                <option value="Website">Website</option>
              </select>
            </div>

            {/* Status */}
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-slate-400">Status</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-slate-50 border border-slate-200 hover:bg-slate-100 hover:border-slate-300 rounded-lg px-2.5 py-1 text-slate-700 font-medium focus:outline-none transition-all cursor-pointer"
              >
                <option value="All">All</option>
                <option value="Ready">Ready</option>
                <option value="Processing">Processing</option>
                <option value="Failed">Failed</option>
              </select>
            </div>

            {/* Sort */}
            <div className="flex items-center gap-1.5 sm:ml-auto">
              <span className="font-semibold text-slate-400">Sort</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="bg-slate-50 border border-slate-200 hover:bg-slate-100 hover:border-slate-300 rounded-lg px-2.5 py-1 text-slate-700 font-medium focus:outline-none transition-all cursor-pointer"
              >
                <option value="Recently Updated">Recently Updated</option>
                <option value="Alphabetical">Alphabetical</option>
              </select>
            </div>
          </div>

          {/* Cards Area & Empty States */}
          {knowledge.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center p-12 bg-white border border-slate-200/80 rounded-2xl min-h-[350px] shadow-sm max-w-2xl mx-auto my-8">
              <h3 className="text-lg font-semibold text-slate-900 tracking-tight">
                Your AI doesn't know anything about your business yet.
              </h3>
              <p className="text-sm text-slate-500 mt-2 max-w-md">
                Start by creating your first knowledge entry or importing existing business information.
              </p>
              <div className="mt-6 flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
                <button
                  onClick={() => {
                    setSelected(null)
                    setOpen(true)
                  }}
                  className="w-full sm:w-auto px-5 py-2.5 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-sm transition-all"
                >
                  Add Knowledge
                </button>
                <button
                  onClick={() => setImportOpen(true)}
                  className="w-full sm:w-auto px-5 py-2.5 text-sm font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg shadow-sm transition-all"
                >
                  Import
                </button>
              </div>
            </div>
          ) : filteredKnowledge.length === 0 ? (
            <div className="text-center py-16 bg-white border border-slate-200/80 rounded-2xl shadow-sm">
              <p className="text-sm font-semibold text-slate-900">No matching knowledge entries found</p>
              <p className="text-xs text-slate-500 mt-1">Try clearing your search query or selecting a different category.</p>
            </div>
          ) : (
            <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
              {sortedKnowledge.map((item) => (
                <div key={item.id} className="relative min-w-0">
                  <KnowledgeCard
                    item={item}
                    onOpenPreview={setSelectedPreview}
                  />

                  {/* DELETE LOADING COVERLAY */}
                  {deletingId === item.id && (
                    <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-white/70 backdrop-blur-sm text-xs font-semibold text-slate-700">
                      Deleting...
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <CreateKnowledgeModal
        open={open}
        onClose={handleClose}
        selected={selected}
        clientId={clientId}
      />

      <ImportKnowledgeModal
        open={importOpen}
        onClose={handleImportClose}
        onImportSuccess={fetchKnowledge}
        clientId={clientId}
      />

      {/* Sliding Panel Details */}
      {renderPreviewDrawer()}
    </div>
  )

  /* =====================================================
  SLIDING PREVIEW DRAWER (FOR READING ONLY)
  ===================================================== */
  function renderPreviewDrawer() {
    return (
      <>
        {/* Backdrop overlay */}
        {selectedPreview && (
          <div
            onClick={() => setSelectedPreview(null)}
            className="fixed inset-0 bg-slate-900/30 backdrop-blur-[2px] z-40 transition-opacity duration-300"
          />
        )}

        {/* Drawer Panel */}
        <div
          className={`fixed inset-y-0 right-0 w-full sm:w-[480px] bg-white border-l border-slate-200/80 shadow-2xl z-50 transform transition-transform duration-300 ease-out flex flex-col ${
            selectedPreview ? "translate-x-0" : "translate-x-full"
          }`}
        >
          {selectedPreview && (
            <div className="h-full flex flex-col justify-between">
              {/* Drawer Header */}
              <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Knowledge Base Entry
                </span>
                <button
                  onClick={() => setSelectedPreview(null)}
                  className="text-slate-400 hover:text-slate-600 p-1 rounded hover:bg-slate-50 transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Drawer Body (Read-only Preview Panel) */}
              <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
                <div>
                  <h2 className="text-xl font-bold tracking-tight text-slate-900 break-words leading-tight">
                    {parseKnowledge(selectedPreview).title}
                  </h2>
                  
                  <div className="flex flex-wrap gap-2 mt-3">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-800">
                      {parseKnowledge(selectedPreview).category}
                    </span>
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                      parseKnowledge(selectedPreview).status === 'Ready' ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/10' :
                      parseKnowledge(selectedPreview).status === 'Processing' ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-600/10 animate-pulse' :
                      'bg-rose-50 text-rose-700 ring-1 ring-rose-600/10'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        parseKnowledge(selectedPreview).status === 'Ready' ? 'bg-emerald-500' :
                        parseKnowledge(selectedPreview).status === 'Processing' ? 'bg-amber-500' :
                        'bg-rose-500'
                      }`} />
                      {parseKnowledge(selectedPreview).status}
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Content Preview
                  </label>
                  <div className="bg-slate-50 border border-slate-100 rounded-xl p-5 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed max-h-[350px] overflow-y-auto font-normal">
                    {selectedPreview.content}
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-slate-500 border-t border-slate-100 pt-4">
                  <span>Last Updated</span>
                  <span className="font-semibold text-slate-750">
                    {new Date(selectedPreview.updatedAt).toLocaleDateString("en-US", {
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit"
                    })}
                  </span>
                </div>
              </div>

              {/* Drawer Footer (Edit Trigger & Delete only) */}
              <div className="px-6 py-5 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end gap-3">
                <button
                  onClick={async () => {
                    const id = selectedPreview.id
                    setSelectedPreview(null)
                    await handleDelete(id)
                  }}
                  className="px-4 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-55 rounded-lg transition-colors"
                >
                  Delete
                </button>
                <button
                  onClick={() => {
                    const item = selectedPreview
                    setSelectedPreview(null)
                    handleEdit(item)
                  }}
                  className="px-5 py-2 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-all inline-flex items-center gap-1.5 shadow-sm"
                >
                  Edit Entry
                </button>
              </div>
            </div>
          )}
        </div>
      </>
    )
  }
}
