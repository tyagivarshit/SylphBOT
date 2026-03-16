"use client"

import { useState } from "react"
import CreateSlotModal from "./CreateSlotModal"

export default function DaySlots(){

const [open,setOpen] = useState(false)

const slots = [
"10:00 AM",
"11:30 AM",
"2:00 PM",
"4:30 PM"
]

return(

<div className="bg-white border border-gray-200 rounded-xl p-5">

<div className="flex justify-between items-center mb-4">

<h2 className="text-sm font-semibold text-gray-900">
Available Slots
</h2>

<button
onClick={()=>setOpen(true)}
className="bg-blue-600 text-white text-xs px-3 py-1 rounded-lg"

>

Add Slot </button>

</div>

<div className="space-y-2">

{slots.map((slot,i)=>(

<div
key={i}
className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 font-medium"
>
{slot}
</div>

))}

</div>

<CreateSlotModal
open={open}
onClose={()=>setOpen(false)}
/>

</div>

)

}
