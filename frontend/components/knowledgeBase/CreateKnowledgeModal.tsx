"use client"

import { useState } from "react"

export default function CreateKnowledgeModal({ open,onClose }: any){

const [title,setTitle] = useState("")
const [content,setContent] = useState("")

if(!open) return null

return(

<div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">

<div className="bg-white rounded-xl w-full max-w-md p-6 shadow-lg space-y-4">

<h2 className="text-base font-semibold text-gray-900">
Add Knowledge
</h2>

<div>

<label className="text-sm font-medium text-gray-800">
Title
</label>

<input
value={title}
onChange={(e)=>setTitle(e.target.value)}
placeholder="Example: Pricing"
className="w-full border border-gray-300 rounded-lg px-3 py-2 mt-1 text-sm text-gray-900"
/>

</div>

<div>

<label className="text-sm font-medium text-gray-800">
Content
</label>

<textarea
value={content}
onChange={(e)=>setContent(e.target.value)}
placeholder="Enter knowledge content..."
className="w-full border border-gray-300 rounded-lg px-3 py-2 mt-1 text-sm text-gray-900"
rows={4}
/>

</div>

<div className="flex justify-end gap-3">

<button
onClick={onClose}
className="text-sm text-gray-700"
>
Cancel
</button>

<button className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm">
Save
</button>

</div>

</div>

</div>

)

}
