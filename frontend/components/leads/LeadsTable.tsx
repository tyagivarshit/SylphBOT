"use client"

import { useState } from "react"
import StageBadge from "./StageBadge"
import LeadDrawer from "./LeadDrawer"

export default function LeadsTable({ leads }: any) {

const [selectedLead, setSelectedLead] = useState<any>(null)

return(

<div className="relative overflow-hidden border border-gray-200 rounded-xl">

<div className="overflow-x-auto">

<table className="w-full text-sm">

{/* HEADER */}

<thead className="bg-gray-50 border-b text-gray-700 sticky top-0">

<tr>

<th className="p-4 text-left font-semibold">
Lead
</th>

<th className="text-left font-semibold">
Platform
</th>

<th className="text-left font-semibold">
Stage
</th>

<th className="text-left font-semibold">
Last Message
</th>

</tr>

</thead>


{/* BODY */}

<tbody className="divide-y bg-white">

{Array.isArray(leads) && leads.length > 0 ? (

leads.map((lead:any)=> (

<tr
key={lead.id}
className="hover:bg-gray-50 cursor-pointer transition"
onClick={() => setSelectedLead(lead)}
>

{/* LEAD */}

<td className="p-4">

<div className="flex items-center gap-3">

<div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-xs font-semibold text-blue-600">
{lead.name?.charAt(0) || "?"}
</div>

<div className="flex flex-col">

<span className="font-medium text-gray-900">
{lead.name}
</span>

<span className="text-xs text-gray-500">
ID: {lead.id}
</span>

</div>

</div>

</td>


{/* PLATFORM */}

<td>

<span className="px-2 py-1 rounded-md text-xs bg-gray-100 text-gray-700 capitalize">
{lead.platform}
</span>

</td>


{/* STAGE */}

<td>

<StageBadge stage={lead.stage} />

</td>


{/* LAST MESSAGE */}

<td className="text-gray-600 max-w-xs truncate">

{lead.lastMessage || "No messages yet"}

</td>

</tr>

))

) : (

<tr>

<td colSpan={4} className="text-center py-12 text-gray-500 text-sm">

No leads found  
<br/>
Connect WhatsApp or Instagram to start receiving leads

</td>

</tr>

)}

</tbody>

</table>

</div>


{/* DRAWER */}

{selectedLead && (

<LeadDrawer
lead={selectedLead}
onClose={() => setSelectedLead(null)}
/>

)}

</div>

)

}