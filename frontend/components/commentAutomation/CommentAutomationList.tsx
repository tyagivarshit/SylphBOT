"use client"

import { useState } from "react"
import CommentAutomationCard from "./CommentAutomationCard"
import CreateCommentAutomationModal from "./CreateCommentAutomationModal"

export default function CommentAutomationList(){

const [open,setOpen] = useState(false)

const automations = [
{
id:"1",
keyword:"price",
reply:"Check your DM",
status:"ACTIVE"
},
{
id:"2",
keyword:"details",
reply:"Sending you details in DM",
status:"ACTIVE"
}
]

return(

<div className="space-y-4">

<div className="flex justify-between items-center">

<h2 className="text-sm font-semibold text-gray-900">
Comment Triggers
</h2>

<button
onClick={()=>setOpen(true)}
className="bg-blue-600 text-white px-4 py-2 text-sm rounded-lg hover:bg-blue-700"

>

Create Trigger </button>

</div>

<div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">

{automations.map((a)=>( <CommentAutomationCard key={a.id} automation={a}/>
))}

</div>

<CreateCommentAutomationModal
open={open}
onClose={()=>setOpen(false)}
/>

</div>

)

}
