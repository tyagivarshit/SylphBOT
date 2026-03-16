"use client"

import { useState } from "react"

export default function FAQForm(){

const [question,setQuestion] = useState("")
const [answer,setAnswer] = useState("")

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

<button className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm">
Add FAQ
</button>

</div>

)

}
