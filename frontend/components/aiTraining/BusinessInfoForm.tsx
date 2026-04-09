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

<div className="space-y-5 rounded-[24px] border border-slate-200/80 bg-white/82 p-5 shadow-sm">

<label className="text-sm font-semibold text-slate-800">
Business Information
</label>

<textarea
value={info}
onChange={(e)=>setInfo(e.target.value)}
placeholder="Describe your business, services, pricing, policies..."
className="min-h-[170px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400"
rows={6}
/>

<button
onClick={handleSave}
disabled={loading}
className="brand-button-primary w-full"
>
{loading ? "Saving..." : "Save"}
</button>

</div>

)

}
