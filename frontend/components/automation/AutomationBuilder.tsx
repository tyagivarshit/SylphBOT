"use client"

import AutomationStep from "./AutomationStep"

export default function AutomationBuilder(){

const steps = [
{ type:"TRIGGER", label:"Instagram DM Received" },
{ type:"MESSAGE", label:"Send Welcome Message" },
{ type:"DELAY", label:"Wait 5 minutes" },
{ type:"MESSAGE", label:"Send Offer" }
]

return(

<div className="space-y-3">

{steps.map((s,i)=>( <AutomationStep key={i} step={s}/>
))}

</div>

)

}
