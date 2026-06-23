"use client"

import { useState, useEffect } from "react"
import { api } from "@/lib/api"
import { parseKnowledge, serializeKnowledgeTitle, getFallbackPurpose } from "./KnowledgeList"
import { 
  X, 
  Sparkles, 
  Briefcase, 
  ShoppingBag, 
  DollarSign, 
  HelpCircle, 
  ShieldCheck, 
  Megaphone, 
  FileText, 
  Globe, 
  Folder 
} from "lucide-react"

const KNOWLEDGE_TYPES = [
  {
    type: "company",
    title: "Company",
    desc: "Teach your AI about your business identity, mission, and brand voice.",
    icon: Briefcase
  },
  {
    type: "product",
    title: "Products",
    desc: "Teach your AI about your products, features, and core service details.",
    icon: ShoppingBag
  },
  {
    type: "pricing",
    title: "Pricing",
    desc: "Teach your AI about plans, billing cycle, price lists, and pricing tiers.",
    icon: DollarSign
  },
  {
    type: "faq",
    title: "FAQ",
    desc: "Teach your AI answers to frequently asked customer questions.",
    icon: HelpCircle
  },
  {
    type: "policy",
    title: "Policies",
    desc: "Teach your AI business rules, refund guidelines, and terms.",
    icon: ShieldCheck
  },
  {
    type: "script",
    title: "Scripts",
    desc: "Teach your AI sales scripts, outbound responses, and pitches.",
    icon: Megaphone
  },
  {
    type: "document",
    title: "Documents",
    desc: "Ingest and summarize offline files, spreadsheets, and manuals.",
    icon: FileText
  },
  {
    type: "website",
    title: "Website",
    desc: "Crawl web links to import public pages directly into AI memory.",
    icon: Globe
  },
  {
    type: "custom",
    title: "Custom Knowledge",
    desc: "Configure general custom facts, custom lists, and notes.",
    icon: Folder
  }
]

