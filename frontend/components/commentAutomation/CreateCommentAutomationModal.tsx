"use client"

import { useState } from "react"

export default function CreateCommentAutomationModal({ open,onClose }: any){

const [postId,setPostId] = useState("")
const [keyword,setKeyword] = useState("")
const [reply,setReply] = useState("")
const [dm,setDm] = useState("")

if(!open) return null

return(

<div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">

<div className="bg-white rounded-xl w-full max-w-md p-6 shadow-lg space-y-4">

<h2 className="text-base font-semibold text-gray-900">
Create Comment Automation
</h2>

{/* POST ID */}

<div>

<label className="text-sm font-medium text-gray-800">
Reel / Post ID
</label>

<input
value={postId}
onChange={(e)=>setPostId(e.target.value)}
placeholder="Example: 182739182739"
className="w-full border border-gray-300 rounded-lg px-3 py-2 mt-1 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
/>

</div>

{/* KEYWORD */}

<div>

<label className="text-sm font-medium text-gray-800">
Keyword
</label>

<input
value={keyword}
onChange={(e)=>setKeyword(e.target.value)}
placeholder="Example: price"
className="w-full border border-gray-300 rounded-lg px-3 py-2 mt-1 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
/>

</div>

{/* REPLY COMMENT */}

<div>

<label className="text-sm font-medium text-gray-800">
Reply Comment
</label>

<input
value={reply}
onChange={(e)=>setReply(e.target.value)}
placeholder="Example: Check your DM"
className="w-full border border-gray-300 rounded-lg px-3 py-2 mt-1 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
/>

</div>

{/* AUTO DM */}

<div>

<label className="text-sm font-medium text-gray-800">
Auto DM Message
</label>

<textarea
value={dm}
onChange={(e)=>setDm(e.target.value)}
placeholder="Example: Hi! Sending you the details..."
className="w-full border border-gray-300 rounded-lg px-3 py-2 mt-1 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
rows={3}
/>

</div>

{/* BUTTONS */}

<div className="flex justify-end gap-3 pt-2">

<button
onClick={onClose}
className="text-sm text-gray-700 hover:text-gray-900"
>
Cancel
</button>

<button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition">
Create
</button>

</div>

</div>

</div>

)

}
