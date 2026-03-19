"use client"

import { useState } from "react"

export default function FAQForm(){

const [question,setQuestion] = useState("")
const [answer,setAnswer] = useState("")
const [loading,setLoading] = useState(false)

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

    setQuestion("")
    setAnswer("")

  }catch(err:any){

    console.error(err)
    alert("❌ Failed to add FAQ")

  }finally{
    setLoading(false)
  }

}

return(

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

)

}