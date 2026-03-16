"use client"

import { useState } from "react"

export default function BusinessInfoForm(){

const [info,setInfo] = useState("")

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

<button className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm">
Save
</button>

</div>

)

}
