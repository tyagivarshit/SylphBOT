"use client"

import { useState } from "react"
import KnowledgeCard from "./KnowledgeCard"
import CreateKnowledgeModal from "./CreateKnowledgeModal"

export default function KnowledgeList(){

const [open,setOpen] = useState(false)

const knowledge = [
{
id:"1",
title:"Pricing Information",
type:"TEXT"
},
{
id:"2",
title:"Refund Policy",
type:"DOCUMENT"
}
]

return(

<div className="space-y-4">

<div className="flex justify-between items-center">

<h2 className="text-sm font-semibold text-gray-900">
Knowledge Entries
</h2>

<button
onClick={()=>setOpen(true)}
className="bg-blue-600 text-white px-4 py-2 text-sm rounded-lg hover:bg-blue-700"

>

Add Knowledge </button>

</div>

<div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">

{knowledge.map((item)=>( <KnowledgeCard key={item.id} item={item}/>
))}

</div>

<CreateKnowledgeModal
open={open}
onClose={()=>setOpen(false)}
/>

</div>

)

}
