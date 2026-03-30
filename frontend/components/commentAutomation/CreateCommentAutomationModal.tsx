"use client"

import { useEffect, useState } from "react"
import { api } from "@/lib/api"

export default function CreateCommentAutomationModal({ open, onClose }: any){

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

/* ---------------- RESET ON CLOSE ---------------- */

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

      // ✅ FIXED
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

      // ✅ FIXED
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

/* ---------------- CREATE ---------------- */

const handleCreate = async () => {

  if(
    !clientId ||
    !selectedPost ||
    !keyword.trim() ||
    !reply.trim()
  ){
    setError("All fields are required")
    return
  }

  try{
    setLoading(true)
    setError("")

    await api.post("/api/comment-triggers",{
      clientId,
      reelId: selectedPost,
      keyword: keyword.trim(),
      replyText: reply.trim(),
      dmText: dm.trim()
    })

    onClose()

  }catch{
    setError("Failed to create automation")
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
Create Comment Automation 🚀
</h2>

{error && (
  <p className="text-xs sm:text-sm text-red-500">{error}</p>
)}

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
  setError("")
}}
className="w-full bg-gray-50 border border-gray-300 rounded-xl px-3 py-2 mt-1 text-xs sm:text-sm text-gray-900 focus:ring-2 focus:ring-indigo-500/30"
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

{clientId && (

<div>
<label className="text-xs sm:text-sm font-medium text-gray-900">
Select Post / Reel
</label>

<select
value={selectedPost}
onChange={(e)=>{
  setSelectedPost(e.target.value)
  setError("")
}}
className="w-full bg-gray-50 border border-gray-300 rounded-xl px-3 py-2 mt-1 text-xs sm:text-sm text-gray-900 focus:ring-2 focus:ring-indigo-500/30"
>
<option value="">
{loadingMedia ? "Loading posts..." : "Select post"}
</option>

{media.map((m:any)=>(
  <option key={m.id} value={m.id}>
    {(m.caption || "No caption").slice(0,40)}
  </option>
))}

</select>
</div>

)}

{selectedMedia && (
<div className="border border-gray-200 rounded-xl p-2 bg-gray-50">
  {selectedMedia.media_url && (
    <img
      src={selectedMedia.media_url}
      alt=""
      className="w-full h-28 sm:h-32 object-cover rounded-lg"
    />
  )}
  <p className="text-[10px] sm:text-xs text-gray-600 mt-1">
    {(selectedMedia.caption || "No caption").slice(0,80)}
  </p>
</div>
)}

<div>
<label className="text-xs sm:text-sm font-medium text-gray-900">
Keyword
</label>

<input
value={keyword}
onChange={(e)=>{
  setKeyword(e.target.value)
  setError("")
}}
placeholder="Example: price"
className="w-full bg-gray-50 border border-gray-300 rounded-xl px-3 py-2 mt-1 text-xs sm:text-sm text-gray-900 focus:ring-2 focus:ring-indigo-500/30"
/>
</div>

<div>
<label className="text-xs sm:text-sm font-medium text-gray-900">
Comment Reply
</label>

<input
value={reply}
onChange={(e)=>{
  setReply(e.target.value)
  setError("")
}}
placeholder="Example: Check your DM 👀"
className="w-full bg-gray-50 border border-gray-300 rounded-xl px-3 py-2 mt-1 text-xs sm:text-sm text-gray-900 focus:ring-2 focus:ring-indigo-500/30"
/>
</div>

<div>
<label className="text-xs sm:text-sm font-medium text-gray-900">
DM Message
</label>

<textarea
value={dm}
onChange={(e)=>{
  setDm(e.target.value)
  setError("")
}}
placeholder="Example: Hi! Sending details..."
className="w-full bg-gray-50 border border-gray-300 rounded-xl px-3 py-2 mt-1 text-xs sm:text-sm text-gray-900 resize-none focus:ring-2 focus:ring-indigo-500/30"
rows={3}
/>
</div>

<div className="flex flex-col sm:flex-row justify-end gap-2 sm:gap-3 pt-2">

<button
onClick={onClose}
className="w-full sm:w-auto text-sm text-gray-600 hover:text-gray-900"
>
Cancel
</button>

<button
onClick={handleCreate}
disabled={loading || !clientId || !selectedPost}
className="w-full sm:w-auto bg-indigo-600 text-white px-5 py-2 rounded-xl text-sm font-medium hover:bg-indigo-500 shadow-md hover:shadow-indigo-500/30 transition disabled:opacity-50"
>
{loading ? "Creating..." : "Create Automation"}
</button>

</div>

</div>

</div>

)

}