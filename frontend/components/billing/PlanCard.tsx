"use client"

const plans = [

{
name:"BASIC",
price:"₹999",
period:"/month",
features:[
"AI replies to WhatsApp messages",
"AI replies to Instagram DMs",
"AI replies to Instagram comments",
"Basic automation"
],
popular:false
},

{
name:"PRO",
price:"₹1999",
period:"/month",
features:[
"Everything in Basic",
"Lead capture system",
"Leads dashboard",
"Lead stage tracking",
"Conversation history"
],
popular:true
},

{
name:"ELITE",
price:"₹3999",
period:"/month",
features:[
"Everything in Pro",
"Meeting booking automation",
"Calendar scheduling",
"Follow-up automation",
"Advanced AI workflows"
],
popular:false
}

]

export default function PlanCard(){

return(

<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">

{plans.map((plan)=>{

return(

<div
key={plan.name}
className={`relative bg-white rounded-xl p-6 shadow-sm transition hover:shadow-lg

${plan.popular
? "border-2 border-blue-600 scale-[1.02]"
: "border border-gray-200"
}
`}

>

{plan.popular && (

<span className="absolute -top-3 left-6 bg-blue-600 text-white text-xs font-semibold px-3 py-1 rounded-full">
BEST VALUE
</span>

)}

<div className="space-y-3">

<h3 className="text-lg font-semibold text-gray-900">
{plan.name}
</h3>

<div className="flex items-end gap-1">

<span className="text-3xl font-bold text-gray-900">
{plan.price}
</span>

<span className="text-sm text-gray-500">
{plan.period}
</span>

</div>

</div>

<ul className="mt-6 space-y-2 text-sm text-gray-600">

{plan.features.map((f,index)=>(

<li key={index} className="flex gap-2">
<span className="text-green-600">✔</span>
{f}
</li>

))}

</ul>

<button
className={`w-full mt-6 text-sm font-medium py-2 rounded-lg transition

${plan.popular
? "bg-blue-600 hover:bg-blue-700 text-white"
: "bg-gray-100 hover:bg-gray-200 text-gray-900"
}
`}

>

Choose {plan.name}

</button>

</div>

)

})}

</div>

)

}
