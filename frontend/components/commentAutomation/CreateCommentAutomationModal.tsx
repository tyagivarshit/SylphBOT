"use client"

import { useEffect, useState } from "react"
import { api } from "@/lib/api"

export default function CreateCommentAutomationModal({
  open,
  onClose,
  editData, // 🔥 NEW
}: any){

const isEdit = !!editData

const [keyword,setKeyword] = useState("")
const [reply,setReply] = useState("")
const [dm,setDm] = useState("")

const [clients,setClients] = useState<any[]>([])
const [clientId,setClientId] = useState("")

const [media,setMedia] = useState<any[]>([])
const [selectedPost,setSelectedPost] = useState("")

const [loading,setLoading] = useState(false)
const [loadingClients,setLoadingClients] = useState(false)
const [loadingMedia,setLoadingMedia] = useState(false)

const [error,setError] = useState("")

/* ---------------- PREFILL (EDIT MODE) ---------------- */

useEffect(()=>{
  if(editData){
    setKeyword(editData.keyword || "")
    setReply(editData.replyText || "")
    setDm(editData.dmText || "")
    setClientId(editData.clientId || "")
    setSelectedPost(editData.reelId || "")
  }
},[editData])

/* ---------------- RESET ---------------- */

useEffect(()=>{
  if(!open){
    setKeyword("")
    setReply("")
    setDm("")
    setClientId("")
    setSelectedPost("")
    setMedia([])
    setError("")
  }
},[open])

/* ---------------- FETCH CLIENTS ---------------- */

useEffect(()=>{

  if(!open) return

  const fetchClients = async () => {
    try{
      setLoadingClients(true)

      const res = await api.get("/api/clients")

      const data = Array.isArray(res.data)
        ? res.data
        : res.data?.clients || []

      setClients(data)

    }catch{
      setError("Failed to load clients")
    }finally{
      setLoadingClients(false)
    }
  }

  fetchClients()

},[open])

/* ---------------- FETCH MEDIA ---------------- */

useEffect(()=>{

  if(!clientId) return

  const fetchMedia = async () => {
    try{
      setLoadingMedia(true)

      const res = await api.get(`/api/instagram/media?clientId=${clientId}`)

      setMedia(res.data?.data || [])

    }catch{
      setError("Failed to load posts")
    }finally{
      setLoadingMedia(false)
    }
  }

  fetchMedia()

},[clientId])

/* ---------------- SUBMIT ---------------- */

const handleSubmit = async () => {

  if(!clientId || !selectedPost || !keyword.trim() || !reply.trim()){
    setError("All fields are required")
    return
  }

  try{
    setLoading(true)
    setError("")

    const payload = {
      clientId,
      reelId: selectedPost,
      keyword: keyword.trim(),
      replyText: reply.trim(),
      dmText: dm.trim(),
    }

    if(isEdit){
      await api.patch(`/api/comment-triggers/${editData.id}`, payload)
    }else{
      await api.post("/api/comment-triggers", payload)
    }

    onClose()

  }catch{
    setError(isEdit ? "Failed to update" : "Failed to create")
  }finally{
    setLoading(false)
  }
}

const selectedMedia = media.find((m:any)=>m.id === selectedPost)

if(!open) return null

return(

<div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 px-3 sm:px-0">

<div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md p-4 sm:p-6 shadow-xl space-y-5 border border-gray-200 max-h-[90vh] overflow-y-auto">

<h2 className="text-base sm:text-lg font-semibold text-gray-900">
{isEdit ? "Edit Automation ✏️" : "Create Comment Automation 🚀"}
</h2>

{error && (
  <p className="text-xs sm:text-sm text-red-500">{error}</p>
)}

{/* CLIENT */}
<div>
<label className="text-xs sm:text-sm font-medium text-gray-900">
Instagram Account
</label>

<select
value={clientId}
onChange={(e)=>{
  setClientId(e.target.value)
  setSelectedPost("")
  setMedia([])
}}
className="w-full bg-gray-50 border border-gray-300 rounded-xl px-3 py-2 mt-1 text-xs sm:text-sm"
>
<option value="">
{loadingClients ? "Loading..." : "Select account"}
</option>

{clients.map((c)=>(
  <option key={c.id} value={c.id}>
    {c.name || c.pageId}
  </option>
))}
</select>
</div>

{/* MEDIA */}
{clientId && (
<div>
<label className="text-xs sm:text-sm font-medium text-gray-900">
Select Post / Reel
</label>

<select
value={selectedPost}
onChange={(e)=>setSelectedPost(e.target.value)}
className="w-full bg-gray-50 border border-gray-300 rounded-xl px-3 py-2 mt-1 text-xs sm:text-sm"
>
<option value="">
{loadingMedia ? "Loading..." : "Select post"}
</option>

{media.map((m:any)=>(
  <option key={m.id} value={m.id}>
    {(m.caption || "No caption").slice(0,40)}
  </option>
))}
</select>
</div>
)}

{/* PREVIEW */}
{selectedMedia && (
<div className="border rounded-xl p-2 bg-gray-50">
  {selectedMedia.media_url && (
    <img src={selectedMedia.media_url} className="w-full h-28 object-cover rounded-lg"/>
  )}
</div>
)}

{/* KEYWORD */}
<div>
<label className="text-xs font-medium text-gray-900">
Keyword (comma separated)
</label>

<input
value={keyword}
onChange={(e)=>setKeyword(e.target.value)}
placeholder="price, cost, fees"
className="w-full bg-gray-50 border border-gray-300 rounded-xl px-3 py-2 mt-1 text-sm"
/>
</div>

{/* REPLY */}
<div>
<label className="text-xs font-medium text-gray-900">
Comment Reply
</label>

<input
value={reply}
onChange={(e)=>setReply(e.target.value)}
className="w-full bg-gray-50 border border-gray-300 rounded-xl px-3 py-2 mt-1 text-sm"
/>
</div>

{/* DM */}
<div>
<label className="text-xs font-medium text-gray-900">
DM Message
</label>

<textarea
value={dm}
onChange={(e)=>setDm(e.target.value)}
className="w-full bg-gray-50 border border-gray-300 rounded-xl px-3 py-2 mt-1 text-sm"
rows={3}
/>
</div>

{/* ACTIONS */}
<div className="flex justify-end gap-3">

<button onClick={onClose} className="text-sm text-gray-600">
Cancel
</button>

<button
onClick={handleSubmit}
disabled={loading}
className="bg-indigo-600 text-white px-5 py-2 rounded-xl text-sm"
>
{loading ? "Saving..." : isEdit ? "Update" : "Create"}
</button>

</div>

</div>
</div>
)
}