"use client"

const plans = [

{
name:"RESPONDER",
price:"₹999 / month",
features:[
"AI replies to WhatsApp messages",
"AI replies to Instagram DMs",
"AI replies to Instagram comments",
"Basic automation"
],
popular:false
},

{
name:"LEADS",
price:"₹1999 / month",
features:[
"Everything in Responder",
"Lead capture system",
"Leads dashboard",
"Lead stage tracking",
"Conversation history"
],
popular:true
},

{
name:"AUTOMATION",
price:"₹3999 / month",
features:[
"Everything in Leads",
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
className={`bg-white rounded-xl p-5 sm:p-6 shadow-sm space-y-5 transition hover:shadow-md

${plan.popular
? "border-2 border-blue-600 shadow-md"
: "border border-gray-200"
}
`}
>

{/* HEADER */}

<div className="flex items-center justify-between">

<div>

<h3 className="text-base sm:text-lg font-semibold text-gray-900">
{plan.name}
</h3>

<p className="text-sm text-gray-500 mt-1">
{plan.price}
</p>

</div>

{plan.popular && (

<span className="bg-blue-100 text-blue-700 text-xs font-semibold px-3 py-1 rounded-full">
POPULAR
</span>

)}

</div>


{/* FEATURES */}

<ul className="text-sm text-gray-600 space-y-2">

{plan.features.map((f,index)=>(

<li key={index}>
✔ {f}
</li>

))}

</ul>


{/* ACTION */}

<button className="w-full bg-blue-600 hover:bg-blue-700 transition text-white text-sm font-medium px-4 py-2 rounded-lg">
Choose Plan
</button>

</div>

)

})}

</div>

)

}