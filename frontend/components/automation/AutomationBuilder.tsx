"use client"

import { useState } from "react"
import AutomationStep from "./AutomationStep"

export default function AutomationBuilder(){

const [steps,setSteps] = useState<any[]>([
{ id:1, type:"TRIGGER", label:"Instagram DM Received" },
{ id:2, type:"MESSAGE", label:"Send Welcome Message" }
])

/* ---------------- ADD STEP ---------------- */

const addStep = (type:string) => {

  const newStep = {
    id: Date.now(),
    type,
    label:
      type === "MESSAGE"
        ? "Send Message"
        : type === "DELAY"
        ? "Wait"
        : "Condition"
  }

  setSteps(prev => [...prev, newStep])
}

/* ---------------- DELETE STEP ---------------- */

const removeStep = (id:number) => {
  setSteps(prev => prev.filter(s => s.id !== id))
}

/* ---------------- MOVE STEP ---------------- */

const moveStep = (index:number, direction:"up"|"down") => {

  const newSteps = [...steps]

  const targetIndex =
    direction === "up" ? index - 1 : index + 1

  if(targetIndex < 0 || targetIndex >= steps.length) return

  ;[newSteps[index], newSteps[targetIndex]] =
  [newSteps[targetIndex], newSteps[index]]

  setSteps(newSteps)

}

/* ---------------- UI ---------------- */

return(

<div className="space-y-5">

{/* STEPS */}

<div className="space-y-3">

{steps.map((step,i)=>(

  <AutomationStep
    key={step.id}
    step={step}
    onDelete={()=>removeStep(step.id)}
    onMoveUp={()=>moveStep(i,"up")}
    onMoveDown={()=>moveStep(i,"down")}
  />

))}

</div>

{/* ADD BUTTONS */}

<div className="flex gap-2 pt-3">

<button
onClick={()=>addStep("MESSAGE")}
className="text-xs bg-indigo-100 text-indigo-700 px-3 py-1.5 rounded-xl hover:bg-indigo-200 transition"
>
+ Message
</button>

<button
onClick={()=>addStep("DELAY")}
className="text-xs bg-yellow-100 text-yellow-700 px-3 py-1.5 rounded-xl hover:bg-yellow-200 transition"
>
+ Delay
</button>

<button
onClick={()=>addStep("CONDITION")}
className="text-xs bg-purple-100 text-purple-700 px-3 py-1.5 rounded-xl hover:bg-purple-200 transition"
>
+ Condition
</button>

</div>

</div>

)
}