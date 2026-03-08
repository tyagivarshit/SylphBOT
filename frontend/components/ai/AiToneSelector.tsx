"use client"

import { Smile, Briefcase, TrendingUp } from "lucide-react"

interface Props{
value:string
onChange:(value:string)=>void
}

export default function AIToneSelector({value,onChange}:Props){

const tones = [
{
id:"friendly",
title:"Friendly",
desc:"Casual and welcoming responses",
icon:<Smile size={16}/>
},
{
id:"professional",
title:"Professional",
desc:"Formal and business-like replies",
icon:<Briefcase size={16}/>
},
{
id:"sales",
title:"Sales",
desc:"Optimized for conversions and bookings",
icon:<TrendingUp size={16}/>
}
]

return(

<div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-5">

{/* Header */}

<div>

<h3 className="text-lg font-semibold text-gray-900">
AI Tone
</h3>

<p className="text-sm text-gray-500">
Choose how the AI should communicate with your leads
</p>

</div>


{/* Options */}

<div className="space-y-3">

{tones.map((tone)=>(

<button
key={tone.id}
onClick={()=>onChange(tone.id)}
className={`w-full flex items-center justify-between border rounded-lg p-3 transition
${value===tone.id
? "border-blue-600 bg-blue-50"
: "border-gray-200 hover:bg-gray-50"
}`}
>

<div className="flex items-center gap-3">

<div className="text-blue-600">
{tone.icon}
</div>

<div className="text-left">

<p className="text-sm font-medium text-gray-900">
{tone.title}
</p>

<p className="text-xs text-gray-500">
{tone.desc}
</p>

</div>

</div>

{value===tone.id && (
<span className="text-xs font-medium text-blue-600">
Selected
</span>
)}

</button>

))}

</div>

</div>

)

}