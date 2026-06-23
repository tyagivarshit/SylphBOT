"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
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
  FileText,
  Globe,
  Activity
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

export function getTemplateType(item: any): string {
  const parsed = parseKnowledge(item)
  const rawContent = item.content || ""
  const rawCategory = parsed.category
  
  if (rawContent.startsWith("Company Name:")) return "company"
  if (rawContent.startsWith("Product Name:")) return "product"
  if (rawContent.startsWith("Plan Name:")) return "pricing"
  if (rawContent.startsWith("Question:")) return "faq"
  if (rawContent.startsWith("Policy Name:")) return "policy"
  if (rawContent.startsWith("Scenario:")) return "script"
  if (rawContent.startsWith("Website URL:")) return "website"
  if (rawContent.startsWith("Title:") && rawCategory === "Resources") return "document"

  // Fallbacks for categories
  const cat = (rawCategory || "").toLowerCase()
  if (cat === "company") return "company"
  if (cat === "products") return "product"
  if (cat === "sales") return "script"
  if (cat === "support") return "faq"
  if (cat === "legal") return "policy"
  if (cat === "resources") return "document"
  
  return "custom"
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
    type: "company",
    name: "Company",
    description: "Business identity & brand information",
    icon: Briefcase
  },
  {
    type: "product",
    name: "Products",
    description: "Products, services & core details",
    icon: ShoppingBag
  },
  {
    type: "pricing",
    name: "Pricing",
    description: "Plans, billing cycle, and pricing lists",
    icon: DollarSign
  },
  {
    type: "faq",
    name: "FAQ",
    description: "Common customer questions & answers",
    icon: HelpCircle
  },
  {
    type: "policy",
    name: "Policies",
    description: "Business rules, refund policies, & terms",
    icon: ShieldCheck
  },
  {
    type: "script",
    name: "Scripts",
    description: "Sales scripts & conversation scenario dialogs",
    icon: Megaphone
  },
  {
    type: "document",
    name: "Documents",
    description: "Imported files and offline sheets/manuals",
    icon: FileText
  },
  {
    type: "website",
    name: "Website",
    description: "Crawled website links and online pages",
    icon: Globe
  },
  {
    type: "custom",
    name: "Custom",
    description: "Custom facts and notes",
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

  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    return () => setMounted(false)
  }, [])

  // Drawer & Suggestion State
  const [showHealthDrawer, setShowHealthDrawer] = useState(false)
  const [activeInitialType, setActiveInitialType] = useState<string | null>(null)

  useEffect(() => {
    if (selectedPreview || showHealthDrawer) {
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = ""
    }
    return () => {
      document.body.style.overflow = ""
    }
  }, [selectedPreview, showHealthDrawer])

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

  const getMissingSuggestions = () => {
    const suggestions = []
    const allText = (knowledge || []).map(k => {
      const parsed = parseKnowledge(k)
      return `${parsed.title} ${k.content || ""}`.toLowerCase()
    })

    const hasCompany = allText.some(t => t.includes("company profile") || t.includes("company name:") || t.includes("about:") || t.includes("mission") || t.includes("brand voice"))
    const hasPricing = allText.some(t => t.includes("pricing") || t.includes("plan name:") || t.includes("billing cycle:"))
    const hasFaq = allText.some(t => t.includes("faq") || t.includes("question:") || t.includes("frequently asked"))
    const hasRefundPolicy = allText.some(t => t.includes("refund policy") || t.includes("return policy") || t.includes("refunds"))
    const hasSalesScript = allText.some(t => t.includes("sales script") || t.includes("conversation script") || t.includes("scenario:") || t.includes("script:"))
    const hasShippingPolicy = allText.some(t => t.includes("shipping policy") || t.includes("shipping guidelines"))

    if (!hasRefundPolicy) {
      suggestions.push({ id: "refund", label: "Refund Policy", type: "policy" })
    }
    if (!hasPricing) {
      suggestions.push({ id: "pricing", label: "Pricing", type: "pricing" })
    }
    if (!hasFaq) {
      suggestions.push({ id: "faq", label: "Frequently Asked Questions", type: "faq" })
    }
    if (!hasSalesScript) {
      suggestions.push({ id: "script", label: "Sales Script", type: "script" })
    }
    if (!hasShippingPolicy) {
      suggestions.push({ id: "shipping", label: "Shipping Policy", type: "policy" })
    }

    return suggestions
  }

  const handleAddSuggestion = (type: string) => {
    setSelected(null)
    setActiveInitialType(type)
    setOpen(true)
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
    setActiveInitialType(null)
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
      const matchedCat = CATEGORY_DEFS.find(c => c.name === selectedCategory)
      if (matchedCat) {
        if (getTemplateType(item) !== matchedCat.type) return false
      } else {
        if (meta.category !== selectedCategory) return false
      }
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
          initialType={activeInitialType}
        />

        <ImportKnowledgeModal
          open={importOpen}
          onClose={handleImportClose}
          onImportSuccess={fetchKnowledge}
          clientId={clientId}
          knowledge={knowledge}
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
    const items = sortedKnowledge.filter(item => getTemplateType(item) === cat.type)
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
              setSelected(null);
              setActiveInitialType(null);
              setOpen(true);
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

          {/* Knowledge Health Compact Card */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex items-center justify-between text-sm transition-all hover:shadow-md">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl">
                <Activity className="w-5 h-5 animate-pulse text-emerald-600" />
              </div>
              <div>
                <h3 className="font-bold text-slate-800">Knowledge Health</h3>
                <p className="text-xs text-slate-505 mt-0.5">
                  Verify your AI's coverage & memory readiness.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <span className="text-base font-extrabold text-slate-900">
                  {calculateCompleteness()}%
                </span>
                <span className="text-xs text-slate-450 font-medium ml-1">Complete</span>
              </div>
              <button
                onClick={() => setShowHealthDrawer(true)}
                className="px-3.5 py-1.5 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-850 transition-colors shadow-sm cursor-pointer"
              >
                View Details →
              </button>
            </div>
          </div>

          {/* Suggested Next Knowledge Banner */}
          {knowledge.length > 0 && getMissingSuggestions().length > 0 && (
            <div className="bg-purple-50/40 border border-purple-100 rounded-xl p-4 space-y-3 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-650"></span>
                  </span>
                  <h3 className="text-xs font-bold text-purple-950">
                    Suggested Next Knowledge
                  </h3>
                </div>
                <span className="text-[10px] text-purple-600 font-semibold">
                  Dynamic missing profiles
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {getMissingSuggestions().map((sugg) => (
                  <button
                    key={sugg.id}
                    onClick={() => handleAddSuggestion(sugg.type)}
                    className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-purple-200 hover:border-purple-300 text-purple-750 hover:text-purple-900 transition-all shadow-sm cursor-pointer gap-1.5"
                  >
                    <Plus className="w-3 h-3 text-purple-400" />
                    + Add {sugg.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Cards Area & Empty States */}
          {knowledge.length === 0 ? (
            /* Task 2: Educational Empty State */
            <div className="bg-white border border-slate-200 rounded-2xl p-8 max-w-2xl mx-auto my-8 shadow-sm flex flex-col items-center text-center space-y-6">
              <div className="w-16 h-16 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-center text-slate-800 relative">
                <BookOpen className="w-8 h-8 text-slate-900" />
                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-slate-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-slate-900"></span>
                </span>
              </div>

              <div className="space-y-2 max-w-md">
                <h2 className="text-lg font-bold text-slate-950">
                  Your AI has no business knowledge yet
                </h2>
                <p className="text-xs text-slate-500 leading-relaxed font-normal">
                  Before your AI employees can answer questions, pitch plans, or resolve customer disputes, they need to learn about your business.
                </p>
              </div>

              <div className="bg-slate-50 border border-slate-150 rounded-xl p-5 w-full max-w-md text-left space-y-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-455 block mb-1">
                  Teach your AI about:
                </span>
                <div className="grid grid-cols-2 gap-2 text-xs font-semibold text-slate-700">
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-500 font-bold">✓</span>
                    <span>Company</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-500 font-bold">✓</span>
                    <span>Products</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-500 font-bold">✓</span>
                    <span>Pricing</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-500 font-bold">✓</span>
                    <span>FAQs</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-500 font-bold">✓</span>
                    <span>Policies</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-500 font-bold">✓</span>
                    <span>Documents</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-3 w-full max-w-md pt-2">
                <button
                  onClick={() => {
                    setSelected(null);
                    setActiveInitialType(null);
                    setOpen(true);
                  }}
                  className="w-full sm:flex-1 py-2.5 bg-slate-900 hover:bg-slate-805 text-white text-xs font-semibold rounded-lg shadow-sm border border-slate-950 transition-all cursor-pointer text-center"
                >
                  Add First Knowledge
                </button>
                <button
                  onClick={() => setImportOpen(true)}
                  className="w-full sm:flex-1 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-750 text-xs font-semibold rounded-lg shadow-sm transition-all cursor-pointer text-center"
                >
                  Import Existing Knowledge
                </button>
              </div>
            </div>
          ) : sortedKnowledge.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center py-20 px-4 bg-white border border-slate-200 rounded-xl max-w-md mx-auto my-8">
              <p className="text-sm font-medium text-slate-900 mb-4">
                No matching entries found.
              </p>
              <button
                onClick={() => {
                  setSearchQuery("");
                  setSourceFilter("All");
                  setStatusFilter("All");
                }}
                className="text-xs font-bold text-slate-900 underline hover:text-slate-700"
              >
                Clear Search & Filters
              </button>
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
        initialType={activeInitialType}
      />

      <ImportKnowledgeModal
        open={importOpen}
        onClose={handleImportClose}
        onImportSuccess={fetchKnowledge}
        clientId={clientId}
        knowledge={knowledge}
      />

      {/* Sliding Panel Details */}
      {renderPreviewDrawer()}
      {renderHealthDrawer()}
    </div>
  )

  /* =====================================================
  SLIDING PREVIEW DRAWER (FOR READING ONLY)
  ===================================================== */
  function renderPreviewDrawer() {
    if (!mounted || !selectedPreview) return null

    const parsed = parseKnowledge(selectedPreview)

    return createPortal(
      <div className="fixed inset-0 z-[9999] flex justify-end">
        {/* Backdrop overlay */}
        <div
          onClick={() => setSelectedPreview(null)}
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm"
        />

        {/* Drawer Panel */}
        <div className="relative z-10 w-full sm:w-[500px] bg-white border-l border-slate-200 shadow-2xl h-full flex flex-col">
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
        </div>
      </div>,
      document.body
    )
  }

  function renderHealthDrawer() {
    if (!mounted || !showHealthDrawer) return null

    return createPortal(
      <div className="fixed inset-0 z-[9999] flex justify-end">
        {/* Backdrop overlay */}
        <div
          onClick={() => setShowHealthDrawer(false)}
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm"
        />

        {/* Drawer Panel */}
        <div className="relative z-10 w-full sm:w-[500px] bg-white border-l border-slate-200 shadow-2xl h-full flex flex-col">
          <div className="h-full flex flex-col justify-between">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 shrink-0">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Knowledge Health Center
              </span>
              <button
                onClick={() => setShowHealthDrawer(false)}
                className="text-slate-400 hover:text-slate-655 p-1 rounded hover:bg-slate-50 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
              
              {/* Memory Completeness score */}
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                  Memory Completeness
                </label>
                <div className="flex items-baseline gap-1.5 mt-2">
                  <span className="text-3xl font-extrabold text-slate-950">
                    {calculateCompleteness()}%
                  </span>
                  <span className="text-xs text-slate-500 font-semibold">Complete</span>
                </div>
                <div className="w-full bg-slate-100 h-2 rounded-full mt-3 overflow-hidden border border-slate-200/50">
                  <div 
                    className="bg-slate-900 h-full rounded-full transition-all duration-500" 
                    style={{ width: `${calculateCompleteness()}%` }}
                  />
                </div>
              </div>

              {/* Knowledge Coverage breakdown */}
              <div className="border-t border-slate-100 pt-5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-450 block mb-3">
                  Knowledge Coverage
                </label>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  {CATEGORY_DEFS.map((cat) => {
                    const count = knowledge.filter(k => getTemplateType(k) === cat.type).length
                    const IconComp = cat.icon
                    return (
                      <div 
                        key={cat.type} 
                        className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200/50 rounded-xl"
                      >
                        <div className="flex items-center gap-2 truncate">
                          <IconComp className="w-4 h-4 text-slate-500 shrink-0" />
                          <span className="font-semibold text-slate-700 truncate">{cat.name}</span>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                          count > 0 
                            ? "bg-slate-900 text-white" 
                            : "bg-slate-200/80 text-slate-500"
                        }`}>
                          {count}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* AI Diagnostics Warnings & Missing Knowledge */}
              <div className="border-t border-slate-100 pt-5 space-y-3">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-450 block">
                  AI Diagnostics & Warnings
                </label>
                {analyzeMissingKnowledge().length === 0 ? (
                  <p className="text-xs text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-xl p-3.5 font-semibold">
                    ✓ All checks passed! No missing basic knowledge profiles detected.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {analyzeMissingKnowledge().map((warning, idx) => (
                      <div 
                        key={idx} 
                        className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-700 leading-relaxed font-medium"
                      >
                        {warning}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Recommended Next Steps */}
              <div className="border-t border-slate-100 pt-5 space-y-3">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-450 block">
                  Recommended Next Steps
                </label>
                <div className="space-y-2">
                  {getMissingSuggestions().length === 0 ? (
                    <p className="text-xs text-slate-505 italic font-normal">
                      Your business knowledge is fully covered. Keep importing or adding custom facts as your business grows.
                    </p>
                  ) : (
                    getMissingSuggestions().slice(0, 3).map((sugg) => (
                      <div 
                        key={sugg.id}
                        className="flex items-center justify-between p-3 border border-slate-200 rounded-xl hover:bg-slate-55 transition-colors"
                      >
                        <div className="space-y-0.5">
                          <span className="text-xs font-bold text-slate-800">Teach {sugg.label}</span>
                          <p className="text-[10px] text-slate-400 font-normal">Fill in the missing memory gaps.</p>
                        </div>
                        <button
                          onClick={() => {
                            setShowHealthDrawer(false)
                            handleAddSuggestion(sugg.type)
                          }}
                          className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-[10px] rounded-lg transition-colors cursor-pointer"
                        >
                          + Teach
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Recent Improvements */}
              <div className="border-t border-slate-100 pt-5 space-y-3">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-450 block">
                  Recent Improvements
                </label>
                {knowledge.length === 0 ? (
                  <p className="text-xs text-slate-400 italic font-normal">No edits yet.</p>
                ) : (
                  <div className="space-y-2">
                    {[...knowledge]
                      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
                      .slice(0, 3)
                      .map((item) => {
                        const parsed = parseKnowledge(item)
                        return (
                          <div 
                            key={item.id} 
                            className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-150 rounded-xl text-xs"
                          >
                            <div className="truncate pr-4">
                              <span className="font-bold text-slate-800 truncate block">
                                {parsed.title}
                              </span>
                              <span className="text-[10px] text-slate-405 font-normal">
                                Updated {new Date(item.updatedAt).toLocaleDateString()}
                              </span>
                            </div>
                            <button
                              onClick={() => {
                                setShowHealthDrawer(false)
                                handleEdit(item)
                              }}
                              className="text-xs text-slate-900 hover:text-slate-700 underline font-bold shrink-0 cursor-pointer"
                            >
                              Edit
                            </button>
                          </div>
                        )
                      })
                    }
                  </div>
                )}
              </div>

            </div>

            {/* Footer */}
            <div className="px-6 py-5 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end shrink-0">
              <button
                onClick={() => setShowHealthDrawer(false)}
                className="px-4 py-2 text-sm font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-55 rounded-lg transition-colors shadow-sm cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>,
      document.body
    )
  }
}
