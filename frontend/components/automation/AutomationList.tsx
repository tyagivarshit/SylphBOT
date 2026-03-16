"use client"

import { useState } from "react"
import AutomationCard from "./AutomationCard"
import CreateAutomationModal from "./CreateAutomationModal"

export default function AutomationList(){

const [open,setOpen] = useState(false)

const automations = [
{
id:"1",
name:"Instagram DM Funnel",
status:"ACTIVE",
triggers:120
},
{
id:"2",
name:"WhatsApp Lead Followup",
status:"PAUSED",
triggers:54
}
]

return(

<div className="space-y-4">

<div className="flex justify-between items-center">

<h2 className="text-sm font-semibold text-gray-900">
Your Automations
</h2>

<button
onClick={()=>setOpen(true)}
className="bg-blue-600 text-white px-4 py-2 text-sm rounded-lg hover:bg-blue-700"

>

Create Automation </button>

</div>

<div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">

{automations.map((a)=>( <AutomationCard key={a.id} automation={a}/>
))}

</div>

<CreateAutomationModal
open={open}
onClose={()=>setOpen(false)}
/>

</div>

)

}
