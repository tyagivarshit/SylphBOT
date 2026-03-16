"use client"

import TrainingCard from "./TrainingCard"

export default function KnowledgeBaseManager(){

const items = [
{
id:"1",
title:"Pricing Details"
},
{
id:"2",
title:"Refund Policy"
}
]

return(

<div className="space-y-4">

<button className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm">
Add Knowledge
</button>

<div className="grid md:grid-cols-2 gap-4">

{items.map((item)=>( <TrainingCard key={item.id} item={item}/>
))}

</div>

</div>

)

}
