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
  X, 
  BookOpen, 
  Briefcase, 
  ShoppingBag, 
  DollarSign, 
  HelpCircle, 
  Megaphone, 
  Settings, 
  ShieldCheck, 
  Folder,
  FileText
} from "lucide-react"

/* =====================================================
METADATA SERIALIZATION & PARSING HELPERS (WITH AUTO-MAPPING)
===================================================== */
export interface KnowledgeMetadata {
  title: string
  category: string
  source: string
  status: string
  purpose: string
}

export function getFallbackPurpose(title: string, category: string): string {
  const t = (title || "").toLowerCase()
  if (t.includes("pricing") || t.includes("price") || t.includes("plan") || t.includes("cost")) {
    return "Used when customer pricing questions are asked."
  }
  if (t.includes("refund") || t.includes("return") || t.includes("cancel")) {
    return "Used when refund questions are asked."
  }
  if (t.includes("hour") || t.includes("availability") || t.includes("open") || t.includes("schedule")) {
    return "Used when customers ask availability."
  }
  if (t.includes("script") || t.includes("pitch") || t.includes("objection") || t.includes("sales")) {
    return "Used during outbound conversations."
  }
  if (t.includes("mission") || t.includes("vision") || t.includes("about") || t.includes("overview")) {
    return "Used when AI introduces the company."
  }
  return `Used when customers ask about ${title || 'this topic'}.`
}

export function parseKnowledge(item: any): KnowledgeMetadata {
  if (!item) {
    return {
      title: "",
      category: "Company",
      source: "Manual",
      status: "Ready",
      purpose: "",
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
      
      const category = meta.category || "Company"
      let status = meta.status || "Ready"
      if (status !== "Ready" && status !== "Processing" && status !== "Draft") {
        status = "Draft"
      }
      const purpose = meta.purpose || getFallbackPurpose(actualTitle, category)
      
      return {
        category,
        source: meta.source || "Manual",
        status,
        purpose,
        title: actualTitle || "Untitled Entry",
      }
    }
  }

  // Frontend Auto Mapping for legacy database records
  const titleText = rawTitle.toLowerCase()
  const contentText = (item.content || "").toLowerCase()
  const fullText = `${titleText} ${contentText}`

  let category = "Custom"
  if (
    fullText.includes("privacy") || 
    fullText.includes("terms") || 
    fullText.includes("legal") || 
    fullText.includes("compliance") || 
    fullText.includes("agreement") ||
    fullText.includes("refund policy")
  ) {
    category = "Legal"
  } else if (
    fullText.includes("pricing") || 
    fullText.includes("plan") || 
    fullText.includes("price") || 
    fullText.includes("product") || 
    fullText.includes("service") || 
    fullText.includes("feature") || 
    fullText.includes("cost")
  ) {
    category = "Products"
  } else if (
    fullText.includes("sales") || 
    fullText.includes("script") || 
    fullText.includes("objection") || 
    fullText.includes("offer") || 
    fullText.includes("competitor") || 
    fullText.includes("comparison") || 
    fullText.includes("pitch")
  ) {
    category = "Sales"
  } else if (
    fullText.includes("faq") || 
    fullText.includes("question") || 
    fullText.includes("support") || 
    fullText.includes("refund") || 
    fullText.includes("customer") || 
    fullText.includes("help") || 
    fullText.includes("workflow")
  ) {
    category = "Support"
  } else if (
    fullText.includes("marketing") || 
    fullText.includes("campaign") || 
    fullText.includes("brand guideline") || 
    fullText.includes("messaging") || 
    fullText.includes("social media") || 
    fullText.includes("tone")
  ) {
    category = "Marketing"
  } else if (
    fullText.includes("sop") || 
    fullText.includes("operation") || 
    fullText.includes("process") || 
    fullText.includes("team instruction") || 
    fullText.includes("internal")
  ) {
    category = "Operations"
  } else if (
    fullText.includes("company") || 
    fullText.includes("overview") || 
    fullText.includes("mission") || 
    fullText.includes("vision") || 
    fullText.includes("brand voice") || 
    fullText.includes("about us") || 
    fullText.includes("contact") || 
    fullText.includes("hours")
  ) {
    category = "Company"
  } else if (
    fullText.includes("pdf") || 
    fullText.includes("docx") || 
    fullText.includes("uploaded") || 
    fullText.includes("import") || 
    fullText.includes("website") || 
    fullText.includes("file") || 
    fullText.includes("document") || 
    fullText.includes("txt")
  ) {
    category = "Resources"
  }

  return {
    title: rawTitle,
    category,
    source: "Manual",
    status: "Ready",
    purpose: getFallbackPurpose(rawTitle, category)
  }
}

