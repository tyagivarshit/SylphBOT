"use client"

import { Sparkles } from "lucide-react"
import { useState } from "react"

export default function PromptTemplates() {

const [prompt,setPrompt] = useState("")
const maxChars = 800

return(

<div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-5">

{/* Header */}

<div className="flex items-center gap-2">

<Sparkles size={18} className="text-blue-600"/>

<div>

<h3 className="text-lg font-semibold text-gray-900">
Prompt Templates
</h3>

<p className="text-sm text-gray-500">
Customize how AI responds to your leads
</p>

</div>

</div>


{/* Examples */}

<div className="text-xs text-gray-500 bg-gray-50 border rounded-lg p-3">

<p className="font-medium mb-1">Example instructions:</p>

<ul className="space-y-1">

<li>• Always ask for the customer's name</li>
<li>• Offer a meeting if they ask about pricing</li>
<li>• Keep responses short and friendly</li>

</ul>

</div>


{/* Textarea */}

<div className="space-y-2">

<textarea
value={prompt}
onChange={(e)=>setPrompt(e.target.value)}
maxLength={maxChars}
placeholder="Example: Always greet customers politely and offer to schedule a call if they ask about pricing..."
className="border border-gray-300 rounded-lg px-3 py-3 w-full h-32 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
/>

<div className="flex justify-between text-xs text-gray-500">

<span>
Used to guide AI behavior
</span>

<span>
{prompt.length}/{maxChars}
</span>

</div>

</div>


{/* Button */}

<div className="flex justify-end">

<button className="bg-blue-600 hover:bg-blue-700 transition text-white text-sm font-medium px-4 py-2 rounded-lg">

Save Prompt

</button>

</div>

</div>

)

}