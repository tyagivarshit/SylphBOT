"use client"

import { useEffect, useState } from "react"

interface FAQ {
  id: string
  question: string
  answer: string
}

export default function FAQForm(){

const [question,setQuestion] = useState("")
const [answer,setAnswer] = useState("")
const [faqs,setFaqs] = useState<FAQ[]>([])

const [loading,setLoading] = useState(false)
const [fetching,setFetching] = useState(true)

/* ================= LOAD FAQs ================= */

useEffect(() => {
  const loadFAQs = async () => {
    try {
      const res = await fetch("/api/training/faq")
      const data = await res.json()

      if(res.ok){
        setFaqs(data || [])
      }

    } catch (err) {
      console.error("Load FAQ error:", err)
    } finally {
      setFetching(false)
    }
  }

  loadFAQs()
}, [])

/* ================= ADD FAQ ================= */

const handleAdd = async () => {

  if(!question.trim() || !answer.trim()){
    return alert("Please fill both fields")
  }

  try{

    setLoading(true)

    const res = await fetch("/api/training/faq",{
      method:"POST",
      headers:{
        "Content-Type":"application/json"
      },
      body: JSON.stringify({ question, answer })
    })

    const data = await res.json()

    if(!res.ok){
      throw new Error(data.message || "Failed")
    }

    alert("✅ FAQ added")

    /* 🔥 UPDATE UI INSTANTLY */
    setFaqs(prev => [data, ...prev])

    setQuestion("")
    setAnswer("")

  }catch(err:any){

    console.error(err)
    alert("❌ Failed to add FAQ")

  }finally{
    setLoading(false)
  }

}

/* ================= UI ================= */

if(fetching){
  return <p className="text-sm text-gray-500">Loading FAQs...</p>
}

return(

<div className="space-y-6">

{/* ADD FORM */}

<div className="space-y-4">

<input
value={question}
onChange={(e)=>setQuestion(e.target.value)}
placeholder="Question"
className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
/>

<textarea
value={answer}
onChange={(e)=>setAnswer(e.target.value)}
placeholder="Answer"
className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
rows={4}
/>

<button
onClick={handleAdd}
disabled={loading}
className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm disabled:opacity-50"
>
{loading ? "Adding..." : "Add FAQ"}
</button>

</div>

{/* FAQ LIST */}

<div className="space-y-3">

{faqs.length === 0 && (
  <p className="text-sm text-gray-500">No FAQs yet</p>
)}

{faqs.map((faq) => (
  <div
    key={faq.id}
    className="border border-gray-200 rounded-lg p-3"
  >
    <p className="font-medium text-sm text-gray-900">
      {faq.question}
    </p>
    <p className="text-sm text-gray-600 mt-1">
      {faq.answer}
    </p>
  </div>
))}

</div>

</div>

)

}