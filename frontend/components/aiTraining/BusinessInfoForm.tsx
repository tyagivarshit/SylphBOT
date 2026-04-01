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

<div className="space-y-4">

<label className="text-sm font-medium text-gray-800">
Business Information
</label>

<textarea
value={info}
onChange={(e)=>setInfo(e.target.value)}
placeholder="Describe your business, services, pricing, policies..."
className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
rows={6}
/>

<button
onClick={handleSave}
disabled={loading}
className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm disabled:opacity-50"
>
{loading ? "Saving..." : "Save"}
</button>

</div>

)

}