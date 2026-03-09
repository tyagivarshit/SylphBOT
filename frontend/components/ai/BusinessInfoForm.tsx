"use client"

import { Building } from "lucide-react"

interface Props{
value:string
onChange:(value:string)=>void
}

export default function BusinessInfo({value,onChange}:Props){

const maxChars = 500

return(

<div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-6 shadow-sm space-y-5">

{/* Header */}

<div className="flex items-start gap-2">

<Building size={18} className="text-blue-600 mt-0.5"/>

<div className="min-w-0">

<h3 className="text-base sm:text-lg font-semibold text-gray-900">
Business Info
</h3>

<p className="text-sm text-gray-500">
Tell AI about your business so it can respond better to leads
</p>

</div>

</div>


{/* Textarea */}

<div className="space-y-2">

<textarea
value={value}
onChange={(e)=>onChange(e.target.value)}
rows={4}
maxLength={maxChars}
placeholder="Example: We are a digital marketing agency offering SEO, paid ads, and social media management services..."
className="border border-gray-300 rounded-lg px-3 py-2 w-full text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
/>

<div className="flex justify-between text-xs text-gray-500">

<span className="truncate">
Used by AI to understand your services
</span>

<span className="whitespace-nowrap">
{value.length}/{maxChars}
</span>

</div>

</div>

</div>

)

}