export function serializeKnowledgeTitle(title: string, category: string, source: string, status: string, purpose: string = ""): string {
  const escapedPurpose = (purpose || "").replace(/\|/g, " ").replace(/:/g, " ")
  return `__KB__category:${category}|source:${source}|status:${status}|purpose:${escapedPurpose}__KB__${title}`
}

/* =====================================================
BUSINESS-FIRST CATEGORY DEFINITIONS FOR SIDEBAR
===================================================== */
const CATEGORY_DEFS = [
  {
    name: "Company",
    description: "Business identity & brand information",
    icon: Briefcase
  },
  {
    name: "Products",
    description: "Products, services, plans & pricing details",
    icon: ShoppingBag
  },
  {
    name: "Sales",
    description: "Sales scripts, objections & offers",
    icon: DollarSign
  },
  {
    name: "Support",
    description: "Knowledge used to help customers",
    icon: HelpCircle
  },
  {
    name: "Marketing",
    description: "Campaign messaging & brand guidelines",
    icon: Megaphone
  },
  {
    name: "Operations",
    description: "Internal SOPs & team workflows",
    icon: Settings
  },
  {
    name: "Legal",
    description: "Policies, terms & compliance rules",
    icon: ShieldCheck
  },
  {
    name: "Resources",
    description: "Imported documents & external content",
    icon: FileText
  },
  {
    name: "Custom",
    description: "Uncategorized business facts",
    icon: Folder
  }
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

  /* =====================================================
  KNOWLEDGE GRAPH ANALYSIS & RELATIONAL LINKING HELPERS
  ===================================================== */
  const calculateCompleteness = () => {
    let score = 30
    const allTitlesAndContent = (knowledge || []).map(k => {
      const parsed = parseKnowledge(k)
      return `${parsed.title} ${k.content || ""}`.toLowerCase()
    })

    const hasCompany = allTitlesAndContent.some(txt => txt.includes("company name:") || txt.includes("about:") || txt.includes("mission"))
    const hasProducts = allTitlesAndContent.some(txt => txt.includes("product name:") || txt.includes("description:") || txt.includes("features:"))
    const hasPricing = allTitlesAndContent.some(txt => txt.includes("plan name:") || txt.includes("price:") || txt.includes("billing cycle:"))
    const hasFaq = allTitlesAndContent.some(txt => txt.includes("question:") || txt.includes("answer:") || txt.includes("faq"))
    const hasPolicy = allTitlesAndContent.some(txt => txt.includes("policy name:") || txt.includes("policy content:") || txt.includes("refund"))
    const hasScript = allTitlesAndContent.some(txt => txt.includes("scenario:") || txt.includes("script:"))

    if (hasCompany) score += 15
    if (hasProducts) score += 15
    if (hasPricing) score += 15
    if (hasFaq) score += 10
    if (hasPolicy) score += 10
    if (hasScript) score += 10

    score += Math.min(5, (knowledge || []).length * 1)
    return Math.min(100, score)
  }

  const analyzeMissingKnowledge = () => {
    const warnings: string[] = []
    const allTitlesAndContent = (knowledge || []).map(k => {
      const parsed = parseKnowledge(k)
      return {
        id: k.id,
        title: parsed.title,
        category: parsed.category,
        text: `${parsed.title} ${k.content || ""}`.toLowerCase()
      }
    })

    const hasCompany = allTitlesAndContent.some(x => x.text.includes("company name:") || x.text.includes("about:") || x.text.includes("mission"))
    const hasProducts = allTitlesAndContent.some(x => x.category === "Products")
    const hasPricing = allTitlesAndContent.some(x => x.text.includes("plan name:") || x.text.includes("price:") || x.text.includes("billing cycle:"))
    const hasFaq = allTitlesAndContent.some(x => x.category === "Support")
    const hasRefundPolicy = allTitlesAndContent.some(x => x.text.includes("refund") || x.text.includes("return policy"))
    const hasScript = allTitlesAndContent.some(x => x.category === "Sales")

    if (!hasCompany) {
      warnings.push("⚠️ Missing Company Profile: The AI lacks general context about your business mission.")
    }
    if (hasProducts && !hasPricing) {
      warnings.push("⚠️ This product has no pricing: You have configured products but no active pricing plans.")
    }
    if (!hasRefundPolicy) {
      warnings.push("⚠️ Missing Refund Policy: Return scenarios are undefined. AI cannot answer customer return questions.")
    }
    if (hasFaq && !hasProducts) {
      warnings.push("⚠️ This service has no FAQ: FAQ entries lack product details or service link dependencies.")
    }
    if (hasScript && !allTitlesAndContent.some(x => x.category === "Products")) {
      warnings.push("⚠️ This script has no related product: Sales scripts exist but product configurations are missing.")
    }
    if (!hasFaq) {
      warnings.push("💡 Missing FAQ: Add commonly asked customer questions to support your support bot.")
    }

    return warnings.slice(0, 3)
  }

  const getUsedByBots = (category: string) => {
    switch (category) {
      case "Company":
        return ["Sales AI", "Support AI", "Booking AI", "Marketing AI"]
      case "Products":
        return ["Sales AI", "Support AI"]
      case "Sales":
        return ["Sales AI"]
      case "Support":
        return ["Support AI"]
      case "Legal":
        return ["Support AI", "Booking AI"]
      case "Resources":
        return ["Support AI", "Marketing AI"]
      default:
        return ["Support AI"]
    }
  }

  const getRelatedKnowledge = (currentItem: any) => {
    if (!currentItem) return []
    const currentMeta = parseKnowledge(currentItem)
    const currentText = `${currentMeta.title} ${currentItem.content || ""}`.toLowerCase()
    
    const keywords = ["pricing", "price", "plan", "product", "features", "refund", "return", "policy", "hours", "script", "sales", "support", "faq"]
    const matchedKeywords = keywords.filter(k => currentText.includes(k))

    return (knowledge || [])
      .filter(k => k.id !== currentItem.id)
      .map(k => {
        const meta = parseKnowledge(k)
        const text = `${meta.title} ${k.content || ""}`.toLowerCase()
        let score = 0
        
        if (meta.category === currentMeta.category) score += 3
        
        matchedKeywords.forEach(k => {
          if (text.includes(k)) score += 2
        })
        
        const wordsCurrent = new Set(currentText.split(/\s+/).filter(w => w.length > 4))
        const wordsTarget = text.split(/\s+/).filter(w => w.length > 4)
        wordsTarget.forEach(w => {
          if (wordsCurrent.has(w)) score += 1
        })
        
        return { item: k, score, title: meta.title, category: meta.category }
      })
      .filter(res => res.score > 1)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
  }

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
      if (selectedPreview?.id === id) {
        setSelectedPreview(null)
      }
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
      <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({length:3}).map((_,i)=>(
          <div
            key={i}
            className="h-44 rounded-xl border border-slate-200 bg-slate-50 animate-pulse"
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
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <h3 className="text-xs font-bold text-slate-850 uppercase tracking-widest">
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
              className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-xs bg-slate-50 hover:bg-white focus:outline-none"
            />
          </div>
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="border border-slate-200 rounded-lg text-xs px-3 py-2 bg-slate-50 focus:outline-none text-slate-700"
          >
            <option value="All">All Sources</option>
            <option value="Manual">Manual</option>
            <option value="Document">Document</option>
            <option value="Website">Website</option>
          </select>
        </div>

        {knowledge.length === 0 ? (
          <div className="text-center p-8 bg-slate-55 border border-dashed border-slate-200 rounded-xl">
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
                onEdit={handleEdit}
              />
            ))}
          </div>
        )}

        <CreateKnowledgeModal
          open={open}
          onClose={handleClose}
          selected={selected}
          clientId={clientId}
          onDelete={handleDelete}
          knowledge={knowledge}
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
  
  // Group logic for "All Knowledge"
  const groupedSections = CATEGORY_DEFS.reduce((acc, cat) => {
    const items = sortedKnowledge.filter(item => parseKnowledge(item).category === cat.name)
    if (items.length > 0) {
      acc.push({ category: cat, items })
    }
    return acc
  }, [] as { category: typeof CATEGORY_DEFS[0]; items: any[] }[])

  return (
    <div className="min-w-0 space-y-6">
      {/* 🚀 PAGE HEADER */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-6">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Knowledge Base</h1>
          <p className="text-sm text-slate-500 mt-1">
            Configure the facts, pricing, and workflows taught directly to your AI.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setImportOpen(true)}
            className="inline-flex items-center justify-center px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-350 rounded-lg transition-all shadow-sm"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Import
          </button>
          <button
            onClick={() => {
              setSelected(null)
              setOpen(true)
            }}
            className="inline-flex items-center justify-center px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-all shadow-sm border border-slate-950"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Add Knowledge
          </button>
        </div>
      </div>

      {/* 🚀 SPLIT PANELS WORKSPACE */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 items-start">
        
        {/* Left Side: Navigation Sidebar */}
        <div className="lg:col-span-1 bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-3 mb-3">
            Categories
          </div>
          <div className="space-y-1.5">
            {/* All Knowledge Option */}
            <button
              onClick={() => setSelectedCategory("All Knowledge")}
              className={`w-full text-left px-3 py-2.5 rounded-xl transition-all flex items-center gap-3 border ${
                selectedCategory === "All Knowledge"
                  ? "bg-slate-900 border-slate-900 text-white shadow-sm"
                  : "bg-transparent border-transparent text-slate-650 hover:bg-slate-50 hover:text-slate-900 hover:border-slate-100"
              }`}
            >
              <BookOpen className="w-4 h-4 shrink-0" />
              <span className="text-xs font-semibold">All Knowledge</span>
            </button>

            {CATEGORY_DEFS.map((cat) => {
              const IconComp = cat.icon
              return (
                <button
                  key={cat.name}
                  onClick={() => setSelectedCategory(cat.name)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl transition-all flex items-center gap-3 border ${
                    selectedCategory === cat.name
                      ? "bg-slate-900 border-slate-900 text-white shadow-sm"
                      : "bg-transparent border-transparent text-slate-650 hover:bg-slate-55 hover:text-slate-900 hover:border-slate-100"
                  }`}
                >
                  <IconComp className="w-4 h-4 shrink-0" />
                  <span className="text-xs font-semibold">{cat.name}</span>
                </button>
              )
            })}
          </div>

          {/* AI Memory Status Widget */}
          <div className="mt-6 pt-6 border-t border-slate-100 space-y-4">
            <div className="px-3">
              <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 block">
                Memory Completeness
              </span>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-xl font-bold text-slate-900">
                  {calculateCompleteness()}%
                </span>
                <span className="text-xs text-slate-400 font-medium">Complete</span>
              </div>
              <div className="w-full bg-slate-100 h-1.5 rounded-full mt-2 overflow-hidden">
                <div 
                  className="bg-slate-900 h-full rounded-full transition-all duration-500" 
                  style={{ width: `${calculateCompleteness()}%` }}
                />
              </div>
            </div>

            {/* AI Diagnostics Warnings */}
            {analyzeMissingKnowledge().length > 0 && (
              <div className="px-3 space-y-2">
                <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 block">
                  AI Memory Diagnostic
                </span>
                <div className="space-y-1.5">
                  {analyzeMissingKnowledge().map((warning, idx) => (
                    <div key={idx} className="bg-slate-50 border border-slate-200/50 rounded-lg p-2.5 text-[10px] text-slate-600 leading-normal font-medium">
                      {warning}
                    </div>
                  ))}
                </div>
              </div>
            )}
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
              className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm bg-white hover:border-slate-350 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/5 focus:border-slate-900 transition-all shadow-sm"
            />
          </div>

          {/* Filters Control Row */}
          <div className="flex flex-wrap items-center gap-4 bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm text-xs">
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
                <option value="Draft">Draft</option>
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
          {sortedKnowledge.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center py-20 px-4 bg-white border border-slate-200 rounded-xl max-w-md mx-auto my-8">
              <p className="text-sm font-medium text-slate-900 mb-4">
                {searchQuery ? "No matching entries found." : "No knowledge added yet."}
              </p>
              {!searchQuery && (
                <button
                  onClick={() => {
                    setSelected(null)
                    setOpen(true)
                  }}
                  className="inline-flex items-center justify-center px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-all border border-slate-950 shadow-sm"
                >
                  Add Knowledge
                </button>
              )}
            </div>
          ) : selectedCategory === "All Knowledge" ? (
            /* Grouped by selected category when All Knowledge is selected */
            <div className="space-y-10">
              {groupedSections.map(({ category, items }) => (
                <div key={category.name} className="space-y-4">
                  <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                    <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">
                      {category.name}
                    </h2>
                    <span className="text-xs text-slate-400 font-medium ml-1">
                      ({items.length})
                    </span>
                  </div>
                  <div className="grid gap-6 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
                    {items.map((item) => (
                      <div key={item.id} className="relative min-w-0">
                        <KnowledgeCard
                          item={item}
                          onOpenPreview={setSelectedPreview}
                          onEdit={handleEdit}
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
                </div>
              ))}
            </div>
          ) : (
            /* Selected category view: list cards for selected category only */
            <div className="grid gap-6 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
              {sortedKnowledge.map((item) => (
                <div key={item.id} className="relative min-w-0">
                  <KnowledgeCard
                    item={item}
                    onOpenPreview={setSelectedPreview}
                    onEdit={handleEdit}
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
        onDelete={handleDelete}
        knowledge={knowledge}
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
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-[2px] z-40 transition-opacity duration-300"
          />
        )}

        {/* Drawer Panel */}
        <div
          className={`fixed inset-y-0 right-0 w-full sm:w-[500px] bg-white border-l border-slate-200 shadow-2xl z-50 transform transition-transform duration-300 ease-out flex flex-col ${
            selectedPreview ? "translate-x-0" : "translate-x-full"
          }`}
        >
          {selectedPreview && (() => {
            const parsed = parseKnowledge(selectedPreview)
            return (
              <div className="h-full flex flex-col justify-between">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Knowledge Memory View
                  </span>
                  <button
                    onClick={() => setSelectedPreview(null)}
                    className="text-slate-400 hover:text-slate-650 p-1 rounded hover:bg-slate-55 transition-all"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
                  {/* Title */}
                  <div>
                    <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      Title
                    </label>
                    <h2 className="text-lg font-bold tracking-tight text-slate-900 break-words leading-tight mt-1">
                      {parsed.title}
                    </h2>
                  </div>

                  {/* Category */}
                  <div>
                    <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      Category
                    </label>
                    <div className="mt-1">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-800">
                        {parsed.category}
                      </span>
                    </div>
                  </div>

                  {/* Purpose */}
                  <div>
                    <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      Purpose
                    </label>
                    <p className="text-sm text-slate-700 font-medium mt-1 leading-relaxed">
                      {parsed.purpose}
                    </p>
                  </div>

                  {/* Content */}
                  <div>
                    <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      Content
                    </label>
                    <div className="bg-slate-50 border border-slate-100 rounded-xl p-5 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed max-h-[300px] overflow-y-auto mt-1 font-normal">
                      {selectedPreview.content}
                    </div>
                  </div>

                  {/* Last Updated */}
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

                  {/* Status */}
                  <div className="flex items-center justify-between text-xs text-slate-500 border-t border-slate-100 pt-4">
                    <span>Status</span>
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                      parsed.status === 'Ready' ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/10' :
                      parsed.status === 'Processing' ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-600/10 animate-pulse' :
                      'bg-slate-100 text-slate-700 ring-1 ring-slate-600/10'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        parsed.status === 'Ready' ? 'bg-emerald-500' :
                        parsed.status === 'Processing' ? 'bg-amber-500' :
                        'bg-slate-400'
                      }`} />
                      {parsed.status}
                    </span>
                  </div>

                  {/* Used By (Cross References) */}
                  <div className="border-t border-slate-100 pt-4">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-450 block">
                      Used By
                    </label>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {getUsedByBots(parsed.category).map((bot, idx) => (
                        <span key={idx} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-slate-50 text-slate-700 border border-slate-150">
                          {bot}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Related Memory Nodes (Auto Linking) */}
                  <div className="border-t border-slate-100 pt-4">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-450 block">
                      Related Memory Nodes
                    </label>
                    {getRelatedKnowledge(selectedPreview).length === 0 ? (
                      <span className="text-[11px] text-slate-400 mt-2 block italic">
                        No related knowledge nodes detected yet.
                      </span>
                    ) : (
                      <div className="space-y-1.5 mt-2">
                        {getRelatedKnowledge(selectedPreview).map((rel, idx) => (
                          <div 
                            key={idx}
                            onClick={() => setSelectedPreview(rel.item)}
                            className="flex items-center justify-between p-2 rounded-lg border border-slate-200/60 bg-slate-50/30 hover:bg-slate-50 hover:border-slate-300 cursor-pointer transition-all"
                          >
                            <span className="text-[11px] font-semibold text-slate-800 truncate max-w-[240px]">
                              {rel.title}
                            </span>
                            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                              {rel.category}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer Buttons */}
                <div className="px-6 py-5 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end gap-3">
                  <button
                    onClick={() => setSelectedPreview(null)}
                    className="px-4 py-2 text-sm font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors shadow-sm"
                  >
                    Close
                  </button>
                  <button
                    onClick={() => {
                      const item = selectedPreview
                      setSelectedPreview(null)
                      handleEdit(item)
                    }}
                    className="px-5 py-2 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-all inline-flex items-center gap-1.5 shadow-sm border border-slate-950"
                  >
                    Edit
                  </button>
                </div>
              </div>
            )
          })()}
        </div>
      </>
    )
  }
}
