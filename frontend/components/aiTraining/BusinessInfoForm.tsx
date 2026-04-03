"use client"

import { useEffect, useState } from "react"

export default function BusinessInfoForm(){

const [info,setInfo] = useState("")
const [loading,setLoading] = useState(false)
const [fetching,setFetching] = useState(true)

/* ================= LOAD DATA ================= */

useEffect(() => {
  const loadData = async () => {
    try {
      const res = await fetch("/api/training/business")
      const data = await res.json()

      if (res.ok && data?.content) {
        setInfo(data.content)
      }

    } catch (err) {
      console.error("Load error:", err)
    } finally {
      setFetching(false)
    }
  }

  loadData()
}, [])

/* ================= SAVE ================= */

const handleSave = async () => {

  if(!info.trim()) return alert("Please enter business info")

  try{

    setLoading(true)

    const res = await fetch("/api/training/business",{
      method:"POST",
      headers:{
        "Content-Type":"application/json"
      },
      body: JSON.stringify({ content: info })
    })

    const data = await res.json()

    if(!res.ok){
      throw new Error(data.message || "Failed")
    }

    alert("✅ Business info saved")

  }catch(err:any){

    console.error(err)
    alert("❌ Failed to save")

  }finally{
    setLoading(false)
  }

}

/* ================= UI ================= */

if(fetching){
  return <p className="text-sm text-gray-500">Loading...</p>
}

return(

<div className="space-y-5 bg-white/70 backdrop-blur-xl border border-blue-100 rounded-2xl p-5 shadow-sm">

<label className="text-sm font-semibold text-gray-700">
Business Information
</label>

<textarea
value={info}
onChange={(e)=>setInfo(e.target.value)}
placeholder="Describe your business, services, pricing, policies..."
className="w-full bg-white text-gray-900 border border-blue-100 rounded-xl px-4 py-2.5 text-sm placeholder-gray-400 focus:ring-2 focus:ring-blue-400 outline-none transition"
rows={6}
/>

<button
onClick={handleSave}
disabled={loading}
className="w-full bg-gradient-to-r from-blue-600 to-cyan-500 text-white text-sm font-semibold py-2.5 rounded-xl shadow-md hover:shadow-lg transition active:scale-[0.98] disabled:opacity-70"
>
{loading ? "Saving..." : "Save"}
</button>

</div>

)

}