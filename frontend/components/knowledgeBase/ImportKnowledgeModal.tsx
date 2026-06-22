"use client"

import { useState } from "react"
import { api } from "@/lib/api"
import { serializeKnowledgeTitle } from "./KnowledgeList"
import { X, Upload, Globe, FileText } from "lucide-react"

export default function ImportKnowledgeModal({ open, onClose, onImportSuccess, clientId = "" }: any) {
  const [sourceType, setSourceType] = useState<"Document" | "Website">("Document")
  const [sourceName, setSourceName] = useState("")
  const [category, setCategory] = useState("Resources")
  const [content, setContent] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [dragOver, setDragOver] = useState(false)
  const [fileDetails, setFileDetails] = useState<{ name: string; size: number } | null>(null)

  if (!open) return null

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }

  const handleDragLeave = () => {
    setDragOver(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) {
      setFileDetails({ name: file.name, size: file.size })
      setSourceName(file.name)
      const reader = new FileReader()
      reader.onload = (event) => {
        setContent(event.target?.result as string || "")
      }
      if (file.type.startsWith("text/") || file.name.endsWith(".txt") || file.name.endsWith(".md") || file.name.endsWith(".json")) {
        reader.readAsText(file)
      } else {
        setContent(`Simulated import content for binary document: ${file.name} (${Math.round(file.size / 1024)} KB)`)
      }
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setFileDetails({ name: file.name, size: file.size })
      setSourceName(file.name)
      const reader = new FileReader()
      reader.onload = (event) => {
        setContent(event.target?.result as string || "")
      }
      if (file.type.startsWith("text/") || file.name.endsWith(".txt") || file.name.endsWith(".md") || file.name.endsWith(".json")) {
        reader.readAsText(file)
      } else {
        setContent(`Simulated import content for binary document: ${file.name} (${Math.round(file.size / 1024)} KB)`)
      }
    }
  }

  const handleSubmit = async () => {
    if (!sourceName.trim()) {
      setError(sourceType === "Document" ? "Please select or drop a file" : "Please enter a URL")
      return
    }
    if (!content.trim()) {
      setError("Please add content to import")
      return
    }

    try {
      setLoading(true)
      setError("")

      const title = sourceName
      const source = sourceType === "Document" ? "Document" : "Website"
      const serializedTitle = serializeKnowledgeTitle(title, category, source, "Ready")

      await api.post("/api/knowledge", {
        title: serializedTitle,
        content,
        clientId: clientId || undefined
      })

      setSourceName("")
      setContent("")
      setFileDetails(null)
      onImportSuccess()
      onClose()
    } catch (err: any) {
      console.error("Import error:", err)
      setError(err?.response?.data?.message || "Failed to import knowledge")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-[4px] flex items-center justify-center z-50 px-4">
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-white border border-slate-200 rounded-2xl p-6 shadow-2xl space-y-6">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h2 className="text-base font-semibold text-slate-900">
            Import Business Knowledge
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-650 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <p className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">
            {error}
          </p>
        )}

        <div className="flex bg-slate-100 rounded-lg p-1">
          <button
            onClick={() => {
              setSourceType("Document")
              setCategory("Resources")
              setSourceName("")
              setContent("")
              setFileDetails(null)
            }}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center justify-center gap-1.5 ${
              sourceType === "Document" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900"
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            Upload Document
          </button>
          <button
            onClick={() => {
              setSourceType("Website")
              setCategory("Resources")
              setSourceName("")
              setContent("")
              setFileDetails(null)
            }}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center justify-center gap-1.5 ${
              sourceType === "Website" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900"
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            Website URL
          </button>
        </div>

        {sourceType === "Document" ? (
          <div className="space-y-4">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-450">
              Document File
            </label>
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all ${
                dragOver
                  ? "border-slate-900 bg-slate-50"
                  : "border-slate-200 bg-slate-50/50 hover:bg-slate-50"
              }`}
              onClick={() => document.getElementById("file-upload")?.click()}
            >
              <input
                id="file-upload"
                type="file"
                className="hidden"
                onChange={handleFileSelect}
                accept=".txt,.md,.pdf,.json,.doc,.docx"
              />
              <Upload className="w-8 h-8 text-slate-400" />
              {fileDetails ? (
                <div className="text-center">
                  <p className="text-xs font-semibold text-slate-900">{fileDetails.name}</p>
                  <p className="text-[10px] text-slate-500">{Math.round(fileDetails.size / 1024)} KB</p>
                </div>
              ) : (
                <div className="text-center">
                  <p className="text-xs font-medium text-slate-700">
                    Drag and drop file here, or click to browse
                  </p>
                  <p className="text-[10px] text-slate-400 mt-1">
                    Supports TXT, PDF, DOCX, MD, JSON
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-450">
                Website URL
              </label>
              <input
                value={sourceName}
                onChange={(e) => setSourceName(e.target.value)}
                placeholder="https://example.com/about-us"
                className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 bg-slate-50/50 hover:bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 transition-all"
              />
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-450">
              Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 bg-slate-50/50 hover:bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 transition-all"
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
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-450">
              Source Name / Label
            </label>
            <input
              value={sourceName}
              onChange={(e) => setSourceName(e.target.value)}
              placeholder="e.g. FAQ doc / Main Website"
              className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 bg-slate-50/50 hover:bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 transition-all"
              disabled={sourceType === "Document" && !!fileDetails}
            />
          </div>
        </div>

        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-450">
            Content to Import
          </label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Paste text content of the website page or document to train your AI on..."
            className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 bg-slate-50/50 hover:bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 transition-all"
            rows={5}
          />
        </div>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end border-t border-slate-100 pt-4">
          <button
            onClick={onClose}
            disabled={loading}
            className="w-full sm:w-auto px-4 py-2 rounded-lg text-sm font-semibold bg-slate-50 text-slate-700 hover:bg-slate-100 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full sm:w-auto px-5 py-2 rounded-lg text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-60 transition-all shadow-sm flex items-center justify-center gap-1.5"
          >
            {loading ? "Importing..." : "Import Knowledge"}
          </button>
        </div>
      </div>
    </div>
  )
}
