"use client"

import { useState, useEffect } from "react"
import StageBadge from "./StageBadge"
import LeadDrawer from "./LeadDrawer"
import { socket } from "@/lib/socket"

export default function LeadsTable({ leads }: any) {

const [selectedLead,setSelectedLead] = useState<any>(null)
const [tableLeads,setTableLeads] = useState<any[]>([])

/* INITIALIZE */

useEffect(()=>{

if(Array.isArray(leads)){
setTableLeads(leads)
}

},[leads])

/* REALTIME MESSAGE */

useEffect(()=>{

socket.on("new_message",(msg:any)=>{

setTableLeads((prev)=>

prev.map((lead:any)=>{

if(lead.id === msg.leadId){

return{
...lead,
lastMessage:msg.content,
unreadCount:(lead.unreadCount || 0) + 1
}

}

return lead

})

)

})

return ()=>{

socket.off("new_message")

}

},[])

/* STAGE UPDATE */

const handleStageUpdate = (id:string,newStage:string)=>{

setTableLeads((prev)=>
prev.map((l:any)=>
l.id===id ? {...l,stage:newStage} : l
)
)

}

return(

<div className="relative bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">

<div className="overflow-x-auto">

<table className="min-w-full text-sm">

{/* HEADER */}

<thead className="bg-gray-50 border-b text-gray-700 sticky top-0 z-10">

<tr>

<th className="px-4 py-3 text-left font-semibold">
Lead
</th>

<th className="px-4 py-3 text-left font-semibold">
Platform
</th>

<th className="px-4 py-3 text-left font-semibold">
Stage
</th>

<th className="px-4 py-3 text-left font-semibold">
Last Message
</th>

</tr>

</thead>

{/* BODY */}

<tbody className="divide-y bg-white">

{Array.isArray(tableLeads) && tableLeads.length > 0 ? (

tableLeads.map((lead:any)=> (

<tr
key={lead.id}
className="hover:bg-gray-50 cursor-pointer transition"
onClick={() => setSelectedLead(lead)}
>

{/* LEAD */}

<td className="px-4 py-4">

<div className="flex items-center gap-3">

<div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-xs font-semibold text-blue-600 shrink-0">

{lead.name?.charAt(0)?.toUpperCase() || "?"}

</div>

<div className="flex flex-col min-w-0">

<span className="font-medium text-gray-900 truncate">

{lead.name || `Lead ${lead.id.slice(-4)}`}

</span>

<span className="text-xs text-gray-500 truncate">

ID: {lead.id}

</span>

</div>

</div>

</td>

{/* PLATFORM */}

<td className="px-4 py-4">

<span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-700 capitalize">

{lead.platform}

</span>

</td>

{/* STAGE */}

<td className="px-4 py-4">

<StageBadge stage={lead.stage} />

</td>

{/* LAST MESSAGE */}

<td className="px-4 py-4 text-gray-600 max-w-xs truncate">

<div className="flex items-center gap-2">

<span className="truncate">

{lead.lastMessage || "No messages yet"}

</span>

{lead.unreadCount > 0 && (

<span className="bg-red-500 text-white text-[11px] px-2 py-0.5 rounded-full font-medium">

{lead.unreadCount}

</span>

)}

</div>

</td>

</tr>

))

) : (

<tr>

<td colSpan={4} className="text-center py-10 text-gray-400 text-sm">

No leads yet

</td>

</tr>

)}

</tbody>

</table>

</div>

{/* DRAWER */}

{selectedLead && selectedLead.id && (

<LeadDrawer
lead={selectedLead}
onClose={() => setSelectedLead(null)}
onStageUpdate={handleStageUpdate}
/>

)}

</div>

)

}
