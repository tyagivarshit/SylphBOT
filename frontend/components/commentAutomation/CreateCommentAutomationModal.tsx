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

/* ---------------- FETCH CLIENTS ---------------- */

useEffect(()=>{

  if(!open) return

  const fetchClients = async () => {

    try{

      setLoadingClients(true)
      setError("")

      const res = await api.get("/clients")

      const data = Array.isArray(res.data)
        ? res.data
        : res.data?.clients || []

      setClients(data)

    }catch(err: any){

      console.log("CLIENT ERROR:", err?.response?.data || err.message)
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
      setError("")

      const res = await api.get(`/instagram/media?clientId=${clientId}`)

      const data = res.data?.data || []

      setMedia(data)

    }catch(err: any){

      console.log("MEDIA ERROR:", err?.response?.data || err.message)
      setError("Failed to load posts")

    }finally{

      setLoadingMedia(false)

    }

  }

  fetchMedia()

},[clientId])

if(!open) return null

/* ---------------- CREATE ---------------- */

const handleCreate = async () => {

  if(!clientId || !selectedPost || !keyword || !reply){
    setError("All fields are required")
    return
  }

  try{

    setLoading(true)
    setError("")

    await api.post("/comment-triggers",{
      clientId,
      reelId: selectedPost,
      keyword,
      replyText: reply,
      dmText: dm
    })

    /* RESET */

    setKeyword("")
    setReply("")
    setDm("")
    setClientId("")
    setSelectedPost("")
    setMedia([])

    onClose()

  }catch(err: any){

    console.log("CREATE ERROR:", err?.response?.data || err.message)
    setError("Failed to create automation")

  }finally{

    setLoading(false)

  }

}

return(

<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">

<div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl space-y-5">

<h2 className="text-lg font-semibold text-gray-900">
Create Comment Automation
</h2>

{/* ERROR */}
{error && (
  <p className="text-sm text-red-600 font-medium">{error}</p>
)}

{/* CLIENT */}

<div>
<label className="text-sm font-semibold text-gray-900">
Instagram Account
</label>

<select
value={clientId}
onChange={(e)=>{
  setClientId(e.target.value)
  setError("") // 🔥 UX fix
}}
className="w-full border border-gray-300 rounded-lg px-3 py-2 mt-1 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
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

{/* POST SELECT */}

{clientId && (

<div>
<label className="text-sm font-semibold text-gray-900">
Select Post / Reel
</label>

<select
value={selectedPost}
onChange={(e)=>{
  setSelectedPost(e.target.value)
  setError("")
}}
className="w-full border border-gray-300 rounded-lg px-3 py-2 mt-1 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
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

{/* KEYWORD */}

<div>
<label className="text-sm font-semibold text-gray-900">
Keyword
</label>

<input
value={keyword}
onChange={(e)=>{
  setKeyword(e.target.value)
  setError("")
}}
placeholder="Example: price"
className="w-full border border-gray-300 rounded-lg px-3 py-2 mt-1 text-sm text-gray-900 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
/>
</div>

{/* REPLY */}

<div>
<label className="text-sm font-semibold text-gray-900">
Reply Comment
</label>

<input
value={reply}
onChange={(e)=>{
  setReply(e.target.value)
  setError("")
}}
placeholder="Example: Check your DM"
className="w-full border border-gray-300 rounded-lg px-3 py-2 mt-1 text-sm text-gray-900 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
/>
</div>

{/* DM */}

<div>
<label className="text-sm font-semibold text-gray-900">
Auto DM Message
</label>

<textarea
value={dm}
onChange={(e)=>{
  setDm(e.target.value)
  setError("")
}}
placeholder="Example: Hi! Sending you the details..."
className="w-full border border-gray-300 rounded-lg px-3 py-2 mt-1 text-sm text-gray-900 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
rows={3}
/>
</div>

{/* BUTTONS */}

<div className="flex justify-end gap-3 pt-2">

<button
onClick={onClose}
className="text-sm font-medium text-gray-800 hover:text-black"
>
Cancel
</button>

<button
onClick={handleCreate}
disabled={loading}
className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition disabled:opacity-50"
>
{loading ? "Creating..." : "Create"}
</button>

</div>

</div>

</div>

)

}