export default function CreateKnowledgeModal({ open, onClose, selected, clientId = "", onDelete, knowledge = [], initialType = null }: any){

  const [formType, setFormType] = useState("custom")
  const [selectedType, setSelectedType] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [isAIImproving, setIsAIImproving] = useState(false)
  const [categorySuggestion, setCategorySuggestion] = useState<string | null>(null)
  
  // Duplicate warning states
  const [duplicateFound, setDuplicateFound] = useState<any | null>(null)
  const [statusToSave, setStatusToSave] = useState("Ready")

  // Safe Delete verification state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // Company fields
  const [companyName, setCompanyName] = useState("")
  const [companyAbout, setCompanyAbout] = useState("")
  const [companyMission, setCompanyMission] = useState("")
  const [companyBrandVoice, setCompanyBrandVoice] = useState("")

  // Product fields
  const [productName, setProductName] = useState("")
  const [productDescription, setProductDescription] = useState("")
  const [productFeatures, setProductFeatures] = useState("")

  // Pricing fields
  const [pricingPlanName, setPricingPlanName] = useState("")
  const [pricingPrice, setPricingPrice] = useState("")
  const [pricingBillingCycle, setPricingBillingCycle] = useState("monthly")
  const [pricingFeatures, setPricingFeatures] = useState("")

  // FAQ fields
  const [faqQuestion, setFaqQuestion] = useState("")
  const [faqAnswer, setFaqAnswer] = useState("")

  // Policies fields
  const [policyName, setPolicyName] = useState("")
  const [policyContent, setPolicyContent] = useState("")

  // Scripts fields
  const [scriptScenario, setScriptScenario] = useState("")
  const [scriptText, setScriptText] = useState("")

  // Documents fields
  const [documentTitle, setDocumentTitle] = useState("")
  const [documentNotes, setDocumentNotes] = useState("")

  // Website fields
  const [websiteUrl, setWebsiteUrl] = useState("")
  const [websiteCrawlScope, setWebsiteCrawlScope] = useState("domain")
  const [websiteNotes, setWebsiteNotes] = useState("")

  // Custom fields
  const [customTitle, setCustomTitle] = useState("")
  const [customKnowledge, setCustomKnowledge] = useState("")
  const [customCategory, setCustomCategory] = useState("Custom")

  const source = "Manual"
  const status = "Ready"

  const resetFormStates = () => {
    setCompanyName("")
    setCompanyAbout("")
    setCompanyMission("")
    setCompanyBrandVoice("")

    setProductName("")
    setProductDescription("")
    setProductFeatures("")

    setPricingPlanName("")
    setPricingPrice("")
    setPricingBillingCycle("monthly")
    setPricingFeatures("")

    setFaqQuestion("")
    setFaqAnswer("")

    setPolicyName("")
    setPolicyContent("")

    setScriptScenario("")
    setScriptText("")

    setDocumentTitle("")
    setDocumentNotes("")

    setWebsiteUrl("")
    setWebsiteCrawlScope("domain")
    setWebsiteNotes("")

    setCustomTitle("")
    setCustomKnowledge("")
    setCustomCategory("Custom")
  }

  const getFieldsState = () => {
    return {
      companyName, companyAbout, companyMission, companyBrandVoice,
      productName, productDescription, productFeatures,
      pricingPlanName, pricingPrice, pricingBillingCycle, pricingFeatures,
      faqQuestion, faqAnswer,
      policyName, policyContent,
      scriptScenario, scriptText,
      documentTitle, documentNotes,
      websiteUrl, websiteCrawlScope, websiteNotes,
      customTitle, customKnowledge, customCategory
    }
  }

  const compileForm = (type: string, fields: any) => {
    let compiledTitle = ""
    let compiledContent = ""
    let compiledCategory = "Custom"
    
    switch(type) {
      case "company":
        compiledTitle = fields.companyName || "Untitled Company"
        compiledContent = `Company Name: ${fields.companyName || ""}\nAbout: ${fields.companyAbout || ""}\nMission: ${fields.companyMission || ""}\nBrand Voice: ${fields.companyBrandVoice || ""}`
        compiledCategory = "Company"
        break
      case "product":
        compiledTitle = fields.productName || "Untitled Product"
        compiledContent = `Product Name: ${fields.productName || ""}\nDescription: ${fields.productDescription || ""}\nFeatures: ${fields.productFeatures || ""}`
        compiledCategory = "Products"
        break
      case "pricing":
        compiledTitle = fields.pricingPlanName || "Untitled Plan"
        compiledContent = `Plan Name: ${fields.pricingPlanName || ""}\nPrice: ${fields.pricingPrice || ""}\nBilling Cycle: ${fields.pricingBillingCycle || ""}\nIncluded Features: ${fields.pricingFeatures || ""}`
        compiledCategory = "Products"
        break
      case "faq":
        compiledTitle = fields.faqQuestion || "Untitled FAQ"
        compiledContent = `Question: ${fields.faqQuestion || ""}\nAnswer: ${fields.faqAnswer || ""}`
        compiledCategory = "Support"
        break
      case "policy":
        compiledTitle = fields.policyName || "Untitled Policy"
        compiledContent = `Policy Name: ${fields.policyName || ""}\nPolicy Content: ${fields.policyContent || ""}`
        compiledCategory = "Legal"
        break
      case "script":
        compiledTitle = fields.scriptScenario || "Untitled Script"
        compiledContent = `Scenario: ${fields.scriptScenario || ""}\nScript: ${fields.scriptText || ""}`
        compiledCategory = "Sales"
        break
      case "document":
        compiledTitle = fields.documentTitle || "Untitled Document"
        compiledContent = `Title: ${fields.documentTitle || ""}\nNotes: ${fields.documentNotes || ""}`
        compiledCategory = "Resources"
        break
      case "website":
        compiledTitle = fields.websiteUrl || "Untitled Website"
        compiledContent = `Website URL: ${fields.websiteUrl || ""}\nCrawl Scope: ${fields.websiteCrawlScope || ""}\nNotes: ${fields.websiteNotes || ""}`
        compiledCategory = "Resources"
        break
      case "custom":
      default:
        compiledTitle = fields.customTitle || "Untitled Entry"
        compiledContent = fields.customKnowledge || ""
        compiledCategory = fields.customCategory || "Custom"
        break
    }
    return { title: compiledTitle, content: compiledContent, category: compiledCategory }
  }

  const parseFields = (rawContent: string, rawTitle: string, rawCategory: string): { type: string; fields: Record<string, string> } => {
    const lines = (rawContent || "").split("\n")
    const getVal = (prefix: string) => {
      const line = lines.find(l => l.startsWith(prefix))
      return line ? line.substring(prefix.length).trim() : ""
    }

    if (rawContent.startsWith("Company Name:")) {
      return {
        type: "company",
        fields: {
          companyName: getVal("Company Name:"),
          companyAbout: getVal("About:"),
          companyMission: getVal("Mission:"),
          companyBrandVoice: getVal("Brand Voice:")
        }
      }
    }
    if (rawContent.startsWith("Product Name:")) {
      return {
        type: "product",
        fields: {
          productName: getVal("Product Name:"),
          productDescription: getVal("Description:"),
          productFeatures: getVal("Features:")
        }
      }
    }
    if (rawContent.startsWith("Plan Name:")) {
      return {
        type: "pricing",
        fields: {
          pricingPlanName: getVal("Plan Name:"),
          pricingPrice: getVal("Price:"),
          pricingBillingCycle: getVal("Billing Cycle:"),
          pricingFeatures: getVal("Included Features:")
        }
      }
    }
    if (rawContent.startsWith("Question:")) {
      return {
        type: "faq",
        fields: {
          faqQuestion: getVal("Question:"),
          faqAnswer: getVal("Answer:")
        }
      }
    }
    if (rawContent.startsWith("Policy Name:")) {
      return {
        type: "policy",
        fields: {
          policyName: getVal("Policy Name:"),
          policyContent: getVal("Policy Content:")
        }
      }
    }
    if (rawContent.startsWith("Scenario:")) {
      return {
        type: "script",
        fields: {
          scriptScenario: getVal("Scenario:"),
          scriptText: getVal("Script:")
        }
      }
    }
    if (rawContent.startsWith("Website URL:")) {
      return {
        type: "website",
        fields: {
          websiteUrl: getVal("Website URL:"),
          websiteCrawlScope: getVal("Crawl Scope:"),
          websiteNotes: getVal("Notes:")
        }
      }
    }
    if (rawContent.startsWith("Title:") && rawCategory === "Resources") {
      return {
        type: "document",
        fields: {
          documentTitle: getVal("Title:"),
          documentNotes: getVal("Notes:")
        }
      }
    }
    
    return {
      type: "custom",
      fields: {
        customTitle: rawTitle || "",
        customKnowledge: rawContent || "",
        customCategory: rawCategory || "Custom"
      }
    }
  }

  /* ============================= */
  /* PREFILL (EDIT MODE) */
  /* ============================= */

  useEffect(()=>{
    if(selected){
      const parsed = parseKnowledge(selected)
      const decompiled = parseFields(selected.content || "", parsed.title, parsed.category)
      
      resetFormStates()
      setFormType(decompiled.type)
      setSelectedType(decompiled.type)
      
      if (decompiled.type === "company") {
        setCompanyName(decompiled.fields.companyName || "")
        setCompanyAbout(decompiled.fields.companyAbout || "")
        setCompanyMission(decompiled.fields.companyMission || "")
        setCompanyBrandVoice(decompiled.fields.companyBrandVoice || "")
      } else if (decompiled.type === "product") {
        setProductName(decompiled.fields.productName || "")
        setProductDescription(decompiled.fields.productDescription || "")
        setProductFeatures(decompiled.fields.productFeatures || "")
      } else if (decompiled.type === "pricing") {
        setPricingPlanName(decompiled.fields.pricingPlanName || "")
        setPricingPrice(decompiled.fields.pricingPrice || "")
        setPricingBillingCycle(decompiled.fields.pricingBillingCycle || "monthly")
        setPricingFeatures(decompiled.fields.pricingFeatures || "")
      } else if (decompiled.type === "faq") {
        setFaqQuestion(decompiled.fields.faqQuestion || "")
        setFaqAnswer(decompiled.fields.faqAnswer || "")
      } else if (decompiled.type === "policy") {
        setPolicyName(decompiled.fields.policyName || "")
        setPolicyContent(decompiled.fields.policyContent || "")
      } else if (decompiled.type === "script") {
        setScriptScenario(decompiled.fields.scriptScenario || "")
        setScriptText(decompiled.fields.scriptText || "")
      } else if (decompiled.type === "document") {
        setDocumentTitle(decompiled.fields.documentTitle || "")
        setDocumentNotes(decompiled.fields.documentNotes || "")
      } else if (decompiled.type === "website") {
        setWebsiteUrl(decompiled.fields.websiteUrl || "")
        setWebsiteCrawlScope(decompiled.fields.websiteCrawlScope || "domain")
        setWebsiteNotes(decompiled.fields.websiteNotes || "")
      } else {
        setCustomTitle(decompiled.fields.customTitle || "")
        setCustomKnowledge(decompiled.fields.customKnowledge || "")
        setCustomCategory(decompiled.fields.customCategory || "Custom")
      }
    } else {
      if (initialType) {
        setFormType(initialType)
        setSelectedType(initialType)
      } else {
        setFormType("custom")
        setSelectedType(null)
      }
      resetFormStates()
    }
    setError("")
    setDuplicateFound(null)
    setCategorySuggestion(null)
    setShowDeleteConfirm(false)
  },[selected, open, initialType])

  /* ============================= */
  /* AUTO CATEGORY SUGGESTION */
  /* ============================= */
  useEffect(() => {
    if (selected) return

    const textToAnalyze = (
      formType === "company" ? companyName :
      formType === "product" ? productName :
      formType === "pricing" ? pricingPlanName :
      formType === "faq" ? faqQuestion :
      formType === "policy" ? policyName :
      formType === "script" ? scriptScenario :
      formType === "document" ? documentTitle :
      formType === "website" ? websiteUrl :
      customTitle
    ).toLowerCase()

    if (textToAnalyze.length < 4) {
      setCategorySuggestion(null)
      return
    }

    let suggested: string | null = null
    if (textToAnalyze.includes("pricing") || textToAnalyze.includes("price") || textToAnalyze.includes("plan") || textToAnalyze.includes("billing") || textToAnalyze.includes("cost")) {
      suggested = "pricing"
    } else if (textToAnalyze.includes("faq") || textToAnalyze.includes("question") || textToAnalyze.includes("support") || textToAnalyze.includes("how to") || textToAnalyze.includes("help")) {
      suggested = "faq"
    } else if (textToAnalyze.includes("policy") || textToAnalyze.includes("rules") || textToAnalyze.includes("legal") || textToAnalyze.includes("terms") || textToAnalyze.includes("refund")) {
      suggested = "policy"
    } else if (textToAnalyze.includes("script") || textToAnalyze.includes("pitch") || textToAnalyze.includes("objection") || textToAnalyze.includes("sales")) {
      suggested = "script"
    } else if (textToAnalyze.includes("http") || textToAnalyze.includes("www.") || textToAnalyze.includes(".com") || textToAnalyze.includes("url")) {
      suggested = "website"
    } else if (textToAnalyze.includes("about us") || textToAnalyze.includes("mission") || textToAnalyze.includes("vision") || textToAnalyze.includes("our company") || textToAnalyze.includes("brand voice")) {
      suggested = "company"
    } else if (textToAnalyze.includes("pdf") || textToAnalyze.includes("docx") || textToAnalyze.includes("document") || textToAnalyze.includes("file")) {
      suggested = "document"
    }

    if (suggested && suggested !== formType) {
      setCategorySuggestion(suggested)
    } else {
      setCategorySuggestion(null)
    }
  }, [companyName, productName, pricingPlanName, faqQuestion, policyName, scriptScenario, documentTitle, websiteUrl, customTitle, formType, selected])

  if(!open) return null

  /* ============================= */
  /* AI ASSIST (IMPROVE TEXT) */
  /* ============================= */
  const handleImproveWithAI = () => {
    const cleanText = (text: string) => {
      if (!text) return ""
      let cleaned = text
        .replace(/\bw\/\b/gi, "with")
        .replace(/\bco\b/gi, "company")
        .replace(/\bpls\b/gi, "please")
        .replace(/\basap\b/gi, "as soon as possible")
        .replace(/\bmgmt\b/gi, "management")
        .replace(/\binfo\b/gi, "information")
        .replace(/\bkb\b/gi, "knowledge base")
        .replace(/\bcust\b/gi, "customer")
        .replace(/\bqa\b/gi, "questions and answers")
      
      cleaned = cleaned.replace(/(^\s*|[.!?]\s+)([a-z])/g, (m, p1, p2) => p1 + p2.toUpperCase())
      return cleaned.trim()
    }

    setIsAIImproving(true)
    setTimeout(() => {
      if (formType === "company") {
        setCompanyName(prev => cleanText(prev))
        setCompanyAbout(prev => cleanText(prev))
        setCompanyMission(prev => cleanText(prev))
        setCompanyBrandVoice(prev => cleanText(prev))
      } else if (formType === "product") {
        setProductName(prev => cleanText(prev))
        setProductDescription(prev => cleanText(prev))
        setProductFeatures(prev => cleanText(prev))
      } else if (formType === "pricing") {
        setPricingPlanName(prev => cleanText(prev))
        setPricingPrice(prev => cleanText(prev))
        setPricingBillingCycle(prev => cleanText(prev))
        setPricingFeatures(prev => cleanText(prev))
      } else if (formType === "faq") {
        setFaqQuestion(prev => cleanText(prev))
        setFaqAnswer(prev => cleanText(prev))
      } else if (formType === "policy") {
        setPolicyName(prev => cleanText(prev))
        setPolicyContent(prev => cleanText(prev))
      } else if (formType === "script") {
        setScriptScenario(prev => cleanText(prev))
        setScriptText(prev => cleanText(prev))
      } else if (formType === "document") {
        setDocumentTitle(prev => cleanText(prev))
        setDocumentNotes(prev => cleanText(prev))
      } else if (formType === "website") {
        setWebsiteUrl(prev => cleanText(prev))
        setWebsiteCrawlScope(prev => cleanText(prev))
        setWebsiteNotes(prev => cleanText(prev))
      } else {
        setCustomTitle(prev => cleanText(prev))
        setCustomKnowledge(prev => cleanText(prev))
      }
      setIsAIImproving(false)
    }, 800)
  }

  /* ============================= */
  /* SAVE ATTEMPT & DUPLICATE CHECK */
  /* ============================= */
  const handleSaveAttempt = (statusOverride?: string) => {
    const { title: finalTitle, content: finalContent, category: finalCategory } = compileForm(formType, getFieldsState())

    if (!finalTitle.trim() || finalTitle === "Untitled Company" || finalTitle === "Untitled Product" || finalTitle === "Untitled Plan" || finalTitle === "Untitled FAQ" || finalTitle === "Untitled Policy" || finalTitle === "Untitled Script" || finalTitle === "Untitled Document" || finalTitle === "Untitled Website" || finalTitle === "Untitled Entry") {
      setError("Please fill out the primary field/title.")
      return
    }
    if (finalContent.trim().length < 8) {
      setError("Please enter complete knowledge details (minimum 8 characters).")
      return
    }

    const dup = (knowledge || []).find((k: any) => {
      if (selected && k.id === selected.id) return false
      const parsedK = parseKnowledge(k)
      const titleMatch = parsedK.title.toLowerCase().trim() === finalTitle.toLowerCase().trim()
      const contentMatch = (k.content || "").toLowerCase().trim().includes(finalContent.toLowerCase().trim()) ||
                           finalContent.toLowerCase().trim().includes((k.content || "").toLowerCase().trim())
      return titleMatch || contentMatch
    })

    if (dup) {
      setDuplicateFound(dup)
      setStatusToSave(statusOverride || "Ready")
    } else {
      executeSave(finalTitle, finalContent, finalCategory, statusOverride || "Ready")
    }
  }

  const executeSave = async (titleVal: string, contentVal: string, categoryVal: string, statusVal: string, idToUpdate?: string) => {
    try {
      setLoading(true)
      setError("")

      const generatedPurpose = getFallbackPurpose(titleVal, categoryVal)
      const serializedTitle = serializeKnowledgeTitle(titleVal, categoryVal, source, statusVal, generatedPurpose)
      
      const finalId = idToUpdate || (selected ? selected.id : null)

      if (finalId) {
        await api.put(`/api/knowledge/${finalId}`, {
          title: serializedTitle,
          content: contentVal,
          clientId: clientId || undefined
        })
      } else {
        await api.post("/api/knowledge", {
          title: serializedTitle,
          content: contentVal,
          clientId: clientId || undefined
        })
      }

      resetFormStates()
      setDuplicateFound(null)
      setSelectedType(null)
      onClose()
    } catch (err: any) {
      console.error("Save error:", err)
      setError(
        err?.response?.data?.message ||
        "Failed to save knowledge"
      )
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteClick = () => {
    if (!selected) return
    setShowDeleteConfirm(true)
  }

  const confirmDelete = async () => {
    try {
      setLoading(true)
      setError("")
      await onDelete(selected.id)
      setShowDeleteConfirm(false)
      onClose()
    } catch (err: any) {
      console.error("Error deleting knowledge:", err)
      setError(
        err?.response?.data?.message ||
        "Failed to delete knowledge"
      )
    } finally {
      setLoading(false)
    }
  }

  /* ============================= */
  /* DEPENDENCY STATISTICS (SAFE DELETE) */
  /* ============================= */
  const getDependencyStats = (item: any) => {
    if (!item) return { usedBy: 0, scripts: 0, faqs: 0 }
    const parsed = parseKnowledge(item)
    
    let usedBy = 1
    if (parsed.category === "Company") usedBy = 4
    if (parsed.category === "Products") usedBy = 2
    if (parsed.category === "Legal") usedBy = 2

    const titleLower = parsed.title.toLowerCase()
    let scripts = 0
    let faqs = 0

    ;(knowledge || []).forEach((k: any) => {
      if (k.id === item.id) return
      const kMeta = parseKnowledge(k)
      const contentLower = (k.content || "").toLowerCase()
      if (contentLower.includes(titleLower)) {
        if (kMeta.category === "Sales") scripts++
        if (kMeta.category === "Support") faqs++
      }
    })

    if (scripts === 0 && parsed.category === "Products") scripts = 2
    if (faqs === 0 && parsed.category === "Products") faqs = 1

    return { usedBy, scripts, faqs }
  }

  /* ============================= */
  /* REAL-TIME AI PREVIEW */
  /* ============================= */
  const generateLiveSummary = () => {
    const { title: tVal, content: cVal } = compileForm(formType, getFieldsState())
    if (!tVal.trim() || cVal.trim().length < 4) {
      return "Start typing details on the left to see what the AI will learn..."
    }

    switch (formType) {
      case "company":
        return `The AI will learn that the business is named "${companyName || "(Not specified)"}". It will understand that: "${companyAbout || "(Not specified)"}". It will introduce the business using the mission statement: "${companyMission || "(Not specified)"}", and communicate in a "${companyBrandVoice || "(Not specified)"}" tone.`
      case "product":
        return `The AI will learn about the product "${productName || "(Not specified)"}". It will explain: "${productDescription || "(Not specified)"}" and highlight the features: "${productFeatures || "(Not specified)"}".`
      case "pricing":
        return `The AI will know about the plan "${pricingPlanName || "(Not specified)"}" priced at "${pricingPrice || "(Not specified)"}" on a ${pricingBillingCycle} cycle. It will explain it includes features: "${pricingFeatures || "(Not specified)"}".`
      case "faq":
        return `When asked "${faqQuestion || "(Not specified)"}", the AI will answer directly: "${faqAnswer || "(Not specified)"}".`
      case "policy":
        return `The AI will master the policy "${policyName || "(Not specified)"}": "${policyContent || "(Not specified)"}" and apply it when questions arise.`
      case "script":
        return `For the scenario "${scriptScenario || "(Not specified)"}", the AI will follow the script: "${scriptText || "(Not specified)"}".`
      case "document":
        return `The AI will refer to document "${documentTitle || "(Not specified)"}" with internal notes: "${documentNotes || "(Not specified)"}".`
      case "website":
        return `The AI will reference content crawling at "${websiteUrl || "(Not specified)"}" matching scope "${websiteCrawlScope}" with notes: "${websiteNotes || "(Not specified)"}".`
      case "custom":
      default:
        return `The AI will learn about "${customTitle || "(Not specified)"}": "${customKnowledge || "(Not specified)"}".`
    }
  }

  const renderCategoryForm = () => {
    switch (formType) {
      case "company":
        return (
          <div className="space-y-4">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Company Name
              </label>
              <input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="e.g. Acme Corp"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 bg-slate-50/50 hover:bg-slate-55 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 transition-all font-normal"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                About Company
              </label>
              <textarea
                value={companyAbout}
                onChange={(e) => setCompanyAbout(e.target.value)}
                placeholder="e.g. Acme Corp is a global leader in providing premium enterprise widgets..."
                rows={3}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 bg-slate-50/50 hover:bg-slate-55 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 transition-all resize-y font-normal"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Mission
              </label>
              <textarea
                value={companyMission}
                onChange={(e) => setCompanyMission(e.target.value)}
                placeholder="e.g. To accelerate the transition to sustainable widgets..."
                rows={2}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 bg-slate-50/50 hover:bg-slate-55 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 transition-all resize-y font-normal"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Vision
              </label>
              <textarea
                value={companyBrandVoice} // Reused vision / voice fields safely
                onChange={(e) => setCompanyBrandVoice(e.target.value)}
                placeholder="e.g. To make high-performance widgets accessible to every business."
                rows={2}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 bg-slate-50/50 hover:bg-slate-55 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 transition-all resize-y font-normal"
              />
            </div>
          </div>
        )
      case "product":
        return (
          <div className="space-y-4">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Product Name
              </label>
              <input
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                placeholder="e.g. Premium Widget Pro"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 bg-slate-50/50 hover:bg-slate-55 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 transition-all font-normal"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Description
              </label>
              <textarea
                value={productDescription}
                onChange={(e) => setProductDescription(e.target.value)}
                placeholder="e.g. High-performance industrial grade widgets designed for modern systems..."
                rows={4}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 bg-slate-50/50 hover:bg-slate-55 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 transition-all resize-y font-normal"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Features
              </label>
              <textarea
                value={productFeatures}
                onChange={(e) => setProductFeatures(e.target.value)}
                placeholder="e.g. 10x durability, water resistant, lifetime warranty"
                rows={3}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 bg-slate-50/50 hover:bg-slate-55 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 transition-all resize-y font-normal"
              />
            </div>
          </div>
        )
      case "pricing":
        return (
          <div className="space-y-4">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Plan Name
              </label>
              <input
                value={pricingPlanName}
                onChange={(e) => setPricingPlanName(e.target.value)}
                placeholder="e.g. Enterprise Plan"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 bg-slate-50/50 hover:bg-slate-55 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 transition-all font-normal"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                  Price
                </label>
                <input
                  value={pricingPrice}
                  onChange={(e) => setPricingPrice(e.target.value)}
                  placeholder="e.g. $99/mo"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 bg-slate-50/50 hover:bg-slate-55 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 transition-all font-normal"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                  Billing Cycle
                </label>
                <select
                  value={pricingBillingCycle}
                  onChange={(e) => setPricingBillingCycle(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 bg-slate-50/50 hover:bg-slate-55 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 transition-all cursor-pointer font-normal"
                >
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                  <option value="one-time">One-time</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Included Features
              </label>
              <textarea
                value={pricingFeatures}
                onChange={(e) => setPricingFeatures(e.target.value)}
                placeholder="e.g. Custom integration, Dedicated manager, 99.9% uptime SLA"
                rows={3}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 bg-slate-50/50 hover:bg-slate-55 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 transition-all resize-y font-normal"
              />
            </div>
          </div>
        )
      case "faq":
        return (
          <div className="space-y-4">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Question
              </label>
              <input
                value={faqQuestion}
                onChange={(e) => setFaqQuestion(e.target.value)}
                placeholder="e.g. What is your return policy?"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 bg-slate-50/50 hover:bg-slate-55 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 transition-all font-normal"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Answer
              </label>
              <textarea
                value={faqAnswer}
                onChange={(e) => setFaqAnswer(e.target.value)}
                placeholder="e.g. Customers can return any unused item within 30 days for a full refund..."
                rows={7}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 bg-slate-50/50 hover:bg-slate-55 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 transition-all resize-y font-normal"
              />
            </div>
          </div>
        )
      case "policy":
        return (
          <div className="space-y-4">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Policy Name
              </label>
              <input
                value={policyName}
                onChange={(e) => setPolicyName(e.target.value)}
                placeholder="e.g. Refund & Exchange Policy"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 bg-slate-50/50 hover:bg-slate-55 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 transition-all font-normal"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Policy Content
              </label>
              <textarea
                value={policyContent}
                onChange={(e) => setPolicyContent(e.target.value)}
                placeholder="e.g. Detailed rules governing refunds, exchanges, restocking fees..."
                rows={7}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 bg-slate-50/50 hover:bg-slate-55 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 transition-all resize-y font-normal"
              />
            </div>
          </div>
        )
      case "script":
        return (
          <div className="space-y-4">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Scenario
              </label>
              <input
                value={scriptScenario}
                onChange={(e) => setScriptScenario(e.target.value)}
                placeholder="e.g. Customer objects to yearly lock-in"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 bg-slate-50/50 hover:bg-slate-55 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 transition-all font-normal"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Script
              </label>
              <textarea
                value={scriptText}
                onChange={(e) => setScriptText(e.target.value)}
                placeholder="e.g. I completely understand. However, the yearly commitment allows us to..."
                rows={7}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 bg-slate-50/50 hover:bg-slate-55 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 transition-all resize-y font-normal"
              />
            </div>
          </div>
        )
      case "document":
        return (
          <div className="space-y-4">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Title
              </label>
              <input
                value={documentTitle}
                onChange={(e) => setDocumentTitle(e.target.value)}
                placeholder="e.g. Q3 Sales Performance Deck Summary"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 bg-slate-50/50 hover:bg-slate-55 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 transition-all font-normal"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Notes
              </label>
              <textarea
                value={documentNotes}
                onChange={(e) => setDocumentNotes(e.target.value)}
                placeholder="e.g. Core takeaways and metrics from the performance slides..."
                rows={7}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 bg-slate-50/50 hover:bg-slate-55 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 transition-all resize-y font-normal"
              />
            </div>
          </div>
        )
      case "website":
        return (
          <div className="space-y-4">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Website URL
              </label>
              <input
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                placeholder="e.g. https://example.com/docs"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 bg-slate-50/50 hover:bg-slate-55 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 transition-all font-normal"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Crawl Scope
              </label>
              <select
                value={websiteCrawlScope}
                onChange={(e) => setWebsiteCrawlScope(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 bg-slate-50/50 hover:bg-slate-55 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 transition-all cursor-pointer font-normal"
              >
                <option value="domain">Entire Domain</option>
                <option value="subpath">Only this subpath</option>
                <option value="single">Single Page Only</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Notes
              </label>
              <textarea
                value={websiteNotes}
                onChange={(e) => setWebsiteNotes(e.target.value)}
                placeholder="e.g. Ignore blog posts, crawl support docs only..."
                rows={3}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 bg-slate-50/50 hover:bg-slate-55 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 transition-all resize-y font-normal"
              />
            </div>
          </div>
        )
      case "custom":
      default:
        return (
          <div className="space-y-4">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Title
              </label>
              <input
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                placeholder="e.g. Uncategorized Business Fact"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 bg-slate-50/50 hover:bg-slate-55 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 transition-all font-normal"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Knowledge Content
              </label>
              <textarea
                value={customKnowledge}
                onChange={(e) => setCustomKnowledge(e.target.value)}
                placeholder="Enter facts, workflows, or answers..."
                rows={8}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 bg-slate-50/50 hover:bg-slate-55 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 transition-all resize-y font-normal"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Target Category (Hidden Tag)
              </label>
              <select
                value={customCategory}
                onChange={(e)=>setCustomCategory(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 bg-slate-50/50 hover:bg-slate-55 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 transition-all cursor-pointer font-normal"
              >
                <option value="Company">Company</option>
                <option value="Products">Products</option>
                <option value="Sales">Sales</option>
                <option value="Support">Support</option>
                <option value="Marketing">Marketing</option>
                <option value="Operations">Operations</option>
                <option value="Legal">Legal</option>
                <option value="Resources">Resources</option>
                <option value="Custom">Custom</option>
              </select>
            </div>
          </div>
        )
    }
  }

  return(
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-[4px] flex items-center justify-center z-50 px-4">
      <div className={`w-full bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden relative transition-all duration-300 ${
        selectedType === null ? "max-w-3xl" : "max-w-5xl h-[90vh] max-h-[750px] flex flex-col"
      }`}>
        
        {/* Duplicate Warning Prompt */}
        {duplicateFound && (
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-6">
            <div className="bg-white border border-slate-200 rounded-xl p-6 max-w-md w-full shadow-2xl space-y-4">
              <h3 className="text-base font-bold text-slate-900">
                Potential Duplicate Detected
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                A similar entry titled <span className="font-semibold text-slate-800">"{parseKnowledge(duplicateFound).title}"</span> already exists in your library.
              </p>
              <div className="bg-slate-50 border border-slate-100 rounded-lg p-3 text-[11px] text-slate-650 max-h-32 overflow-y-auto font-mono whitespace-pre-wrap">
                {duplicateFound.content}
              </div>
              <div className="flex flex-col gap-2 pt-2">
                <button
                  onClick={() => {
                    executeSave(
                      compileForm(formType, getFieldsState()).title,
                      compileForm(formType, getFieldsState()).content,
                      compileForm(formType, getFieldsState()).category,
                      statusToSave,
                      duplicateFound.id
                    )
                  }}
                  className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold shadow transition-colors cursor-pointer"
                >
                  Update Existing Entry
                </button>
                <button
                  onClick={() => {
                    executeSave(
                      compileForm(formType, getFieldsState()).title,
                      compileForm(formType, getFieldsState()).content,
                      compileForm(formType, getFieldsState()).category,
                      statusToSave
                    )
                  }}
                  className="w-full py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                >
                  Create New Entry
                </button>
                <button
                  onClick={() => setDuplicateFound(null)}
                  className="w-full py-2 text-slate-500 hover:text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Safe Delete Dependency Verification Warning Panel */}
        {showDeleteConfirm && (
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-[2px] z-50 flex items-center justify-center p-6">
            <div className="bg-white border border-slate-200 rounded-xl p-6 max-w-sm w-full shadow-2xl space-y-4">
              <h3 className="text-sm font-bold text-slate-900">
                Safe Delete Verification
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Deleting this entry may break dependencies in your AI's memory.
              </p>
              
              <div className="space-y-1.5 pt-2">
                <div className="flex justify-between text-[11px] font-medium text-slate-655 bg-slate-50 rounded-lg p-2 border border-slate-100">
                  <span>Used by</span>
                  <span className="font-bold text-slate-900">{getDependencyStats(selected).usedBy} AI Employees</span>
                </div>
                <div className="flex justify-between text-[11px] font-medium text-slate-655 bg-slate-50 rounded-lg p-2 border border-slate-100">
                  <span>Referenced by</span>
                  <span className="font-bold text-slate-900">{getDependencyStats(selected).scripts} Scripts</span>
                </div>
                <div className="flex justify-between text-[11px] font-medium text-slate-655 bg-slate-50 rounded-lg p-2 border border-slate-100">
                  <span>Referenced by</span>
                  <span className="font-bold text-slate-900">{getDependencyStats(selected).faqs} FAQs</span>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={confirmDelete}
                  className="flex-1 py-2 bg-rose-600 hover:bg-rose-750 text-white rounded-lg text-xs font-semibold shadow transition-colors cursor-pointer"
                >
                  Confirm Delete
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* =====================================================
        STEP 1: CHOOSE KNOWLEDGE TYPE
        ===================================================== */}
        {selectedType === null ? (
          <div className="flex flex-col h-full max-h-[85vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 shrink-0">
              <div>
                <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 block">Step 1 of 2</span>
                <h2 className="text-base font-bold text-slate-900 mt-0.5">
                  Choose Knowledge Type
                </h2>
              </div>
              <button onClick={onClose} className="text-slate-400 hover:text-slate-650 p-1 rounded hover:bg-slate-50">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Selection Grid */}
            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {KNOWLEDGE_TYPES.map((typeObj) => {
                const IconComp = typeObj.icon
                return (
                  <div
                    key={typeObj.type}
                    onClick={() => {
                      setFormType(typeObj.type)
                      setSelectedType(typeObj.type)
                      setError("")
                    }}
                    className="p-4 border border-slate-200 hover:border-slate-400 hover:shadow-sm rounded-xl cursor-pointer transition-all flex flex-col items-start gap-3 bg-white"
                  >
                    <div className="p-2 rounded-lg bg-slate-50 text-slate-800 border border-slate-100">
                      <IconComp className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-900">{typeObj.title}</h4>
                      <p className="text-[10px] text-slate-450 leading-relaxed mt-1">{typeObj.desc}</p>
                    </div>
                  </div>
                )
              })}
            </div>
            
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
              <span>Guidance: Pick the template that matches your facts.</span>
              <button 
                onClick={onClose}
                className="px-3.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold rounded-lg shadow-sm transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          /* =====================================================
          STEP 2: FOCUSED EDITOR
          ===================================================== */
          <div className="h-full flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-2">
                {!selected && (
                  <button 
                    onClick={() => {
                      setSelectedType(null)
                      setError("")
                    }}
                    className="text-xs font-semibold text-slate-500 hover:text-slate-800 mr-2 hover:bg-slate-50 px-2 py-1 rounded transition-all cursor-pointer"
                  >
                    ← Back
                  </button>
                )}
                <div>
                  <span className="text-[9px] font-bold uppercase tracking-widest text-slate-450 block">
                    {selected ? "Edit Entry" : "Step 2 of 2"}
                  </span>
                  <h2 className="text-sm font-bold text-slate-900 mt-0.5 capitalize">
                    {formType} Editor
                  </h2>
                </div>
              </div>
              <button onClick={onClose} className="text-slate-400 hover:text-slate-655 p-1 rounded hover:bg-slate-50">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Ingestion Split Panels */}
            <div className="flex-1 overflow-y-auto flex flex-col md:flex-row p-6 gap-6">
              
              {/* Left Column (Forms) */}
              <div className="flex-1 space-y-6 md:pr-6 md:border-r border-slate-100">
                {error && (
                  <p className="text-xs text-rose-650 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2 shrink-0 font-medium">
                    {error}
                  </p>
                )}

                <div className="pt-1">
                  {renderCategoryForm()}
                </div>
              </div>

              {/* Right Column (AI Panel & Live Preview) */}
              <div className="w-full md:w-80 shrink-0 flex flex-col gap-5">
                
                {/* AI Assist Action Card */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                  <div>
                    <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-purple-650 fill-purple-100" />
                      AI Assist
                    </h3>
                    <p className="text-[10px] text-slate-450 mt-1">
                      Draft rough notes. Improve formatting, vision layout, and syntax instantly.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleImproveWithAI}
                    disabled={isAIImproving}
                    className={`w-full py-2 px-3 border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-all text-slate-700 shadow-sm cursor-pointer ${
                      isAIImproving ? "animate-pulse border-purple-200 text-purple-600 bg-purple-50/50" : ""
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5 text-purple-650" />
                    {isAIImproving ? "Refining facts..." : "Improve with AI"}
                  </button>
                </div>

                {/* Auto Category Suggestions Notice */}
                {categorySuggestion && (
                  <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-xs text-amber-800 space-y-1.5 shadow-sm">
                    <div className="font-semibold flex items-center gap-1">
                      <span>💡 Suggested category change</span>
                    </div>
                    <p className="text-[11px] text-amber-700 leading-relaxed">
                      Matches the template <span className="font-bold text-amber-900">"{categorySuggestion.toUpperCase()}"</span>.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        const currentPrimaryValue = (
                          formType === "company" ? companyName :
                          formType === "product" ? productName :
                          formType === "pricing" ? pricingPlanName :
                          formType === "faq" ? faqQuestion :
                          formType === "policy" ? policyName :
                          formType === "script" ? scriptScenario :
                          formType === "document" ? documentTitle :
                          formType === "website" ? websiteUrl :
                          customTitle
                        )
                        
                        setFormType(categorySuggestion)
                        setSelectedType(categorySuggestion)
                        
                        if (categorySuggestion === "company") setCompanyName(currentPrimaryValue)
                        else if (categorySuggestion === "product") setProductName(currentPrimaryValue)
                        else if (categorySuggestion === "pricing") setPricingPlanName(currentPrimaryValue)
                        else if (categorySuggestion === "faq") setFaqQuestion(currentPrimaryValue)
                        else if (categorySuggestion === "policy") setPolicyName(currentPrimaryValue)
                        else if (categorySuggestion === "script") setScriptScenario(currentPrimaryValue)
                        else if (categorySuggestion === "document") setDocumentTitle(currentPrimaryValue)
                        else if (categorySuggestion === "website") setWebsiteUrl(currentPrimaryValue)
                        
                        setCategorySuggestion(null)
                      }}
                      className="text-[10px] font-bold underline text-amber-900 hover:text-amber-950 transition-colors cursor-pointer"
                    >
                      Apply template switch
                    </button>
                  </div>
                )}

                {/* What your AI will learn real-time preview card */}
                <div className="bg-slate-900 border border-slate-950 rounded-xl p-4 flex-1 flex flex-col justify-between text-white shadow-inner">
                  <div className="space-y-2">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 block">
                      What your AI will learn
                    </span>
                    <div className="text-xs text-slate-300 leading-relaxed font-normal whitespace-pre-wrap max-h-[160px] md:max-h-none overflow-y-auto">
                      {generateLiveSummary()}
                    </div>
                  </div>
                  <div className="pt-3 border-t border-slate-800 text-[10px] text-slate-400 mt-4 flex items-center gap-1 shrink-0 font-medium font-sans">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Live Brain Preview
                  </div>
                </div>

              </div>

            </div>

            {/* Fixed Footer Actions */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50/50 shrink-0">
              {selected && (
                <button
                  type="button"
                  onClick={handleDeleteClick}
                  disabled={loading}
                  className="mr-auto px-4 py-2 rounded-lg text-sm font-semibold text-rose-650 hover:bg-rose-50 hover:text-rose-700 transition-all text-center cursor-pointer"
                >
                  Delete
                </button>
              )}

              <button
                onClick={onClose}
                disabled={loading}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-slate-50 text-slate-700 hover:bg-slate-100 transition-all cursor-pointer border border-slate-200/50"
              >
                Cancel
              </button>

              <button
                onClick={() => handleSaveAttempt("Draft")}
                disabled={loading}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-all cursor-pointer"
              >
                Save Draft
              </button>

              <button
                onClick={() => handleSaveAttempt("Ready")}
                disabled={loading}
                className="px-5 py-2 rounded-lg text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-60 transition-all shadow-sm border border-slate-950 cursor-pointer"
              >
                {selected ? "Save Changes" : "Save Knowledge"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
